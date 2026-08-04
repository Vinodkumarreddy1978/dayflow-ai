"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { addDays, todayInTimeZone } from "@/lib/domain/timezone";

/**
 * Analytics data.
 *
 * Every figure is aggregated by PostgreSQL, never by summing rows in the browser
 * (DF-ANA-092). A lifetime view for a three-year user is tens of thousands of
 * Moments; transferring those to a phone to add them up would be slow, expensive
 * on mobile data, and would put the midnight-split logic in two places at once.
 */

export type RangeKey = "daily" | "weekly" | "monthly" | "yearly" | "lifetime";
export type Grouping = "category" | "parent_category";

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

/**
 * Resolves a named range into concrete dates in the user's own timezone.
 *
 * `weekStartsOn` is honoured rather than assumed: a week that begins on Sunday
 * for a user who thinks in Monday-to-Sunday weeks makes every weekly comparison
 * subtly wrong, and it is the kind of wrong that is hard to articulate.
 */
export function resolveRange(
  key: RangeKey,
  timeZone: string,
  weekStartsOn = 1,
  anchorDate?: string,
): DateRange {
  const today = anchorDate ?? todayInTimeZone(timeZone);

  switch (key) {
    case "daily":
      return { start: today, end: today, label: "Today" };

    case "weekly": {
      const anchor = new Date(`${today}T00:00:00Z`);
      const dayOfWeek = anchor.getUTCDay();
      const offset = (dayOfWeek - weekStartsOn + 7) % 7;
      const start = addDays(today, -offset);
      return { start, end: addDays(start, 6), label: "This week" };
    }

    case "monthly": {
      const start = `${today.slice(0, 7)}-01`;
      const [year, month] = start.split("-").map(Number);
      // Day 0 of the next month is the last day of this one, which avoids
      // hard-coding month lengths and handles February in a leap year.
      const lastDay = new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
      return {
        start,
        end: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
        label: "This month",
      };
    }

    case "yearly": {
      const year = today.slice(0, 4);
      return { start: `${year}-01-01`, end: `${year}-12-31`, label: "This year" };
    }

    case "lifetime":
      // Far enough back to predate any account. The SQL clamps to what exists,
      // so an over-wide range costs nothing.
      return { start: "2000-01-01", end: today, label: "All time" };
  }
}

export interface CategorySlice {
  group_id: string;
  group_name: string;
  group_color: string;
  parent_name: string;
  is_distraction: boolean;
  minutes: number;
  moment_count: number;
}

export function useTimeByCategory(params: {
  range: DateRange;
  grouping: Grouping;
  includeEstimated: boolean;
  includeDistraction: boolean;
}) {
  const { range, grouping, includeEstimated, includeDistraction } = params;

  return useQuery({
    queryKey: queryKeys.analytics.byCategory({
      start: range.start,
      end: range.end,
      grouping,
      includeEstimated,
      includeDistraction,
    }),
    queryFn: async (): Promise<CategorySlice[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_time_by_category", {
        p_start: range.start,
        p_end: range.end,
        p_grouping: grouping,
        p_include_estimated: includeEstimated,
        p_include_distraction: includeDistraction,
      });

      if (error) throw error;
      return (data ?? []) as CategorySlice[];
    },
  });
}

export interface DailyTotal {
  day: string;
  minutes: number;
  distracted_minutes: number;
  moment_count: number;
}

export function useDailyTotals(range: DateRange, includeEstimated: boolean) {
  return useQuery({
    queryKey: queryKeys.analytics.daily(range.start, range.end),
    queryFn: async (): Promise<DailyTotal[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_daily_totals", {
        p_start: range.start,
        p_end: range.end,
        p_include_estimated: includeEstimated,
      });

      if (error) throw error;
      return (data ?? []) as DailyTotal[];
    },
    // A lifetime range can span years of days; that is fine for a chart but not
    // worth refetching aggressively.
    staleTime: 60_000,
  });
}

export interface AnalyticsSummary {
  totalMinutes: number;
  distractedMinutes: number;
  daysWithData: number;
  averagePerActiveDay: number;
  distractionShare: number;
}

export function summarise(daily: DailyTotal[]): AnalyticsSummary {
  const totalMinutes = daily.reduce((sum, day) => sum + Number(day.minutes), 0);
  const distractedMinutes = daily.reduce(
    (sum, day) => sum + Number(day.distracted_minutes),
    0,
  );
  // Averaged over days that have data, not over calendar days. Dividing by 365
  // for a user who started in November produces a number that means nothing.
  const daysWithData = daily.filter((day) => Number(day.minutes) > 0).length;

  return {
    totalMinutes,
    distractedMinutes,
    daysWithData,
    averagePerActiveDay: daysWithData === 0 ? 0 : Math.round(totalMinutes / daysWithData),
    distractionShare: totalMinutes === 0 ? 0 : distractedMinutes / totalMinutes,
  };
}
