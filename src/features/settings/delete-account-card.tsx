"use client";

import { lazy, Suspense, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

/**
 * Deferred for the same reason as the export dialog, and see that file for why this
 * is `lazy` rather than the `next/dynamic` used elsewhere. Most accounts will never
 * open this one at all.
 */
const DeleteAccountDialog = lazy(() =>
  import("./delete-account-dialog").then((module) => ({
    default: module.DeleteAccountDialog,
  })),
);

/** Account deletion - DF-SET-023. The confirmation itself is in the dialog. */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-danger/40">
      <CardHeader
        title="Delete account"
        description="Removes your account and everything in it. There is no undo, and no version of this that anyone can reverse for you afterwards."
      />

      <div className="p-4 pt-0">
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete my account
        </Button>
      </div>

      {open && (
        <Suspense fallback={null}>
          <DeleteAccountDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </Card>
  );
}
