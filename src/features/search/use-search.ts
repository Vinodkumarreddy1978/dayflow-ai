"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { endOfLocalDay, startOfLocalDay } from "@/lib/domain/timezone";
import type { Moment, MomentStatus } from "@/lib/supabase/database.types";

export interface SearchFilters {
  /** Category ids to restrict to. Empty means no category restriction. */
  categoryIds: string[];
  startDate: string | null;
  endDate: string | null;
  status: MomentStatus | "all";
  minMinutes: number | null;
  maxMinutes: number | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  categoryIds: [],
  startDate: null,
  endDate: null,
  status: "all",
  minMinutes: null,
  maxMinutes: null,
};

/** A cap rather than pagination: 300 results means the filters need narrowing. */
const RESULT_LIMIT = 300;

export function useSearch(filters: SearchFilters, timeZone: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.moments.search({ ...filters, timeZone }),
    enabled,
    queryFn: async (): Promise<{ moments: Moment[]; truncated: boolean }> => {
      const supabase = createClient();
      let query = supabase.from("moments").select("*");

      if (filters.categoryIds.length > 0) {
        query = query.in("category_id", filters.categoryIds);
      }

      if (filters.startDate) {
        query = query.gte(
          "start_at",
          startOfLocalDay(filters.startDate, timeZone).toISOString(),
        );
      }

      if (filters.endDate) {
        query = query.lt(
          "start_at",
          endOfLocalDay(filters.endDate, timeZone).toISOString(),
        );
      }

      if (filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      // Duration filters only apply to closed Moments: a pending one has no
      // duration yet, and treating its elapsed time as a duration would make
      // results change while the user reads them.
      if (filters.minMinutes !== null) {
        query = query.gte("duration_minutes", filters.minMinutes);
      }
      if (filters.maxMinutes !== null) {
        query = query.lte("duration_minutes", filters.maxMinutes);
      }

      const { data, error } = await query
        .order("start_at", { ascending: false })
        .limit(RESULT_LIMIT + 1);

      if (error) throw error;

      const rows = (data ?? []) as Moment[];
      return {
        moments: rows.slice(0, RESULT_LIMIT),
        truncated: rows.length > RESULT_LIMIT,
      };
    },
  });
}
