import { describe, expect, it } from "vitest";
import { reportContentSchema } from "@/lib/ai/facts";
import { isReportContent } from "./report-content";

/**
 * `isReportContent` exists only because `reportContentSchema` cannot be in the
 * client bundle - see the header of report-content.ts. That makes the schema and
 * the predicate two statements of one contract, and this file is what keeps them
 * from drifting apart: every fixture below is run through both, and a difference
 * in verdict fails the build.
 *
 * The fixtures are therefore written as data rather than as prose assertions, so
 * that adding a case tests both implementations at once and cannot test only the
 * one being changed.
 */
function insight(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "parent-share-work",
    kind: "observation",
    title: "Work took most of the week",
    detail: "Work accounted for 400 of the 600 minutes you recorded.",
    evidence: [{ label: "Work", value: "6h 40m" }],
    ...overrides,
  };
}

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: "You recorded 10 hours across five days.",
    insights: [insight()],
    recommendations: ["Close Moments as you finish them."],
    ...overrides,
  };
}

/** A valid report whose single insight has one field replaced. */
function withInsight(overrides: Record<string, unknown>): Record<string, unknown> {
  return content({ insights: [insight(overrides)] });
}

const KINDS = [
  "observation",
  "habit",
  "warning",
  "recommendation",
  "achievement",
] as const;

const ACCEPTED: [name: string, value: unknown][] = [
  ["a report with one insight", content()],
  ["no insights and no recommendations", content({ insights: [], recommendations: [] })],
  ["the maximum five recommendations", content({ recommendations: ["a", "b", "c", "d", "e"] })],
  ["a summary at the 1200 character limit", content({ summary: "s".repeat(1200) })],
  ["a title at the 120 character limit", withInsight({ title: "t".repeat(120) })],
  ["a detail at the 600 character limit", withInsight({ detail: "d".repeat(600) })],
  [
    "a recommendation at the 300 character limit",
    content({ recommendations: ["r".repeat(300)] }),
  ],
  // The schema bounds every string except the insight id, which is generated in
  // code rather than by a model. Tightening it here would reject rows the schema
  // accepts, which is drift in the direction that loses the user their reports.
  ["an empty insight id, which the schema leaves unbounded", withInsight({ id: "" })],
  ["an insight with no evidence", withInsight({ evidence: [] })],
  [
    "empty evidence labels and values",
    withInsight({ evidence: [{ label: "", value: "" }] }),
  ],
  ["unknown keys, which the schema strips rather than refuses", content({ extra: 1 })],
  ["unknown keys inside an insight", withInsight({ extra: 1 })],
  ...KINDS.map(
    (kind): [name: string, value: unknown] => [
      `the ${kind} insight kind`,
      withInsight({ kind }),
    ],
  ),
];

const REJECTED: [name: string, value: unknown][] = [
  ["null", null],
  ["undefined", undefined],
  ["a string", "a report"],
  ["a number", 42],
  // An array is typeof "object", so this is the case a hand-written guard is
  // most likely to let through.
  ["an array", []],
  ["an array of valid reports", [content()]],

  ["a missing summary", content({ summary: undefined })],
  ["an empty summary", content({ summary: "" })],
  ["a summary one character over the limit", content({ summary: "s".repeat(1201) })],
  ["a summary that is not a string", content({ summary: 12 })],
  ["a summary that is null", content({ summary: null })],

  ["missing insights", content({ insights: undefined })],
  ["insights that are not an array", content({ insights: {} })],
  ["an insight that is null", content({ insights: [null] })],
  ["an insight that is an array", content({ insights: [[]] })],
  ["a missing insight id", withInsight({ id: undefined })],
  ["an insight id that is not a string", withInsight({ id: 7 })],
  ["a missing insight kind", withInsight({ kind: undefined })],
  ["an insight kind outside the enum", withInsight({ kind: "insight" })],
  ["an insight kind taken from the prototype chain", withInsight({ kind: "constructor" })],
  ["an empty insight title", withInsight({ title: "" })],
  ["a title one character over the limit", withInsight({ title: "t".repeat(121) })],
  ["an empty insight detail", withInsight({ detail: "" })],
  ["a detail one character over the limit", withInsight({ detail: "d".repeat(601) })],
  ["missing evidence", withInsight({ evidence: undefined })],
  ["evidence that is not an array", withInsight({ evidence: {} })],
  ["an evidence entry with no value", withInsight({ evidence: [{ label: "Work" }] })],
  [
    "an evidence value that is not a string",
    withInsight({ evidence: [{ label: "Work", value: 400 }] }),
  ],
  ["an evidence entry that is null", withInsight({ evidence: [null] })],

  ["missing recommendations", content({ recommendations: undefined })],
  ["recommendations that are not an array", content({ recommendations: "do less" })],
  [
    "a sixth recommendation",
    content({ recommendations: ["a", "b", "c", "d", "e", "f"] }),
  ],
  ["an empty recommendation", content({ recommendations: [""] })],
  [
    "a recommendation one character over the limit",
    content({ recommendations: ["r".repeat(301)] }),
  ],
  ["a recommendation that is not a string", content({ recommendations: [3] })],
];

describe("isReportContent", () => {
  it.each(ACCEPTED)("accepts %s", (_name, value) => {
    expect(isReportContent(value)).toBe(true);
  });

  it.each(REJECTED)("rejects %s", (_name, value) => {
    expect(isReportContent(value)).toBe(false);
  });

  /**
   * The test that makes the duplication safe. Everything above asserts what the
   * predicate does; this asserts that it is what the schema does, which is the
   * property the /insights read path actually depends on.
   */
  it.each([...ACCEPTED, ...REJECTED])(
    "agrees with reportContentSchema on %s",
    (_name, value) => {
      expect(isReportContent(value)).toBe(reportContentSchema.safeParse(value).success);
    },
  );

  it("returns the value as ReportContent without stripping unknown keys", () => {
    const value: unknown = content({ extra: "kept" });

    if (!isReportContent(value)) throw new Error("expected the fixture to be valid");

    // Narrowing, rather than a cast, is the point: the caller stores the row's
    // own content object, so the predicate has to be the thing that makes it a
    // ReportContent to the type system.
    expect(value.summary).toBe("You recorded 10 hours across five days.");
    expect(value.insights[0]?.kind).toBe("observation");
    expect((value as Record<string, unknown>).extra).toBe("kept");
  });
});
