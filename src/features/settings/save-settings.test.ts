import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SETTINGS_KEY_COLUMN,
  SETTINGS_WRITE_FAILURE_EVENT,
  SETTINGS_WRITE_FAILURE_ROUTE,
  SettingsWriteError,
  describeSettingsWriteError,
  reportSettingsWriteFailure,
  saveSettings,
  settingsWriteFailureLog,
  toSettingsWriteFailureReport,
  type SettingsUpdateBuilder,
  type SettingsUpdater,
  type SettingsWriteClient,
  type SettingsWriteResponse,
} from "./save-settings";
import type { SettingsInput } from "@/lib/schemas";
import type { Settings } from "@/lib/supabase/database.types";

const ROW = {
  user_id: "user-1",
  theme: "dark",
  time_format: "12h",
} as unknown as Settings;

interface RecordedUpdate {
  table: string;
  patch: Record<string, unknown>;
  filters: [string, string][];
}

/**
 * A stand-in for PostgREST that keeps the one rule this module exists to satisfy.
 *
 * A mock that simply resolves would pass whether or not the update is filtered,
 * which is precisely the test that did not exist when
 * `update(patch).select().single()` shipped and every save on the live site was
 * refused with 21000. So this one refuses an unfiltered update the way PostgREST
 * does, with the same code and the same wording: delete the `.eq` from
 * `saveSettings` and the tests below fail with the production error.
 */
function fakePostgrest(row: Settings | null = ROW) {
  const updates: RecordedUpdate[] = [];

  const client: SettingsWriteClient = {
    from(table) {
      return {
        update(patch) {
          const recorded: RecordedUpdate = { table, patch: { ...patch }, filters: [] };
          updates.push(recorded);

          const builder: SettingsUpdateBuilder = {
            eq(column, value) {
              recorded.filters.push([column, value]);
              return builder;
            },
            select() {
              return {
                single(): Promise<SettingsWriteResponse> {
                  if (recorded.filters.length === 0) {
                    return Promise.resolve({
                      data: null,
                      error: {
                        code: "21000",
                        message: "UPDATE requires a WHERE clause",
                        hint: null,
                      },
                    });
                  }

                  return Promise.resolve({ data: row, error: null });
                },
              };
            },
          };

          return builder;
        },
      };
    },
  };

  return {
    client,
    updates,
    /** The updater `saveSettings` is handed, wired through `from` as the app wires it. */
    update: (patch: SettingsInput) => client.from("settings").update(patch),
  };
}

/** An updater that answers with one PostgREST error however it is filtered. */
function failingUpdater(error: {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}): SettingsUpdater {
  const builder: SettingsUpdateBuilder = {
    eq: () => builder,
    select: () => ({ single: () => Promise.resolve({ data: null, error }) }),
  };

  return () => builder;
}

/** The single update a save is expected to have made, or a failed test. */
function onlyUpdate(updates: RecordedUpdate[]): RecordedUpdate {
  expect(updates).toHaveLength(1);

  const [update] = updates;
  if (!update) throw new Error("Expected exactly one update");
  return update;
}

async function failureFrom(attempt: Promise<unknown>): Promise<SettingsWriteError> {
  try {
    await attempt;
  } catch (error) {
    return error as SettingsWriteError;
  }

  throw new Error("Expected the save to be refused");
}

describe("SETTINGS_KEY_COLUMN", () => {
  it("is the column public.settings is actually keyed by", () => {
    // supabase/migrations/0002_profiles_and_settings.sql declares
    // `user_id uuid primary key`. There is no `id` column on this table, so a
    // filter on one would be rejected as an unknown column - broken in a
    // different way, and just as broken.
    expect(SETTINGS_KEY_COLUMN).toBe("user_id");
  });
});

describe("saveSettings", () => {
  it("narrows the update to the signed-in user's row", async () => {
    const { update, updates } = fakePostgrest();

    await saveSettings(update, "user-1", { time_format: "12h" });

    const recorded = onlyUpdate(updates);
    expect(recorded.table).toBe("settings");
    expect(recorded.filters).toEqual([["user_id", "user-1"]]);
  });

  it("filters by the id it is given rather than anything it can infer", async () => {
    // The row and the patch both belong to user-1 above, so a filter hardcoded
    // to that id would pass. A second account is what distinguishes the two.
    const { update, updates } = fakePostgrest();

    await saveSettings(update, "user-2", { theme: "dark" });

    expect(onlyUpdate(updates).filters).toEqual([["user_id", "user-2"]]);
  });

  it("is refused with 21000 if the filter is ever removed", async () => {
    // The regression itself, exercised against the stand-in directly so that the
    // guarantee is visible rather than implied: this is what production returned
    // for every settings save, and what `saveSettings` must never provoke.
    const { client } = fakePostgrest();

    const response = await client
      .from("settings")
      .update({ time_format: "12h" })
      .select()
      .single();

    expect(response.error).toMatchObject({
      code: "21000",
      message: "UPDATE requires a WHERE clause",
    });
  });

  it("sends the patch through unchanged and returns the saved row", async () => {
    const { update, updates } = fakePostgrest();

    await expect(saveSettings(update, "user-1", { theme: "dark" })).resolves.toBe(ROW);
    expect(onlyUpdate(updates).patch).toEqual({ theme: "dark" });
  });

  it("saves both of the settings that failed on the live site", async () => {
    // Theme and time format were reported together. They share this one write
    // path, so they are exercised through it together.
    for (const patch of [{ theme: "dark" }, { time_format: "12h" }] as const) {
      const { update, updates } = fakePostgrest();

      await expect(saveSettings(update, "user-1", patch)).resolves.toBe(ROW);
      expect(onlyUpdate(updates).filters).toEqual([["user_id", "user-1"]]);
    }
  });

  it("keeps the database's account of a refusal without showing it to the user", async () => {
    const update = failingUpdater({
      code: "21000",
      message: "UPDATE requires a WHERE clause",
      hint: "Add a filter or set the pgrst.db_unsafe_updates configuration",
    });

    const failure = await failureFrom(saveSettings(update, "user-1", { theme: "dark" }));

    expect(failure).toBeInstanceOf(SettingsWriteError);
    expect(failure.code).toBe("21000");
    expect(failure.databaseMessage).toBe("UPDATE requires a WHERE clause");
    expect(failure.hint).toContain("Add a filter");
    expect(failure.fields).toEqual(["theme"]);
    expect(failure.message).not.toContain("WHERE clause");
    expect(failure.message).toContain("21000");
  });

  it("does not blame the setting when the request never arrived", async () => {
    // supabase-js reports a transport failure as an error with no code. Telling
    // someone their choice was rejected sends them to change it back.
    const failure = await failureFrom(
      saveSettings(failingUpdater({ message: "TypeError: Failed to fetch" }), "user-1", {
        theme: "dark",
      }),
    );

    expect(failure.code).toBeNull();
    expect(failure.message).toContain("could not reach the server");
  });

  it("treats a missing row as a failure rather than caching nothing", async () => {
    const { update } = fakePostgrest(null);

    await expect(
      saveSettings(update, "user-1", { theme: "dark" }),
    ).rejects.toBeInstanceOf(SettingsWriteError);
  });
});

describe("describeSettingsWriteError", () => {
  it("passes through the sentence written for the user", () => {
    const failure = new SettingsWriteError({ code: "21000" }, ["theme"]);

    expect(describeSettingsWriteError(failure)).toBe(failure.message);
  });

  it("never surfaces a raw database error", () => {
    const message = describeSettingsWriteError(
      new Error('new row for relation "settings" violates check constraint'),
    );

    expect(message).not.toContain("relation");
    expect(message).toContain("could not be saved");
  });
});

describe("the failure report", () => {
  it("carries the fields an operator needs and none of the user's values", () => {
    const failure = new SettingsWriteError(
      { code: "21000", message: "UPDATE requires a WHERE clause", hint: "Add a filter" },
      ["theme", "time_format"],
    );

    const report = toSettingsWriteFailureReport(failure);

    expect(report).toEqual({
      code: "21000",
      message: "UPDATE requires a WHERE clause",
      hint: "Add a filter",
      fields: ["theme", "time_format"],
    });
    // Column names identify the defect; the chosen values are personal data
    // under DF-OBS-002 and must not leave the browser.
    expect(JSON.stringify(report)).not.toContain("dark");
    expect(JSON.stringify(report)).not.toContain("12h");
  });

  it("has nothing to say about an error from somewhere else", () => {
    expect(toSettingsWriteFailureReport(new Error("boom"))).toBeNull();
  });

  it("logs under the event an operator searches for, against the server's own user", () => {
    const context = settingsWriteFailureLog(
      {
        code: "21000",
        message: "UPDATE requires a WHERE clause",
        hint: null,
        fields: [],
      },
      "user-1",
    );

    expect(context.event).toBe(SETTINGS_WRITE_FAILURE_EVENT);
    expect(SETTINGS_WRITE_FAILURE_EVENT).toBe("settings.write_failed");
    expect(context.userId).toBe("user-1");
    expect(context.code).toBe("21000");
    expect(context.databaseMessage).toBe("UPDATE requires a WHERE clause");
  });
});

describe("reportSettingsWriteFailure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the report to the route that logs it", async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);

    await reportSettingsWriteFailure(
      new SettingsWriteError(
        { code: "21000", message: "UPDATE requires a WHERE clause" },
        ["time_format"],
      ),
    );

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchStub.mock.calls[0] ?? []) as [string, RequestInit];
    expect(url).toBe(SETTINGS_WRITE_FAILURE_ROUTE);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      code: "21000",
      message: "UPDATE requires a WHERE clause",
      hint: null,
      fields: ["time_format"],
    });
  });

  it("says nothing about an error it did not raise", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);

    await reportSettingsWriteFailure(new Error("boom"));

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("stays quiet when the report itself cannot be sent", async () => {
    // The user has already been told. A diagnostic that throws from inside an
    // error handler turns one handled failure into an unhandled one.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      reportSettingsWriteFailure(new SettingsWriteError({ code: "21000" }, ["theme"])),
    ).resolves.toBeUndefined();
  });
});
