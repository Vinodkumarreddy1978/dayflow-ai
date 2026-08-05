"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  DELETION_CONFIRMATION_PHRASE,
  describeAccountDeletionError,
  isDeletionConfirmed,
} from "./delete-account";
import { useAccountExport } from "./use-account-export";
import { useDeleteAccount } from "./use-delete-account";

/**
 * The confirmation - DF-SET-024, DF-PRV-022, DF-PRV-023.
 *
 * Loaded on demand by `delete-account-card.tsx` rather than with the settings
 * screen. Most people never open this dialog, and everything it needs - the modal,
 * its focus trap, the deletion call - would otherwise sit in the first load of a
 * route already at the edge of the budget in section 9 of
 * docs/03-ux/22-accessibility-and-responsive-standards.md.
 *
 * The export offer inside it is not a courtesy. DF-PRV-023 and DF-SET-025 require it,
 * and this is the only moment at which offering it is any use.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [confirmation, setConfirmation] = useState("");

  const deletion = useDeleteAccount();
  const download = useAccountExport();

  const confirmed = isDeletionConfirmed(confirmation);

  function close() {
    // Not while the call is in flight: the account may already be gone, and a dialog
    // that vanishes mid-deletion invites a second attempt at something irreversible.
    if (deletion.isPending) return;
    onClose();
  }

  return (
    <Modal
      open
      onClose={close}
      title="Delete your account"
      description="This is permanent. Read what it removes before you confirm."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={deletion.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={deletion.isPending}
            disabled={!confirmed}
            onClick={() => deletion.mutate(confirmation)}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm text-text">Deleting your account removes:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
            <li>every activity you have recorded, and the notes on them</li>
            <li>every category and category group, including the built-in ones</li>
            <li>every goal, along with its streaks</li>
            <li>every AI report, and the record of AI usage</li>
            <li>your settings, your profile and your display name</li>
            <li>notifications on every device you enabled them on</li>
            <li>
              your sign-in details, so the email address can be used to register again
            </li>
          </ul>
        </div>

        <p className="text-sm text-text-muted">
          Nothing in DayFlow can restore any of it afterwards. Copies held in the database
          provider&apos;s own backups are purged within seven days.
        </p>

        <div className="rounded-md border border-border bg-surface-sunken p-3">
          <p className="text-sm font-medium text-text">Take a copy first</p>
          <p className="mt-0.5 text-xs text-text-muted">
            This is the last opportunity. The file contains everything listed above.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            isLoading={download.isPending}
            onClick={() => download.mutate({ format: "json" })}
          >
            <Download className="size-4" aria-hidden="true" />
            Download my data
          </Button>
        </div>

        <Field
          label={`Type ${DELETION_CONFIRMATION_PHRASE} to confirm`}
          error={
            deletion.isError ? describeAccountDeletionError(deletion.error) : undefined
          }
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={deletion.isPending}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
