"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CircleAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/card";
import { useCategoryOptions } from "@/features/categories/use-categories";
import {
  durationMinutes,
  hasBlockingIssue,
  validateMomentTimes,
  type ValidationIssue,
} from "@/lib/domain/moment-rules";
import { wallTimeToInstant } from "@/lib/domain/timezone";
import { formatDuration, toLocalInputValue } from "@/lib/format";
import { queueCapacity } from "@/lib/domain/queue-rules";

export interface MomentFormValues {
  categoryId: string;
  startAt: string;
  endAt: string | null;
  note: string | null;
}

interface MomentFormProps {
  timeZone: string;
  initialValues?: Partial<{
    categoryId: string;
    startAt: string;
    endAt: string | null;
    note: string | null;
  }>;
  pendingCount: number;
  queueLimit: number;
  isEditing: boolean;
  isSubmitting: boolean;
  onSubmit: (values: MomentFormValues) => void;
  onCancel: () => void;
}

/**
 * The form behind every way of recording a Moment.
 *
 * The end time is optional and stays optional. That is the whole product: a
 * Moment saved with only a start time is a first-class record, not a draft, and
 * nothing about the form should suggest it is incomplete. DF-MOM-002.
 */
export function MomentForm({
  timeZone,
  initialValues,
  pendingCount,
  queueLimit,
  isEditing,
  isSubmitting,
  onSubmit,
  onCancel,
}: MomentFormProps) {
  const { groups, isLoading: categoriesLoading } = useCategoryOptions();

  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? "");
  const [startInput, setStartInput] = useState(
    initialValues?.startAt
      ? toLocalInputValue(new Date(initialValues.startAt), timeZone)
      : toLocalInputValue(new Date(), timeZone),
  );
  const [endInput, setEndInput] = useState(
    initialValues?.endAt
      ? toLocalInputValue(new Date(initialValues.endAt), timeZone)
      : "",
  );
  const [note, setNote] = useState(initialValues?.note ?? "");
  const [touched, setTouched] = useState(false);

  const startDate = useMemo(
    () => wallTimeToInstant(startInput, timeZone),
    [startInput, timeZone],
  );
  const endDate = useMemo(
    () => (endInput ? wallTimeToInstant(endInput, timeZone) : null),
    [endInput, timeZone],
  );

  const issues = useMemo<ValidationIssue[]>(() => {
    if (Number.isNaN(startDate.getTime())) {
      return [
        {
          field: "startAt",
          severity: "error",
          code: "INVALID",
          message: "Enter a valid date and time.",
        },
      ];
    }
    return validateMomentTimes({ startAt: startDate, endAt: endDate });
  }, [startDate, endDate]);

  const errorFor = (field: ValidationIssue["field"]) =>
    touched ? issues.find((issue) => issue.field === field)?.message : undefined;

  const duration = durationMinutes(startDate, endDate);
  const willBePending = !endInput;
  const capacity = queueCapacity(pendingCount, queueLimit);

  // Only blocks a *new* pending Moment. Editing one that already exists, or
  // closing one, must never be refused for capacity reasons.
  const blockedByQueue = willBePending && !isEditing && capacity.isFull;

  const canSubmit =
    Boolean(categoryId) && !hasBlockingIssue(issues) && !blockedByQueue && !isSubmitting;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    onSubmit({
      categoryId,
      startAt: startDate.toISOString(),
      endAt: endDate ? endDate.toISOString() : null,
      note: note.trim() ? note.trim() : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="What were you doing?" required error={errorFor("categoryId")}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            required
            value={categoryId}
            disabled={categoriesLoading}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="" disabled>
              {categoriesLoading ? "Loading categories…" : "Choose a category"}
            </option>

            {groups.map((group) => (
              <optgroup key={group.parent.id} label={group.parent.name}>
                {group.options.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Started at" required error={errorFor("startAt")}>
          {({ id, describedBy }) => (
            <div className="flex gap-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                type="datetime-local"
                required
                value={startInput}
                onChange={(event) => setStartInput(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                title="Set to now"
                aria-label="Set start time to now"
                onClick={() => setStartInput(toLocalInputValue(new Date(), timeZone))}
              >
                <Clock className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </Field>

        <Field
          label="Ended at"
          error={errorFor("endAt")}
          hint={willBePending ? "Leave empty to keep it open." : undefined}
        >
          {({ id, describedBy }) => (
            <div className="flex gap-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                type="datetime-local"
                value={endInput}
                onChange={(event) => setEndInput(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                title="Set to now"
                aria-label="Set end time to now"
                onClick={() => setEndInput(toLocalInputValue(new Date(), timeZone))}
              >
                <Clock className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </Field>
      </div>

      {duration !== null && duration > 0 && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          Duration
          <Badge tone="accent">{formatDuration(duration)}</Badge>
        </div>
      )}

      <Field label="Note" hint="Optional. 500 characters at most.">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything worth remembering about this."
          />
        )}
      </Field>

      {/*
        Shown before the user commits, not after the save fails. A refusal that
        arrives only on submit teaches people to distrust the button.
      */}
      {blockedByQueue && (
        <div
          role="status"
          className="flex gap-3 rounded-md bg-warning-subtle px-3 py-3 text-sm text-warning"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              You already have {capacity.used}{" "}
              {capacity.used === 1 ? "activity" : "activities"} open.
            </p>
            <p className="mt-0.5">
              Close one first, or add an end time above to save this as a finished
              activity.
            </p>
          </div>
        </div>
      )}

      {willBePending && !blockedByQueue && !isEditing && (
        <p className="text-xs text-text-muted">
          This will wait in your queue until you add an end time.
          {capacity.free > 0 && ` ${capacity.free} of ${capacity.limit} slots free.`}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} isLoading={isSubmitting}>
          {isEditing
            ? "Save changes"
            : willBePending
              ? "Start activity"
              : "Save activity"}
        </Button>
      </div>
    </form>
  );
}
