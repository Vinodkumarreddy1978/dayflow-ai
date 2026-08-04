"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * The last resort. Catches errors thrown by the root layout itself, which the
 * boundary in `error.tsx` cannot see because it renders inside it.
 *
 * This component replaces the root layout entirely, so it has to supply its own
 * `<html>` and `<body>`, and the stylesheet has to be imported here rather than
 * inherited. The theme script in the root layout has not run either, so this
 * always renders light - correct rather than unfortunate, since the alternative
 * is depending on something that has just proved it can fail.
 *
 * What reaches here is almost never a component defect. In this application the
 * likely cause is configuration: `src/lib/env.ts` throws at module load when a
 * required variable is missing or malformed, and the root layout is what imports
 * it. So the recovery offered is a reload rather than a link somewhere else,
 * because no route in the application would work either.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error above the root layout", { digest: error.digest });
  }, [error.digest]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
          <main className="w-full max-w-sm">
            <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-card)]">
              <h1 className="text-lg font-semibold text-text">DayFlow AI cannot start.</h1>

              <p className="mt-2 text-sm text-text-muted">
                The application failed before any screen could load. Your recorded
                activity is untouched - this is a fault in the deployment, not in your
                data.
              </p>

              <p className="mt-2 text-sm text-text-muted">
                Try again in a moment. If it persists, the deployment needs attention
                rather than another reload.
              </p>

              <button
                type="button"
                onClick={reset}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
              >
                Try again
              </button>
            </div>

            {error.digest && (
              <p className="mt-4 text-center text-xs text-text-subtle">
                Reference <span className="font-mono">{error.digest}</span>.
              </p>
            )}
          </main>
        </div>
      </body>
    </html>
  );
}
