import { describe, expect, it } from "vitest";
import {
  canCreatePending,
  DEFAULT_QUEUE_LIMIT,
  isOverCapacity,
  queueCapacity,
  sortPendingByAge,
  urgencyState,
} from "./queue-rules";

const NOW = new Date("2026-08-04T12:00:00Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

describe("queueCapacity", () => {
  it("reports free slots and fullness", () => {
    expect(queueCapacity(0, 2)).toEqual({ used: 0, limit: 2, free: 2, isFull: false });
    expect(queueCapacity(2, 2)).toEqual({ used: 2, limit: 2, free: 0, isFull: true });
  });

  it("never reports negative free slots after the limit is lowered", () => {
    // Someone with 4 open activities who lowers their limit to 2 must not see
    // "-2 slots free".
    expect(queueCapacity(4, 2).free).toBe(0);
  });
});

describe("canCreatePending", () => {
  it("allows a new activity below the limit", () => {
    expect(canCreatePending(1, DEFAULT_QUEUE_LIMIT).allowed).toBe(true);
  });

  it("refuses at the limit, which is the whole mechanic", () => {
    const decision = canCreatePending(2, 2);

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("QUEUE_LIMIT_REACHED");
    // The message has to say what to do, not just that something is wrong.
    expect(decision.message).toContain("Close one");
  });

  it("refuses when already over the limit", () => {
    expect(canCreatePending(5, 2).allowed).toBe(false);
  });

  it("uses singular wording when the limit is one", () => {
    expect(canCreatePending(1, 1).message).toContain("an activity open");
  });
});

describe("isOverCapacity", () => {
  it("is true only when the count exceeds the limit", () => {
    // Lowering the limit is allowed and closes nothing, so this state is normal
    // and must be representable rather than prevented. DF-QUE-007.
    expect(isOverCapacity(3, 2)).toBe(true);
    expect(isOverCapacity(2, 2)).toBe(false);
  });
});

describe("urgencyState", () => {
  const thresholds = {
    warningMinutes: 180,
    autoCloseMinutes: 360,
    autoCloseEnabled: true,
  };

  it("is normal before the warning threshold", () => {
    expect(urgencyState(minutesAgo(120), thresholds, NOW)).toBe("normal");
  });

  it("needs attention at exactly the warning threshold", () => {
    expect(urgencyState(minutesAgo(180), thresholds, NOW)).toBe("needs_attention");
  });

  it("stays at needs attention past the close threshold while auto-close is on", () => {
    // With auto-close enabled the scheduled job would already have closed this,
    // so claiming "overdue" would describe a state the system does not allow.
    expect(urgencyState(minutesAgo(400), thresholds, NOW)).toBe("needs_attention");
  });

  it("becomes overdue past the close threshold when auto-close is off", () => {
    expect(
      urgencyState(minutesAgo(400), { ...thresholds, autoCloseEnabled: false }, NOW),
    ).toBe("overdue");
  });
});

describe("sortPendingByAge", () => {
  it("puts the oldest first, because that memory is the most at risk", () => {
    const sorted = sortPendingByAge([
      { start_at: "2026-08-04T11:00:00Z", id: "new" },
      { start_at: "2026-08-04T08:00:00Z", id: "old" },
      { start_at: "2026-08-04T10:00:00Z", id: "mid" },
    ]);

    expect(sorted.map((moment) => moment.id)).toEqual(["old", "mid", "new"]);
  });

  it("does not mutate its input", () => {
    const input = [
      { start_at: "2026-08-04T11:00:00Z" },
      { start_at: "2026-08-04T08:00:00Z" },
    ];
    const copy = [...input];

    sortPendingByAge(input);

    expect(input).toEqual(copy);
  });
});
