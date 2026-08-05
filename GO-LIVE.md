# Going live

Written 4 Aug 2026, corrected 5 Aug 2026. The operator's checklist for moving DayFlow AI
from a laptop to a live deployment, and for keeping it running afterwards.

This is not a summary of
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md).
That document explains the procedure and the reasoning. This one is the list of things
that are already true in the repository and will break, silently, in production if you
forget them. Each item says briefly why it matters, because an unexplained checklist item
gets skipped.

Every item is marked **blocking** or **advisable**:

- **Blocking** - the deployment is broken, or insecure, without it. Do not announce the
  URL to anyone until these are done.
- **Advisable** - the application works without it, but you will regret the omission.

Work down the sections in order. Section 1 is done before the first deploy, section 3
immediately after it, section 4 forever.

---

## 1. Before the first deploy

| #   | Item                                            | Status    |
| --- | ----------------------------------------------- | --------- |
| 1.1 | Rotate the exposed service role key             | blocking  |
| 1.2 | Turn **Confirm email** back on                  | blocking  |
| 1.3 | Configure a real email sender (custom SMTP)     | blocking  |
| 1.4 | Site URL and redirect URLs for the live domain  | blocking  |
| 1.5 | Environment variables in Vercel                 | blocking  |
| 1.6 | Point the Vault secrets at the deployed URL     | blocking  |
| 1.7 | Confirm row level security on every table       | blocking  |
| 1.8 | PWA icons - already generated, nothing to do    | done      |
| 1.9 | Decide what the production database actually is | advisable |

### 1.1 Rotate the exposed service role key - blocking

`SUPABASE_SERVICE_ROLE_KEY` was pasted into a chat transcript. That key bypasses row
level security completely: anyone holding it can read and write every row belonging to
every user, from anywhere, with no session. It is the single most dangerous value in the
system, and a value that has been pasted anywhere must be treated as public.

In the Supabase dashboard, open **Project Settings → API Keys** and the tab holding the
publishable and secret keys. Create a **new secret key** first, then swap it in, then
delete the old one - in that order, because deleting a secret key revokes it instantly
and doing it first gives you a window where nothing works.

Afterwards the new value has to be updated in three places, or the cron routes start
failing with authorisation errors from Supabase:

| Where                 | What to change                                               |
| --------------------- | ------------------------------------------------------------ |
| Vercel                | `SUPABASE_SERVICE_ROLE_KEY`, marked sensitive, then redeploy |
| `.env.local`          | Your local copy, so local cron invocations keep working      |
| Anywhere you saved it | Password manager entries, notes, scratch files               |

While you are there, consider whether `CRON_SECRET` or `VAPID_PRIVATE_KEY` have ever
appeared in a transcript, a screenshot or a support thread. `CRON_SECRET` is cheap to
rotate provided you update Vercel **and** Supabase Vault together (see 1.6). The VAPID
pair is not: regenerating it invalidates every existing push subscription, and every
device has to re-subscribe before reminders resume. Treat the VAPID pair as permanent
unless it is genuinely compromised.

Production secrets should also differ from your development ones, per DF-CFG-011 in
[docs/05-engineering/32-environment-and-configuration.md](docs/05-engineering/32-environment-and-configuration.md).

### 1.2 Turn **Confirm email** back on - blocking

It is currently off, which is correct for development and wrong for anything reachable
from the internet. With confirmation off, Supabase creates an account for whatever
address is typed into the sign-up form without ever proving the person controls it.

The consequence is not merely junk accounts. Someone registers `you@yourdomain.com`,
which they do not own, and the account sits there. Later, the real owner of that address
signs up, finds it taken, and uses password reset - or the attacker uses password reset
themselves the moment they do gain access to the mailbox. Either way an account holding
a detailed record of somebody's days ends up under the wrong control, and nothing in the
application can detect it, because from its point of view every step was legitimate.

Find the email provider's settings under **Authentication** in the dashboard - the
existing documents call this path **Authentication → Providers → Email**, and Supabase
has renamed that section before, so look for the email provider rather than trusting the
exact breadcrumb. Switch **Confirm email** on.

Note that this immediately makes 1.3 blocking too: the moment confirmation is required,
an account cannot be created at all unless the email actually arrives.

### 1.3 Configure a real email sender - blocking

Supabase gives every project a built-in SMTP server, and its own documentation says
plainly that it is not meant for production. Two restrictions matter:

- The whole project shares a very low hourly send allowance. It is currently documented
  as two messages per hour, covering sign-ups, confirmations and password resets
  together, and Supabase states that the figure can change without notice.
- The built-in sender only delivers to addresses belonging to members of your Supabase
  organisation. Mail to anybody else does not arrive at all.

So with confirmation on and no custom SMTP, sign-up appears to work, the user is told to
check their inbox, and nothing ever arrives. Nothing errors in the application. This is
the most common way a working Supabase deployment looks broken.

Configure your own sender under **Authentication → Emails** (the SMTP settings page).
Realistic options for a personal project, all of which have a small free or cheap tier -
check each one's current allowance yourself rather than trusting a number here:

| Provider   | Notes                                                       |
| ---------- | ----------------------------------------------------------- |
| Resend     | Straightforward setup, developer-oriented                   |
| Postmark   | Strong reputation for transactional delivery                |
| Brevo      | Generous entry tier                                         |
| Mailgun    | Long established                                            |
| Amazon SES | Cheapest at volume, the most setup, and starts in a sandbox |

Whichever you choose, verify your sending domain with SPF and DKIM records. An
unauthenticated sender puts confirmation mail in spam, which produces the same user
experience as not sending it.

Once custom SMTP is enabled, Supabase raises the project's send allowance to a higher
default and lets you adjust it under **Authentication → Rate Limits**. Look at that page
after switching over; the default is deliberately conservative to protect a new sender's
reputation.

### 1.4 Site URL and redirect URLs for the live domain - blocking

Under **Authentication → URL Configuration**:

- Set **Site URL** to your production origin, for example `https://dayflow.vercel.app`.
  Supabase falls back to this whenever a requested redirect is not on the allow list, so
  a stale Site URL turns a failed redirect into a confusing success.
- Add **both** of these to **Redirect URLs**:
  - `https://<your-domain>/auth/callback`
  - `https://<your-domain>/auth/callback**`

The second entry is not redundant, and this is worth understanding because the failure is
completely silent. Password reset returns the user to
`/auth/callback?next=/update-password` - see `src/features/auth/auth-operations.ts` line 45,
which is where that string is built.
An allow-list entry without a wildcard is matched against the whole URL including its
query string, so `/auth/callback` does not match `/auth/callback?next=...`. Supabase then
discards the requested redirect, sends the user to the Site URL instead, and they land on
the landing page with no error and no explanation. The reset link looks like it did
nothing.

Leave your `localhost:3000` entries in place. The allow list is additive, and removing
them only breaks local development.

### 1.5 Environment variables in Vercel - blocking

Add every variable from `.env.local` under **Settings → Environment Variables**, scoped
to Production, marking the secret ones sensitive. The full reference with which are
secret is section 3 of
[docs/05-engineering/32-environment-and-configuration.md](docs/05-engineering/32-environment-and-configuration.md).

Three specific traps in this repository:

**`NEXT_PUBLIC_APP_URL` must be the deployed origin.** It is what
`src/features/auth/auth-operations.ts` gives Supabase as the redirect target - line 33 for
the sign-up confirmation and line 45 for the password reset - so it ends up inside every
confirmation and password reset email. Those two calls used to sit inline in
`auth-form.tsx` and `reset-password-form.tsx`; they were moved into `auth-operations.ts` so
the four auth screens could load the Supabase client lazily and stay inside the bundle
budget, and the forms no longer contain the strings. The Zod schema in `src/lib/env.ts`
requires the variable, rejects anything that is not an
absolute `http` or `https` origin, and rejects a trailing slash - because redirect targets
are built by appending a path, and `https://example.com/` would produce
`https://example.com//auth/callback`. All three failures are build failures naming the
variable.

That was not always so: this variable used to default to `http://localhost:3000`, which
meant a deployment with it unset built cleanly, served correctly, and mailed everybody a
link to their own machine. If you are reading an older note that says the omission is
silent, it is out of date.

**`NEXT_PUBLIC_*` values are compiled into the bundle, not read at runtime.** Changing
one in the Vercel dashboard has no effect until you redeploy. If you attach a custom
domain later, update `NEXT_PUBLIC_APP_URL` and redeploy again.

**`NEXT_PUBLIC_VAPID_PUBLIC_KEY` may be empty, and empty means no push.** Unlike the URL
this one is genuinely optional, because the product is fully usable without notifications:
left empty, Settings reports push as unconfigured for the device and `sendPush` skips. What
it may not be is wrong - a value that is not a real 87-character VAPID key fails the build,
rather than reaching the browser and failing inside `pushManager.subscribe` with an error
that names nothing. So if you want reminders, set it; if reminders are not arriving, check
that it is present rather than assuming the value is being ignored.

`CRON_SECRET` deserves its own note: Vercel only attaches the
`Authorization: Bearer <CRON_SECRET>` header to its scheduled invocations when that
variable exists on the project. Without it the daily report job calls
`/api/cron/daily-report`, gets a 401 from the check in `src/lib/push/send.ts`, and reports
a failure every night.

### 1.6 Point the Vault secrets at the deployed URL - blocking for reminders

`supabase/migrations/0011_scheduled_jobs.sql` schedules two `pg_cron` jobs that call your
application over HTTPS. The function `public.invoke_cron_endpoint` reads the target URL
and the shared secret from Vault at run time, so the values live in the database rather
than in the repository.

`pg_cron` runs inside Supabase's network. It cannot reach `localhost`, and it cannot reach
your laptop at all. Until `dayflow_app_url` names the deployed site, the function either
does nothing or posts into the void, and reminders and automatic closes never happen -
without a single error anywhere in the application.

First check what exists:

```sql
select name, created_at, updated_at
from vault.secrets
where name in ('dayflow_app_url', 'dayflow_cron_secret');
```

If a row is missing, create it; if it is present, update it:

```sql
-- create, if it does not exist yet
select vault.create_secret('https://<your-domain>', 'dayflow_app_url');
select vault.create_secret('<your CRON_SECRET>',    'dayflow_cron_secret');

-- update, if it already exists
select vault.update_secret(
  (select id from vault.secrets where name = 'dayflow_app_url'),
  'https://<your-domain>'
);
```

Two details that cause real failures:

- **No trailing slash on the URL.** The function builds its target as `v_url || p_path`,
  so `https://example.com/` becomes `https://example.com//api/cron/reminders`.
- **`dayflow_cron_secret` must exactly match `CRON_SECRET` in Vercel.** They are compared
  in constant time in `src/lib/push/send.ts`, and a mismatch produces a 401 that only
  shows up in Vercel's function logs. This is the classic aftermath of rotating the secret
  in one place and not the other, and it is the first thing to check whenever reminders
  stop - see section 7.1 of
  [docs/06-operations/36-observability-and-incident-runbook.md](docs/06-operations/36-observability-and-incident-runbook.md).

The names are `dayflow_app_url` and `dayflow_cron_secret`, exactly. A secret stored under
any other name reads as absent, and `invoke_cron_endpoint` then returns null and logs a
warning rather than failing loudly. Section 4.1 of the deployment runbook briefly called
them `app_url` and `cron_secret`; that was corrected in its v0.1.1 and both documents now
agree with `supabase/migrations/0011_scheduled_jobs.sql`, which is the thing that actually
reads them.

### 1.7 Confirm row level security on every table - blocking

Row level security is the only thing standing between one user and everybody else's data.
Supabase exposes PostgreSQL over HTTPS to the browser, so any signed-in user can send
whatever query they like; "the application only asks for its own rows" is not a control.
This is the central threat in
[docs/06-operations/34-security-and-threat-model.md](docs/06-operations/34-security-and-threat-model.md).

A table left unprotected produces no symptom. The application behaves identically. You
find out when somebody exploits it, or never.

`supabase/migrations/0007_rls_policies.sql` enables it on ten tables. Paste this into the
SQL editor and read every row:

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

You should see ten rows - `ai_reports`, `ai_usage`, `categories`, `feature_flags`,
`goals`, `moments`, `parent_categories`, `profiles`, `push_subscriptions`, `settings` -
every one with `rls_enabled = true` and `policy_count` of at least one. The ordering puts
any unprotected table at the top, which is the point.

Two failure shapes to recognise. `rls_enabled = false` means that table is world-readable
to any authenticated user; fix it immediately with a forward migration. `rls_enabled =
true` with `policy_count = 0` is safe but denies everything, so the corresponding feature
appears empty or errors with a permission message.

Re-run this query after every schema change. A new table does not get row level security
by default, and a migration that adds one is the exact moment this gets forgotten.

### 1.8 PWA icons - done

All three PNGs referenced by `public/manifest.webmanifest` now exist in `public/icons/`,
generated by `npm run icons:generate`. Nothing is required before deploying.

Worth knowing why it was on this list: `public/sw.js` uses `/icons/icon-192.png` as both
the icon and the badge for every push notification, so a missing file degraded every
reminder rather than only the home screen install. And on iOS web push only works once the
site has been added to the Home Screen, which puts the install path on the critical path
for notifications.

Re-run the generator if you change the accent colour. See
[public/icons/README.md](public/icons/README.md).

### 1.9 Decide what the production database actually is - advisable

Right now the live Supabase project also serves local development, and preview
deployments would point at whatever credentials they are given. Section 2 of
[docs/05-engineering/32-environment-and-configuration.md](docs/05-engineering/32-environment-and-configuration.md)
assumes a separate development project, and DF-CD-020 says previews must never use
production credentials.

On the free tier you get two active projects, so one production and one development is
possible without paying. If you would rather run a single project, that is a defensible
choice for a solo personal deployment - just make it deliberately, and know that from
that point on every experiment you run locally is against your real history.

---

## 2. What the free tier actually means

The free tier is genuinely usable for this product. DayFlow stores rows of timestamps and
category names, uploads no files, and has one user, so nothing here is close to a
capacity problem. The constraints that matter are about availability and backups, not
size.

**Free projects pause when they go quiet.** Supabase pauses a free project after roughly
a week of insufficient database activity, warns you by email beforehand, and requires you
to press **Resume project** in the dashboard to bring it back. A paused project is
completely unavailable - the application returns errors, not a maintenance page. Data is
retained, and the project stays restorable from the dashboard for up to a year after
pausing, after which the only route is downloading the backup and migrating it to a new
project.

In practice a working deployment generates continuous traffic, because the reminder sweep
calls your application every ten minutes and the application queries the database. What
Supabase counts as qualifying activity is not documented precisely enough to rely on, so
treat this as a thing to check rather than a thing to assume: if you stop using DayFlow
for a couple of weeks, or the cron jobs stop, look at the project before concluding the
application is broken.

**Your own export is the only backup you have.** Point-in-time recovery is a paid
feature, and automated daily backups are not part of the free plan either. Section 3 of
[docs/06-operations/37-backup-and-disaster-recovery.md](docs/06-operations/37-backup-and-disaster-recovery.md)
describes four layers of protection; on the free tier layers 1 and 2 do not exist. Layer
3, the off-platform dump you take yourself, is not a supplementary precaution here - it is
the whole of your recovery capability. See 4.1 below, and treat the weekly cadence as a
real commitment rather than an aspiration.

This is also why point-in-time recovery is named in that document as the first thing worth
paying for. It is the only mechanism that can undo a mistake you made twenty minutes ago.

**The ceilings worth knowing.** These were the published free-plan figures when this was
written. Quotas change, and some are per project while others are per organisation, so
confirm against [supabase.com/pricing](https://supabase.com/pricing) and your
organisation's **Usage** page before relying on any of them:

| Resource                  | Free plan              |
| ------------------------- | ---------------------- |
| Database size             | 500 MB per project     |
| File storage              | 1 GB                   |
| Egress                    | 5 GB, plus 5 GB cached |
| Monthly active users      | 50,000                 |
| Realtime peak connections | 200                    |
| Realtime messages         | 2 million per month    |
| Active projects           | 2 per organisation     |
| Log retention             | Short - around a day   |

For a single user, database size and egress are the only two you could plausibly
approach, and only after years. Log retention is the one that will actually inconvenience
you: DF-OBS-006 in the observability document asks for 30 days, and the free plan keeps
far less, so a problem you notice a week late may have no evidence left. If something
looks wrong, gather the logs the same day.

On the Vercel side, the Hobby plan permits a cron job no more often than once per day, and
invokes it at some point within the scheduled hour rather than on the minute. That is
precisely why `supabase/migrations/0011_scheduled_jobs.sql` exists: the ten-minute
reminder sweep could not run on Vercel Cron at all. `vercel.json` schedules only the daily
report, at `0 1 * * *`, which is within the Hobby limit and will fire somewhere between
01:00 and 01:59 UTC. Hobby is also licensed for non-commercial personal use, which fits a
personal project but is worth knowing if that ever changes.

---

## 3. Immediately after deploying

Do these while you still remember what you changed. All four together take about twenty
minutes.

### 3.1 Verify the scheduled jobs actually fire - blocking

Reminders are the easiest thing in this product to break without noticing, because
failure is silent: no error, no failed request, nothing to complain about. You simply
stop being reminded.

Start with registration:

```sql
select jobname, schedule, active from cron.job;
```

Expect exactly two rows: `dayflow-reminders` on `*/10 * * * *` and `dayflow-auto-close`
on `*/15 * * * *`, both `active = true`. If they are missing, `0011` never applied, or
applied before `pg_cron` was enabled.

Then look at whether they have been running:

```sql
select jobid, jobname, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 20;
```

**Read this output carefully, because `succeeded` here means less than it appears.**
`cron.job_run_details` reports whether Postgres executed the scheduled SQL, not whether
your application received anything. `invoke_cron_endpoint` returns `null` and logs a
warning when the Vault secrets are absent, and `net.http_post` only queues a request - so
a job whose HTTP call 401s, times out, or goes to a stale URL still records `succeeded`.
A row with `status = 'failed'` and a `return_message` naming a missing function or
extension is the easy case; the dangerous case looks perfectly healthy.

So verify the call end to end instead. Invoke the function directly:

```sql
select public.invoke_cron_endpoint('/api/cron/reminders');
```

A number means it dispatched a request. `null` means the Vault secrets are missing or
misnamed - go back to 1.6. If `pg_net` keeps its response history on your project (a
table under the `net` schema, `net._http_response` on current versions), the status codes
of recent calls are visible there, which is the most direct evidence available inside the
database.

Then call the endpoint yourself, which is the check that proves the secret matches:

```bash
# expect 401
curl -i -X POST https://<your-domain>/api/cron/reminders

# expect 200 and a JSON body with "ok": true
curl -i -X POST https://<your-domain>/api/cron/reminders \
  -H "Authorization: Bearer <your CRON_SECRET>"
```

> **These are bash.** In Windows PowerShell 5.1 `curl` is an alias for `Invoke-WebRequest`
> and rejects `-i` and `-X`, so the two lines above fail with an argument error rather than
> doing anything. Use the `Invoke-WebRequest` equivalents in **step 32** of
> [GO-LIVE-STEPS.md](GO-LIVE-STEPS.md), which are written for that shell and include the
> `try`/`catch` a non-2xx response needs there.

Finally check the Vercel side. `/api/cron/daily-report` is invoked by Vercel Cron, not by
`pg_cron`; look for its scheduled job in the Vercel project dashboard and check the
function logs the morning after your first deployment, remembering the schedule is UTC and
the Hobby plan fires within the hour rather than on the minute.

### 3.2 Confirm push notifications on a real device - advisable

Push cannot be verified in a desktop browser tab in any meaningful way, because the
things that break are device-specific.

1. Open the deployed site on your phone and sign in.
2. On iOS, add it to the Home Screen first and open it from there. iOS delivers web push
   only to home-screen web apps, so testing in Safari itself will fail in a way that
   looks like a bug in DayFlow.
3. Enable reminders in Settings and grant notification permission when asked.
4. Confirm the subscription reached the database:
   `select count(*) from push_subscriptions;` should have gone up.
5. Start an activity and leave it pending, then invoke `/api/cron/reminders` with the
   secret as in 3.1.
6. Confirm the notification arrives, and that tapping **Close it now** opens the app on
   `/dashboard?close=<id>` with the close dialog already open.

If the subscription count stays at zero, the usual cause is a missing
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` in Vercel. An absent key is permitted - push is optional -
so nothing fails the build; the Settings screen reports notifications as unconfigured for
the device instead, which is the symptom to look for.

### 3.3 First-run smoke test - blocking

Use a real address you control, because confirmation is now on and this is also how you
verify 1.3.

1. **Sign up.** The confirmation email should arrive within a minute or two, through your
   new SMTP provider. If it does not, the problem is section 1.3, not the application.
2. **Check the seeding worked.** In the Table Editor, `parent_categories` should have 6
   rows including `Distracted Time`, `categories` should have 17, and `settings` should
   have exactly one row for your user. Empty tables mean the `0009` trigger did not run.
3. **Record an activity** and confirm it appears on the day timeline immediately.
4. **Close it** and confirm the duration is right and the pending queue empties.
5. **Sign in on a second device** - your phone alongside your laptop - and confirm a
   change made on one appears on the other without a refresh. This exercises the realtime
   publication from `0012`; if it fails, that migration did not apply, or Realtime is
   switched off for the project.
6. **Request a password reset** and confirm the emailed link lands on the update-password
   form rather than the landing page. Landing on the home page instead means the `**`
   wildcard redirect from 1.4 is missing.
7. **Check the Vercel function logs** for errors during all of the above.

The longer verification list, including the queue refusal and the AI-off report path, is
section 4.3 of
[docs/05-engineering/33-cicd-and-deployment-runbook.md](docs/05-engineering/33-cicd-and-deployment-runbook.md).

---

## 4. Ongoing

### 4.1 Export the data, weekly - blocking in effect

On the free tier this is not housekeeping. With no point-in-time recovery and no
automated backups, a dump you took yourself is the only thing standing between a mistake
and permanent loss of your own history - which, per section 2 of
[docs/06-operations/37-backup-and-disaster-recovery.md](docs/06-operations/37-backup-and-disaster-recovery.md),
is the one failure this product cannot recover from.

```bash
supabase db dump --linked -f "dayflow-$(date +%Y-%m-%d).sql"
```

> **This is bash.** `$(date +%Y-%m-%d)` is not a PowerShell construct and expands to
> nothing useful there. The PowerShell form, using `Get-Date -Format`, is in **step 43** of
> [GO-LIVE-STEPS.md](GO-LIVE-STEPS.md).

Store it somewhere outside Supabase and outside Vercel, encrypted. The point of an
off-platform copy is the scenario where the platform itself is the problem: an outage, a
billing failure, an account suspension. A backup that lives inside the thing that failed
is not a backup.

The in-application export described in section 7 of
[docs/06-operations/35-privacy-and-data-protection.md](docs/06-operations/35-privacy-and-data-protection.md)
now exists, in `src/features/settings/data-export-card.tsx` and `/api/export`. It does not
replace this dump and is not a backup: it reads through the user's own session, so it
returns one account's rows and nothing of the schema, the functions, the triggers or the row
level security policies. Restoring a project from it is not possible. The CLI dump remains
the recovery artefact; the in-application export is the user's copy of their own data.

Once a quarter, restore one of those dumps into a scratch project and sign in against it.
An untested backup is a hypothesis. The drill is described in section 5 of document 37,
and the part that matters is timing it: if recovery takes six hours and your stated
objective is four, the objective is fiction.

### 4.2 Keep dependencies current - advisable

`package.json` pins 441 resolved packages through `package-lock.json`. Vulnerabilities in
that tree are the most likely route to a compromise that has nothing to do with anything
you wrote.

| What                            | How                                                         |
| ------------------------------- | ----------------------------------------------------------- |
| High and critical advisories    | The `Dependency audit` job in CI, on every pull request     |
| Low and moderate advisories     | `npm audit`, monthly                                        |
| Available updates               | `npm outdated`                                              |
| GitHub advisories for this repo | Dependabot alerts, under the repository's security settings |
| Framework security releases     | The Next.js and Supabase release notes                      |

DF-SEC-026 requires dependencies to be audited in CI, and `.github/workflows/ci.yml` now
runs `npm audit --audit-level=high` as a separate job. It gates nothing deliberately: an
advisory appears when a third party publishes it, so a pull request author would be blocked
by something they did not cause and cannot fix, and a check that is red for unrelated
reasons is a check people stop reading.

That threshold leaves low and moderate advisories unreported, which is why the monthly
manual `npm audit` above is still worth doing rather than redundant.

Enable Dependabot alerts on the GitHub repository as well; it is the only one of these that
finds you rather than waiting to be asked.

Patch and minor updates are usually safe with the full suite green. Take major upgrades
deliberately, one at a time, on a branch.

### 4.3 Watch these four things - advisable

Sized to be checkable in a couple of minutes, because anything longer will not get
checked. Section 4 of
[docs/06-operations/36-observability-and-incident-runbook.md](docs/06-operations/36-observability-and-incident-runbook.md)
has the full set and the thresholds that should trigger action.

| Signal         | Where                                               | What bad looks like                                |
| -------------- | --------------------------------------------------- | -------------------------------------------------- |
| Error rate     | Vercel function logs                                | Repeated 500s on one route, usually after a deploy |
| Scheduled jobs | `cron.job_run_details`, plus reminders arriving     | Nothing failing, and no reminders either - see 3.1 |
| Database size  | Supabase dashboard, and the organisation Usage page | Steady growth toward the 500 MB free-plan ceiling  |
| AI spend       | `ai_usage`, and your provider's own dashboard       | Cost climbing faster than your use of the feature  |

For AI spend, once `AI_ENABLED=true`:

```sql
select
  count(*)                as calls,
  sum(input_tokens)       as input_tokens,
  sum(output_tokens)      as output_tokens,
  sum(estimated_cost)     as estimated_cost
from ai_usage
where created_at > now() - interval '30 days';
```

`estimated_cost` is DayFlow's own estimate, not a bill. Reconcile it against the
provider's dashboard the first month, because an estimate that has drifted is worse than
no estimate. Leaving `AI_ENABLED=false` is a perfectly good permanent choice; the whole
product works without it.

One more recurring check worth putting in the calendar: re-run the row level security
query from 1.7 after every schema change, and confirm **Confirm email** is still on. Both
are the kind of setting that gets turned off during debugging and never turned back on.

---

## 5. Where the documents and the code disagree

Found while checking this checklist against the repository. None of these blocked a
deployment, but each was a place where following a document would mislead you. All seven
have since been closed - five by changing the code to do what the document said, two by
correcting the document.

| Source                  | Claim                                     | Resolution                                                             |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Doc 34 §4.6, DF-SEC-023 | A CSP is set in `next.config.ts`          | Closed. A policy is now set; see the caveat below                      |
| DF-SEC-021              | HSTS enabled in production                | Closed. `Strict-Transport-Security` is set on production builds        |
| DF-SEC-026              | Dependencies audited in CI                | Closed. `ci.yml` runs `npm audit --audit-level=high` as its own job    |
| Doc 33 §4.1             | Vault secrets `app_url`, `cron_secret`    | Closed. Document corrected to `dayflow_app_url`, `dayflow_cron_secret` |
| Doc 37 §3, layer 2      | A daily automated Supabase backup         | Closed. Document now records that layers 1 and 2 are paid features     |
| `HANDOFF.md` §1         | 13 migrations; cron routes and CI unbuilt | Closed. Rewritten to describe the current state                        |
| Doc 35 §7, DF-PRV-020   | Export and deletion available in Settings | Closed. Both are now built; see below                                  |

The last of those was the only one that was a missing feature rather than a missing header.
Account deletion has to remove the `auth.users` row, which means either the service role
key - confined by an ESLint rule to `src/app/api/cron/` on purpose - or a `security definer`
function that deletes the caller's own record. ADR-014 chose the function, `0015` implements
it as `public.delete_account()`, and the interface is now in `src/features/settings/` with
`/api/export` behind the export half.

**Built is not verified.** Neither control has been exercised against a database with `0015`
applied, because the live project is still on `0013`. Until it is, the delete dialog will
report the feature as unavailable and delete nothing - which is the correct behaviour, and
also means the destructive path is the one part of this application with no evidence behind
it at all. Step 42 of [GO-LIVE-STEPS.md](GO-LIVE-STEPS.md) is the procedure, and it says to
use a throwaway account.

**The Content Security Policy is a damage limit, not a wall.** `script-src` permits
`'unsafe-inline'`, because the App Router serves its hydration payload as inline script
tags. Removing that means issuing per-request nonces from the middleware, which Next.js
supports but which opts every route out of static rendering, including the landing page.
`'unsafe-eval'` is permitted in development only, and is absent from production builds as
DF-SEC-023 requires. `connect-src` names your Supabase origin specifically rather than
`https://*.supabase.co`, so a project rename means a redeploy.

After deploying, confirm both headers actually arrive - a policy that a proxy strips is no
policy at all:

```bash
curl -sI https://<your-domain> | grep -iE 'content-security-policy|strict-transport'
```

> **This is bash.** Neither `curl -sI` nor `grep` works in Windows PowerShell 5.1. Read the
> headers off an `Invoke-WebRequest` response instead, as **step 27** of
> [GO-LIVE-STEPS.md](GO-LIVE-STEPS.md) does.

Vercel may also send HSTS for its own domains. Check again if you attach a custom domain.

---

## Where the detail lives

| Question                                | Document                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Full deployment procedure and rollback  | [33 - CI/CD and Deployment Runbook](docs/05-engineering/33-cicd-and-deployment-runbook.md)             |
| Every variable, and rotation impact     | [32 - Environment and Configuration](docs/05-engineering/32-environment-and-configuration.md)          |
| What is being protected, and from whom  | [34 - Security and Threat Model](docs/06-operations/34-security-and-threat-model.md)                   |
| Retention, user rights, breach handling | [35 - Privacy and Data Protection](docs/06-operations/35-privacy-and-data-protection.md)               |
| Health checks and incident runbooks     | [36 - Observability and Incident Runbook](docs/06-operations/36-observability-and-incident-runbook.md) |
| Backup layers and restore procedures    | [37 - Backup and Disaster Recovery](docs/06-operations/37-backup-and-disaster-recovery.md)             |
| First-time local setup                  | [README.md](README.md)                                                                                 |
