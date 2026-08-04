import { describe, expect, it } from "vitest";
import {
  autoCloseEndTime,
  buildReminderMessage,
  isReminderDue,
  isWithinQuietHours,
  MIN_REMINDER_INTERVAL_MINUTES,
  shouldAutoClose,
  shouldWarnLongActivity,
} from "./reminder-rules";

const NOW = new Date("2026-08-04T12:00:00Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

const quietOff = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timeZone: "UTC",
};

describe("isWithinQuietHours", () => {
  const overnight = { enabled: true, start: "22:00", end: "07:00", timeZone: "UTC" };

  it("is false when quiet hours are switched off", () => {
    expect(isWithinQuietHours(new Date("2026-08-04T23:00:00Z"), quietOff)).toBe(false);
  });

  it("handles a window that crosses midnight, which is the normal case", () => {
    expect(isWithinQuietHours(new Date("2026-08-04T23:00:00Z"), overnight)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-08-04T03:00:00Z"), overnight)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-08-04T12:00:00Z"), overnight)).toBe(false);
  });

  it("is inclusive at the start and exclusive at the end", () => {
    expect(isWithinQuietHours(new Date("2026-08-04T22:00:00Z"), overnight)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-08-04T07:00:00Z"), overnight)).toBe(false);
  });

  it("handles a same-day window", () => {
    const daytime = { enabled: true, start: "09:00", end: "17:00", timeZone: "UTC" };

    expect(isWithinQuietHours(new Date("2026-08-04T12:00:00Z"), daytime)).toBe(true);
    expect(isWithinQuietHours(new Date("2026-08-04T20:00:00Z"), daytime)).toBe(false);
  });

  it("evaluates the window in the user's timezone", () => {
    const kolkata = {
      enabled: true,
      start: "22:00",
      end: "07:00",
      timeZone: "Asia/Kolkata",
    };

    // 18:00 UTC is 23:30 in Kolkata: quiet there, mid-evening in UTC.
    const instant = new Date("2026-08-04T18:00:00Z");
    expect(isWithinQuietHours(instant, kolkata)).toBe(true);
    expect(isWithinQuietHours(instant, { ...kolkata, timeZone: "UTC" })).toBe(false);
  });

  it("treats an empty window as never quiet", () => {
    const degenerate = { enabled: true, start: "08:00", end: "08:00", timeZone: "UTC" };
    expect(isWithinQuietHours(NOW, degenerate)).toBe(false);
  });
});

describe("isReminderDue", () => {
  const base = {
    intervalMinutes: 60,
    remindersEnabled: true,
    quiet: quietOff,
    now: NOW,
  };

  it("does not remind before the first interval has passed", () => {
    expect(
      isReminderDue({ ...base, startAt: minutesAgo(30), lastReminderAt: null }),
    ).toBe(false);
  });

  it("reminds once an interval has passed since the start", () => {
    expect(
      isReminderDue({ ...base, startAt: minutesAgo(60), lastReminderAt: null }),
    ).toBe(true);
  });

  it("measures from the last reminder once one has been sent", () => {
    expect(
      isReminderDue({
        ...base,
        startAt: minutesAgo(200),
        lastReminderAt: minutesAgo(30),
      }),
    ).toBe(false);

    expect(
      isReminderDue({
        ...base,
        startAt: minutesAgo(200),
        lastReminderAt: minutesAgo(61),
      }),
    ).toBe(true);
  });

  it("never reminds when reminders are off", () => {
    expect(
      isReminderDue({
        ...base,
        remindersEnabled: false,
        startAt: minutesAgo(300),
        lastReminderAt: null,
      }),
    ).toBe(false);
  });

  it("skips reminders during quiet hours rather than queueing them", () => {
    // The suppressed reminder is dropped. Nothing here records it as pending, so
    // there is no way for six of them to arrive together at 07:00. DF-REM-008.
    expect(
      isReminderDue({
        ...base,
        startAt: minutesAgo(300),
        lastReminderAt: null,
        now: new Date("2026-08-04T23:30:00Z"),
        quiet: { enabled: true, start: "22:00", end: "07:00", timeZone: "UTC" },
      }),
    ).toBe(false);
  });

  it("clamps an interval below the minimum instead of honouring it", () => {
    // A stored value of 1 minute - from an older client or a direct API write -
    // must not be able to turn the product into a spam machine.
    expect(
      isReminderDue({
        ...base,
        intervalMinutes: 1,
        startAt: minutesAgo(5),
        lastReminderAt: null,
      }),
    ).toBe(false);

    expect(
      isReminderDue({
        ...base,
        intervalMinutes: 1,
        startAt: minutesAgo(MIN_REMINDER_INTERVAL_MINUTES),
        lastReminderAt: null,
      }),
    ).toBe(true);
  });
});

describe("shouldWarnLongActivity", () => {
  it("warns at the threshold", () => {
    expect(
      shouldWarnLongActivity({
        startAt: minutesAgo(180),
        warnedAt: null,
        warningMinutes: 180,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("warns exactly once", () => {
    expect(
      shouldWarnLongActivity({
        startAt: minutesAgo(400),
        warnedAt: minutesAgo(200),
        warningMinutes: 180,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("shouldAutoClose and autoCloseEndTime", () => {
  it("closes at the threshold when enabled", () => {
    expect(
      shouldAutoClose({
        startAt: minutesAgo(360),
        autoCloseEnabled: true,
        autoCloseMinutes: 360,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("never closes when disabled, however long it has run", () => {
    expect(
      shouldAutoClose({
        startAt: minutesAgo(5000),
        autoCloseEnabled: false,
        autoCloseMinutes: 360,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("writes an end time of exactly the threshold after the start", () => {
    // Predictable rather than "whenever the job happened to run", so the user can
    // see what was assumed and correct it.
    const start = new Date("2026-08-04T06:00:00Z");
    expect(autoCloseEndTime(start, 360).toISOString()).toBe("2026-08-04T12:00:00.000Z");
  });
});

describe("buildReminderMessage", () => {
  it("names the single open activity and how long it has run", () => {
    const message = buildReminderMessage(
      [{ categoryName: "Coding", startAt: minutesAgo(135) }],
      NOW,
    );

    expect(message.title).toBe("Still on Coding?");
    expect(message.body).toContain("2h 15m");
  });

  it("collapses several into one notification", () => {
    // Two notifications per sweep is how a user arrives at revoking permission.
    const message = buildReminderMessage(
      [
        { categoryName: "Coding", startAt: minutesAgo(200) },
        { categoryName: "Gym", startAt: minutesAgo(90) },
      ],
      NOW,
    );

    expect(message.title).toBe("2 activities still open");
    expect(message.body).toBe("Coding, Gym");
  });
});
