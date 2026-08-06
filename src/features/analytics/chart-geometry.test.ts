import { describe, expect, it } from "vitest";
import { formatDuration, formatDurationLong } from "@/lib/format";
import {
  contrastRatio,
  estimateTextWidth,
  MIN_LABEL_CONTRAST,
  readableInkOn,
  resolveBarOrientation,
  resolveLabelPlacement,
  truncateToWidth,
  type LabelGeometry,
} from "./chart-geometry";

/**
 * A comfortable horizontal bar: long enough and thick enough for its label,
 * with room to spare beyond it. Each test overrides only the thing it is about.
 */
const HORIZONTAL: LabelGeometry = {
  orientation: "horizontal",
  value: 135,
  barExtent: 220,
  freeExtent: 120,
  bandExtent: 26,
  text: "2h 15m",
  fill: "#4f46e5",
};

/** The same for a column. */
const VERTICAL: LabelGeometry = {
  orientation: "vertical",
  value: 135,
  barExtent: 140,
  freeExtent: 60,
  bandExtent: 72,
  text: "2h 15m",
  fill: "#4f46e5",
};

describe("bar label text", () => {
  /**
   * The labels reuse formatDuration rather than carrying their own formatter,
   * so this is as much a guard against a second convention appearing as it is a
   * test of the numbers. "1hr" was what the user asked for; "1h" is what the
   * summary cards, the breakdown list and the tooltip have always said.
   */
  it("writes an hour as the rest of the product writes it", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(1440)).toBe("24h");
  });

  it("keeps minutes on their own below the hour", () => {
    expect(formatDuration(1)).toBe("1m");
    expect(formatDuration(19)).toBe("19m");
    expect(formatDuration(59)).toBe("59m");
  });

  it("combines the two where both are present", () => {
    expect(formatDuration(61)).toBe("1h 1m");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("collapses zero and anything under a minute to 0m rather than 0.4m", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(0.4)).toBe("0m");
    expect(formatDuration(0.999)).toBe("0m");
  });

  it("gives the screen reader table words rather than abbreviations", () => {
    // "2h" is announced as "two h" by most screen readers.
    expect(formatDurationLong(0)).toBe("0 minutes");
    expect(formatDurationLong(60)).toBe("1 hour");
    expect(formatDurationLong(135)).toBe("2 hours 15 minutes");
  });
});

describe("resolveLabelPlacement, horizontal bars", () => {
  it("puts the label inside a bar with room for it", () => {
    expect(resolveLabelPlacement(HORIZONTAL)).toBe("inside");
  });

  it("moves the label outside a bar too short to hold it", () => {
    // Eighteen pixels of bar cannot contain "2h 15m" without the text running
    // out through the rounded end of it.
    expect(resolveLabelPlacement({ ...HORIZONTAL, barExtent: 18 })).toBe("outside");
  });

  it("drops the label when it fits neither inside nor beside the bar", () => {
    expect(resolveLabelPlacement({ ...HORIZONTAL, barExtent: 6, freeExtent: 10 })).toBe(
      "hidden",
    );
  });

  it("drops the label when the bar is thinner than the type", () => {
    // Twelve categories in a 288px chart is about 24px a row; squeeze it
    // further and 11px text no longer sits within the bar's thickness.
    expect(resolveLabelPlacement({ ...HORIZONTAL, bandExtent: 9 })).toBe("hidden");
  });

  it("labels nothing on a zero bar, however much space surrounds it", () => {
    // There is no bar to label, and "0m" against the axis reads as a fault.
    expect(
      resolveLabelPlacement({
        ...HORIZONTAL,
        value: 0,
        barExtent: 0,
        freeExtent: 400,
      }),
    ).toBe("hidden");
  });

  it("labels a one minute bar outside itself rather than over its own end", () => {
    expect(
      resolveLabelPlacement({
        ...HORIZONTAL,
        value: 1,
        text: "1m",
        barExtent: 2,
        freeExtent: 300,
      }),
    ).toBe("outside");
  });
});

describe("resolveLabelPlacement, vertical columns", () => {
  it("puts the label inside a column tall enough for a line of text", () => {
    expect(resolveLabelPlacement(VERTICAL)).toBe("inside");
  });

  it("does not need a column as long as the string, only as tall as the line", () => {
    // "2h 15m" is about 38px wide but sits across a column, not along it.
    expect(resolveLabelPlacement({ ...VERTICAL, barExtent: 24 })).toBe("inside");
  });

  it("lifts the label above a short column", () => {
    expect(resolveLabelPlacement({ ...VERTICAL, barExtent: 9 })).toBe("outside");
  });

  it("drops the label where columns are too narrow to keep them apart", () => {
    // A month of daily bars at 360px is roughly 10px a column. Two labels of
    // "2h 15m" at that spacing overlap, which is worse than neither.
    expect(resolveLabelPlacement({ ...VERTICAL, bandExtent: 10 })).toBe("hidden");
  });

  it("keeps a short label where a long one would collide", () => {
    expect(resolveLabelPlacement({ ...VERTICAL, bandExtent: 30 })).toBe("hidden");
    expect(resolveLabelPlacement({ ...VERTICAL, bandExtent: 30, text: "1h" })).toBe(
      "inside",
    );
  });

  it("labels nothing on a zero column", () => {
    expect(
      resolveLabelPlacement({ ...VERTICAL, value: 0, barExtent: 0, freeExtent: 200 }),
    ).toBe("hidden");
  });
});

describe("resolveLabelPlacement contrast", () => {
  it("refuses to sit inside a fill it cannot be read against", () => {
    // Mid grey fails 4.5:1 against both black and white, so the label leaves
    // the bar rather than being drawn in whichever loses by less.
    expect(readableInkOn("#7a7a7a").ratio).toBeLessThan(MIN_LABEL_CONTRAST);
    expect(resolveLabelPlacement({ ...HORIZONTAL, fill: "#7a7a7a" })).toBe("outside");
  });

  it("hides the label rather than drawing it unreadably when there is no outside", () => {
    expect(resolveLabelPlacement({ ...HORIZONTAL, fill: "#7a7a7a", freeExtent: 4 })).toBe(
      "hidden",
    );
  });

  it("treats an unparseable fill as unreadable rather than assuming a colour", () => {
    expect(resolveLabelPlacement({ ...HORIZONTAL, fill: "rebeccapurple" })).toBe(
      "outside",
    );
  });
});

describe("readableInkOn", () => {
  it("chooses white on a dark category colour and near black on a light one", () => {
    expect(readableInkOn("#4f46e5").color).toBe("#ffffff");
    expect(readableInkOn("#fde047").color).toBe("#0f172a");
  });

  it("reaches the small text threshold on both", () => {
    expect(readableInkOn("#4f46e5").ratio).toBeGreaterThanOrEqual(MIN_LABEL_CONTRAST);
    expect(readableInkOn("#fde047").ratio).toBeGreaterThanOrEqual(MIN_LABEL_CONTRAST);
  });

  /**
   * The label inside a bar is drawn against the user's category colour, which
   * is one value stored on the category and not a theme token. So the ink is
   * the same in the dark theme as in the light one, and this is the property
   * that makes that safe rather than lucky.
   */
  it("depends on the fill alone, so the two themes cannot disagree", () => {
    // A literal, never a token: --color-text inverts between the themes and the
    // category colour underneath it does not.
    expect(["#0f172a", "#ffffff"]).toContain(readableInkOn("#16a34a").color);
    expect(contrastRatio("#ffffff", "#0f172a")).toBeGreaterThan(15);
  });

  it("accepts three digit hex, with or without the hash", () => {
    expect(readableInkOn("#fff").color).toBe("#0f172a");
    expect(readableInkOn("000").color).toBe("#ffffff");
  });

  it("reports nothing readable for a colour it cannot parse", () => {
    expect(readableInkOn(undefined).ratio).toBe(0);
    expect(readableInkOn("var(--color-accent)").ratio).toBe(0);
  });
});

describe("resolveBarOrientation", () => {
  it("keeps bars horizontal on a phone", () => {
    // 328px is a 360px screen minus the card padding, the narrowest the layout
    // supports. Category names have nowhere to go but down the side.
    expect(
      resolveBarOrientation({
        containerWidth: 328,
        barCount: 4,
        longestLabelChars: 9,
      }),
    ).toBe("horizontal");
  });

  it("stands the bars up when the names fit level beneath them", () => {
    expect(
      resolveBarOrientation({
        containerWidth: 760,
        barCount: 4,
        longestLabelChars: 12,
      }),
    ).toBe("vertical");
  });

  it("stays horizontal on a wide screen when the names are long", () => {
    // "Reading for the OU course" under a 93px column would have to be turned
    // on its side, which is the thing horizontal bars exist to avoid.
    expect(
      resolveBarOrientation({
        containerWidth: 560,
        barCount: 6,
        longestLabelChars: 25,
      }),
    ).toBe("horizontal");
  });

  it("stays horizontal once there are too many categories, however wide", () => {
    expect(
      resolveBarOrientation({
        containerWidth: 1600,
        barCount: 12,
        longestLabelChars: 3,
      }),
    ).toBe("horizontal");
  });

  it("does not stand up a single bar in a narrow card", () => {
    expect(
      resolveBarOrientation({
        containerWidth: 479,
        barCount: 1,
        longestLabelChars: 4,
      }),
    ).toBe("horizontal");

    expect(
      resolveBarOrientation({
        containerWidth: 480,
        barCount: 1,
        longestLabelChars: 4,
      }),
    ).toBe("vertical");
  });

  it("answers for an empty chart without dividing by zero", () => {
    expect(
      resolveBarOrientation({
        containerWidth: 900,
        barCount: 0,
        longestLabelChars: 0,
      }),
    ).toBe("horizontal");
  });
});

describe("truncateToWidth", () => {
  it("leaves a name that fits alone", () => {
    expect(truncateToWidth("Deep work", 102)).toBe("Deep work");
  });

  it("cuts a long name to an ellipsis rather than letting it run into the plot", () => {
    const cut = truncateToWidth("Reading for the OU course", 102);

    expect(cut).toBe("Reading for t\u2026");
    expect(cut.length).toBeLessThan("Reading for the OU course".length);
  });

  it("does not leave a space stranded before the ellipsis", () => {
    expect(truncateToWidth("Admin, email and calls", 102)).toBe("Admin, email\u2026");
  });
});

describe("estimateTextWidth", () => {
  it("grows with the string and errs wide rather than narrow", () => {
    expect(estimateTextWidth("1h")).toBeGreaterThan(12);
    expect(estimateTextWidth("1h 30m")).toBeGreaterThan(estimateTextWidth("1h"));
    expect(estimateTextWidth("")).toBe(0);
  });
});
