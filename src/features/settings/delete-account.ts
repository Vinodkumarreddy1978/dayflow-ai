/**
 * Account deletion - DF-PRV-021, DF-PRV-022, DF-SET-023, DF-SET-024.
 *
 * The destruction itself is `public.delete_account()` from
 * supabase/migrations/0015_account_deletion.sql, a `security definer` function that
 * derives its subject from `auth.uid()` and takes no arguments, so nothing here can
 * aim it at another account however wrong it is. ADR-014 records why that is a
 * database function rather than a route handler holding the service role key.
 *
 * What this module owns is the part that has to be right in the client: the typed
 * confirmation, and telling the difference between the several ways the call can
 * fail. Reporting a failed deletion as a success would leave someone believing they
 * had left, which is the worst outcome this feature can produce - worse than
 * refusing, and worse than an error they can read.
 */

/**
 * Typed in full, not a single click. DF-SET-024, DF-PRV-022.
 *
 * A phrase rather than the account's email address: the same deliberate act, and it
 * does not ask someone with a long address to retype it correctly under stress.
 */
export const DELETION_CONFIRMATION_PHRASE = "delete my account";

/**
 * Case and surrounding whitespace are forgiven; the words are not. A mobile keyboard
 * capitalises the first letter and a paste often carries a trailing space, and
 * refusing either would only teach the user that the control is broken.
 */
export function isDeletionConfirmed(input: string): boolean {
  return input.trim().replace(/\s+/g, " ").toLowerCase() === DELETION_CONFIRMATION_PHRASE;
}

export type AccountDeletionFailure =
  "CONFIRMATION_REQUIRED" | "NOT_AVAILABLE" | "NO_SESSION" | "REFUSED" | "UNCONFIRMED";

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionFailure;

  constructor(code: AccountDeletionFailure, message: string) {
    super(message);
    this.name = "AccountDeletionError";
    this.code = code;
  }
}

/** The one call this module makes, declared so it can be exercised without a database. */
export interface AccountDeletionClient {
  rpc(fn: "delete_account"): PromiseLike<{
    error: { code?: string; message?: string } | null;
  }>;
}

/**
 * PostgREST answers `PGRST202` when the function is not in its schema cache, and
 * Postgres answers `42883` when it does not exist at all. Either way migration `0015`
 * has not been applied to this project, which is the state the live project is in
 * today - so this is the most likely failure a real user meets, not a theoretical one.
 */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883", "404"]);

/** Raised by the function itself when there is no session behind the call. */
const NO_SESSION_CODE = "DF040";

export async function requestAccountDeletion(
  client: AccountDeletionClient,
  confirmation: string,
): Promise<void> {
  if (!isDeletionConfirmed(confirmation)) {
    throw new AccountDeletionError(
      "CONFIRMATION_REQUIRED",
      `Type ${DELETION_CONFIRMATION_PHRASE} to confirm.`,
    );
  }

  const { error } = await client.rpc("delete_account");

  if (!error) return;

  const code = error.code ?? "";

  if (MISSING_FUNCTION_CODES.has(code)) {
    throw new AccountDeletionError(
      "NOT_AVAILABLE",
      "Account deletion is not available on this deployment yet, because the database change it needs has not been applied. Nothing has been deleted.",
    );
  }

  if (code === NO_SESSION_CODE) {
    throw new AccountDeletionError(
      "NO_SESSION",
      "Your session has expired. Sign in again and retry. Nothing has been deleted.",
    );
  }

  if (code === "") {
    // supabase-js reports a transport failure as an error with no code. The call may
    // have reached the database and committed, so claiming nothing was deleted would
    // be a guess presented as a fact.
    throw new AccountDeletionError(
      "UNCONFIRMED",
      "DayFlow could not reach the server, so whether the deletion completed is unknown. Sign out and sign in again to check before retrying.",
    );
  }

  // Everything the function does happens in one transaction, so a database error
  // means it rolled back and the account is intact.
  throw new AccountDeletionError(
    "REFUSED",
    "The account could not be deleted. Nothing has been deleted, so it is safe to try again.",
  );
}

export function describeAccountDeletionError(error: unknown): string {
  if (error instanceof AccountDeletionError) return error.message;

  return "The account could not be deleted. Nothing has been deleted, so it is safe to try again.";
}
