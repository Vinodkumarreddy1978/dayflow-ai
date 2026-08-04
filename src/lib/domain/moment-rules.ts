import { endOfLocalDay, eachDay, localDateString, startOfLocalDay } from "./timezone";

/**
 * Validation and time attribution for Moments.
 *
 * These rules are mirrored by database triggers in
 * supabase/migrations/0008_triggers.sql. The duplication is deliberate per
 * ADR-004: this copy exists so the user gets an inline error instantly, and the
 * SQL copy exists because a second device or a direct REST call would bypass
 * this one entirely.
 */

/** DF-MOM-011: client clocks drift; refusing a Moment because a phone is 90 seconds fast is indefensible. */
export const FUTURE_TOLERANCE_MINUTES = 5;

/** DF-MOM-013: anything longer is a forgotten entry, not an activity. */
export const MAX_MOMENT_HOURS = 24;

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  field: "startAt" | "endAt" | "categoryId" | "form";
  severity: ValidationSeverity;
  code: string;
  message: string;
}

export interface MomentTimesInput {
  startAt: Date;
  endAt: Date | null;
  now?: Date;
}

/**
 * Validates the time fields of a Moment.
 *
 * Errors block the save; warnings do not. The split is deliberate: impossible
 * data is refused, unusual but possible data is allowed. Listening to a podcast
 * while commuting while walking is three genuine concurrent Moments, so overlap
 * can never be an error.
 */
export function validateMomentTimes(input: MomentTimesInput): ValidationIssue[] {
  const now = input.now ?? new Date();
  const issues: ValidationIssue[] = [];
  const toleranceMs = FUTURE_TOLERANCE_MINUTES * 60_000;

  // DF-MOM-011
  if (input.startAt.getTime() > now.getTime() + toleranceMs) {
    issues.push({
      field: "startAt",
      severity: "error",
      code: "START_IN_FUTURE",
      message: "Start time cannot be in the future.",
    });
  }

  if (input.endAt) {
    // DF-MOM-010
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      issues.push({
        field: "endAt",
        severity: "error",
        code: "END_BEFORE_START",
        message: "End time must be after the start time.",
      });
    }

    // DF-MOM-012
    if (input.endAt.getTime() > now.getTime() + toleranceMs) {
      issues.push({
        field: "endAt",
        severity: "error",
        code: "END_IN_FUTURE",
        message: "End time cannot be in the future.",
      });
    }

    // DF-MOM-013
    const hours = (input.endAt.getTime() - input.startAt.getTime()) / 3_600_000;
    if (hours > MAX_MOMENT_HOURS) {
      issues.push({
        field: "endAt",
        severity: "error",
        code: "TOO_LONG",
        message: `An activity cannot be longer than ${MAX_MOMENT_HOURS} hours.`,
      });
    }
  }

  return issues;
}

export function hasBlockingIssue(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** Whole minutes between two instants. Null while a Moment is still pending. */
export function durationMinutes(startAt: Date, endAt: Date | null): number | null {
  if (!endAt) return null;
  return Math.floor((endAt.getTime() - startAt.getTime()) / 60_000);
}

/** How long a pending Moment has been open. */
export function elapsedMinutes(startAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - startAt.getTime()) / 60_000));
}

export interface DaySlice {
  date: string;
  minutes: number;
}

/**
 * Splits a Moment across the Local Days it covers, per ADR-010.
 *
 * A Moment from 22:30 to 01:30 yields 90 minutes on each of two days rather than
 * 180 on the first. The rejected alternative - attributing everything to the
 * start day - renders an eight-hour sleep as a block on the previous day and
 * leaves the following morning empty, which is visibly wrong to anyone who
 * sleeps normally.
 */
export function splitAcrossLocalDays(
  startAt: Date,
  endAt: Date | null,
  timeZone: string,
  now: Date = new Date(),
): DaySlice[] {
  const effectiveEnd = endAt ?? now;
  if (effectiveEnd.getTime() <= startAt.getTime()) return [];

  const firstDay = localDateString(startAt, timeZone);
  // An end exactly at midnight belongs wholly to the preceding day, so step back
  // one millisecond before asking which day it falls on.
  const lastDay = localDateString(new Date(effectiveEnd.getTime() - 1), timeZone);

  return eachDay(firstDay, lastDay)
    .map((date) => {
      const dayStart = startOfLocalDay(date, timeZone);
      const dayEnd = endOfLocalDay(date, timeZone);

      const overlapStart = Math.max(startAt.getTime(), dayStart.getTime());
      const overlapEnd = Math.min(effectiveEnd.getTime(), dayEnd.getTime());
      const minutes = Math.max(0, Math.round((overlapEnd - overlapStart) / 60_000));

      return { date, minutes };
    })
    .filter((slice) => slice.minutes > 0);
}

export interface OverlapCandidate {
  id: string;
  startAt: Date;
  endAt: Date | null;
}

/**
 * How many existing Moments overlap the proposed one.
 *
 * DF-MOM-016: this produces a warning, never a refusal, because genuine
 * simultaneity exists.
 */
export function countOverlaps(
  proposed: { id?: string; startAt: Date; endAt: Date | null },
  existing: OverlapCandidate[],
  now: Date = new Date(),
): number {
  const proposedEnd = (proposed.endAt ?? now).getTime();
  const proposedStart = proposed.startAt.getTime();

  return existing.filter((candidate) => {
    if (proposed.id && candidate.id === proposed.id) return false;
    const candidateEnd = (candidate.endAt ?? now).getTime();
    return candidate.startAt.getTime() < proposedEnd && candidateEnd > proposedStart;
  }).length;
}

/** DF-MOM-014: same category at the same start time is a duplicate. */
export function isDuplicate(
  proposed: { id?: string; categoryId: string; startAt: Date },
  existing: Array<{ id: string; categoryId: string; startAt: Date }>,
): boolean {
  return existing.some(
    (candidate) =>
      candidate.id !== proposed.id &&
      candidate.categoryId === proposed.categoryId &&
      candidate.startAt.getTime() === proposed.startAt.getTime(),
  );
}
