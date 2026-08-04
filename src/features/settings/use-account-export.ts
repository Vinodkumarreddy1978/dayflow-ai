"use client";

import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import type { ExportFormat, ExportTableName } from "./account-export-tables";

export interface AccountExportRequest {
  format: ExportFormat;
  table?: ExportTableName;
}

const FALLBACK_FILENAME = "dayflow-export";

function filenameFrom(disposition: string | null, request: AccountExportRequest): string {
  const quoted = disposition?.match(/filename="([^"]+)"/)?.[1];
  if (quoted) return quoted;

  const suffix = request.table ? `-${request.table.replaceAll("_", "-")}` : "";
  return `${FALLBACK_FILENAME}${suffix}.${request.format}`;
}

/**
 * Saves the response to a file.
 *
 * A fetch and an object URL rather than a plain link to the route, because a link
 * hands every failure to the browser: a 401 or a stream that dies halfway becomes a
 * tab showing an error document, or a file that looks downloaded and is not. Reading
 * the response here is what lets the interface report working, saved and failed as
 * distinct states. DF-UX-200.
 */
async function saveExport(request: AccountExportRequest): Promise<void> {
  const query = new URLSearchParams({ format: request.format });
  if (request.table) query.set("table", request.table);

  const response = await fetch(`/api/export?${query.toString()}`);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "The export could not be prepared.");
  }

  // Buffered in the browser rather than in the function: the server streams a page
  // at a time so that a large account never sits in a serverless function's memory,
  // and the browser is the one place the whole file has to exist to be saved.
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    // The status line arrives before the first row, so a read that fails partway
    // cannot be reported as a status code. It must not be reported as a success
    // either: what reached the disk would be an incomplete copy of an account.
    throw new Error("The download stopped before it finished. Nothing was saved.");
  }

  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFrom(response.headers.get("Content-Disposition"), request);
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useAccountExport() {
  const toast = useToast();

  return useMutation({
    mutationFn: saveExport,
    onSuccess: () => toast.success("Your data has been downloaded."),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "The export could not be prepared.",
      ),
  });
}
