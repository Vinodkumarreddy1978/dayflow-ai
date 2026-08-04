"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration } from "@/lib/format";
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

  if (style === "bar") {
    return (
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="group_name"
              width={110}
              tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
              {data.map((slice) => (
                <Cell key={slice.group_id} fill={slice.group_color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
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
  );
}

export function TrendChart({
  data,
  showDistraction,
}: {
  data: { day: string; minutes: number; distracted_minutes: number }[];
  showDistraction: boolean;
}) {
  return (
    <div className="h-56 w-full">
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
  );
}
