import { describe, expect, it } from "vitest";
import type { PeriodFacts } from "./facts";
import {
  deriveInsights,
  deterministicRecommendations,
  deterministicSummary,
} from "./insights";

/**
 * A period with nothing notable in it. Individual tests override only the fields
 * they care about, so a test about distraction cannot accidentally depend on the
 * comparison figures.
 */
function facts(overrides: Partial<PeriodFacts> = {}): PeriodFacts {
  return {
    period: { start: "2026-07-27", end: "2026-08-02", days: 7 },
    totals: {
      recordedMinutes: 600,
      distractedMinutes: 0,
      momentCount: 10,
      daysWithData: 5,
      averageMinutesPerDay: 120,
      ...overrides.totals,
    },
    byParentCategory: overrides.byParentCategory ?? [
      { name: "Work", isDistraction: false, minutes: 400, momentCount: 6 },
      { name: "Health", isDistraction: false, minutes: 200, momentCount: 4 },
    ],
    byCategory: overrides.byCategory ?? [],
    byDay: overrides.byDay ?? [],
    comparison: { previousPeriodMinutes: 0, ...overrides.comparison },
    quality: { autoClosedCount: 0, ...overrides.quality },
    ...(overrides.period ? { period: overrides.period } : {}),
  } as PeriodFacts;
}

function ids(facts: PeriodFacts): string[] {
  return deriveInsights(facts).map((insight) => insight.id);
}

describe("deriveInsights", () => {
  it("says nothing at all when there is too little data to be honest", () => {
    const result = deriveInsights(
      facts({
        period: { start: "2026-08-01", end: "2026-08-01", days: 1 },
        totals: {
          recordedMinutes: 30,
          distractedMinutes: 0,
          momentCount: 1,
          daysWithData: 1,
          averageMinutesPerDay: 30,
        },
        byParentCategory: [
          { name: "Work", isDistraction: false, minutes: 30, momentCount: 1 },
        ],
      }),
    );

    // Thirty minutes on one day supports no claims. Manufacturing one would be
    // the product's first lie.
    expect(result).toEqual([]);
  });

  it("reports the dominant category with its evidence", () => {
    const insight = deriveInsights(facts()).find((i) => i.id === "dominant-category");

    expect(insight?.title).toContain("Work");
    expect(insight?.evidence.some((item) => item.value === "6h 40m")).toBe(true);
  });

  it("never asserts a figure without evidence to support it", () => {
    for (const insight of deriveInsights(facts({ quality: { autoClosedCount: 4 } }))) {
      expect(insight.evidence.length).toBeGreaterThan(0);
    }
  });

  it("escalates distraction to a warning only past a quarter of recorded time", () => {
    const modest = deriveInsights(
      facts({
        totals: {
          recordedMinutes: 600,
          distractedMinutes: 60,
          momentCount: 10,
          daysWithData: 5,
          averageMinutesPerDay: 120,
        },
      }),
    ).find((i) => i.id === "distraction-share");

    expect(modest?.kind).toBe("observation");

    const heavy = deriveInsights(
      facts({
        totals: {
          recordedMinutes: 600,
          distractedMinutes: 200,
          momentCount: 10,
          daysWithData: 5,
          averageMinutesPerDay: 120,
        },
      }),
    ).find((i) => i.id === "distraction-share");

    expect(heavy?.kind).toBe("warning");
  });

  it("stays silent about distraction when there was none", () => {
    expect(ids(facts())).not.toContain("distraction-share");
  });

  it("flags three consecutive heavy days but not two", () => {
    const heavyDay = (date: string, minutes: number) => ({
      date,
      minutes,
      distractedMinutes: 0,
    });

    const twoDays = deriveInsights(
      facts({
        byDay: [
          heavyDay("2026-07-27", 700),
          heavyDay("2026-07-28", 700),
          heavyDay("2026-07-29", 200),
          heavyDay("2026-07-30", 200),
        ],
      }),
    );
    expect(twoDays.map((i) => i.id)).not.toContain("sustained-load");

    const threeDays = deriveInsights(
      facts({
        byDay: [
          heavyDay("2026-07-27", 700),
          heavyDay("2026-07-28", 620),
          heavyDay("2026-07-29", 601),
          heavyDay("2026-07-30", 100),
        ],
      }),
    );

    const insight = threeDays.find((i) => i.id === "sustained-load");
    expect(insight?.kind).toBe("warning");
    expect(insight?.title).toContain("3 heavy days");
  });

  it("frames sustained load as a question, never as a diagnosis", () => {
    const insight = deriveInsights(
      facts({
        byDay: [
          { date: "2026-07-27", minutes: 700, distractedMinutes: 0 },
          { date: "2026-07-28", minutes: 700, distractedMinutes: 0 },
          { date: "2026-07-29", minutes: 700, distractedMinutes: 0 },
          { date: "2026-07-30", minutes: 120, distractedMinutes: 0 },
        ],
      }),
    ).find((i) => i.id === "sustained-load");

    expect(insight).toBeDefined();

    // Time records cannot see burnout, stress or motivation, so the wording must
    // not claim to. DF-AIA-020.
    for (const word of ["burnout", "stressed", "unhealthy", "overworked"]) {
      expect(insight!.detail.toLowerCase()).not.toContain(word);
    }
  });

  it("detects fragmentation that a pie chart cannot show", () => {
    const insight = deriveInsights(
      facts({
        byCategory: [
          { name: "Email", parentName: "Work", minutes: 180, momentCount: 18 },
          { name: "Coding", parentName: "Work", minutes: 240, momentCount: 2 },
        ],
      }),
    ).find((i) => i.id === "fragmentation");

    expect(insight?.title).toContain("Email");
    expect(insight?.title).toContain("18");
  });

  it("does not call a few long sittings fragmented", () => {
    expect(
      ids(
        facts({
          byCategory: [
            { name: "Coding", parentName: "Work", minutes: 400, momentCount: 3 },
          ],
        }),
      ),
    ).not.toContain("fragmentation");
  });

  it("warns when a large share of the period was estimated rather than measured", () => {
    const insight = deriveInsights(facts({ quality: { autoClosedCount: 4 } })).find(
      (i) => i.id === "data-quality",
    );

    expect(insight?.kind).toBe("warning");
    expect(insight?.title).toContain("4 activities");
  });

  it("puts the data-quality caveat first, because it qualifies everything else", () => {
    const result = deriveInsights(facts({ quality: { autoClosedCount: 5 } }));
    expect(result[0]?.id).toBe("data-quality");
  });

  it("refuses to compare against a previous period with almost no data", () => {
    // A 900% increase over one recorded hour is arithmetically true and useless.
    expect(ids(facts({ comparison: { previousPeriodMinutes: 30 } }))).not.toContain(
      "trend",
    );
  });

  it("separates a change in time from a change in tracking", () => {
    const insight = deriveInsights(
      facts({ comparison: { previousPeriodMinutes: 300 } }),
    ).find((i) => i.id === "trend");

    expect(insight?.detail).toContain("or only that your tracking did");
  });

  it("celebrates consistent recording and reports sparse recording neutrally", () => {
    const consistent = deriveInsights(
      facts({
        totals: {
          recordedMinutes: 600,
          distractedMinutes: 0,
          momentCount: 10,
          daysWithData: 7,
          averageMinutesPerDay: 86,
        },
      }),
    ).find((i) => i.id === "consistency");

    expect(consistent?.kind).toBe("achievement");

    const sparse = deriveInsights(
      facts({
        totals: {
          recordedMinutes: 600,
          distractedMinutes: 0,
          momentCount: 10,
          daysWithData: 2,
          averageMinutesPerDay: 300,
        },
      }),
    ).find((i) => i.id === "consistency");

    expect(sparse?.kind).toBe("observation");
    expect(sparse?.detail).toContain("unknown");
  });
});

describe("deterministicSummary", () => {
  it("produces a real report with no model involved", () => {
    const input = facts();
    const summary = deterministicSummary(input, deriveInsights(input));

    expect(summary).toContain("10h");
    expect(summary).toContain("Work");
    expect(summary.length).toBeGreaterThan(40);
  });

  it("does not treat an empty period as a failure", () => {
    const input = facts({
      totals: {
        recordedMinutes: 0,
        distractedMinutes: 0,
        momentCount: 0,
        daysWithData: 0,
        averageMinutesPerDay: 0,
      },
      byParentCategory: [],
    });

    expect(deterministicSummary(input, [])).toContain("Nothing was recorded");
  });
});

describe("deterministicRecommendations", () => {
  it("only suggests things tied to an actual finding", () => {
    expect(deterministicRecommendations([])).toEqual([]);
  });

  it("suggests correcting estimates when estimates were flagged", () => {
    const input = facts({ quality: { autoClosedCount: 6 } });
    const recommendations = deterministicRecommendations(deriveInsights(input));

    expect(recommendations.join(" ")).toContain("estimates");
  });

  it("never returns more than five", () => {
    const input = facts({
      totals: {
        recordedMinutes: 3000,
        distractedMinutes: 1500,
        momentCount: 30,
        daysWithData: 2,
        averageMinutesPerDay: 1500,
      },
      quality: { autoClosedCount: 20 },
      byCategory: [{ name: "Email", parentName: "Work", minutes: 200, momentCount: 20 }],
      byDay: [
        { date: "2026-07-27", minutes: 700, distractedMinutes: 300 },
        { date: "2026-07-28", minutes: 700, distractedMinutes: 300 },
        { date: "2026-07-29", minutes: 700, distractedMinutes: 300 },
      ],
      comparison: { previousPeriodMinutes: 1000 },
    });

    expect(
      deterministicRecommendations(deriveInsights(input)).length,
    ).toBeLessThanOrEqual(5);
  });
});
