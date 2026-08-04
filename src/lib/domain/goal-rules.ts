import type { GoalDirection } from "@/lib/supabase/database.types";

/**
 * Goals, streaks and the productivity score.
 *
 * The design constraint running through all of it: these are motivational
 * devices, and a motivational device that punishes honesty is worse than none.
 * Hence a streak that today cannot break, and a score that is absent rather
 * than zero on a day with no data.
 */

export interface DayResult {
  date: string;
  achievedMinutes: number;
}

export interface StreakResult {
  current: number;
  longest: number;
}

export function isGoalMet(
  achievedMinutes: number,
  targetMinutes: number,
  direction: GoalDirection,
): boolean {
  // DF-GOA-032: for an at_most goal, zero minutes counts as met. Not doing the
  // thing you are trying not to do is success.
  return direction === "at_least"
    ? achievedMinutes >= targetMinutes
    : achievedMinutes <= targetMinutes;
}

/**
 * Current and longest streak from a chronological run of days.
 *
 * `days` must be ascending and the final entry must be today. A day missing
 * from the array is treated as a day with no data, which breaks an at_least
 * streak (DF-GOA-033) - the alternative rewards not recording, which corrupts
 * the dataset the entire product depends on.
 *
 * DF-GOA-036: today is exempt from breaking an at_least streak, because the day
 * is not over. Showing a user their 40-day coding streak reset to zero at
 * 00:01, before they have had a chance to code, is a bug that feels like an
 * accusation.
 */
export function calculateStreak(
  days: DayResult[],
  targetMinutes: number,
  direction: GoalDirection,
): StreakResult {
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 0;
  let running = 0;

  for (const day of days) {
    if (isGoalMet(day.achievedMinutes, targetMinutes, direction)) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]!;
    const met = isGoalMet(day.achievedMinutes, targetMinutes, direction);

    if (met) {
      current += 1;
      continue;
    }

    const isToday = i === days.length - 1;
    if (isToday && direction === "at_least") {
      // The day is still in progress; neither counted nor fatal.
      continue;
    }
    break;
  }

  return { current, longest: Math.max(longest, current) };
}

export interface GoalProgress {
  achievedMinutes: number;
  targetMinutes: number;
  ratio: number;
  met: boolean;
}

export function goalProgress(
  achievedMinutes: number,
  targetMinutes: number,
  direction: GoalDirection,
): GoalProgress {
  return {
    achievedMinutes,
    targetMinutes,
    // Capped at 1 for bar rendering; the raw figure is still shown as text.
    ratio: targetMinutes <= 0 ? 0 : Math.min(1, achievedMinutes / targetMinutes),
    met: isGoalMet(achievedMinutes, targetMinutes, direction),
  };
}

export interface WeightedMinutes {
  parentCategoryId: string;
  minutes: number;
}

/**
 * The productivity score.
 *
 * Deliberately a user-defined formula rather than a universal one, because no
 * universal one exists: eight hours of gaming is a wasted day for one person
 * and a profession for another. The product supplies the arithmetic and the
 * user supplies the values. See docs/02-product/14 section 5.
 *
 * Returns null rather than 0 for a day with no data (DF-GOA-054). A day you did
 * not record is not a bad day, and scoring it as one teaches users to record
 * defensively.
 */
export function calculateProductivityScore(
  minutesByParent: WeightedMinutes[],
  weights: Record<string, number>,
): number | null {
  if (minutesByParent.length === 0) return null;

  let raw = 0;
  let positiveMinutes = 0;

  for (const entry of minutesByParent) {
    const weight = weights[entry.parentCategoryId] ?? 0;
    raw += entry.minutes * weight;
    if (weight > 0) positiveMinutes += entry.minutes;
  }

  const score = 50 + 50 * (raw / Math.max(positiveMinutes, 1));
  return Math.round(Math.max(0, Math.min(100, score)));
}

export const MIN_WEIGHT = -1;
export const MAX_WEIGHT = 1;

export function clampWeight(value: number): number {
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, value));
}
