import { describe, expect, it } from "vitest";
import {
  calculateProductivityScore,
  calculateStreak,
  clampWeight,
  goalProgress,
  isGoalMet,
} from "./goal-rules";

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

describe("calculateStreak", () => {
  const target = 60;

  it("counts a run of met days", () => {
    const result = calculateStreak(
      [
        { date: "2026-08-01", achievedMinutes: 90 },
        { date: "2026-08-02", achievedMinutes: 70 },
        { date: "2026-08-03", achievedMinutes: 60 },
      ],
      target,
      "at_least",
    );

    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it("does not break an at_least streak on today, which is still in progress", () => {
    // A 40-day streak reset to zero at 00:01 reads as an accusation, not a bug.
    const result = calculateStreak(
      [
        { date: "2026-08-01", achievedMinutes: 90 },
        { date: "2026-08-02", achievedMinutes: 90 },
        { date: "2026-08-03", achievedMinutes: 0 },
      ],
      target,
      "at_least",
    );

    expect(result.current).toBe(2);
  });

  it("does break an at_least streak on a missed day that is not today", () => {
    const result = calculateStreak(
      [
        { date: "2026-08-01", achievedMinutes: 90 },
        { date: "2026-08-02", achievedMinutes: 0 },
        { date: "2026-08-03", achievedMinutes: 90 },
      ],
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
      [
        { date: "2026-08-01", achievedMinutes: 10 },
        { date: "2026-08-02", achievedMinutes: 10 },
        { date: "2026-08-03", achievedMinutes: 500 },
      ],
      target,
      "at_most",
    );

    expect(result.current).toBe(0);
  });

  it("remembers the longest streak even after it is broken", () => {
    const result = calculateStreak(
      [
        { date: "2026-08-01", achievedMinutes: 90 },
        { date: "2026-08-02", achievedMinutes: 90 },
        { date: "2026-08-03", achievedMinutes: 90 },
        { date: "2026-08-04", achievedMinutes: 0 },
        { date: "2026-08-05", achievedMinutes: 90 },
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
