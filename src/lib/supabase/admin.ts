import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { publicEnv } from "@/lib/public-env";
import { type Database } from "./database.types";

/**
 * Service role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * This is the most dangerous object in the codebase: it reads and writes every
 * user's data unconditionally. It exists only because the scheduled jobs must
 * legitimately act across all users - finding every pending Moment due a
 * reminder is not a query any single user can make.
 *
 * It MUST NOT be imported outside src/app/api/cron/. DF-SEC-028, DF-ENG-021.
 * That restriction is enforced by an ESLint rule rather than left to memory,
 * because a service role key reaching a client bundle would expose every user
 * at once and no behavioural test would notice.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
