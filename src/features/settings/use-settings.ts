"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { useToast } from "@/components/ui/toast";
import type { Settings } from "@/lib/supabase/database.types";
import type { SettingsInput } from "@/lib/schemas";

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

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (patch: SettingsInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("settings")
        .update(patch)
        .select()
        .single();

      if (error) throw error;
      return data as Settings;
    },

    // Optimistic, because a toggle that waits for a round trip before moving
    // feels broken. DF-SET-003.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previous = queryClient.getQueryData<Settings>(queryKeys.settings);

      if (previous) {
        queryClient.setQueryData<Settings>(queryKeys.settings, {
          ...previous,
          ...patch,
        } as Settings);
      }

      return { previous };
    },

    onError: (error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.settings, context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : "That setting could not be saved.",
      );
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
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
