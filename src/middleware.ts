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
     * Everything except static assets, the service worker and the manifest.
     * The service worker in particular must never be routed through auth, or it
     * cannot register before sign-in.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
