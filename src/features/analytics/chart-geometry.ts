/**
 * The arithmetic behind the analytics charts, with no React and no Recharts in
 * it.
 *
 * Everything here is a judgement that is easy to get quietly wrong and hard to
 * notice in a screenshot: whether a duration fits inside the bar it describes,
 * whether a column is wide enough for its category name, whether white or near
 * black is readable on a colour the user chose themselves. Keeping it separate
 * means those decisions are asserted directly rather than inferred from a
 * rendered SVG, which is the only way vitest can see them - the suite runs in a
 * node environment with no DOM.
 *
 * This module is only ever imported by analytics-charts.tsx, so it travels in
 * the same lazily loaded chunk as Recharts and adds nothing to any route's
 * First Load JS. DF-A11Y-060.
 */

/**
 * The direction the bars grow, described the way a person would describe it.
 *
 * `vertical` bars rise from a category axis along the bottom. `horizontal` bars
 * extend rightwards from a category axis down the left side. Recharts names its
 * `layout` prop after the opposite thing - `layout="vertical"` draws horizontal
 * bars - so the two vocabularies are deliberately never mixed: this type is
 * what the code reasons in, and the translation happens once, at the prop.
 */
export type BarOrientation = "vertical" | "horizontal";

export type LabelPlacement = "inside" | "outside" | "hidden";

/**
 * Width of one character of the 11px label type in the system stacks
 * `--font-sans` resolves to.
 *
 * Deliberately a shade wider than the digits actually measure. The estimate is
 * used to decide whether a label fits, and the two failure modes are not
 * equally bad: guessing narrow puts text through the end of a bar, guessing
 * wide moves a label that would just have fitted to the outside, where it is
 * still perfectly readable.
 */
const LABEL_CHAR_WIDTH = 6.4;

/** Cap height plus a little, for an 11px label. */
const LABEL_LINE_HEIGHT = 11;

/** The category axis is set at 12px, one step up from the value labels. */
const AXIS_CHAR_WIDTH = 6.9;

export function estimateTextWidth(text: string, charWidth = LABEL_CHAR_WIDTH): number {
  return text.length * charWidth;
}

/** Breathing room between a label and the end of the bar it sits inside. */
const INSIDE_PADDING = 12;

/** Gap between the end of a bar and a label parked beyond it. */
const OUTSIDE_PADDING = 6;

/**
 * WCAG 1.4.3 for text below 18px. A category colour that cannot carry a label
 * at this ratio does not get one inside the bar. DF-A11Y-001.
 */
export const MIN_LABEL_CONTRAST = 4.5;

export interface LabelGeometry {
  orientation: BarOrientation;
  /** The value being labelled, in minutes. */
  value: number;
  /** Bar length along the value axis, in px. */
  barExtent: number;
  /** Space left along the value axis past the end of the bar, in px. */
  freeExtent: number;
  /** Bar thickness across the category axis, in px. */
  bandExtent: number;
  /** The text that would be drawn. */
  text: string;
  /** The bar's fill, so a label cannot be placed on a colour it fails against. */
  fill?: string;
}

/**
 * Where a bar's value label can go, or whether it can go anywhere at all.
 *
 * A label half in and half out of a short bar is worse than no label, and a
 * label overlapping its neighbour is worse still, so `hidden` is a real answer
 * rather than a failure - the tooltip, the breakdown list underneath and the
 * screen reader table all still carry the figure.
 */
export function resolveLabelPlacement(geometry: LabelGeometry): LabelPlacement {
  const { orientation, value, barExtent, freeExtent, bandExtent, text } = geometry;

  // A zero bar has no bar. "0m" floating against the axis reads as a rendering
  // fault rather than as information.
  if (!(value > 0) || !(barExtent > 0)) return "hidden";

  const textWidth = estimateTextWidth(text);
  const horizontal = orientation === "horizontal";

  if (horizontal) {
    // The label runs along the bar, so the bar has to be thick enough to
    // contain the type as well as long enough to contain the string.
    if (bandExtent < LABEL_LINE_HEIGHT + 3) return "hidden";
  } else if (bandExtent < textWidth + 2) {
    // Columns are the collision case. A month of daily bars on a 360px phone
    // gives each column about ten pixels, which will not hold "1h 20m" without
    // running into the two beside it.
    return "hidden";
  }

  // A horizontal bar has to be as long as the string; a column only has to be
  // as tall as one line, however long the string is.
  const needed = horizontal ? textWidth : LABEL_LINE_HEIGHT;

  if (barExtent >= needed + INSIDE_PADDING && hasReadableInk(geometry.fill))
    return "inside";
  if (freeExtent >= needed + OUTSIDE_PADDING) return "outside";
  return "hidden";
}

export interface OrientationInput {
  /** The width of the chart's own container, not the window. */
  containerWidth: number;
  barCount: number;
  /** Length of the longest category name, in characters. */
  longestLabelChars: number;
}

/**
 * Narrower than this and there is no arrangement of columns that leaves room
 * for horizontal category names. Roughly a large phone in landscape.
 */
const VERTICAL_MIN_WIDTH = 480;

/**
 * Past eight columns the names are competing for the axis whatever the width,
 * and a category breakdown with that many entries is a list, not a shape.
 */
const VERTICAL_MAX_BARS = 8;

/** Minimum gap between two adjacent category names on the axis. */
const AXIS_LABEL_GAP = 8;

/**
 * Which way the composition bars should run.
 *
 * The honest answer for a category breakdown is usually horizontal: the labels
 * are user-written category names, and vertical columns can only fit those by
 * rotating them, which nobody enjoys reading. But that is a statement about
 * whether the names fit, not a law - when there are few enough categories with
 * short enough names in a wide enough container, the names fit flat under
 * upright columns and upright columns are what people expect. So the rule is
 * the measurement rather than a breakpoint: columns if every name can sit level
 * under its own, bars otherwise. On a phone that resolves to bars every time.
 */
export function resolveBarOrientation(input: OrientationInput): BarOrientation {
  const { containerWidth, barCount, longestLabelChars } = input;

  if (barCount <= 0) return "horizontal";
  if (containerWidth < VERTICAL_MIN_WIDTH) return "horizontal";
  if (barCount > VERTICAL_MAX_BARS) return "horizontal";

  const slotWidth = containerWidth / barCount;
  const nameWidth = longestLabelChars * AXIS_CHAR_WIDTH + AXIS_LABEL_GAP;

  return slotWidth >= nameWidth ? "vertical" : "horizontal";
}

/**
 * How many characters of a category name fit in a given width before it has to
 * be cut short. The tooltip and the breakdown list keep the full name.
 */
export function fittingCharCount(width: number): number {
  return Math.max(0, Math.floor(width / AXIS_CHAR_WIDTH));
}

export function truncateToWidth(text: string, width: number): string {
  const limit = fittingCharCount(width);
  if (limit <= 1) return text.slice(0, limit);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}\u2026`;
}

/**
 * The two ends of the ink scale, both fixed rather than themed.
 *
 * The surface behind a bar label is the user's own category colour, which is
 * the same in the light and dark themes, so the text on it must be too - a
 * label that followed the theme would be white on #fde047 for half the day.
 * `#0f172a` is the light theme's `--color-text`.
 */
const DARK_INK = "#0f172a";
const LIGHT_INK = "#ffffff";

export interface InkChoice {
  color: string;
  /** Contrast ratio against the fill, 1 to 21. Zero if the fill was unreadable. */
  ratio: number;
}

function parseHex(color: string | undefined): [number, number, number] | null {
  if (typeof color !== "string") return null;

  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;

  if (!/^[0-9a-f]{6}$/i.test(full)) return null;

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG 2.1 relative luminance. */
function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastRatio(foreground: string, background: string): number {
  const first = parseHex(foreground);
  const second = parseHex(background);
  if (first === null || second === null) return 0;

  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Black or white on a given fill, whichever is more readable, with the ratio it
 * achieves so the caller can decline to use it.
 *
 * Category colours are chosen in a colour picker by someone thinking about
 * which one looks like "Deep work", not about luminance, so both a pale yellow
 * and a near black are entirely possible and neither can be assumed.
 */
export function readableInkOn(fill: string | undefined): InkChoice {
  const dark = contrastRatio(DARK_INK, fill ?? "");
  const light = contrastRatio(LIGHT_INK, fill ?? "");

  return dark >= light
    ? { color: DARK_INK, ratio: dark }
    : { color: LIGHT_INK, ratio: light };
}

function hasReadableInk(fill: string | undefined): boolean {
  // No fill given means the caller is not placing text on a coloured surface,
  // so there is nothing to fail against.
  if (fill === undefined) return true;
  return readableInkOn(fill).ratio >= MIN_LABEL_CONTRAST;
}
