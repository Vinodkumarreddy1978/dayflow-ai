# DayFlow AI — continuation brief

Written 4 Aug 2026, revised the same day, again on 5 Aug 2026 after a full verification run,
again on 6 Aug 2026 after the app was deployed and its first real users found things, and
again on 7 Aug 2026 after the WIP branch was verified and the verification gaps closed.
Point a new chat at this file to resume without re-deriving context.

Read `README.md` for setup and `docs/README.md` for the specification map. This file
covers only what a fresh session cannot infer from the repository itself.

---

## 0. Read this first — the WIP branch is verified, not yet merged

The app is **deployed and live on Vercel**, tracking `main`. Treat `main` as production.

Branch `wip/session-handoff-2026-08-06` holds the post-deployment fixes from section 7, plus
the verification cleanup from 7 Aug 2026. It has been typechecked, linted, tested, built and
budget-checked as a set. **It has not been merged to `main`.** Merging deploys.

What a resume session should do next, in order:

1. Confirm the suite in section 1 still passes on the branch tip.
2. Apply migrations `0014`–`0017` to the live database (operator, SQL editor) — the streak
   and insights fixes are inert until `0016` and `0017` are applied; account deletion needs
   `0015`; daily-report cron needs `0014`.
3. Merge to `main` only when ready to deploy.
4. On-device check of the mobile tab bar (section 7.5) — the component is present in code;
   the original report was never reproduced after the disconnect.

What landed on the branch, by area — all verified locally on 7 Aug 2026:

| Files                                                                     | Intent                                                              | Status                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/lib/domain/goal-rules.ts`, its test, `supabase/migrations/0016`      | The false 731-day streak — see section 7.1                          | Code+tests green; needs live `0016`                       |
| `src/features/settings/save-settings.ts`, `use-update-settings.ts`, API   | "That setting could not be saved" — see section 7.2                 | Verified; write path deferred from First Load             |
| `src/features/analytics/analytics-charts.tsx`, `chart-geometry.ts`, tests | Vertical responsive bars showing hours — see section 7.3            | Verified                                                  |
| `src/app/api/reports/generate/route.ts`, `src/lib/ai/provider.ts`, `0017` | Insights failing to generate — see section 7.4                      | Code green; needs live `0017`                             |
| `.github/workflows/ci.yml`, `package.json`, `package-lock.json`           | Dependency audit and Node 24 actions                                | `npm audit --audit-level=high` clean; `@v7` pins are real |
| `e2e/public-routes.spec.ts`                                               | Four failing Playwright tests                                       | Tests corrected; form is non-enumerating                  |
| `docs/NATIVE-APP-PLAN.md`                                                 | Android/iOS plan; icon claim corrected; `.well-known` matcher fixed | Verified against repo                                     |

A corrupted empty `.git/rebase-merge` (OneDrive reparse point) was removed on 7 Aug with
`attrib` + delete; the branch tip was already complete. Stray build logs named in the
previous revision were deleted.

---

## 1. Where the build stands

Every screen on the roadmap exists. No placeholder pages remain.

The suite below was run on 7 Aug 2026 against `wip/session-handoff-2026-08-06`:

| Check                          | Result                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `npx tsc --noEmit`             | Clean                                                        |
| `npx eslint .`                 | 0 errors, 3 pre-existing `no-console` warnings in `scripts/` |
| `npx vitest run`               | 399 tests across 16 files, all passing                       |
| `npx next build`               | Succeeds                                                     |
| `npx prettier --check .`       | Clean                                                        |
| `npm run db:bundle:check`      | Clean (regenerated for `0016`/`0017`)                        |
| `npm audit --audit-level=high` | 0 vulnerabilities                                            |
| `npm run budget`               | Passes; three ADR-015 allowances still listed                |

`/insights` and `/settings` both measure 200 kB First Load after splitting the settings
read hooks from the write path and deferring export/delete cards. Do not recombine
`use-settings.ts` and `use-update-settings.ts`.

The three lint warnings are `console.log` calls in `scripts/`, where the rule allows only
`warn` and `error`. They are build tooling writing to a terminal on purpose.

| Area                                                                   | State                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Specification suite (37 documents)                                     | Complete                                                                                                       |
| Database — 17 migrations                                               | `0001`–`0013` applied to the live project; **`0014`–`0017` all need applying**                                 |
| Foundation — clients, types, auth, query, realtime, Zod                | Complete                                                                                                       |
| App shell, UI kit, theming, navigation                                 | Complete                                                                                                       |
| Auth — sign up, sign in, confirmation, password reset, error surfacing | Complete; the consolidation described in the old brief is fully applied                                        |
| Dashboard, add/edit activity, pending queue, day timeline              | Complete                                                                                                       |
| Categories manager                                                     | Complete                                                                                                       |
| Analytics, calendar, day detail, search                                | Complete                                                                                                       |
| Goals, streaks, productivity score                                     | Complete                                                                                                       |
| Notifications — service worker, push routes, three cron handlers       | Complete                                                                                                       |
| AI insights engine                                                     | Complete                                                                                                       |
| Settings                                                               | Complete, including the data export and delete-account controls                                                |
| Account deletion                                                       | Decided (ADR-014), implemented in SQL by `0015`, interface built; unrun against a live database                |
| Tests — Vitest unit suites, two Playwright specs                       | Complete: 332 unit tests across 14 files; the authenticated Playwright spec needs credentials and skips itself |
| GitHub Actions CI                                                      | **Has now run, and fails.** Two jobs red — see section 8                                                       |
| PWA icons                                                              | Complete, generated by `npm run icons:generate`, and all three PNGs are committed and unignored                |
| Security headers — CSP, HSTS                                           | Complete, verified against a running production server                                                         |

`GO-LIVE.md` section 5 tracks where the documents and the code disagree. All seven entries are
now closed. The last of them — the user-facing data export and account deletion — was a missing
feature rather than a stale sentence, and the feature now exists in `src/features/settings/`
with `/api/export` behind it. It has not been exercised against the live project; step 42 of
`GO-LIVE-STEPS.md` is the procedure for that.

---

## 2. Toolchain — read this before running any command

**Git is now installed properly** — Git for Windows, on the PATH, authenticated to GitHub,
with `user.name` and `user.email` configured. The portable MinGit workaround described in
earlier revisions of this file is gone. An assistant session can commit and push directly, so
do not hand git commands to the operator as manual steps.

One thing about git on this machine that will otherwise cost an hour: it sits behind a
**corporate TLS-inspecting proxy** which re-issues certificates with no CRL or OCSP pointers.
Windows' native Schannel backend rejects those with `CRYPT_E_NO_REVOCATION_CHECK (0x80092012)`
on every push, and `http.schannelCheckRevoke=false` does not suppress it. The fix already
applied is to use the OpenSSL backend against a CA bundle exported from the Windows root
store, which keeps full certificate validation rather than disabling it:

```
http.sslBackend  = openssl
http.sslCAInfo   = %LOCALAPPDATA%\dayflow-toolchain\certs\windows-root-ca-bundle.pem
```

Pushes take 60 to 120 seconds through that proxy. Set shell timeouts accordingly and do not
assume a slow push has hung.

**Node is not on the system PATH.** A portable Node 24.19.0 was downloaded and extracted to:

```
%LOCALAPPDATA%\dayflow-toolchain\node-v24.19.0-win-x64
```

Prefix every shell command:

```powershell
$env:Path = "$env:LOCALAPPDATA\dayflow-toolchain\node-v24.19.0-win-x64;$env:Path"
cd "C:\Users\preddy111\OneDrive - PwC\Documents\DayFlowAI"
```

Three constraints that will otherwise waste time:

- Shell calls need `required_permissions: ["all"]`. There is no sandbox backend on this
  machine, so sandboxed commands fail to spawn with a message that reads like a
  permission denial but is not one.
- Shell startup takes roughly 35 seconds before the command itself begins. Batch related
  commands into one call and set timeouts of 300000ms or more.
- The project lives inside OneDrive. `node_modules` is already installed; avoid
  deleting and reinstalling it casually, and never let a sync client hold those files
  mid-install.

### Building inside OneDrive

`next build` fails intermittently because OneDrive turns files in `.next` into cloud
placeholders while the build is still reading them. It surfaces as a different error each
time, all of them looking like a code fault and none of them being one:

```
EINVAL: invalid argument, readlink '.next\diagnostics'
ENOENT: no such file or directory, open '.next\server\pages-manifest.json'
PageNotFoundError: Cannot find module for page: /_document
```

What works, reliably:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
New-Item -ItemType Directory -Path .next -Force | Out-Null
attrib +P -U .next          # pin: always keep on this device, never dehydrate
Start-Sleep -Seconds 4
npx next build
```

Pinning `.next` is usually enough. If the build still dies — `UNKNOWN: unknown error, read`
while collecting page data is the form it took on 5 Aug — pin the repository root as well,
`attrib +P -U .`, because the source files are being dehydrated too, not just the output.

**Do not move `.next` outside OneDrive with a directory junction.** It looks like the
obvious fix and it fails in a way that wastes twenty minutes: Node resolves the real path
of a file before resolving its imports, so everything under the junction looks for
`node_modules` next to the junction target instead of next to the project, and the build
dies on `Cannot find module 'react/jsx-runtime'`.

The same dehydration hits source files, not just build output. On 6 Aug 2026 the operator
could not edit `.env.local` at all: OneDrive was holding it as a cloud placeholder — visible
as a `ReparsePoint` attribute — so every save from the editor failed or reverted. `attrib +P -U`
on the file fixes it. If anyone reports that an edit "won't stick", check the attribute before
looking for a cause in the editor.

---

## 3. Live Supabase project

Project ref `lfwefuvoyyplxwnyjqtm`, region unknown, URL
`https://lfwefuvoyyplxwnyjqtm.supabase.co`.

Migrations `0001`–`0013` have been applied through the dashboard SQL editor. **Treat every
applied migration as immutable.** Changing one will not re-run it, so the live schema and
the repository will silently disagree. Add a new numbered file instead, and regenerate
`supabase/all-migrations.sql` with `npm run db:bundle` — it is a generated concatenation
used by people applying the schema without the CLI, and `npm run db:bundle:check` fails if
it has drifted.

`0014` and `0015` are pending and are therefore still editable. `0014` was in fact edited
after it was written, to correct a `security definer` function that set
`search_path = public` instead of empty, which breached DF-SEC-004 and check 6 of section 9
of `docs/04-architecture/25-database-schema-and-rls.md`. That was legitimate only because it
had not been applied. `0016` and `0017` are likewise unapplied and editable. **Once you apply
any of them, that file becomes immutable like the rest.**

### Configuration status

| Item                                                   | State                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                             | Set to the real project                                                                                                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                        | Set — note this is the newer `sb_publishable_...` format, not a legacy `anon` JWT                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                            | Set — newer `sb_secret_...` format. **Was pasted into a chat transcript, so roll it in Project Settings → API before any deployment** |
| `CRON_SECRET`, VAPID keys                              | Generated locally, and the VAPID public key is a real 87-character key                                                                |
| Migrations `0014`–`0017`                               | **Not applied.** Apply them in order, on their own, in the SQL editor                                                                 |
| Auth → URL Configuration                               | Done, including the `**` wildcard redirect                                                                                            |
| Auth → Providers → Email → Confirm email               | Off, which is correct for development. **Must be on before deploying**                                                                |
| Vault secrets `dayflow_app_url`, `dayflow_cron_secret` | Not created. Reminders will not fire until they are — see README step 7                                                               |

The project is otherwise fully configured, and the app can talk to the real database.

The scheduled jobs from migration `0011` are registered but currently no-op, logging a
warning that the Vault secrets are absent. That is expected, not a fault. The cron route
handlers they need now exist, so creating the Vault secrets is the only remaining step.

Everything that must change when this stops being a development project is in `GO-LIVE.md`.

---

## 4. Traps already hit — do not rediscover these

**`src/lib/supabase/database.types.ts` is hand-written and fragile.** Two mistakes each
produce the same symptom: every table resolves to `never` and all queries report "not
assignable to parameter of type 'never'", with the error pointing nowhere near the
cause.

1. Every row shape must be a `type` alias, never an `interface`. Supabase requires rows
   to satisfy `Record<string, unknown>`, and TypeScript only grants implicit index
   signatures to type aliases.
2. `Views` and `CompositeTypes` must be `{ [_ in never]: never }`, not
   `Record<string, never>`. The library intersects `Tables & Views`, and an index
   signature returning `never` collapses every table through that intersection.

Regenerate with `npm run db:types` once the CLI is linked rather than hand-editing.

**`typedRoutes` is enabled** (top level in `next.config.ts`, not under `experimental`).
Every `href` and `router.push()` target is checked against the real route tree. A route
must exist before anything can link to it, and runtime-derived paths need `as Route`. That
cast is confined to one place, `src/features/auth/redirect-guard.ts`, which is also the
security guard for the `next` parameter — keep both concerns there rather than casting at
each call site.

**`next-env.d.ts` must stay in the ESLint ignore list.** Next regenerates it on every
build with triple-slash references that violate a rule applied everywhere else.

**Realtime needs more than a subscription.** Migration `0012` adds tables to the
`supabase_realtime` publication and sets `replica identity full`. Without the latter, a
DELETE payload carries only the primary key, so it never matches the `user_id` filter
the client subscribes with and deletions never propagate.

**The environment schema now refuses values it used to accept.** `NEXT_PUBLIC_APP_URL` is
required, must be an absolute `http`/`https` origin, and must not end in a slash.
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` may be empty, but if present must be a real 87-character
key. Both are covered by `src/lib/env.test.ts`. If a build fails naming one of these, the
configuration is wrong rather than the check.

---

## 5. Architecture decisions that constrain new code

Full rationale is in `docs/00-governance/04-decision-log.md`. The ones most likely to be
violated by accident:

- **Business rules are enforced twice, deliberately** (ADR-004). Pure functions in
  `src/lib/domain/` give the user an inline error; database triggers in
  `supabase/migrations/0008_triggers.sql` provide the actual guarantee, because a second
  device or a direct REST call bypasses the client entirely. Changing a rule means
  changing both.
- **The queue limit is a hard refusal, not a warning** (ADR-009). A dismissible warning
  becomes invisible within a week.
- **Moments split at local midnight** (ADR-010). Aggregation happens in SQL, never by
  summing rows in the browser.
- **The AI never calculates.** It receives finished figures from `get_period_facts` and
  interprets them (ADR-011).
- **The service role client bypasses row level security.** An ESLint rule confines
  `src/lib/supabase/admin.ts` to `src/app/api/cron/`. Do not relax it casually — and note
  that no ADR records this decision, so account deletion needing it is a decision to write
  down rather than an exception to grant.

---

## 6. Remaining work, in build order

0. **The middleware is now live, and its signed-out behaviour is verified.** Read this
   before touching auth or routing, because it is recent and it changed what runs.

   `middleware.ts` was originally written at the repository root. This project keeps its
   code in `src/`, and Next.js only loads middleware from beside `app/` — so with
   `src/app/`, it must be `src/middleware.ts`. It was therefore never compiled and
   **never executed** for most of this project's life. Authenticated routes were not
   unprotected in that time: the `getUser()` check in `src/app/(app)/layout.tsx` was doing
   that job alone.

   It has been moved to `src/middleware.ts`, the root copy is gone, and the following was
   confirmed against a production build served by `next start`:

   | Check                                                    | Result                                          |
   | -------------------------------------------------------- | ----------------------------------------------- |
   | `next build` prints a `Middleware` line                  | Yes, 92.7 kB — so it is compiled and registered |
   | `/`, `/sign-in`, `/sign-up`, `/reset-password`           | 200                                             |
   | `/dashboard`, `/analytics`, `/settings` signed out       | 307 to `/sign-in?next=<path>`                   |
   | `/update-password` signed out                            | 307, where it previously returned 200           |
   | `/sw.js`, `/manifest.webmanifest`, `/icons/icon-192.png` | 200, not intercepted                            |
   | Second hop from `/sign-in?next=/dashboard`               | 200, no loop                                    |

   The `next` parameter is what proves the middleware ran rather than the layout guard,
   because the layout guard omits it. `18` tests in `src/lib/supabase/middleware.test.ts`
   cover the matching logic.

   **What is still unverified needs a real session and therefore the live project:**
   DF-UX-192, which bounces a signed-in user off the auth screens, and the recovery flow
   end to end — `/reset-password` → email link → `/auth/callback?next=/update-password` →
   the form. `/update-password` is deliberately absent from `PUBLIC_ROUTES` and depends on
   the session the callback exchange creates, so it is the flow most likely to loop. Do it
   as part of step 5.

   Related: the `hasSession` pre-flight check in `update-password-form.tsx` was removed on
   the reasoning that the middleware guarantees a session — false when it was written, true
   now. If the middleware is ever moved back, reinstate a check that distinguishes "no
   session" from "could not ask", so a dropped request does not declare a valid link dead.

1. **Apply migrations `0014`, `0015`, `0016` and `0017`** to the live database, in order, in
   the SQL editor. This cannot be done from this repository. `/api/cron/daily-report` depends
   on `0014`: `buildReport` is given a user id there, which takes the
   `get_period_facts_for_user` branch in `src/lib/ai/report.ts` lines 56-63, and that function
   is what `0014` adds. `/api/reports/generate` does **not** — it omits the user id, so it
   takes the `get_period_facts` branch from `0010` — but it needs `0017` for the `ai_reports`
   insert/update RLS policies, which is why generation failed on the live site. `0015` is what
   makes account deletion possible at all — see the note below. `0016` is the streak semantics
   fix from section 7.1. Until `0015` is applied, the delete-account dialog reports the feature
   as unavailable and deletes nothing, which is the `PGRST202` branch in
   `src/features/settings/delete-account.ts`. Until `0016`/`0017` are applied, streaks and
   insights keep their production defects even though the code on the branch is correct.
2. **Create the Vault secrets** `dayflow_app_url` and `dayflow_cron_secret`, per
   `GO-LIVE.md` 1.6. Until they exist the scheduled jobs run and do nothing.
3. **Verify the data export and the account deletion interface** against a throwaway account
   on the live project. Both are now built, and this item is no longer construction work —
   the procedure is step 42 of `GO-LIVE-STEPS.md`. What exists: `/api/export` streams every
   table as JSON or one table as CSV (DF-PRV-020, DF-SET-022); the delete dialog states what
   is destroyed and requires the phrase `delete my account` typed in (DF-PRV-022,
   DF-SET-024); it offers the export inside itself before the confirmation (DF-PRV-023,
   DF-SET-025); and `use-delete-account.ts` signs out locally, clears the query cache and
   performs a document load to `/` (DF-SET-023).

   That last part is not taste. `delete_account` returns after destroying the rows, but the
   caller's access token stays valid until it expires, so the interface signs out
   immediately rather than relying on the next request to fail. Nothing about it has been
   run against a database that actually has `0015` applied.

4. **Decide the bundle budget question.** See below. It is a decision, not a defect.
5. **End-to-end verification against the live project** — sign up, record an activity,
   close it, confirm it syncs to a second device, confirm a reminder fires. The checklist is
   `GO-LIVE.md` 3.3.

**Account deletion was impossible before `0015`, by any route.** The
`protect_system_parent_category` trigger from `0008` refuses to delete a `parent_categories`
row with `is_system = true` for every role, with no exemption. Every account has exactly one
such row, `Distracted Time`, seeded by `0009`, and that refusal fires inside the cascade from
`auth.users`. So DF-PRV-021 was unsatisfiable not only for a function but for an operator
deleting a user from the Supabase dashboard. `0015` narrows the guard so it yields while an
account deletion is in progress, signalled by a transaction-local flag that nothing reachable
over REST can set. If you ever need to delete a user by hand before `0015` is applied, this
is why it fails.

### The bundle budget

**`scripts/check-bundle-budget.mjs` now passes.** It enforces the "Initial JavaScript,
gzipped — Under 200KB" row from section 9 of
`docs/03-ux/22-accessibility-and-responsive-standards.md`. That row has no requirement ID —
`DF-A11Y-060` is the requirement that _charts_ be code-split, so do not cite it for the
budget — and the script is the only thing enforcing it.

It passes with three named allowances, not with a raised budget: `BUDGET_KB` is still 200.
`/dashboard`, `/calendar/[date]` and `/goals` are frozen at 205, 204 and 203 kB respectively
under ADR-015, each one kB above what it measured on 4 Aug 2026 to absorb Next's rounding.
Those three are a debt register the script prints on every successful run, and it fails if
any of them grows or if one drops far enough under budget to make its entry pointless. Read
the header of the script before adding a fourth: a route that goes over on its own feature
work does not belong there.

The earlier conclusion in this file, that the shared client runtime nearly exhausted the
budget by itself, was **wrong**. It was arrived at by arithmetic on the route table rather
than by measurement. What the excess actually consisted of, measured by gzipping each chunk
and fingerprinting its contents:

| Item                          | Gzipped | Why it was there                                                                                                                                                      |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser Supabase client stack | ~64 kB  | `SupabaseClient` eagerly constructs its Postgrest, Realtime, Storage and Functions sub-clients, so `storage-js` and `functions-js` shipped although nothing uses them |
| zod                           | ~18 kB  | `src/lib/env.ts` validated at module load, so every client component importing a public value carried the validator                                                   |
| `tailwind-merge` plus `clsx`  | ~8 kB   | the `cn` helper                                                                                                                                                       |

Two of the three are now dealt with. The four auth screens defer the Supabase import into
their submit handlers, warming it after first paint, which took them from 203 kB to 118 kB
without moving a single provider — which is also what disproved the theory that the layout
providers were to blame. And zod no longer reaches the browser: `src/lib/public-env.ts` holds
the values and `src/lib/env.ts` holds the schema, so validation happens at build time and on
the server only.

Between them those two changes took the number of routes over budget from thirteen to four.
A fourth change closed `/insights`, which was the outlier at 217 kB: it was importing
`reportContentSchema` from `src/lib/ai/facts.ts` as a runtime value in order to validate
stored reports on read, which pulled the whole of zod into that one route's chunk.
`src/features/insights/report-content.ts` now restates the same contract as a plain
predicate, and `report-content.test.ts` runs every fixture through both the predicate and the
schema so the two cannot drift apart unnoticed. `/insights` measured 200 kB on 5 Aug 2026.

Three routes remain over, all by 2 to 4 kB, and what they are carrying is the Supabase client
stack. Closing that means stopping the eager construction of sub-clients this product never
uses, and loading `realtime-js` only on screens that actually subscribe. That is ADR-sized
work, not a budget adjustment, and until it happens those three sit in the allowance list
above.

**If you would rather raise the number than do that work, section 8 of
`docs/00-governance/01-documentation-index-and-standards.md` requires an entry in the decision
log, because it contradicts approved content.** Change the figure in the specification table
and in the script together, in the same commit, or they will drift. Do not quietly raise one.

The script is wired into CI as the `Bundle size budget` step of the `verify` job, running
against the log the build step captures. That workflow has now run for real — see section 8 —
and the `Lint, test and build` job it belongs to passed. There is also a second, entirely
unenforced budget in the same specification table: "Total JavaScript, gzipped — Under 400KB".

Per-route figures are not repeated here beyond the two above, because they are stale the week
after they are written. `npm run build` prints the current table and `npm run budget` reads it.

### Smaller things, deliberately left

- `invoke_cron_endpoint` builds its target as `v_url || p_path`, so a trailing slash on the
  `dayflow_app_url` Vault secret produces a double slash. `NEXT_PUBLIC_APP_URL` is now
  validated against exactly this mistake; the Vault secret is not, because it lives in the
  database.
- The Content Security Policy permits `'unsafe-inline'` in `script-src`, because the App
  Router serves its hydration payload as inline script tags. Removing it means per-request
  nonces from the middleware, which opts every route out of static rendering. Recorded in
  `docs/06-operations/34-security-and-threat-model.md` section 4.6 and `GO-LIVE.md` section
  5 rather than left to be discovered.
- The `Dependency audit` job in CI reports high and critical advisories only. Lower
  severities are a monthly manual task per `GO-LIVE.md` 4.2.

### Defects in `src/lib/logger.ts`, now fixed

Four defects were recorded here as deferred, re-read against the file on 5 Aug 2026, and
fixed later the same day. None had ever been reachable from a caller in `src/` — nothing
passes a `Map`, a `Set`, or a `processed` key of its own — so all four were latent, which is
why they were fixable in one pass rather than urgent.

Each fix has tests in `src/lib/logger.test.ts`, which is now 36 tests rather than 22, and
the whole suite plus `tsc --noEmit`, `eslint .`, `prettier --check .`, `next build`,
`npm run db:bundle:check` and `npm run budget` were run against the tree afterwards. Results
are the table in section 1. No route's First Load JS moved.

- **Map and Set contents bypassed key-name redaction.** This was the one that mattered:
  `sanitise` converted both with `[...value]`, producing arrays whose elements never reach
  `isForbiddenKey`, so `new Map([["authorization", token]])` was logged in clear while the
  identical plain object was redacted. A `Map` is now emitted as an object so that its keys
  meet the same deny list an object's keys do, a `Set` keeps its list shape, and the members
  of both are recursed into with every rule applied at each level. A `Map` is capped at
  `MAX_ARRAY` entries like an array, and a key that is not a primitive is named by its
  position rather than by its `toString`, which can throw and can return the very content
  being kept out.
- **The circular-reference `WeakSet` is now unwound** on the way back up, so it holds the
  ancestors of the value being serialised rather than everything ever visited. An object in
  two sibling positions is logged twice; only a genuine cycle reads as `[circular]`.
- **`logCronRun` can no longer be talked out of its own counts.** The DF-OBS-004 fields are
  spread after the caller's context and win. A collision is reported under `overriddenKeys`
  rather than dropped in silence, because discarding a field the caller believed it was
  logging is the same defect facing the other way.
- **The comment claiming a single `console` call is corrected.** It sat on `stdout`, not on
  the file header. `emit` also writes through `console.warn` and `console.error`, which the
  `no-console` configuration already permits; the `eslint-disable-next-line` covers the one
  `console.log` under `src/` and remains the only `no-console` exemption in the repository.

Five further ways data could be exposed, lost or left unbounded were found while fixing
those, and are fixed in the same pass:

- **Field names were emitted unscrubbed.** `isForbiddenKey` judges the value under a name
  and can say nothing about the name itself, so a lookup keyed by email address — which is
  what a `Record<email, row>` is — printed the addresses as JSON keys. Keys now go through
  the same scrubbing and the same length bound as any other string.
- **`Error` values escaped both the depth limit and the cycle check**, because they were
  matched in front of those checks. An error whose `cause` pointed at itself recursed without
  bound; the resulting stack overflow was caught by `write`, so the caller was safe and the
  context was lost. Both checks now come first.
- **An invalid `Date` threw from `toISOString`** inside the serialiser, which discarded every
  other field in the record. It now reads `[invalid date]`.
- **A typed array or `Buffer` was enumerated byte by byte**, emitting one numbered field per
  byte — unbounded output, and the bytes of a credential in a form no string rule can see.
  Only its size is logged now.
- **A field named `__proto__` disappeared from the line.** Assigning it with `[]=` runs
  Object.prototype's setter instead of adding a property, and `JSON.parse` of an upstream
  response produces exactly that key. It is emitted as `[proto]` now. This was not a leak:
  the value assigned has already been through the rules, and nothing in a sanitised graph is
  callable, so the inherited `toJSON` that would make it one cannot be reached. It was a
  field vanishing in silence, which is the class of defect the unwound `WeakSet` above is.

Ancestor-only cycle detection is what makes the sibling case correct, and it is also what
lets a small graph that shares its children expand into millions of values on the way out.
So the walk now carries a `MAX_NODES` budget and stops when it is spent. That guard is
asserted by a test rather than assumed.

Left alone deliberately:

- **A getter that throws still costs the whole context**, not just the field holding it. The
  record survives with `contextSerialisation: "failed"`, which is the existing design and is
  asserted by a test that predates this work. Making it per-field is a behaviour change, not
  a defect fix.
- **Free text under an innocuous key still passes.** Key-name redaction is a deny list;
  `{ diagnostic: "user wrote ..." }` is indistinguishable from a real diagnostic. The value
  patterns catch addresses, bearer tokens, JWTs and configured secrets, and nothing catches
  prose.
- **The breadth of a plain object is bounded only by the node budget**, not by a key count of
  its own, and the own-property loop inside the error serialiser has no break at all. Both
  cost output size on a pathological payload rather than time, and neither can hang.

### Concurrency warning

Two agents once edited the same files simultaneously and one silently overwrote the
other's password reset implementation. If work is split across parallel agents, give
each one explicit, non-overlapping file ownership.

A second failure mode appeared on 6 Aug 2026: **the workspace disconnected while five agents
were running, and all of them died mid-task.** Their partial edits stayed on disk with no
record of what was finished and what was abandoned, which is what section 0 is cleaning up
after. The lesson is to commit at each completed unit of work rather than at the end of a batch,
so that an interruption costs one change instead of five.

---

## 7. What real use found after deployment

The app went live on Vercel on 6 Aug 2026 and was used. Five defects surfaced within the hour,
which is worth noting on its own: none of them were caught by 332 unit tests, because all five
live in the gap between a correct function and a correct product. Fixes for four are on the WIP
branch, unverified. Intent is recorded here because the workers that wrote them are gone.

### 7.1 The streak said 731 days on a new account

The most serious of the five, because it is a correctness failure in the feature that is
supposed to motivate the user. `get_streak` scans 730 days backwards, and for an **at-most**
goal it treats any day with zero recorded minutes as a day the goal was met. Days before the
account existed have zero recorded minutes. So a brand-new user creating "keep Social Media
under 30m a day" is congratulated on a 731-day current streak and a 731-day best.

The same logic means a lapsed user's streak **grows while they are away**, which inverts the
entire point of a streak. Do not fix only the display: the semantics are wrong, and the fix
needs a lower bound at account creation and a distinction between "met" and "no data".
`supabase/migrations/0016_streak_semantics.sql` is the attempt. It is unapplied and therefore
still editable — see section 3 on immutability.

### 7.2 Settings would not save

"That setting could not be saved" on every theme or time-format change. The cause was
PostgREST error `21000`, `UPDATE requires a WHERE clause`: a Supabase `.update()` call was
issued without an `.eq()` narrowing it to the signed-in user's row, and PostgREST refuses
unfiltered updates rather than rewriting every row. The error was being swallowed and shown as
generic copy, which is why it took a browser Network tab to diagnose — the fix should keep the
underlying PostgREST error in the log.

Worth auditing the rest of the codebase for the same shape. An unfiltered `.update()` or
`.delete()` that RLS happens to constrain today is a latent version of this bug.

### 7.3 Charts were horizontal and showed minutes

A product complaint rather than a defect: bars should be vertical, responsive, and labelled in
hours rather than raw minutes. `chart-geometry.ts` is new and extracted so the arithmetic can
be tested without rendering.

### 7.4 Insights would not generate

Reports failed to generate from the live site. Note the migration dependency in section 6 item
1 before assuming the code is at fault: `/api/reports/generate` takes the `get_period_facts`
branch and works on today's schema, whereas `/api/cron/daily-report` needs `0014`, which is
still unapplied.

### 7.5 The mobile navigation bar is missing — and may still be

Reported by the operator on a phone. **No dedicated fix was needed on the branch:**
`src/components/layout/app-shell.tsx` already renders a fixed bottom tab bar with
`md:hidden` and safe-area padding, mounted from the authenticated layout. If it is still
absent on a real device after deploy, the defect is runtime (viewport, overlay, or install
mode), not a missing component. Verify on a phone before rebuilding navigation.

---

## 8. CI has now run; the WIP branch should clear both red jobs

Earlier revisions of this file, and section 3 of the deployment runbook, said the workflows had
never executed. That is no longer true — the first run was triggered by the push on 6 Aug 2026.
Two jobs were red on `main`. Fixes for both are on the WIP branch and have been verified
locally (`npm audit --audit-level=high` is clean; the public e2e expectations match the page).

**`Dependency audit`** was exiting 1 on high/critical advisories. The lockfile overrides for
`postcss` and `sharp` clear them.

**`End-to-end (public routes)`** failed 4 of 38 for two reasons, both corrected on the test
side after reading the product:

- Landing CTA: the page says "Start tracking" linking to `/sign-up`; the test now accepts that
  label.
- Password reset: the form always shows the same "If an account exists…" confirmation and does
  not enumerate accounts. The rewritten test mocks recover and asserts identical copy. Treat
  a future failure of this assertion as a possible security regression first.

Actions pins are `checkout@v7`, `setup-node@v7` and `upload-artifact@v7` — all real releases
on Node 24 as of mid-2026. An earlier review that claimed `@v7` did not exist for checkout
and upload-artifact was wrong.

---

## 9. Newly found gaps between the documents and the code

Two proposal documents were written on 6 Aug 2026 and are on `main`:
`docs/PRODUCT-IDEAS.md` (AI coaching, retention, Digital Wellbeing and install feasibility)
and `docs/NATIVE-APP-PLAN.md` (Android and iOS packaging).

Writing them surfaced the following, none of it acted on. These are claims from an audit, so
verify before building on any of them:

- **The dashboard is missing six of the nine regions document 20 specifies** — quick-add chips,
  today-at-a-glance with the productivity score, goals, streaks, the latest insight, and the
  week chart. The `dashboard_order` preference is stored, validated and exported, and then read
  by nothing. This is the largest gap in the product and it is unbuilt specification rather
  than new invention.
- **There is no onboarding at all.** `profiles.onboarded_at` exists and is never written.
  DF-UX-012, which the documents call the pedagogical core of onboarding, is not built.
- **The AI has never received an hour of day or a goal.** The shipped `PeriodFacts` has no
  `byHour`, no `goals`, no per-day score and no per-category breakdown of the previous period,
  all four of which document 29 specifies. Any insight about when in the day something happens
  is unbuildable until `get_period_facts` is extended.
- **The `neglected` insight module is dead code.** It looks for zero-minute groups, and
  `get_time_by_category` filters those out with `having sum > 0`.
- **No browser install prompt can ever appear.** Chrome requires a service worker with a fetch
  handler; `sw.js` deliberately has none, and nothing listens for `beforeinstallprompt`.
  Installing from the browser menu works — the banner will not. This matters because the
  operator asked how to install the app and reasonably expected a prompt.
- **On iPhone the app states something false.** In a Safari tab, Settings says "This browser
  cannot receive push notifications" and disables the button. Safari can, once the app is added
  to the Home Screen. We are telling iOS users a capability does not exist.
- **The manifest's "Add activity" shortcut does nothing.** It points at `/dashboard?add=1` and
  no code reads the `add` parameter.
- **The per-user monthly AI ceiling required by DF-AI-052 does not exist.** Only a
  20-per-day generation count does. This is a cost-exposure gap, not a feature gap.
- **`/.well-known/assetlinks.json` may be returning the sign-in page**, because the middleware
  matcher excludes `sw.js`, `manifest.webmanifest` and `icons/` but not `.well-known/`. Digital
  Asset Links needs an unredirected 200, so an Android Trusted Web Activity would fail
  verification and show a browser bar. Unconfirmed, but cheap to check and cheap to fix.

**One claim in `docs/NATIVE-APP-PLAN.md` was wrong and is now corrected in that file.** It
stated there were no icon PNGs in the repository. All three are committed and unignored —
`git ls-files public` lists `icon-192.png`, `icon-512.png` and `icon-maskable-512.png`. The
middleware matcher now also excludes `.well-known/`, so Digital Asset Links will not be
redirected to sign-in once `public/.well-known/assetlinks.json` exists. The file itself is
still absent until a signing fingerprint is known.

Two verdicts from `docs/PRODUCT-IDEAS.md` worth not relitigating: a **chat bot is not
recommended**, because the first two things users would ask it — log this for me, add up my
hours — are forbidden by ADR-011 and the AI rules, and it is slower than the existing capture
path. And **Digital Wellbeing integration is impossible from a web app** under any
circumstances, because reading another app's usage needs an installed native package holding a
special permission; it becomes possible only inside a native wrapper.

Finally, a trap named there so nobody walks into it: a global "days used DayFlow" streak is the
single most retention-effective thing available and it rewards opening the app rather than
recording honestly, creating a direct incentive to fabricate a Moment near midnight.

---

## 10. House style

- Comments explain why, never what. Never narrate the code, never describe the change
  being made.
- Match surrounding comment density and naming. Reuse `src/components/ui/` primitives.
- User-facing copy is plain, calm and complete. No marketing tone, no exclamation marks,
  no emoji anywhere in code or documentation.
- Requirement IDs such as `DF-QUE-001` link code to the specification; cite them when
  implementing a documented rule.
- The repository is `prettier --check` clean. Keep it that way; a formatting drift commit
  mixed into a feature change hides the feature.
