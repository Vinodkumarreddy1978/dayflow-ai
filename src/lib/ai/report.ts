import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { addDays } from "@/lib/domain/timezone";
import { periodFactsSchema, type PeriodFacts, type ReportContent } from "./facts";
import {
  deriveInsights,
  deterministicRecommendations,
  deterministicSummary,
} from "./insights";
import { estimateCost, generateNarrative } from "./provider";

export type PeriodType = "daily" | "weekly" | "monthly";

/** Inclusive end date of a period that starts on the given date. */
export function periodEnd(periodType: PeriodType, periodStart: string): string {
  if (periodType === "daily") return periodStart;
  if (periodType === "weekly") return addDays(periodStart, 6);

  const [year, month] = periodStart.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
  return `${periodStart.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

export interface GeneratedReport {
  content: ReportContent;
  facts: PeriodFacts;
  generatedBy: "ai" | "deterministic";
  model: string | null;
}

/**
 * Builds a report for one period.
 *
 * The order is deliberate and is the whole architecture in four steps: get the
 * numbers from SQL, derive the findings from the numbers, optionally ask a model
 * to phrase the findings, and keep the numbers regardless of what the model did.
 * ADR-011.
 */
export async function buildReport(
  supabase: SupabaseClient<Database>,
  periodType: PeriodType,
  periodStart: string,
  aiConsented: boolean,
  /**
   * Set only by the scheduled job, which runs as service_role where auth.uid()
   * is null. Omitting it uses the caller's own session, which is what every
   * user-initiated path must do.
   */
  onBehalfOfUserId?: string,
): Promise<GeneratedReport> {
  const end = periodEnd(periodType, periodStart);

  const { data, error } = onBehalfOfUserId
    ? await supabase.rpc("get_period_facts_for_user", {
        p_user_id: onBehalfOfUserId,
        p_start: periodStart,
        p_end: end,
      })
    : await supabase.rpc("get_period_facts", {
        p_start: periodStart,
        p_end: end,
      });

  if (error) throw error;

  const facts = periodFactsSchema.parse(data);
  const insights = deriveInsights(facts);

  // Consent is checked here rather than at the route, so every caller - the API,
  // the cron job, a future backfill - is subject to it by construction.
  // DF-PRV-021.
  const narrativeResult = aiConsented
    ? await generateNarrative(facts, insights, periodType)
    : null;

  if (narrativeResult) {
    return {
      content: {
        summary: narrativeResult.narrative.summary,
        insights,
        recommendations: narrativeResult.narrative.recommendations,
      },
      facts,
      generatedBy: "ai",
      model: narrativeResult.model,
    };
  }

  return {
    content: {
      summary: deterministicSummary(facts, insights),
      insights,
      recommendations: deterministicRecommendations(insights),
    },
    facts,
    generatedBy: "deterministic",
    model: null,
  };
}

/**
 * Persists a report, replacing any earlier one for the same period.
 *
 * Regenerating a period must not accumulate rows - the unique constraint on
 * (user_id, period_type, period_start) makes that impossible, and the upsert
 * makes regeneration a supported action rather than an error.
 */
export async function saveReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  periodType: PeriodType,
  periodStart: string,
  report: GeneratedReport,
) {
  const { error } = await supabase.from("ai_reports").upsert(
    {
      user_id: userId,
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd(periodType, periodStart),
      facts: report.facts as unknown as Json,
      content: report.content as unknown as Json,
      model: report.model,
      generated_by: report.generatedBy,
    },
    { onConflict: "user_id,period_type,period_start" },
  );

  if (error) throw error;
}

/**
 * Records what a model call cost.
 *
 * Written on failure too, with succeeded = false. A provider that fails after
 * consuming input tokens still bills for them, and usage records that only show
 * successes make spend look lower than it is.
 */
export async function recordUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  succeeded: boolean,
) {
  await supabase.from("ai_usage").insert({
    user_id: userId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost: estimateCost(model, inputTokens, outputTokens),
    succeeded,
  });
}
