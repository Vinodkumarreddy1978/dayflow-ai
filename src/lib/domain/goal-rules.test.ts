import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calculateProductivityScore,
  calculateStreak,
  clampWeight,
  goalProgress,
  isGoalMet,
  isStreakDay,
  type DayResult,
} from "./goal-rules";
import { addDays } from "./timezone";

/**
 * A recorded day. `momentCount` defaults to 1 because the interesting case is
 * almost always a day the user was present for; the days with none are spelled
 * out at each call site, which is where the reader needs to see them.
 */
function day(date: string, achievedMinutes: number, momentCount = 1): DayResult {
  return { date, achievedMinutes, momentCount };
}

/** A run of consecutive Local Days, ending on `lastDate`. */
function run(lastDate: string, count: number, template: Omit<DayResult, "date">) {
  return Array.from({ length: count }, (_, index) => ({
    date: addDays(lastDate, index - (count - 1)),
    ...template,
  }));
}

describe("isGoalMet", () => {
  it("meets an at_least goal at or above the target", () => {
    expect(isGoalMet(180, 180, "at_least")).toBe(true);
    expect(isGoalMet(179, 180, "at_least")).toBe(false);
  });

  it("meets an at_most goal at or below the target, including zero", () => {
    expect(isGoalMet(0, 60, "at_most")).toBe(true);
    expect(isGoalMet(60, 60, "at_most")).toBe(true);
    expect(isGoalMet(61, 60, "at_most")).toBe(false);
  });
});

describe("isStreakDay", () => {
  const target = 60;

  it("counts an at_most day the user recorded and stayed under, including zero minutes", () => {
    // DF-GOA-032 and acceptance criterion 3: zero minutes *of that category* on
    // a day that was recorded is the case this protects.
    expect(isStreakDay(day("2026-08-03", 0, 6), target, "at_most")).toBe(true);
    expect(isStreakDay(day("2026-08-03", 60, 6), target, "at_most")).toBe(true);
    expect(isStreakDay(day("2026-08-03", 61, 6), target, "at_most")).toBe(false);
  });

  it("refuses an at_most day with nothing recorded at all", () => {
    // DF-GOA-037. Zero minutes because you did not open the application is not
    // the same claim as zero minutes because you did not do the thing, and
    // treating them alike is what produced a 731 day streak on a new account.
    expect(isStreakDay(day("2026-08-03", 0, 0), target, "at_most")).toBe(false);
  });

  it("refuses an at_least day with nothing recorded, per DF-GOA-033", () => {
    expect(isStreakDay(day("2026-08-03", 0, 0), target, "at_least")).toBe(false);
    expect(isStreakDay(day("2026-08-03", 90, 2), target, "at_least")).toBe(true);
  });
});

describe("calculateStreak", () => {
  const target = 60;

  it("counts a run of met days", () => {
    const result = calculateStreak(
      [day("2026-08-01", 90), day("2026-08-02", 70), day("2026-08-03", 60)],
      target,
      "at_least",
    );

    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it("does not break an at_least streak on today, which is still in progress", () => {
    // A 40-day streak reset to zero at 00:01 reads as an accusation, not a bug.
    const result = calculateStreak(
      [day("2026-08-01", 90), day("2026-08-02", 90), day("2026-08-03", 0, 0)],
      target,
      "at_least",
    );

    expect(result.current).toBe(2);
  });

  it("does break an at_least streak on a missed day that is not today", () => {
    const result = calculateStreak(
      [day("2026-08-01", 90), day("2026-08-02", 0, 0), day("2026-08-03", 90)],
      target,
      "at_least",
    );

    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });

  it("breaks an at_most streak today, because exceeding it has already happened", () => {
    // Unlike at_least, there is no chance of the day improving: the minutes are
    // already spent.
    const result = calculateStreak(
      [day("2026-08-01", 10), day("2026-08-02", 10), day("2026-08-03", 500)],
      target,
      "at_most",
    );

    expect(result.current).toBe(0);
  });

  it("does not break an at_most streak on a today with nothing recorded yet", () => {
    // The counterpart of the case above. At 09:00 the user has recorded nothing,
    // which is not yet a failure of a "keep under" goal - the day has not
    // happened. DF-GOA-036.
    const result = calculateStreak(
      [day("2026-08-01", 10, 4), day("2026-08-02", 10, 4), day("2026-08-03", 0, 0)],
      target,
      "at_most",
    );

    expect(result.current).toBe(2);
  });

  it("remembers the longest streak even after it is broken", () => {
    const result = calculateStreak(
      [
        day("2026-08-01", 90),
        day("2026-08-02", 90),
        day("2026-08-03", 90),
        day("2026-08-04", 0, 0),
        day("2026-08-05", 90),
      ],
      target,
      "at_least",
    );

    expect(result.longest).toBe(3);
    expect(result.current).toBe(1);
  });

  it("returns zeroes for no data rather than throwing", () => {
    expect(calculateStreak([], target, "at_least")).toEqual({ current: 0, longest: 0 });
  });

  /**
   * The reported defect, in the three shapes it takes.
   *
   * A "keep under" goal is satisfied by doing nothing, so any rule that counts
   * unrecorded days turns a streak into a measure of how long the account has
   * existed. The live symptom was "731 day streak, Best: 731 days" on an
   * account created that morning - 731 being the length of the scan loop in
   * migration 0010 and nothing to do with the user.
   */
  describe("a keep-under goal on an account with no history", () => {
    it("shows a one day streak on the day the account was created, not 731", () => {
      // The exact state the defect was reported in: 19 minutes against a one
      // hour "keep under" goal, on an account created that morning. One day is
      // the honest answer - the user did record, and did stay under.
      const result = calculateStreak([day("2026-08-06", 19, 1)], target, "at_most");

      expect(result).toEqual({ current: 1, longest: 1 });
    });

    it("shows no streak at all before anything has been recorded", () => {
      const result = calculateStreak([day("2026-08-06", 0, 0)], target, "at_most");

      expect(result).toEqual({ current: 0, longest: 0 });
    });

    it("does not accrue a streak across two years of days that never happened", () => {
      // The exact regression. Every one of these days is under the target
      // because nothing was recorded on any of them.
      const empty = run("2026-08-06", 731, { achievedMinutes: 0, momentCount: 0 });
      const result = calculateStreak(empty, target, "at_most");

      expect(result).toEqual({ current: 0, longest: 0 });
    });
  });

  describe("a keep-under goal with gap days", () => {
    it("does not bridge a gap in the record", () => {
      // Recorded, under target, on all three days - but nothing at all on the
      // 3rd and 4th. The run either side must not be reported as five days.
      const result = calculateStreak(
        [day("2026-08-01", 10, 5), day("2026-08-02", 10, 5), day("2026-08-05", 10, 5)],
        target,
        "at_most",
      );

      expect(result.current).toBe(1);
      expect(result.longest).toBe(2);
    });

    it("breaks on an unrecorded day that is present in the range", () => {
      const result = calculateStreak(
        [
          day("2026-08-01", 10, 5),
          day("2026-08-02", 10, 5),
          day("2026-08-03", 0, 0),
          day("2026-08-04", 10, 5),
          day("2026-08-05", 10, 5),
        ],
        target,
        "at_most",
      );

      expect(result.current).toBe(2);
      expect(result.longest).toBe(2);
    });
  });

  describe("a genuine consecutive run", () => {
    it("counts every recorded day the user stayed under the target", () => {
      const kept = run("2026-08-06", 12, { achievedMinutes: 19, momentCount: 4 });
      const result = calculateStreak(kept, target, "at_most");

      expect(result).toEqual({ current: 12, longest: 12 });
    });

    it("counts a run where the target category was recorded as zero throughout", () => {
      // The user tracked their days and simply did none of the thing they were
      // avoiding. That is the streak DF-GOA-032 exists to award.
      const kept = run("2026-08-06", 9, { achievedMinutes: 0, momentCount: 7 });

      expect(calculateStreak(kept, target, "at_most")).toEqual({
        current: 9,
        longest: 9,
      });
    });

    it("counts a run of met days for an at_least goal", () => {
      const kept = run("2026-08-06", 15, { achievedMinutes: 75, momentCount: 3 });

      expect(calculateStreak(kept, target, "at_least")).toEqual({
        current: 15,
        longest: 15,
      });
    });
  });
});

/**
 * The number on the Goals screen comes from `public.get_streak`, not from
 * `calculateStreak` - `useGoals` calls the RPC because the database owns the
 * midnight-split attribution. The tests above therefore cannot fail if the SQL
 * regresses, so these assert the two rules that mattered are still expressed in
 * the migration that fixed them.
 *
 * Coarse on purpose. This is a tripwire for the specific mistake that shipped,
 * not a second implementation of the streak.
 */
describe("the SQL the Goals screen actually uses", () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL("../../../supabase/migrations/0016_streak_semantics.sql", import.meta.url),
    ),
    "utf8",
  );

  it("requires a recorded Moment before a day can count", () => {
    expect(sql).toMatch(/moment_count\s*>\s*0/);
  });

  it("bounds the scan by the account's own creation date", () => {
    expect(sql).toContain("from public.profiles p");
    expect(sql).toMatch(/generate_series\(v_first_day, v_today/);
  });

  it("no longer walks a fixed two-year window", () => {
    // `v_scan_limit integer := 730` with `for i in 0 .. v_scan_limit` is what
    // produced 731. Nothing may reintroduce a scan bound that is not the
    // account's history.
    expect(sql).not.toContain("v_scan_limit");
    expect(sql).not.toMatch(/for\s+i\s+in\s+0\s*\.\./);
  });
});

describe("goalProgress", () => {
  it("caps the ratio at one for rendering while keeping the real minutes", () => {
    const progress = goalProgress(300, 60, "at_least");

    expect(progress.ratio).toBe(1);
    expect(progress.achievedMinutes).toBe(300);
    expect(progress.met).toBe(true);
  });

  it("does not divide by zero for a zero target", () => {
    expect(goalProgress(30, 0, "at_least").ratio).toBe(0);
  });
});

describe("calculateProductivityScore", () => {
  it("returns null for a day with no data, not zero", () => {
    // Scoring an unrecorded day as zero teaches people to record defensively,
    // which corrupts the dataset the product depends on. DF-GOA-054.
    expect(calculateProductivityScore([], { work: 1 })).toBeNull();
  });

  it("returns 50 when nothing is weighted", () => {
    const score = calculateProductivityScore(
      [{ parentCategoryId: "unweighted", minutes: 300 }],
      {},
    );

    expect(score).toBe(50);
  });

  it("reaches 100 when all time is maximally valued", () => {
    const score = calculateProductivityScore(
      [{ parentCategoryId: "learning", minutes: 240 }],
      { learning: 1 },
    );

    expect(score).toBe(100);
  });

  it("is pulled down by negatively weighted time", () => {
    const score = calculateProductivityScore(
      [
        { parentCategoryId: "work", minutes: 240 },
        { parentCategoryId: "distracted", minutes: 240 },
      ],
      { work: 1, distracted: -1 },
    );

    expect(score).toBe(50);
  });

  it("clamps rather than reporting a negative score", () => {
    const score = calculateProductivityScore(
      [{ parentCategoryId: "distracted", minutes: 600 }],
      { distracted: -1 },
    );

    expect(score).toBe(0);
  });

  it("is unaffected by the length of the day, only its composition", () => {
    const short = calculateProductivityScore(
      [
        { parentCategoryId: "work", minutes: 60 },
        { parentCategoryId: "distracted", minutes: 30 },
      ],
      { work: 1, distracted: -1 },
    );

    const long = calculateProductivityScore(
      [
        { parentCategoryId: "work", minutes: 600 },
        { parentCategoryId: "distracted", minutes: 300 },
      ],
      { work: 1, distracted: -1 },
    );

    // A short honest day must not score worse than a long one with the same mix.
    expect(short).toBe(long);
  });
});

describe("clampWeight", () => {
  it("keeps weights inside the range the SQL scoring function expects", () => {
    expect(clampWeight(5)).toBe(1);
    expect(clampWeight(-5)).toBe(-1);
    expect(clampWeight(0.4)).toBe(0.4);
  });
});
