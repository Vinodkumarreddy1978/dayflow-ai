# Going live - the ordered steps

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| Document ID  | - (root operator document, outside the docs/ suite) |
| Version      | 0.2.0                                               |
| Status       | Draft                                               |
| Owner        | Founder                                             |
| Last updated | 2026-08-05                                          |
| Supersedes   | -                                                   |

---

## 1. Purpose

This document answers one question: what do I do, in what order, to take DayFlow AI from
the state it is in today to a working deployment on Vercel backed by the live Supabase
project. It is a sequence of 48 numbered steps in strict dependency order, and it is meant
to be worked through from top to bottom without jumping.

It is not a replacement for
[GO-LIVE.md](GO-LIVE.md), which explains _why_ each of these things matters, or for
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md),
which describes the procedure in general terms and covers rollback. Those two documents
are the reasoning. This one is the sequence. Where the two disagree with each other or
with the code, section 4 of this document records which one is right.

Read section 2 and section 3 before you start step 1.

---

## 2. Before you begin

### 2.1 What this assumes about you and this machine

- You are competent with a terminal and a web dashboard, but you have not worked on this
  codebase before.
- The shell is **Windows PowerShell 5.1** (verified: `$PSVersionTable.PSVersion` reports
  `5.1.26100.8875`, edition `Desktop`). Every command in this document is PowerShell.
  Nothing here uses `&&`, `export`, or forward-slash-only paths, because none of those
  work in this shell. Note that in PowerShell 5.1 `curl` is an alias for
  `Invoke-WebRequest` and does **not** accept `curl` flags such as `-i` or `-X`, so the
  `curl` commands you will find in `GO-LIVE.md` section 3.1 and in the deployment runbook
  will not run here as written. This document gives PowerShell equivalents instead.
- Node is not on the default PATH. Every command that needs Node must be preceded, in the
  same PowerShell session, by the line in step 1.
- The repository lives at
  `C:\Users\preddy111\OneDrive - PwC\Documents\DayFlowAI`, inside OneDrive. That causes
  intermittent build failures with a fixed remedy - see step 2 and section 5.

### 2.2 The single most important thing in this document

One URL has to be identical in **four** places. A mismatch between any of them is the
most likely cause of a first deploy that appears to work and does not:

| Place                                                       | Set in  | Format                                     |
| ----------------------------------------------------------- | ------- | ------------------------------------------ |
| `NEXT_PUBLIC_APP_URL` in Vercel                             | Step 23 | `https://example.com` - no trailing slash  |
| **Site URL** in Supabase Auth                               | Step 28 | `https://example.com` - no trailing slash  |
| **Redirect URLs** in Supabase Auth                          | Step 28 | `https://example.com/auth/callback` + `**` |
| The Vault secret `dayflow_app_url` in the Supabase database | Step 30 | `https://example.com` - no trailing slash  |

You decide this value in step 3 and confirm it against reality in step 21. Do not proceed
past step 21 without a written-down, confirmed value.

### 2.3 Steps that are destructive or that briefly break something

Read these before you reach them. They are called out again in place.

| Step   | What it breaks                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **12** | **Irreversible.** Revoking the old Supabase secret key. Anything still using it stops working instantly, with no warning and no way to undo.     |
| **16** | Applying migration `0015`. It creates `public.delete_account()`, a function that permanently destroys an entire account. It also becomes         |
|        | immutable the moment it is applied - it can never be edited again, only superseded.                                                              |
| **29** | Turning **Confirm email** on. Every subsequent sign-up needs a real inbox, so your local development sign-ups stop working until you turn it off |
|        | again or use real addresses. It also makes step 8 (the email sender) load-bearing: with confirmation on and no working sender, nobody can        |
|        | create an account at all.                                                                                                                        |

Migrations are the general case of "cannot be undone". A database does not roll back here;
a mistake is corrected by writing a new migration
(`docs/05-engineering/33-cicd-and-deployment-runbook.md` section 6).

### 2.4 Reminders and push notifications are optional for a first deploy

You can complete a correct, secure, fully usable deployment without web push. The product
does not depend on it:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is allowed to be empty
  (`src/lib/env.ts` lines 61-68). Empty means Settings reports notifications as
  unconfigured for the device and nothing tries to send.
- What is _not_ allowed is a malformed value. A present-but-wrong key **fails the build**
  (same lines). So the choice is "a real key" or "nothing at all", never "a placeholder".

If you skip push, skip steps 5 and 40, and the reminder half of steps 30 to 32 becomes
optional rather than blocking. Everything else still applies, including `CRON_SECRET`,
because the daily report job on Vercel needs it regardless.

### 2.5 Time budget

| Phase                                       | Hands-on time | Waiting                          |
| ------------------------------------------- | ------------- | -------------------------------- |
| 1 - Prepare (steps 1-8)                     | 60-120 min    | DNS for the email sender, hours  |
| 2 - Rotate the exposed key (steps 9-12)     | 15 min        | -                                |
| 3 - Apply database changes (steps 13-19)    | 25 min        | -                                |
| 4 - Vercel project and first deploy (20-27) | 40 min        | Build, 2-5 min                   |
| 5 - Point Supabase at the live URL (28-32)  | 20 min        | -                                |
| 6 - Verify (steps 33-41)                    | 45 min        | One overnight, for the daily job |
| 7 - After launch (steps 42-48)              | 30 min        | Ongoing                          |

**Total hands-on: roughly 4 to 5 hours.** Realistically it spans two sittings, because
step 8 waits on DNS propagation and step 41 waits for the Vercel cron to fire overnight.

---

## 3. The steps

Each step states who does it, roughly how long it takes, what to do, exactly where, the
exact value or command, and how to confirm it worked. Do not move on until the
confirmation passes.

"Operator" means you, by hand. There is nothing in this list that another agent or a
script can do for you, because every remaining task is either a dashboard action or a
decision.

**On the line numbers.** Steps below cite other documents as `GO-LIVE.md lines 443-445` and
the like. Several of those documents were corrected on 5 Aug 2026 and the citations were not
all renumbered, so treat a line number as a pointer to a paragraph rather than an address.
The quoted wording beside each citation is what to search for.

---

## Phase 1 - Prepare (steps 1-8)

Nothing in this phase changes the live project. It is all local, reversible, and it is
where you gather the values the later phases need.

### Step 1. Open PowerShell and put Node on the PATH

**Who:** operator. **Time:** 2 minutes.

Node is installed but not on the system PATH
(`HANDOFF.md` lines 54-67). Run these two lines at the start of **every** new PowerShell
session you use for this work. They do not persist.

```powershell
$env:Path = "$env:LOCALAPPDATA\dayflow-toolchain\node-v24.19.0-win-x64;$env:Path"
cd "C:\Users\preddy111\OneDrive - PwC\Documents\DayFlowAI"
```

**Confirm it worked:**

```powershell
node -v
npm -v
```

You should see `v24.19.0` and a version starting `11.`. If `node` is "not recognized", the
path in the first line is wrong for this machine - check that
`%LOCALAPPDATA%\dayflow-toolchain\node-v24.19.0-win-x64\node.exe` exists.

Note that each shell start on this machine is slow, around 35 seconds before a command
begins (`HANDOFF.md` lines 74-76). That is normal.

### Step 2. Confirm the working copy builds before you involve Vercel

**Who:** operator. **Time:** 10 minutes, most of it waiting.

A build that fails on Vercel is much harder to diagnose than the same failure locally.
Prove it builds here first. Because the project is inside OneDrive, use this exact recipe

- OneDrive turns files inside `.next` into cloud placeholders while the build is still
  reading them, and the resulting errors look like code faults and are not
  (`HANDOFF.md` lines 80-107).

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
New-Item -ItemType Directory -Path .next -Force | Out-Null
attrib +P -U .next
Start-Sleep -Seconds 4
npx next build
```

Do **not** try to move `.next` outside OneDrive with a directory junction or a symlink. It
looks like the obvious fix and it breaks module resolution in a way that wastes a long time
(`HANDOFF.md` lines 103-107).

**Confirm it worked:** the build prints a route table ending in a summary, includes a line
beginning `Middleware`, and exits without an error. `HANDOFF.md` line 22 records 24 routes
and line 232 records a `Middleware` line at 92.7 kB, so a build with no `Middleware` line
means the middleware is not compiled and every authenticated route is unguarded at the edge.

Also run, in the same session:

```powershell
npx prettier --check .
```

It should report that all matched files use Prettier code style. This matters because CI
fails on formatting, and you want a clean starting point.

**What this does not prove.** This build validates the values in your local `.env.local`,
where `NEXT_PUBLIC_APP_URL` is currently `http://localhost:3000`. It says nothing about
whether the values you will type into Vercel in steps 23 and 24 are valid. Vercel runs its
own build with its own variables, and that build can fail where this one passed.

### Step 3. Decide the production origin and write it down

**Who:** operator. **Time:** 5 minutes.

This is the value from section 2.2. Decide now whether you are deploying to a
Vercel-assigned domain such as `https://dayflow-ai.vercel.app` or to a custom domain such
as `https://dayflow.example.com`.

Rules the code enforces, from the Zod schema in `src/lib/env.ts` lines 41-48 and the tests
in `src/lib/env.test.ts` lines 59-81:

- It must start with `http://` or `https://`. A bare hostname is rejected.
- It must have **no path**. `https://example.com/app` is rejected.
- It must have **no trailing slash**. `https://example.com/` is rejected.
- All three rejections are **build failures** naming `NEXT_PUBLIC_APP_URL`.

Write the value on paper or in a scratch file. You will type it, unchanged, in steps 23,
28 and 30.

**Confirm it worked:** your written value matches the regular expression the code uses,
`^https?://[^/]+$`. In practice: exactly two slashes, both in `https://`, and nothing after
the hostname.

**If you are unsure whether you want a custom domain**, choose the Vercel-assigned domain
now. Adding a custom domain later is straightforward but it means repeating steps 23, 28,
30 and redeploying, because `NEXT_PUBLIC_*` values are compiled into the bundle at build
time and are not read at runtime (`src/lib/public-env.ts` lines 4-10).

### Step 4. Decide whether reminders are in scope for this deploy

**Who:** operator. **Time:** 2 minutes.

See section 2.4. Write down "push: yes" or "push: no".

**Confirm it worked:** you have a written answer. If "no", you will skip steps 5 and 40 and
you may leave `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` out of
Vercel entirely - `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` both have defaults in
`src/lib/env.ts` lines 113-114, so their absence does not fail anything.

### Step 5. Check the VAPID key pair (skip if push is out of scope)

**Who:** operator. **Time:** 5 minutes.

A key pair already exists in your local `.env.local`. I confirmed the shape of the values
without reading them: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is 87 characters, which is exactly what
the schema requires, and `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are both non-empty.

Reuse that pair. Do not regenerate it unless you have reason to think it leaked, because
regenerating invalidates every existing push subscription and every device has to
re-subscribe (`GO-LIVE.md` lines 59-64).

If you do need a new pair:

```powershell
npm run vapid:generate
```

It prints `NEXT_PUBLIC_VAPID_PUBLIC_KEY=...` and `VAPID_PRIVATE_KEY=...` ready to paste
(`scripts/generate-vapid-keys.mjs` lines 13-25).

**Confirm it worked:** the public key is 87 characters, or 88 if it ends in `=`. Both are
accepted (`src/lib/env.ts` line 26). To check the length without printing the key:

```powershell
(Get-Content .env.local | Where-Object { $_ -like 'NEXT_PUBLIC_VAPID_PUBLIC_KEY=*' }) -replace '^[^=]+=', '' | ForEach-Object { $_.Length }
```

### Step 6. Read off the `CRON_SECRET` you will use

**Who:** operator. **Time:** 3 minutes.

You need this exact string twice: in Vercel (step 24) and in the Supabase Vault (step 31).
They are compared byte for byte, and a mismatch produces a 401 that only appears in Vercel's
function logs (`src/lib/push/send.ts` lines 123-132).

Your local `.env.local` already has a 64-character value. Copy it out to your clipboard or
password manager now:

```powershell
(Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' }) -replace '^CRON_SECRET=', '' | Set-Clipboard
```

If you would rather use a fresh secret for production - which
`docs/05-engineering/32-environment-and-configuration.md` DF-CFG-011 asks for, and which is
the better choice - generate one:

```powershell
$b = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

**Confirm it worked:** the value is at least 16 characters. Shorter than that is refused by
`src/lib/env.ts` line 112, at runtime rather than at build time - see section 5.

**A decision to make consciously:** if you use a different `CRON_SECRET` in production from
the one in `.env.local`, the Vault secret in step 31 must hold the **production** one, and
your local machine can then no longer successfully call the production cron endpoints by
hand. That is the correct trade-off; just know which value you are holding.

### Step 7. Get the code somewhere Vercel can deploy from

**Who:** operator. **Time:** 15 minutes with the Vercel CLI, 30-45 minutes via GitHub.

**This is a real blocker and the existing documentation does not mention it.** `git` is not
installed on this machine - `git` is not a recognised command - and there is no `.git`
directory in the repository, so this working copy is not a Git repository at all.
`README.md` line 400 and `docs/05-engineering/33-cicd-and-deployment-runbook.md` line 126
both begin with "push this repository to GitHub" / "import the repository", which you cannot
currently do.

You have two routes. Read both before choosing.

**Route A - Vercel CLI, no Git.** Deploys the directory as it stands.

```powershell
npx vercel login
npx vercel link
npx vercel --prod
```

This is faster and needs no Git. The cost is real: no CI on pull requests, no preview
deployments, no automatic deploy when the code changes, and no version history. Every future
deploy is you running `npx vercel --prod` by hand from this folder. The GitHub Actions
workflow in `.github/workflows/ci.yml` will never run.

**Route B - install Git, push to GitHub, connect the repository.** This is what the
repository's own documents assume and what makes CI, previews and automatic deploys work.
You will need to install Git for Windows first, then create an empty private repository on
GitHub and push to it.

Whichever route you take, confirm the secrets stay out of it. `.gitignore` already excludes
`.env`, `.env*.local` and `.env.production`, so `.env.local` will not be committed. Verify
that before pushing anything.

**Confirm it worked:**

- Route A: `npx vercel link` reports the project is linked, and a `.vercel` directory now
  exists in the repository (it is git-ignored).
- Route B: the GitHub repository page shows your files, **and** searching that repository for
  `SUPABASE_SERVICE_ROLE_KEY` finds it only in `.env.example` and in documentation, never with
  a real value beside it.

**Unverified:** I have not run either route. The Vercel CLI commands are the documented
interface and I am relying on general knowledge of it, not on anything in this repository.

### Step 8. Start the custom email sender now, because DNS takes time

**Who:** operator. **Time:** 20-60 minutes of work, then up to several hours of DNS waiting.

Do this early even though it is not needed until step 29, because verifying a sending domain
means adding DNS records and waiting for them.

Supabase's built-in SMTP server is not usable in production for two reasons
(`GO-LIVE.md` lines 90-103): the whole project shares a very low hourly send allowance, and
it only delivers to addresses belonging to members of your Supabase organisation. Mail to
anyone else silently never arrives. With **Confirm email** on and no custom sender, sign-up
appears to succeed, the user is told to check their inbox, and nothing ever comes. Nothing
errors anywhere.

**Where:** Supabase dashboard → your project → **Authentication** → the SMTP settings page.
`GO-LIVE.md` line 105 calls this **Authentication → Emails**.

Pick a provider with a small free tier - Resend, Postmark, Brevo, Mailgun and Amazon SES are
the options listed in `GO-LIVE.md` lines 109-115, with the caveat there that you should check
each one's current allowance yourself rather than trusting a figure in a document. Add the SPF
and DKIM records the provider gives you to your sending domain's DNS.

**Confirm it worked:** the provider's own dashboard reports the domain as verified, and
Supabase's SMTP settings page saves without an error. Then send yourself a password reset from
the live site in step 38 - that is the real end-to-end proof, and it is deliberately later in
this list.

While you are on that page, look at **Authentication → Rate Limits** afterwards. Supabase
raises the allowance once custom SMTP is enabled, but the default remains conservative
(`GO-LIVE.md` lines 121-124).

**Unverified:** the exact dashboard breadcrumb. `GO-LIVE.md` line 82 notes that Supabase has
renamed this section before and advises looking for the email provider settings rather than
trusting the path. Treat every Supabase path in this document the same way.

---

## Phase 2 - Rotate the exposed service role key (steps 9-12)

### Step 9. Read this before you touch the API keys page

**Who:** operator. **Time:** 3 minutes of reading.

`SUPABASE_SERVICE_ROLE_KEY` was pasted into a chat transcript
(`HANDOFF.md` line 135, `GO-LIVE.md` lines 40-43). A value that has been pasted anywhere must
be treated as public.

**Why this is urgent, plainly:** the service role key bypasses row level security completely.
Row level security is the only thing that stops one user reading another's rows, because
Supabase exposes PostgreSQL over HTTPS directly to the browser - any client can send any query
it likes, and "the application only asks for its own rows" is not a control
(`GO-LIVE.md` lines 240-244). Anyone holding this key can read, modify and delete every row
belonging to every user, from anywhere in the world, with no account and no session. It is the
single most dangerous value in the system. In this product those rows are a detailed record of
how somebody spends their days.

Do this before the first deploy, not after. Once the site is public the key is not merely
leaked, it is leaked and pointed at something interesting.

**The order matters.** Create the new key first, swap it in, then delete the old one. Deleting
first revokes it instantly and gives you a window where nothing works
(`GO-LIVE.md` lines 45-48).

### Step 10. Create a new secret key

**Who:** operator. **Time:** 3 minutes.

**Where:** Supabase dashboard → your project → **Project Settings** → **API Keys**, on the tab
holding the publishable and secret keys. `HANDOFF.md` line 135 and `README.md` line 172 call
this page **Project Settings → API**; `GO-LIVE.md` line 45 calls it **Project Settings → API
Keys**. Supabase has split these recently, so look for whichever of the two exists.

Create a **new secret key**. Do not delete anything yet. Your project uses the newer
`sb_secret_...` format rather than a legacy `service_role` JWT
(`HANDOFF.md` line 135); both work in the same variable and the client library accepts either
(`README.md` lines 181-183).

**Confirm it worked:** the keys page lists two secret keys, the old one and the new one, and
you have the new value copied somewhere you will not lose it. Supabase generally shows a secret
key in full only once.

### Step 11. Put the new key in `.env.local` and prove it works

**Who:** operator. **Time:** 5 minutes.

Open `C:\Users\preddy111\OneDrive - PwC\Documents\DayFlowAI\.env.local` in an editor and
replace the value of `SUPABASE_SERVICE_ROLE_KEY`. Change nothing else.

**Confirm it worked:** start the development server and call a cron endpoint locally. The
service role key is used only by the handlers under `src/app/api/cron/`, so that is the only
thing that exercises it.

```powershell
npm run dev
```

Then in a second PowerShell window - remembering step 1 - with `$secret` holding your
`CRON_SECRET`:

```powershell
$secret = Read-Host "CRON_SECRET"
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/cron/reminders" -Method POST -UseBasicParsing -Headers @{ Authorization = "Bearer $secret" }
[int]$r.StatusCode
$r.Content
```

You want `200` and a JSON body containing `"ok":true`. A 500 means the new key is wrong or
malformed. A 401 means `$secret` does not match `CRON_SECRET` in `.env.local`, which is a
different problem - the check is in `src/lib/push/send.ts` lines 123-132.

Stop the dev server afterwards with `Ctrl+C`.

### Step 12. Revoke the old key, then sweep every other copy - IRREVERSIBLE

**Who:** operator. **Time:** 5 minutes.

**This cannot be undone.** Deleting a secret key in Supabase revokes it immediately. Anything
still using it - another machine, a saved script, a scratch file - breaks at that instant with
an authorisation error from Supabase and no other explanation.

Only do this once step 11 passed.

**Where:** the same **Project Settings → API Keys** page. Delete the old secret key.

Then update it everywhere else it exists. `GO-LIVE.md` lines 50-57 lists three places; the
Vercel one does not exist yet at this point in the sequence, which is deliberate - you will
enter the **new** key there in step 24 and never the old one.

| Where                | What to do                                                             |
| -------------------- | ---------------------------------------------------------------------- |
| `.env.local`         | Done in step 11.                                                       |
| Vercel               | Step 24. Enter the new key, marked sensitive.                          |
| Password manager     | Replace the stored value now.                                          |
| Notes, scratch files | Search for it and delete. Include any `.txt` files in this folder.     |
| Chat transcripts     | You cannot unsend these. That is exactly why the key is being rotated. |

**Confirm it worked:** the keys page lists exactly one secret key. Re-run the step 11 check -
it should still return 200, because `.env.local` holds the new key. If it now returns 500, you
deleted the wrong key.

**While you are here**, consider whether `CRON_SECRET` has ever appeared in a transcript or a
screenshot. It is cheap to rotate provided you update Vercel and the Supabase Vault together -
steps 24 and 31 - which is why step 6 offered you a fresh one. Do **not** rotate the VAPID pair
casually; that one invalidates every push subscription (`GO-LIVE.md` lines 59-64).

---

## Phase 3 - Apply the pending database changes (steps 13-19)

Migrations `0001` through `0013` are already applied to the live project
(`HANDOFF.md` line 31 and lines 116-117). `0014` and `0015` are not. This phase applies them
and then verifies the whole schema.

### Step 13. Confirm for yourself what is already applied

**Who:** operator. **Time:** 5 minutes.

Do not take the documentation's word for it. `0014` and `0015` add functions and nothing else,
so their presence or absence is directly observable.

**Where:** Supabase dashboard → your project → **SQL Editor** → new query.

```sql
select
  p.proname as function_name,
  case p.proname
    when 'get_period_facts_for_user' then '0014'
    when 'local_date_for_timezone'   then '0014'
    when 'delete_account'            then '0015'
  end as migration
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_period_facts_for_user', 'local_date_for_timezone', 'delete_account')
order by p.proname;
```

**Confirm it worked - and interpret the result:**

- **Zero rows** - both migrations are pending, which matches `HANDOFF.md` line 31. Continue to
  step 14.
- **Three rows** - both are already applied. Skip steps 15 and 16 and go to step 17.
- **One or two rows** - something was partially applied. Stop and work out which. The two files
  are independent of each other, so you can apply whichever is missing, but do not paste a file
  whose objects already exist without reading it first.

Also confirm the current schema state while you are here:

```sql
select count(*) as parent_categories from public.parent_categories;
select count(*) as cron_jobs from cron.job;
```

### Step 14. Decide which SQL to run: the two individual files, not the bundle

**Who:** operator. **Time:** 3 minutes of reading. No action.

This repository contains both individual migration files and a generated bundle, and the
existing documents do not tell you unambiguously which to use in your situation. Here is the
answer.

**Run the two individual files, `0014_scheduled_report_support.sql` then
`0015_account_deletion.sql`, in that order. Do not run `supabase/all-migrations.sql`.**

Why:

- `supabase/all-migrations.sql` is a generated concatenation of all fifteen migrations
  (`scripts/build-all-migrations.mjs` lines 24-56). It exists for someone provisioning a
  **brand new, empty** project through the dashboard, so that they paste one file instead of
  fifteen. That is not your situation: thirteen of the fifteen are already applied.
- Its header does say it is safe to re-run (lines 14-18 of the bundle), and CI does prove
  idempotency by applying every migration twice against an empty database
  (`.github/workflows/ci.yml` lines 208-218). But CI **skips `0011_scheduled_jobs.sql`** in both
  passes (lines 199-204), so full-bundle idempotency has never actually been demonstrated for
  the one migration that touches `pg_cron`. Re-running thirteen unnecessary migrations against
  your live database to apply two is risk with no upside.
- The Supabase CLI route (`supabase db push`, which
  `docs/05-engineering/33-cicd-and-deployment-runbook.md` line 114 and `README.md` line 212 both
  recommend) would also work and would track which migrations are applied. It needs the CLI
  installed and the project linked, which this machine does not currently have. If you would
  rather set that up, it is the better long-term answer. For two files, the SQL editor is
  quicker.

**Confirm it worked:** you have exactly two files identified, in
`supabase\migrations\`, and you know you are not touching `all-migrations.sql`.

**One correction to carry forward.** `README.md` lines 218-225 tells you to run `0001` through
`0013` and calls it "thirteen files", and the table at lines 229-244 stops at `0014`. There are
fifteen migrations. That documentation is a version behind; the directory listing is correct.

### Step 15. Apply `0014_scheduled_report_support.sql`

**Who:** operator. **Time:** 5 minutes.

**What it does.** It adds two functions and no tables, so it creates no new row level security
surface:

- `public.get_period_facts_for_user(uuid, date, date)` - a `security definer` wrapper that lets
  a scheduled job compute a report on a user's behalf. Every analytics function is scoped by
  `auth.uid()`, which is null for the cron worker connecting as `service_role`, so without this
  every aggregate comes back empty (lines 7-19 of the file). Execute is revoked from `public`,
  `anon` and `authenticated`, and granted only to `service_role` (lines 59-63).
- `public.local_date_for_timezone(text, integer)` - works out a given user's local date so the
  daily job can tell whose "yesterday" has actually finished (lines 68-93).

**What actually needs it.** `/api/cron/daily-report` needs it: that route passes a user id into
`buildReport`, which then calls `get_period_facts_for_user`
(`src/app/api/cron/daily-report/route.ts` lines 69-75 and `src/lib/ai/report.ts` lines 55-64).
Without `0014`, the nightly report job fails for every user.

`HANDOFF.md` line 255 says `/api/reports/generate` depends on `0014`. **It does not.** That
route calls `buildReport` without a user id (`src/app/api/reports/generate/route.ts` lines
61-66), which takes the `get_period_facts` branch and runs as the caller's own session. On-demand
report generation from the Insights screen works with or without `0014`.

**Where:** Supabase dashboard → **SQL Editor** → new query. Open
`supabase\migrations\0014_scheduled_report_support.sql` in an editor, copy the whole file, paste
it, and run it.

**Confirm it worked:**

```sql
select
  p.proname,
  p.prosecdef                          as is_security_definer,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.proconfig                          as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_period_facts_for_user', 'local_date_for_timezone');
```

You want two rows. `get_period_facts_for_user` must show `is_security_definer = true` and
`settings` containing `search_path=`, with nothing after the equals sign. An empty search path is
required by DF-SEC-004, and `HANDOFF.md` lines 123-127 records that this file was corrected
specifically because it originally set `search_path = public`. If you see `search_path=public`,
you have pasted an old copy.

Then confirm the grant:

```sql
select
  grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name = 'get_period_facts_for_user';
```

`service_role` should be present. `anon` and `authenticated` must not be.

### Step 16. Apply `0015_account_deletion.sql` - creates a destructive capability

**Who:** operator. **Time:** 5 minutes.

**Read this before running it.** This migration creates `public.delete_account()`, which
destroys an entire account in one transaction: every Moment, category, category group, goal,
report, usage record, push subscription and setting belonging to the caller, plus the
`auth.users` row itself. Nothing survives it and nothing can be restored from inside the product
afterwards (lines 6-11 of the file). Creating the function does not delete anything - but from
this point on the capability exists, and it is reachable by any authenticated session, because
`authenticated` is granted execute on it (line 142). That grant is deliberate: DF-PRV-024
requires a user to be able to exercise this right without asking anyone.

It is contained rather than dangerous: the function takes no arguments and its subject is always
`auth.uid()`, so there is no parameter that could redirect it at a different account (lines
13-18).

**It also replaces an existing guard.** `0008` refuses every delete of a category group with
`is_system = true`, for every role, with no exemption. Every account has exactly one such row,
`Distracted Time`, and that refusal fires inside the cascade from `auth.users` - so before
`0015`, deleting an account was impossible by any route, including an operator deleting a user
from the Supabase dashboard (`HANDOFF.md` lines 279-287). `0015` replaces
`public.protect_system_parent_category()` so that it yields while an account deletion is in
progress, signalled by a transaction-local flag that nothing reachable over the REST interface
can set (lines 21-72). The trigger itself, `parent_categories_protect_system` from
`0008_triggers.sql` lines 236-238, already points at that function by name, so replacing the
function body is sufficient. You do not need to recreate the trigger.

**Both `0014` and `0015` become immutable the moment you apply them.** Until now they were
editable because they were pending (`HANDOFF.md` lines 122-127). After this step, a change to
either is made by writing a new numbered migration, never by editing the file - an edited
migration applies to a fresh database but not to one that already ran the original, and the live
schema and the repository then silently disagree.

**Where:** Supabase dashboard → **SQL Editor** → new query. Paste
`supabase\migrations\0015_account_deletion.sql` whole and run it.

**Confirm it worked:**

```sql
select p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('delete_account', 'protect_system_parent_category');
```

Two rows. `delete_account` must show `prosecdef = true` and `proconfig` containing
`search_path=` with nothing after it.

Then confirm the grants are narrow:

```sql
select grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public' and routine_name = 'delete_account';
```

`authenticated` should be present. `anon`, `public` and `service_role` must not be
(lines 140-142 of the file).

Finally confirm the guard still guards. Sign in to the application, go to the categories
manager, and try to delete the `Distracted Time` group. It must still be refused. A refusal is
the correct outcome; if it succeeds, the flag logic did not apply as intended and you should stop
and investigate before letting anyone else use the deployment.

**Do not test `delete_account()` against your own live account.** There is no undo, and on the
free tier there is no point-in-time recovery to fall back on
(`GO-LIVE.md` lines 334-343).

### Step 17. Verify row level security on every table

**Who:** operator. **Time:** 5 minutes.

Neither migration you just applied creates a table, so this should be unchanged - which is
exactly why it is worth checking now, while you know what the answer should be.

A table without row level security produces no symptom at all. The application behaves
identically. You find out when somebody exploits it, or never (`GO-LIVE.md` lines 247-249).

**Where:** SQL Editor. This is the query from `GO-LIVE.md` lines 253-268:

```sql
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  (
    select count(*)
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = c.relname
  )                        as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity, c.relname;
```

**Confirm it worked:** ten rows - `ai_reports`, `ai_usage`, `categories`, `feature_flags`,
`goals`, `moments`, `parent_categories`, `profiles`, `push_subscriptions`, `settings` - every one
with `rls_enabled = true` and `policy_count` of at least 1. The ordering deliberately puts any
unprotected table at the top.

Two failure shapes: `rls_enabled = false` means that table is readable by any authenticated user
and must be fixed with a new migration before you deploy. `rls_enabled = true` with
`policy_count = 0` is safe but denies everything, so the corresponding feature will appear empty
or error with a permission message.

### Step 18. Confirm the extensions and the two scheduled jobs

**Who:** operator. **Time:** 3 minutes.

**Where:** SQL Editor.

```sql
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
select jobname, schedule, active from cron.job order by jobname;
```

**Confirm it worked:** both extensions present, and exactly two jobs - `dayflow-auto-close` on
`*/15 * * * *` and `dayflow-reminders` on `*/10 * * * *`, both with `active = true`
(`supabase/migrations/0011_scheduled_jobs.sql` lines 83-93).

If the jobs are missing, `0011` never applied, or applied before `pg_cron` was enabled. Applying
`0011_scheduled_jobs.sql` on its own fixes that; it creates the extensions itself (lines 21-22)
and unschedules before rescheduling (lines 73-81), so it is safe to re-run.

They will currently be running and doing nothing, logging a warning that the Vault secrets are
absent (`HANDOFF.md` lines 144-146). That is expected at this point and is fixed in steps 30 and 31.

**Note on ordering, because the deployment runbook is wrong about it.**
`docs/05-engineering/33-cicd-and-deployment-runbook.md` lines 100-101 states that
"`0011_scheduled_jobs.sql` reads the app URL and the cron secret from Vault **at apply time**, so
the secrets have to exist before the migrations run - not after." That is not what the code does.
`0011` only defines `public.invoke_cron_endpoint`, which reads Vault inside its own body when it
is called (lines 38-42), and the file's own header says the values are read "at run time rather
than embedded here" (lines 10-11). The bundle header agrees: without the secrets, `0011` warns and
carries on. So the secrets do **not** have to exist before the migrations, which is why they come
later in this list, after you know the deployed URL.

### Step 19. Confirm the realtime publication

**Who:** operator. **Time:** 2 minutes.

Two-device sync does not work until the tables are explicitly published, and the failure is
silent: the channel subscribes, nothing errors, and changes simply never arrive
(`supabase/migrations/0012_realtime.sql` lines 5-8).

**Where:** SQL Editor.

```sql
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

select c.relname, c.relreplident
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('moments', 'categories', 'parent_categories', 'settings', 'goals')
order by c.relname;
```

**Confirm it worked:** the first query returns five rows - `categories`, `goals`, `moments`,
`parent_categories`, `settings`. The second returns `relreplident = f` (full) for all five.
`f` is load-bearing: under the default replica identity a DELETE payload carries only the primary
key, so it never matches the `user_id` filter the client subscribes with and deletions never
propagate (lines 31-41 of that migration).

---

## Phase 4 - Create the Vercel project and deploy (steps 20-27)

### Step 20. Create the Vercel project

**Who:** operator. **Time:** 10 minutes.

**Where:** [vercel.com](https://vercel.com) → **Add New** → **Project**.

- **Route B (GitHub):** import the repository you created in step 7. Framework detection needs
  no help - `vercel.json` already declares `"framework": "nextjs"`.
- **Route A (CLI):** the project was created by `npx vercel link` in step 7. Open it in the
  dashboard.

Choose the project name deliberately, because on a Vercel-assigned domain the name determines the
URL you wrote down in step 3.

**Confirm it worked:** the project appears in your Vercel dashboard.

**Do not deploy yet if you can avoid it.** The build needs the environment variables from steps
23 and 24 and will fail without `NEXT_PUBLIC_APP_URL`. If Vercel deploys automatically on import
and that first build fails naming `NEXT_PUBLIC_APP_URL`, that is expected - it is the schema in
`src/lib/env.ts` doing its job. Add the variables and redeploy in step 26.

### Step 21. Confirm the real production URL

**Who:** operator. **Time:** 3 minutes.

**Where:** Vercel dashboard → your project → **Settings** → **Domains**, or the **Domains**
panel on the project overview.

Read the production domain Vercel actually assigned. It is usually `<project-name>.vercel.app`,
but Vercel appends a suffix if the name is taken, so it may not be what you predicted in step 3.

**Confirm it worked:** you have written down the exact production origin, with `https://`, with no
trailing slash, and it matches what the dashboard shows. If it differs from your step 3 guess,
**use this one everywhere from now on** and correct your written note.

If you intend to attach a custom domain, do step 25 now instead of later, and use the custom
domain as your value. Changing this later means redoing steps 23, 28 and 30 and redeploying.

### Step 22. Check the build settings

**Who:** operator. **Time:** 5 minutes.

**Where:** Vercel dashboard → your project → **Settings** → **Build and Deployment** (Vercel has
also called this **General**; the exact heading changes).

| Setting          | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Framework preset | Next.js                                                            |
| Root directory   | Leave empty - the repository root is the project root              |
| Install command  | Default (`npm ci` when a lockfile is present)                      |
| Build command    | Default (`next build`, which is `npm run build` in `package.json`) |
| Output directory | Default                                                            |
| Node.js version  | 22 or newer. `package.json` requires `>=20.9.0`; CI uses 20        |

**Confirm it worked:** nothing is overridden except the Node version if you changed it. This
project needs no custom build command - `package.json` line 11 defines `build` as plain
`next build`.

**Do not add `.next` to any ignore or cache configuration by hand.** The OneDrive workaround from
step 2 is a local problem only; Vercel's build machines have no sync client and need none of it.

### Step 23. Add the non-secret environment variables

**Who:** operator. **Time:** 10 minutes.

**Where:** Vercel dashboard → your project → **Settings** → **Environment Variables**.

Scope every one of these to **Production**. Add them to Preview as well only if you are also
running preview deployments, and if you do, point Preview at a **different** Supabase project -
DF-CD-020 in `docs/05-engineering/33-cicd-and-deployment-runbook.md` line 240 says previews must
never use production credentials.

| Variable                        | Value                                                 | Notes                                                  |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`           | Your step 21 value, e.g. `https://dayflow.vercel.app` | **No trailing slash. No path.** Build fails otherwise. |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://lfwefuvoyyplxwnyjqtm.supabase.co`            | From `HANDOFF.md` line 113. Confirm on the API page.   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your publishable key, `sb_publishable_...`            | Public by design, safe in the browser                  |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | Your 87-character key, or omit entirely               | Omit if push is out of scope (step 4)                  |
| `VAPID_SUBJECT`                 | `mailto:` an address you control                      | Optional; defaults if absent                           |
| `AI_ENABLED`                    | `false`                                               | Leaving AI off is a perfectly good permanent choice    |
| `AI_PROVIDER`                   | `openai`                                              | Optional while `AI_ENABLED=false`                      |
| `AI_MODEL`                      | `gpt-4o-mini`                                         | Optional while `AI_ENABLED=false`                      |

The `NEXT_PUBLIC_APP_URL` value must be **byte-for-byte identical** to the Site URL you set in
step 28 and to the `dayflow_app_url` Vault secret you set in step 30. It is what
`src/features/auth/auth-operations.ts` lines 33 and 45 hand to Supabase as the redirect target,
so it ends up inside every confirmation and password reset email.

`NEXT_PUBLIC_SUPABASE_URL` has a second, non-obvious job: `next.config.ts` lines 15-24 and 56
derive the Content Security Policy's `connect-src` from it, naming your Supabase origin
specifically rather than using a wildcard. If you ever move to a different Supabase project you
must change this value **and redeploy**, or the browser will block every request to the new one.

**Confirm it worked:** the Environment Variables list shows each name with Production ticked. Read
`NEXT_PUBLIC_APP_URL` back character by character and check the end of the string for a stray
slash. That single character is the most common cause of a broken first deploy.

### Step 24. Add the secret environment variables

**Who:** operator. **Time:** 5 minutes.

Same page. Mark each of these **Sensitive**, per
`docs/05-engineering/32-environment-and-configuration.md` section 3.

| Variable                    | Value                             | Notes                                          |
| --------------------------- | --------------------------------- | ---------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | The **new** key from step 10      | Never the old one. Bypasses row level security |
| `CRON_SECRET`               | Your step 6 value                 | Must be at least 16 characters                 |
| `VAPID_PRIVATE_KEY`         | From step 5                       | Omit if push is out of scope                   |
| `OPENAI_API_KEY`            | Only if you set `AI_ENABLED=true` | Required then, refused as empty then           |
| `ANTHROPIC_API_KEY`         | Only if provider is `anthropic`   | Same                                           |

`CRON_SECRET` deserves its own note twice over. First, Vercel only attaches the
`Authorization: Bearer <CRON_SECRET>` header to its own scheduled invocations when that variable
exists on the project - without it the nightly report job calls `/api/cron/daily-report`, gets a
401 from `src/lib/push/send.ts` lines 123-132, and reports a failure every night
(`GO-LIVE.md` lines 184-188). Second, this exact string goes into the Vault as
`dayflow_cron_secret` in step 31.

**Confirm it worked:** each secret shows as sensitive - Vercel will no longer display the value
back to you, which is the point. Count them: with push enabled and AI off you should have added
three.

### Step 25. Attach a custom domain (optional)

**Who:** operator. **Time:** 10 minutes, plus DNS propagation.

Skip this if you are using the Vercel-assigned domain.

**Where:** Vercel dashboard → your project → **Settings** → **Domains** → add your domain, then
add the DNS records Vercel gives you at your registrar.

**Confirm it worked:** Vercel shows the domain as valid, and `https://your-domain` serves over
HTTPS with a valid certificate.

**If you do this after step 26, you must go back to step 23 and change `NEXT_PUBLIC_APP_URL`, then
redeploy, then redo steps 28 and 30.** `NEXT_PUBLIC_*` values are compiled into the bundle at
build time; changing one in the dashboard does nothing until a new build runs
(`GO-LIVE.md` lines 172-174).

A custom domain also changes the security header picture. `next.config.ts` lines 116-123 sets
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every non-development
build. Vercel may already send HSTS for its own domains; this configuration makes it true of a
custom domain too. Check it in step 27.

### Step 26. Trigger the first production deploy

**Who:** operator. **Time:** 5 minutes, mostly the build.

- **Route B (GitHub):** Vercel dashboard → **Deployments** → redeploy the latest, or push a commit.
- **Route A (CLI):** `npx vercel --prod` from the repository root, after step 1.

**Confirm it worked:** the deployment reaches **Ready**. Open the build log and check that it
compiled without an error and printed a route table.

**If the build fails, read the error before doing anything else.** The environment schema is
designed to fail loudly and name the variable:

- `Invalid public environment configuration: NEXT_PUBLIC_APP_URL must be an absolute http or https origin with no path and no trailing slash`
  - go back to step 23. You almost certainly have a trailing slash.
- `... NEXT_PUBLIC_APP_URL required` - the variable is missing, or it is not scoped to Production.
- `... NEXT_PUBLIC_VAPID_PUBLIC_KEY must be an 87-character base64 VAPID public key, or empty` -
  either paste a real key or remove the variable completely. A placeholder is refused
  (`src/lib/env.ts` lines 61-68).
- `Invalid public environment configuration: NEXT_PUBLIC_SOMETHING_ELSE ...` - the schema is a
  strict object (`src/lib/env.ts` line 34), so a `NEXT_PUBLIC_` name that has been added to
  `src/lib/public-env.ts` but not to the schema fails the build by design.

Note what these messages never contain: the offending value. DF-CFG-005 forbids echoing
configuration into build logs (`src/lib/env.ts` lines 74-83), so you will have to read the value
in the dashboard yourself.

**Server-side variables behave differently and this catches people out.**
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` and the AI keys are validated lazily, on first use, not
at module load (`src/lib/env.ts` lines 127-146). A deployment missing `CRON_SECRET` therefore
**builds and deploys cleanly** and then fails at runtime the first time a cron route is called. Do
not read a green build as proof that the server variables are right. Step 32 is what proves that.

### Step 27. Confirm the deployment serves, and that the security headers arrive

**Who:** operator. **Time:** 5 minutes.

Open `https://your-domain` in a browser. You should get the landing page.

Then check the headers, because a policy that a proxy strips is no policy at all. PowerShell 5.1
equivalent of the `curl` command in `GO-LIVE.md` line 622:

```powershell
$r = Invoke-WebRequest -Uri "https://your-domain" -UseBasicParsing
$r.Headers["Content-Security-Policy"]
$r.Headers["Strict-Transport-Security"]
$r.Headers["X-Frame-Options"]
```

**Confirm it worked:**

- `Content-Security-Policy` is present and its `connect-src` names your Supabase origin
  (`https://lfwefuvoyyplxwnyjqtm.supabase.co` and the `wss:` form of it), not a wildcard. That is
  `next.config.ts` lines 15-24 working.
- `Strict-Transport-Security` is present with `max-age=63072000`. It is deliberately absent in
  development builds, so seeing it here confirms this is a production build
  (`next.config.ts` lines 116-123).
- `X-Frame-Options` is `DENY`.

Then check the two files that must not be routed through auth:

```powershell
[int](Invoke-WebRequest -Uri "https://your-domain/sw.js" -UseBasicParsing).StatusCode
[int](Invoke-WebRequest -Uri "https://your-domain/manifest.webmanifest" -UseBasicParsing).StatusCode
```

Both should be `200`. The middleware matcher excludes them on purpose - the service worker must be
able to register before sign-in (`src/middleware.ts` lines 15-21).

**The application is now live but incomplete.** Do not sign up yet, and do not give the URL to
anyone. Supabase Auth is still pointed at `localhost` and confirmation email is still off. That is
steps 28 and 29.

**Unverified:** I have not executed the `Invoke-WebRequest` commands above against a live site.
The syntax is standard for PowerShell 5.1 and `-UseBasicParsing` is included because 5.1 otherwise
uses the Internet Explorer engine, but treat the exact output shape as untested.

---

## Phase 5 - Point Supabase at the live URL (steps 28-32)

### Step 28. Set the Site URL and the redirect allow-list - both in this one step

**Who:** operator. **Time:** 5 minutes.

**Where:** Supabase dashboard → your project → **Authentication** → **URL Configuration**.

Use your confirmed step 21 value throughout.

| Field             | Value                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| **Site URL**      | `https://your-domain` - no trailing slash, identical to `NEXT_PUBLIC_APP_URL` |
| **Redirect URLs** | Add `https://your-domain/auth/callback`                                       |
| **Redirect URLs** | Add `https://your-domain/auth/callback**` - note the two asterisks            |

**The second redirect entry is not redundant, and omitting it fails silently.** Password reset
returns the user to `/auth/callback?next=/update-password`
(`src/features/auth/auth-operations.ts` line 45). An allow-list entry without a wildcard is matched
against the whole URL including its query string, so `/auth/callback` does not match
`/auth/callback?next=...`. Supabase then discards the requested redirect, sends the user to the
Site URL instead, and they land on the landing page with no error. The reset link looks like it did
nothing (`GO-LIVE.md` lines 136-144).

The Site URL matters for the same reason from the other direction: Supabase falls back to it
whenever a requested redirect is not on the allow-list, so a stale Site URL turns a failed redirect
into a confusing success.

**Leave your `http://localhost:3000` entries in place.** The allow-list is additive and removing
them only breaks local development (`GO-LIVE.md` lines 146-147).

**Why `/auth/callback` and nothing else.** `src/lib/supabase/middleware.ts` line 26 treats `/`,
`/sign-in`, `/sign-up`, `/reset-password`, `/auth` and `/api` as public. Everything else redirects a
signed-out visitor to `/sign-in?next=<path>`. `/update-password` is deliberately **not** public: the
callback exchanges the recovery code for a real session first, so by the time the guard sees
`/update-password` the user is authenticated (lines 6-15). That is why the allow-list needs the
callback route and not the form route.

**Confirm it worked:** the URL Configuration page shows the Site URL and at least four redirect
entries - two for localhost, two for your domain. Compare the domain string against
`NEXT_PUBLIC_APP_URL` in Vercel side by side. They must be identical, including the scheme and the
absence of a trailing slash. Real confirmation comes in steps 33 and 38.

### Step 29. Turn Confirm email on - this changes sign-up behaviour immediately

**Who:** operator. **Time:** 3 minutes.

Confirm email is currently **off**, which is correct for development and wrong for anything
reachable from the internet (`HANDOFF.md` line 139).

With confirmation off, Supabase creates an account for whatever address is typed into the sign-up
form without ever proving the person controls it. The consequence is not junk accounts. Someone
registers an address they do not own; later the real owner signs up, finds it taken, uses password
reset - or the attacker does, the moment they gain access to that mailbox. Either way an account
holding a detailed record of somebody's days ends up under the wrong control, and nothing in the
application can detect it, because from its point of view every step was legitimate
(`GO-LIVE.md` lines 71-80).

**Where:** Supabase dashboard → **Authentication** → the email provider's settings. `README.md`
line 267 and `HANDOFF.md` line 139 call this **Authentication → Providers → Email**. Switch
**Confirm email** on.

**This immediately makes step 8 load-bearing.** With confirmation required and no working sender, an
account cannot be created at all. If step 8 is not finished, stop here and finish it.

**It also breaks your local development sign-ups**, because they now need a real inbox too. That is
the correct trade-off; just know that it happened, and that `GO-LIVE.md` line 583 lists this as one
of the settings most likely to be turned off during debugging and never turned back on.

**Confirm it worked:** the toggle reads on after a page reload. Real confirmation is step 33.

### Step 30. Create the Vault secret `dayflow_app_url`

**Who:** operator. **Time:** 5 minutes.

`pg_cron` runs inside Supabase's network. It cannot reach `localhost` and it cannot reach your
laptop at all. Until `dayflow_app_url` names the deployed site, the scheduled jobs run and do
nothing, and reminders and automatic closes never happen - without a single error anywhere in the
application (`GO-LIVE.md` lines 196-200).

**The name matters exactly.** `public.invoke_cron_endpoint` looks up `dayflow_app_url` and
`dayflow_cron_secret` by name (`supabase/migrations/0011_scheduled_jobs.sql` lines 38-42). A secret
stored under any other name reads as absent, and the function returns null after logging a warning
(lines 44-47). Those two names are also what section 4.1 of the deployment runbook now specifies
(`docs/05-engineering/33-cicd-and-deployment-runbook.md` line 107).

**Ignore `GO-LIVE.md` lines 235-237**, which tells you that the deployment runbook calls these
secrets `app_url` and `cron_secret`. That was true of an earlier version of the runbook and is no
longer: it was corrected in version 0.1.1 on 2026-08-04 (runbook line 256), and `GO-LIVE.md`'s own
section 5 records the correction as closed (line 599) while section 1.6 still describes it as
outstanding. The names to use are `dayflow_app_url` and `dayflow_cron_secret`.

**Where:** Supabase dashboard → **SQL Editor**. First look at what exists:

```sql
select name, created_at, updated_at
from vault.secrets
where name in ('dayflow_app_url', 'dayflow_cron_secret');
```

`HANDOFF.md` line 140 says neither exists yet, so expect zero rows. If you get zero rows, create it:

```sql
select vault.create_secret('https://your-domain', 'dayflow_app_url');
```

If the row already exists, update it instead:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'dayflow_app_url'),
  'https://your-domain'
);
```

**No trailing slash. This is the one place in the system where nothing validates it for you.**
The function builds its target as `v_url || p_path`
(`supabase/migrations/0011_scheduled_jobs.sql` line 50), so `https://example.com/` becomes
`https://example.com//api/cron/reminders`, which is not a route. `NEXT_PUBLIC_APP_URL` is validated
against exactly this mistake; the Vault secret is not, because it lives in the database
(`HANDOFF.md` lines 349-352).

**Confirm it worked:** read the value back and check it character by character.

```sql
select name, decrypted_secret
from vault.decrypted_secrets
where name = 'dayflow_app_url';
```

The value must be identical to `NEXT_PUBLIC_APP_URL` in Vercel and to the Site URL from step 28.
Check the last character is not `/`.

### Step 31. Create the Vault secret `dayflow_cron_secret`

**Who:** operator. **Time:** 3 minutes.

**Where:** the same SQL Editor session.

```sql
select vault.create_secret('<your CRON_SECRET from step 6>', 'dayflow_cron_secret');
```

Or, if it already exists:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'dayflow_cron_secret'),
  '<your CRON_SECRET from step 6>'
);
```

**This must match `CRON_SECRET` in Vercel exactly.** They are compared byte for byte in
`src/lib/push/send.ts` lines 123-132, and a mismatch produces a 401 that shows up only in Vercel's
function logs. This is the classic aftermath of rotating the secret in one place and not the other,
and it is the first thing to check whenever reminders stop
(`GO-LIVE.md` lines 227-233, and DF-CD-012 in the deployment runbook line 230).

**Confirm it worked:** compare the lengths without printing the secret next to anything else.

```sql
select name, length(decrypted_secret) as len
from vault.decrypted_secrets
where name = 'dayflow_cron_secret';
```

Then compare that number to the length of the value you put into Vercel. If you used the value from
`.env.local` unchanged, it should be 64. Equal lengths do not prove equality, so the real proof is
step 32.

### Step 32. Prove `invoke_cron_endpoint` actually reaches the deployed application

**Who:** operator. **Time:** 5 minutes.

This is the step that catches every URL and secret mismatch at once, and it is the step most
runbooks leave out.

**First, prove the function dispatches.** In the SQL Editor:

```sql
select public.invoke_cron_endpoint('/api/cron/reminders');
```

**Confirm:** you get a number back. A number means a request was queued. `null` means one or both
Vault secrets are missing or misnamed - go back to steps 30 and 31
(`supabase/migrations/0011_scheduled_jobs.sql` lines 44-47).

**Second, look at what the HTTP call returned**, because a queued request is not a successful one.
If `pg_net` keeps its response history on your project:

```sql
select id, status_code, created
from net._http_response
order by created desc
limit 10;
```

**Confirm:** the most recent row has `status_code = 200`. A `401` means `dayflow_cron_secret` does
not match `CRON_SECRET` in Vercel. A `404` is the double-slash problem from step 30 - look at the
URL you stored. A timeout or a connection error means `dayflow_app_url` names the wrong host.

**Unverified:** the table name. `GO-LIVE.md` lines 422-424 says this is "a table under the `net`
schema, `net._http_response` on current versions" and hedges deliberately. If that query errors,
list what exists with
`select table_name from information_schema.tables where table_schema = 'net';` rather than assuming
the feature is absent.

**Third, call the endpoint yourself.** This proves the secret from the outside. PowerShell 5.1
equivalents of the `curl` commands in `GO-LIVE.md` lines 429-436:

```powershell
# Expect 401 - no secret
$response = try {
  Invoke-WebRequest -Uri "https://your-domain/api/cron/reminders" -Method POST -UseBasicParsing -ErrorAction Stop
} catch {
  $_.Exception.Response
}
[int]$response.StatusCode
```

```powershell
# Expect 200 and a JSON body containing "ok":true
$secret = Read-Host "CRON_SECRET"
$ok = Invoke-WebRequest -Uri "https://your-domain/api/cron/reminders" -Method POST -UseBasicParsing -Headers @{ Authorization = "Bearer $secret" }
[int]$ok.StatusCode
$ok.Content
```

Both endpoints accept `POST` and `GET` - `pg_net` sends `POST`, and `GET` is allowed so the job can
be checked from a browser (`src/app/api/cron/reminders/route.ts` lines 213-216).

**Confirm it worked:** `401` without the header, `200` with it. DF-CD-013 in the deployment runbook
line 231 requires exactly this.

**Do not read `cron.job_run_details` as evidence of success.** It reports whether Postgres executed
the scheduled SQL, not whether your application received anything. `invoke_cron_endpoint` returns
null and logs a warning when the secrets are absent, and `net.http_post` only queues a request - so
a job whose HTTP call 401s, times out, or goes to a stale URL still records `succeeded`. The
dangerous failure looks perfectly healthy (`GO-LIVE.md` lines 407-413).

---

## Phase 6 - Verify against the live deployment (steps 33-41)

This is `GO-LIVE.md` section 3.3 and section 4.3 of the deployment runbook, in one order, with the
confirmations spelled out. Use a real email address you control.

### Step 33. Sign up

**Who:** operator. **Time:** 5 minutes.

Go to `https://your-domain`, then **Sign up**. Use a real address.

**Confirm it worked:** the confirmation email arrives within a minute or two, from your step 8
sender, and the link in it points at `https://your-domain/auth/callback...` - **not** at
`localhost`, and not at a different domain. Click it; you should land signed in on `/dashboard`.

**If no email arrives**, the problem is step 8, not the application. Check the sending provider's
own delivery log first, then your spam folder. An unauthenticated sender puts confirmation mail in
spam, which produces the same user experience as not sending it
(`GO-LIVE.md` lines 117-119).

**If the link points at `localhost`**, `NEXT_PUBLIC_APP_URL` in Vercel is wrong or the deployment
that built with the correct value has not shipped. Fix step 23 and redeploy - the value is compiled
into the bundle, so changing it in the dashboard alone does nothing.

**If clicking the link lands you on the landing page instead of the dashboard**, the redirect
allow-list from step 28 is wrong.

### Step 34. Check that seeding worked

**Who:** operator. **Time:** 3 minutes.

**Where:** Supabase dashboard → **Table Editor**.

**Confirm it worked:**

- `parent_categories` has 6 rows for your user, one of them `Distracted Time`
- `categories` has 17 rows
- `settings` has exactly one row for your user, and its `timezone` column holds your actual
  timezone rather than `UTC`

Empty tables mean the trigger from `0009` did not run - check **Database** → **Triggers** for
`on_auth_user_created` on `auth.users` (`README.md` line 385). A `timezone` of `UTC` when you are
not in UTC means `0013` did not apply; the browser timezone travels with the sign-up as user
metadata and is stored by that trigger (`README.md` lines 334-336).

### Step 35. Record an activity and close it

**Who:** operator. **Time:** 5 minutes.

On `/dashboard`, record an activity, then close it.

**Confirm it worked:** it appears on the day timeline immediately; after closing, the duration is
correct and the pending queue empties.

### Step 36. Confirm the queue refusal

**Who:** operator. **Time:** 3 minutes.

Start two activities and leave both open, then try to start a third.

**Confirm it worked:** the third is **refused**, not warned about. The refusal is deliberate and is
enforced twice - by a pure function in `src/lib/domain/` for the inline error and by a database
trigger in `0008_triggers.sql` for the actual guarantee, because a second device or a direct REST
call bypasses the client entirely (`HANDOFF.md` lines 196-201). A dismissible warning here would
mean the client-side rule is the only one running.

Close them both before moving on.

### Step 37. Confirm two-device sync

**Who:** operator. **Time:** 5 minutes. Needs a second device.

Sign in on your phone alongside your laptop, both on `https://your-domain`.

**Confirm it worked:** a change made on one appears on the other **without a refresh**. Test a
deletion as well as a creation, because deletions are the case that depends on
`replica identity full` from step 19.

If sync fails, `0012` did not apply or Realtime is switched off for the project. `README.md` line
387 says to check Realtime under **Project Settings → API**; I could not verify that path, and in
current Supabase dashboards replication settings generally live under **Database**. Check both.

### Step 38. Confirm password reset lands on the right form

**Who:** operator. **Time:** 5 minutes.

Sign out. Go to `/reset-password` and request a reset for your address.

**Confirm it worked:** the emailed link lands you on `/update-password`, showing the form that asks
for a new password twice. Set a new password and confirm you end up signed in on `/dashboard`.

**Landing on the landing page instead means the `**` wildcard redirect entry from step 28 is
missing.** That is the single failure this whole check exists to catch.

Then click the same link a second time.

**Confirm:** you are sent to `/sign-in` with an explanatory message about an expired or already-used
link, not to a broken form (`docs/05-engineering/33-cicd-and-deployment-runbook.md` line 150).

This flow is specifically called out in `HANDOFF.md` lines 242-247 as the one that has never been
tested end to end, because it needs a real session, and as the one most likely to loop. If it does
loop, that is a genuine finding rather than a configuration error - record it.

### Step 39. Confirm the route guards

**Who:** operator. **Time:** 3 minutes.

Signed out, in a private browsing window, visit each of these on your live domain.

| URL                | Expected                                     |
| ------------------ | -------------------------------------------- |
| `/`                | 200, the landing page                        |
| `/sign-in`         | 200                                          |
| `/dashboard`       | Redirect to `/sign-in?next=/dashboard`       |
| `/analytics`       | Redirect to `/sign-in?next=/analytics`       |
| `/settings`        | Redirect to `/sign-in?next=/settings`        |
| `/update-password` | Redirect to `/sign-in?next=/update-password` |

**Confirm it worked:** the `next=` query parameter is present on each redirect. That parameter is
what proves the middleware ran rather than the layout guard, because the layout guard omits it
(`HANDOFF.md` lines 237-239). If you are redirected but without `next=`, the middleware is not
running - which would mean `src/middleware.ts` was not compiled, and step 2's `Middleware` line
should have caught it.

Then sign in and visit `/sign-in` again.

**Confirm:** you are bounced to `/dashboard`
(`src/lib/supabase/middleware.ts` lines 79-85, DF-UX-192). `HANDOFF.md` line 243 lists this as
unverified until now, so this is a first.

### Step 40. Confirm a reminder fires on a real device (skip if push is out of scope)

**Who:** operator. **Time:** 10 minutes. Needs a phone.

Push cannot be verified meaningfully in a desktop browser tab, because the things that break are
device-specific (`GO-LIVE.md` lines 443-445).

1. Open `https://your-domain` on your phone and sign in.
2. **On iOS, add it to the Home Screen first and open it from there.** iOS delivers web push only
   to home-screen web apps, so testing in Safari itself fails in a way that looks like a bug in
   DayFlow.
3. Enable reminders in Settings and grant notification permission when asked.
4. Confirm the subscription reached the database:
   `select count(*) from push_subscriptions;` should have increased.
5. Start an activity and leave it pending.
6. Invoke the endpoint with the secret, as in step 32.

**Confirm it worked:** the notification arrives, and tapping **Close it now** opens the app on
`/dashboard?close=<id>` with the close dialog already open.

**If the subscription count stays at zero**, the usual cause is a missing
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel. An absent key is permitted, so nothing fails the build;
the Settings screen reports notifications as unconfigured for the device instead, which is the
symptom to look for (`GO-LIVE.md` lines 460-463).

### Step 41. Check the logs, then check again tomorrow morning

**Who:** operator. **Time:** 5 minutes now, 5 minutes tomorrow.

**Where:** Vercel dashboard → your project → **Logs** (also reachable per deployment under
**Functions**).

**Confirm now:** no 500s from anything you did in steps 33 to 40. A repeated 500 on one route is the
shape to look for.

**Confirm tomorrow:** `/api/cron/daily-report` was invoked by Vercel Cron and returned 200.
`vercel.json` schedules it at `0 1 * * *`, which is **UTC**, and the Hobby plan fires within the
scheduled hour rather than on the minute - so expect it somewhere between 01:00 and 01:59 UTC
(`GO-LIVE.md` lines 367-372). This is the only check in this document you cannot complete on the
first day.

Also confirm the `pg_cron` jobs have been running:

```sql
select jobid, jobname, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 20;
```

Remember from step 32 that `succeeded` here means Postgres ran the SQL, not that your application
received anything. The end-to-end proof is step 32 plus a reminder actually arriving in step 40.

---

## Phase 7 - After launch (steps 42-48)

### Step 42. Verify the data export and account deletion - IRREVERSIBLE second half

**Who:** operator. **Time:** 30 minutes. **Needs:** a throwaway account, and step 16 completed.

Both features now exist: `src/features/settings/data-export-card.tsx` and
`delete-account-card.tsx` on the Settings screen, `/api/export` behind the first and
`public.delete_account()` from `0015` behind the second.

**Read this before you start.** Part B destroys an account and there is no undo, no point-in-time
recovery on the free tier, and no way for anyone to reverse it afterwards. **Do part B on a
throwaway account created for this step, never on the account you signed up with in step 33.**
Sign up a second account now, on a real address you control, and record two or three activities in
it so its export has something in it.

If step 16 was skipped, part B will refuse cleanly rather than half-delete: `delete-account.ts`
maps PostgREST's `PGRST202` to "Account deletion is not available on this deployment yet, because
the database change it needs has not been applied. Nothing has been deleted." Seeing that message
means go back to step 16, not that the interface is broken.

#### Part A - the export (safe, do this on any account)

1. Sign in and open **Settings**. Scroll to the **Your data** card and press **Export my data**.
   The dialog loads on demand - `data-export-card.tsx` uses `lazy`, so a brief blank moment on a
   slow connection is expected, not a fault.
2. Press **Download everything as JSON**.
3. Choose one table with rows in it - **Activities** - from the dropdown and press **Download CSV**.
   Repeat for **Settings**, which is the one table that always has exactly one row.

**Confirm it worked:**

- Two toasts reading "Your data has been downloaded", and files named
  `dayflow-export-<yyyy-mm-dd>.json` and `dayflow-export-moments-<yyyy-mm-dd>.csv` in your
  downloads folder (`account-export.ts` `exportFilename`).
- Open the JSON. At the top level it has `dayflow_export_version: 1`, an `exported_at` timestamp,
  an `account` object carrying your id, email and sign-in dates, and a `tables` object with
  **exactly ten** keys: `profiles`, `settings`, `parent_categories`, `categories`, `moments`,
  `goals`, `ai_reports`, `ai_usage`, `push_subscriptions`, `feature_flags`. A missing table is a
  DF-PRV-020 failure, not a cosmetic one.
- It parses. The writer emits the closing braces last on purpose, so a read that died partway
  leaves invalid JSON rather than a plausible-looking truncated account.
- The activities you recorded are in `tables.moments`, with their `note` text intact.
- `parent_categories` contains `Distracted Time`. The row level security policy for
  `feature_flags` also exposes global rows with a null `user_id`; the export filters those out, so
  every row in `tables.feature_flags` should carry **your** user id and no other.
- The CSV opens in Excel with a header row matching the column list, and a note containing a comma
  or a line break stays in one cell.

Then confirm the response is not cacheable and not reachable unauthenticated. In PowerShell:

```powershell
# Expect 401 and {"error":"Not signed in."} - no session in this request
$anon = try {
  Invoke-WebRequest -Uri "https://your-domain/api/export?format=json" -UseBasicParsing -ErrorAction Stop
} catch {
  $_.Exception.Response
}
[int]$anon.StatusCode
```

**Confirm:** `401`. The handler holds no elevated privilege and reads through the caller's own
session, so an unauthenticated request has nothing to read. If this returns 200, stop and do not
proceed - that is a data breach, not a bug.

In the browser, with DevTools open on the Network tab, press **Download everything as JSON** once
more and look at the `export` request's response headers.

**Confirm:** `Cache-Control: private, no-store, max-age=0` and a `Content-Disposition: attachment`
naming the file. This is the most sensitive response the application produces and must not be held
by a CDN or a browser cache.

#### Part B - account deletion (IRREVERSIBLE - throwaway account only)

4. Sign in **as the throwaway account**. Check the address in Settings before going further.
5. Open **Settings** and press **Delete my account** on the red-bordered **Delete account** card.

**Confirm before touching anything:**

- The dialog lists what is destroyed - activities and their notes, categories and groups including
  the built-in ones, goals and streaks, AI reports and usage, settings and profile, notifications
  on every device, and the sign-in record (DF-SET-024, DF-PRV-022).
- It states that copies in the provider's own backups are purged within seven days.
- There is a **Take a copy first** panel with a **Download my data** button. This is DF-PRV-023 and
  DF-SET-025: the export must be offered before deletion proceeds. Press it and confirm a JSON file
  downloads from inside this dialog.
- **Delete permanently** is disabled until the confirmation phrase is typed.

6. Type `Delete My Account` - deliberately in the wrong case. It should still enable the button;
   `isDeletionConfirmed` forgives case and surrounding whitespace but not the words themselves.
   Then type something else, such as `delete account`, and confirm the button goes back to
   disabled.
7. Type `delete my account` and press **Delete permanently**.

**Confirm it worked:**

- The browser lands on `/` as a signed-out visitor, by a full document load rather than a
  client-side navigation (`use-delete-account.ts`). You should see the landing page, not the
  dashboard, and not a "Something went wrong" screen.
- Pressing Back does not return you to a working Settings screen.
- Signing in with that account's credentials now fails.
- In the SQL Editor, with the throwaway account's id from the export you took in the step above:

```sql
select
  (select count(*) from auth.users        where id      = '<throwaway-user-id>') as users,
  (select count(*) from public.profiles   where id      = '<throwaway-user-id>') as profiles,
  (select count(*) from public.moments    where user_id = '<throwaway-user-id>') as moments,
  (select count(*) from public.parent_categories where user_id = '<throwaway-user-id>') as parents;
```

**Confirm:** every column is `0`. `parents` is the interesting one - the
`protect_system_parent_category` trigger from `0008` refuses to delete a system row for every
role, and `0015` is what narrows that guard so the cascade from `auth.users` can complete. A
non-zero `parents` with a zero `users` would mean the guard is still biting, which is the failure
`0015` exists to prevent.

8. Finally, sign up again **with the same email address**. It should succeed. DF-PRV-021 requires
   the sign-in record to go, not just the application rows, and this is the only check that proves
   it did.

**If deletion reports "DayFlow could not reach the server, so whether the deletion completed is
unknown"**, that is the `UNCONFIRMED` branch: the call may have committed. Do not retry blindly -
run the SQL above first and find out.

**Unverified:** I have not run any of this against a live deployment. The behaviour described is
read from `src/features/settings/` and `src/app/api/export/route.ts`, and the unit suites
`account-export.test.ts` and `delete-account.test.ts` cover the serialisers, the paging, the owner
filter, the confirmation phrase and the error mapping - but nothing in this repository has ever
executed the export against a real Supabase project or called `delete_account()` against a real
row. Treat the exact wording of toasts and the exact download filename as likely rather than
certain; treat the confirmations that matter - ten tables, 401 unauthenticated, zero rows after
deletion, email reusable - as the point of the step.

### Step 43. Take your first export, and set a weekly reminder

**Who:** operator. **Time:** 15 minutes, then 5 minutes a week.

On the free tier this is not housekeeping. Point-in-time recovery is a paid feature and automated
daily backups are not part of the free plan either, so a dump you took yourself is the whole of your
recovery capability (`GO-LIVE.md` lines 334-340).

This needs the Supabase CLI, which is not currently installed on this machine. The command, once it
is (`GO-LIVE.md` line 503, adapted from bash to PowerShell):

```powershell
supabase db dump --linked -f "dayflow-$(Get-Date -Format 'yyyy-MM-dd').sql"
```

Store it outside Supabase and outside Vercel, encrypted. The point of an off-platform copy is the
case where the platform itself is the problem - an outage, a billing failure, an account suspension.
A backup that lives inside the thing that failed is not a backup.

**Confirm it worked:** the file exists, is more than a few kilobytes, and opening it shows SQL
including `create table public.moments`. An untested backup is a hypothesis; once a quarter, restore
one into a scratch project and sign in against it.

**Put a weekly recurring reminder in your calendar now.** `GO-LIVE.md` line 340 asks you to treat
the weekly cadence as a real commitment rather than an aspiration, and this is the only step in this
document that protects against a mistake you make yourself.

### Step 44. Watch four things

**Who:** operator. **Time:** 5 minutes a week.

From `GO-LIVE.md` lines 557-562:

| Signal         | Where                                               | What bad looks like                                |
| -------------- | --------------------------------------------------- | -------------------------------------------------- |
| Error rate     | Vercel function logs                                | Repeated 500s on one route, usually after a deploy |
| Scheduled jobs | `cron.job_run_details`, plus reminders arriving     | Nothing failing, and no reminders either           |
| Database size  | Supabase dashboard, and the organisation Usage page | Steady growth toward the 500 MB free-plan ceiling  |
| AI spend       | `ai_usage`, and your provider's dashboard           | Cost climbing faster than your use of the feature  |

Log retention on the free plan is short - around a day - so if something looks wrong, gather the
evidence the same day (`GO-LIVE.md` lines 361-365).

### Step 45. Know that a quiet free project gets paused

**Who:** operator. **Time:** 2 minutes of reading.

Supabase pauses a free project after roughly a week of insufficient activity, warns you by email
first, and requires you to press **Resume project** in the dashboard. A paused project is completely
unavailable - the application returns errors, not a maintenance page. Data is retained and the
project stays restorable for up to a year (`GO-LIVE.md` lines 319-325).

In practice a working deployment generates continuous traffic, because the reminder sweep calls the
application every ten minutes. But what Supabase counts as qualifying activity is not documented
precisely enough to rely on. So: if you stop using DayFlow for a couple of weeks, or the cron jobs
stop, look at the project before concluding the application is broken.

### Step 46. Turn on Dependabot alerts

**Who:** operator. **Time:** 5 minutes. Route B only.

**Where:** GitHub → the repository → **Settings** → **Advanced Security** or **Code security**.

`.github/workflows/ci.yml` lines 89-102 runs `npm audit --audit-level=high` as its own job, which
covers high and critical advisories on pull requests and deliberately gates nothing. Dependabot is
the only one of these that finds you rather than waiting to be asked
(`GO-LIVE.md` lines 544-545). Low and moderate advisories remain a monthly manual `npm audit`.

**Confirm it worked:** the repository's security tab lists Dependabot alerts as enabled.

### Step 47. Write down what you actually did

**Who:** operator. **Time:** 15 minutes.

Several statements in the repository documents stopped being true when you finished step 32. Correct
them while you remember, because the governing principle in
`docs/00-governance/01-documentation-index-and-standards.md` section 2 is that documentation is the
source of truth and a disagreement is a defect.

At minimum:

- `HANDOFF.md` line 31 and line 137 - `0014` and `0015` are now applied.
- `HANDOFF.md` line 140 - the Vault secrets now exist.
- `HANDOFF.md` line 139 - **Confirm email** is now on.
- `HANDOFF.md` line 135 - the service role key has been rotated.
- Anything that describes the deployment as pending.

Version and change-history formatting for documents under `docs/` is defined in section 8 of the
standards document: `MAJOR.MINOR.PATCH`, with a MAJOR bump requiring an entry in the decision log
because it contradicts approved content. `HANDOFF.md` and `GO-LIVE.md` at the repository root do not
carry metadata tables today, so match whatever they already do rather than imposing a new format on
them.

### Step 48. Re-run the row level security check after every schema change

**Who:** operator. **Time:** 2 minutes, each time.

A new table does not get row level security by default, and a migration that adds one is the exact
moment this gets forgotten (`GO-LIVE.md` lines 280-281). Re-run the query from step 17 after every
schema change, and while you are there confirm **Confirm email** is still on.

That is the end of the sequence.

---

## 4. Where the existing documentation is wrong, contradictory, or insufficient

Found while checking this list against the code. Each one would have misled you if you had followed
it literally.

Rows marked **Applied 5 Aug 2026** have since been corrected in the source document; they are kept
because the register is also the record of what was checked, and because a row that vanishes when
it is fixed makes it impossible to tell "verified and corrected" from "never looked at". The line
numbers in the Source column point at the file **as it was when the error was found**, so they will
not line up with a corrected file.

| Source                                                          | What it says                                                                            | What is actually true                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/05-engineering/33-cicd-and-deployment-runbook.md` 100-101 | `0011` reads Vault "at apply time", so the secrets must exist before the migrations run | `0011` only defines `invoke_cron_endpoint`, which reads Vault when **called** (lines 38-42). The file's own header says "read at run time" (lines 10-11). The stated ordering is unnecessary                                                                                                  |
| `GO-LIVE.md` 235-237                                            | Section 4.1 of the runbook calls the secrets `app_url` and `cron_secret`                | **Applied 5 Aug 2026.** The runbook was corrected to `dayflow_app_url` / `dayflow_cron_secret` in its version 0.1.1, and `GO-LIVE.md` section 5 already recorded that as closed - so section 1.6 was contradicting its own section 5. It now states the names plainly                         |
| `HANDOFF.md` 255                                                | `/api/reports/generate` depends on `0014`                                               | **Applied 5 Aug 2026.** It does not. That route omits the user id, taking the `get_period_facts` branch from `0010` (`src/lib/ai/report.ts` 56-63). `/api/cron/daily-report` passes a user id and is what needs `get_period_facts_for_user` from `0014`                                       |
| `README.md` 218-225, 229-244                                    | Run `0001` through `0013`, "thirteen files"; the table stops at `0014`                  | There are fifteen migrations, `0001` through `0015`                                                                                                                                                                                                                                           |
| `README.md` 400-407, runbook 126                                | "Push this repository to GitHub", "import the repository"                               | **Now partly stale.** A portable MinGit was installed and the tree committed as `f54864f` on 4 Aug 2026, so `.git` exists and has history. There is still no configured remote and nothing has been pushed. Step 7 remains the procedure                                                      |
| `scripts/build-all-migrations.mjs` 11                           | `npm run db:bundle:check` "is what CI runs"                                             | **Corrected in the script, still true of CI.** The header comment now says nothing runs it, and `HANDOFF.md` no longer repeats the claim. `.github/workflows/ci.yml` still has no such step, so the check happens only when somebody remembers                                                |
| `GO-LIVE.md` 429-436, 502-503, 621-622                          | `curl -i -X POST ...`, `date +%Y-%m-%d`, `grep`                                         | **Applied 5 Aug 2026.** Bash. In PowerShell 5.1 `curl` is an alias for `Invoke-WebRequest` and rejects those flags. Each snippet in `GO-LIVE.md` now carries a note pointing at the PowerShell equivalent here, in steps 32, 43 and 27 respectively                                           |
| `GO-LIVE.md` 139, 159-160                                       | The redirect target comes from `auth-form.tsx` and `reset-password-form.tsx`            | **Applied 5 Aug 2026.** Both redirect strings are in `src/features/auth/auth-operations.ts` lines 33 and 45. Those form files exist but the calls were moved out of them so the Supabase client could load lazily                                                                             |
| `docs/05-engineering/33-cicd-and-deployment-runbook.md` 121-122 | Configure redirect URLs "including `/auth/callback`"                                    | Insufficient on its own. Without the `/auth/callback**` wildcard entry, password reset silently lands on the landing page. `GO-LIVE.md` 133-144 explains it; the runbook does not mention it                                                                                                  |
| `docs/05-engineering/33-cicd-and-deployment-runbook.md` 116-117 | `supabase db push` "includes `0012` and `0014`"                                         | Does not mention `0015`, which is also pending and which is what makes account deletion possible at all                                                                                                                                                                                       |
| `docs/05-engineering/33-cicd-and-deployment-runbook.md` 43-53   | The CI job table                                                                        | Omits the `audit` job that `.github/workflows/ci.yml` lines 76-102 actually defines                                                                                                                                                                                                           |
| `docs/05-engineering/32-environment-and-configuration.md` 141   | Supabase Vault holds "`CRON_SECRET`"                                                    | It holds two secrets. `dayflow_app_url` is missing from that table, and it is the one that silently stops reminders                                                                                                                                                                           |
| `README.md` 36-37                                               | 107 tests across 6 files; largest route 221 kB                                          | **Resolved 5 Aug 2026 by running the suite.** Both figures were stale, and so were the 142/8 and 317/14 counts that replaced them in turn. The measured state is **318 tests across 14 files**, and the largest route is `/dashboard` at 204 kB. `README.md` and `HANDOFF.md` now both say so |
| `README.md` 324                                                 | Links to `middleware.ts` at the repository root                                         | The file is `src/middleware.ts`. The root copy was removed because Next.js only loads middleware beside `app/` (`HANDOFF.md` 216-228). The link is dead                                                                                                                                       |
| `README.md` 387                                                 | Realtime is disabled under **Project Settings → API**                                   | Unverified and probably stale. Publication membership is what `0012` manages; the dashboard control for it is generally under **Database**. Step 37 says to check both                                                                                                                        |

Two further gaps that are not errors but that a human following the existing documents would fall
into:

- **Nothing says that server-side variables are not validated at build time.** `GO-LIVE.md` explains
  the `NEXT_PUBLIC_*` build failures well, but `src/lib/env.ts` lines 127-146 checks
  `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` and the AI keys lazily, on first use. A deployment
  missing `CRON_SECRET` builds and deploys cleanly and then 500s the first time a cron route runs.
  Covered here in step 26.
- **`GO-LIVE.md` section 1 is ordered by importance, not by dependency.** Item 1.6 asks for the
  deployed URL, which item 1.5 has not produced yet; item 1.4 needs the same value. Followed in
  order it forces you to guess the URL, which is the failure mode section 2.2 of this document
  exists to prevent. That ordering is the reason this document exists.

---

## 5. Troubleshooting, keyed to the error you will actually see

| What you see                                                                                                         | What it means and what to do                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EINVAL: invalid argument, readlink '.next\diagnostics'`                                                             | OneDrive turned a file in `.next` into a cloud placeholder mid-build. Run the full recipe in step 2. Not a code fault                                                                                                   |
| `ENOENT: no such file or directory, open '.next\server\pages-manifest.json'`                                         | Same cause, different surface. Same fix                                                                                                                                                                                 |
| `PageNotFoundError: Cannot find module for page: /_document`                                                         | Same cause again. Same fix (`HANDOFF.md` 86-90)                                                                                                                                                                         |
| `Cannot find module 'react/jsx-runtime'` after you moved `.next`                                                     | You made `.next` a junction or symlink. Undo it. Node resolves the real path of a file before resolving its imports, so everything under the junction looks for `node_modules` beside the target (`HANDOFF.md` 103-107) |
| `Invalid public environment configuration: NEXT_PUBLIC_APP_URL must be an absolute http or https origin ...`         | Trailing slash, a path, or a missing scheme. Step 23. The message never prints the offending value, by design                                                                                                           |
| `Invalid public environment configuration: NEXT_PUBLIC_APP_URL required - the origin this deployment is served from` | The variable is missing, or it is not scoped to the Production environment in Vercel                                                                                                                                    |
| `... NEXT_PUBLIC_VAPID_PUBLIC_KEY must be an 87-character base64 VAPID public key, or empty`                         | You have a placeholder or a truncated key. Either paste a real one or remove the variable entirely. Empty is allowed; wrong is not                                                                                      |
| `Invalid server environment configuration: CRON_SECRET`                                                              | Runtime, not build. The variable is missing in Vercel or shorter than 16 characters. It appears in the function log the first time a cron route is called                                                               |
| `AI_ENABLED is true but no API key is set for provider "openai"`                                                     | Set `OPENAI_API_KEY`, or set `AI_ENABLED=false`. `src/lib/env.ts` 148-158                                                                                                                                               |
| Confirmation or reset email points at `http://localhost:3000`                                                        | `NEXT_PUBLIC_APP_URL` is wrong, or right but not yet built. Fix step 23 **and redeploy** - it is compiled into the bundle                                                                                               |
| Reset link lands on the landing page with no error                                                                   | The `https://your-domain/auth/callback**` entry is missing from the redirect allow-list. Step 28. An entry without the wildcard does not match a URL carrying a query string                                            |
| Signed in but immediately bounced back to `/sign-in`                                                                 | Site URL and `NEXT_PUBLIC_APP_URL` disagree, so the cookie domain does not match. Compare them character by character                                                                                                   |
| `invoke_cron_endpoint` returns `null`                                                                                | One or both Vault secrets are missing or misnamed. They must be exactly `dayflow_app_url` and `dayflow_cron_secret`. Steps 30 and 31                                                                                    |
| Cron calls return 404, and the URL contains `//api/cron/...`                                                         | Trailing slash on the `dayflow_app_url` Vault secret. The function builds `v_url \|\| p_path`, so `https://x/` becomes `https://x//api/...`. Nothing validates this one for you. Step 30                                |
| Cron calls return 401                                                                                                | `dayflow_cron_secret` does not equal `CRON_SECRET` in Vercel. Update both together, never one                                                                                                                           |
| `cron.job_run_details` says `succeeded` but no reminders arrive                                                      | Expected, and the reason step 32 exists. That table records whether Postgres ran the SQL, not whether your app received anything. Check `net._http_response` and call the endpoint yourself                             |
| Notifications never arrive, subscription count stays at zero                                                         | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` missing in Vercel, or on iOS the site was not added to the Home Screen. Settings will report push as unconfigured for the device                                                         |
| Changes on one device do not appear on another                                                                       | `0012` did not apply, or Realtime is off for the project. Re-check step 19; deletions specifically need `replica identity full`                                                                                         |
| `permission denied for table ...`                                                                                    | Row level security is working and the session is missing. Sign out and in again                                                                                                                                         |
| Everything returns errors, all at once, after a quiet week                                                           | The free Supabase project was paused. Press **Resume project**. Step 45                                                                                                                                                 |
| Browser console: requests to Supabase blocked by Content Security Policy                                             | You changed `NEXT_PUBLIC_SUPABASE_URL` without redeploying. `connect-src` is derived from it at build time (`next.config.ts` 15-24)                                                                                     |
| `npm install` fails with `EPERM`                                                                                     | A sync client is holding `node_modules`. `HANDOFF.md` 77-78 warns against reinstalling casually inside OneDrive                                                                                                         |
| `npx tsc --noEmit` fails on a fresh clone                                                                            | `typedRoutes` generates `.next/types` during the build, so run a build first. This is why CI builds before it type-checks                                                                                               |

---

## 6. What I could not verify

Stated plainly, because everything else in this document was read out of the repository and this
part was not.

**Dashboard navigation paths are general knowledge, not verified fact.** Both Supabase and Vercel
change their interfaces, and `GO-LIVE.md` line 82 explicitly warns that Supabase has renamed the
email provider section before. Every path in this document is a best current understanding: look for
the described setting rather than trusting the breadcrumb. The specific ones I could not confirm
against anything in the repository:

- Supabase **Project Settings → API** versus **Project Settings → API Keys**. The repository's own
  documents disagree with each other (`README.md` 172, `HANDOFF.md` 135, `GO-LIVE.md` 45).
- Supabase **Authentication → Providers → Email** for the Confirm email toggle.
- Supabase **Authentication → Emails** for SMTP, and **Authentication → Rate Limits**.
- Where Realtime is enabled or disabled at the project level. `README.md` 387 says **Project
  Settings → API**; I doubt that is still current.
- Every Vercel path: **Settings → Environment Variables**, **Settings → Domains**, **Settings →
  Build and Deployment**, **Deployments**, **Logs**.

**Things about the live project I could not observe.** I have read-only access to the repository and
none to the Supabase project or to Vercel, so:

- Whether `0014` and `0015` are genuinely still pending. `HANDOFF.md` line 31 says so and step 13
  makes you check rather than assume.
- Whether the Vault secrets are genuinely absent (`HANDOFF.md` line 140).
- Whether row level security is actually enabled on all ten tables right now.
- Whether the VAPID key pair in `.env.local` is a genuine matched pair. I confirmed only that the
  public key is 87 characters, which satisfies the schema; a pair that is the right shape but
  mismatched would pass the build and fail at send time.
- Whether the free Supabase plan figures in `GO-LIVE.md` section 2 are still current. That section
  says to confirm them against Supabase's pricing page, and I did not.
- ~~Which of `README.md` and `HANDOFF.md` is right about the test count and the largest route
  size.~~ Settled on 5 Aug 2026 by running both: 318 tests across 14 files, and `/dashboard` at
  204 kB is the largest route. Both documents now agree with the measurement.

**Commands I wrote but did not execute.** The `Invoke-WebRequest` snippets in steps 11, 27 and 32,
and the `Set-Clipboard` and length-check snippets in steps 5 and 6. They are ordinary PowerShell 5.1
and I chose the forms that work on 5.1 specifically - `-UseBasicParsing` because 5.1 otherwise uses
the Internet Explorer engine, and `try`/`catch` around the 401 case because 5.1 has no
`-SkipHttpErrorCheck`. But treat the exact output shape as untested. The same applies to the
`Invoke-WebRequest` snippet added to step 42 on 5 Aug 2026.

`next build`, `prettier --check` over the whole repository, and the Vitest suite were all run on
5 Aug 2026 and all pass; that gap is closed.

**The `net._http_response` table name in step 32.** `GO-LIVE.md` lines 422-424 hedges on this
deliberately, saying it is `net._http_response` "on current versions". If the query errors, list the
`net` schema rather than concluding the response history is unavailable.

**Step 42 is written from the code, not from a run.** The data export and account deletion
interface now exist and step 42 is a real procedure, but nobody has executed it: no export has been
taken from a deployed instance and `delete_account()` has never been called against a real row,
because `0015` is not applied to the live project. The unit suites cover the serialisers, the
paging, the owner filter, the confirmation phrase and the error mapping. They do not cover the
browser download, the streaming response, or the cascade. Step 42 says this itself.

---

## Change History

| Version | Date       | Author | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-08-04 | Agent  | Initial draft. 48 ordered steps derived from `GO-LIVE.md`, document 33, `HANDOFF.md` and the code.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 0.2.0   | 2026-08-05 | Agent  | Replaced the step 42 placeholder with a verification procedure for the data export and account deletion, which now exist; the step count is unchanged and no step was renumbered. Recorded in section 4 which of the listed documentation errors have since been corrected, and settled the test count by running the suite: 318 across 14 files. Section 6 updated - the build, format and test gaps are closed; the export and deletion procedure is written from the code and has never been executed. |
