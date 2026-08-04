import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/features/auth/redirect-guard";

/**
 * Exchanges the code from a confirmation or magic link for a session.
 *
 * The redirect is built from the request's own origin rather than a configured
 * URL so that Vercel preview deployments, which each get a unique hostname, do
 * not bounce the user to production mid-sign-in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const destination = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // A used or expired link is the common case here, and it needs to read as
    // "try again", not as a system failure.
    return NextResponse.redirect(`${origin}/sign-in?error=link_expired`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
