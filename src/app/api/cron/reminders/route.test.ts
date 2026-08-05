import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/**
 * What this file is for: the reminder sweep is the job whose failures are silent.
 * A scan that errors used to return 500 and discard the reason, and a run that
 * sent nothing looked exactly like a run with nothing to send. Both are now log
 * lines, and both are asserted here, because a log line nobody wrote a test for
 * is a log line that quietly stops being written.
 *
 * The Supabase client is substituted rather than reached: the service role client
 * needs real credentials, and `@/lib/supabase/admin` imports `server-only`, which
 * throws outside a React Server Component. `@/lib/push/send` is substituted for
 * the same reason and because sending a notification is not what is under test.
 * The logger itself is real - it is the thing being verified.
 */
const { createAdminClient, isAuthorisedCronRequest, sendToAllDevices } = vi.hoisted(
  () => ({
    createAdminClient: vi.fn(),
    isAuthorisedCronRequest: vi.fn(),
    sendToAllDevices: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/push/send", () => ({ isAuthorisedCronRequest, sendToAllDevices }));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface Query {
  select: () => Query;
  eq: () => Query;
  lt: () => Query;
  in: () => Query;
  update: () => Query;
  delete: () => Query;
  then: (resolve: (value: QueryResult) => unknown) => Promise<unknown>;
}

/**
 * A thenable that answers every builder method with itself, so the route's own
 * chain of `.select().eq().lt()` resolves to whatever the test set for that table.
 */
function query(result: QueryResult): Query {
  const chain: Query = {
    select: () => chain,
    eq: () => chain,
    lt: () => chain,
    in: () => chain,
    update: () => chain,
    delete: () => chain,
    then: (resolve) => Promise.resolve(result).then(resolve),
  };

  return chain;
}

function supabaseReturning(tables: Record<string, QueryResult>) {
  return {
    from: (table: string) => query(tables[table] ?? { data: [], error: null }),
  };
}

const USER_ID = "9c1e4b77-0000-0000-0000-000000000002";
const MOMENT_ID = "3f6c8a12-0000-0000-0000-000000000001";

/** Two hours old, so a 60 minute interval has passed. */
function pendingMoment() {
  return {
    id: MOMENT_ID,
    user_id: USER_ID,
    category_id: "c1",
    start_at: new Date(Date.now() - 120 * 60_000).toISOString(),
    last_reminder_at: null,
    warned_at: null,
  };
}

function settingsRow() {
  return {
    user_id: USER_ID,
    timezone: "UTC",
    reminders_enabled: true,
    notify_queue_reminders: true,
    notify_long_activity: false,
    reminder_interval_minutes: 60,
    long_activity_warning_minutes: 180,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
  };
}

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

  isAuthorisedCronRequest.mockReturnValue(true);
  sendToAllDevices.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function request() {
  return new Request("https://dayflow.example.com/api/cron/reminders", {
    method: "POST",
  });
}

/** The context object of every line written to one stream, in order. */
function contexts(spy: Stream): Record<string, unknown>[] {
  return spy.mock.calls
    .map((call) => JSON.parse(String(call[0])) as { context?: Record<string, unknown> })
    .map((record) => record.context ?? {});
}

describe("authorisation", () => {
  it("still answers 401 without the secret, and says so in the log", async () => {
    // DF-CD-013, also covered end to end. The log line is the addition: a 401 here
    // is almost always CRON_SECRET matching in Vercel but not in Supabase Vault,
    // and until now that produced no evidence anywhere.
    isAuthorisedCronRequest.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorised." });

    expect(contexts(warnings)).toContainEqual({
      event: "cron.unauthorised",
      job: "reminders",
    });
  });
});

describe("a scan that fails", () => {
  beforeEach(() => {
    createAdminClient.mockReturnValue(
      supabaseReturning({
        moments: {
          data: null,
          error: {
            code: "42501",
            message: "permission denied for table moments",
            details: "Key (user_id)=(9c1e4b77) is not visible.",
            hint: null,
          },
        },
      }),
    );
  });

  it("records the reason instead of discarding it", async () => {
    const response = await POST(request());

    expect(response.status).toBe(500);

    const [logged] = contexts(stderr);
    expect(logged?.job).toBe("reminders");
    expect(logged?.stage).toBe("scan-pending");

    const error = logged?.error as Record<string, unknown>;
    expect(error.code).toBe("42501");
    expect(error.message).toBe("permission denied for table moments");
  });

  it("tells the caller nothing it did not already know", async () => {
    // The response shape is unchanged, and deliberately says less than the log.
    const response = await POST(request());

    await expect(response.json()).resolves.toEqual({ error: "Scan failed." });
  });

  it("keeps the offending row out of the log, per DF-OBS-002", async () => {
    await POST(request());

    const written = stderr.mock.calls.map((call) => String(call[0])).join("\n");
    expect(written).not.toContain("9c1e4b77");
  });
});

describe("a run with nothing to do", () => {
  it("logs zeroes rather than staying silent", async () => {
    // The whole reason DF-OBS-004 exists. A sweep that stopped running and a sweep
    // with an empty queue are indistinguishable unless the quiet one says so.
    createAdminClient.mockReturnValue(
      supabaseReturning({ moments: { data: [], error: null } }),
    );

    const response = await POST(request());

    await expect(response.json()).resolves.toEqual({
      ok: true,
      users: 0,
      sent: 0,
      warned: 0,
    });

    const [logged] = contexts(stdout);
    expect(logged).toMatchObject({
      event: "cron.run",
      job: "reminders",
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
  });
});

describe("a run that sends", () => {
  beforeEach(() => {
    createAdminClient.mockReturnValue(
      supabaseReturning({
        moments: { data: [pendingMoment()], error: null },
        settings: { data: [settingsRow()], error: null },
        categories: { data: [{ id: "c1", name: "Deep work" }], error: null },
        push_subscriptions: {
          data: [
            {
              id: "sub-1",
              user_id: USER_ID,
              endpoint: "https://push.example.com/x",
              p256dh: "p",
              auth: "a",
            },
          ],
          error: null,
        },
      }),
    );
  });

  it("reports the counts of the work it actually did", async () => {
    sendToAllDevices.mockResolvedValue([{ status: "sent", subscriptionId: "sub-1" }]);

    const response = await POST(request());

    await expect(response.json()).resolves.toEqual({
      ok: true,
      users: 1,
      reminded: 1,
      warned: 0,
      notificationsSent: 1,
      subscriptionsPruned: 0,
    });

    expect(contexts(stdout)[0]).toMatchObject({
      event: "cron.run",
      job: "reminders",
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      reminded: 1,
    });
  });

  it("counts a send the push service refused, which used to be discarded", async () => {
    sendToAllDevices.mockResolvedValue([
      { status: "failed", subscriptionId: "sub-1", reason: "500 from push service" },
    ]);

    await POST(request());

    // A partial failure is a warning, not an error: the sweep did its work.
    expect(contexts(warnings)[0]).toMatchObject({
      event: "cron.run",
      job: "reminders",
      sent: 0,
      failed: 1,
    });
  });

  it("records a failed post-sweep write, which decides whether the job is idempotent", async () => {
    // If `last_reminder_at` is not written, every user due a reminder gets another
    // one in ten minutes, and again, while the endpoint keeps answering 200. This
    // was previously the one failure in the sweep with no symptom at all.
    let momentsCalls = 0;

    createAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "moments") {
          momentsCalls += 1;
          return momentsCalls === 1
            ? query({ data: [pendingMoment()], error: null })
            : query({
                data: null,
                error: { code: "40001", message: "could not serialize access" },
              });
        }

        if (table === "settings") return query({ data: [settingsRow()], error: null });
        return query({ data: [], error: null });
      },
    });

    const response = await POST(request());

    // The sweep did its work, so the response is unchanged.
    expect(response.status).toBe(200);

    const logged = contexts(stderr).find((entry) => entry.stage === "mark-reminded");
    expect(logged?.job).toBe("reminders");
    expect((logged?.error as Record<string, unknown>).code).toBe("40001");
  });

  it("names the category nowhere in the log, though the notification uses it", async () => {
    sendToAllDevices.mockResolvedValue([{ status: "sent", subscriptionId: "sub-1" }]);

    await POST(request());

    const written = [stdout, warnings, stderr]
      .flatMap((spy) => spy.mock.calls.map((call) => String(call[0])))
      .join("\n");

    expect(written).not.toContain("Deep work");
  });
});
