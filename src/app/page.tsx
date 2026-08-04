import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleAlert, Clock, ListChecks, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server";

const features = [
  {
    icon: Clock,
    title: "Record it later",
    description:
      "Save an activity with just a category and a start time. Close it whenever you remember. Forgetting is expected.",
  },
  {
    icon: ListChecks,
    title: "A queue that stays small",
    description:
      "Two open activities at a time. A third is refused until you close one, which is what keeps your history worth reading.",
  },
  {
    icon: CircleAlert,
    title: "Distraction, named honestly",
    description:
      "Group the things that pull you away and see them separately, or hide them entirely when you would rather not.",
  },
  {
    icon: Sparkles,
    title: "Insight, not just numbers",
    description:
      "Reports that describe what changed and why it might matter, built on figures calculated before the model ever sees them.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-accent text-sm font-bold text-on-accent">
            D
          </span>
          <span className="text-sm font-semibold text-text">DayFlow AI</span>
        </div>

        <Link
          href="/sign-in"
          className="text-sm font-medium text-text-muted hover:text-text"
        >
          Sign in
        </Link>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5">
        <section className="py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-text sm:text-5xl">
            Find out where your hours actually went.
          </h1>

          <p className="mt-5 max-w-xl text-base text-text-muted sm:text-lg">
            DayFlow AI records your day as <em>Moments</em> - real stretches of lived time
            - rather than tasks you meant to do. No timer to remember to start, and no
            guilt for filling it in afterwards.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Start tracking
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>

            <Link
              href="/sign-in"
              className="inline-flex h-12 items-center rounded-md border border-border-strong px-6 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
            >
              I already have an account
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-surface-raised p-5"
              >
                <Icon className="size-5 text-accent" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-semibold text-text">{feature.title}</h2>
                <p className="mt-1.5 text-sm text-text-muted">{feature.description}</p>
              </div>
            );
          })}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-5 py-6 text-xs text-text-muted">
          Your history belongs to you. Export it or delete it at any time.
        </div>
      </footer>
    </div>
  );
}
