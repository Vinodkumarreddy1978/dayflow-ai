"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./keys";

/**
 * Multi-device synchronisation.
 *
 * Subscribes to changes on the user's own rows and invalidates the affected
 * queries, so a Moment closed on a phone disappears from the laptop's queue
 * without a refresh (DF-SYN-020).
 *
 * Deliberately invalidates rather than applying the payload directly. Patching
 * the cache from a realtime payload means reimplementing every filter, sort and
 * aggregate on the client and keeping them in agreement with the SQL forever;
 * a refetch is one extra round trip and is always correct. DF-SYN-023.
 */
export function useRealtimeSync(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const filter = `user_id=eq.${userId}`;

    const channel = supabase
      .channel(`dayflow:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "moments", filter },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.moments.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parent_categories", filter },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "goals", filter },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
