import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildReminderMessage,
  isReminderDue,
  shouldWarnLongActivity,
} from "@/lib/domain/reminder-rules";
import { elapsedMinutes } from "@/lib/domain/moment-rules";
import {
  isAuthorisedCronRequest,
  sendToAllDevices,
  type SendResult,
  type StoredSubscription,
} from "@/lib/push/send";
import { MIN_REMINDER_INTERVAL_MINUTES } from "@/lib/domain/reminder-rules";
import { logCronRun, logCronUnauthorised, logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";

type MomentUpdate = Database["public"]["Tables"]["moments"]["Update"];

/**
 * Reminder sweep. Invoked every ten minutes by pg_cron (see migration 0011).
 *
 * The job is idempotent: whether a Moment is due is derived from
 * `last_reminder_at` on the row itself, so a duplicate invocation - a retry, an
 * overlapping schedule, a manual trigger during debugging - sends nothing extra.
 * DF-REM-010.
 *
 * Every exit from here logs, including the ones that did nothing, because the
 * failure this job actually has is silence: reminders stop, no request errors,
 * and nobody notices for a fortnight. `processed` counts pending Moments scanned;
 * `sent`, `skipped` and `failed` count notifications, where a skip is a
 * notification there was no registered device to receive. DF-OBS-004.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request.headers.get("authorization"))) {
    logCronUnauthorised("reminders");
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const supabase = createAdminClient();

  // Nothing can be due before the minimum interval has passed, so the scan
  // excludes brand new Moments in the query rather than fetching and discarding
  // them. On a busy instance that is most of the pending rows.
  const cutoff = new Date(now.getTime() - MIN_REMINDER_INTERVAL_MINUTES * 60_000);

  const { data: pending, error: pendingError } = await supabase
    .from("moments")
    .select("id, user_id, category_id, start_at, last_reminder_at, warned_at")
    .eq("status", "pending")
    .lt("start_at", cutoff.toISOString());

  if (pendingError) {
    logger.error("Reminder scan failed", {
      event: "cron.error",
      job: "reminders",
      stage: "scan-pending",
      cutoff: cutoff.toISOString(),
      error: pendingError,
    });
    return NextResponse.json({ error: "Scan failed." }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    logCronRun(
      "reminders",
      { processed: 0, sent: 0, skipped: 0, failed: 0 },
      { users: 0, durationMs: Date.now() - startedAt },
    );
    return NextResponse.json({ ok: true, users: 0, sent: 0, warned: 0 });
  }

  const userIds = [...new Set(pending.map((moment) => moment.user_id))];

  const [settingsResult, categoriesResult, subscriptionsResult] = await Promise.all([
    supabase.from("settings").select("*").in("user_id", userIds),
    supabase
      .from("categories")
      .select("id, name")
      .in("id", [...new Set(pending.map((moment) => moment.category_id))]),
    supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds),
  ]);

  const settingsByUser = new Map(
    (settingsResult.data ?? []).map((row) => [row.user_id, row]),
  );
  const categoryNames = new Map(
    (categoriesResult.data ?? []).map((row) => [row.id, row.name]),
  );

  const subscriptionsByUser = new Map<string, StoredSubscription[]>();
  for (const row of subscriptionsResult.data ?? []) {
    const list = subscriptionsByUser.get(row.user_id) ?? [];
    list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    subscriptionsByUser.set(row.user_id, list);
  }

  const remindedIds: string[] = [];
  const warnedIds: string[] = [];
  const expiredSubscriptionIds: string[] = [];
  let notificationsSent = 0;
  let notificationsSkipped = 0;
  let notificationsFailed = 0;

  /**
   * Records what became of one batch of sends.
   *
   * `failed` and `skipped` were previously discarded, which meant a deployment
   * with no VAPID keys - every send skipped - produced a run indistinguishable
   * from a quiet one. DF-OBS-004.
   */
  function tally(results: SendResult[]): void {
    for (const result of results) {
      if (result.status === "sent") notificationsSent += 1;
      else if (result.status === "skipped") notificationsSkipped += 1;
      else if (result.status === "failed") notificationsFailed += 1;
      else expiredSubscriptionIds.push(result.subscriptionId);
    }
  }

  for (const userId of userIds) {
    const settings = settingsByUser.get(userId);
    if (!settings) continue;

    const quiet = {
      enabled: settings.quiet_hours_enabled,
      start: settings.quiet_hours_start,
      end: settings.quiet_hours_end,
      timeZone: settings.timezone,
    };

    const userMoments = pending.filter((moment) => moment.user_id === userId);

    const due = userMoments.filter((moment) =>
      isReminderDue({
        startAt: new Date(moment.start_at),
        lastReminderAt: moment.last_reminder_at
          ? new Date(moment.last_reminder_at)
          : null,
        intervalMinutes: settings.reminder_interval_minutes,
        remindersEnabled: settings.reminders_enabled && settings.notify_queue_reminders,
        quiet,
        now,
      }),
    );

    const toWarn = userMoments.filter(
      (moment) =>
        settings.notify_long_activity &&
        shouldWarnLongActivity({
          startAt: new Date(moment.start_at),
          warnedAt: moment.warned_at ? new Date(moment.warned_at) : null,
          warningMinutes: settings.long_activity_warning_minutes,
          now,
        }),
    );

    const subscriptions = subscriptionsByUser.get(userId) ?? [];

    // A long-activity warning is its own notification with its own tag, because
    // "this has been running four hours, is that right?" is a different question
    // from "you have something open" and collapsing them loses the urgent one.
    if (toWarn.length > 0 && subscriptions.length > 0) {
      const longest = toWarn.reduce((worst, moment) =>
        moment.start_at < worst.start_at ? moment : worst,
      );

      const results = await sendToAllDevices(subscriptions, {
        title: "Still running?",
        body: `${categoryNames.get(longest.category_id) ?? "An activity"} has been open ${Math.floor(elapsedMinutes(new Date(longest.start_at), now) / 60)}h. Close it if you have moved on.`,
        tag: `warn-${longest.id}`,
        url: "/dashboard",
        actions: [{ action: "close-moment", title: "Close it now" }],
        data: { momentId: longest.id },
      });

      tally(results);
    } else if (toWarn.length > 0) {
      notificationsSkipped += 1;
    }

    // Warned Moments are recorded even when there was no device to notify.
    // Otherwise a user with notifications off accumulates a warning that fires
    // the instant they ever enable them, about something from last Tuesday.
    warnedIds.push(...toWarn.map((moment) => moment.id));

    if (due.length > 0) {
      if (subscriptions.length > 0) {
        const message = buildReminderMessage(
          due.map((moment) => ({
            categoryName: categoryNames.get(moment.category_id) ?? "An activity",
            startAt: new Date(moment.start_at),
          })),
          now,
        );

        const results = await sendToAllDevices(subscriptions, {
          ...message,
          tag: "queue-reminder",
          url: "/dashboard",
          actions:
            due.length === 1
              ? [{ action: "close-moment", title: "Close it now" }]
              : undefined,
          data: due.length === 1 ? { momentId: due[0]!.id } : undefined,
        });

        tally(results);
      } else {
        notificationsSkipped += 1;
      }

      remindedIds.push(...due.map((moment) => moment.id));
    }
  }

  const timestamp = now.toISOString();
  const remindedPatch: MomentUpdate = { last_reminder_at: timestamp };
  const warnedPatch: MomentUpdate = { warned_at: timestamp };

  const writes: unknown[] = await Promise.all([
    remindedIds.length > 0
      ? supabase.from("moments").update(remindedPatch).in("id", remindedIds)
      : Promise.resolve(),
    warnedIds.length > 0
      ? supabase.from("moments").update(warnedPatch).in("id", warnedIds)
      : Promise.resolve(),
    // Endpoints the push service has rejected as gone. Left in place they would
    // be retried on every sweep for the life of the account.
    expiredSubscriptionIds.length > 0
      ? supabase.from("push_subscriptions").delete().in("id", expiredSubscriptionIds)
      : Promise.resolve(),
  ]);

  // These three writes decide whether the sweep is idempotent. A failed
  // `last_reminder_at` update means every user due a reminder is sent another one
  // in ten minutes, and again, with the endpoint still answering 200 - so the
  // outcome is logged rather than discarded. DF-OBS-005.
  const stages = ["mark-reminded", "mark-warned", "prune-subscriptions"] as const;

  writes.forEach((result, index) => {
    const error =
      result && typeof result === "object" && "error" in result ? result.error : null;

    if (!error) return;

    logger.error("Reminder sweep write failed", {
      event: "cron.error",
      job: "reminders",
      stage: stages[index],
      error,
    });
  });

  logCronRun(
    "reminders",
    {
      processed: pending.length,
      sent: notificationsSent,
      skipped: notificationsSkipped,
      failed: notificationsFailed,
    },
    {
      users: userIds.length,
      reminded: remindedIds.length,
      warned: warnedIds.length,
      subscriptionsPruned: expiredSubscriptionIds.length,
      durationMs: Date.now() - startedAt,
    },
  );

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    reminded: remindedIds.length,
    warned: warnedIds.length,
    notificationsSent,
    subscriptionsPruned: expiredSubscriptionIds.length,
  });
}

/** pg_net sends POST; a GET is allowed so the job can be verified from a browser. */
export async function GET(request: Request) {
  return POST(request);
}
