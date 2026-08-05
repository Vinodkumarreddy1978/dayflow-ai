import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  accountExportChunks,
  chunksToStream,
  exportFilename,
  exportTableSpec,
  tableCsvChunks,
  type ExportAccountFacts,
  type ExportClient,
} from "@/features/settings/account-export";
import {
  isExportFormat,
  isExportTableName,
  type ExportFormat,
  type ExportTableName,
} from "@/features/settings/account-export-tables";
import { logger } from "@/lib/logger";

/**
 * The user's own data, on request. DF-PRV-020, DF-SET-022.
 *
 * `GET` because it changes nothing, which also lets the browser stream the response
 * straight to disk. The session comes from the request's cookies through the
 * ordinary server client, so row level security applies: this handler holds no
 * elevated privilege of any kind and could not read another account if it tried.
 *
 * The response is streamed rather than assembled. A Hobby-plan function on Vercel is
 * allowed 60 seconds, and the paging in `account-export.ts` keeps memory flat, so the
 * limit that bites first is wall clock on an account far larger than any that exists
 * today.
 */
export const maxDuration = 60;

/**
 * Reports a read that failed after the response had already begun.
 *
 * The status line is sent with the first chunk, so a table that fails on page four
 * cannot be answered with a 500 - the browser has a 200 and a partial file, and
 * `use-account-export.ts` turns that into "the download stopped before it finished".
 * That is all the user can act on, and it is the entire trace unless this is here:
 * without it the only surviving record is whatever Next.js prints for a rejected
 * stream, which carries no user, no table and no `event` to query on.
 *
 * The identifiers are the request, never the rows. Nothing from the export body
 * passes through here, and `logger` drops a PostgreSQL `detail` field - which is
 * where a failing query would otherwise put the offending row. DF-OBS-002, DF-OBS-005.
 */
async function* loggedChunks(
  chunks: AsyncGenerator<string>,
  context: { userId: string; format: ExportFormat; table: ExportTableName | null },
): AsyncGenerator<string> {
  try {
    yield* chunks;
  } catch (cause) {
    logger.error("Data export failed", {
      event: "export.error",
      route: "/api/export",
      ...context,
      error: cause,
    });

    // Rethrown so the stream still aborts. A logged failure that then completes the
    // download would hand the user a truncated copy of their account as a success.
    throw cause;
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "json";
  const table = params.get("table");

  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: "Ask for format=json or format=csv." },
      { status: 400 },
    );
  }

  if (format === "csv" && (table === null || !isExportTableName(table))) {
    return NextResponse.json(
      { error: "A CSV export needs the name of one table." },
      { status: 400 },
    );
  }

  // See the note on ExportClient: supabase-js ties a query builder to a single
  // literal table name, so iterating the manifest is not expressible in its types.
  // The cast is confined to this line and widens nothing - the interface is a
  // strict subset of the client's own surface.
  const client = supabase as unknown as ExportClient;
  const exportedAt = new Date().toISOString();

  const account: ExportAccountFacts = {
    id: user.id,
    email: user.email ?? null,
    created_at: user.created_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };

  // Narrowed once. The two checks above have already established that a CSV request
  // carries a valid table name and a JSON one is not asked for a table at all.
  const csvTable =
    format === "csv" && table !== null && isExportTableName(table) ? table : null;

  const chunks =
    csvTable === null
      ? accountExportChunks(client, account, { exportedAt })
      : tableCsvChunks(client, exportTableSpec(csvTable), user.id, { exportedAt });

  const filename = exportFilename(format, csvTable, exportedAt);

  return new Response(
    chunksToStream(loggedChunks(chunks, { userId: user.id, format, table: csvTable })),
    {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // An export is the most sensitive response this application produces. No
        // shared cache, no browser cache, no CDN copy.
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
