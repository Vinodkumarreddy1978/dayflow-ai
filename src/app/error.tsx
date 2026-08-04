"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Catches anything thrown while rendering a page or
 * a layout below the root, on the server or in the browser.
 *
 * Placed at the root of `app/` rather than once per route group, deliberately: an
 * error boundary is a client component and is bundled into the initial JavaScript
 * of every route it covers, and `/dashboard`, `/calendar/[date]` and `/goals` are
 * already over the 200 kB budget in DF-A11Y-060. One boundary for the whole
 * application is the version of this that costs the least, and there is nothing a
 * per-group boundary would say differently.
 *
 * Nothing from `error` is rendered except `digest`. In a production build Next.js
 * has already replaced the message of a server-side error with a generic string,
 * but an error thrown in the browser arrives intact - so a component that renders
 * `error.message` leaks internals on exactly the paths where it matters. The
 * digest is a hash Next.js also writes to the server log for the same error,
 * which makes it the one useful thing to show: a reference the user can quote.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deliberately not the structured logger from `@/lib/logger`. Nothing
    // collects a browser console - there is no client error reporting service
    // configured - so a queryable JSON line here would buy nothing and would add
    // its redaction machinery to the initial bundle of every route. The digest
    // correlates this with the server-side entry, which is collected.
    console.error("Unhandled error rendering a route", { digest: error.digest });
  }, [error.digest]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <main id="main" className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-card)]">
          <h1 className="text-lg font-semibold text-text">Something went wrong.</h1>

          <p className="mt-2 text-sm text-text-muted">
            This screen failed to load. Nothing you have recorded has been changed or
            lost - the failure is in showing it to you, not in your history.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Try again
            </button>

            {/*
              A full navigation rather than a client-side one. Whatever broke is
              still in memory, and the point of this link is to leave it behind.
            */}
            <a
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
            >
              Go to the dashboard
            </a>
          </div>
        </div>

        {error.digest && (
          <p className="mt-4 text-center text-xs text-text-subtle">
            Reference <span className="font-mono">{error.digest}</span>. Quote it if you
            report this.
          </p>
        )}
      </main>
    </div>
  );
}
