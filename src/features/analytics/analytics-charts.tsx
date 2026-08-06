"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration, formatDurationLong } from "@/lib/format";
import {
  readableInkOn,
  resolveBarOrientation,
  resolveLabelPlacement,
  truncateToWidth,
  type BarOrientation,
} from "./chart-geometry";
import type { CategorySlice } from "./use-analytics";

/**
 * Every Recharts import in the application lives in this one file.
 *
 * It is loaded through next/dynamic by the screens that draw charts, which keeps
 * the charting library out of the initial bundle of every other route.
 * DF-A11Y-060.
 */

export type ChartStyle = "donut" | "pie" | "bar";

interface TooltipItem {
  name?: string | number;
  value?: string | number;
  payload?: CategorySlice & { day?: string; minutes?: number };
}

/**
 * Custom tooltip rather than Recharts' default.
 *
 * The default renders raw minutes, and "135" is not how anyone thinks about
 * their afternoon. This shows "2h 15m" consistently with the rest of the app.
 */
function ChartTooltip({
  active,
  payload,
  labelKey,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  labelKey?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2 shadow-[var(--shadow-raised)]">
      {payload.map((item, index) => (
        <p key={index} className="text-xs text-text">
          <span className="font-medium">
            {item.payload?.group_name ?? item.payload?.day ?? item.name ?? labelKey}
          </span>
          {": "}
          {formatDuration(Number(item.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

/**
 * DF-A11Y-025. Every chart needs a text alternative, and for a chart whose whole
 * content is numbers the honest alternative is the numbers.
 *
 * The drawing itself is marked `aria-hidden`, because a screen reader walking an
 * SVG of rectangles announces nothing a person can use. Durations are given in
 * the long form - `two hours 15 minutes` rather than `2h 15m` - because that is
 * what `formatDurationLong` exists for and `2h` is read aloud as "two h".
 */
function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  /** The first column heads the row header cells. */
  columns: string[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) =>
              index === 0 ? (
                <th key={index} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={index}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The width of a chart's own container, not the window.
 *
 * Orientation has to be decided in JavaScript, because it is a Recharts prop
 * rather than a style and no media query can reach it. The input can still be
 * the container rather than the viewport, which is the more truthful question:
 * a chart inside a half-width card on a desktop has a phone's worth of room.
 *
 * Nothing is drawn until the first measurement lands, so the chart never appears
 * one way round and then flips. The wrapper holds its height from the first
 * render either way, so waiting costs no layout shift. These charts are loaded
 * with `ssr: false`, so this never runs on the server and there is no markup for
 * a measurement to disagree with.
 */
function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    setWidth(element.clientWidth);

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** Room for the category names down the left of a horizontal bar chart. */
const CATEGORY_AXIS_WIDTH = 112;

const HORIZONTAL_MARGIN = { top: 4, right: 12, bottom: 4, left: 4 };

/** Taller at the top than the sides: labels above short columns live up there. */
const VERTICAL_MARGIN = { top: 18, right: 8, bottom: 4, left: 8 };

interface BarLabelInput {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  index?: number;
}

function toNumber(value: number | string | undefined): number {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The duration written on the bar itself, which is the whole point of the
 * exercise: a bar chart you have to hover to read is a picture, not a chart.
 *
 * Recharts hands over the rectangle it just drew, so the fit is decided against
 * the real geometry rather than against a guess at what the scale did. Where it
 * does not fit the label moves outside the bar, and where it does not fit there
 * either it is dropped - see resolveLabelPlacement.
 */
function renderBarLabel(
  input: BarLabelInput,
  context: {
    orientation: BarOrientation;
    fills: string[];
    /** Right edge of the plotting area, in the SVG's coordinates. */
    plotRight: number;
    /** Top edge of the plotting area, in the SVG's coordinates. */
    plotTop: number;
  },
) {
  const x = toNumber(input.x);
  const y = toNumber(input.y);
  const width = toNumber(input.width);
  const height = toNumber(input.height);
  const minutes = toNumber(input.value);
  const text = formatDuration(minutes);

  const horizontal = context.orientation === "horizontal";
  const fill = context.fills[input.index ?? -1];

  const placement = resolveLabelPlacement({
    orientation: context.orientation,
    value: minutes,
    barExtent: horizontal ? width : height,
    freeExtent: horizontal ? context.plotRight - (x + width) : y - context.plotTop,
    bandExtent: horizontal ? height : width,
    text,
    fill,
  });

  if (placement === "hidden") return null;

  const inside = placement === "inside";

  // Inside a bar the ink is chosen against the fill and is the same in both
  // themes, because the fill is. Outside it sits on the card, so it follows the
  // theme like every other muted figure on the screen.
  const color = inside ? readableInkOn(fill).color : "var(--color-text-muted)";

  return (
    <text
      x={horizontal ? (inside ? x + width - 6 : x + width + 6) : x + width / 2}
      y={horizontal ? y + height / 2 : inside ? y + 14 : y - 6}
      textAnchor={horizontal ? (inside ? "end" : "start") : "middle"}
      dominantBaseline={horizontal ? "central" : "auto"}
      className="tabular-nums"
      fontSize={11}
      fontWeight={500}
      fill={color}
    >
      {text}
    </text>
  );
}

export function CompositionChart({
  slices,
  style,
}: {
  slices: CategorySlice[];
  style: ChartStyle;
}) {
  // Long tails make a pie chart unreadable, so anything past the twelfth slice is
  // collected into "Other" rather than rendered as a sliver with no label.
  const data = useMemo(() => {
    if (slices.length <= 12) return slices;

    const head = slices.slice(0, 11);
    const tail = slices.slice(11);
    const otherMinutes = tail.reduce((sum, slice) => sum + Number(slice.minutes), 0);

    return [
      ...head,
      {
        group_id: "__other__",
        group_name: `Other (${tail.length})`,
        group_color: "#94a3b8",
        parent_name: "",
        is_distraction: false,
        minutes: otherMinutes,
        moment_count: tail.reduce((sum, slice) => sum + Number(slice.moment_count), 0),
      } satisfies CategorySlice,
    ];
  }, [slices]);

  const table = (
    <ChartDataTable
      caption="Recorded time by category"
      columns={["Category", "Time"]}
      rows={data.map((slice) => ({
        key: slice.group_id,
        cells: [slice.group_name, formatDurationLong(Number(slice.minutes))],
      }))}
    />
  );

  if (style === "bar") {
    return (
      <>
        <CompositionBars data={data} />
        {table}
      </>
    );
  }

  return (
    <>
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="minutes"
              nameKey="group_name"
              cx="50%"
              cy="50%"
              innerRadius={style === "donut" ? 62 : 0}
              outerRadius={104}
              paddingAngle={style === "donut" ? 2 : 0}
              stroke="var(--color-surface-raised)"
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.group_id} fill={slice.group_color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {table}
    </>
  );
}

/**
 * Composition as bars.
 *
 * This plots categories, not time, and category names are written by the user -
 * "Deep work", "Distracted time", "Reading for the OU course". Horizontal bars
 * take names like those flat down the left where they can simply be read, which
 * is why the chart has always been that way round and why on a phone it stays
 * that way round. It did not look like a decision, though, so it now reads as
 * one: the names are truncated to a fixed axis instead of running into the plot,
 * and every bar carries its own duration.
 *
 * Where the names genuinely do fit under upright columns - few enough
 * categories, short enough names, a wide enough container - it draws them
 * upright, because that is what the user expected to see and there is no cost to
 * it. resolveBarOrientation is the whole of that judgement.
 */
function CompositionBars({ data }: { data: CategorySlice[] }) {
  const [ref, containerWidth] = useContainerWidth();

  const longestLabelChars = useMemo(
    () => data.reduce((longest, slice) => Math.max(longest, slice.group_name.length), 0),
    [data],
  );

  const fills = useMemo(() => data.map((slice) => slice.group_color), [data]);

  const orientation =
    containerWidth === null
      ? null
      : resolveBarOrientation({
          containerWidth,
          barCount: data.length,
          longestLabelChars,
        });

  return (
    <div ref={ref} className="h-72 w-full" aria-hidden="true">
      {orientation !== null && containerWidth !== null && (
        <ResponsiveContainer width="100%" height="100%">
          {orientation === "horizontal" ? (
            // layout="vertical" is Recharts' name for bars that run across.
            <BarChart data={data} layout="vertical" margin={HORIZONTAL_MARGIN}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="group_name"
                width={CATEGORY_AXIS_WIDTH}
                tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: string) =>
                  truncateToWidth(value, CATEGORY_AXIS_WIDTH - 10)
                }
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fillOpacity: 0.06 }} />
              <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                {data.map((slice) => (
                  <Cell key={slice.group_id} fill={slice.group_color} />
                ))}
                <LabelList
                  dataKey="minutes"
                  content={(props) =>
                    renderBarLabel(props as BarLabelInput, {
                      orientation: "horizontal",
                      fills,
                      plotRight: containerWidth - HORIZONTAL_MARGIN.right,
                      plotTop: HORIZONTAL_MARGIN.top,
                    })
                  }
                />
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={data} layout="horizontal" margin={VERTICAL_MARGIN}>
              <XAxis
                type="category"
                dataKey="group_name"
                interval={0}
                tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis type="number" hide />
              <Tooltip content={<ChartTooltip />} cursor={{ fillOpacity: 0.06 }} />
              <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={72}>
                {data.map((slice) => (
                  <Cell key={slice.group_id} fill={slice.group_color} />
                ))}
                <LabelList
                  dataKey="minutes"
                  content={(props) =>
                    renderBarLabel(props as BarLabelInput, {
                      orientation: "vertical",
                      fills,
                      plotRight: containerWidth - VERTICAL_MARGIN.right,
                      plotTop: VERTICAL_MARGIN.top,
                    })
                  }
                />
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

/**
 * A month of days is a time series, so it reads left to right along the bottom
 * and it stays that way at every width. Turning a date axis on its side to save
 * space would trade a chart people can read at a glance for one they have to
 * work out, and the reason vertical bars suit dates is the same reason
 * horizontal bars suit category names: the axis labels are short.
 *
 * It is an area rather than a series of bars because it answers "is this going
 * up or down", which a filled line answers better than a row of columns, and
 * because at a year's range there are 365 of them.
 */
export function TrendChart({
  data,
  showDistraction,
}: {
  data: { day: string; minutes: number; distracted_minutes: number }[];
  showDistraction: boolean;
}) {
  return (
    <>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="df-total" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "var(--color-text-subtle)" }}
              axisLine={false}
              tickLine={false}
              // Day-of-month only: full ISO dates overlap on a month-long range.
              tickFormatter={(value: string) => value.slice(8)}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-subtle)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${Math.round(value / 60)}h`}
            />
            <Tooltip content={<ChartTooltip />} />

            <Area
              type="monotone"
              dataKey="minutes"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#df-total)"
            />

            {showDistraction && (
              <Area
                type="monotone"
                dataKey="distracted_minutes"
                stroke="var(--color-distraction)"
                strokeWidth={1.5}
                fill="var(--color-distraction)"
                fillOpacity={0.12}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <TrendAlternative data={data} showDistraction={showDistraction} />
    </>
  );
}

/**
 * The trend's text alternative, day by day where that is a sensible number of
 * rows and as a summary where it is not.
 *
 * A year's range is 365 days. Tabbing a screen reader through 365 rows to learn
 * that Tuesdays are heavy is not access, it is an obstacle course, so past a
 * month it gives the shape instead: the total, the average and the busiest day.
 */
const TREND_TABLE_MAX_ROWS = 31;

function TrendAlternative({
  data,
  showDistraction,
}: {
  data: { day: string; minutes: number; distracted_minutes: number }[];
  showDistraction: boolean;
}) {
  const columns = showDistraction ? ["Day", "Time", "Distraction"] : ["Day", "Time"];

  if (data.length <= TREND_TABLE_MAX_ROWS) {
    return (
      <ChartDataTable
        caption="Recorded time per day"
        columns={columns}
        rows={data.map((entry) => ({
          key: entry.day,
          cells: showDistraction
            ? [
                entry.day,
                formatDurationLong(Number(entry.minutes)),
                formatDurationLong(Number(entry.distracted_minutes)),
              ]
            : [entry.day, formatDurationLong(Number(entry.minutes))],
        }))}
      />
    );
  }

  const total = data.reduce((sum, entry) => sum + Number(entry.minutes), 0);
  const active = data.filter((entry) => Number(entry.minutes) > 0);
  const busiest = active.reduce<{ day: string; minutes: number } | null>(
    (best, entry) =>
      best === null || Number(entry.minutes) > best.minutes
        ? { day: entry.day, minutes: Number(entry.minutes) }
        : best,
    null,
  );

  return (
    <p className="sr-only">
      {`Recorded time per day across ${data.length} days. `}
      {`Total ${formatDurationLong(total)} over ${active.length} days with records. `}
      {busiest === null
        ? "No days with records."
        : `Busiest day ${busiest.day}, ${formatDurationLong(busiest.minutes)}.`}
    </p>
  );
}
