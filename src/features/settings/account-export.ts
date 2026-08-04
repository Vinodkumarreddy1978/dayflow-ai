/**
 * The data export - DF-PRV-020, DF-SET-022.
 *
 * Reads every table belonging to the caller and serialises it, either as one JSON
 * document covering the whole account or as one CSV file per table. CSV cannot
 * represent ten tables in a single file, and adding a zip archive would mean a new
 * dependency for a format the requirement does not ask for, so "CSV" here means
 * "any table, as CSV" rather than "the account, as CSV".
 *
 * Three properties matter more than the format:
 *
 *  1. **Only the caller's rows.** Every read goes through a client holding the
 *     user's own session, so row level security applies exactly as it does in the
 *     browser, and every read additionally filters on the owning column. That
 *     filter is not redundant: `feature_flags_select` in
 *     supabase/migrations/0007_rls_policies.sql deliberately also exposes global
 *     rows with a null `user_id`, which are not the user's data and must not appear
 *     in their export.
 *
 *  2. **Every column.** The column lists below are checked against the row types by
 *     the compiler, so a column added to the schema and not to this file is a build
 *     failure rather than a quietly incomplete export.
 *
 *  3. **Bounded memory.** Rows are read one page at a time and written straight into
 *     a stream. A serverless function on Vercel has a fixed memory allowance and a
 *     wall-clock limit, and `moments` is the one table with no ceiling on how large
 *     it can get - a few years of recording is tens of thousands of rows. Buffering
 *     the account into an array first would work for every account that exists today
 *     and fail for the one that matters.
 */

import type {
  AiReportRow,
  AiUsageRow,
  CategoryRow,
  FeatureFlagRow,
  GoalRow,
  MomentRow,
  ParentCategoryRow,
  ProfileRow,
  PushSubscriptionRowShape,
  SettingsRow,
} from "@/lib/supabase/database.types";
import type { ExportFormat, ExportTableName } from "./account-export-tables";

/** Bumped only when the shape changes in a way an importer would notice. DF-SET-032. */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * Rows per request. Large enough that a year of Moments is a handful of round
 * trips, small enough that one page of the widest table is a few hundred kilobytes.
 */
export const EXPORT_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Column manifest
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS = [
  "id",
  "display_name",
  "subscription_tier",
  "onboarded_at",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ProfileRow)[];

const SETTINGS_COLUMNS = [
  "user_id",
  "queue_limit",
  "reminders_enabled",
  "reminder_interval_minutes",
  "long_activity_warning_minutes",
  "auto_close_enabled",
  "auto_close_minutes",
  "quiet_hours_enabled",
  "quiet_hours_start",
  "quiet_hours_end",
  "overlap_limit",
  "overlap_warn_enabled",
  "gap_warn_hours",
  "timezone",
  "week_starts_on",
  "time_format",
  "date_format",
  "waking_start",
  "waking_end",
  "default_range",
  "default_grouping",
  "show_distraction_default",
  "include_estimated_default",
  "chart_style",
  "productivity_enabled",
  "productivity_weights",
  "push_enabled",
  "notify_queue_reminders",
  "notify_long_activity",
  "notify_auto_close",
  "notify_goal_reminders",
  "goal_reminder_time",
  "notify_daily_review",
  "daily_review_time",
  "notify_weekly_review",
  "notify_achievements",
  "ai_consent",
  "ai_daily_reports",
  "ai_weekly_reports",
  "ai_monthly_reports",
  "ai_recommendations",
  "theme",
  "accent_color",
  "compact_mode",
  "dashboard_order",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof SettingsRow)[];

const PARENT_CATEGORY_COLUMNS = [
  "id",
  "user_id",
  "name",
  "color",
  "icon",
  "is_system",
  "is_distraction",
  "sort_order",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ParentCategoryRow)[];

const CATEGORY_COLUMNS = [
  "id",
  "user_id",
  "parent_category_id",
  "name",
  "color",
  "icon",
  "is_archived",
  "sort_order",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof CategoryRow)[];

const MOMENT_COLUMNS = [
  "id",
  "user_id",
  "category_id",
  "start_at",
  "end_at",
  "duration_minutes",
  "status",
  "source",
  "note",
  "last_reminder_at",
  "warned_at",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof MomentRow)[];

const GOAL_COLUMNS = [
  "id",
  "user_id",
  "target_type",
  "target_id",
  "period",
  "direction",
  "target_minutes",
  "is_active",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof GoalRow)[];

const AI_REPORT_COLUMNS = [
  "id",
  "user_id",
  "period_type",
  "period_start",
  "period_end",
  "facts",
  "content",
  "model",
  "generated_by",
  "created_at",
] as const satisfies readonly (keyof AiReportRow)[];

const AI_USAGE_COLUMNS = [
  "id",
  "user_id",
  "model",
  "input_tokens",
  "output_tokens",
  "estimated_cost",
  "succeeded",
  "created_at",
] as const satisfies readonly (keyof AiUsageRow)[];

// The subscription keys are included rather than redacted. They are the user's own
// browser's keys, they are useless to anyone without this deployment's VAPID private
// key, and DF-PRV-020 asks for every piece of user data - a field withheld from an
// export the user asked for would need a stronger reason than tidiness.
const PUSH_SUBSCRIPTION_COLUMNS = [
  "id",
  "user_id",
  "endpoint",
  "p256dh",
  "auth",
  "user_agent",
  "last_used_at",
  "created_at",
] as const satisfies readonly (keyof PushSubscriptionRowShape)[];

const FEATURE_FLAG_COLUMNS = [
  "id",
  "user_id",
  "flag",
  "enabled",
  "created_at",
] as const satisfies readonly (keyof FeatureFlagRow)[];

/**
 * Compile-time completeness for DF-PRV-020.
 *
 * `MustBeNever` accepts nothing but `never`, so a column present on a row type and
 * absent from the list above makes this alias fail to compile, naming the column it
 * is missing. Types are hand-written in this project (see the header of
 * `src/lib/supabase/database.types.ts`), so the compiler is the only thing that can
 * notice the omission.
 */
type MustBeNever<T extends never> = T;

type _EveryColumnIsExported = MustBeNever<
  | Exclude<keyof ProfileRow, (typeof PROFILE_COLUMNS)[number]>
  | Exclude<keyof SettingsRow, (typeof SETTINGS_COLUMNS)[number]>
  | Exclude<keyof ParentCategoryRow, (typeof PARENT_CATEGORY_COLUMNS)[number]>
  | Exclude<keyof CategoryRow, (typeof CATEGORY_COLUMNS)[number]>
  | Exclude<keyof MomentRow, (typeof MOMENT_COLUMNS)[number]>
  | Exclude<keyof GoalRow, (typeof GOAL_COLUMNS)[number]>
  | Exclude<keyof AiReportRow, (typeof AI_REPORT_COLUMNS)[number]>
  | Exclude<keyof AiUsageRow, (typeof AI_USAGE_COLUMNS)[number]>
  | Exclude<keyof PushSubscriptionRowShape, (typeof PUSH_SUBSCRIPTION_COLUMNS)[number]>
  | Exclude<keyof FeatureFlagRow, (typeof FEATURE_FLAG_COLUMNS)[number]>
>;

export interface ExportTableSpec {
  readonly table: ExportTableName;
  /** The column carrying the owner. `profiles` is keyed by `id`; everything else by `user_id`. */
  readonly ownerColumn: string;
  /**
   * A unique column to page by. Ordering by a non-unique column makes `range`
   * pagination unstable, which drops or duplicates rows across page boundaries.
   */
  readonly primaryKey: string;
  readonly columns: readonly string[];
}

export const EXPORT_TABLES: readonly ExportTableSpec[] = [
  {
    table: "profiles",
    ownerColumn: "id",
    primaryKey: "id",
    columns: PROFILE_COLUMNS,
  },
  {
    table: "settings",
    ownerColumn: "user_id",
    primaryKey: "user_id",
    columns: SETTINGS_COLUMNS,
  },
  {
    table: "parent_categories",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: PARENT_CATEGORY_COLUMNS,
  },
  {
    table: "categories",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: CATEGORY_COLUMNS,
  },
  {
    table: "moments",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: MOMENT_COLUMNS,
  },
  { table: "goals", ownerColumn: "user_id", primaryKey: "id", columns: GOAL_COLUMNS },
  {
    table: "ai_reports",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: AI_REPORT_COLUMNS,
  },
  {
    table: "ai_usage",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: AI_USAGE_COLUMNS,
  },
  {
    table: "push_subscriptions",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: PUSH_SUBSCRIPTION_COLUMNS,
  },
  {
    table: "feature_flags",
    ownerColumn: "user_id",
    primaryKey: "id",
    columns: FEATURE_FLAG_COLUMNS,
  },
];

export function exportTableSpec(table: ExportTableName): ExportTableSpec {
  const spec = EXPORT_TABLES.find((candidate) => candidate.table === table);
  if (!spec) {
    throw new Error(`No export specification for ${table}`);
  }
  return spec;
}

// ---------------------------------------------------------------------------
// The client this module needs
// ---------------------------------------------------------------------------

export type ExportRow = Record<string, unknown>;

export interface ExportPage {
  data: ExportRow[] | null;
  error: { message: string } | null;
}

/**
 * The subset of a Supabase query builder an export uses.
 *
 * Declared structurally rather than taken from `supabase-js` because that library
 * types every builder against one literal table name, so a loop over a manifest
 * cannot be expressed in its types at all. It also makes the pagination and the
 * owner filter testable without a database.
 */
export interface ExportQuery {
  select(columns: string): ExportQuery;
  eq(column: string, value: string): ExportQuery;
  order(column: string, options: { ascending: boolean }): ExportQuery;
  range(from: number, to: number): PromiseLike<ExportPage>;
}

export interface ExportClient {
  from(table: string): ExportQuery;
}

/** The parts of the auth record that belong to the user rather than to the platform. */
export interface ExportAccountFacts {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

export interface AccountExportOptions {
  exportedAt?: string;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * One table, one page at a time.
 *
 * A page shorter than the page size is the last page. That is one request more than
 * strictly necessary when the row count is an exact multiple of the page size, and
 * it avoids a second `count` query on every table for the sake of that case.
 */
export async function* readTablePages(
  client: ExportClient,
  spec: ExportTableSpec,
  userId: string,
  pageSize: number = EXPORT_PAGE_SIZE,
): AsyncGenerator<ExportRow[]> {
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(spec.table)
      .select(spec.columns.join(","))
      .eq(spec.ownerColumn, userId)
      .order(spec.primaryKey, { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`The export could not read ${spec.table}: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length > 0) yield rows;
    if (rows.length < pageSize) return;
  }
}

/**
 * Restated in the manifest's order, so that two exports of the same account differ
 * only where the data differs. Postgres does not promise column order over the REST
 * interface, and a diffable export is worth one object rebuild per row.
 */
function pickColumns(row: ExportRow, columns: readonly string[]): ExportRow {
  const picked: ExportRow = {};
  for (const column of columns) {
    picked[column] = row[column] ?? null;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/**
 * The whole account as one JSON document, emitted progressively.
 *
 * Hand-assembled rather than `JSON.stringify` over a finished object, because the
 * finished object is the thing that must never exist. Each row is stringified on its
 * own and written out, so peak memory is one page rather than one account.
 *
 * The closing braces are written last, which also means a read that fails partway
 * leaves syntactically invalid JSON. That is deliberate: a truncated export that
 * still parses is the one outcome worse than a failed download.
 */
export async function* accountExportChunks(
  client: ExportClient,
  account: ExportAccountFacts,
  options: AccountExportOptions = {},
): AsyncGenerator<string> {
  const exportedAt = options.exportedAt ?? new Date().toISOString();

  yield [
    "{\n",
    `  "dayflow_export_version": ${EXPORT_FORMAT_VERSION},\n`,
    `  "exported_at": ${JSON.stringify(exportedAt)},\n`,
    `  "account": ${JSON.stringify(account)},\n`,
    '  "tables": {',
  ].join("");

  let firstTable = true;

  for (const spec of EXPORT_TABLES) {
    yield `${firstTable ? "\n" : ",\n"}    ${JSON.stringify(spec.table)}: [`;
    firstTable = false;

    let firstRow = true;

    for await (const page of readTablePages(client, spec, account.id, options.pageSize)) {
      for (const row of page) {
        yield `${firstRow ? "\n" : ",\n"}      ${JSON.stringify(pickColumns(row, spec.columns))}`;
        firstRow = false;
      }
    }

    yield firstRow ? "]" : "\n    ]";
  }

  yield "\n  }\n}\n";
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One field, escaped per RFC 4180.
 *
 * Values that would be read as formulas by a spreadsheet are written unchanged. The
 * usual defence is to prefix them with an apostrophe, which corrupts the value for
 * anything that reads the file as data - and the only person who can put a formula
 * into this file is the person downloading it.
 */
export function toCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value as string | number);

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function* tableCsvChunks(
  client: ExportClient,
  spec: ExportTableSpec,
  userId: string,
  options: AccountExportOptions = {},
): AsyncGenerator<string> {
  yield `${spec.columns.map(toCsvField).join(",")}\r\n`;

  for await (const page of readTablePages(client, spec, userId, options.pageSize)) {
    yield `${page
      .map((row) => spec.columns.map((column) => toCsvField(row[column])).join(","))
      .join("\r\n")}\r\n`;
  }
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/**
 * A generator of text chunks as a byte stream.
 *
 * `pull` rather than filling the stream from `start`: a consumer reading slower than
 * the database answers - which on a mobile connection is every consumer - would
 * otherwise have the whole export queued in memory on its behalf, defeating the
 * paging above.
 */
export function chunksToStream(
  chunks: AsyncGenerator<string>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await chunks.next();

      if (next.done) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(next.value));
    },

    async cancel() {
      // A cancelled download must close the generator, or the paging loop keeps
      // querying for an account nobody is listening to any more.
      await chunks.return(undefined);
    },
  });
}

export function exportFilename(
  format: ExportFormat,
  table: ExportTableName | null,
  exportedAt: string,
): string {
  const day = exportedAt.slice(0, 10);
  const suffix = format === "csv" && table ? `-${table.replaceAll("_", "-")}` : "";
  return `dayflow-export${suffix}-${day}.${format}`;
}
