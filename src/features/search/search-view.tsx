"use client";

import { useMemo, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useUiStore } from "@/lib/store/ui-store";
import { useCategories } from "@/features/categories/use-categories";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { elapsedMinutes } from "@/lib/domain/moment-rules";
import { EMPTY_FILTERS, useSearch, type SearchFilters } from "./use-search";
import type { MomentStatus } from "@/lib/supabase/database.types";

export function SearchView() {
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const { tree } = useCategories();
  const openEditMoment = useUiStore((state) => state.openEditMoment);

  const [text, setText] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);

  /**
   * Free text resolves to category ids rather than being sent to the database.
   *
   * The taxonomy is already in memory and is small, so matching here is instant
   * and matches on the group name too - typing "health" finds Gym and Walking,
   * which a server-side match on the category name alone would miss.
   */
  const matchedCategoryIds = useMemo(() => {
    const term = text.trim().toLowerCase();
    if (!term) return null;

    return tree.categories
      .filter(
        (category) =>
          category.name.toLowerCase().includes(term) ||
          category.parent.name.toLowerCase().includes(term),
      )
      .map((category) => category.id);
  }, [text, tree.categories]);

  const effectiveFilters = useMemo<SearchFilters>(
    () => ({
      ...filters,
      categoryIds: matchedCategoryIds !== null ? matchedCategoryIds : filters.categoryIds,
    }),
    [filters, matchedCategoryIds],
  );

  const hasAnyFilter =
    text.trim().length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.startDate !== null ||
    filters.endDate !== null ||
    filters.status !== "all" ||
    filters.minMinutes !== null ||
    filters.maxMinutes !== null;

  // A text term matching nothing must not be sent as an unrestricted query, or
  // searching for a typo would return the user's entire history.
  const textMatchedNothing =
    matchedCategoryIds !== null && matchedCategoryIds.length === 0;

  const { data, isLoading } = useSearch(
    effectiveFilters,
    timeZone,
    hasAnyFilter && !textMatchedNothing,
  );

  const use24Hour = settings?.time_format === "24h";

  const totalMinutes = useMemo(
    () =>
      (data?.moments ?? []).reduce(
        (sum, moment) => sum + (moment.duration_minutes ?? 0),
        0,
      ),
    [data],
  );

  function reset() {
    setText("");
    setFilters(EMPTY_FILTERS);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text">Search</h1>
        <p className="mt-1 text-sm text-text-muted">
          Find past activities by category, date, length or status.
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <Field label="Category or group" hint="Try “gym”, “learning”, “meetings”.">
          {({ id, describedBy }) => (
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
                aria-hidden="true"
              />
              <Input
                id={id}
                aria-describedby={describedBy}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Search categories"
                className="pl-9"
              />
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={filters.startDate ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    startDate: event.target.value || null,
                  }))
                }
              />
            )}
          </Field>

          <Field label="To">
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={filters.endDate ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    endDate: event.target.value || null,
                  }))
                }
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status">
            {({ id }) => (
              <Select
                id={id}
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as MomentStatus | "all",
                  }))
                }
              >
                <option value="all">Any</option>
                <option value="completed">Completed</option>
                <option value="pending">Still open</option>
                <option value="auto_closed">Closed automatically</option>
              </Select>
            )}
          </Field>

          <Field label="At least (minutes)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={filters.minMinutes ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minMinutes: event.target.value ? Number(event.target.value) : null,
                  }))
                }
              />
            )}
          </Field>

          <Field label="At most (minutes)">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={filters.maxMinutes ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    maxMinutes: event.target.value ? Number(event.target.value) : null,
                  }))
                }
              />
            )}
          </Field>
        </div>

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X className="size-4" aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </Card>

      {!hasAnyFilter ? (
        <Card>
          <EmptyState
            title="Search your history"
            description="Set a filter above to look back through what you have recorded."
            icon={<SearchIcon className="size-6" aria-hidden="true" />}
          />
        </Card>
      ) : textMatchedNothing ? (
        <Card>
          <EmptyState
            title={`No category matches “${text.trim()}”`}
            description="Try a shorter term, or check the Categories screen for the exact name."
          />
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (data?.moments ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing found"
            description="No activities match these filters."
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <p className="text-sm text-text-muted">
              {data!.moments.length} {data!.moments.length === 1 ? "result" : "results"}
            </p>
            <Badge tone="accent">{formatDuration(totalMinutes)} total</Badge>
            {data!.truncated && (
              <Badge tone="warning">Showing the most recent 300 - narrow the range</Badge>
            )}
          </div>

          <ul className="space-y-1.5">
            {data!.moments.map((moment) => {
              const category = tree.byId.get(moment.category_id);
              const startAt = new Date(moment.start_at);

              return (
                <li key={moment.id}>
                  <button
                    type="button"
                    onClick={() => openEditMoment(moment.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-border-strong"
                  >
                    <span
                      aria-hidden="true"
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: category?.effectiveColor ?? "#94a3b8" }}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">
                        {category?.name ?? "Unknown category"}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {formatDate(startAt, timeZone, "medium")} ·{" "}
                        {formatTime(startAt, timeZone, use24Hour)}
                        {moment.status === "auto_closed" && " · estimated"}
                      </span>
                    </span>

                    <span className="shrink-0 text-sm tabular-nums text-text-muted">
                      {moment.duration_minutes === null
                        ? `${formatDuration(elapsedMinutes(startAt))} open`
                        : formatDuration(moment.duration_minutes)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
