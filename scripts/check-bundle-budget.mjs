/**
 * Fails the build if any route's First Load JS exceeds the "Initial JavaScript,
 * gzipped" budget in section 9 of
 * docs/03-ux/22-accessibility-and-responsive-standards.md.
 *
 * That row carries no requirement ID - the identifiers in section 9 cover chart
 * code-splitting, layout shift and fonts, not the figure itself - so this script
 * is the only place the number is enforced. Comparing against Next's table is
 * legitimate because those sizes are already gzipped, as the budget is.
 *
 * Performance budgets that live only in a document are budgets nobody keeps. The
 * /analytics route was 333 kB before the charts were split out, and nothing but a
 * manual read of the build output would have caught it.
 *
 * Usage: npm run build | tee build-output.txt && node scripts/check-bundle-budget.mjs build-output.txt
 *
 * Run in CI by the `verify` job, against the log the build step captures.
 * DF-CD-004.
 *
 * It parses `next build`'s route table rather than the build manifests, because
 * the table is where Next itself resolves shared chunks into a per-route figure,
 * and reimplementing that arithmetic would be a second thing to keep correct.
 *
 * Exit codes: 0 within budget, 1 over budget or holding an obsolete allowance,
 * 2 could not tell - no file, or a route table it could not read.
 */

import { readFile } from "node:fs/promises";

const BUDGET_KB = 200;

/**
 * Routes that were already over budget on the day this check was wired into CI,
 * each with the size it had at that moment plus one kB as its ceiling.
 *
 * All three are over for the same reason: they carry the Supabase browser client
 * in their First Load JS. That is not a code-splitting problem and cannot be
 * fixed by a pull request that happens to touch one of them. ADR-015 records the
 * reasoning; the short version is that a gate which fails on arrival gets
 * switched off within a week, and a warning nobody must act on is not a gate at
 * all. So these three are named and frozen, and everything else - including
 * these three growing - fails.
 *
 * This is a debt register, not a second budget. Removing an entry is the point of
 * it, which is why an entry that is no longer needed fails the check too: an
 * exemption nobody is compelled to revisit quietly becomes the number.
 *
 * **A route that goes over budget on its own feature work does not belong here.**
 * Adding a line is the quickest way to make this step green and is almost always
 * the wrong one: the fix is to defer the imports that route just acquired, as the
 * four auth screens defer the Supabase client and src/features/analytics defers
 * Recharts. An entry here is a statement that nothing short of an architectural
 * change will help, and it needs the founder's agreement.
 *
 * The one kB above each measured figure is the resolution of the measurement,
 * not headroom: above 100 kB next build reports First Load JS to the nearest kB,
 * so a route printed as 203 kB is somewhere in 202.5 to 203.4, and a build on
 * another platform can legitimately print the next integer up.
 */
const ALLOWANCES = [
  { route: "/dashboard", ceilingKb: 205 }, // 204 kB on 2026-08-04
  { route: "/calendar/[date]", ceilingKb: 204 }, // 203 kB
  { route: "/goals", ceilingKb: 203 }, // 202 kB
];

/**
 * How far under budget an allowanced route must come before its entry is
 * reported as obsolete. A margin rather than zero for the same reason the
 * ceilings carry one kB: a check that fails on a rounding difference teaches
 * people to distrust the check rather than to read it.
 */
const STALE_MARGIN_KB = 2;

// Route rows look like:
//   ├ ○ /analytics    5.2 kB    214 kB
// The trailing figure is First Load JS. The leading tree glyphs vary between
// versions, so the route name is matched by its leading slash instead.
const ROUTE_ROW =
  /^[^\w/]*[○●ƒλ]?\s*(\/\S*)\s+[\d.]+\s*[kMG]?B\s+([\d.]+)\s*(B|kB|MB)\s*$/;

function toKilobytes(value, unit) {
  const size = Number(value);
  if (unit === "B") return size / 1024;
  if (unit === "MB") return size * 1024;
  return size;
}

const path = process.argv[2];

if (!path) {
  console.error("Usage: node scripts/check-bundle-budget.mjs <next-build-output.txt>");
  process.exit(2);
}

/**
 * Decoded from the bytes rather than assuming UTF-8, because Windows PowerShell's
 * Tee-Object writes UTF-16LE by default. Read as UTF-8 that file looks like
 * interleaved nulls, no route matches, and the failure reads as though next build
 * changed its output format.
 */
function decode(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le", 2);
  if (buffer[0] === 0xfe && buffer[1] === 0xff)
    return buffer.swap16().toString("utf16le", 2);
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString("utf8", 3);
  }
  return buffer.toString("utf8");
}

const lines = decode(await readFile(path)).split(/\r?\n/);
const routes = [];

for (const line of lines) {
  // Strip ANSI colour, which is present whenever the build ran attached to a tty.
  const plain = line.replace(/\u001B\[[\d;]*m/g, "");
  const match = ROUTE_ROW.exec(plain);
  if (match === null) continue;

  const [, route, value, unit] = match;
  routes.push({ route, firstLoadKb: toKilobytes(value, unit) });
}

if (routes.length === 0) {
  // Silence here would read as a pass, and a budget that stops being enforced
  // without saying so is worse than not having one.
  console.error(
    `Parsed no routes from ${path}. Either the build did not run or next build's\n` +
      "output format changed. Update ROUTE_ROW in this script.",
  );
  process.exit(2);
}

const allowanceFor = (route) => ALLOWANCES.find((entry) => entry.route === route);

const over = [];
const obsolete = [];

for (const entry of routes) {
  const allowance = allowanceFor(entry.route);
  const ceiling = allowance ? allowance.ceilingKb : BUDGET_KB;

  if (entry.firstLoadKb > ceiling) {
    over.push({ ...entry, ceiling, allowanced: allowance !== undefined });
  } else if (allowance && entry.firstLoadKb <= BUDGET_KB - STALE_MARGIN_KB) {
    obsolete.push({ ...entry, reason: "is now within budget" });
  }
}

// An allowance for a route that no longer appears in the table is either a
// renamed route or a deleted one. Either way the entry is now silently excusing
// nothing, and would go on doing so indefinitely.
for (const allowance of ALLOWANCES) {
  if (!routes.some((entry) => entry.route === allowance.route)) {
    obsolete.push({ ...allowance, firstLoadKb: null, reason: "no longer exists" });
  }
}

const withinBudget = routes.filter((entry) => entry.firstLoadKb <= BUDGET_KB);
const worst = [...routes].sort((a, b) => b.firstLoadKb - a.firstLoadKb)[0];

if (over.length > 0) {
  console.error(`First Load JS budget is ${BUDGET_KB} kB. Over:\n`);
  for (const entry of over) {
    const limit = entry.allowanced
      ? `over its ${entry.ceiling} kB allowance`
      : `over the ${BUDGET_KB} kB budget`;
    console.error(
      `  ${entry.route.padEnd(40)} ${entry.firstLoadKb.toFixed(1)} kB  ${limit}`,
    );
  }
  console.error(
    "\nSplit the heaviest imports out with next/dynamic, as src/features/analytics\n" +
      "does for Recharts, or import types rather than values where a module is only\n" +
      "needed for its shape - importing a Zod schema as a value is what put 18 kB of\n" +
      "validator into /insights.\n\n" +
      "The budget itself is set in section 9 of\n" +
      "docs/03-ux/22-accessibility-and-responsive-standards.md. Changing it needs a\n" +
      "decision log entry, not an edit to this script.",
  );
  process.exit(1);
}

if (obsolete.length > 0) {
  console.error("Remove these entries from ALLOWANCES in this script:\n");
  for (const entry of obsolete) {
    const size =
      entry.firstLoadKb === null ? "" : ` (${entry.firstLoadKb.toFixed(1)} kB)`;
    console.error(`  ${entry.route.padEnd(40)} ${entry.reason}${size}`);
  }
  console.error(
    "\nThis is the check succeeding, not failing: the route it was excusing no longer\n" +
      "needs excusing. Delete the entry and the gate tightens by itself.",
  );
  process.exit(1);
}

// The allowanced routes are reported on success, every run, so that they stay in
// front of whoever reads the log rather than being remembered only by this file.
// One call, because the interesting output of a passing check is one paragraph.
console.log(
  [
    `${withinBudget.length} of ${routes.length} routes are within the ${BUDGET_KB} kB ` +
      `First Load JS budget. Heaviest: ${worst.route} at ${worst.firstLoadKb.toFixed(1)} kB.`,
    ...ALLOWANCES.map((allowance) => {
      const entry = routes.find((candidate) => candidate.route === allowance.route);
      return (
        `  over budget, allowed by ADR-015: ${allowance.route.padEnd(20)} ` +
        `${entry.firstLoadKb.toFixed(1)} kB of ${allowance.ceilingKb} kB`
      );
    }),
  ].join("\n"),
);
