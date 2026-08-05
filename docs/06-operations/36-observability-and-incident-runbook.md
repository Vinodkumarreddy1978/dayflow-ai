# 36 - Observability and Incident Runbook

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-036 |
| Version      | 0.2.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

How DayFlow AI is monitored, what constitutes an incident, and what to do about each kind.
Sized for a solo operator: everything here must be checkable in a few minutes, or it will
not be checked at all.

Sections 2 to 10 describe the intended monitoring posture. **Section 11 records what the
code actually does today**, requirement by requirement, including what remains unmet.
Read section 11 before relying on anything above it.

## 2. The observability problem specific to this product

Most failures in DayFlow AI are **silent**. If reminders stop firing, no page errors, no
request fails, and no user complains for days - they simply stop being reminded and quietly
lose the habit. By the time it is noticed, weeks of the product's central value have been
lost.

Monitoring is therefore weighted toward **things that should have happened and did not**,
rather than toward errors.

## 3. Signals

| Signal                        | Source                   | Why                                       |
| ----------------------------- | ------------------------ | ----------------------------------------- |
| Function errors               | Vercel logs              | Server failures                           |
| Client errors                 | Error boundary reporting | Interface failures                        |
| Web vitals                    | Vercel Analytics         | Performance budgets                       |
| Cron run history              | `cron.job_run_details`   | Whether scheduled work actually ran       |
| Reminder send counts          | Application logs         | Whether notifications are being delivered |
| Auto-close rate               | SQL over `moments`       | Whether the reminder ladder is working    |
| Database size and connections | Supabase dashboard       | Capacity                                  |
| AI spend                      | `ai_usage`               | Cost control                              |

Two of these are not collected at all today, and the table above should not be read as
saying otherwise. **Client errors** reach an error boundary that recovers the interface,
but nothing records them anywhere the operator can see - there is no client error
reporting service configured. **Web vitals** would come from Vercel Analytics, and
neither `@vercel/analytics` nor `@vercel/speed-insights` is a dependency of this project.
Section 11.6 lists both against the requirements they belong to.

## 4. Health checks

### Daily, about two minutes

```sql
-- Did the scheduled jobs run and succeed?
select jobname, status, start_time, return_message
from cron.job_run_details
where start_time > now() - interval '24 hours'
  and status <> 'succeeded';

-- Auto-close rate: the health of the whole queue mechanic
select
  count(*) filter (where status = 'auto_closed') as auto_closed,
  count(*) as total,
  round(100.0 * count(*) filter (where status = 'auto_closed') / nullif(count(*),0), 1) as pct
from moments
where created_at > now() - interval '7 days';
```

An auto-close rate above 20% means either the reminders are not arriving or the thresholds
are wrong, per the decision rules in
[10 - KPI Framework](../01-business/10-kpi-framework.md) section 7.

### Weekly

North Star metric, day-7 and day-30 retention, error rate, p75 web vitals, AI spend against
budget, database growth.

## 5. Alerts

| Condition                                         | Severity | Response                  |
| ------------------------------------------------- | -------- | ------------------------- |
| Cron job failed twice consecutively               | High     | Investigate within 1 hour |
| No reminders sent in 2 hours with pending Moments | High     | Investigate within 1 hour |
| Error rate above 5% for 15 minutes                | High     | Investigate immediately   |
| Database above 80% of quota                       | Medium   | Plan within a week        |
| AI daily spend cap reached                        | Medium   | Review same day           |
| p75 LCP above 3 seconds for a day                 | Low      | Next release              |
| Push failure rate above 20%                       | Medium   | Investigate within a day  |

**None of these conditions raises an alert today.** There is no alerting mechanism in the
deployment at all: every row above is a threshold for a human reading the checks in section
4, and the "response within one hour" columns are therefore aspirations rather than
commitments. The two rows about cron jobs and reminders are the subject of DF-CD-011, which
is assessed honestly in section 11.7. Push failure rate and error rate are now derivable
from the log lines described in section 11.2, which is a precondition for alerting rather
than alerting itself.

## 6. Incident severity

| Level | Meaning                                              | Example                             | Response  |
| ----- | ---------------------------------------------------- | ----------------------------------- | --------- |
| SEV1  | Data loss, data exposure, or capture entirely broken | Moments deleted by a migration      | Immediate |
| SEV2  | A core feature is unusable                           | Reminders not sending               | Same day  |
| SEV3  | A feature is degraded                                | Analytics slow, or one chart broken | Same week |
| SEV4  | Cosmetic or minor                                    | Misaligned label                    | Backlog   |

**Anything touching the integrity of a user's Moment history is SEV1 regardless of how few
users it affects.** The product's entire proposition is that the record can be trusted.

## 7. Runbooks

### 7.1 Reminders have stopped

The most likely incident, and the one most likely to go unnoticed.

1. Are the jobs registered? `select * from cron.job;`
2. Are they succeeding? `select * from cron.job_run_details order by start_time desc limit 20;`
3. **Did the sweep run at all?** Search the Vercel function logs for
   `"event":"cron.run"` with `"job":"reminders"`. One line per invocation, roughly every
   ten minutes. Absence is the finding: the endpoint was never reached, so the fault is
   in `pg_cron`, in Vault, or in the network between them - not in the application.
   If the lines are present but `sent` is zero while `processed` is not, the sweep is
   running and the notifications are not arriving, which is a different investigation
   (step 5 onward).
4. Does the endpoint respond? `curl -X POST .../api/cron/reminders -H "Authorization: Bearer $CRON_SECRET"`
5. If it returns 401, `CRON_SECRET` differs between Vercel and Supabase Vault - the classic
   cause, usually after a rotation that updated only one. Every rejection now writes
   `"event":"cron.unauthorised"` naming the job, so a Vault secret that no longer matches
   is visible in the logs rather than only in a curl you thought to run.
6. Are there live subscriptions? `select count(*) from push_subscriptions;`
7. Send a test push to your own device.
8. If subscriptions were mass-deleted, check whether the VAPID keys were regenerated. That
   invalidates every subscription and requires every user to re-subscribe.

### 7.2 A user reports missing Moments

1. Confirm the count directly: `select count(*) from moments where user_id = ...`.
2. If the rows exist, it is a query, timezone or filter problem, not data loss.
3. Check whether the timezone setting changed recently - a changed timezone re-groups
   historical days and can look exactly like disappearance.
4. If rows are genuinely gone, treat as SEV1 and go to
   [37 - Backup and Disaster Recovery](37-backup-and-disaster-recovery.md).

### 7.3 The queue limit is not being enforced

Treat as SEV2, because it undermines the product's core mechanic.

1. Verify the trigger exists on `moments`.
2. Attempt a direct REST insert exceeding the limit; it must be rejected.
3. If the database rejects it but the interface does not, the client check is broken - lower
   severity, since data integrity holds.
4. If the database accepts it, a migration has dropped or replaced the trigger. Restore it
   with a new forward migration.

### 7.4 Elevated error rate

Read the Vercel function logs, identify the route, check whether it correlates with a recent
deployment, and if so promote the previous deployment first and investigate afterwards.

Concretely: filter the project's logs for `"level":"error"`. Every entry is one JSON object
carrying `message`, and a `context` naming the `job` or `route`, the `stage` that failed and
a serialised `error` with its `code` and `stack`. The `userId` is present where one applies,
which is what lets a single user's report be matched to a specific failure. Nothing in a
log line identifies the activity itself, so a user describing "my Tuesday report failed"
is matched by user and period, not by content - that is the deliberate cost of DF-OBS-002.

### 7.5 Database near capacity

Check table sizes, confirm `ai_usage` and logs are being pruned on schedule, then upgrade the
Supabase plan. Never delete user Moments to reclaim space, under any circumstances.

## 8. Logging

| ID         | Requirement                                                             |
| ---------- | ----------------------------------------------------------------------- |
| DF-OBS-001 | Logs MUST be structured JSON with a level, message and context.         |
| DF-OBS-002 | Logs MUST NOT contain Moment notes, category names or email addresses.  |
| DF-OBS-003 | Logs MAY contain user identifiers for correlation.                      |
| DF-OBS-004 | Every cron run MUST log counts of processed, sent, skipped and failed.  |
| DF-OBS-005 | Errors MUST include enough context to reproduce, without personal data. |
| DF-OBS-006 | Logs MUST be retained for 30 days.                                      |

DF-OBS-002 is a real constraint with a real cost: it makes some debugging harder. It holds
anyway, because a log aggregator is a second, less protected copy of the most sensitive data
in the system.

These six requirements are implemented as described in section 11, with the exception of
DF-OBS-006, which the platform does not permit on the current plan.

## 9. Incident record

Every incident, including those with no user impact, gets a short written record: what
happened, when it was detected and how, what caused it, what was done, who was affected, and
what changes prevent a recurrence.

Records live in `docs/incidents/YYYY-MM-DD-short-name.md`.

The value is cumulative. A single incident record is administration; twenty of them are a
map of where this system actually breaks.

## 10. Post-incident actions

Every SEV1 and SEV2 must produce at least one concrete change - a test, an alert, a
documentation fix or a code change. An incident that produces no change will recur, and the
absence of a change usually means the cause was never really understood.

## 11. What is implemented today

This section exists because of a specific failure in this repository's own history:
documents recorded work as complete before it had ever run, and the time was paid back
later with interest. So everything claimed below has been executed: the tests named here
pass, and `tsc --noEmit`, `eslint .`, `vitest run`, `prettier --check` and `next build` were
all run against the code as described - the five gates in section 3 of
[33 - CI/CD and Deployment Runbook](../05-engineering/33-cicd-and-deployment-runbook.md).
Anything not verified is called unmet rather than described in the present tense.

Before this version there was no logging in the application at all: not one `console` call
anywhere in `src/`, and two `catch {}` blocks that returned HTTP 500 and discarded the
reason entirely.

### 11.1 The logging module

`src/lib/logger.ts`. No dependencies. Verified by `src/lib/logger.test.ts`.

One JSON object per line, written to stdout for `debug` and `info` and to stderr for
`warn` and `error`, because that is the entire transport: Vercel captures both streams from
every function invocation and makes the fields queryable. A line looks like this, unwrapped
for reading only - the real output is a single line:

```json
{
  "level": "warn",
  "message": "Cron run finished with failures: reminders",
  "timestamp": "2026-08-04T14:30:02.118Z",
  "context": {
    "event": "cron.run",
    "job": "reminders",
    "processed": 31,
    "sent": 4,
    "skipped": 2,
    "failed": 1,
    "users": 3,
    "durationMs": 812
  }
}
```

`level`, `message` and `timestamp` are always present, satisfying DF-OBS-001. Everything a
caller passes goes under `context`, so a field never collides with the record's own keys.
`LOG_LEVEL` selects the threshold and defaults to `info`, which means `debug` calls cost
nothing in production.

**Redaction is the point of the module rather than a feature of it.** A logger that
forwards whatever it is given makes DF-OBS-002 the responsibility of every future caller,
and one of them will pass a whole Supabase row into a catch block at 2am. So values are
removed on the way through:

| Rule                                                                      | Example dropped                          |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| Key names on a deny list, matched ignoring case and separators            | `authorization`, `CRON_SECRET`, `cookie` |
| Key names containing a credential word                                    | `apiKey`, `serviceRoleKey`, `vapid...`   |
| Any key ending in `name`                                                  | `categoryName`, `displayName`            |
| Keys naming a person's own words                                          | `note`, `content`, `title`, `body`       |
| Push subscription material, which identifies a device                     | `endpoint`, `p256dh`, `auth`             |
| `detail` and `details`, because PostgreSQL puts the offending row in them | `Key (name)=(Therapy) already exists`    |
| Email addresses, bearer tokens and JWTs by shape, anywhere in a string    | text interpolated into a message         |
| The literal value of any configured secret, anywhere in a string          | `CRON_SECRET` pasted into a message      |

The last rule is the one that makes the requirement close to literally true rather than
merely likely: the values of `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
`VAPID_PRIVATE_KEY`, `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are read from the environment
and replaced wherever they occur, so a caller cannot leak one by putting it under an
innocuous key or inside a sentence.

Identifiers are deliberately kept. DF-OBS-003 permits them, and a log that cannot be
correlated to a user is not much of a log; `userId`, `momentId` and `subscriptionId` all
pass through. What is lost is the ability to see _what_ the user recorded, which is exactly
the trade DF-OBS-002 asks for.

Three further properties, each there because of how logging usually goes wrong:

- **It never throws.** A logger is called from inside catch blocks, so an exotic object or
  a getter that raises must not convert a handled failure into an unhandled one. The event
  survives with its context marked unloggable.
- **Records are bounded.** Depth, string length and array length are capped, so one bad
  call cannot bury the lines around it or consume the retention DF-OBS-006 wants.
- **`Error` objects are serialised properly**, including `stack`, `cause` and own
  properties such as a Supabase `code` or a push service `statusCode`. `JSON.stringify` of
  an `Error` produces `{}`, which is the most common way an error log ends up empty.

The ESLint `no-console` rule stays on for the whole project. The exemption is a single
`eslint-disable-next-line` on the one line in this module that writes to stdout; there is
no project-wide relaxation and no file-level disable comment anywhere. A stray
`console.log` added in a future change is therefore still a lint warning.

### 11.2 Where it is wired

| File                                     | What it now logs                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `src/app/api/cron/reminders/route.ts`    | Rejected invocations, scan failures, failed post-sweep writes, one run summary    |
| `src/app/api/cron/auto-close/route.ts`   | Rejected invocations, scan failures, each refused close, one run summary          |
| `src/app/api/cron/daily-report/route.ts` | Rejected invocations, settings read failures, each failed report, one run summary |
| `src/app/api/reports/generate/route.ts`  | The previously discarded generation failure, with the user and period             |

Every HTTP status code and response body in those four routes is unchanged. The cron
endpoints still answer 401 without the bearer secret, which `e2e/public-routes.spec.ts`
asserts for DF-CD-013.

Two events are worth knowing by name:

- `cron.unauthorised` - a scheduled invocation failed the bearer check. Almost always
  `CRON_SECRET` rotated in Vercel but not in Supabase Vault, or the reverse, which
  previously produced no evidence anywhere. Nothing about the presented credential is
  logged, only that one was refused.
- `cron.error` - a failure inside a job, carrying the `stage` that failed.

Not wired, and not claimed to be: `/api/push/subscribe`, `/api/push/unsubscribe`, the auth
callback and sign-out routes, server components, and the browser. Those paths still fail
silently, and the boundaries in section 11.5 recover the interface without recording
anything.

### 11.3 What the cron counts mean

DF-OBS-004 requires `processed`, `sent`, `skipped` and `failed` from every run. The names
are fixed so that runs can be compared; what each counts depends on what the job iterates,
and guessing wrong makes the numbers worse than useless.

| Job            | processed               | sent                   | skipped                              | failed                        |
| -------------- | ----------------------- | ---------------------- | ------------------------------------ | ----------------------------- |
| `reminders`    | Pending Moments scanned | Notifications accepted | Notifications with no device to send | Notification sends that erred |
| `auto-close`   | Pending Moments scanned | Notifications accepted | Moments not yet eligible to close    | Close writes refused          |
| `daily-report` | Report jobs attempted   | Notifications accepted | Periods with nothing recorded        | Report jobs that threw        |

Each line also carries the fields specific to its job - `reminded`, `warned`, `closed`,
`generated`, `subscriptionsPruned` - plus `durationMs`. **A run with nothing to do still
logs, with zeroes.** That is deliberate and is the single most useful property here: the
premise of section 2 is that this product fails by going quiet, and a job that stopped
being invoked is otherwise indistinguishable from a job that had nothing to do.

### 11.4 Reading the logs in practice

In the Vercel dashboard, open the project and its Logs view. Because each record is one
line of JSON, plain text search is enough:

| To find                    | Search for                    |
| -------------------------- | ----------------------------- |
| Every scheduled run        | `"event":"cron.run"`          |
| One job's runs             | `"job":"reminders"`           |
| Anything that failed       | `"level":"error"`             |
| A secret mismatch          | `"event":"cron.unauthorised"` |
| Report generation failures | `"event":"report.error"`      |

The constraint to plan around is retention, not searching. Vercel keeps runtime logs on the
Hobby plan for hours rather than days, and the mechanism that would satisfy DF-OBS-006 -
a log drain to somewhere durable - is a paid feature. Supabase's own log retention on the
free plan is similarly short. **So gather evidence the same day.** A problem noticed a week
later will have none.

### 11.5 Error boundaries

| File                       | Covers                                              | Ships to the browser |
| -------------------------- | --------------------------------------------------- | -------------------- |
| `src/app/error.tsx`        | Anything thrown below the root layout, on any route | Yes                  |
| `src/app/global-error.tsx` | Failures in the root layout itself                  | Only when it renders |
| `src/app/not-found.tsx`    | Unmatched URLs                                      | No                   |

Before this version there was no `error.tsx`, `global-error.tsx` or `not-found.tsx`
anywhere under `src/app/`, which meant an error in any screen produced the framework's
default: a blank page in production, with no way back other than the browser's own
controls.

One boundary at the root rather than one per route group, deliberately. An error boundary
is a client component and is bundled into the initial JavaScript of every route it covers,
and `/dashboard`, `/calendar/[date]` and `/goals` are already over the 200 kB budget in
DF-A11Y-060 before it is added. A per-group boundary would cost that again for each group
and would have nothing different to say.

**No stack trace, error message or digest-free internal detail is rendered.** In a
production build Next.js replaces the message of a server-side error with a generic string
before it reaches the browser, but an error thrown _in_ the browser arrives intact, so a
boundary that renders `error.message` leaks internals on exactly the paths where it
matters. What is shown instead is the `digest` - a hash Next.js also writes to the server
log for the same error - as a reference the user can quote. Each boundary offers a retry
and a route out.

The boundaries do not report anywhere. They write one line to the browser console for a
developer with the console open, and that is all, because nothing collects a browser
console; see DF-OBS-007 in section 11.6 for what closing that gap would take.

### 11.6 Requirement status

| ID         | Status      | Evidence, or what is missing                                          |
| ---------- | ----------- | --------------------------------------------------------------------- |
| DF-OBS-001 | Met         | `src/lib/logger.ts`; shape asserted in `src/lib/logger.test.ts`       |
| DF-OBS-002 | Met         | Redaction rules in 11.1, with the caveat below                        |
| DF-OBS-003 | Met         | Identifiers pass through; asserted in the logger and route tests      |
| DF-OBS-004 | Met         | All three cron routes, including runs with nothing to do              |
| DF-OBS-005 | Met         | On the paths in 11.2. Errors carry stage, identifiers, code and stack |
| DF-OBS-006 | **Not met** | Needs a log drain to durable storage, which is a paid Vercel feature  |
| DF-CD-011  | **Not met** | Assessed in 11.7. Not achievable in-repo without an outside observer  |

Two caveats on DF-OBS-002, stated rather than glossed:

- **PostgreSQL `message` text is retained** while `DETAIL` is dropped. This is the right
  split in every case examined - Postgres names the constraint in the message and puts the
  offending values in DETAIL - but it is a property of Postgres's message formatting, not
  a guarantee this code can make. If a message is ever found carrying a value, add the key
  to the deny list in `src/lib/logger.ts` and add a test.
- **Stack traces are logged.** They contain file paths and function names, not user data,
  and DF-OBS-005 is unachievable without them.

One requirement is missing from section 8 and should be added when this document is next
revised, because there is currently no identifier to cite when explaining the gap:

> DF-OBS-007. Client-side errors SHOULD be recorded somewhere the operator can read.

It is unmet. Closing it means either a third-party error reporting service, or an
application endpoint that accepts error reports from the browser - which is an
unauthenticated write path and needs rate limiting and a threat model of its own before it
is built, not after.

### 11.7 DF-CD-011: alerting on a missed cron run

**Not implemented, and not implementable inside this repository alone.** The requirement in
[33 - CI/CD and Deployment Runbook](../05-engineering/33-cicd-and-deployment-runbook.md)
section 7 is that a missed run raises an alert. Detecting an event that did not happen
requires something outside the system that failed: an application that has stopped running
cannot report that it has stopped running, and a database that has been paused cannot
notice its own pause. No amount of logging changes that. What the `cron.run` line does is
make the _manual_ check take five seconds instead of a database session - and a manual
check is not an alert.

Three routes to closing it, none of which requires paid tooling:

| Option                                                                               | Cost                                                                                | Detects a paused project |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------ |
| External dead-man's switch: each run pings a monitor that emails when the ping stops | One environment variable, a few lines after the run log, one third-party account    | Yes                      |
| Scheduled GitHub Actions workflow calling a health endpoint                          | A workflow file; schedules are delayed and are disabled after repository inactivity | Yes                      |
| Heartbeat table in Postgres, checked by a later run                                  | A migration and a table; free and self-contained                                    | No                       |

**Recommendation: the external dead-man's switch.** It is the only one of the three that
catches the failure the free tier actually makes likely - a Supabase project paused for
inactivity, or a deployment that stopped being invoked - because it is the only observer
that is not inside the thing being observed. Free tiers of hosted cron monitors are
sufficient for three jobs. The trade is a third-party dependency and one outbound HTTPS
request per run carrying nothing but a job name, and that is a decision for the founder to
take deliberately rather than something to be smuggled in as part of a logging change,
which is why it is not implemented here. The place for it is immediately after the
`logCronRun` call in each route.

The heartbeat table is worth having as well, and for a different reason: it is the only one
of the three that can tell you _which_ run was missed after the fact, once Vercel's short
log retention has discarded the evidence.

Until one of them exists, the compensating control is the daily check in section 4 plus
the searches in section 11.4. That is a real control, and it is not what DF-CD-011 asks
for. The requirement stays open.

---

## Change History

| Version | Date       | Author  | Change                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0   | 2026-08-04 | Founder | Initial draft.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 0.2.0   | 2026-08-04 | Founder | Added section 11 recording what is implemented: the structured logger and its redaction rules, where it is wired, the meaning of the cron counts, how to search the logs, and the error boundaries. Recorded DF-OBS-006 and DF-CD-011 as unmet, with the reasons. Marked the uncollected signals in section 3 and the absence of any alerting in section 5. Made the log-reading steps in sections 7.1 and 7.4 specific. |
