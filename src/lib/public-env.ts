/**
 * The configuration the browser is allowed to see, read without a validator.
 *
 * `NEXT_PUBLIC_` values are substituted into the code by the compiler during
 * `next build`; nothing reads `process.env` in a browser. A bundle can therefore
 * only contain the values that were present when it was built, and those are
 * exactly the values the schema in `src/lib/env.ts` checks - so a build with bad
 * configuration fails instead of producing a bundle. Checking the same four
 * strings again at runtime refuses nothing that could reach the browser, and it
 * cost 18 kB of validator in the First Load JS of every route.
 *
 * What that imposes on anything added here:
 *
 * - This module must import nothing. Every client component reaches it, so
 *   whatever it imports lands in the initial JavaScript of the whole
 *   application. `src/lib/env.test.ts` asserts the absence of imports rather
 *   than leaving it to be noticed in review.
 * - A variable added here and not added to `publicSchema` in `src/lib/env.ts` is
 *   a variable nothing validates.
 * - Each name has to appear as a literal `process.env.NEXT_PUBLIC_...`.
 *   Substitution is textual, so a dynamic key silently yields undefined in the
 *   browser.
 *
 * Secrets do not belong here under any circumstances; they are read through
 * `serverEnv()`. DF-CFG-003.
 */
export const publicEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
};
