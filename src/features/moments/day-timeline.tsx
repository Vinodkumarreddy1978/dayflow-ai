"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/card";
import { useUiStore } from "@/lib/store/ui-store";
import { useCategories } from "@/features/categories/use-categories";
import { useSettings } from "@/features/settings/use-settings";
import { endOfLocalDay, startOfLocalDay } from "@/lib/domain/timezone";
import { formatDuration, formatTime } from "@/lib/format";
import { useDayMoments } from "./use-moments";
import type { Moment } from "@/lib/supabase/database.types";

interface TimelineEntry {
  kind: "moment" | "gap";
  start: Date;
  end: Date;
  minutes: number;
  moment?: Moment;
}

interface DayTimelineProps {
  date: string;
  timeZone: string;
}

/**
 * A day as a vertical sequence of what happened and what is unaccounted for.
 *
 * Gaps are shown deliberately (DF-MOM-052). A timeline that renders only what
 * was recorded looks complete when it is not, and the missing hours are exactly
 * the ones worth recovering while they can still be remembered.
 */
export function DayTimeline({ date, timeZone }: DayTimelineProps) {
  const { data: moments, isLoading } = useDayMoments(date, timeZone);
  const { data: settings } = useSettings();
  const { tree } = useCategories();
  const openCreateMoment = useUiStore((state) => state.openCreateMoment);
  const openEditMoment = useUiStore((state) => state.openEditMoment);

  const use24Hour = settings?.time_format === "24h";
  const minimumGapMinutes = 15;

  const entries = useMemo<TimelineEntry[]>(() => {
    if (!moments || moments.length === 0) return [];

    const dayStart = startOfLocalDay(date, timeZone);
    const dayEnd = endOfLocalDay(date, timeZone);
    const now = new Date();
    // Never draw a gap into the future; the rest of today has not happened yet.
    const horizon = new Date(Math.min(dayEnd.getTime(), now.getTime()));

    const clamped = moments
      .map((moment) => {
        const start = new Date(
          Math.max(new Date(moment.start_at).getTime(), dayStart.getTime()),
        );
        const rawEnd = moment.end_at ? new Date(moment.end_at) : now;
        const end = new Date(Math.min(rawEnd.getTime(), dayEnd.getTime()));
        return { moment, start, end };
      })
      .filter((entry) => entry.end.getTime() > entry.start.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const result: TimelineEntry[] = [];
    let cursor = clamped[0]?.start ?? dayStart;

    for (const entry of clamped) {
      const gapMinutes = Math.round((entry.start.getTime() - cursor.getTime()) / 60_000);

      // Small gaps are the seams between activities, not lost time. Rendering
      // them would bury the real gaps in noise.
      if (gapMinutes >= minimumGapMinutes) {
        result.push({
          kind: "gap",
          start: new Date(cursor),
          end: entry.start,
          minutes: gapMinutes,
        });
      }

      result.push({
        kind: "moment",
        start: entry.start,
        end: entry.end,
        minutes: Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000),
        moment: entry.moment,
      });

      if (entry.end.getTime() > cursor.getTime()) cursor = entry.end;
    }

    const trailingGap = Math.round((horizon.getTime() - cursor.getTime()) / 60_000);
    if (trailingGap >= minimumGapMinutes) {
      result.push({
        kind: "gap",
        start: new Date(cursor),
        end: horizon,
        minutes: trailingGap,
      });
    }

    return result;
  }, [moments, date, timeZone]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing recorded for this day"
          description="Add what you remember. You can fill in a day long after it has ended."
          action={
            <Button onClick={() => openCreateMoment()}>
              <Plus className="size-4" aria-hidden="true" />
              Add activity
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <ol className="space-y-1.5">
      {entries.map((entry, index) => {
        if (entry.kind === "gap") {
          return (
            <li key={`gap-${index}`}>
              <button
                type="button"
                // ISO, not a wall-clock string: the form converts into the
                // user's configured timezone, which may not be this device's.
                onClick={() => openCreateMoment(entry.start.toISOString())}
                className="flex w-full items-center gap-3 rounded-md border border-dashed border-border-strong px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent-subtle"
              >
                <span className="w-16 shrink-0 text-xs tabular-nums text-text-subtle">
                  {formatTime(entry.start, timeZone, use24Hour)}
                </span>
                <span className="text-sm text-text-muted">
                  {formatDuration(entry.minutes)} unrecorded
                </span>
                <span className="ml-auto text-xs font-medium text-accent">Fill in</span>
              </button>
            </li>
          );
        }

        const moment = entry.moment!;
        const category = tree.byId.get(moment.category_id);

        return (
          <li key={moment.id}>
            <button
              type="button"
              onClick={() => openEditMoment(moment.id)}
              className="flex w-full items-center gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-border-strong"
            >
              <span className="w-16 shrink-0 text-xs tabular-nums text-text-muted">
                {formatTime(entry.start, timeZone, use24Hour)}
              </span>

              <span
                aria-hidden="true"
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: category?.effectiveColor ?? "#94a3b8" }}
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">
                  {category?.name ?? "Unknown category"}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {category?.parent.name}
                  {moment.status === "auto_closed" && " · closed automatically"}
                  {moment.status === "pending" && " · still open"}
                </span>
              </span>

              <span className="shrink-0 text-sm tabular-nums text-text-muted">
                {formatDuration(entry.minutes)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
