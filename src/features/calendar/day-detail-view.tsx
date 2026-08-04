"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/card";
import { useUiStore } from "@/lib/store/ui-store";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { DayTimeline } from "@/features/moments/day-timeline";
import { useDailyTotals, useTimeByCategory } from "@/features/analytics/use-analytics";
import { addDays, todayInTimeZone } from "@/lib/domain/timezone";
import { formatDate, formatDuration, formatRelativeDay } from "@/lib/format";

export function DayDetailView({ date }: { date: string }) {
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const openCreateMoment = useUiStore((state) => state.openCreateMoment);

  const today = todayInTimeZone(timeZone);
  const range = useMemo(() => ({ start: date, end: date, label: date }), [date]);

  const slices = useTimeByCategory({
    range,
    grouping: "category",
    includeEstimated: true,
    includeDistraction: true,
  });

  const { data: daily } = useDailyTotals(range, true);
  const totals = daily?.[0];

  const relative = formatRelativeDay(date, today);
  const previousDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const hasNext = nextDate <= today;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Calendar
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">
            {relative ?? formatDate(`${date}T12:00:00Z`, "UTC", "long")}
          </h1>
          {relative && (
            <p className="mt-0.5 text-sm text-text-muted">
              {formatDate(`${date}T12:00:00Z`, "UTC", "long")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Link href={`/calendar/${previousDate}` as Route} aria-label="Previous day">
            <Button variant="secondary" size="icon">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
          </Link>

          {hasNext ? (
            <Link href={`/calendar/${nextDate}` as Route} aria-label="Next day">
              <Button variant="secondary" size="icon">
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </Link>
          ) : (
            <Button variant="secondary" size="icon" disabled aria-label="Next day">
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-text-muted">Recorded</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {formatDuration(Number(totals?.minutes ?? 0))}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-text-muted">Activities</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {Number(totals?.moment_count ?? 0)}
          </p>
        </Card>

        {(settings?.show_distraction_default ?? true) && (
          <Card className="p-4">
            <p className="text-xs text-text-muted">Distracted</p>
            <p
              className="mt-1 text-lg font-semibold tabular-nums"
              style={
                Number(totals?.distracted_minutes ?? 0) > 0
                  ? { color: "var(--color-distraction)" }
                  : undefined
              }
            >
              {formatDuration(Number(totals?.distracted_minutes ?? 0))}
            </p>
          </Card>
        )}
      </div>

      <section aria-label="Timeline" className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-sm font-semibold text-text">Timeline</h2>
          <Button size="sm" variant="ghost" onClick={() => openCreateMoment()}>
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>

        <DayTimeline date={date} timeZone={timeZone} />
      </section>

      <Card>
        <CardHeader title="Where the time went" />
        <div className="p-4 pt-0">
          {slices.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (slices.data ?? []).length === 0 ? (
            <EmptyState
              title="Nothing recorded"
              description="Add what you remember of this day - it is never too late."
            />
          ) : (
            <ul className="space-y-2">
              {(slices.data ?? []).map((slice) => (
                <li key={slice.group_id} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.group_color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {slice.group_name}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-text-muted">
                    {formatDuration(Number(slice.minutes))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
