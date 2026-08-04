import { minutesIntoLocalDay, parseClockTime } from "./timezone";
import { elapsedMinutes } from "./moment-rules";

/**
 * When reminders fire, when a Moment is warned about, and when it is closed
 * automatically.
 *
 * Every function here is pure and takes an explicit `now`, because these rules
 * are entirely functions of the current time and a test that reads the system
 * clock will fail at midnight, at a month boundary, or on a daylight saving
 * changeover - months after it was written. DF-TST-031.
 */

/** DF-REM-002: stops a user configuring the product into being a nuisance. */
export const MIN_REMINDER_INTERVAL_MINUTES = 10;
export const DEFAULT_REMINDER_INTERVAL_MINUTES = 60;
export const DEFAULT_WARNING_MINUTES = 180;
export const DEFAULT_AUTO_CLOSE_MINUTES = 360;

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timeZone: string;
}

/**
 * Whether an instant falls inside the user's quiet window.
 *
 * Windows crossing midnight (22:00 to 07:00) are the normal case, not the edge
 * case, so they are handled by comparing against both ends rather than assuming
 * start is less than end.
 */
export function isWithinQuietHours(now: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;

  const minutesNow = minutesIntoLocalDay(now, quiet.timeZone);
  const start = parseClockTime(quiet.start);
  const end = parseClockTime(quiet.end);

  if (start === end) return false;

  return start < end
    ? minutesNow >= start && minutesNow < end
    : minutesNow >= start || minutesNow < end;
}

export interface ReminderInput {
  startAt: Date;
  lastReminderAt: Date | null;
  intervalMinutes: number;
  remindersEnabled: boolean;
  quiet: QuietHours;
  now?: Date;
}

/**
 * Whether a pending Moment is due a reminder.
 *
 * DF-REM-003: the first reminder arrives one interval after the start, not
 * immediately - reminding someone about something they recorded ninety seconds
 * ago is noise.
 *
 * DF-REM-008: a reminder suppressed by quiet hours is dropped, never queued.
 * Delivering six suppressed reminders together at 07:00 would be worse than
 * sending nothing at all.
 */
export function isReminderDue(input: ReminderInput): boolean {
  if (!input.remindersEnabled) return false;

  const now = input.now ?? new Date();
  if (isWithinQuietHours(now, input.quiet)) return false;

  const interval = Math.max(MIN_REMINDER_INTERVAL_MINUTES, input.intervalMinutes);
  const since = input.lastReminderAt ?? input.startAt;
  const minutesSince = Math.floor((now.getTime() - since.getTime()) / 60_000);

  return minutesSince >= interval;
}

export interface WarningInput {
  startAt: Date;
  warnedAt: Date | null;
  warningMinutes: number;
  now?: Date;
}

/** DF-REM-040. Fires exactly once, which is what `warnedAt` records. */
export function shouldWarnLongActivity(input: WarningInput): boolean {
  if (input.warnedAt) return false;
  return elapsedMinutes(input.startAt, input.now ?? new Date()) >= input.warningMinutes;
}

export interface AutoCloseInput {
  startAt: Date;
  autoCloseEnabled: boolean;
  autoCloseMinutes: number;
  now?: Date;
}

/**
 * DF-REM-050. Encodes a belief about human behaviour: a single unbroken focused
 * activity lasting six hours is far more likely to be a forgotten entry than a
 * real event.
 */
export function shouldAutoClose(input: AutoCloseInput): boolean {
  if (!input.autoCloseEnabled) return false;
  return elapsedMinutes(input.startAt, input.now ?? new Date()) >= input.autoCloseMinutes;
}

/**
 * The end time an auto-close writes. Exactly the threshold after the start, so
 * the estimate is predictable and the user can see what was assumed.
 */
export function autoCloseEndTime(startAt: Date, autoCloseMinutes: number): Date {
  return new Date(startAt.getTime() + autoCloseMinutes * 60_000);
}

/**
 * DF-REM-006: multiple due reminders for one user become a single notification.
 * Without this the notification shade fills with six separate reminders over six
 * hours, which reliably produces a revoked permission.
 */
export function buildReminderMessage(
  pending: Array<{ categoryName: string; startAt: Date }>,
  now: Date = new Date(),
): { title: string; body: string } {
  if (pending.length === 1) {
    const item = pending[0]!;
    const minutes = elapsedMinutes(item.startAt, now);
    return {
      title: `Still on ${item.categoryName}?`,
      body: `Running ${formatElapsed(minutes)}. Tap to close it.`,
    };
  }

  const names = pending.map((p) => p.categoryName).join(", ");
  return {
    title: `${pending.length} activities still open`,
    body: names,
  };
}

function formatElapsed(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
