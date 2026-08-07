/**
 * Which settings changes are written on the spot, and which are asked about
 * first.
 *
 * There is no Save button by design: every control writes the moment it is
 * touched (DF-SET-003). That is what makes the screen feel immediate and also
 * what makes a mistouch cheap to make and expensive to notice, because the only
 * evidence is a toggle nobody looks at again. Two answers. Most changes are
 * applied and the confirmation toast carries an Undo. A few are asked about
 * before anything is written, because by the time an Undo could be offered the
 * damage is already done.
 *
 * This module decides; `change-copy.ts` words it. The split is not tidiness:
 * the decision has to be made synchronously inside a click handler and so
 * belongs to the route's first load, while the wording is only ever read by the
 * deferred dialog, and /settings has no room to carry six paragraphs of dialog
 * copy for a dialog most sessions never open.
 */

import type { SettingsInput } from "@/lib/schemas";
import type { Settings } from "@/lib/supabase/database.types";

/**
 * What is being changed, plus the values the dialog has to name.
 *
 * A union rather than a bag of optional strings, so that wording a case without
 * the values it quotes cannot compile.
 */
export type PendingConfirmation =
  | { kind: "ai-consent-on" }
  | {
      kind: "time-zone";
      /** The zone days are counted in now. */
      current: string;
      chosen: string;
      /** What the device reports, or null before it has been read. */
      detected: string | null;
    }
  | { kind: "week-start"; current: string; chosen: string }
  | { kind: "reminders-off" }
  | { kind: "push-off" }
  | { kind: "push-device-off" };

export type ChangeKind = PendingConfirmation["kind"];

/**
 * The per-device button in the notifications card, which unsubscribes through
 * the Push API rather than through a settings column. Same protection, because
 * the consequence of a mistouch is identical from where the user is standing.
 */
export const PUSH_DEVICE_OFF: PendingConfirmation = { kind: "push-device-off" };

/** Shared with the week start control, so the dialog names the day it does. */
export const WEEK_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function dayName(index: number): string {
  return WEEK_DAY_NAMES[index] ?? `day ${index}`;
}

/**
 * The confirmation a patch needs, or null to write it immediately.
 *
 * Only the costly direction is guarded. Consent turning on is asked about and
 * consent turning off is instant; notifications stopping is asked about and
 * notifications starting is instant. Asking about the harmless direction as
 * well is how a dialog turns into something people dismiss without reading,
 * which would leave the changes that matter no better protected than before.
 */
export function confirmationFor(
  patch: SettingsInput,
  current: Settings,
  detectedTimeZone: string | null,
): PendingConfirmation | null {
  // DF-PRV-010 requires AI processing to be an explicit, separate opt-in, and
  // DF-AIA-003 requires the consent text to say plainly that category names go
  // with the totals. A switch a thumb catches on the way past is neither.
  if (patch.ai_consent === true && !current.ai_consent) return { kind: "ai-consent-on" };

  // DF-SET-005: a setting that alters how existing data is interpreted warns
  // before applying, and DF-SET-011 names the time zone specifically. Both of
  // these silently regroup history, so an Undo offered afterwards would be a
  // fix for a problem the user has not noticed yet.
  if (patch.timezone !== undefined && patch.timezone !== current.timezone) {
    return {
      kind: "time-zone",
      current: current.timezone,
      chosen: patch.timezone,
      detected: detectedTimeZone,
    };
  }

  if (
    patch.week_starts_on !== undefined &&
    patch.week_starts_on !== current.week_starts_on
  ) {
    return {
      kind: "week-start",
      current: dayName(current.week_starts_on),
      chosen: dayName(patch.week_starts_on),
    };
  }

  // Turning these off produces no visible result at all. The evidence is a
  // reminder that never arrives, days later, long after any toast has gone.
  if (patch.reminders_enabled === false && current.reminders_enabled) {
    return { kind: "reminders-off" };
  }

  if (patch.push_enabled === false && current.push_enabled) return { kind: "push-off" };

  return null;
}

/**
 * The patch that puts back what was there.
 *
 * Built from the row as it stands before the write. Read afterwards it would
 * return the value just saved, and the Undo would restore the mistake.
 */
export function inverseOf(patch: SettingsInput, current: Settings): SettingsInput {
  return Object.fromEntries(
    Object.keys(patch).map((key) => [key, current[key as keyof Settings]]),
  ) as SettingsInput;
}

/**
 * Whether the toast for this patch should carry an Undo.
 *
 * The productivity sliders write on every step of a drag, so the value before
 * any single write is the previous notch rather than where the user set off
 * from. An Undo that returns a slider to 0.4 when it read 0.1 a moment ago is
 * worse than none, so those saves confirm themselves and stop there.
 */
export function offersUndo(patch: SettingsInput): boolean {
  return patch.productivity_weights === undefined;
}
