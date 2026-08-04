import { describe, expect, it } from "vitest";
import {
  countOverlaps,
  durationMinutes,
  elapsedMinutes,
  hasBlockingIssue,
  isDuplicate,
  splitAcrossLocalDays,
  validateMomentTimes,
} from "./moment-rules";

const NOW = new Date("2026-08-04T12:00:00Z");

function at(iso: string): Date {
  return new Date(iso);
}

describe("validateMomentTimes", () => {
  it("accepts an ordinary completed activity", () => {
    const issues = validateMomentTimes({
      startAt: at("2026-08-04T09:00:00Z"),
      endAt: at("2026-08-04T10:30:00Z"),
      now: NOW,
    });

    expect(issues).toEqual([]);
  });

  it("accepts a pending activity with no end time", () => {
    const issues = validateMomentTimes({
      startAt: at("2026-08-04T11:00:00Z"),
      endAt: null,
      now: NOW,
    });

    expect(issues).toEqual([]);
  });

  it("refuses an end time at or before the start", () => {
    const equal = validateMomentTimes({
      startAt: at("2026-08-04T09:00:00Z"),
      endAt: at("2026-08-04T09:00:00Z"),
      now: NOW,
    });

    expect(equal.map((issue) => issue.code)).toContain("END_BEFORE_START");
    expect(hasBlockingIssue(equal)).toBe(true);
  });

  it("refuses times beyond the drift tolerance but allows times inside it", () => {
    const withinTolerance = validateMomentTimes({
      startAt: new Date(NOW.getTime() + 3 * 60_000),
      endAt: null,
      now: NOW,
    });
    // A phone three minutes fast must not be told its data is invalid.
    expect(withinTolerance).toEqual([]);

    const beyondTolerance = validateMomentTimes({
      startAt: new Date(NOW.getTime() + 20 * 60_000),
      endAt: null,
      now: NOW,
    });
    expect(beyondTolerance.map((issue) => issue.code)).toContain("START_IN_FUTURE");
  });

  it("refuses anything longer than a day", () => {
    const issues = validateMomentTimes({
      startAt: at("2026-08-02T09:00:00Z"),
      endAt: at("2026-08-03T10:00:00Z"),
      now: NOW,
    });

    expect(issues.map((issue) => issue.code)).toContain("TOO_LONG");
  });

  it("reports every problem at once rather than one at a time", () => {
    const issues = validateMomentTimes({
      startAt: new Date(NOW.getTime() + 60 * 60_000),
      endAt: new Date(NOW.getTime() + 30 * 60_000),
      now: NOW,
    });

    // Fixing one error only to be shown the next is a miserable form to fill in.
    expect(issues.length).toBeGreaterThan(1);
  });
});

describe("durationMinutes and elapsedMinutes", () => {
  it("is null while pending, so nothing can mistake it for zero", () => {
    expect(durationMinutes(at("2026-08-04T09:00:00Z"), null)).toBeNull();
  });

  it("floors partial minutes", () => {
    expect(durationMinutes(at("2026-08-04T09:00:00Z"), at("2026-08-04T09:01:59Z"))).toBe(
      1,
    );
  });

  it("never reports negative elapsed time for a start slightly in the future", () => {
    expect(elapsedMinutes(new Date(NOW.getTime() + 60_000), NOW)).toBe(0);
  });
});

describe("splitAcrossLocalDays", () => {
  it("leaves a single-day activity on one day", () => {
    const slices = splitAcrossLocalDays(
      at("2026-08-04T09:00:00Z"),
      at("2026-08-04T11:00:00Z"),
      "UTC",
    );

    expect(slices).toEqual([{ date: "2026-08-04", minutes: 120 }]);
  });

  it("splits an overnight activity at local midnight", () => {
    // 22:30 to 01:30 UTC: 90 minutes either side of midnight.
    const slices = splitAcrossLocalDays(
      at("2026-08-04T22:30:00Z"),
      at("2026-08-05T01:30:00Z"),
      "UTC",
    );

    expect(slices).toEqual([
      { date: "2026-08-04", minutes: 90 },
      { date: "2026-08-05", minutes: 90 },
    ]);
  });

  it("splits at the user's midnight, not at UTC midnight", () => {
    // 20:00 to 23:00 UTC is 01:30 to 04:30 the next day in Kolkata, so all of it
    // belongs to the following local day and none of it splits.
    const slices = splitAcrossLocalDays(
      at("2026-08-04T20:00:00Z"),
      at("2026-08-04T23:00:00Z"),
      "Asia/Kolkata",
    );

    expect(slices).toEqual([{ date: "2026-08-05", minutes: 180 }]);
  });

  it("attributes an end exactly at midnight wholly to the earlier day", () => {
    const slices = splitAcrossLocalDays(
      at("2026-08-04T23:00:00Z"),
      at("2026-08-05T00:00:00Z"),
      "UTC",
    );

    // An empty 0-minute slice on the 5th would show a phantom entry on a day the
    // user did nothing.
    expect(slices).toEqual([{ date: "2026-08-04", minutes: 60 }]);
  });

  it("measures a pending activity up to now", () => {
    const slices = splitAcrossLocalDays(
      at("2026-08-04T10:00:00Z"),
      null,
      "UTC",
      at("2026-08-04T12:00:00Z"),
    );

    expect(slices).toEqual([{ date: "2026-08-04", minutes: 120 }]);
  });

  it("returns nothing when the end is not after the start", () => {
    expect(
      splitAcrossLocalDays(at("2026-08-04T10:00:00Z"), at("2026-08-04T10:00:00Z"), "UTC"),
    ).toEqual([]);
  });

  it("spans a multi-day activity across all three days", () => {
    const slices = splitAcrossLocalDays(
      at("2026-08-03T22:00:00Z"),
      at("2026-08-05T02:00:00Z"),
      "UTC",
    );

    expect(slices.map((slice) => slice.date)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
    expect(slices.reduce((sum, slice) => sum + slice.minutes, 0)).toBe(28 * 60);
  });
});

describe("countOverlaps", () => {
  const existing = [
    { id: "a", startAt: at("2026-08-04T09:00:00Z"), endAt: at("2026-08-04T10:00:00Z") },
    { id: "b", startAt: at("2026-08-04T09:30:00Z"), endAt: at("2026-08-04T11:00:00Z") },
  ];

  it("counts genuine overlaps", () => {
    const count = countOverlaps(
      { startAt: at("2026-08-04T09:45:00Z"), endAt: at("2026-08-04T10:15:00Z") },
      existing,
    );

    expect(count).toBe(2);
  });

  it("treats touching boundaries as not overlapping", () => {
    // Ending at 09:00 and starting at 09:00 is a handover, not a conflict.
    const count = countOverlaps(
      { startAt: at("2026-08-04T08:00:00Z"), endAt: at("2026-08-04T09:00:00Z") },
      existing,
    );

    expect(count).toBe(0);
  });

  it("excludes the activity being edited from its own overlap count", () => {
    const count = countOverlaps(
      { id: "a", startAt: at("2026-08-04T09:00:00Z"), endAt: at("2026-08-04T10:00:00Z") },
      existing,
    );

    expect(count).toBe(1);
  });

  it("treats a pending activity as running up to now", () => {
    const count = countOverlaps(
      { startAt: at("2026-08-04T10:30:00Z"), endAt: null },
      existing,
      at("2026-08-04T12:00:00Z"),
    );

    expect(count).toBe(1);
  });
});

describe("isDuplicate", () => {
  const existing = [
    { id: "a", categoryId: "cat-1", startAt: at("2026-08-04T09:00:00Z") },
  ];

  it("catches the same category at the same instant", () => {
    expect(
      isDuplicate({ categoryId: "cat-1", startAt: at("2026-08-04T09:00:00Z") }, existing),
    ).toBe(true);
  });

  it("allows a different category at the same instant", () => {
    expect(
      isDuplicate({ categoryId: "cat-2", startAt: at("2026-08-04T09:00:00Z") }, existing),
    ).toBe(false);
  });

  it("does not flag a record against itself", () => {
    expect(
      isDuplicate(
        { id: "a", categoryId: "cat-1", startAt: at("2026-08-04T09:00:00Z") },
        existing,
      ),
    ).toBe(false);
  });
});
