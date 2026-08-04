import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The 404. A server component, so it adds nothing to any client bundle - unlike
 * `error.tsx`, which has to be a client component to offer a retry.
 *
 * The two links are both offered on purpose. A signed-in user wants the dashboard;
 * a signed-out visitor following a stale link would be bounced from it to sign-in
 * by the middleware and lose the thread, so the landing page is here too.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <main id="main" className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium text-text-subtle">404</p>

          <h1 className="mt-1 text-lg font-semibold text-text">
            That page does not exist.
          </h1>

          <p className="mt-2 text-sm text-text-muted">
            The address may be mistyped, or it may be a screen that has since moved.
            Nothing is wrong with your account.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Go to the dashboard
            </Link>

            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
            >
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
