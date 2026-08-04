import type { Insight, PeriodFacts } from "./facts";

/**
 * Deterministic insight modules.
 *
 * Every observation the product makes about a user's time originates here, from
 * arithmetic on their own records - not from a model. The model's only job is to
 * phrase these; it never discovers them and never contributes a number. ADR-011.
 *
 * The consequence is that insights are reproducible, explainable, free, and
 * available even when AI is switched off or the provider is down. A time tracker
 * that tells you something untrue about your own week has failed at the one thing
 * it exists to do.
 *
 * Each module is a pure function returning null when it has nothing to say.
 * Saying nothing is a valid and frequently correct outcome: five thin insights
 * are worse than one real one.
 */
export interface InsightProvider {
  id: string;
  run: (facts: PeriodFacts) => Insight | null;
}

function hours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (whole === 0) return `${rest}m`;
  if (rest === 0) return `${whole}h`;
  return `${whole}h ${rest}m`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Below this there is not enough signal for any claim to be honest. */
const MIN_MINUTES_FOR_ANALYSIS = 120;
const MIN_DAYS_FOR_TREND = 4;

/**
 * The single largest use of time in the period.
 *
 * Deliberately neutral in tone. Whether eleven hours of Work is good or bad is
 * not the product's call to make.
 */
const dominantCategory: InsightProvider = {
  id: "dominant-category",
  run: (facts) => {
    if (facts.totals.recordedMinutes < MIN_MINUTES_FOR_ANALYSIS) return null;

    const top = facts.byParentCategory[0];
    if (!top || top.minutes <= 0) return null;

    const share = top.minutes / facts.totals.recordedMinutes;
    if (share < 0.2) return null;

    return {
      id: "dominant-category",
      kind: "observation",
      title: `${top.name} took the largest share`,
      detail: `${hours(top.minutes)} of your ${hours(facts.totals.recordedMinutes)} recorded, across ${top.momentCount} ${top.momentCount === 1 ? "activity" : "activities"}.`,
      evidence: [
        { label: top.name, value: hours(top.minutes) },
        { label: "Share of recorded time", value: percent(share) },
      ],
    };
  },
};

/**
 * Distraction as a proportion, not an absolute.
 *
 * Reported against recorded time rather than the calendar, because "four hours of
 * scrolling" means something entirely different in a day where six hours were
 * recorded than in one where sixteen were.
 */
const distractionShare: InsightProvider = {
  id: "distraction-share",
  run: (facts) => {
    if (facts.totals.recordedMinutes < MIN_MINUTES_FOR_ANALYSIS) return null;
    if (facts.totals.distractedMinutes <= 0) return null;

    const share = facts.totals.distractedMinutes / facts.totals.recordedMinutes;
    const perDay =
      facts.totals.daysWithData > 0
        ? facts.totals.distractedMinutes / facts.totals.daysWithData
        : 0;

    // A quarter is the threshold at which this stops being an observation and
    // becomes something worth flagging. Below it, the number is still shown -
    // it just is not editorialised.
    const isHigh = share >= 0.25;

    return {
      id: "distraction-share",
      kind: isHigh ? "warning" : "observation",
      title: isHigh
        ? `Distraction was ${percent(share)} of your recorded time`
        : `Distraction stayed at ${percent(share)}`,
      detail: isHigh
        ? `That is about ${hours(perDay)} on an average recorded day. Worth knowing where it went, rather than resolving to do better.`
        : `About ${hours(perDay)} on an average recorded day.`,
      evidence: [
        { label: "Distracted", value: hours(facts.totals.distractedMinutes) },
        { label: "Recorded", value: hours(facts.totals.recordedMinutes) },
      ],
    };
  },
};

/**
 * Consistency, measured as days recorded out of days in the period.
 *
 * Reported as a habit rather than a score. Low coverage is a fact about the
 * tracking, not about the person - and saying otherwise would be both rude and
 * unsupported by the data.
 */
const consistency: InsightProvider = {
  id: "consistency",
  run: (facts) => {
    if (facts.period.days < MIN_DAYS_FOR_TREND) return null;

    const coverage = facts.totals.daysWithData / facts.period.days;

    if (coverage >= 0.85) {
      return {
        id: "consistency",
        kind: "achievement",
        title: `You recorded ${facts.totals.daysWithData} of ${facts.period.days} days`,
        detail:
          "Consistent enough that the numbers above are worth trusting. Most of the value in tracking comes from exactly this.",
        evidence: [
          {
            label: "Days recorded",
            value: `${facts.totals.daysWithData}/${facts.period.days}`,
          },
        ],
      };
    }

    if (coverage < 0.5) {
      return {
        id: "consistency",
        kind: "observation",
        title: `Only ${facts.totals.daysWithData} of ${facts.period.days} days have records`,
        detail:
          "Everything else here describes those days only. The gaps are not counted as empty - they are simply unknown.",
        evidence: [
          {
            label: "Days recorded",
            value: `${facts.totals.daysWithData}/${facts.period.days}`,
          },
        ],
      };
    }

    return null;
  },
};

/**
 * Period-over-period movement.
 *
 * Requires a real previous period to compare against: a 900% increase from a
 * single recorded hour last week is arithmetically true and completely useless.
 */
const trend: InsightProvider = {
  id: "trend",
  run: (facts) => {
    const previous = facts.comparison.previousPeriodMinutes;
    if (previous < MIN_MINUTES_FOR_ANALYSIS) return null;
    if (facts.totals.recordedMinutes < MIN_MINUTES_FOR_ANALYSIS) return null;

    const change = (facts.totals.recordedMinutes - previous) / previous;
    if (Math.abs(change) < 0.15) {
      return {
        id: "trend",
        kind: "observation",
        title: "Roughly the same as last period",
        detail: `${hours(facts.totals.recordedMinutes)} against ${hours(previous)}. Steady, which is usually the point.`,
        evidence: [
          { label: "This period", value: hours(facts.totals.recordedMinutes) },
          { label: "Previous", value: hours(previous) },
        ],
      };
    }

    return {
      id: "trend",
      kind: "observation",
      title:
        change > 0
          ? `You recorded ${percent(change)} more than last period`
          : `You recorded ${percent(Math.abs(change))} less than last period`,
      // Explicitly separates the two explanations, because conflating them is
      // the single most common way a tracker misleads its own user.
      detail: `${hours(facts.totals.recordedMinutes)} against ${hours(previous)}. This can mean your time changed, or only that your tracking did.`,
      evidence: [
        { label: "This period", value: hours(facts.totals.recordedMinutes) },
        { label: "Previous", value: hours(previous) },
      ],
    };
  },
};

/**
 * Sustained heavy days - the closest thing to burnout that time records alone can
 * honestly support.
 *
 * Framed as a question rather than a diagnosis. The product can see that eleven
 * hours of Work were recorded four days running; it cannot see whether that was
 * a deadline the user chose or a pattern they are stuck in. DF-AIA-020.
 */
const sustainedLoad: InsightProvider = {
  id: "sustained-load",
  run: (facts) => {
    if (facts.byDay.length < MIN_DAYS_FOR_TREND) return null;

    const HEAVY_MINUTES = 10 * 60;
    let longest = 0;
    let current = 0;

    for (const day of facts.byDay) {
      if (day.minutes >= HEAVY_MINUTES) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }

    if (longest < 3) return null;

    return {
      id: "sustained-load",
      kind: "warning",
      title: `${longest} heavy days in a row`,
      detail: `Ten hours or more recorded on ${longest} consecutive days. If that was a deadline, fine. If it is becoming normal, it is worth noticing now rather than later.`,
      evidence: [{ label: "Consecutive heavy days", value: String(longest) }],
    };
  },
};

/**
 * Fragmentation: many short entries in one category.
 *
 * A useful signal because it is invisible in a pie chart. Four hours of Coding
 * and four hours of Coding look identical there, whether it was two sittings or
 * twenty-six interruptions.
 */
const fragmentation: InsightProvider = {
  id: "fragmentation",
  run: (facts) => {
    const candidates = facts.byCategory
      .filter((category) => category.momentCount >= 6 && category.minutes >= 60)
      .map((category) => ({
        ...category,
        averageMinutes: category.minutes / category.momentCount,
      }))
      .filter((category) => category.averageMinutes <= 20)
      .sort((a, b) => b.momentCount - a.momentCount);

    const worst = candidates[0];
    if (!worst) return null;

    return {
      id: "fragmentation",
      kind: "habit",
      title: `${worst.name} came in ${worst.momentCount} short bursts`,
      detail: `Averaging ${hours(Math.round(worst.averageMinutes))} each. Whether that is a problem depends on the work - but it is not the same as ${hours(worst.minutes)} of uninterrupted time, and a chart cannot tell you that.`,
      evidence: [
        { label: "Entries", value: String(worst.momentCount) },
        { label: "Average length", value: hours(Math.round(worst.averageMinutes)) },
        { label: "Total", value: hours(worst.minutes) },
      ],
    };
  },
};

/**
 * Data quality. Auto-closed Moments are estimates, and a report drawn largely
 * from estimates should say so before it says anything else.
 */
const dataQuality: InsightProvider = {
  id: "data-quality",
  run: (facts) => {
    if (facts.quality.autoClosedCount === 0) return null;
    if (facts.totals.momentCount === 0) return null;

    const share = facts.quality.autoClosedCount / facts.totals.momentCount;
    if (share < 0.15) return null;

    return {
      id: "data-quality",
      kind: "warning",
      title: `${facts.quality.autoClosedCount} activities were closed automatically`,
      detail: `That is ${percent(share)} of this period's entries, recorded as estimates rather than measurements. Correcting the ones you remember will sharpen everything above.`,
      evidence: [
        { label: "Estimated entries", value: String(facts.quality.autoClosedCount) },
        { label: "Total entries", value: String(facts.totals.momentCount) },
      ],
    };
  },
};

/**
 * Categories that received no time at all despite existing.
 *
 * Kept last and kept gentle: an unused category is far more often a category that
 * stopped being relevant than evidence of a neglected ambition.
 */
const neglected: InsightProvider = {
  id: "neglected",
  run: (facts) => {
    if (facts.period.days < 7) return null;

    const empty = facts.byParentCategory.filter(
      (group) => group.minutes === 0 && !group.isDistraction,
    );

    if (empty.length === 0 || empty.length > 3) return null;

    return {
      id: "neglected",
      kind: "observation",
      title: `Nothing recorded under ${empty.map((group) => group.name).join(", ")}`,
      detail:
        "Either it did not happen, or it happened and was not recorded. Both are worth knowing, and only you can say which.",
      evidence: empty.map((group) => ({ label: group.name, value: "0m" })),
    };
  },
};

/** Order matters: data quality first, because it qualifies everything after it. */
export const insightProviders: InsightProvider[] = [
  dataQuality,
  dominantCategory,
  distractionShare,
  sustainedLoad,
  fragmentation,
  consistency,
  trend,
  neglected,
];

/** Runs every module and drops the ones with nothing to say. */
export function deriveInsights(facts: PeriodFacts): Insight[] {
  return insightProviders
    .map((provider) => {
      try {
        return provider.run(facts);
      } catch {
        // One faulty module must not lose the whole report. A missing insight is
        // recoverable; a failed report is a blank screen.
        return null;
      }
    })
    .filter((insight): insight is Insight => insight !== null);
}

/**
 * A complete report with no model involved.
 *
 * This is the fallback when AI is off, unconsented, quota-exhausted or failing -
 * and it is a real report, not a placeholder. DF-AIA-030.
 */
export function deterministicSummary(facts: PeriodFacts, insights: Insight[]): string {
  if (facts.totals.recordedMinutes === 0) {
    return `Nothing was recorded between ${facts.period.start} and ${facts.period.end}. No conclusions to draw, which is itself a fine outcome for a week you were not trying to measure.`;
  }

  const top = facts.byParentCategory.filter((group) => group.minutes > 0).slice(0, 3);

  const parts = [
    `You recorded ${hours(facts.totals.recordedMinutes)} across ${facts.totals.daysWithData} ${facts.totals.daysWithData === 1 ? "day" : "days"}, in ${facts.totals.momentCount} ${facts.totals.momentCount === 1 ? "entry" : "entries"}.`,
  ];

  if (top.length > 0) {
    parts.push(
      `Most of it went to ${top.map((group) => `${group.name} (${hours(group.minutes)})`).join(", ")}.`,
    );
  }

  const warnings = insights.filter((insight) => insight.kind === "warning");
  if (warnings.length > 0) {
    parts.push(warnings.map((insight) => insight.title).join(". ") + ".");
  }

  return parts.join(" ");
}

/**
 * Recommendations derived from the insights, not invented.
 *
 * Each one is tied to something the modules actually found, which is why there
 * is no generic advice here about waking up earlier.
 */
export function deterministicRecommendations(insights: Insight[]): string[] {
  const recommendations: string[] = [];
  const byId = new Set(insights.map((insight) => insight.id));

  if (byId.has("data-quality")) {
    recommendations.push(
      "Review the entries marked as estimates and correct the ones you remember - it takes a minute and makes every chart honest.",
    );
  }

  if (byId.has("fragmentation")) {
    recommendations.push(
      "Try one deliberately protected block for the work that came in bursts, and compare how it feels.",
    );
  }

  if (byId.has("sustained-load")) {
    recommendations.push(
      "Plan one genuinely lighter day this week rather than waiting for one to happen.",
    );
  }

  const distraction = insights.find((insight) => insight.id === "distraction-share");
  if (distraction?.kind === "warning") {
    recommendations.push(
      "Pick the single largest distraction category and set an at-most goal on it. One target you watch beats a resolution you forget.",
    );
  }

  if (
    byId.has("consistency") &&
    insights.some((i) => i.id === "consistency" && i.kind === "observation")
  ) {
    recommendations.push(
      "Recording just the start of an activity is enough - the queue will remind you to close it.",
    );
  }

  return recommendations.slice(0, 5);
}
