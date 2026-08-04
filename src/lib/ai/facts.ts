import { z } from "zod";

/**
 * The deterministic statistics a report is built from.
 *
 * This mirrors the JSON returned by get_period_facts (migration 0010). It is
 * validated rather than trusted, because it is the only input to both the
 * insight modules and the model prompt - a shape change in SQL that went
 * unnoticed here would produce confidently wrong narratives rather than an
 * error. ADR-011.
 */
export const periodFactsSchema = z.object({
  period: z.object({
    start: z.string(),
    end: z.string(),
    days: z.number(),
  }),
  totals: z.object({
    recordedMinutes: z.number(),
    distractedMinutes: z.number(),
    momentCount: z.number(),
    daysWithData: z.number(),
    averageMinutesPerDay: z.number(),
  }),
  byParentCategory: z.array(
    z.object({
      name: z.string(),
      isDistraction: z.boolean(),
      minutes: z.number(),
      momentCount: z.number(),
    }),
  ),
  byCategory: z.array(
    z.object({
      name: z.string(),
      parentName: z.string(),
      minutes: z.number(),
      momentCount: z.number(),
    }),
  ),
  byDay: z.array(
    z.object({
      date: z.string(),
      minutes: z.number(),
      distractedMinutes: z.number(),
    }),
  ),
  comparison: z.object({
    previousPeriodMinutes: z.number(),
  }),
  quality: z.object({
    autoClosedCount: z.number(),
  }),
});

export type PeriodFacts = z.infer<typeof periodFactsSchema>;

export type InsightKind =
  "observation" | "habit" | "warning" | "recommendation" | "achievement";

export interface Insight {
  /** Stable across runs, so the UI can key on it and dedupe. */
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** The numbers behind the claim, so nothing is asserted without support. */
  evidence: { label: string; value: string }[];
}

export const reportContentSchema = z.object({
  summary: z.string().min(1).max(1200),
  insights: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["observation", "habit", "warning", "recommendation", "achievement"]),
      title: z.string().min(1).max(120),
      detail: z.string().min(1).max(600),
      evidence: z.array(z.object({ label: z.string(), value: z.string() })),
    }),
  ),
  recommendations: z.array(z.string().min(1).max(300)).max(5),
});

export type ReportContent = z.infer<typeof reportContentSchema>;
