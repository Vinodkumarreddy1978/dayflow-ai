"use client";

import { useMemo, useState } from "react";
import { Flame, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { useCategories } from "@/features/categories/use-categories";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { todayInTimeZone } from "@/lib/domain/timezone";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useProductivityScore,
  useUpdateGoal,
  type GoalInput,
  type GoalWithProgress,
} from "./use-goals";
import type { Goal } from "@/lib/supabase/database.types";

export function GoalsView() {
  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const { tree } = useCategories();

  const today = todayInTimeZone(timeZone);
  const { data: goals, isLoading } = useGoals(timeZone, settings?.week_starts_on ?? 1);
  const score = useProductivityScore(today, settings?.productivity_enabled ?? true);

  const [dialogGoal, setDialogGoal] = useState<Goal | null | "new">(null);

  const targetName = (goal: Goal): string => {
    if (goal.target_type === "category") {
      return tree.byId.get(goal.target_id)?.name ?? "Deleted category";
    }
    return (
      tree.parents.find((parent) => parent.id === goal.target_id)?.name ?? "Deleted group"
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Goals</h1>
          <p className="mt-1 text-sm text-text-muted">
            Targets you set for yourself. A streak will not break merely because today is
            still in progress.
          </p>
        </div>

        <Button onClick={() => setDialogGoal("new")}>
          <Plus className="size-4" aria-hidden="true" />
          New goal
        </Button>
      </header>

      {(settings?.productivity_enabled ?? true) && (
        <ProductivityCard score={score.data} isLoading={score.isLoading} />
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (goals ?? []).length === 0 ? (
        <Card>
          <EmptyState
            title="No goals yet"
            description="Set one target you actually care about. One you meet beats five you ignore."
            icon={<Target className="size-6" aria-hidden="true" />}
            action={
              <Button onClick={() => setDialogGoal("new")}>
                <Plus className="size-4" aria-hidden="true" />
                New goal
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {(goals ?? []).map((item) => (
            <li key={item.goal.id}>
              <GoalCard
                item={item}
                name={targetName(item.goal)}
                onEdit={() => setDialogGoal(item.goal)}
              />
            </li>
          ))}
        </ul>
      )}

      {dialogGoal !== null && (
        <GoalDialog
          goal={dialogGoal === "new" ? undefined : dialogGoal}
          onClose={() => setDialogGoal(null)}
        />
      )}
    </div>
  );
}

function ProductivityCard({
  score,
  isLoading,
}: {
  score: number | null | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Productivity score"
        description="Weighted by how you value each group of activities, not by anyone else's idea of productive."
      />
      <div className="p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-12 w-24" />
        ) : score === null || score === undefined ? (
          <p className="text-sm text-text-muted">
            No score for today yet - nothing has been recorded. A day you did not record
            is not a bad day.
          </p>
        ) : (
          <div className="flex items-end gap-4">
            <p className="text-4xl font-semibold tabular-nums text-text">{score}</p>
            <div className="flex-1 pb-2">
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    score >= 65 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger",
                  )}
                  style={{ width: `${score}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-text-subtle">
                50 is neutral. Adjust the weightings in Settings if this does not match
                how your day felt.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function GoalCard({
  item,
  name,
  onEdit,
}: {
  item: GoalWithProgress;
  name: string;
  onEdit: () => void;
}) {
  const deleteGoal = useDeleteGoal();
  const { goal, progress } = item;
  const isAtMost = goal.direction === "at_most";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-text">{name}</h2>
            <Badge tone="neutral">{item.periodLabel}</Badge>
            {progress.met && <Badge tone="success">Met</Badge>}
          </div>

          <p className="mt-0.5 text-xs text-text-muted">
            {isAtMost ? "Keep under" : "At least"} {formatDuration(goal.target_minutes)}
            {goal.period === "daily"
              ? " a day"
              : goal.period === "weekly"
                ? " a week"
                : " a month"}
          </p>
        </div>

        <div className="flex shrink-0 gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            aria-label={`Edit goal for ${name}`}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            aria-label={`Delete goal for ${name}`}
            onClick={() => deleteGoal.mutate(goal.id)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium tabular-nums text-text">
            {formatDuration(progress.achievedMinutes)}
          </span>
          <span className="text-xs tabular-nums text-text-muted">
            of {formatDuration(progress.targetMinutes)}
          </span>
        </div>

        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              // For an at_most goal the bar filling up is bad news, so the colour
              // logic inverts rather than always turning green at 100%.
              isAtMost
                ? progress.met
                  ? "bg-success"
                  : "bg-danger"
                : progress.met
                  ? "bg-success"
                  : "bg-accent",
            )}
            style={{ width: `${Math.max(progress.ratio * 100, 1)}%` }}
          />
        </div>
      </div>

      {goal.period === "daily" && (item.currentStreak > 0 || item.longestStreak > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          {item.currentStreak > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-warning">
              <Flame className="size-3.5" aria-hidden="true" />
              {item.currentStreak} day streak
            </span>
          )}
          {item.longestStreak > 0 && <span>Best: {item.longestStreak} days</span>}
        </div>
      )}
    </Card>
  );
}

function GoalDialog({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { tree } = useCategories();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const [targetType, setTargetType] = useState<GoalInput["targetType"]>(
    goal?.target_type ?? "parent_category",
  );
  const [targetId, setTargetId] = useState(goal?.target_id ?? "");
  const [period, setPeriod] = useState<GoalInput["period"]>(goal?.period ?? "daily");
  const [direction, setDirection] = useState<GoalInput["direction"]>(
    goal?.direction ?? "at_least",
  );
  const [hours, setHours] = useState(Math.floor((goal?.target_minutes ?? 60) / 60));
  const [minutes, setMinutes] = useState((goal?.target_minutes ?? 60) % 60);

  const options = useMemo(() => {
    if (targetType === "category") {
      return tree.categories
        .filter((category) => !category.is_archived)
        .map((category) => ({
          id: category.id,
          label: `${category.parent.name} · ${category.name}`,
        }));
    }
    return tree.parents.map((parent) => ({ id: parent.id, label: parent.name }));
  }, [targetType, tree]);

  const targetMinutes = hours * 60 + minutes;
  const isSaving = createGoal.isPending || updateGoal.isPending;

  // The database caps a target at 24 hours; enforcing it here means the user sees
  // why the button is disabled instead of a rejected save.
  const canSave =
    targetId.length > 0 && targetMinutes >= 1 && targetMinutes <= 1440 && !isSaving;

  function handleSave() {
    if (!canSave) return;
    const payload: GoalInput = { targetType, targetId, period, direction, targetMinutes };

    if (goal) {
      updateGoal.mutate({ id: goal.id, ...payload }, { onSuccess: onClose });
    } else {
      createGoal.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={goal ? "Edit goal" : "New goal"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} isLoading={isSaving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Track">
          {({ id }) => (
            <Select
              id={id}
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value as GoalInput["targetType"]);
                setTargetId("");
              }}
            >
              <option value="parent_category">A whole group</option>
              <option value="category">A single category</option>
            </Select>
          )}
        </Field>

        <Field label={targetType === "category" ? "Category" : "Group"} required>
          {({ id }) => (
            <Select
              id={id}
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="" disabled>
                Choose one
              </option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal type">
            {({ id }) => (
              <Select
                id={id}
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as GoalInput["direction"])
                }
              >
                <option value="at_least">Spend at least</option>
                <option value="at_most">Keep under</option>
              </Select>
            )}
          </Field>

          <Field label="Per">
            {({ id }) => (
              <Select
                id={id}
                value={period}
                onChange={(event) => setPeriod(event.target.value as GoalInput["period"])}
              >
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
                <option value="monthly">Month</option>
              </Select>
            )}
          </Field>
        </div>

        <Field
          label="Target"
          required
          error={
            targetMinutes > 1440
              ? "A target cannot exceed 24 hours."
              : targetMinutes < 1
                ? "Set at least one minute."
                : undefined
          }
        >
          {() => (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={24}
                value={hours}
                onChange={(event) => setHours(Number(event.target.value) || 0)}
                aria-label="Hours"
                className="w-20"
              />
              <span className="text-sm text-text-muted">h</span>

              <Input
                type="number"
                min={0}
                max={59}
                step={5}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value) || 0)}
                aria-label="Minutes"
                className="w-20"
              />
              <span className="text-sm text-text-muted">m</span>

              <span className="ml-auto text-sm tabular-nums text-text-muted">
                {formatDuration(targetMinutes)}
              </span>
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}
