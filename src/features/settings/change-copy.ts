/**
 * The wording of each confirmation `change-guard.ts` asks for.
 *
 * Reached only through the deferred dialog, which is what keeps it out of the
 * settings first load. See the note at the top of `change-guard.ts`.
 *
 * Every one of these says what changes, what does not, and how to get back -
 * in that order. A dialog that only warns leaves the user guessing at the cost
 * of answering it, and guessing is what makes people cancel a change they
 * actually wanted.
 */

import type { PendingConfirmation } from "./change-guard";

/** The question put to the user, and the button that answers it. */
export interface ChangeConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
}

/**
 * The time zone question, which names the zone the device reports rather than
 * asking a bare "are you sure".
 *
 * Nearly every accidental change to this setting is someone reaching for the
 * control next to it, and nearly every deliberate one is someone who has
 * travelled or who works to a zone they are not sitting in. Both of them are
 * answered by seeing the three zones involved side by side, which a
 * confirmation that only repeats the question is not.
 */
function timeZoneCopy(
  current: string,
  chosen: string,
  detected: string | null,
): ChangeConfirmation {
  const title =
    detected === null
      ? `Set DayFlow to ${chosen}?`
      : detected === chosen
        ? `Your device reports ${detected}. Set DayFlow to it?`
        : `Your device reports ${detected}. Set DayFlow to ${chosen} instead?`;

  return {
    title,
    description: `Your days are counted in ${current} at the moment. Local Days, streaks and every chart are grouped by this time zone, so changing it re-boundaries the history you have already recorded: activities near midnight move to a different day, and some daily totals change with them.`,
    confirmLabel: `Use ${chosen}`,
  };
}

export function copyFor(pending: PendingConfirmation): ChangeConfirmation {
  switch (pending.kind) {
    case "ai-consent-on":
      return {
        title: "Turn on AI insights",
        // DF-AIA-003: the category names leaving with the totals is stated
        // here, because this dialog is now where the consent is actually given.
        description:
          "Aggregated totals per category, and the category names themselves, are sent to a third-party AI provider from this point on. Names on categories you have marked private are not sent, and neither are your notes or your email address. You can turn this off again at any time.",
        confirmLabel: "Turn on AI insights",
      };

    case "time-zone":
      return timeZoneCopy(pending.current, pending.chosen, pending.detected);

    case "week-start":
      return {
        title: `Start the week on ${pending.chosen}?`,
        description: `Weekly totals, the weekly review and week-based streaks are all counted from this day. Moving from ${pending.current} to ${pending.chosen} regroups weeks you have already recorded.`,
        confirmLabel: `Use ${pending.chosen}`,
      };

    case "reminders-off":
      return {
        title: "Turn off reminders",
        description:
          "DayFlow will stop reminding you about activities you have left open. Nothing already recorded changes, and you can turn reminders back on here whenever you want.",
        confirmLabel: "Turn off reminders",
      };

    case "push-off":
      return {
        title: "Turn off notifications",
        description:
          "Every device on this account stops receiving notifications. Reminders, reviews and long activity warnings all arrive that way, so this turns off all of them at once.",
        confirmLabel: "Turn off notifications",
      };

    case "push-device-off":
      return {
        title: "Turn off notifications on this device",
        description:
          "This device stops receiving notifications. Other devices you have enabled keep theirs, and you can enable this one again from this screen. Your browser will ask for permission again the next time.",
        confirmLabel: "Turn off",
      };
  }
}
