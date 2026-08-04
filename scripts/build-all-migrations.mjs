/**
 * Rebuilds supabase/all-migrations.sql from supabase/migrations/*.sql.
 *
 * The bundle exists for people applying the schema through the Supabase dashboard
 * SQL editor, where pasting one file beats pasting fourteen in the right order.
 * It was previously maintained by hand, which meant a new migration could be
 * added and the bundle left a version behind - and the mistake is invisible until
 * someone provisions a fresh project from the stale copy.
 *
 * Run with `npm run db:bundle`. `npm run db:bundle:check` fails if the committed
 * bundle no longer matches the migrations, which is what CI runs.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const bundlePath = join(root, "supabase", "all-migrations.sql");

const RULE = `-- ${"=".repeat(77)}`;

function header(files) {
  const first = files[0].slice(0, 4);
  const last = files[files.length - 1].slice(0, 4);

  return [
    RULE,
    "-- DayFlow AI - complete database schema, all migrations in one file",
    "--",
    "-- GENERATED FILE. Rebuild it with `npm run db:bundle`; do not edit it directly.",
    `-- It is supabase/migrations/*.sql concatenated in filename order, ${first} through`,
    `-- ${last}. An edit made here is lost the next time it is rebuilt, and worse, it`,
    "-- silently disagrees with the migration it came from.",
    "--",
    "-- Who this is for. It exists for people applying the schema through the Supabase",
    "-- dashboard SQL editor, so that the whole schema can be pasted once instead of",
    `-- ${files.length} times in the right order. If you have the Supabase CLI, run`,
    "-- `supabase db push` instead and ignore this file.",
    "--",
    "-- It is safe to run as a whole, and safe to re-run: the migrations are written to",
    "-- be idempotent wherever that is practical. If some of them are already applied",
    "-- to a live project, running the whole file again is still the safe option -",
    "-- never edit an applied migration, because it will not re-run and the live schema",
    "-- and this repository will quietly stop agreeing.",
    "--",
    "-- IMPORTANT - migration 0011. It registers the pg_cron jobs for reminders and",
    "-- auto-close, and it reads two secrets from Supabase Vault, `dayflow_app_url` and",
    "-- `dayflow_cron_secret`. If those secrets do not exist yet, 0011 emits a warning",
    "-- and carries on; scheduled reminders simply will not fire until the secrets are",
    "-- added. That is expected and is not an error. See step 7 of the README for how to",
    "-- create them.",
    RULE,
  ].join("\n");
}

async function build() {
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migrations found in ${migrationsDir}`);
  }

  const sections = await Promise.all(
    files.map(async (name) => {
      const sql = await readFile(join(migrationsDir, name), "utf8");
      return `-- ===== ${name} =====\n\n${sql.trim()}`;
    }),
  );

  return `${header(files)}\n\n\n${sections.join("\n\n\n")}\n`;
}

const bundle = await build();

if (process.argv.includes("--check")) {
  const committed = await readFile(bundlePath, "utf8").catch(() => "");

  if (committed !== bundle) {
    console.error(
      "supabase/all-migrations.sql is out of date. Run `npm run db:bundle` and commit the result.",
    );
    process.exit(1);
  }

  console.log("supabase/all-migrations.sql matches the migrations.");
} else {
  await writeFile(bundlePath, bundle, "utf8");
  console.log(`Wrote supabase/all-migrations.sql from ${bundle.length} bytes of SQL.`);
}
