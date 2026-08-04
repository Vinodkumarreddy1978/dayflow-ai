"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import {
  EXPORT_TABLE_LABELS,
  EXPORT_TABLE_NAMES,
  type ExportTableName,
} from "./account-export-tables";
import { useAccountExport } from "./use-account-export";

/**
 * Export - DF-PRV-020, DF-SET-022.
 *
 * JSON is one file holding the whole account. CSV is one file per table, because a
 * CSV file has one header row and this account has ten differently shaped tables;
 * offering "the account as CSV" would mean either a zip archive or a file that no
 * spreadsheet opens correctly.
 */
export function DataExportCard() {
  const download = useAccountExport();
  const [table, setTable] = useState<ExportTableName>("moments");

  const busyFormat = download.isPending ? download.variables?.format : undefined;

  return (
    <Card>
      <CardHeader
        title="Your data"
        description="A complete copy, whenever you want one. Yours to keep, and readable without DayFlow."
      />

      <div className="space-y-4 p-4 pt-0">
        <p className="text-sm text-text-muted">
          The JSON file holds every row DayFlow stores for you - your profile, settings,
          category groups, categories, activities, goals, AI reports, AI usage records,
          notification devices and feature flags - together with the email address and
          dates on your sign-in record.
        </p>

        <Button
          variant="secondary"
          isLoading={busyFormat === "json"}
          disabled={download.isPending}
          onClick={() => download.mutate({ format: "json" })}
        >
          <Download className="size-4" aria-hidden="true" />
          Download everything as JSON
        </Button>

        <Field
          label="Or one table as a spreadsheet"
          hint="CSV opens in Excel, Numbers and Google Sheets. One table per file."
        >
          {({ id, describedBy }) => (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id={id}
                aria-describedby={describedBy}
                value={table}
                onChange={(event) => setTable(event.target.value as ExportTableName)}
                className="w-auto min-w-48"
              >
                {EXPORT_TABLE_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {EXPORT_TABLE_LABELS[name]}
                  </option>
                ))}
              </Select>

              <Button
                variant="secondary"
                isLoading={busyFormat === "csv"}
                disabled={download.isPending}
                onClick={() => download.mutate({ format: "csv", table })}
              >
                <Download className="size-4" aria-hidden="true" />
                Download CSV
              </Button>
            </div>
          )}
        </Field>
      </div>
    </Card>
  );
}
