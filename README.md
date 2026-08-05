# DayFlow AI

A cloud-first, AI-assisted personal time intelligence platform. DayFlow AI is built
around **Moments** - discrete stretches of lived time - rather than tasks or timers,
and it is designed for people who want to understand where their hours actually go.

What makes it different from a stopwatch app:

- **Retroactive by design.** Save a Moment with only a category and a start time. It
  waits in a pending queue until you close it. Forgetting is expected, not punished.
- **A deliberately small queue.** Two pending Moments by default. A third is refused
  until you close one, which is what keeps the data honest.
- **Escalating nudges.** Hourly reminders while a Moment is open, a warning at three
  hours, and an automatic close at six - because no single focused activity really
  runs for six unbroken hours.
- **Distraction as a first-class concept.** A read-only Distracted Time group that you
  populate with your own categories, and can show or hide in any chart.
- **AI as an assistant, never a controller.** Reports, habit detection and
  recommendations. It never edits your data on its own.

---

## Status

**Pre-release, feature complete for v1.** The specification suite, the database and
every screen are built. What remains is verification against a real Supabase project
rather than construction.

Verified locally on Node 24.19.0 / npm 11.17.0:

| Check                  | Result                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `npm install`          | 441 packages, no errors                                      |
| `npm run format:check` | Clean                                                        |
| `npm run lint`         | Clean                                                        |
| `npm run test`         | 332 tests across 14 files, all passing (measured 2026-08-05) |
| `npm run build`        | 24 routes compiled; see the note on bundle size below        |
| `npm run typecheck`    | Clean                                                        |
| `npm run dev`          | Boots; landing and sign-in serve, auth guard works           |

**On bundle size.** Every route is held to a budget of **200 kB First Load JS**, set in
section 9 of
[docs/03-ux/22-accessibility-and-responsive-standards.md](docs/03-ux/22-accessibility-and-responsive-standards.md)
and checked by `npm run budget`. Per-route figures are deliberately not repeated here,
because they change with every dependency and would be stale the week after they were
written. The current numbers are wherever they were last measured: the route table printed by
`npm run build`, and the named exemptions with their ceilings in
`scripts/check-bundle-budget.mjs`.

**Built and working:**

| Area              | What is there                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Accounts          | Sign up, sign in, email confirmation, password reset and change, route guards, multi-device session refresh |
| Moments and queue | Create, edit, close, delete; the bounded pending queue with live timers and hard refusal past the limit     |
| Categories        | Full manager for categories and parent groups, with Distracted Time protected as a system group             |
| Dashboard         | Greeting, pending queue, day summary, timeline with gaps                                                    |
| Analytics         | Day/week/month/year/all ranges, donut, pie and bar composition, daily trend, breakdown, distraction toggle  |
| Calendar          | Month heat grid and a per-day detail view with its own composition                                          |
| Search            | Category, group, date range, status and duration filters                                                    |
| Goals             | At-least and at-most goals per day, week or month, with streaks and a configurable productivity score       |
| Notifications     | Service worker, web push, queue reminders, the 3-hour warning and the 6-hour automatic close                |
| Insights          | Deterministic insight modules, optional AI wording, scheduled daily and weekly reports                      |
| Settings          | Every configurable value in the product, saved as you change it                                             |

**Not built yet:** the check that blocks edits to already-merged migrations. It is described
in
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md)
section 3, where it is recorded as relying on review rather than on the workflow.

**CI had never run as of 4 August 2026.** `.github/workflows/ci.yml` is written - and it does
include the bundle-size gate and a dependency audit - but nothing had been pushed to GitHub by
that date, so GitHub Actions had never had an event to react to. The results in the table above
are local runs on one developer machine, not a green pipeline, and they are not a substitute for
one: every job in that workflow runs on a clean Linux checkout and has never been observed to
succeed there. Whether it has run since is answered by the repository's Actions tab and nowhere
else. The status note in section 3 of
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md)
has the detail.

**Not yet verified:** everything above compiles, passes its tests and renders, but the paths
that need a live Supabase project - real sign-up, realtime sync between two devices, an
actual push notification arriving, the cron jobs firing - have only been exercised against
placeholder credentials. Work through
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md)
section 4.3 once your project is linked.

---

## Tech stack

| Layer         | Choice                                                      |
| ------------- | ----------------------------------------------------------- |
| Framework     | Next.js 15 (App Router) + React 19 + TypeScript             |
| Styling       | Tailwind CSS v4                                             |
| Data          | Supabase PostgreSQL with row level security                 |
| Auth          | Supabase Auth                                               |
| Sync          | Supabase Realtime                                           |
| Client state  | TanStack Query + Zustand                                    |
| Validation    | Zod, shared by forms, API routes and tests                  |
| Charts        | Recharts                                                    |
| Notifications | Web Push (VAPID) via a service worker                       |
| Scheduling    | Supabase `pg_cron` for frequent jobs, Vercel Cron for daily |
| Hosting       | Vercel                                                      |

The reasoning behind each choice, including the alternatives that were rejected, is
recorded in [docs/00-governance/04-decision-log.md](docs/00-governance/04-decision-log.md).

---

## Prerequisites

| Requirement               | Notes                                                 |
| ------------------------- | ----------------------------------------------------- |
| **Node.js 20.9 or newer** | `node -v` to check. Node 18 will not work.            |
| **npm 10 or newer**       | Ships with Node 20.                                   |
| **A Supabase account**    | The free tier is sufficient.                          |
| Supabase CLI _(optional)_ | Only needed to push migrations from the command line. |

### If this folder is inside OneDrive, Dropbox or iCloud

Do this **before** running `npm install`. `node_modules` contains tens of thousands of
small files; a sync client will either saturate your upload or corrupt the dependency
tree mid-install, and the resulting errors look nothing like the real cause.

Right-click the `DayFlowAI` folder, choose **Always keep on this device**, then exclude
the build directories:

```powershell
# Windows PowerShell, run from inside DayFlowAI
New-Item -ItemType Directory -Force node_modules, .next | Out-Null
attrib +P -U node_modules /S /D
attrib +P -U .next /S /D
```

Moving the project outside the synced folder entirely is simpler and more reliable if
that is an option.

---

## Quick setup

A script handles everything that can be automated - dependency install, `.env.local`,
the cron secret and the web push key pair:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1   # Windows
```

```bash
chmod +x setup.sh && ./setup.sh                        # macOS / Linux
```

It stops and tells you the four Supabase values it cannot generate, because those come
from your project rather than from your machine. Then follow steps 2, 4 and 5 below.

> **On dependency files:** there is no `requirements.txt` here - that is a Python
> convention. `package.json` is the equivalent, and `npm install` reads it. The exact
> versions of all 441 resolved packages are pinned in `package-lock.json`, which is what
> makes an install on another machine byte-for-byte identical to this one. Commit that
> file; never edit it by hand.

---

## Setup

Roughly 15 minutes end to end. Steps 1 to 6 are required; step 7 can wait until you
want push notifications.

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Supabase project

1. Create a new project at [supabase.com](https://supabase.com). Choose a region close
   to you - every query in the app pays that round trip.
2. Save the database password somewhere safe. You need it for the CLI in step 4, and
   Supabase will not show it again.
3. Wait for provisioning to finish (about two minutes).

### 3. Configure environment variables

```bash
cp .env.example .env.local          # macOS / Linux
Copy-Item .env.example .env.local   # Windows PowerShell
```

In the Supabase dashboard open **Project Settings → API** and copy three values into
`.env.local`:

| Dashboard value                      | Variable                        |
| ------------------------------------ | ------------------------------- |
| Project URL                          | `NEXT_PUBLIC_SUPABASE_URL`      |
| Publishable key, or legacy `anon`    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key, or legacy `service_role` | `SUPABASE_SERVICE_ROLE_KEY`     |

New projects issue `sb_publishable_...` and `sb_secret_...` keys in place of the two
legacy JWTs. They are drop-in replacements: the same variables hold them and the client
library accepts either form, so nothing in this repository changes.

The publishable key is meant to be public - it identifies the project, not you, and
every table is protected by row level security. The secret key is the opposite: it
bypasses row level security entirely and must never reach a browser.

Then generate a `CRON_SECRET`:

```bash
openssl rand -base64 48    # macOS / Linux
```

```powershell
# Windows PowerShell
$b = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

Leave `AI_ENABLED=false` for now. The whole product works without it.

### 4. Apply the database schema

**Option A - Supabase CLI (recommended).**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Your project ref is the subdomain of your project URL:
`https://abcdefgh.supabase.co` → `abcdefgh`.

**Option B - SQL editor.** Open **SQL Editor** in the dashboard and run each file in
[supabase/migrations/](supabase/migrations/) **in filename order**, `0001` through
`0015`. Order matters: later migrations reference tables and types created by earlier
ones. Run each file completely before starting the next.

If you would rather not run fifteen files by hand, [supabase/all-migrations.sql](supabase/all-migrations.sql)
contains all of them concatenated in the correct order. Paste that single file into the
SQL editor instead. It is generated from the same migrations, so the result is identical.

What the migrations create:

| File   | Contents                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001` | Extensions and enumerated types                                                                                                                                            |
| `0002` | `profiles` and `settings`                                                                                                                                                  |
| `0003` | `parent_categories` and `categories`                                                                                                                                       |
| `0004` | `moments`                                                                                                                                                                  |
| `0005` | `goals`                                                                                                                                                                    |
| `0006` | AI reports, usage tracking, push subscriptions, feature flags                                                                                                              |
| `0007` | Row level security policies on every table                                                                                                                                 |
| `0008` | Triggers: queue limit, time validation, system category guards                                                                                                             |
| `0009` | New-user seeding: 6 category groups, 17 categories, settings                                                                                                               |
| `0010` | Analytics functions, including the midnight-split aggregation                                                                                                              |
| `0011` | `pg_cron` schedules for reminders and auto-close                                                                                                                           |
| `0012` | Realtime publication for multi-device sync                                                                                                                                 |
| `0013` | New-user seeding reads the timezone captured at sign-up                                                                                                                    |
| `0014` | `get_period_facts_for_user` and `local_date_for_timezone`, so the scheduled report job can compute a report on a user's behalf and tell whose local day has actually ended |
| `0015` | `delete_account()`, and the `0008` system-group guard narrowed so it no longer blocks the cascade from `auth.users`                                                        |

> **`0011` will warn and continue** if you have not yet stored the Vault secrets from
> step 7. That is expected. Reminders simply will not fire until you do.

> **If you applied `0001` to `0012` before `0013` existed,** run only
> `0013_seed_new_user_timezone.sql`. It replaces one function and touches no data, so
> existing accounts are unaffected. Already-applied migrations are never edited in
> place; see [docs/00-governance/05-versioning-and-release-policy.md](docs/00-governance/05-versioning-and-release-policy.md).

### 5. Configure authentication

In the dashboard, under **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: add `http://localhost:3000/auth/callback` and
  `http://localhost:3000/auth/callback**`

The second entry is not redundant. The password reset link returns to
`/auth/callback?next=/update-password`, and an allow-list entry without a wildcard does
not match a URL carrying a query string - Supabase then silently falls back to the Site
URL and the user lands on the landing page instead of the form.

Then, under **Authentication → Providers → Email**, turn **Confirm email** _off_ while
developing. Leaving it on means every test account you create needs a real inbox. Turn
it back on before you deploy: with it off, anybody can create an account against an
address they do not control.

### 6. Run it

```bash
npm run dev
```

Open <http://localhost:3000> and create an account.

**Verify the setup worked.** Sign up, then check in the dashboard:

- **Table Editor → parent_categories** shows 6 rows, one of them `Distracted Time`
- **Table Editor → categories** shows 17 rows
- **Table Editor → settings** shows 1 row for your user

If those tables are empty, the trigger from `0009` did not run - see Troubleshooting.

### 7. Enable push notifications (optional)

Generate a VAPID key pair:

```bash
npm run vapid:generate
```

Paste the two printed keys into `.env.local` and set `VAPID_SUBJECT` to your own
`mailto:` address.

Reminders are driven by `pg_cron` inside Supabase, which calls the app over HTTPS. It
reads the target URL and the shared secret from Vault so that no secret is committed to
this repository. In the **SQL Editor**, run:

```sql
select vault.create_secret('http://localhost:3000',      'dayflow_app_url');
select vault.create_secret('<your CRON_SECRET>',         'dayflow_cron_secret');
```

Use `vault.update_secret(...)` to change them later. When you deploy, the URL must
point at your deployed site - `pg_cron` runs in Supabase's network and cannot reach
your laptop, so scheduled reminders do not work against `localhost`.

Confirm the jobs are registered:

```sql
select jobname, schedule, active from cron.job;
```

---

## Authentication

Everything runs on Supabase Auth. The application never sees a password after the form
submits it; Supabase hashes it, and the session lives in httpOnly cookies that
[src/middleware.ts](src/middleware.ts) refreshes on every navigation and uses to guard the
authenticated routes.

| Flow               | Starts at         | Path through the app                                                                                            |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Sign up            | `/sign-up`        | Email and password only, per DF-UX-010. Straight to `/dashboard`, or to the notice below if confirmation is on. |
| Email confirmation | The emailed link  | `/auth/callback` trades the code for a session, then `/dashboard`.                                              |
| Sign in            | `/sign-in`        | `/dashboard`, or back to whichever guarded page sent you there.                                                 |
| Password reset     | `/reset-password` | Emailed link → `/auth/callback?next=/update-password` → `/update-password` → `/dashboard`.                      |

The browser timezone travels with the sign-up as user metadata and is stored by the
trigger from `0013`, so days are boundaried correctly from the first Moment rather than
in UTC until the app corrects itself.

**Password reset.** `/reset-password` asks only for an address and always answers the
same way, whether or not an account exists for it. That is deliberate: a form that says
"no account with that email" is a way to find out who has an account here, and given
what DayFlow records, that alone is a disclosure. See DF-UX-191 and
[docs/06-operations/34-security-and-threat-model.md](docs/06-operations/34-security-and-threat-model.md).

The emailed link creates a short-lived session and lands on `/update-password`, which
asks for the new password twice and requires at least 8 characters. `/update-password` is
not a public route - it does not need to be, because the callback has already established
a session by the time the guard sees it.

**When a link does not work.** An expired or already-used link sends the user to
`/sign-in?error=link_expired`, and an incomplete one to `/sign-in?error=missing_code`.
The sign-in form reads that parameter and explains what to do, because a bare sign-in
page after clicking an email link tells the user nothing.

**Confirm email.** Keep it **off** while developing, under **Authentication → Providers
→ Email**, or every test account you create needs a real inbox to reach. Turn it **on**
before you deploy: without it, anyone can register an address they do not own, and
password reset then becomes a way to take over that address later.

---

## Everyday commands

```bash
npm run dev          # development server
npm run build        # production build
npm run typecheck    # TypeScript, no emit - run this first on a fresh clone
npm run lint         # ESLint
npm run test         # Vitest unit tests (queue, validation, streaks, timezones)
npm run test:e2e     # Playwright end-to-end tests
npm run format       # Prettier
npm run db:types     # regenerate database types from the linked project
```

Run `npm run db:types` after **any** schema change. `src/lib/supabase/database.types.ts`
is currently hand-written to match the migrations, and a hand-maintained copy drifts
from the schema silently.

---

## Troubleshooting

| Symptom                                                | Cause and fix                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Invalid public environment configuration`             | `.env.local` is missing or incomplete. The message names the missing variables. Restart the dev server after editing it.                   |
| Signed up successfully but the app is empty            | The `0009` seed trigger did not run. Check **Database → Triggers** for `on_auth_user_created` on `auth.users`, then re-run `0009`.         |
| `permission denied for table ...`                      | Row level security is working and the session is missing. Sign out and back in.                                                            |
| Changes on one device do not appear on another         | `0012` was not applied, or Realtime is disabled under **Project Settings → API**.                                                          |
| `Queue limit reached` when nothing looks open          | A pending Moment exists on another device or from an earlier session. Check the dashboard queue; it is intentionally enforced server-side. |
| Reminders never arrive                                 | Vault secrets missing (step 7), `dayflow_app_url` pointing at `localhost`, or browser notification permission denied.                      |
| `npm install` fails with `EPERM` or corrupted packages | A file sync client is holding `node_modules`. See the OneDrive note above, delete `node_modules`, and reinstall.                           |
| `npm run build` fails with `EINVAL ... readlink .next` | Same cause, one directory over: a sync client touched `.next` mid-build. `Remove-Item -Recurse -Force .next` and build again.              |
| `npm run typecheck` fails on a fresh clone             | `typedRoutes` generates `.next/types` during the build, so run `npm run build` once first. This is why CI builds before it type-checks.    |
| `npm run typecheck` fails with `TS6053 file not found` | Stale incremental state after a production build. Delete `tsconfig.tsbuildinfo` and re-run.                                                |
| Types disagree with the database                       | Run `npm run db:types`.                                                                                                                    |

---

## Deployment

1. Push this repository to GitHub.
2. Import it at [vercel.com](https://vercel.com). Framework detection needs no help.
3. Add every variable from `.env.local` under **Settings → Environment Variables**, but
   set `NEXT_PUBLIC_APP_URL` to your deployed URL.
4. In Supabase, add `https://<your-app>.vercel.app/auth/callback` and
   `https://<your-app>.vercel.app/auth/callback**` to the redirect URLs, and turn
   **Confirm email** back on.
5. Update the Vault secret so scheduled jobs reach the deployed app:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'dayflow_app_url'),
  'https://<your-app>.vercel.app'
);
```

The full procedure, including rollback, is in
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md).

---

## Project layout

```
DayFlowAI/
├── docs/                  # the 37-document specification suite
├── e2e/                   # Playwright end-to-end tests
├── public/                # static assets, PWA icons, service worker
├── scripts/               # maintenance scripts
├── src/
│   ├── app/               # Next.js App Router: routes, layouts, API handlers
│   ├── components/        # shared UI kit and layout components
│   ├── features/          # feature modules: moments, categories, analytics, ...
│   ├── lib/               # Supabase clients, domain rules, utilities
│   └── types/             # shared TypeScript types
└── supabase/migrations/   # numbered SQL migrations
```

Business rules live in `src/lib/domain/` as pure functions so they can be unit tested
without a database, and they are mirrored by database triggers so a second device or a
stale browser tab cannot bypass them. That duplication is deliberate and is documented
in ADR-004.

---

## Documentation

The [docs/](docs/) directory is the source of truth for behaviour; this README only
covers getting it running. Start with [docs/README.md](docs/README.md), which maps all
37 documents. The most useful three when reading the code:

- [Product charter](docs/00-governance/02-product-charter.md) - why the product works this way
- [Decision log](docs/00-governance/04-decision-log.md) - every architectural choice and its rejected alternatives
- [Database schema and RLS](docs/04-architecture/25-database-schema-and-rls.md) - the data model in prose

---

## Licence

Private and unpublished. All rights reserved.
