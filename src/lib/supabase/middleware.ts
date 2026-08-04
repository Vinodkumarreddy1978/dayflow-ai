import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/public-env";
import { type Database } from "./database.types";

/**
 * `/update-password` is deliberately not listed.
 *
 * The recovery link points at `/auth/callback`, which exchanges the code for a
 * real session before redirecting on - so by the time this guard sees
 * `/update-password` the user is authenticated and passes it without needing an
 * exemption. Listing it would let someone arrive with no session at all and meet
 * a form whose only action cannot succeed, and listing it in the signed-in
 * redirect below would send the recovery session straight to the dashboard,
 * making the password impossible to change.
 *
 * `/api` is exempt from the redirect, not from the middleware.
 *
 * Every handler beneath it authenticates for itself - the cron sweeps against
 * `CRON_SECRET`, the rest against the session - and refuses with a 401 the
 * caller can act on. A redirect would hand pg_net an HTML sign-in page instead
 * of the endpoint it was scheduled to call, so the reminder, auto-close and
 * daily-report sweeps would stop running without ever reporting a failure.
 * Session refresh still happens here; only the guard is skipped.
 */
const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up", "/reset-password", "/auth", "/api"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Refreshes the session on every navigation and guards authenticated routes.
 *
 * The response object must be the one returned - creating a fresh
 * NextResponse.next() after the auth call would discard the refreshed session
 * cookies and sign the user out on their next request.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    // DF-SYN-051: return the user to where they were after signing in.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // DF-UX-192
  if (user && ["/sign-in", "/sign-up", "/reset-password"].includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
