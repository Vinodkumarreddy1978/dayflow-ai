import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";
import { type Database } from "./database.types";

/**
 * Server client for server components, server actions and route handlers.
 * Acts as the signed-in user, so row level security applies exactly as it does
 * in the browser.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server components cannot set cookies. Session refresh is handled
            // by middleware instead, so this is safe to ignore rather than an
            // error worth surfacing.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null. Uses getUser rather than getSession because
 * getUser revalidates the token with the auth server; a session read from a
 * cookie alone can be forged.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
