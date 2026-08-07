/**
 * The settings write. DF-SET-002.
 *
 * Every control on the settings screen saves itself, so this one function is the
 * whole write path for the feature - and it was broken in production for a
 * reason worth recording here, because the shape of the bug is easy to
 * reintroduce.
 *
 * The call used to be `from("settings").update(patch).select().single()`, with
 * nothing narrowing it to a row. That reads as safe, because row level security
 * confines the statement to the caller's own settings and there is exactly one
 * of those. PostgREST disagrees before RLS is ever consulted: an UPDATE or a
 * DELETE arriving with no filter is refused outright with SQLSTATE 21000,
 * "UPDATE requires a WHERE clause", so that a client which forgets its filter
 * cannot rewrite a table. Every save failed, and the user was told only that the
 * setting could not be saved.
 *
 * So the filter below is not defence in depth and removing it does not merely
 * widen the statement - it is what makes the request legal at all. RLS remains
 * the security boundary; this is the safety catch in front of it.
 *
 * The client is a narrow interface rather than the Supabase client itself, for
 * the same reason `delete-account.ts` declares one: it lets the test drive this
 * function through a stand-in that refuses an unfiltered update exactly as
 * PostgREST does, which is the only kind of test that would have caught the
 * defect.
 */

import type { SettingsInput } from "@/lib/schemas";
import type { Settings } from "@/lib/supabase/database.types";

/**
 * The column `public.settings` is keyed by.
 *
 * `user_id`, not `id`: the table is defined with
 * `user_id uuid primary key references auth.users (id)` in
 * supabase/migrations/0002_profiles_and_settings.sql. Filtering on `id` would be
 * a PostgREST 42703 rather than a silent full-table write, but it would be just
 * as broken, so the name is stated once and used everywhere.
 */
export const SETTINGS_KEY_COLUMN = "user_id";

/** The route the browser reports a failed save to, so it reaches the function logs. */
export const SETTINGS_WRITE_FAILURE_ROUTE = "/api/settings/write-failure";

/** The `event` field to search Vercel's function logs by. DF-OBS-005. */
export const SETTINGS_WRITE_FAILURE_EVENT = "settings.write_failed";

/** As much of a PostgREST error as this module reads. */
export interface PostgrestFailure {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}

export interface SettingsWriteResponse {
  data: Settings | null;
  error: PostgrestFailure | null;
}

export interface SettingsUpdateBuilder {
  eq(column: typeof SETTINGS_KEY_COLUMN, value: string): SettingsUpdateBuilder;
  select(): { single(): PromiseLike<SettingsWriteResponse> };
}

export interface SettingsWriteClient {
  from(table: "settings"): { update(patch: SettingsInput): SettingsUpdateBuilder };
}

/**
 * The one call `saveSettings` makes into Supabase, as a function.
 *
 * Taking the started update rather than the client is not a style choice.
 * Checking a whole `SupabaseClient<Database>` against a structural interface
 * makes the compiler unfold every table in the schema through every overload of
 * `from`, which it gives up on with TS2589. This narrows the comparison to the
 * one builder that is actually used, and it is still an interface the test can
 * implement, which is the property that matters.
 */
export type SettingsUpdater = (patch: SettingsInput) => SettingsUpdateBuilder;

/**
 * A failed save, carrying the database's own account of it.
 *
 * `message` is the sentence shown to the user; the database's wording is kept
 * separately under `databaseMessage` so that it can be logged without ever being
 * rendered. "UPDATE requires a WHERE clause" is meaningless to the person
 * changing their clock format and precise to whoever has to fix it.
 */
export class SettingsWriteError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  readonly databaseMessage: string | null;
  /** The column names in the rejected patch. Names only - never their values. */
  readonly fields: readonly string[];

  constructor(failure: PostgrestFailure, fields: readonly string[]) {
    super(describeFailure(failure));
    this.name = "SettingsWriteError";
    this.code = failure.code ?? null;
    this.hint = failure.hint ?? null;
    this.databaseMessage = failure.message ?? null;
    this.fields = fields;
  }
}

function describeFailure(failure: PostgrestFailure): string {
  // supabase-js reports a request that never arrived as an error with no code.
  // Blaming the setting for a dropped connection sends the user to the wrong
  // place, so the two are worded differently.
  if (!failure.code) {
    return "DayFlow could not reach the server, so that setting was not saved. It has been put back.";
  }

  // The code is included because it is the one thing that makes a support
  // conversation short, and it costs a reader who does not care nothing.
  return `That setting could not be saved, so it has been put back. The failure was reported to DayFlow as ${failure.code}.`;
}

export async function saveSettings(
  update: SettingsUpdater,
  userId: string,
  patch: SettingsInput,
): Promise<Settings> {
  const { data, error } = await update(patch)
    // Not optional. See the note at the top of this file: without it PostgREST
    // refuses the request with 21000 before row level security is consulted.
    .eq(SETTINGS_KEY_COLUMN, userId)
    .select()
    .single();

  if (error) throw new SettingsWriteError(error, Object.keys(patch));

  // `single()` cannot return a null row without an error, but the type allows
  // it, and a settings screen that silently caches null is worse than a refusal.
  if (!data) {
    throw new SettingsWriteError(
      { code: "PGRST116", message: "The settings row was not returned by the update." },
      Object.keys(patch),
    );
  }

  return data;
}

/**
 * A change the application refuses before it reaches the database, as opposed
 * to one the database itself rejected. Its message is written for the user, so
 * it is shown as it stands.
 */
export class LockedSettingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockedSettingError";
  }
}

/**
 * The productivity weight of the system "Distracted Time" group is not the
 * user's to set.
 *
 * That group is reserved: it is seeded on every account with `is_system`, it
 * owns a colour no other group may use (DF-DS-104), and the distraction share
 * is computed from it. A positive weight would have the same minutes counting as
 * distraction in one figure and as productive time in another, and the score
 * would be quietly incoherent rather than visibly wrong.
 *
 * Enforced on the write path and not only on the control, so that a patch
 * assembled anywhere else is refused too. It cannot be enforced in
 * `settingsSchema`, because the key is the account's own parent category id and
 * a schema has no way to recognise one; and it cannot be enforced on a server,
 * because settings go from the browser straight to PostgREST. The only stronger
 * place is a database trigger, which is a migration.
 */
export function assertNoLockedWeightChange(
  patch: SettingsInput,
  previous: Pick<Settings, "productivity_weights"> | null,
  lockedKey: string | null,
): void {
  const next = patch.productivity_weights;
  // Nothing to compare against is not permission. It is also not a change: the
  // control cannot have rendered without both the row and the category tree.
  if (!next || !lockedKey || !previous) return;

  const stored = (previous.productivity_weights ?? {}) as Record<string, number>;
  // Inequality rather than a presence check, so that dropping the key from the
  // object counts as changing it. A jsonb update replaces the whole value.
  if (next[lockedKey] === stored[lockedKey]) return;

  throw new LockedSettingError(
    "The weight for Distracted Time is fixed, so that change was not saved.",
  );
}

export function describeSettingsWriteError(error: unknown): string {
  if (error instanceof LockedSettingError) return error.message;
  if (error instanceof SettingsWriteError) return error.message;

  return "That setting could not be saved, so it has been put back.";
}

/**
 * What the browser sends to the server so the cause survives in the function
 * logs. Column names and the database's own error fields; no values, because a
 * settings row is personal data under DF-OBS-002.
 */
export interface SettingsWriteFailureReport {
  code: string | null;
  message: string | null;
  hint: string | null;
  fields: string[];
}

export function toSettingsWriteFailureReport(
  error: unknown,
): SettingsWriteFailureReport | null {
  if (!(error instanceof SettingsWriteError)) return null;

  return {
    code: error.code,
    message: error.databaseMessage,
    hint: error.hint,
    fields: [...error.fields],
  };
}

/**
 * The context of the log line, built here rather than in the route handler so
 * that the field names an operator searches on are covered by a test.
 *
 * `userId` is taken from the server's own session by the caller and never from
 * the request body: a report is unauthenticated data, and a log that can be
 * attributed to any account on request is not evidence of anything.
 */
export function settingsWriteFailureLog(
  report: SettingsWriteFailureReport,
  userId: string,
): Record<string, unknown> {
  return {
    event: SETTINGS_WRITE_FAILURE_EVENT,
    route: SETTINGS_WRITE_FAILURE_ROUTE,
    userId,
    code: report.code,
    databaseMessage: report.message,
    hint: report.hint,
    fields: report.fields,
  };
}

/**
 * Reports a failed save to the server, where the structured logger runs.
 *
 * The write itself goes from the browser straight to PostgREST, so nothing about
 * it passes through a Vercel function and nothing about it appears in the
 * function logs on its own. This one small request is what puts it there, and it
 * is deliberately the only server round trip the failure path makes.
 *
 * Never awaited for correctness and never allowed to throw: the user has already
 * been told, and a failed report must not turn one problem into two.
 */
export async function reportSettingsWriteFailure(error: unknown): Promise<void> {
  const report = toSettingsWriteFailureReport(error);
  if (!report) return;

  try {
    await fetch(SETTINGS_WRITE_FAILURE_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      // The report often coincides with the user navigating away from the
      // screen that failed, which cancels an ordinary fetch.
      keepalive: true,
    });
  } catch {
    /* A diagnostic that breaks the app it diagnoses is worse than no diagnostic. */
  }
}
