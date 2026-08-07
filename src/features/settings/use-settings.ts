"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import type { Settings } from "@/lib/supabase/database.types";

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async (): Promise<Settings> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("settings").select("*").single();

      if (error) throw error;
      return data as Settings;
    },
    // Settings change rarely and are read by nearly every component, so a long
    // stale window avoids a refetch on every navigation.
    staleTime: 5 * 60_000,
  });
}

/**
 * The user's timezone, with a sensible fallback while settings are loading.
 *
 * Reading it from the browser rather than defaulting to UTC matters: a UTC
 * fallback puts every Moment on the wrong Local Day for anyone east of Greenwich
 * for the first few hundred milliseconds, and the resulting flicker looks like a
 * data error.
 */
export function useTimeZone(): string {
  const { data } = useSettings();
  if (data?.timezone) return data.timezone;
  if (typeof Intl !== "undefined") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  return "UTC";
}
