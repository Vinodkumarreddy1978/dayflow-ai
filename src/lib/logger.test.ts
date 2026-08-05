import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLogger,
  logCronRun,
  logCronUnauthorised,
  logger,
  REDACTED,
  type LogRecord,
} from "./logger";

/**
 * Two things are being held in place here, and the second is the important one.
 *
 * The first is the shape of a line, because the whole point of structured logging
 * is that a field can be queried later; a run of `message` strings with the
 * numbers embedded in them is not a log, it is prose.
 *
 * The second is that the logger cannot be talked into printing a secret or a
 * piece of somebody's life. DF-OBS-002 is a constraint that has to hold against
 * the caller who did not read it, so the tests below pass in the mistakes a
 * caller would plausibly make - a whole Supabase row, an Authorization header, a
 * secret interpolated into a message - rather than only the well-behaved case.
 */

function silenceConsole() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

type Stream = ReturnType<typeof silenceConsole>["log"];

let stdout: Stream;
let stderr: Stream;
let warnings: Stream;

beforeEach(() => {
  const streams = silenceConsole();
  stdout = streams.log;
  warnings = streams.warn;
  stderr = streams.error;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** The last line written to a stream, parsed. */
function lastRecord(spy: Stream): LogRecord {
  const calls = spy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);

  return JSON.parse(String(calls[calls.length - 1]?.[0])) as LogRecord;
}

/** The raw text of every line written to every stream. */
function everything(): string {
  return [stdout, warnings, stderr]
    .flatMap((spy) => spy.mock.calls.map((call) => String(call[0])))
    .join("\n");
}

describe("record shape", () => {
  it("writes a single line of JSON carrying a level, a message and a timestamp", () => {
    logger.info("Reminder sweep finished");

    expect(stdout).toHaveBeenCalledTimes(1);
    const line = String(stdout.mock.calls[0]?.[0]);

    // One line per event, because a multi-line record is split across entries by
    // every log viewer, including Vercel's.
    expect(line).not.toContain("\n");

    const record = JSON.parse(line) as LogRecord;
    expect(record.level).toBe("info");
    expect(record.message).toBe("Reminder sweep finished");
    expect(Date.parse(record.timestamp)).not.toBeNaN();
  });

  it("puts caller-supplied fields under context rather than in the message", () => {
    logger.info("Cron run finished", { job: "reminders", processed: 12 });

    expect(lastRecord(stdout).context).toEqual({ job: "reminders", processed: 12 });
  });

  it("omits context entirely when there is none, rather than logging an empty object", () => {
    logger.info("Nothing to report");

    expect(lastRecord(stdout)).not.toHaveProperty("context");
  });

  it("sends errors to stderr and warnings to their own stream", () => {
    logger.error("Scan failed");
    logger.warn("Cron request rejected");

    expect(lastRecord(stderr).message).toBe("Scan failed");
    expect(lastRecord(warnings).message).toBe("Cron request rejected");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("suppresses debug unless LOG_LEVEL asks for it", () => {
    logger.debug("Considered a Moment");
    expect(stdout).not.toHaveBeenCalled();

    vi.stubEnv("LOG_LEVEL", "debug");
    logger.debug("Considered a Moment");

    expect(lastRecord(stdout).level).toBe("debug");
  });

  it("merges the fixed fields of a child logger with the ones passed per call", () => {
    const scoped = createLogger({ job: "auto-close" }).child({ stage: "scan-pending" });
    scoped.warn("Slow scan", { durationMs: 4200 });

    expect(lastRecord(warnings).context).toEqual({
      job: "auto-close",
      stage: "scan-pending",
      durationMs: 4200,
    });
  });
});

describe("redaction", () => {
  it("drops values held under a name that describes a credential", () => {
    logger.error("Cron request rejected", {
      authorization: "Bearer 8f3c1d2e9a7b4c5d",
      CRON_SECRET: "8f3c1d2e9a7b4c5d",
      supabaseServiceRoleKey: "sb_secret_abcdefghijklmnop",
      apiKey: "sk-not-a-real-key",
      vapidPrivateKey: "aaaaaaaaaaaaaaaaaaaaaa",
    });

    const context = lastRecord(stderr).context ?? {};
    for (const value of Object.values(context)) expect(value).toBe(REDACTED);
  });

  it("drops the fields that carry a person's own words, per DF-OBS-002", () => {
    // The shape a caller reaches for when something goes wrong: log the row.
    logger.error("Could not update Moment", {
      id: "3f6c8a12-0000-0000-0000-000000000001",
      user_id: "9c1e4b77-0000-0000-0000-000000000002",
      note: "Therapy session, felt awful afterwards",
      categoryName: "Therapy",
      email: "person@example.com",
      status: "pending",
    });

    const context = lastRecord(stderr).context ?? {};

    expect(context.note).toBe(REDACTED);
    expect(context.categoryName).toBe(REDACTED);
    expect(context.email).toBe(REDACTED);

    // DF-OBS-003. Identifiers are what make a log worth keeping, and they are
    // deliberately not treated as personal data here.
    expect(context.id).toBe("3f6c8a12-0000-0000-0000-000000000001");
    expect(context.user_id).toBe("9c1e4b77-0000-0000-0000-000000000002");
    expect(context.status).toBe("pending");
  });

  it("drops push subscription material, which is a credential rather than an address", () => {
    logger.warn("Push send failed", {
      subscriptionId: "0f9d4b21-0000-0000-0000-000000000003",
      endpoint: "https://fcm.googleapis.com/fcm/send/cX9-token-material",
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I",
      auth: "tBHItJI5svbpez7KI4CCXg",
    });

    const context = lastRecord(warnings).context ?? {};

    expect(context.endpoint).toBe(REDACTED);
    expect(context.p256dh).toBe(REDACTED);
    expect(context.auth).toBe(REDACTED);
    expect(context.subscriptionId).toBe("0f9d4b21-0000-0000-0000-000000000003");
  });

  it("reaches into nested objects and arrays rather than only the top level", () => {
    logger.error("Batch failed", {
      job: "reminders",
      batch: [{ momentId: "abc", note: "private" }],
      user: { id: "u1", profile: { displayName: "Priya" } },
    });

    expect(everything()).not.toContain("private");
    expect(everything()).not.toContain("Priya");
    expect(everything()).toContain("momentId");
  });

  it("removes an email address that arrives inside a message rather than under a key", () => {
    // No key to match on, and this is how an address usually escapes: interpolated
    // into a sentence by a caller who is thinking about the sentence.
    logger.error("No account for person@example.com");

    const record = lastRecord(stderr);
    expect(record.message).toBe("No account for [redacted-email]");
    expect(everything()).not.toContain("person@example.com");
  });

  it("removes a configured secret wherever it appears, whatever it is called", () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t-value-long-enough");

    logger.error("Rejected Authorization for the reminder job", {
      // An innocuous key holding the secret anyway. Nothing about the name of
      // this field could tell the logger to drop it.
      diagnostic: "expected s3cr3t-value-long-enough, got something else",
    });

    const output = everything();
    expect(output).not.toContain("s3cr3t-value-long-enough");
    expect(output).toContain(REDACTED);
  });

  it("removes anything presented as a bearer token or a JWT", () => {
    logger.error("Upstream refused", {
      diagnostic: "sent Authorization: Bearer eyJhbGciOi.eyJzdWIiOiIx.abc123signature",
    });

    const output = everything();
    expect(output).not.toContain("eyJhbGciOi");
    expect(output).toContain("Bearer [redacted]");
  });

  it("drops a credential held under a key inside a Map, not only inside an object", () => {
    // A Map used to be converted with spread syntax, and an array's elements
    // never reach the deny list - so this leaked while the identical plain
    // object was redacted. The value is deliberately not a recognisable
    // credential shape, so the key name is the only thing that can save it.
    logger.error("Upstream call refused", {
      headers: new Map([
        ["authorization", "opaque-header-material-4f2a9c"],
        ["x-request-id", "8c2f"],
      ]),
    });

    const headers = lastRecord(stderr).context?.headers as Record<string, unknown>;

    expect(headers.authorization).toBe(REDACTED);
    expect(headers["x-request-id"]).toBe("8c2f");
    expect(everything()).not.toContain("opaque-header-material-4f2a9c");
  });

  it("applies the same rules to what a Map value contains, at any depth", () => {
    logger.error("Batch failed", {
      byUser: new Map([
        [
          "9c1e4b77-0000-0000-0000-000000000002",
          {
            momentId: "m1",
            note: "Therapy session, felt awful afterwards",
            upstream: new Map([["token", "opaque-token-material-77b1"]]),
          },
        ],
      ]),
    });

    const output = everything();

    expect(output).not.toContain("Therapy session");
    expect(output).not.toContain("opaque-token-material-77b1");
    expect(output).toContain("momentId");
  });

  it("reaches into the members of a Set rather than listing them untouched", () => {
    logger.warn("Closes refused", {
      refused: new Set([{ momentId: "m1", note: "Dentist, hated it" }]),
    });

    const refused = lastRecord(warnings).context?.refused as Record<string, unknown>[];

    expect(refused).toHaveLength(1);
    expect(refused[0]?.momentId).toBe("m1");
    expect(refused[0]?.note).toBe(REDACTED);
  });

  it("scrubs field names as well as values, because a lookup can be keyed by one", () => {
    // Neither of these is caught by the deny list: the sensitive part is the key
    // itself, which describes nothing and carries everything.
    logger.error("Duplicate account", {
      lookup: { "person@example.com": "u1" },
      byAddress: new Map([["person@example.com", { id: "u1" }]]),
    });

    const output = everything();

    expect(output).not.toContain("person@example.com");
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("u1");
  });

  it("keeps a Postgres message but not its DETAIL, which echoes the offending row", () => {
    // Postgres puts the constraint name in the message and the conflicting values
    // in DETAIL, so this split keeps the diagnostic and drops the category name.
    logger.error("Insert refused", {
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "categories_name_key"',
        details: "Key (user_id, name)=(9c1e4b77, Therapy) already exists.",
        hint: null,
      },
    });

    const output = everything();
    expect(output).toContain("categories_name_key");
    expect(output).toContain("23505");
    expect(output).not.toContain("Therapy");
  });
});

describe("difficult values", () => {
  it("records an Error as a name, a message and a stack", () => {
    const failure = new TypeError("cannot read start_at of undefined");
    logger.error("Reminder sweep threw", { error: failure });

    const error = lastRecord(stderr).context?.error as Record<string, unknown>;

    expect(error.name).toBe("TypeError");
    expect(error.message).toBe("cannot read start_at of undefined");
    expect(String(error.stack)).toContain("logger.test.ts");
  });

  it("keeps the fields that make a failure reproducible, per DF-OBS-005", () => {
    const failure = Object.assign(new Error("push service rejected"), {
      statusCode: 410,
    });

    logger.error("Send failed", { error: failure });

    const error = lastRecord(stderr).context?.error as Record<string, unknown>;
    expect(error.statusCode).toBe(410);
  });

  it("survives a structure that refers to itself", () => {
    const cyclic: Record<string, unknown> = { job: "reminders" };
    cyclic.self = cyclic;

    expect(() => logger.error("Cycle", { cyclic })).not.toThrow();
    expect(everything()).toContain("[circular]");
  });

  it("logs an object that appears twice as siblings instead of calling it a cycle", () => {
    // Two references to one object are two facts about the payload, not a loop.
    // Reporting the second as circular drops a diagnostic without saying so.
    const user = { id: "9c1e4b77-0000-0000-0000-000000000002" };

    logger.error("Two references", { first: user, second: user, both: [user, user] });

    const context = lastRecord(stderr).context ?? {};

    expect(context.first).toEqual(user);
    expect(context.second).toEqual(user);
    expect(context.both).toEqual([user, user]);
    expect(everything()).not.toContain("[circular]");
  });

  it("still reports an ancestor cycle, including one through an error cause", () => {
    const failure = new Error("push service rejected");
    failure.cause = failure;

    expect(() =>
      logger.error("Self-referential cause", { error: failure }),
    ).not.toThrow();

    const error = lastRecord(stderr).context?.error as Record<string, unknown>;

    expect(error.message).toBe("push service rejected");
    expect(error.cause).toBe("[circular]");
  });

  it("stops at the depth limit rather than following a structure down for ever", () => {
    let deep: Record<string, unknown> = { end: "bottom" };
    for (let index = 0; index < 10_000; index += 1) deep = { deep };

    expect(() => logger.error("Deep structure", { deep })).not.toThrow();

    expect(everything()).toContain("[depth limit]");
    expect(everything()).not.toContain("bottom");
  });

  it("gives up on a graph that shares its children instead of expanding it", () => {
    // Ancestor-only cycle detection is what makes the sibling case above work,
    // and it is also what lets a few hundred bytes of caller data expand into a
    // megabyte of output. The budget is what stops that, so it is asserted here
    // rather than assumed.
    const fanOut = (child: unknown): Record<string, unknown> =>
      Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`k${index}`, child]));

    const shared = fanOut(fanOut(fanOut({ id: "leaf" })));

    expect(() => logger.error("Shared graph", { shared })).not.toThrow();

    expect(everything()).toContain("[node limit]");
    expect(everything().length).toBeLessThan(100_000);
  });

  it("caps a large Map the way it caps a large array", () => {
    const large = new Map(
      Array.from({ length: 100 }, (_, index) => [`k${index}`, index]),
    );

    logger.info("Large map", { large });

    const emitted = lastRecord(stdout).context?.large as Record<string, unknown>;

    expect(Object.keys(emitted)).toHaveLength(21);
    expect(emitted["[omitted]"]).toBe("[+80 entries]");
  });

  it("keeps the rest of the context when a Date cannot be formatted", () => {
    // `toISOString` throws on an invalid date, which used to cost every other
    // field in the record rather than that one.
    logger.info("Bad cutoff", { job: "reminders", cutoff: new Date("not a date") });

    expect(lastRecord(stdout).context).toEqual({
      job: "reminders",
      cutoff: "[invalid date]",
    });
  });

  it("still reports a field whose name is __proto__ rather than losing it", () => {
    // What `JSON.parse` of an upstream response produces. Assigned as a key it
    // would run Object.prototype's setter and vanish from the line.
    const payload = JSON.parse('{"__proto__":{"note":"Therapy session"}}') as object;

    logger.error("Untrusted payload", { payload });

    const emitted = lastRecord(stderr).context?.payload as Record<string, unknown>;

    expect(emitted["[proto]"]).toEqual({ note: REDACTED });
    expect(everything()).not.toContain("Therapy session");
  });

  it("records the size of binary data rather than its bytes", () => {
    // The bytes of a key are still a key, and enumerating a typed array emits one
    // numbered field per byte - a form no string rule can see.
    logger.info("Binary payload", { payload: new Uint8Array([1, 2, 3, 4]) });

    expect(lastRecord(stdout).context?.payload).toBe("[binary 4 bytes]");
  });

  it("still records the event when the context cannot be read at all", () => {
    // A logger that throws turns a handled failure into an unhandled one, and it
    // is almost always called from inside a catch block.
    const hostile = {
      get boom(): string {
        throw new Error("getter exploded");
      },
    };

    expect(() => logger.error("Report generation failed", { hostile })).not.toThrow();

    const record = lastRecord(stderr);
    expect(record.message).toBe("Report generation failed");
    expect(record.context).toEqual({ contextSerialisation: "failed" });
  });

  it("does not let a getter that throws inside a Map reach the caller either", () => {
    // Same guarantee, through the collection walk added for the Map fix. The
    // whole context is still sacrificed rather than the one field, which is the
    // existing trade above and not a new one.
    const hostile = new Map<string, unknown>([
      ["job", "reminders"],
      [
        "row",
        {
          get boom(): string {
            throw new Error("getter exploded");
          },
        },
      ],
    ]);

    expect(() => logger.error("Sweep failed", { hostile })).not.toThrow();

    const record = lastRecord(stderr);
    expect(record.message).toBe("Sweep failed");
    expect(record.context).toEqual({ contextSerialisation: "failed" });
  });

  it("truncates a value long enough to bury the lines around it", () => {
    logger.info("Long value", { blob: "x".repeat(2000) });

    const blob = String(lastRecord(stdout).context?.blob);
    expect(blob.length).toBeLessThan(600);
    expect(blob).toContain("chars]");
  });
});

describe("cron run accounting", () => {
  it("logs the four counts DF-OBS-004 requires under fixed names", () => {
    logCronRun(
      "reminders",
      { processed: 31, sent: 4, skipped: 2, failed: 0 },
      { users: 3, durationMs: 812 },
    );

    expect(lastRecord(stdout).context).toEqual({
      event: "cron.run",
      job: "reminders",
      processed: 31,
      sent: 4,
      skipped: 2,
      failed: 0,
      users: 3,
      durationMs: 812,
    });
  });

  it("keeps its own counts when a caller passes fields of the same name", () => {
    // The value of these lines is entirely in every run reporting the same thing
    // under the same name, so the required fields win and the collision is named
    // rather than discarded in silence.
    logCronRun(
      "reminders",
      { processed: 31, sent: 4, skipped: 2, failed: 0 },
      { processed: 0, failed: 99, job: "somewhere-else", users: 3 },
    );

    expect(lastRecord(stdout).context).toEqual({
      event: "cron.run",
      job: "reminders",
      processed: 31,
      sent: 4,
      skipped: 2,
      failed: 0,
      users: 3,
      overriddenKeys: ["processed", "failed", "job"],
    });
  });

  it("raises the level to warning when part of the run failed", () => {
    logCronRun("daily-report", { processed: 9, sent: 0, skipped: 1, failed: 3 });

    const record = lastRecord(warnings);
    expect(record.level).toBe("warn");
    expect(record.context?.failed).toBe(3);
  });

  it("records a rejected invocation without recording what was presented", () => {
    // The usual cause is CRON_SECRET matching in Vercel but not in Supabase Vault,
    // and this line is what section 7.1 of the runbook sends an operator to find.
    logCronUnauthorised("reminders");

    const record = lastRecord(warnings);
    expect(record.context).toEqual({ event: "cron.unauthorised", job: "reminders" });
  });
});
