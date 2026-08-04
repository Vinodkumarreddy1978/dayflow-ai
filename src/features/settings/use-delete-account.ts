"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { requestAccountDeletion } from "./delete-account";

/**
 * Deletes the account, then leaves nothing behind that suggests otherwise.
 *
 * The order is the point. `delete_account()` removes the `auth.users` row, but the
 * access token already issued stays valid until it expires (ADR-014), so a session
 * that is not discarded immediately keeps rendering an application belonging to an
 * account that no longer exists. Every query in that state fails, and the user is
 * left looking at a screen that cannot say why.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (confirmation: string) => {
      const supabase = createClient();

      await requestAccountDeletion(supabase, confirmation);

      try {
        // Local scope: there is no user left for the auth server to sign out, and a
        // remote sign-out would be answered with an error about the missing account.
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Tidying up a session whose account has already gone. A failure here is not
        // a failed deletion, and must not be reported as one.
      }

      queryClient.clear();
    },

    onSuccess: () => {
      // A document load rather than a router navigation. Every provider above this
      // component - the query cache, the session context, the realtime subscription
      // - was established for a user who no longer exists, and a client-side
      // navigation would carry all three to the landing page.
      window.location.replace("/");
    },
  });
}
