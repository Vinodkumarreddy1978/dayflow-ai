import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * These guard a failure mode that produced no error at all.
 *
 * `NEXT_PUBLIC_APP_URL` once defaulted to `http://localhost:3000`, so a
 * deployment that omitted it built cleanly, served correctly, and then mailed
 * every user a confirmation link to their own machine. Nothing in a test suite
 * that exercises behaviour would have caught it, because the behaviour was
 * correct - the configuration was not.
 *
 * `src/lib/env.ts` validates at module load, so each case has to import it
 * freshly with a different environment rather than call a function. The values
 * come back from `src/lib/public-env.ts`, which holds them, while the rejections
 * come from importing `src/lib/env.ts`, which checks them.
 */

/** 87 characters from the base64url alphabet: the shape of a real VAPID key. */
const VALID_VAPID_KEY = `B${"a".repeat(86)}`;

const COMPLETE = {
  NEXT_PUBLIC_APP_URL: "https://dayflow.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VALID_VAPID_KEY,
};

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();

  for (const [name, value] of Object.entries({ ...COMPLETE, ...overrides })) {
    vi.stubEnv(name, value);
  }

  // The validator first, so an invalid configuration rejects here rather than
  // being read back as though it had been accepted.
  const validated = await import("./env");
  const { publicEnv } = await import("./public-env");

  return { ...validated, publicEnv };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("public environment validation", () => {
  it("accepts a complete configuration", async () => {
    const { publicEnv } = await loadEnv();

    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe("https://dayflow.example.com");
    expect(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe(VALID_VAPID_KEY);
  });

  it("refuses to start without NEXT_PUBLIC_APP_URL", async () => {
    await expect(loadEnv({ NEXT_PUBLIC_APP_URL: undefined })).rejects.toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
  });

  it("refuses a trailing slash, which would produce a double slash in every redirect", async () => {
    await expect(
      loadEnv({ NEXT_PUBLIC_APP_URL: "https://dayflow.example.com/" }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("refuses an origin carrying a path", async () => {
    await expect(
      loadEnv({ NEXT_PUBLIC_APP_URL: "https://dayflow.example.com/app" }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("refuses a bare hostname with no scheme", async () => {
    await expect(loadEnv({ NEXT_PUBLIC_APP_URL: "dayflow.example.com" })).rejects.toThrow(
      /NEXT_PUBLIC_APP_URL/,
    );
  });

  it("names every missing variable at once rather than one per attempt", async () => {
    await expect(
      loadEnv({
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      }),
    ).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_ANON_KEY/s);
  });

  it("does not echo the offending value, per DF-CFG-005", async () => {
    const secretish = "https://internal-host.corp.example/private-path";

    // Rejected for carrying a path. The name has to appear and the value must
    // not, because this message reaches build logs.
    await expect(loadEnv({ NEXT_PUBLIC_APP_URL: secretish })).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("internal-host"),
      }),
    );
  });
});

describe("VAPID public key validation", () => {
  it("treats an empty key as push being switched off", async () => {
    const { publicEnv } = await loadEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "" });

    expect(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe("");
  });

  it("treats an absent key the same way", async () => {
    const { publicEnv } = await loadEnv({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
    });

    expect(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe("");
  });

  it("refuses the .env.example placeholder", async () => {
    // Left in place, this reaches the browser and fails inside
    // pushManager.subscribe with an error naming nothing.
    await expect(
      loadEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "your-vapid-public-key" }),
    ).rejects.toThrow(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  });

  it("refuses a key of the wrong length", async () => {
    await expect(
      loadEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: `B${"a".repeat(80)}` }),
    ).rejects.toThrow(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  });

  it("accepts a padded key, which some generators emit", async () => {
    const padded = `B${"a".repeat(86)}=`;
    const { publicEnv } = await loadEnv({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: padded,
    });

    expect(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe(padded);
  });
});

/**
 * The guards above are worth nothing unless something actually runs them.
 *
 * `NEXT_PUBLIC_` values are compiled into the bundle, so validating them during
 * the build is sufficient - no bundle containing a rejected value is ever
 * produced - and it lets the browser do without zod. The cost is that the check
 * is no longer where the values are read, so these hold the arrangement in place
 * instead.
 */
describe("where the validation runs", () => {
  const SRC = fileURLToPath(new URL("..", import.meta.url));

  /**
   * Modules that run only in a browser without carrying a directive that says
   * so, because they are imported exclusively from client components.
   */
  const BROWSER_MODULES = ["lib/supabase/client.ts", "features/auth/auth-operations.ts"];

  function read(relative: string) {
    return readFileSync(join(SRC, relative), "utf8");
  }

  function sourceFiles() {
    return readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .map((name) => name.replace(/\\/g, "/"))
      .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  }

  it("hands the root layout an origin to render with", async () => {
    const { appOrigin } = await loadEnv();

    expect(appOrigin).toBe("https://dayflow.example.com");
  });

  it("keeps the root layout importing the validator", () => {
    // That import is the only thing that runs the schema during next build. If
    // this fails, restore it or move it to another module every build loads -
    // deleting the assertion leaves bad configuration building cleanly again,
    // which is the failure the whole of this file exists to prevent.
    expect(read("app/layout.tsx")).toContain('from "@/lib/env"');
  });

  it("keeps the browser-facing module free of imports", () => {
    // Every client component reaches it, so anything it imports lands in the
    // initial JavaScript of the entire application.
    const code = read("lib/public-env.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(code).not.toMatch(/\bimport\b/);
    expect(code).not.toMatch(/\brequire\(/);
  });

  it("keeps browser modules off the validator", () => {
    const offenders = sourceFiles().filter((name) => {
      const code = read(name);
      const reachesBrowser =
        /^["']use client["']/m.test(code) || BROWSER_MODULES.includes(name);

      return reachesBrowser && code.includes('from "@/lib/env"');
    });

    // One import deep rather than transitive: the route table in the build
    // output is the real measurement, and this catches the version of the
    // mistake that is easy to miss in review. 18 kB of zod is what it costs.
    expect(offenders).toEqual([]);
  });

  it("refuses a browser-facing variable the schema does not cover", async () => {
    vi.resetModules();

    for (const [name, value] of Object.entries(COMPLETE)) {
      vi.stubEnv(name, value);
    }

    vi.doMock("./public-env", () => ({
      publicEnv: { ...COMPLETE, NEXT_PUBLIC_UNCHECKED_THING: "anything" },
    }));

    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_UNCHECKED_THING/);

    vi.doUnmock("./public-env");
  });
});
