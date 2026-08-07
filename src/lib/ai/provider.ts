import "server-only";

import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Insight, PeriodFacts } from "./facts";

/**
 * The model's entire job.
 *
 * It receives insights that have already been derived from arithmetic and is
 * asked only to phrase them. It cannot add findings, and any number it emits is
 * discarded - the UI renders evidence from the facts, never from the completion.
 * ADR-011, DF-AIA-002.
 */
const narrativeSchema = z.object({
  summary: z.string().min(1).max(1200),
  recommendations: z.array(z.string().min(1).max(300)).max(5),
});

export type Narrative = z.infer<typeof narrativeSchema>;

export interface NarrativeResult {
  narrative: Narrative;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT = `You write short reflective summaries of a person's own time records for DayFlow AI.

Absolute rules:
- Use ONLY the findings and figures given to you. Never introduce a statistic, a category, or a claim that is not in the input.
- Never speculate about causes, mood, health, or motivation. You can see hours, not reasons.
- Never moralise. Time spent on entertainment is not a failing. Long hours are not a virtue.
- Never congratulate or scold. Describe.
- If the findings are thin, say less. A short honest paragraph is correct; padding is not.
- Address the reader as "you". Plain language, no jargon, no headings, no bullet lists in the summary.
- Recommendations must each follow directly from one of the given findings, and must be small and concrete.

Return strict JSON: {"summary": string, "recommendations": string[]}.`;

function buildUserPrompt(
  facts: PeriodFacts,
  insights: Insight[],
  periodType: string,
): string {
  // Only the aggregates and the derived findings are sent. Notes never leave the
  // database, and neither does anything that identifies the user. DF-PRV-020.
  const payload = {
    periodType,
    period: facts.period,
    totals: facts.totals,
    topGroups: facts.byParentCategory.slice(0, 8),
    comparison: facts.comparison,
    findings: insights.map((insight) => ({
      kind: insight.kind,
      title: insight.title,
      detail: insight.detail,
      evidence: insight.evidence,
    })),
  };

  return `Write the ${periodType} summary from these findings.\n\n${JSON.stringify(payload, null, 2)}`;
}

async function callOpenAi(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<NarrativeResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      // Low but not zero. Identical wording every week reads as a form letter.
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
    // A report is not worth blocking a request on indefinitely. The
    // deterministic report is already available as a fallback.
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}`);
  }

  const body = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = body.choices[0]?.message.content;
  if (!content) throw new Error("OpenAI returned no content");

  return {
    narrative: narrativeSchema.parse(JSON.parse(content)),
    model,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<NarrativeResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: prompt },
        // Prefilling the opening brace is the reliable way to get JSON out of
        // this API without a schema parameter.
        { role: "assistant", content: "{" },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    throw new Error(`Anthropic returned ${response.status}`);
  }

  const body = (await response.json()) as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const text = body.content.find((part) => part.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no content");

  return {
    narrative: narrativeSchema.parse(JSON.parse(`{${text}`)),
    model,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}

/**
 * Generates the narrative, or returns null.
 *
 * Null is a normal outcome - AI disabled, key missing, configuration missing
 * altogether, provider down, model returning something that fails validation -
 * and every caller handles it by falling back to the deterministic report.
 * There is no path where an AI failure denies the user their own statistics.
 */
export async function generateNarrative(
  facts: PeriodFacts,
  insights: Insight[],
  periodType: string,
): Promise<NarrativeResult | null> {
  let env: ReturnType<typeof serverEnv>;

  try {
    env = serverEnv();
  } catch (cause) {
    // The one AI failure that used to escape this function, and the reason the
    // guarantee above was not true.
    //
    // `serverEnv` validates lazily, so a deployment missing SUPABASE_SERVICE_
    // ROLE_KEY or CRON_SECRET - or carrying AI_ENABLED=true with no key for the
    // selected provider - builds and deploys cleanly and then throws here, at
    // first use. Thrown, it propagated through buildReport to the route and
    // became a 500, denying the user the deterministic report they were
    // entitled to whether or not a model was ever going to be involved.
    // DF-AIA-030.
    logger.warn("AI narrative skipped: server configuration is unusable", {
      event: "ai.config_unavailable",
      periodType,
      error: cause,
    });
    return null;
  }

  if (!env.AI_ENABLED) return null;

  const apiKey =
    env.AI_PROVIDER === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = buildUserPrompt(facts, insights, periodType);

  try {
    return env.AI_PROVIDER === "openai"
      ? await callOpenAi(apiKey, env.AI_MODEL, prompt)
      : await callAnthropic(apiKey, env.AI_MODEL, prompt);
  } catch {
    return null;
  }
}

/**
 * Rough cost estimate in USD, recorded per call.
 *
 * Approximate by design: the point is to make spend visible and per-user quotas
 * possible, not to reconcile an invoice. DF-AIA-040.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 2.5, output: 10 },
    "claude-3-5-haiku-latest": { input: 0.8, output: 4 },
    "claude-3-5-sonnet-latest": { input: 3, output: 15 },
  };

  const rate = rates[model] ?? { input: 1, output: 3 };
  return (
    (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output
  );
}
