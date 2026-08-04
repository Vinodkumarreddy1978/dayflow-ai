import { describe, expect, it } from "vitest";
import {
  accountExportChunks,
  chunksToStream,
  EXPORT_TABLES,
  exportFilename,
  exportTableSpec,
  tableCsvChunks,
  toCsvField,
  type ExportAccountFacts,
  type ExportClient,
  type ExportQuery,
  type ExportRow,
} from "./account-export";
import { EXPORT_TABLE_NAMES } from "./account-export-tables";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const EXPORTED_AT = "2026-08-04T09:30:00.000Z";

const ACCOUNT: ExportAccountFacts = {
  id: USER,
  email: "owner@example.com",
  created_at: "2026-01-01T00:00:00.000Z",
  last_sign_in_at: "2026-08-04T08:00:00.000Z",
  email_confirmed_at: "2026-01-01T00:05:00.000Z",
};

interface RecordedQuery {
  table: string;
  columns: string;
  filters: { column: string; value: string }[];
  orderedBy: string;
  ranges: [number, number][];
}

/**
 * A client that behaves the way the database does in the one respect that matters:
 * a row is only visible if the filters match it. That is what makes "only the
 * caller's rows" a property of the code under test rather than of the fixture.
 */
function fakeClient(
  tables: Record<string, ExportRow[]>,
  failures: Record<string, string> = {},
) {
  const queries: RecordedQuery[] = [];

  const client: ExportClient = {
    from(table) {
      const record: RecordedQuery = {
        table,
        columns: "",
        filters: [],
        orderedBy: "",
        ranges: [],
      };
      queries.push(record);

      const query: ExportQuery = {
        select(columns) {
          record.columns = columns;
          return query;
        },
        eq(column, value) {
          record.filters.push({ column, value });
          return query;
        },
        order(column) {
          record.orderedBy = column;
          return query;
        },
        range(from, to) {
          record.ranges.push([from, to]);

          if (failures[table]) {
            return Promise.resolve({ data: null, error: { message: failures[table]! } });
          }

          const visible = (tables[table] ?? []).filter((row) =>
            record.filters.every(({ column, value }) => row[column] === value),
          );

          return Promise.resolve({ data: visible.slice(from, to + 1), error: null });
        },
      };

      return query;
    },
  };

  return { client, queries };
}

async function collect(chunks: AsyncGenerator<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

interface ExportDocument {
  dayflow_export_version: number;
  exported_at: string;
  account: ExportAccountFacts;
  tables: Record<string, ExportRow[]>;
}

async function exportDocument(
  client: ExportClient,
  options: { pageSize?: number } = {},
): Promise<ExportDocument> {
  const text = await collect(
    accountExportChunks(client, ACCOUNT, { exportedAt: EXPORTED_AT, ...options }),
  );
  return JSON.parse(text) as ExportDocument;
}

function rangesFor(queries: RecordedQuery[], table: string): [number, number][] {
  return queries
    .filter((query) => query.table === table)
    .flatMap((query) => query.ranges);
}

describe("the export manifest", () => {
  it("covers every table row level security protects", () => {
    // DF-PRV-020 is a completeness requirement, and the failure mode is a table
    // nobody remembered rather than a table that does not work.
    expect(EXPORT_TABLES.map((spec) => spec.table)).toEqual([...EXPORT_TABLE_NAMES]);
  });

  it("pages every table by a unique column", () => {
    // Ordering by anything non-unique makes range pagination drop rows silently.
    for (const spec of EXPORT_TABLES) {
      expect(spec.primaryKey).toBe(spec.table === "settings" ? "user_id" : "id");
    }
  });

  it("keys profiles by id, because it has no user_id column", () => {
    expect(exportTableSpec("profiles").ownerColumn).toBe("id");
    expect(exportTableSpec("moments").ownerColumn).toBe("user_id");
  });
});

describe("accountExportChunks", () => {
  it("produces one JSON document containing every table", async () => {
    const { client } = fakeClient({});
    const document = await exportDocument(client);

    expect(Object.keys(document.tables)).toEqual([...EXPORT_TABLE_NAMES]);
    expect(document.dayflow_export_version).toBe(1);
    expect(document.exported_at).toBe(EXPORTED_AT);
    expect(document.account).toEqual(ACCOUNT);
  });

  it("is valid JSON with every table empty when the account holds nothing", async () => {
    // A new account that has recorded nothing must still get a file, and that file
    // must still parse. An empty array is the honest representation of an empty table.
    const { client } = fakeClient({});
    const document = await exportDocument(client);

    for (const table of EXPORT_TABLE_NAMES) {
      expect(document.tables[table]).toEqual([]);
    }
  });

  it("returns the caller's rows and no others", async () => {
    const { client } = fakeClient({
      moments: [
        { id: "mine-1", user_id: USER, note: "kept" },
        { id: "theirs", user_id: OTHER_USER, note: "must not appear" },
        { id: "mine-2", user_id: USER, note: null },
      ],
    });

    const document = await exportDocument(client);

    expect(document.tables.moments?.map((row) => row.id)).toEqual(["mine-1", "mine-2"]);
    expect(JSON.stringify(document)).not.toContain(OTHER_USER);
  });

  it("excludes the global feature flags the select policy also exposes", async () => {
    // feature_flags_select in 0007 permits `user_id is null or user_id = auth.uid()`,
    // so row level security alone would put a deployment-wide flag into someone's
    // personal export. The explicit owner filter is what keeps it out.
    const { client } = fakeClient({
      feature_flags: [
        { id: "global", user_id: null, flag: "beta", enabled: true },
        { id: "mine", user_id: USER, flag: "beta", enabled: false },
      ],
    });

    const document = await exportDocument(client);

    expect(document.tables.feature_flags?.map((row) => row.id)).toEqual(["mine"]);
  });

  it("filters every table by its own owner column", async () => {
    const { client, queries } = fakeClient({});
    await exportDocument(client);

    for (const spec of EXPORT_TABLES) {
      const query = queries.find((candidate) => candidate.table === spec.table);
      expect(query?.filters).toEqual([{ column: spec.ownerColumn, value: USER }]);
    }
  });

  it("asks for exactly the columns in the manifest", async () => {
    const { client, queries } = fakeClient({});
    await exportDocument(client);

    const moments = queries.find((query) => query.table === "moments");
    expect(moments?.columns).toBe(exportTableSpec("moments").columns.join(","));
    expect(moments?.columns).toContain("duration_minutes");
  });

  it("restates every column, so a null is present rather than absent", async () => {
    const { client } = fakeClient({
      moments: [{ id: "mine", user_id: USER, start_at: "2026-08-04T08:00:00.000Z" }],
    });

    const document = await exportDocument(client);
    const row = document.tables.moments?.[0] ?? {};

    expect(Object.keys(row)).toEqual([...exportTableSpec("moments").columns]);
    expect(row.note).toBeNull();
  });

  it("pages through a table larger than one request", async () => {
    const moments = Array.from({ length: 5 }, (_, index) => ({
      id: `moment-${index}`,
      user_id: USER,
    }));

    const { client, queries } = fakeClient({ moments });
    const document = await exportDocument(client, { pageSize: 2 });

    expect(document.tables.moments?.map((row) => row.id)).toEqual([
      "moment-0",
      "moment-1",
      "moment-2",
      "moment-3",
      "moment-4",
    ]);
    // Three full pages and one short page, which is how the loop learns it is done.
    expect(rangesFor(queries, "moments")).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("stops after a short page rather than querying forever", async () => {
    const { client, queries } = fakeClient({
      moments: [{ id: "only", user_id: USER }],
    });

    await exportDocument(client, { pageSize: 10 });

    expect(rangesFor(queries, "moments")).toEqual([[0, 9]]);
  });

  it("fails loudly when a table cannot be read", async () => {
    const { client } = fakeClient({}, { goals: "permission denied for table goals" });

    await expect(exportDocument(client)).rejects.toThrow(/could not read goals/);
  });

  it("leaves a failed export unparseable rather than plausibly complete", async () => {
    // The status line is sent before the first row, so a mid-stream failure cannot
    // become a 500. Truncated JSON is the signal that the file is incomplete.
    const { client } = fakeClient({}, { goals: "permission denied for table goals" });
    const chunks = accountExportChunks(client, ACCOUNT, { exportedAt: EXPORTED_AT });

    let text = "";
    await expect(
      (async () => {
        for await (const chunk of chunks) text += chunk;
      })(),
    ).rejects.toThrow();

    expect(() => JSON.parse(text)).toThrow();
  });
});

describe("chunksToStream", () => {
  it("delivers the same document a byte at a time", async () => {
    const rows = { categories: [{ id: "category", user_id: USER, name: "Deep work" }] };
    const options = { exportedAt: EXPORTED_AT };

    const streamed = await readStream(
      chunksToStream(accountExportChunks(fakeClient(rows).client, ACCOUNT, options)),
    );
    const collected = await collect(
      accountExportChunks(fakeClient(rows).client, ACCOUNT, options),
    );

    expect(streamed).toBe(collected);
    expect(JSON.parse(streamed)).toMatchObject({ account: { id: USER } });
  });

  it("errors the stream when a read fails", async () => {
    const { client } = fakeClient({}, { moments: "connection lost" });

    await expect(
      readStream(
        chunksToStream(accountExportChunks(client, ACCOUNT, { exportedAt: EXPORTED_AT })),
      ),
    ).rejects.toThrow(/could not read moments/);
  });
});

describe("toCsvField", () => {
  it("leaves plain values alone", () => {
    expect(toCsvField("Deep work")).toBe("Deep work");
    expect(toCsvField(42)).toBe("42");
    expect(toCsvField(true)).toBe("true");
  });

  it("writes null and undefined as an empty field", () => {
    expect(toCsvField(null)).toBe("");
    expect(toCsvField(undefined)).toBe("");
  });

  it("quotes and doubles what would otherwise break the row", () => {
    expect(toCsvField('He said "later"')).toBe('"He said ""later"""');
    expect(toCsvField("Reading, then writing")).toBe('"Reading, then writing"');
    expect(toCsvField("two\nlines")).toBe('"two\nlines"');
  });

  it("keeps a json column as json", () => {
    expect(toCsvField({ focus: 0.8 })).toBe('"{""focus"":0.8}"');
  });
});

describe("tableCsvChunks", () => {
  it("writes a header row even when the table is empty", async () => {
    const { client } = fakeClient({});
    const csv = await collect(tableCsvChunks(client, exportTableSpec("goals"), USER));

    expect(csv).toBe(`${exportTableSpec("goals").columns.join(",")}\r\n`);
  });

  it("writes one row per record, in manifest column order", async () => {
    const { client } = fakeClient({
      categories: [
        { id: "one", user_id: USER, name: "Deep work", sort_order: 1 },
        { id: "two", user_id: OTHER_USER, name: "Not theirs" },
      ],
    });

    const csv = await collect(
      tableCsvChunks(client, exportTableSpec("categories"), USER),
    );
    const lines = csv.trimEnd().split("\r\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(exportTableSpec("categories").columns.join(","));
    expect(lines[1]).toContain("Deep work");
    expect(csv).not.toContain("Not theirs");
  });
});

describe("exportFilename", () => {
  it("names the day, and the table when there is one", () => {
    expect(exportFilename("json", null, EXPORTED_AT)).toBe(
      "dayflow-export-2026-08-04.json",
    );
    expect(exportFilename("csv", "push_subscriptions", EXPORTED_AT)).toBe(
      "dayflow-export-push-subscriptions-2026-08-04.csv",
    );
  });
});
