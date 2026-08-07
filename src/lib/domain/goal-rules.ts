import type { GoalDirection } from "@/lib/supabase/database.types";
import { daysBetween } from "./timezone";

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
  /** Minutes against the goal's own target on that Local Day. */
  achievedMinutes: number;
  /**
   * Moments recorded that Local Day in any category, not only the goal's
   * target.
   *
   * This is what separates "you kept under an hour of Social Media" from "we
   * have no idea what you did", and the two must not be conflated - see
   * `calculateStreak`.
   */
  momentCount: number;
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
  //
  // This governs progress and the "Met" badge for the period in front of the
  // user, where it is exactly right. It deliberately says nothing about
  // streaks, which have to answer a different question - see `isStreakDay`.
  return direction === "at_least"
    ? achievedMinutes >= targetMinutes
    : achievedMinutes <= targetMinutes;
}

/**
 * Whether one Local Day is a link in a streak.
 *
 * The difference from `isGoalMet` is the whole of DF-GOA-037. An at_most goal
 * is trivially satisfied by a day with no data - zero minutes is under any
 * target - so counting unrecorded days makes a streak a measure of how long the
 * account has existed rather than of anything the user did. That is how a
 * one-day-old account reported a 731 day streak.
 *
 * DF-GOA-032 counts zero minutes toward an at_most streak, and the case it is
 * protecting is a day with zero minutes *of that category*: eight hours of Work
 * recorded and no Social Media. A day with nothing recorded at all is the
 * absence of an observation, and DF-GOA-033 already treats absence of evidence
 * as absence in the other direction, because the alternative rewards not
 * recording. The rule now reads the same way both ways round.
 */
export function isStreakDay(
  day: DayResult,
  targetMinutes: number,
  direction: GoalDirection,
): boolean {
  if (direction === "at_least") {
    // A day with no Moments has no minutes and so fails this on its own,
    // which is DF-GOA-033 without a special case.
    return day.achievedMinutes >= targetMinutes;
  }

  return day.momentCount > 0 && day.achievedMinutes <= targetMinutes;
}

/**
 * Whether a day that is not a streak day has already failed for good, or could
 * still change before the Local Day ends.
 *
 * Only one failure is irreversible: minutes already spent cannot be unspent, so
 * an at_most goal that is over its target is over it permanently. An at_least
 * target not yet reached, and an at_most day with nothing recorded yet, are
 * both still open.
 */
function isFailureFinal(
  day: DayResult,
  targetMinutes: number,
  direction: GoalDirection,
): boolean {
  return direction === "at_most" && day.achievedMinutes > targetMinutes;
}

/**
 * Current and longest streak from a chronological run of days.
 *
 * `days` must be ascending by date and the final entry must be today. Days
 * absent from the array are days with no data: a run cannot span the hole, so a
 * gap is a break rather than something to step over. Without that, a "keep
 * under" streak silently joins the two months either side of a gap and reports
 * them as consecutive.
 *
 * DF-GOA-036: today does not break a streak while it can still go either way,
 * because the day is not over. Showing a user their 40-day coding streak reset
 * to zero at 00:01, before they have had a chance to code, is a bug that feels
 * like an accusation - and under DF-GOA-037 the same is now true of a "keep
 * under" streak, which would otherwise break every morning before the first
 * activity was recorded. A "keep under" goal already over its target today is
 * the exception, because that failure cannot be undone by the rest of the day.
 *
 * This mirrors `public.get_streak` (migration 0016). The database is
 * authoritative because it owns the midnight-split attribution; this exists so
 * the rule is stated once in a form that can be reasoned about and tested.
 */
export function calculateStreak(
  days: DayResult[],
  targetMinutes: number,
  direction: GoalDirection,
): StreakResult {
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 0;
  let running = 0;
  let current = 0;
  let broken = false;

  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]!;
    const later = days[i + 1];

    // A missing calendar day between this entry and the one after it is an
    // unrecorded day, and unrecorded days are not links in the chain.
    if (later && daysBetween(day.date, later.date) !== 1) {
      running = 0;
      broken = true;
    }

    if (isStreakDay(day, targetMinutes, direction)) {
      running += 1;
      longest = Math.max(longest, running);
      if (!broken) current = running;
      continue;
    }

    // DF-GOA-036: the last entry is today, which is still in progress.
    if (i === days.length - 1 && !isFailureFinal(day, targetMinutes, direction)) {
      continue;
    }

    running = 0;
    broken = true;
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
