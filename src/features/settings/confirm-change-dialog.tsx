"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { copyFor } from "./change-copy";
import type { PendingConfirmation } from "./change-guard";

/**
 * The question asked before a high-impact setting is written. DF-SET-005.
 *
 * Loaded on demand for the reason `data-export-card.tsx` explains: the modal and
 * its focus trap are not in the settings first load, and this route has no room
 * to put them there for a dialog most sessions never open. The wording lives in
 * `change-copy.ts` so that it is deferred along with this.
 *
 * Cancel comes first in the footer, so it is what the modal's own focus handling
 * lands on and what a keyboard user answers with by reflex.
 */
export function ConfirmChangeDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingConfirmation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmation = copyFor(pending);

  return (
    <Modal
      open
      onClose={onCancel}
      title={confirmation.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>{confirmation.confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">{confirmation.description}</p>
    </Modal>
  );
}
