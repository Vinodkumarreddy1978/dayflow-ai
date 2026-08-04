"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { useDailyTotals } from "@/features/analytics/use-analytics";
import { todayInTimeZone } from "@/lib/domain/timezone";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Days in a month, without hard-coding lengths or special-casing February. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function CalendarView() {
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const today = todayInTimeZone(timeZone);

  const [monthKey, setMonthKey] = useState(() => today.slice(0, 7));
  const weekStartsOn = settings?.week_starts_on ?? 1;

  const [year, month] = monthKey.split("-").map(Number);
  const totalDays = daysInMonth(year ?? 1970, month ?? 1);

  const range = useMemo(
    () => ({
      start: `${monthKey}-01`,
      end: `${monthKey}-${String(totalDays).padStart(2, "0")}`,
      label: monthLabel(monthKey),
    }),
    [monthKey, totalDays],
  );

  const { data: daily, isLoading } = useDailyTotals(range, true);

  const byDate = useMemo(
    () => new Map((daily ?? []).map((day) => [day.day, day])),
    [daily],
  );

  // Scale intensity to the busiest day in view rather than a fixed ceiling, so
  // the pattern stays legible whether someone records two hours a day or twelve.
  const maxMinutes = useMemo(
    () => Math.max(1, ...(daily ?? []).map((day) => Number(day.minutes))),
    [daily],
  );

  const firstWeekday = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)).getUTCDay();
  const leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7;

  const orderedWeekdays = useMemo(
    () =>
      Array.from(
        { length: 7 },
        (_, index) => WEEKDAY_LABELS[(weekStartsOn + index) % 7]!,
      ),
    [weekStartsOn],
  );

  const isCurrentMonthOrLater = monthKey >= today.slice(0, 7);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text">Calendar</h1>
        <p className="mt-1 text-sm text-text-muted">
          Darker days are fuller ones. Empty squares are days with nothing recorded - you
          can still fill them in.
        </p>
      </header>

      <Card>
        <div className="flex items-center justify-between border-b border-border p-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          <h2 className="text-sm font-semibold text-text">{monthLabel(monthKey)}</h2>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            // Future months hold nothing by definition, so navigating into them
            // is a dead end rather than a feature.
            disabled={isCurrentMonthOrLater}
            onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1">
            {orderedWeekdays.map((label) => (
              <div
                key={label}
                className="pb-1 text-center text-[11px] font-medium text-text-subtle"
              >
                {label}
              </div>
            ))}

            {Array.from({ length: leadingBlanks }, (_, index) => (
              <div key={`blank-${index}`} aria-hidden="true" />
            ))}

            {isLoading
              ? Array.from({ length: totalDays }, (_, index) => (
                  <Skeleton key={index} className="aspect-square w-full" />
                ))
              : Array.from({ length: totalDays }, (_, index) => {
                  const dayNumber = index + 1;
                  const date = `${monthKey}-${String(dayNumber).padStart(2, "0")}`;
                  const entry = byDate.get(date);
                  const minutes = Number(entry?.minutes ?? 0);
                  const intensity = minutes / maxMinutes;
                  const isFuture = date > today;
                  const isToday = date === today;

                  if (isFuture) {
                    return (
                      <div
                        key={date}
                        className="grid aspect-square place-items-center rounded-md text-xs text-text-subtle/50"
                      >
                        {dayNumber}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={date}
                      href={`/calendar/${date}` as Route}
                      aria-label={`${date}, ${formatDuration(minutes)} recorded`}
                      className={cn(
                        "group relative grid aspect-square place-items-center rounded-md border text-xs transition-colors",
                        isToday ? "border-accent" : "border-transparent",
                        minutes === 0 && "border-dashed border-border-strong",
                        "hover:border-accent",
                      )}
                      style={
                        minutes > 0
                          ? {
                              // Floor at 0.12 so a light day is still visibly
                              // distinct from an empty one.
                              backgroundColor: `color-mix(in srgb, var(--color-accent) ${Math.max(intensity * 78, 12)}%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          "tabular-nums",
                          intensity > 0.6 ? "font-medium text-text" : "text-text-muted",
                        )}
                      >
                        {dayNumber}
                      </span>
                    </Link>
                  );
                })}
          </div>
        </div>
      </Card>

      <MonthSummary
        daily={daily ?? []}
        isLoading={isLoading}
        monthName={monthLabel(monthKey)}
      />
    </div>
  );
}

function MonthSummary({
  daily,
  isLoading,
  monthName,
}: {
  daily: { day: string; minutes: number; distracted_minutes: number }[];
  isLoading: boolean;
  monthName: string;
}) {
  if (isLoading) return <Skeleton className="h-20 w-full" />;

  const total = daily.reduce((sum, day) => sum + Number(day.minutes), 0);
  const recorded = daily.filter((day) => Number(day.minutes) > 0).length;
  const busiest = daily.reduce(
    (best, day) => (Number(day.minutes) > Number(best?.minutes ?? 0) ? day : best),
    daily[0],
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Card className="p-4">
        <p className="text-xs text-text-muted">Recorded in {monthName}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{formatDuration(total)}</p>
      </Card>

      <Card className="p-4">
        <p className="text-xs text-text-muted">Days with data</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {recorded} of {daily.length}
        </p>
      </Card>

      <Card className="p-4">
        <p className="text-xs text-text-muted">Fullest day</p>
        <p className="mt-1 truncate text-lg font-semibold tabular-nums">
          {busiest && Number(busiest.minutes) > 0
            ? `${busiest.day.slice(8)} · ${formatDuration(Number(busiest.minutes))}`
            : "—"}
        </p>
      </Card>
    </div>
  );
}
