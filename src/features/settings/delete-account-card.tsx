"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
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
 * Account deletion - DF-SET-023, DF-SET-024, DF-PRV-022, DF-PRV-023.
 *
 * The export offer inside the dialog is not a courtesy. DF-PRV-023 and DF-SET-025
 * require it, and it is the only moment where offering it is any use.
 */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const deletion = useDeleteAccount();
  const download = useAccountExport();

  const confirmed = isDeletionConfirmed(confirmation);

  function openDialog() {
    setConfirmation("");
    deletion.reset();
    setOpen(true);
  }

  function closeDialog() {
    // Not while the call is in flight: the account may already be gone, and a dialog
    // that vanishes mid-deletion invites a second attempt at something irreversible.
    if (deletion.isPending) return;
    setOpen(false);
  }

  return (
    <Card className="border-danger/40">
      <CardHeader
        title="Delete account"
        description="Removes your account and everything in it. There is no undo, and no version of this that support can reverse."
      />

      <div className="p-4 pt-0">
        <Button variant="danger" onClick={openDialog}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete my account
        </Button>
      </div>

      <Modal
        open={open}
        onClose={closeDialog}
        title="Delete your account"
        description="This is permanent. Read what it removes before you confirm."
        footer={
          <>
            <Button variant="ghost" onClick={closeDialog} disabled={deletion.isPending}>
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
              <li>every AI report and the record of AI usage</li>
              <li>your settings, your profile and your display name</li>
              <li>notifications on every device you have enabled them on</li>
              <li>
                your sign-in details, so the email address can be used to register again
              </li>
            </ul>
          </div>

          <p className="text-sm text-text-muted">
            Nothing in DayFlow can restore any of it afterwards. Copies held in the
            database provider&apos;s own backups are purged within seven days.
          </p>

          <div className="rounded-md border border-border bg-surface-sunken p-3">
            <p className="text-sm font-medium text-text">Take a copy first</p>
            <p className="mt-0.5 text-xs text-text-muted">
              This is the last opportunity. The file contains everything above.
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
    </Card>
  );
}
