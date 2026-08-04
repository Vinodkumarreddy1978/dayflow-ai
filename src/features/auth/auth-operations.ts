import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/public-env";

/**
 * Every Supabase call the four authentication screens make, kept in one module
 * away from the components that use them.
 *
 * The separation is what makes those screens affordable. Importing this pulls in
 * the browser Supabase client, which constructs its Postgrest, Realtime, Storage
 * and Functions sub-clients eagerly whether or not a screen uses them: around
 * 64 kB gzipped, none of which is needed to render a form or to type into one.
 * The screens therefore load this module lazily and stay inside the "Initial
 * JavaScript, gzipped" budget in section 9 of
 * docs/03-ux/22-accessibility-and-responsive-standards.md.
 *
 * Being a separate chunk, it can fail to arrive on a network that has since
 * dropped. Every screen loading it has to say so rather than fall silent - see
 * OPERATIONS_UNAVAILABLE in ./auth-messages.
 *
 * Each function creates its own client rather than sharing one at module scope,
 * matching how these calls behaved when they sat inline in the components.
 */

export function signInWithPassword(email: string, password: string) {
  return createClient().auth.signInWithPassword({ email, password });
}

export function signUpWithPassword(email: string, password: string) {
  return createClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback`,
      // Recorded so the timezone is right from the very first Moment, rather
      // than defaulting to UTC until the user visits settings.
      data: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  });
}

export function requestPasswordReset(email: string) {
  return createClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/update-password`,
  });
}

export function updatePassword(password: string) {
  return createClient().auth.updateUser({ password });
}
