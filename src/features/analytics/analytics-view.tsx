"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/card";
import { Switch } from "@/components/ui/field";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  resolveRange,
  summarise,
  useDailyTotals,
  useTimeByCategory,
  type CategorySlice,
  type Grouping,
  type RangeKey,
} from "./use-analytics";
import type { ChartStyle } from "./analytics-charts";

/**
 * Charts are loaded on demand rather than imported directly.
 *
 * Recharts is by far the largest dependency in the project, and importing it here
 * would put it in the first bundle this route downloads - delaying the numbers,
 * which are the part people came for, behind the pictures. The summary figures and
 * the breakdown list render immediately and are readable on their own.
 *
 * ssr: false because the charts measure their container to size themselves, so
 * there is nothing useful to render on the server. DF-A11Y-060.
 */
const CompositionChart = dynamic(
  () => import("./analytics-charts").then((module) => module.CompositionChart),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> },
);

const TrendChart = dynamic(
  () => import("./analytics-charts").then((module) => module.TrendChart),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "daily", label: "Day" },
  { key: "weekly", label: "Week" },
  { key: "monthly", label: "Month" },
  { key: "yearly", label: "Year" },
  { key: "lifetime", label: "All" },
];

const CHART_STYLES: { key: ChartStyle; label: string }[] = [
  { key: "donut", label: "Donut" },
  { key: "pie", label: "Pie" },
  { key: "bar", label: "Bars" },
];

export function AnalyticsView() {
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();

  /**
   * Every control starts as null, meaning the user has not touched it on this
   * visit, and is resolved against settings at read time.
   *
   * Seeding useState from settings instead would silently ignore all four saved
   * defaults, because settings arrive from a query and are undefined on the first
   * render - which is exactly the bug this replaced. Copying them across in an
   * effect would work but would flash the wrong view first, and would overwrite a
   * choice made in the moment before the query resolved.
   */
  const [rangeChoice, setRangeChoice] = useState<RangeKey | null>(null);
  const [groupingChoice, setGroupingChoice] = useState<Grouping | null>(null);
  const [distractionChoice, setDistractionChoice] = useState<boolean | null>(null);
  const [estimatedChoice, setEstimatedChoice] = useState<boolean | null>(null);

  // Bars are offered here but never stored, because the saved preference is
  // shared with the dashboard where a horizontal bar chart does not fit the card.
  const [chartStyleOverride, setChartStyleOverride] = useState<ChartStyle | null>(null);

  const rangeKey = rangeChoice ?? ((settings?.default_range ?? "weekly") as RangeKey);
  const grouping =
    groupingChoice ?? ((settings?.default_grouping ?? "parent_category") as Grouping);
  const showDistraction = distractionChoice ?? settings?.show_distraction_default ?? true;
  const includeEstimated = estimatedChoice ?? settings?.include_estimated_default ?? true;

  const range = useMemo(
    () => resolveRange(rangeKey, timeZone, settings?.week_starts_on ?? 1),
    [rangeKey, timeZone, settings?.week_starts_on],
  );

  const slices = useTimeByCategory({
    range,
    grouping,
    includeEstimated,
    includeDistraction: showDistraction,
  });

  const daily = useDailyTotals(range, includeEstimated);
  const summary = useMemo(() => summarise(daily.data ?? []), [daily.data]);

  const isMultiDay = rangeKey !== "daily";
  const chartStyle: ChartStyle =
    chartStyleOverride ?? ((settings?.chart_style ?? "donut") as ChartStyle);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text">Analytics</h1>
        <p className="mt-1 text-sm text-text-muted">
          Where your time actually went. Every figure is calculated from your records, not
          estimated.
        </p>
      </header>

      {/* Range selector */}
      <div
        role="tablist"
        aria-label="Time range"
        className="flex gap-1 rounded-lg border border-border bg-surface-raised p-1"
      >
        {RANGES.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={rangeKey === item.key}
            onClick={() => setRangeChoice(item.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              rangeKey === item.key
                ? "bg-accent text-on-accent"
                : "text-text-muted hover:bg-surface-sunken hover:text-text",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <SummaryStats summary={summary} showDistraction={showDistraction} />

      {/* Controls */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Switch
            checked={grouping === "category"}
            onChange={(checked) =>
              setGroupingChoice(checked ? "category" : "parent_category")
            }
            label="Break into categories"
            description="Off shows the broad groups; on shows the individual activities."
          />

          <Switch
            checked={showDistraction}
            onChange={setDistractionChoice}
            label="Include distraction"
            description="Hide it when you would rather look at the rest of the picture."
          />

          <Switch
            checked={includeEstimated}
            onChange={setEstimatedChoice}
            label="Include estimated time"
            description="Activities the app closed automatically after six hours."
          />
        </div>
      </Card>

      {/* Composition */}
      <Card>
        <CardHeader
          title="Composition"
          description={range.label}
          action={
            <div
              role="group"
              aria-label="Chart style"
              className="flex gap-0.5 rounded-md border border-border p-0.5"
            >
              {CHART_STYLES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={chartStyle === option.key}
                  onClick={() => setChartStyleOverride(option.key)}
                  className={cn(
                    "rounded px-2 py-1 text-xs font-medium transition-colors",
                    chartStyle === option.key
                      ? "bg-surface-sunken text-text"
                      : "text-text-subtle hover:text-text",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="p-4 pt-0">
          {slices.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (slices.data ?? []).length === 0 ? (
            <EmptyState
              title="Nothing recorded in this range"
              description="Record some activities and this will fill in."
            />
          ) : (
            <CompositionChart slices={slices.data ?? []} style={chartStyle} />
          )}
        </div>
      </Card>

      {/* Trend */}
      {isMultiDay && (
        <Card>
          <CardHeader
            title="Trend"
            description="Recorded time per day, with distraction shaded separately."
          />
          <div className="p-4 pt-0">
            {daily.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : summary.totalMinutes === 0 ? (
              <EmptyState
                title="No data in this range"
                description="Nothing to chart yet."
              />
            ) : (
              <TrendChart data={daily.data ?? []} showDistraction={showDistraction} />
            )}
          </div>
        </Card>
      )}

      {/* Breakdown */}
      {(slices.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="Breakdown" description="Longest first." />
          <Breakdown slices={slices.data ?? []} total={summary.totalMinutes} />
        </Card>
      )}

      {/*
        Shown only once the user has actually overridden the grouping, so the
        control never appears to disagree with settings for no reason.
      */}
      {groupingChoice !== null && groupingChoice !== settings?.default_grouping && (
        <p className="px-1 text-xs text-text-subtle">
          Your saved default is{" "}
          {settings?.default_grouping === "category" ? "categories" : "groups"}. This
          change applies to this visit only.
        </p>
      )}
    </div>
  );
}

function SummaryStats({
  summary,
  showDistraction,
}: {
  summary: ReturnType<typeof summarise>;
  showDistraction: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Total recorded" value={formatDuration(summary.totalMinutes)} />
      <Stat label="Days with data" value={String(summary.daysWithData)} />
      <Stat
        label="Average per active day"
        value={formatDuration(summary.averagePerActiveDay)}
      />
      {showDistraction && (
        <Stat
          label="Distraction share"
          value={formatPercent(summary.distractionShare)}
          tone={summary.distractionShare > 0 ? "distraction" : "neutral"}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "distraction";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className="mt-1 truncate text-lg font-semibold tabular-nums"
        style={tone === "distraction" ? { color: "var(--color-distraction)" } : undefined}
      >
        {value}
      </p>
    </Card>
  );
}

function Breakdown({ slices, total }: { slices: CategorySlice[]; total: number }) {
  return (
    <ul className="divide-y divide-border">
      {slices.map((slice) => {
        const share = total === 0 ? 0 : Number(slice.minutes) / total;

        return (
          <li key={slice.group_id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.group_color }}
              />

              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {slice.group_name}
                {slice.parent_name && slice.parent_name !== slice.group_name && (
                  <span className="ml-1.5 text-xs text-text-subtle">
                    {slice.parent_name}
                  </span>
                )}
              </span>

              <span className="shrink-0 text-sm tabular-nums text-text-muted">
                {formatDuration(Number(slice.minutes))}
              </span>

              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-subtle">
                {formatPercent(share)}
              </span>
            </div>

            {/* Proportion bar. Redundant with the figure by design - a bar is read
                at a glance, a percentage needs comparing. */}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(share * 100, 1)}%`,
                  backgroundColor: slice.group_color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
