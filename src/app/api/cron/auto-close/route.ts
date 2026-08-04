import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoCloseEndTime, shouldAutoClose } from "@/lib/domain/reminder-rules";
import type { Database } from "@/lib/supabase/database.types";
import {
  isAuthorisedCronRequest,
  sendToAllDevices,
  type StoredSubscription,
} from "@/lib/push/send";
import { logCronRun, logCronUnauthorised, logger } from "@/lib/logger";

/**
 * Auto-close sweep. Invoked every fifteen minutes by pg_cron (see migration 0011).
 *
 * Closes pending Moments that have exceeded the user's threshold, writing an
 * estimated end time and the `auto_closed` status - never `completed`. The
 * distinction matters: analytics can exclude estimated time, and a user
 * reviewing their week can tell which figures they entered and which the app
 * assumed on their behalf. DF-REM-050.
 *
 * Counts logged per DF-OBS-004: `processed` is pending Moments scanned, `skipped`
 * is those not yet eligible to close, `failed` is close writes that were refused,
 * and `sent` is notifications the push service accepted.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request.headers.get("authorization"))) {
    logCronUnauthorised("auto-close");
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const supabase = createAdminClient();

  // 120 minutes is the smallest auto_close_minutes the settings constraint
  // allows, so nothing younger than that can possibly qualify.
  const cutoff = new Date(now.getTime() - 120 * 60_000);

  const { data: pending, error } = await supabase
    .from("moments")
    .select("id, user_id, category_id, start_at")
    .eq("status", "pending")
    .lt("start_at", cutoff.toISOString());

  if (error) {
    logger.error("Auto-close scan failed", {
      event: "cron.error",
      job: "auto-close",
      stage: "scan-pending",
      cutoff: cutoff.toISOString(),
      error,
    });
    return NextResponse.json({ error: "Scan failed." }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    logCronRun(
      "auto-close",
      { processed: 0, sent: 0, skipped: 0, failed: 0 },
      { closed: 0, users: 0, durationMs: Date.now() - startedAt },
    );
    return NextResponse.json({ ok: true, closed: 0 });
  }

  const userIds = [...new Set(pending.map((moment) => moment.user_id))];

  const [settingsResult, categoriesResult, subscriptionsResult] = await Promise.all([
    supabase
      .from("settings")
      .select("user_id, auto_close_enabled, auto_close_minutes, notify_auto_close")
      .in("user_id", userIds),
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

  const closedByUser = new Map<string, { id: string; categoryName: string }[]>();
  const expiredSubscriptionIds: string[] = [];
  let notificationsSent = 0;
  let skipped = 0;
  let failed = 0;

  for (const moment of pending) {
    const settings = settingsByUser.get(moment.user_id);
    if (!settings) {
      skipped += 1;
      continue;
    }

    const startAt = new Date(moment.start_at);

    if (
      !shouldAutoClose({
        startAt,
        autoCloseEnabled: settings.auto_close_enabled,
        autoCloseMinutes: settings.auto_close_minutes,
        now,
      })
    ) {
      skipped += 1;
      continue;
    }

    // `status` is deliberately absent: the sync_moment_status trigger derives
    // auto_closed from source = 'auto_close', so no caller - not even this
    // service-role job - can write a status that disagrees with the timestamps.
    const patch: Database["public"]["Tables"]["moments"]["Update"] = {
      end_at: autoCloseEndTime(startAt, settings.auto_close_minutes).toISOString(),
      source: "auto_close",
    };

    // Updated one row at a time rather than in a batch, because the end time is
    // derived from each Moment's own start. Volume here is inherently low: these
    // are forgotten entries, not normal traffic.
    const { error: updateError } = await supabase
      .from("moments")
      .update(patch)
      .eq("id", moment.id)
      // Guards against closing a Moment the user finished themselves in the
      // seconds between the scan and this write.
      .eq("status", "pending");

    if (updateError) {
      // Not necessarily a defect: the `status = 'pending'` guard above means a
      // Moment the user closed themselves in the last few seconds lands here.
      // Logged at warning level with the identifiers needed to tell the two
      // apart, and never the category name. DF-OBS-003, DF-OBS-005.
      failed += 1;
      logger.warn("Auto-close write refused", {
        event: "cron.error",
        job: "auto-close",
        stage: "close-moment",
        momentId: moment.id,
        userId: moment.user_id,
        error: updateError,
      });
      continue;
    }

    const list = closedByUser.get(moment.user_id) ?? [];
    list.push({
      id: moment.id,
      categoryName: categoryNames.get(moment.category_id) ?? "An activity",
    });
    closedByUser.set(moment.user_id, list);
  }

  for (const [userId, closed] of closedByUser) {
    const settings = settingsByUser.get(userId);
    const subscriptions = subscriptionsByUser.get(userId) ?? [];

    if (!settings?.notify_auto_close || subscriptions.length === 0) continue;

    const hours = Math.floor(settings.auto_close_minutes / 60);

    const results = await sendToAllDevices(subscriptions, {
      title:
        closed.length === 1
          ? "Closed an open activity"
          : `Closed ${closed.length} activities`,
      // Says what was assumed and where to correct it. An estimate the user
      // cannot find is indistinguishable from bad data.
      body:
        closed.length === 1
          ? `${closed[0]!.categoryName} was open past ${hours}h, so it was recorded as ${hours}h. Edit it if that is wrong.`
          : `They were open past ${hours}h and recorded as estimates. Review them on your timeline.`,
      tag: "auto-close",
      url: "/dashboard",
    });

    notificationsSent += results.filter((r) => r.status === "sent").length;
    expiredSubscriptionIds.push(
      ...results.filter((r) => r.status === "expired").map((r) => r.subscriptionId),
    );
  }

  if (expiredSubscriptionIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expiredSubscriptionIds);
  }

  const closed = [...closedByUser.values()].reduce((sum, list) => sum + list.length, 0);

  logCronRun(
    "auto-close",
    { processed: pending.length, sent: notificationsSent, skipped, failed },
    {
      closed,
      users: closedByUser.size,
      subscriptionsPruned: expiredSubscriptionIds.length,
      durationMs: Date.now() - startedAt,
    },
  );

  return NextResponse.json({
    ok: true,
    closed,
    users: closedByUser.size,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
