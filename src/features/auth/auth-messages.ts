import { MIN_PASSWORD_LENGTH } from "./password-policy";

/**
 * A confirmation or recovery link that does not work can only be reported by
 * redirecting to sign-in with a code, and until it is read the user lands on an
 * ordinary sign-in page with no idea what went wrong. Neither case is a system
 * failure, so both read as an instruction rather than an apology.
 *
 * An unrecognised code maps to nothing. A generic "something went wrong" would
 * tell the user less than the bare form does.
 */
const CALLBACK_NOTICES: Record<string, string> = {
  missing_code:
    "That link was incomplete, so there was nothing to confirm. Open the most recent link from your email, or request a new one.",
  link_expired:
    "That link has expired or has already been used. Request a new one and it will work.",
};

export function callbackNotice(code: string | null): string | null {
  return CALLBACK_NOTICES[code ?? ""] ?? null;
}

/**
 * The recovery link is the only credential /update-password holds, so every way
 * Supabase can reject it has to arrive at the same instruction.
 */
const RECOVERY_LINK_EXPIRED =
  "That reset link is no longer valid. Reset links work once and expire after an hour. Request a new one and it will work.";

const RECOVERY_LINK_CODES = [
  "otp_expired",
  "session_not_found",
  "session_expired",
  "bad_jwt",
] as const;

/**
 * Whether the save failed because the recovery link itself is spent, which is
 * the one failure the user cannot resolve from the form they are looking at.
 * The caller offers a way to request a new link instead.
 */
export function isRecoveryLinkError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && RECOVERY_LINK_CODES.some((known) => known === code);
}

/** DF-UX-191: this must not settle whether the address is already registered. */
const ACCOUNT_NOT_CREATED =
  "That account could not be created. If you already have one for this address, sign in or reset your password instead.";

/**
 * The Supabase error codes these four screens can actually produce, in the
 * product's own voice. Codes are taken from the `ErrorCode` union in
 * @supabase/auth-js rather than from the message text, which is not stable.
 *
 * The session codes can only arise on /update-password, the one screen here
 * that calls Supabase with a session already in hand, so wording them in terms
 * of the recovery link is safe.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials:
    "That email and password do not match an account. Check both and try again.",
  email_address_invalid: "That does not look like an email address.",
  email_not_confirmed:
    "This account has not been confirmed yet. Open the link in the confirmation email, then sign in.",
  user_already_exists: ACCOUNT_NOT_CREATED,
  email_exists: ACCOUNT_NOT_CREATED,
  weak_password: `That password is too easy to guess. Use at least ${MIN_PASSWORD_LENGTH} characters that are not a common word or pattern.`,
  same_password: "That is already your password. Choose a different one.",
  signup_disabled: "New accounts are not being accepted at the moment.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  ...Object.fromEntries(RECOVERY_LINK_CODES.map((code) => [code, RECOVERY_LINK_EXPIRED])),
};

/**
 * Shown when `./auth-operations` cannot be fetched.
 *
 * That module is a separate chunk, so the network can fail between the page
 * arriving and the form being submitted, and a deployment that has since been
 * replaced can leave the chunk permanently unreachable. Reloading is what fixes
 * the second case and usually resolves the first, so the message asks for it.
 *
 * It is reported from a rejected import rather than recognised in a caught
 * error: the error a failed chunk produces differs by bundler, browser and
 * whether the request or the module evaluation failed, and matching on any of
 * that would fail silently the next time one of them changes.
 */
export const OPERATIONS_UNAVAILABLE =
  "Some of this page did not finish loading, so your request was not sent. " +
  "Check your connection, reload the page, and try again.";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

const TRANSPORT_MESSAGE =
  "Could not reach the server. Check your connection and try again.";

/**
 * True when the request never reached Supabase at all.
 *
 * Supabase reports that as a retryable fetch error, which carries neither an
 * HTTP status nor an error code because no response came back. The distinction
 * matters on /reset-password, where every answer the API gives has to look
 * identical so the form cannot be used to discover who has an account
 * (DF-UX-191), whereas a connection failure discloses nothing. If the library
 * ever renames the error this returns false, failing towards silence rather
 * than towards disclosure.
 */
export function isTransportError(error: unknown): boolean {
  return error instanceof Error && error.name === "AuthRetryableFetchError";
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

/**
 * Turns a Supabase rejection into something worth reading.
 *
 * An unrecognised failure falls back to a generic sentence instead of the
 * message the API returned. Some of those describe internals rather than
 * anything the user did - a failure in the new-user seed trigger arrives as
 * "Database error saving new user" - and DF-SEC-025 keeps that off the screen.
 */
export function authErrorMessage(error: unknown): string {
  if (isTransportError(error)) return TRANSPORT_MESSAGE;

  const code = errorCode(error);

  return (code === undefined ? undefined : ERROR_MESSAGES[code]) ?? GENERIC_MESSAGE;
}
