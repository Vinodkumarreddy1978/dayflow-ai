/**
 * Structured logging. DF-OBS-001 to DF-OBS-005.
 *
 * One JSON object per line on stdout or stderr, because that is the whole
 * transport: Vercel captures both streams from every function invocation and
 * makes the fields queryable. A logging service would give more, and would also
 * be a second, less protected copy of the most sensitive data in the system -
 * which is the argument section 8 of
 * `docs/06-operations/36-observability-and-incident-runbook.md` already makes.
 *
 * The redaction below is the point of the module rather than a feature of it.
 * A logger that merely forwards what it is given puts the burden on every future
 * caller to remember that a Supabase row carries a category name and a push
 * subscription carries a device identifier. So values are dropped by key name
 * and scrubbed by shape on the way through, and a caller has to work to leak
 * something rather than work to avoid leaking it.
 *
 * Server-side by intent. It is deliberately not marked `server-only`: that
 * package throws when resolved outside a React Server Component, which would
 * make the module untestable under vitest. Nothing here reads configuration
 * through `@/lib/env`, so importing it from a client component would cost bundle
 * weight rather than leak a secret - see `src/lib/env.test.ts`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export const REDACTED = "[redacted]";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Bounds on one record. A log line is not a debugger: an unbounded object graph
 * or a megabyte of stringified rows makes the surrounding lines unreadable and
 * consumes retention that DF-OBS-006 wants spent on 30 days of history.
 */
const MAX_DEPTH = 4;
const MAX_STRING = 512;
const MAX_STACK = 2048;
const MAX_ARRAY = 20;

/**
 * Keys whose value is never logged, matched exactly once case and separators are
 * normalised away - so `userEmail`, `user_email` and `USER_EMAIL` are one entry.
 *
 * Two groups, for two different reasons. Credentials, because a log is a copy
 * that outlives the request. Personal content, because DF-OBS-002 forbids
 * Moment notes, category names and email addresses in logs at all, and the
 * fields carrying them are named predictably.
 */
const FORBIDDEN_KEYS = new Set([
  "auth",
  "authorisation",
  "authorization",
  "bearer",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "jwt",
  "key",
  "keys",
  "password",
  "secret",
  "session",
  "token",
  // Personal content. DF-OBS-002.
  "body",
  "content",
  "description",
  "email",
  "note",
  "notes",
  "text",
  "title",
  // Push subscription material. The endpoint alone identifies a device and is
  // enough to send it a notification, so it is a credential, not an address.
  "endpoint",
  "p256dh",
  "subscription",
  // PostgreSQL puts the offending row's values in DETAIL, so a unique violation
  // on `categories` would otherwise log the category name. The constraint name
  // stays in `message`, which is the part that identifies the defect.
  "detail",
  "details",
]);

/** Fragments that make a key forbidden wherever they appear inside it. */
const FORBIDDEN_KEY_FRAGMENTS = [
  "apikey",
  "authorisation",
  "authorization",
  "cookie",
  "credential",
  "email",
  "passphrase",
  "password",
  "privatekey",
  "secret",
  "servicerole",
  "token",
  "vapid",
];

/**
 * Shapes that are sensitive wherever they appear in a string, because a value
 * can arrive inside a message or an error rather than under a key of its own.
 */
const FORBIDDEN_VALUE_PATTERNS: [RegExp, string][] = [
  [/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g, "[redacted-email]"],
  [/\bBearer\s+\S+/gi, "Bearer [redacted]"],
  // A JWT. Supabase access tokens and legacy service role keys are both this
  // shape, and one pasted into an error message is a full credential.
  [/\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]+/g, "[redacted-jwt]"],
  // The current Supabase key format.
  [/\bsb_(?:secret|publishable)_[\w-]+/g, "[redacted-key]"],
];

/**
 * Configuration values that must never be logged, whatever they are set to.
 *
 * Matching the literal value is what makes DF-OBS-002 hold for the awkward case:
 * a caller who interpolates `CRON_SECRET` into a message under an innocuous key.
 * Read on each call rather than cached, because a serverless process can be
 * created before its environment is complete, and because tests stub it.
 */
const SECRET_ENV_NAMES = [
  "CRON_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PRIVATE_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isForbiddenKey(key: string): boolean {
  const normalised = normaliseKey(key);

  return (
    FORBIDDEN_KEYS.has(normalised) ||
    // Anything called a name: `name`, `categoryName`, `displayName`, `fullName`.
    // A category name is personal data under DF-OBS-002 and there is no reliable
    // way to tell one kind of name from another by inspection, so all of them go.
    // Identify things by id and describe them with `job`, `stage` or `event`.
    normalised.endsWith("name") ||
    FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment))
  );
}

function configuredSecrets(): string[] {
  return SECRET_ENV_NAMES.map((name) => process.env[name]).filter(
    // Short values are excluded: a two-character secret is not a real secret,
    // and replacing every occurrence of it would corrupt unrelated text.
    (value): value is string => typeof value === "string" && value.length >= 8,
  );
}

function scrub(value: string): string {
  let scrubbed = value;

  for (const secret of configuredSecrets()) {
    if (scrubbed.includes(secret)) scrubbed = scrubbed.split(secret).join(REDACTED);
  }

  for (const [pattern, replacement] of FORBIDDEN_VALUE_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }

  return scrubbed;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}[+${value.length - limit} chars]`;
}

function text(value: string, limit = MAX_STRING): string {
  return truncate(scrub(value), limit);
}

function sanitiseError(
  error: Error,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: error.name,
    message: text(error.message),
  };

  if (typeof error.stack === "string") payload.stack = text(error.stack, MAX_STACK);
  if (error.cause !== undefined) payload.cause = sanitise(error.cause, depth + 1, seen);

  // Own enumerable properties carry the parts that make a failure reproducible -
  // a Supabase `code`, a push service `statusCode`. DF-OBS-005.
  for (const [key, value] of Object.entries(error)) {
    if (key in payload) continue;
    payload[key] = isForbiddenKey(key) ? REDACTED : sanitise(value, depth + 1, seen);
  }

  return payload;
}

function sanitiseObject(
  source: object,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    result[key] = isForbiddenKey(key) ? REDACTED : sanitise(value, depth + 1, seen);
  }

  return result;
}

/**
 * The values that are held by reference, and so can be cyclic or unbounded.
 *
 * Separate from `sanitise` because `object` has to be arrived at by a positive
 * check: subtracting each primitive `typeof` from `unknown` leaves `{} |
 * undefined` rather than `object`, which neither the `WeakSet` nor
 * `Object.entries` accepts.
 */
function sanitiseReference(value: object, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return sanitiseError(value, depth, seen);

  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[depth limit]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items: unknown[] = value
      .slice(0, MAX_ARRAY)
      .map((item) => sanitise(item, depth + 1, seen));

    if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} items]`);
    return items;
  }

  if (value instanceof Map || value instanceof Set) {
    return sanitise([...value], depth, seen);
  }

  return sanitiseObject(value, depth, seen);
}

function sanitise(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  switch (typeof value) {
    case "undefined":
      return null;
    case "string":
      return text(value);
    case "number":
      // NaN and Infinity serialise as null, which reads as an absent field.
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return `${value}`;
    case "function":
      return "[function]";
    case "symbol":
      return value.toString();
    // `typeof null` is "object", so null reaches this branch rather than the
    // "undefined" one above.
    case "object":
      return value === null ? null : sanitiseReference(value, depth, seen);
  }
}

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();

  if (configured && configured in LEVEL_RANK) return LEVEL_RANK[configured as LogLevel];
  return LEVEL_RANK.info;
}

function stdout(line: string): void {
  // The one console call in src/. Everything else logs through this module, so
  // the `no-console` rule stays on everywhere else rather than being relaxed
  // project-wide - which is what would let a stray debugging line survive review.
  // eslint-disable-next-line no-console
  console.log(line);
}

function emit(level: LogLevel, line: string): void {
  const sink =
    level === "error" ? console.error : level === "warn" ? console.warn : stdout;
  sink(line);
}

function buildRecord(level: LogLevel, message: string, context: LogContext): LogRecord {
  const record: LogRecord = {
    level,
    message: text(message),
    timestamp: new Date().toISOString(),
  };

  const sanitised = sanitiseObject(context, 0, new WeakSet());
  if (Object.keys(sanitised).length > 0) record.context = sanitised;

  return record;
}

function write(level: LogLevel, message: string, context: LogContext): void {
  if (LEVEL_RANK[level] < threshold()) return;

  try {
    emit(level, JSON.stringify(buildRecord(level, message, context)));
  } catch {
    // A logger that throws converts a handled failure into an unhandled one, and
    // it is usually called from inside a catch block. A getter that throws or an
    // exotic object is not worth losing the event over, so the message survives
    // and the context is reported as unloggable.
    emit(
      level,
      JSON.stringify({
        level,
        message: text(message),
        timestamp: new Date().toISOString(),
        context: { contextSerialisation: "failed" },
      }),
    );
  }
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** A logger that adds fixed fields to everything it writes. */
  child(context: LogContext): Logger;
}

export function createLogger(base: LogContext = {}): Logger {
  return {
    debug: (message, context) => write("debug", message, { ...base, ...context }),
    info: (message, context) => write("info", message, { ...base, ...context }),
    warn: (message, context) => write("warn", message, { ...base, ...context }),
    error: (message, context) => write("error", message, { ...base, ...context }),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger = createLogger();

/**
 * The four counts DF-OBS-004 requires of every scheduled run.
 *
 * A required shape rather than free-form context, because the value of these
 * lines is entirely in being comparable across runs: "sent dropped to zero at
 * 04:00 while processed kept climbing" is only answerable if every run reports
 * the same fields under the same names. What each count means per job is in
 * section 11 of the observability runbook.
 */
export interface CronRunCounts {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export function logCronRun(
  job: string,
  counts: CronRunCounts,
  context: LogContext = {},
): void {
  const record = { event: "cron.run", job, ...counts, ...context };

  // Warn rather than error on a partial failure: the run did its work, and a
  // failure severe enough to abort it has already been logged as an error.
  if (counts.failed > 0) logger.warn(`Cron run finished with failures: ${job}`, record);
  else logger.info(`Cron run finished: ${job}`, record);
}

/**
 * A scheduled invocation that failed the bearer check.
 *
 * Worth a line of its own because of what it usually means: `CRON_SECRET` was
 * rotated in Vercel but not in Supabase Vault, or the reverse. Reminders then
 * stop silently, and section 7.1 of the observability runbook sends the operator
 * to the function logs to find out. This is the entry it tells them to look for.
 */
export function logCronUnauthorised(job: string): void {
  logger.warn(`Cron request rejected: ${job}`, { event: "cron.unauthorised", job });
}
