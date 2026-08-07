import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Lives in `src/` rather than the repository root because the application code
 * is under `src/app`. Next.js looks for middleware beside `app`, so a copy at
 * the root is never compiled and silently never runs.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the service worker, the manifest, and
     * Digital Asset Links. Android fetches `/.well-known/assetlinks.json` with
     * no session and must receive an unredirected 200; routing it through auth
     * returns the sign-in page and a Trusted Web Activity fails verification.
     * The service worker in particular must never be routed through auth, or it
     * cannot register before sign-in.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
