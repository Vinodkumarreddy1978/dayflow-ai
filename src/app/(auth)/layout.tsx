import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <main id="main" className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-base font-bold text-on-accent">
              D
            </span>
            <span className="text-lg font-semibold text-text">DayFlow AI</span>
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-card)]">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          Your activity history is private to your account. It is never sold, and it is
          never used to train anyone&apos;s model.
        </p>
      </main>
    </div>
  );
}
