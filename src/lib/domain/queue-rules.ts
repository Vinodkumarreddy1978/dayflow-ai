import { elapsedMinutes } from "./moment-rules";

/**
 * The bounded queue - the mechanic that makes DayFlow AI different.
 *
 * The reasoning is in docs/00-governance/02-product-charter.md section 5.2: an
 * unbounded backlog of unclosed entries becomes archaeology. The user faces
 * fourteen open items, cannot remember any of them accurately, invents the
 * numbers, and stops trusting their own data. A hard ceiling forces resolution
 * while the memory is still good.
 */

export const DEFAULT_QUEUE_LIMIT = 2;
export const MIN_QUEUE_LIMIT = 1;
export const MAX_QUEUE_LIMIT = 5;

export interface QueueCapacity {
  used: number;
  limit: number;
  free: number;
  isFull: boolean;
}

export function queueCapacity(pendingCount: number, limit: number): QueueCapacity {
  const free = Math.max(0, limit - pendingCount);
  return { used: pendingCount, limit, free, isFull: free === 0 };
}

export interface QueueDecision {
  allowed: boolean;
  code?: "QUEUE_LIMIT_REACHED";
  message?: string;
}

/**
 * Whether a new pending Moment may be created.
 *
 * ADR-009: this is a refusal, not a warning. A dismissible warning becomes
 * invisible within a week - the reliable fate of all soft limits - and a
 * constraint that can be clicked through is not a constraint. The escape hatch
 * is configuration, which is a deliberate act, rather than override, which is a
 * reflex.
 */
export function canCreatePending(pendingCount: number, limit: number): QueueDecision {
  if (pendingCount >= limit) {
    return {
      allowed: false,
      code: "QUEUE_LIMIT_REACHED",
      message:
        limit === 1
          ? "You already have an activity open. Close it before starting another."
          : `You already have ${pendingCount} activities open. Close one before starting another.`,
    };
  }
  return { allowed: true };
}

/**
 * Lowering the limit below the current pending count is permitted, and existing
 * Moments are never closed or deleted as a result. DF-QUE-006, DF-QUE-007.
 */
export function isOverCapacity(pendingCount: number, limit: number): boolean {
  return pendingCount > limit;
}

export type UrgencyState = "normal" | "needs_attention" | "overdue";

export interface UrgencyThresholds {
  warningMinutes: number;
  autoCloseMinutes: number;
  autoCloseEnabled: boolean;
}

/**
 * The escalation ladder: a reminder each interval, a warning at three hours, an
 * automatic close at six.
 *
 * "overdue" only occurs when auto-close is switched off. With it on, such a
 * Moment would already have been closed by the scheduled job.
 */
export function urgencyState(
  startAt: Date,
  thresholds: UrgencyThresholds,
  now: Date = new Date(),
): UrgencyState {
  const elapsed = elapsedMinutes(startAt, now);

  if (!thresholds.autoCloseEnabled && elapsed >= thresholds.autoCloseMinutes) {
    return "overdue";
  }
  if (elapsed >= thresholds.warningMinutes) {
    return "needs_attention";
  }
  return "normal";
}

/** Oldest first, so the most at-risk memory is addressed first. DF-QUE-023. */
export function sortPendingByAge<T extends { start_at: string }>(moments: T[]): T[] {
  return [...moments].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );
}
