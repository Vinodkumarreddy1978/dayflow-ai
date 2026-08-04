/**
 * Supabase enforces its own minimum, but it is a per-project setting that
 * defaults to six characters, so the floor the user is actually held to would
 * otherwise depend on dashboard configuration rather than on anything in this
 * repository.
 *
 * Sign-up and the reset flow both read these, because a policy that applies to
 * only one of the two places a password can be chosen is not a policy.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

export const PASSWORD_TOO_SHORT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
