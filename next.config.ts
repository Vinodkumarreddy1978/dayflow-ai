import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * The browser talks to Supabase directly - REST for queries, a websocket for
 * realtime - so both schemes on that one origin have to be allowed by name.
 *
 * Derived from the configured project rather than hard-coded as
 * `https://*.supabase.co`, because a wildcard would also permit every other
 * project on the platform to be contacted from this origin. Falls back to the
 * wildcard only when the variable is absent, which is a build that is about to
 * fail in `src/lib/env.ts` anyway.
 */
function supabaseConnectSources(): string[] {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    const { origin } = new URL(configured ?? "");
    return [origin, origin.replace(/^https:/, "wss:")];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

/**
 * DF-SEC-023. A policy is what limits the damage an injected script can do, so
 * the absence of one makes every other control the last line of defence.
 *
 * Two directives are looser than they look, and both are deliberate:
 *
 * `script-src` permits `'unsafe-inline'` because the App Router serves its
 * hydration payload as inline script tags. Removing it requires per-request
 * nonces issued from the middleware, which Next.js supports but which opts every
 * route out of static rendering - including the landing page, the only route here
 * that is static. That is the upgrade path if this policy is ever tightened; it
 * is not free.
 *
 * `'unsafe-eval'` is added in development only, where React Refresh needs it.
 * DF-SEC-023 forbids it, and that is the production build the requirement is
 * about. A dev server is not reachable from the internet.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    // Tailwind ships a stylesheet, but Next emits inline style attributes and a
    // critical-CSS block that no nonce reaches.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabaseConnectSources()],
    // The service worker, and the manifest that points at it.
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    // Nothing in this product embeds or is embedded. frame-ancestors is the
    // modern half of the X-Frame-Options header below, which older browsers read.
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    // Without base-uri an injected <base> tag redirects every relative script
    // and form on the page, which survives the rest of this policy.
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");

  // Pointless against a dev server on http, and it would break one served over
  // https on localhost by upgrading requests that have nowhere to go.
  return isDevelopment ? policy : `${policy}; upgrade-insecure-requests`;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Type-checks every href against the routes that actually exist, so a link to
  // a page that was renamed or never built fails the build rather than becoming
  // a 404 someone finds later.
  typedRoutes: true,
  async headers() {
    return [
      {
        // The service worker must be allowed to control the whole origin, and
        // must never be served from cache or push updates will not roll out.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // DF-SEC-021. Two years, because a short max-age is a window rather
          // than a protection. Vercel may already send this for its own
          // domains; setting it here makes it true of a custom domain too.
          //
          // Omitted in development: a browser that has seen this header for
          // localhost refuses plain http there afterwards, for every project on
          // the machine, and clearing it means editing browser internals.
          ...(isDevelopment
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;
