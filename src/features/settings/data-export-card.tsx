"use client";

import { lazy, Suspense, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

/**
 * The dialog carries the format choices, the table list and the download itself, and
 * loads when it is asked for. Deferring what a screen has not yet been asked for is
 * what ADR-015 requires of a route over the 200 kB First Load JS budget, and this one
 * has no headroom at all.
 *
 * `lazy` rather than the `next/dynamic` that `src/features/analytics` uses, because
 * next/dynamic's loader is itself a module in the first-load chunk, and on this route
 * that alone is the difference between 201 kB and passing.
 */
const DataExportDialog = lazy(() =>
  import("./data-export-dialog").then((module) => ({ default: module.DataExportDialog })),
);

/** Export - DF-PRV-020, DF-SET-022. */
export function DataExportCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Your data"
        description="A complete copy of everything DayFlow holds for you, as JSON or as a spreadsheet, whenever you want one."
      />

      <div className="p-4 pt-0">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Download className="size-4" aria-hidden="true" />
          Export my data
        </Button>
      </div>

      {open && (
        <Suspense fallback={null}>
          <DataExportDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </Card>
  );
}
