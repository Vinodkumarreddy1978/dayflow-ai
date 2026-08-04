import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorisedCronRequest, sendToAllDevices } from "@/lib/push/send";
import { buildReport, saveReport } from "@/lib/ai/report";
import { addDays, todayInTimeZone } from "@/lib/domain/timezone";
import { logCronRun, logCronUnauthorised, logger } from "@/lib/logger";

/**
 * Daily and weekly report generation. Invoked once a day by Vercel Cron.
 *
 * One job serves every timezone. It generates a report for whichever period has
 * just finished *in the user's own timezone* - so a user in Auckland is never
 * handed a summary of a day that is still in progress, and a user in Los Angeles
 * is not skipped because UTC has already moved on. ADR-008.
 *
 * Counts logged per DF-OBS-004: `processed` is report jobs attempted, `skipped`
 * is periods with nothing recorded in them, `failed` is jobs that threw, and
 * `sent` is notifications the push service accepted.
 */
export async function POST(request: Request) {
  if (!isAuthorisedCronRequest(request.headers.get("authorization"))) {
    logCronUnauthorised("daily-report");
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  const { data: candidates, error } = await supabase
    .from("settings")
    .select(
      "user_id, timezone, week_starts_on, ai_consent, ai_daily_reports, ai_weekly_reports, notify_daily_review, notify_weekly_review",
    )
    .or("ai_daily_reports.eq.true,ai_weekly_reports.eq.true");

  if (error) {
    logger.error("Report candidate scan failed", {
      event: "cron.error",
      job: "daily-report",
      stage: "read-settings",
      error,
    });
    return NextResponse.json({ error: "Could not read settings." }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    logCronRun(
      "daily-report",
      { processed: 0, sent: 0, skipped: 0, failed: 0 },
      { considered: 0, generated: 0, durationMs: Date.now() - startedAt },
    );
    return NextResponse.json({ ok: true, generated: 0 });
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in(
      "user_id",
      candidates.map((row) => row.user_id),
    );

  let generated = 0;
  let failed = 0;
  let attempted = 0;
  let skipped = 0;
  let notificationsSent = 0;

  for (const row of candidates) {
    const today = todayInTimeZone(row.timezone);
    const yesterday = addDays(today, -1);

    // Weekly reports run only on the day after the user's own week boundary, so
    // a Monday-start user gets theirs on Monday about last week - not on
    // whichever day the deployment happened to be configured for.
    const yesterdayWeekday = new Date(`${yesterday}T12:00:00Z`).getUTCDay();
    const weekJustEnded = (yesterdayWeekday + 1) % 7 === row.week_starts_on;

    const jobs: { periodType: "daily" | "weekly"; periodStart: string }[] = [];

    if (row.ai_daily_reports) {
      jobs.push({ periodType: "daily", periodStart: yesterday });
    }
    if (row.ai_weekly_reports && weekJustEnded) {
      jobs.push({ periodType: "weekly", periodStart: addDays(yesterday, -6) });
    }

    for (const job of jobs) {
      attempted += 1;

      try {
        const report = await buildReport(
          supabase,
          job.periodType,
          job.periodStart,
          row.ai_consent,
          row.user_id,
        );

        // A period with nothing in it produces no report. Delivering "you
        // recorded nothing yesterday" every morning to someone who tracks on
        // weekdays only is how a useful feature becomes an unsubscribe.
        if (report.facts.totals.recordedMinutes === 0) {
          skipped += 1;
          continue;
        }

        await saveReport(supabase, row.user_id, job.periodType, job.periodStart, report);
        generated += 1;

        const wantsNotice =
          job.periodType === "daily" ? row.notify_daily_review : row.notify_weekly_review;

        const devices = (subscriptions ?? [])
          .filter((subscription) => subscription.user_id === row.user_id)
          .map((subscription) => ({
            id: subscription.id,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          }));

        if (wantsNotice && devices.length > 0) {
          const results = await sendToAllDevices(devices, {
            title:
              job.periodType === "daily" ? "Your day in review" : "Your week in review",
            body: report.content.insights[0]?.title ?? "Tap to read it.",
            tag: `report-${job.periodType}`,
            url: "/insights",
          });

          notificationsSent += results.filter((r) => r.status === "sent").length;
        }
      } catch (cause) {
        // One user's report failing must not abandon everyone after them in the
        // loop. Reports are regenerable on demand from the Insights screen.
        //
        // Previously the count was returned in the response body and the error
        // itself was discarded, so a provider outage and a malformed row were the
        // same number. The identifiers here are what make the run reproducible -
        // the period and the user, never the Moments inside it. DF-OBS-005.
        failed += 1;
        logger.error("Scheduled report failed", {
          event: "cron.error",
          job: "daily-report",
          stage: "build-report",
          userId: row.user_id,
          periodType: job.periodType,
          periodStart: job.periodStart,
          aiConsent: row.ai_consent,
          error: cause,
        });
      }
    }
  }

  logCronRun(
    "daily-report",
    { processed: attempted, sent: notificationsSent, skipped, failed },
    {
      considered: candidates.length,
      generated,
      durationMs: Date.now() - startedAt,
    },
  );

  return NextResponse.json({
    ok: true,
    considered: candidates.length,
    generated,
    failed,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
