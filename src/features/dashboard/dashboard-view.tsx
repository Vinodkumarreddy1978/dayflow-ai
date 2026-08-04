"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useUiStore } from "@/lib/store/ui-store";
import { useSession } from "@/lib/session-context";
import { useNow } from "@/lib/use-now";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { useCategories } from "@/features/categories/use-categories";
import { PendingQueue } from "@/features/moments/pending-queue";
import { DayTimeline } from "@/features/moments/day-timeline";
import { useDayMoments } from "@/features/moments/use-moments";
import { splitAcrossLocalDays } from "@/lib/domain/moment-rules";
import { todayInTimeZone } from "@/lib/domain/timezone";
import { formatDuration } from "@/lib/format";

export function DashboardView() {
  const session = useSession();
  const timeZone = useTimeZone();
  const now = useNow(60_000);

  useCloseFromNotification();

  // Falls back to the server-provided timezone until settings load, so the date
  // does not shift under the user a moment after the page appears.
  const today = todayInTimeZone(timeZone, now ?? undefined);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text">
          {greeting(now)}
          {session.displayName ? `, ${session.displayName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Here is your day so far. Nothing here is set in stone - fill in whatever you
          remember.
        </p>
      </header>

      <PendingQueue />

      <TodaySummary date={today} timeZone={timeZone} />

      <section aria-label="Today's timeline" className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-sm font-semibold text-text">Timeline</h2>
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            See analytics
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <DayTimeline date={today} timeZone={timeZone} />
      </section>
    </div>
  );
}

/**
 * Opens the close dialog when the user arrived from a reminder's "Close it now"
 * action, which lands on /dashboard?close=<id>.
 *
 * The parameter is stripped immediately afterwards so that a refresh, a back
 * navigation, or a shared URL does not reopen a dialog for an activity the user
 * has already dealt with.
 */
function useCloseFromNotification() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openCloseMoment = useUiStore((state) => state.openCloseMoment);

  useEffect(() => {
    const momentId = searchParams.get("close");
    if (!momentId) return;

    openCloseMoment(momentId);
    router.replace("/dashboard");
  }, [searchParams, openCloseMoment, router]);
}

function greeting(now: Date | null): string {
  // Neutral until the clock mounts, so the server and client agree on first paint.
  if (!now) return "Welcome back";

  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function TodaySummary({ date, timeZone }: { date: string; timeZone: string }) {
  const { data: moments } = useDayMoments(date, timeZone);
  const { data: settings } = useSettings();
  const { tree } = useCategories();
  const now = useNow(60_000);

  const summary = useMemo(() => {
    if (!moments) return { recorded: 0, distracted: 0, topName: null as string | null };

    let recorded = 0;
    let distracted = 0;
    const byCategory = new Map<string, number>();

    for (const moment of moments) {
      const slices = splitAcrossLocalDays(
        new Date(moment.start_at),
        moment.end_at ? new Date(moment.end_at) : null,
        timeZone,
        now ?? new Date(),
      );

      const minutes = slices
        .filter((slice) => slice.date === date)
        .reduce((total, slice) => total + slice.minutes, 0);

      if (minutes <= 0) continue;

      recorded += minutes;
      byCategory.set(
        moment.category_id,
        (byCategory.get(moment.category_id) ?? 0) + minutes,
      );

      if (tree.byId.get(moment.category_id)?.parent.is_distraction) {
        distracted += minutes;
      }
    }

    let topName: string | null = null;
    let topMinutes = 0;
    for (const [categoryId, minutes] of byCategory) {
      if (minutes > topMinutes) {
        topMinutes = minutes;
        topName = tree.byId.get(categoryId)?.name ?? null;
      }
    }

    return { recorded, distracted, topName };
  }, [moments, date, timeZone, now, tree]);

  const showDistraction = settings?.show_distraction_default ?? true;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat label="Recorded today" value={formatDuration(summary.recorded)} />
      <Stat label="Most time on" value={summary.topName ?? "—"} />
      {showDistraction && (
        <Stat
          label="Distracted"
          value={formatDuration(summary.distracted)}
          // Only tinted when there is something to report; a red zero reads as a
          // reprimand for a day that went well.
          tone={summary.distracted > 0 ? "distraction" : "neutral"}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "distraction";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className="mt-1 truncate text-lg font-semibold"
        style={tone === "distraction" ? { color: "var(--color-distraction)" } : undefined}
      >
        {value}
      </p>
    </Card>
  );
}
