import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/**
 * This route had a bare `catch {}` returning 500. A user regenerating a report and
 * getting "the report could not be generated" three times in a row produced no
 * record anywhere of why - not a stack, not a provider status code, nothing. The
 * message to the user is unchanged; what is new is that the reason survives.
 *
 * `@/lib/ai/report` is substituted both because it imports `server-only` and
 * because the failure being tested is any failure inside it. `@/lib/schemas` is
 * the real one, so the request body still has to be a valid one.
 */
const { createClient, buildReport, saveReport } = vi.hoisted(() => ({
  createClient: vi.fn(),
  buildReport: vi.fn(),
  saveReport: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/ai/report", () => ({ buildReport, saveReport }));

const USER_ID = "9c1e4b77-0000-0000-0000-000000000002";

interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number;
}

interface Query {
  select: () => Query;
  eq: () => Query;
  gte: () => Query;
  single: () => Query;
  then: (resolve: (value: QueryResult) => unknown) => Promise<unknown>;
}

function query(result: QueryResult): Query {
  const chain: Query = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    single: () => chain,
    then: (resolve) => Promise.resolve(result).then(resolve),
  };

  return chain;
}

/** A signed-in client whose AI consent is off and whose daily count is clear. */
function signedInClient() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } } }) },
    from: (table: string) =>
      table === "settings"
        ? query({ data: { ai_consent: false }, error: null })
        : query({ data: null, error: null, count: 0 }),
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

let stderr: Stream;

beforeEach(() => {
  stderr = silenceConsole().error;
  createClient.mockResolvedValue(signedInClient());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function request() {
  return new Request("https://dayflow.example.com/api/reports/generate", {
    method: "POST",
    body: JSON.stringify({ periodType: "daily", periodStart: "2026-08-03" }),
  });
}

function loggedContext(): Record<string, unknown> {
  const calls = stderr.mock.calls;
  expect(calls.length).toBe(1);

  const record = JSON.parse(String(calls[0]?.[0])) as {
    context?: Record<string, unknown>;
  };

  return record.context ?? {};
}

describe("a generation that throws", () => {
  beforeEach(() => {
    buildReport.mockRejectedValue(
      Object.assign(new Error("Anthropic responded 529"), { status: 529 }),
    );
  });

  it("still answers with the same message and status", async () => {
    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "The report could not be generated. Your data is unchanged.",
    });
  });

  it("records the failure with enough context to reproduce the call", async () => {
    await POST(request());

    const context = loggedContext();

    expect(context.route).toBe("/api/reports/generate");
    expect(context.periodType).toBe("daily");
    expect(context.periodStart).toBe("2026-08-03");
    // DF-OBS-003: the user is identified, so a support report can be matched to a
    // log line without any of their activity appearing in it.
    expect(context.userId).toBe(USER_ID);

    const error = context.error as Record<string, unknown>;
    expect(error.message).toBe("Anthropic responded 529");
    expect(error.status).toBe(529);
    expect(String(error.stack)).toContain("route.test.ts");
  });

  it("does not put the reason in the response", async () => {
    // The client is told what it can act on. The provider's status code is a
    // server concern and stays on the server.
    const response = await POST(request());

    expect(JSON.stringify(await response.json())).not.toContain("529");
  });
});

describe("a generation that succeeds", () => {
  it("returns the report and logs nothing at error level", async () => {
    buildReport.mockResolvedValue({
      generatedBy: "deterministic",
      content: { summary: "A quiet day.", insights: [] },
      facts: { totals: { recordedMinutes: 120 } },
    });
    saveReport.mockResolvedValue(undefined);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      generatedBy: "deterministic",
      content: { summary: "A quiet day.", insights: [] },
    });

    // A logger that also narrates the happy path buries the failures.
    expect(stderr).not.toHaveBeenCalled();
  });
});
