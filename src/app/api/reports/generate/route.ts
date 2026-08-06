import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReportSchema } from "@/lib/schemas";
import { buildReport, saveReport, type PeriodType } from "@/lib/ai/report";
import { logger } from "@/lib/logger";

/** Per user, per day. Enough to regenerate a few times; not enough to be abused. */
const DAILY_GENERATION_LIMIT = 20;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const parsed = generateReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a periodType and a periodStart date." },
      { status: 400 },
    );
  }

  const { periodType, periodStart } = parsed.data;

  const { data: settings } = await supabase
    .from("settings")
    .select("ai_consent")
    .single();

  // Counted rather than throttled by timestamp: a user regenerating a report
  // three times in a minute to see a different phrasing is legitimate, while a
  // hundred calls in an hour is not.
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  if ((count ?? 0) >= DAILY_GENERATION_LIMIT) {
    return NextResponse.json(
      {
        error:
          "You have reached today's report limit. Your existing reports are unaffected.",
      },
      { status: 429 },
    );
  }

  // Which half failed matters more than that something did: building the report
  // reads the user's own aggregates, saving it writes a row, and the two fail
  // for entirely unrelated reasons. Without this, the row level security refusal
  // that broke every generation on the live deployment was indistinguishable in
  // the logs from a provider outage. Named to match the cron handler's stages.
  let stage: "build-report" | "save-report" = "build-report";

  try {
    const report = await buildReport(
      supabase,
      periodType as PeriodType,
      periodStart,
      settings?.ai_consent ?? false,
    );

    stage = "save-report";
    await saveReport(supabase, user.id, periodType as PeriodType, periodStart, report);

    return NextResponse.json({
      ok: true,
      generatedBy: report.generatedBy,
      content: report.content,
    });
  } catch (cause) {
    // The user is told the generation failed and that nothing was changed, which
    // is all they can act on. The reason is a server concern and goes to the
    // function logs, with the period and the user but none of their content -
    // enough to reproduce the call, per DF-OBS-005.
    logger.error("Report generation failed", {
      event: "report.error",
      route: "/api/reports/generate",
      stage,
      userId: user.id,
      periodType,
      periodStart,
      aiConsent: settings?.ai_consent ?? false,
      error: cause,
    });

    return NextResponse.json(
      { error: "The report could not be generated. Your data is unchanged." },
      { status: 500 },
    );
  }
}
