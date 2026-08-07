import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  eachDay,
  endOfLocalDay,
  localDateString,
  minutesIntoLocalDay,
  parseClockTime,
  shouldAdoptBrowserTimeZone,
  startOfLocalDay,
  wallTimeToInstant,
} from "./timezone";

/**
 * Every test here uses an explicit timezone and an explicit instant. None of
 * them read the system clock or the machine's local zone, so they behave the same
 * on a laptop in Bengaluru and a CI runner in UTC. DF-TST-031.
 */
describe("shouldAdoptBrowserTimeZone", () => {
  it("leaves a zone the user chose alone, however far the device has travelled", () => {
    // The bug this rule exists for: the settings screen wrote the choice, the
    // app frame saw that the browser disagreed with the value it had just
    // written, and put the device's zone straight back. The timezone could not
    // be changed at all.
    expect(
      shouldAdoptBrowserTimeZone(
        { timezone: "America/New_York", timezone_source: "user" },
        "Asia/Kolkata",
      ),
    ).toBe(false);
  });

  it("adopts the device zone when nobody has chosen one", () => {
    // Someone who has genuinely relocated and never overridden the setting.
    // Without this they keep seeing their days boundaried by the zone they left.
    expect(
      shouldAdoptBrowserTimeZone(
        { timezone: "Europe/London", timezone_source: "auto" },
        "Asia/Kolkata",
      ),
    ).toBe(true);
  });

  it("does nothing once the detected zone is already stored", () => {
    // The write must settle. A rule that stayed true after its own correction
    // would be a loop rather than a correction.
    expect(
      shouldAdoptBrowserTimeZone(
        { timezone: "Asia/Kolkata", timezone_source: "auto" },
        "Asia/Kolkata",
      ),
    ).toBe(false);
  });

  it("waits for the row and for a zone it can trust", () => {
    expect(shouldAdoptBrowserTimeZone(undefined, "Asia/Kolkata")).toBe(false);
    expect(
      shouldAdoptBrowserTimeZone(
        { timezone: "Europe/London", timezone_source: "auto" },
        "",
      ),
    ).toBe(false);
  });

  it("treats a source it does not recognise as chosen", () => {
    // Overwriting on the strength of a value this code cannot interpret is the
    // one outcome that loses something the user cannot get back.
    expect(
      shouldAdoptBrowserTimeZone(
        { timezone: "Europe/London", timezone_source: "imported" },
        "Asia/Kolkata",
      ),
    ).toBe(false);
  });
});

describe("localDateString", () => {
  it("returns the local day, not the UTC day", () => {
    // 18:30 UTC is already the next day in Kolkata (UTC+5:30).
    const instant = new Date("2026-08-04T18:30:00Z");

    expect(localDateString(instant, "UTC")).toBe("2026-08-04");
    expect(localDateString(instant, "Asia/Kolkata")).toBe("2026-08-05");
  });

  it("returns the previous day for zones behind UTC", () => {
    const instant = new Date("2026-08-04T03:00:00Z");
    expect(localDateString(instant, "America/Los_Angeles")).toBe("2026-08-03");
  });
});

describe("startOfLocalDay", () => {
  it("accounts for a fixed offset", () => {
    // Midnight in Kolkata is 18:30 UTC the day before.
    expect(startOfLocalDay("2026-08-05", "Asia/Kolkata").toISOString()).toBe(
      "2026-08-04T18:30:00.000Z",
    );
  });

  it("resolves the offset from the date, not from today", () => {
    // London is UTC+1 in August and UTC+0 in January. A single cached offset
    // would put one of these an hour out.
    expect(startOfLocalDay("2026-08-05", "Europe/London").toISOString()).toBe(
      "2026-08-04T23:00:00.000Z",
    );
    expect(startOfLocalDay("2026-01-05", "Europe/London").toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });

  it("survives the spring-forward day, when local midnight still exists", () => {
    // Clocks go forward at 01:00 on 29 March 2026 in London. Midnight is real.
    expect(startOfLocalDay("2026-03-29", "Europe/London").toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    );
  });

  it("gives a 23-hour day when the clocks go forward", () => {
    const start = startOfLocalDay("2026-03-29", "Europe/London");
    const end = endOfLocalDay("2026-03-29", "Europe/London");
    const hours = (end.getTime() - start.getTime()) / 3_600_000;

    // Assuming 24 is exactly the bug this function exists to prevent.
    expect(hours).toBe(23);
  });

  it("gives a 25-hour day when the clocks go back", () => {
    const start = startOfLocalDay("2026-10-25", "Europe/London");
    const end = endOfLocalDay("2026-10-25", "Europe/London");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });
});

describe("wallTimeToInstant", () => {
  it("interprets a datetime-local value in the given zone, not the machine's", () => {
    expect(wallTimeToInstant("2026-08-04T14:30", "Asia/Kolkata").toISOString()).toBe(
      "2026-08-04T09:00:00.000Z",
    );
    expect(wallTimeToInstant("2026-08-04T14:30", "UTC").toISOString()).toBe(
      "2026-08-04T14:30:00.000Z",
    );
  });

  it("accepts a value that already carries seconds", () => {
    expect(wallTimeToInstant("2026-08-04T14:30:45", "UTC").toISOString()).toBe(
      "2026-08-04T14:30:45.000Z",
    );
  });

  it("returns an invalid date for unparseable input rather than throwing", () => {
    expect(Number.isNaN(wallTimeToInstant("not a time", "UTC").getTime())).toBe(true);
  });
});

describe("addDays and eachDay", () => {
  it("crosses month and year boundaries in calendar terms", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("is inclusive at both ends", () => {
    expect(eachDay("2026-08-03", "2026-08-05")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("returns nothing for an inverted range instead of looping forever", () => {
    expect(eachDay("2026-08-05", "2026-08-03")).toEqual([]);
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-08-01", "2026-08-08")).toBe(7);
  });
});

describe("minutesIntoLocalDay", () => {
  it("measures from local midnight", () => {
    const instant = new Date("2026-08-04T09:00:00Z");
    expect(minutesIntoLocalDay(instant, "UTC")).toBe(9 * 60);
    // 09:00 UTC is 14:30 in Kolkata.
    expect(minutesIntoLocalDay(instant, "Asia/Kolkata")).toBe(14 * 60 + 30);
  });
});

describe("parseClockTime", () => {
  it("handles both HH:MM and the HH:MM:SS Postgres returns for a time column", () => {
    expect(parseClockTime("22:00")).toBe(1320);
    expect(parseClockTime("22:00:00")).toBe(1320);
    expect(parseClockTime("07:30")).toBe(450);
  });
});
