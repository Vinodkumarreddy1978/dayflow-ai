"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/keys";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session-context";
import type { ParentCategory, Settings } from "@/lib/supabase/database.types";
import type { SettingsInput } from "@/lib/schemas";

/** As much of the cached category tree as the locked-weight check reads. */
interface CachedCategoryTree {
  parents: ParentCategory[];
}

/**
 * The write helpers load on the first save rather than with the page. The
 * settings route sits on the 200 kB First Load line; pulling save-settings into
 * the initial chunk is what pushed it over after the read/write split that kept
 * every other route under budget.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { userId } = useSession();

  // The row as it stood before the optimistic update. `onMutate` runs first and
  // patches the cache, so by the time the write happens the cache can no longer
  // say what is being changed - and the locked-weight check needs to know.
  const beforeMutation = useRef<Settings | null>(null);

  return useMutation({
    mutationFn: async (patch: SettingsInput) => {
      const { assertNoLockedWeightChange, saveSettings } =
        await import("./save-settings");

      const tree = queryClient.getQueryData<CachedCategoryTree>(
        queryKeys.categories.tree(),
      );

      assertNoLockedWeightChange(
        patch,
        beforeMutation.current,
        tree?.parents.find((parent) => parent.is_system)?.id ?? null,
      );

      return saveSettings(
        (values) => createClient().from("settings").update(values),
        userId,
        patch,
      );
    },

    // Optimistic, because a toggle that waits for a round trip before moving
    // feels broken. DF-SET-003.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previous = queryClient.getQueryData<Settings>(queryKeys.settings);
      beforeMutation.current = previous ?? null;

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

      // The database's own account of the refusal goes to the server, because
      // that is where the structured logger runs and where an operator can find
      // it afterwards. The user gets a sentence they can act on instead.
      void import("./save-settings").then(
        ({ describeSettingsWriteError, reportSettingsWriteFailure }) => {
          void reportSettingsWriteFailure(error);
          toast.error(describeSettingsWriteError(error));
        },
      );
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}
