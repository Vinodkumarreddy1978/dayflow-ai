"use client";

import { CircleAlert, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/card";
import { useUiStore } from "@/lib/store/ui-store";
import { useNow } from "@/lib/use-now";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { useCategories } from "@/features/categories/use-categories";
import { elapsedMinutes } from "@/lib/domain/moment-rules";
import {
  DEFAULT_QUEUE_LIMIT,
  queueCapacity,
  sortPendingByAge,
  urgencyState,
} from "@/lib/domain/queue-rules";
import {
  DEFAULT_AUTO_CLOSE_MINUTES,
  DEFAULT_WARNING_MINUTES,
} from "@/lib/domain/reminder-rules";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCloseMoment, usePendingMoments } from "./use-moments";
import type { Moment } from "@/lib/supabase/database.types";

/**
 * The pending queue - the first thing on the dashboard, because an open activity
 * is the only thing in this product that is actively decaying. Every hour it
 * stays open, the user's memory of when it really ended gets worse.
 */
export function PendingQueue() {
  const { data: pending, isLoading } = usePendingMoments();
  const { data: settings } = useSettings();
  const openCreateMoment = useUiStore((state) => state.openCreateMoment);

  const limit = settings?.queue_limit ?? DEFAULT_QUEUE_LIMIT;
  const capacity = queueCapacity(pending?.length ?? 0, limit);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!pending || pending.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing open right now"
          description="Start an activity and it will wait here until you close it."
          action={
            <Button onClick={() => openCreateMoment()}>
              <Plus className="size-4" aria-hidden="true" />
              Add activity
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <section aria-label="Open activities" className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-sm font-semibold text-text">
          Open now
          <span className="ml-2 font-normal text-text-muted">
            {capacity.used} of {capacity.limit}
          </span>
        </h2>

        {capacity.isFull && <Badge tone="warning">Queue full</Badge>}
      </div>

      {sortPendingByAge(pending).map((moment) => (
        <PendingCard key={moment.id} moment={moment} />
      ))}
    </section>
  );
}

function PendingCard({ moment }: { moment: Moment }) {
  const now = useNow(30_000);
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const { tree } = useCategories();
  const closeMoment = useCloseMoment();
  const openEditMoment = useUiStore((state) => state.openEditMoment);

  const category = tree.byId.get(moment.category_id);
  const startAt = new Date(moment.start_at);

  const urgency = now
    ? urgencyState(
        startAt,
        {
          warningMinutes:
            settings?.long_activity_warning_minutes ?? DEFAULT_WARNING_MINUTES,
          autoCloseMinutes: settings?.auto_close_minutes ?? DEFAULT_AUTO_CLOSE_MINUTES,
          autoCloseEnabled: settings?.auto_close_enabled ?? true,
        },
        now,
      )
    : "normal";

  const elapsed = now ? elapsedMinutes(startAt, now) : null;

  return (
    <Card
      // The end-to-end suite counts open activities to exercise the queue limit,
      // and a count based on visible text would break the first time the copy
      // changed.
      data-testid="pending-moment"
      className={cn(
        "relative overflow-hidden p-4",
        urgency === "needs_attention" && "border-warning/40",
        urgency === "overdue" && "border-danger/40",
      )}
    >
      {/* The category's own colour, so the queue is scannable at a glance. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: category?.effectiveColor ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">
            {category?.name ?? "Unknown category"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {category?.parent.name} · started{" "}
            {formatTime(startAt, timeZone, settings?.time_format === "24h")}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              tone={
                urgency === "overdue"
                  ? "danger"
                  : urgency === "needs_attention"
                    ? "warning"
                    : "neutral"
              }
            >
              {/* Renders a stable placeholder until the clock mounts. */}
              {elapsed === null ? "Running" : `Running ${formatDuration(elapsed)}`}
            </Badge>

            {urgency !== "normal" && (
              <span className="inline-flex items-center gap-1 text-xs text-warning">
                <CircleAlert className="size-3.5" aria-hidden="true" />
                {urgency === "overdue"
                  ? "Well past your usual limit"
                  : "Still going? Worth checking."}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Button
            size="sm"
            isLoading={closeMoment.isPending && closeMoment.variables?.id === moment.id}
            onClick={() =>
              closeMoment.mutate({ id: moment.id, endAt: new Date().toISOString() })
            }
          >
            Close now
          </Button>

          <Button size="sm" variant="ghost" onClick={() => openEditMoment(moment.id)}>
            Edit
          </Button>
        </div>
      </div>
    </Card>
  );
}
