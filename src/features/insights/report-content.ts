import type { InsightKind, ReportContent } from "@/lib/ai/facts";

/**
 * A zod-free implementation of `reportContentSchema`, for the browser.
 *
 * `reportContentSchema` in src/lib/ai/facts.ts remains the definition of the
 * contract. Importing it as a runtime value, however, pulled zod into the
 * /insights client bundle - an 18 kB gzipped chunk loaded by that one route,
 * which took its First Load JS to 217 kB against a 200 kB budget. Every other
 * client-side reference to a schema in this codebase is an `import type` and
 * compiles away; this one was the exception, and it was the whole overage.
 *
 * Stating the rules twice is genuine duplication, accepted on the same terms as
 * the SQL/TypeScript duplication in ADR-004: the two copies exist for different
 * reasons, and a test asserts they agree. report-content.test.ts runs every
 * fixture through both this predicate and the schema and fails if they ever
 * disagree, so drift shows up as a red build rather than as a validation hole.
 *
 * The limits below are therefore not free-standing constants. They are a copy of
 * the schema's, and the schema is what to change first.
 */
const SUMMARY_MAX = 1200;
const TITLE_MAX = 120;
const DETAIL_MAX = 600;
const RECOMMENDATION_MAX = 300;
const RECOMMENDATION_COUNT_MAX = 5;

/**
 * Written as a record rather than an array so that TypeScript rejects this file
 * if `InsightKind` ever gains or loses a member. A missing kind here would be a
 * predicate that silently drops every report containing it.
 */
const INSIGHT_KINDS: Record<InsightKind, true> = {
  observation: true,
  habit: true,
  warning: true,
  recommendation: true,
  achievement: true,
};

/**
 * What `z.object` will look at all: `null` and arrays are refused before any
 * field is read, which is why neither is left to the field checks below.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `z.string()` - present, and a string. An empty string passes, as it does there. */
function isString(value: unknown): boolean {
  return typeof value === "string";
}

/** `z.string().min(1).max(max)`, measured in UTF-16 code units as zod measures it. */
function isBoundedString(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

function isInsightKind(value: unknown): boolean {
  // Indexed rather than `in`, which would accept "constructor" and friends off
  // the prototype chain.
  return typeof value === "string" && INSIGHT_KINDS[value as InsightKind] === true;
}

function isEvidence(value: unknown): boolean {
  return isObject(value) && isString(value.label) && isString(value.value);
}

function isInsight(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(value.id) &&
    isInsightKind(value.kind) &&
    isBoundedString(value.title, TITLE_MAX) &&
    isBoundedString(value.detail, DETAIL_MAX) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidence)
  );
}

/**
 * Whether a stored `content` column is a report this build can render.
 *
 * Reports are validated on read, not just on write: a row written by an older
 * version of the content schema must not crash the screen, and a model's output
 * must not reach the interface unchecked. Callers drop what fails.
 *
 * Unlike `reportContentSchema.safeParse`, this does not strip unknown keys - a
 * predicate cannot rewrite its argument. It accepts and rejects exactly what the
 * schema accepts and rejects; extra keys simply survive, unread.
 */
export function isReportContent(value: unknown): value is ReportContent {
  if (!isObject(value)) return false;

  const { summary, insights, recommendations } = value;

  return (
    isBoundedString(summary, SUMMARY_MAX) &&
    Array.isArray(insights) &&
    insights.every(isInsight) &&
    Array.isArray(recommendations) &&
    recommendations.length <= RECOMMENDATION_COUNT_MAX &&
    recommendations.every((item) => isBoundedString(item, RECOMMENDATION_MAX))
  );
}
