"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/store/ui-store";
import { useSettings, useTimeZone } from "@/features/settings/use-settings";
import { DEFAULT_QUEUE_LIMIT } from "@/lib/domain/queue-rules";
import { MomentForm, type MomentFormValues } from "./moment-form";
import {
  useCreateMoment,
  useDeleteMoment,
  usePendingMoments,
  useUpdateMoment,
} from "./use-moments";

/**
 * The single Moment dialog, shared by every entry point.
 *
 * Rendered once at the layout level rather than per screen, so that adding an
 * activity from the sidebar, the mobile button, an empty timeline slot or the
 * keyboard shortcut all reach exactly the same code.
 */
export function MomentModal() {
  const modal = useUiStore((state) => state.momentModal);
  const closeModal = useUiStore((state) => state.closeMomentModal);

  const timeZone = useTimeZone();
  const { data: settings } = useSettings();
  const { data: pending = [] } = usePendingMoments();

  const createMoment = useCreateMoment();
  const updateMoment = useUpdateMoment();
  const deleteMoment = useDeleteMoment();

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const existing = useMemo(
    () => pending.find((moment) => moment.id === modal?.momentId),
    [pending, modal?.momentId],
  );

  if (!modal) return null;

  const isEditing = modal.mode !== "create";

  function handleClose() {
    setConfirmingDelete(false);
    closeModal();
  }

  function handleSubmit(values: MomentFormValues) {
    if (isEditing && modal?.momentId) {
      updateMoment.mutate(
        {
          id: modal.momentId,
          categoryId: values.categoryId,
          startAt: values.startAt,
          endAt: values.endAt,
          note: values.note,
        },
        { onSuccess: handleClose },
      );
      return;
    }

    createMoment.mutate(values, { onSuccess: handleClose });
  }

  const title = isEditing ? "Edit activity" : "Add activity";
  const isSubmitting = createMoment.isPending || updateMoment.isPending;

  return (
    <Modal
      open
      onClose={handleClose}
      title={title}
      description={
        isEditing
          ? undefined
          : "Record what you were doing. The end time can wait until you remember."
      }
      footer={
        isEditing && modal.momentId ? (
          confirmingDelete ? (
            <div className="flex w-full items-center justify-between gap-3">
              <p className="text-sm text-text-muted">Delete this permanently?</p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={deleteMoment.isPending}
                  onClick={() =>
                    deleteMoment.mutate(modal.momentId!, { onSuccess: handleClose })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-danger"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )
        ) : undefined
      }
    >
      <MomentForm
        // Remounts the form when switching between Moments, so stale field
        // values from the previously edited one cannot leak across.
        key={modal.momentId ?? "create"}
        timeZone={timeZone}
        isEditing={isEditing}
        isSubmitting={isSubmitting}
        pendingCount={pending.length}
        queueLimit={settings?.queue_limit ?? DEFAULT_QUEUE_LIMIT}
        initialValues={
          existing
            ? {
                categoryId: existing.category_id,
                startAt: existing.start_at,
                // In "close" mode the end field is prefilled with now, because
                // that is what the user almost always means by closing it.
                endAt:
                  modal.mode === "close"
                    ? new Date().toISOString()
                    : (existing.end_at ?? null),
                note: existing.note,
              }
            : { startAt: modal.presetStartAt }
        }
        onSubmit={handleSubmit}
        onCancel={handleClose}
      />
    </Modal>
  );
}
