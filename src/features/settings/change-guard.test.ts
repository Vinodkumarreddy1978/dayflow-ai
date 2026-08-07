import { describe, expect, it } from "vitest";
import {
  confirmationFor,
  inverseOf,
  offersUndo,
  PUSH_DEVICE_OFF,
  type ChangeKind,
  type PendingConfirmation,
} from "./change-guard";
import { copyFor } from "./change-copy";
import type { Settings } from "@/lib/supabase/database.types";

/** Only the columns the guard reads. The rest of the row is irrelevant to it. */
const ROW = {
  user_id: "user-1",
  ai_consent: false,
  timezone: "Asia/Kolkata",
  week_starts_on: 1,
  reminders_enabled: true,
  push_enabled: true,
  theme: "dark",
  queue_limit: 2,
  productivity_weights: { work: 0.5 },
} as unknown as Settings;

const DEVICE = "Asia/Kolkata";

function row(overrides: Partial<Settings>): Settings {
  return { ...ROW, ...overrides };
}

describe("confirmationFor", () => {
  it("asks before AI consent is turned on", () => {
    expect(confirmationFor({ ai_consent: true }, ROW, DEVICE)).toEqual({
      kind: "ai-consent-on",
    });
  });

  it("turns AI consent off without asking", () => {
    // The direction that stops data leaving is never worth a dialog.
    expect(
      confirmationFor({ ai_consent: false }, row({ ai_consent: true }), DEVICE),
    ).toBeNull();
  });

  it("does not ask when consent is already on", () => {
    expect(
      confirmationFor({ ai_consent: true }, row({ ai_consent: true }), DEVICE),
    ).toBeNull();
  });

  it("asks before the time zone moves, carrying all three zones", () => {
    // DF-SET-011. The zone being left and the zone the device reports both
    // matter: together they are how the user recognises a change they did not
    // mean to make.
    expect(confirmationFor({ timezone: "Europe/London" }, ROW, DEVICE)).toEqual({
      kind: "time-zone",
      current: "Asia/Kolkata",
      chosen: "Europe/London",
      detected: DEVICE,
    });
  });

  it("still asks before the device zone has been read", () => {
    expect(confirmationFor({ timezone: "Europe/London" }, ROW, null)).toEqual({
      kind: "time-zone",
      current: "Asia/Kolkata",
      chosen: "Europe/London",
      detected: null,
    });
  });

  it("does not ask when the time zone control re-selects the current zone", () => {
    expect(confirmationFor({ timezone: "Asia/Kolkata" }, ROW, DEVICE)).toBeNull();
  });

  it("asks before the week start moves, naming both days", () => {
    // DF-SET-005 names week start alongside the time zone: both regroup data
    // that is already recorded.
    expect(confirmationFor({ week_starts_on: 0 }, ROW, DEVICE)).toEqual({
      kind: "week-start",
      current: "Monday",
      chosen: "Sunday",
    });
  });

  it("asks before reminders and notifications are turned off, not on", () => {
    expect(confirmationFor({ reminders_enabled: false }, ROW, DEVICE)).toEqual({
      kind: "reminders-off",
    });
    expect(confirmationFor({ push_enabled: false }, ROW, DEVICE)).toEqual({
      kind: "push-off",
    });

    expect(
      confirmationFor(
        { reminders_enabled: true },
        row({ reminders_enabled: false }),
        DEVICE,
      ),
    ).toBeNull();
    expect(
      confirmationFor({ push_enabled: true }, row({ push_enabled: false }), DEVICE),
    ).toBeNull();
  });

  it("applies an ordinary setting without asking", () => {
    expect(confirmationFor({ theme: "light" }, ROW, DEVICE)).toBeNull();
    expect(confirmationFor({ queue_limit: 4 }, ROW, DEVICE)).toBeNull();
  });
});

describe("copyFor", () => {
  const EVERY_KIND: PendingConfirmation[] = [
    { kind: "ai-consent-on" },
    {
      kind: "time-zone",
      current: "Europe/London",
      chosen: "America/New_York",
      detected: "Asia/Kolkata",
    },
    { kind: "week-start", current: "Monday", chosen: "Sunday" },
    { kind: "reminders-off" },
    { kind: "push-off" },
    PUSH_DEVICE_OFF,
  ];

  it("words every kind the guard can return", () => {
    // Listed rather than derived, so that adding a kind without wording it is a
    // failure here rather than an empty dialog in front of a user.
    const kinds: ChangeKind[] = [
      "ai-consent-on",
      "time-zone",
      "week-start",
      "reminders-off",
      "push-off",
      "push-device-off",
    ];

    expect(EVERY_KIND.map((pending) => pending.kind)).toEqual(kinds);

    for (const pending of EVERY_KIND) {
      const confirmation = copyFor(pending);
      expect(confirmation.title.length).toBeGreaterThan(0);
      expect(confirmation.description.length).toBeGreaterThan(0);
      expect(confirmation.confirmLabel.length).toBeGreaterThan(0);
    }
  });

  it("names the zone the device reports and the zone being chosen", () => {
    const confirmation = copyFor({
      kind: "time-zone",
      current: "Europe/London",
      chosen: "America/New_York",
      detected: "Asia/Kolkata",
    });

    expect(confirmation.title).toBe(
      "Your device reports Asia/Kolkata. Set DayFlow to America/New_York instead?",
    );
    // The zone being left belongs in the consequence, not the question.
    expect(confirmation.description).toContain("Europe/London");
    expect(confirmation.confirmLabel).toBe("Use America/New_York");
  });

  it("does not offer the device zone as an alternative to itself", () => {
    // The travel notice offers exactly this, and "set it to New York instead of
    // New York" would read as a mistake by the app.
    expect(
      copyFor({
        kind: "time-zone",
        current: "Europe/London",
        chosen: "America/New_York",
        detected: "America/New_York",
      }).title,
    ).toBe("Your device reports America/New_York. Set DayFlow to it?");
  });

  it("asks plainly when the device zone is not known yet", () => {
    expect(
      copyFor({
        kind: "time-zone",
        current: "Europe/London",
        chosen: "America/New_York",
        detected: null,
      }).title,
    ).toBe("Set DayFlow to America/New_York?");
  });

  it("says the time zone re-boundaries what is already recorded", () => {
    // DF-SET-011 requires the warning to be about historical day grouping,
    // which is the part a bare "are you sure" leaves out.
    const description = copyFor({
      kind: "time-zone",
      current: "Europe/London",
      chosen: "America/New_York",
      detected: null,
    }).description;

    expect(description).toContain("Local Days");
    expect(description).toContain("already recorded");
  });

  it("says plainly that category names go with the totals", () => {
    // DF-AIA-003 requires it of the consent text, and this dialog is now where
    // the consent is given.
    expect(copyFor({ kind: "ai-consent-on" }).description).toContain("category names");
  });

  it("keeps every confirmation to plain, unraised copy", () => {
    for (const pending of EVERY_KIND) {
      for (const text of Object.values(copyFor(pending))) {
        // A dialog that raises its voice reads as an accusation, and anything
        // outside printable ASCII here is an emoji or a smart quote that the
        // rest of the product's copy does not use.
        expect(text).not.toContain("!");
        expect(text).toMatch(/^[\x20-\x7E]+$/);
      }
    }
  });
});

describe("inverseOf", () => {
  it("puts back the value every key in the patch had", () => {
    expect(inverseOf({ theme: "light", queue_limit: 5 }, ROW)).toEqual({
      theme: "dark",
      queue_limit: 2,
    });
  });

  it("touches nothing the patch did not", () => {
    // A pair written together has to be undone together, but an Undo that also
    // reset columns the user never touched would be a second mistake.
    expect(Object.keys(inverseOf({ theme: "light" }, ROW))).toEqual(["theme"]);
  });
});

describe("offersUndo", () => {
  it("offers Undo for a discrete change", () => {
    expect(offersUndo({ theme: "light" })).toBe(true);
  });

  it("withholds it from the productivity sliders", () => {
    // They write on every step of a drag, so "previous" is the notch before
    // this one rather than where the user started.
    expect(offersUndo({ productivity_weights: { work: 0.2 } })).toBe(false);
  });
});
