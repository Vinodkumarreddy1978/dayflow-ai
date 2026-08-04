import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";
import { type Database } from "./database.types";

/**
 * Browser client. Uses the anon key, which is public by design - it identifies
 * the project, not the user. Authorisation comes entirely from the user's JWT
 * combined with row level security, which is why every table in
 * supabase/migrations/0007_rls_policies.sql has explicit policies.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
