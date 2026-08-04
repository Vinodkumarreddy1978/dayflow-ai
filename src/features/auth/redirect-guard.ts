import type { Route } from "next";

const DEFAULT_DESTINATION: Route = "/dashboard";

/**
 * Resolves the `next` query parameter into a post-authentication destination,
 * for the middleware's return-you-to-where-you-were behaviour. DF-SYN-051.
 *
 * Shared by the sign-in form and the callback route because it is a security
 * guard, and a guard written out twice is one that eventually differs.
 *
 * A leading slash is not sufficient on its own. Browsers resolve `//example.com`
 * as protocol-relative, and normalise the backslash in `/\example.com` to the
 * same thing, so either would send the user off-site while looking like a local
 * path. Anything unacceptable falls back to the dashboard rather than being
 * refused outright, because the user has just authenticated successfully and
 * should still land somewhere useful.
 *
 * The cast is confined here. The value arrives from a query string at runtime,
 * so `typedRoutes` has no static route type to check it against.
 */
export function safeNextPath(next: string | null | undefined): Route {
  if (!next?.startsWith("/")) return DEFAULT_DESTINATION;
  if (next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_DESTINATION;

  return next as Route;
}
