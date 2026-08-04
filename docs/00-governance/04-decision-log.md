# 04 - Decision Log

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-004 |
| Version      | 0.3.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

Every significant architectural and product decision, with the reasoning that produced
it, the alternatives that were rejected, and the conditions under which it should be
revisited. A decision recorded without its rationale cannot be safely reversed later,
because nobody can tell whether the circumstances that justified it still hold.

Format: Architecture Decision Records, numbered sequentially, never renumbered. A
reversed decision keeps its record and gains a superseding one.

| ID      | Decision                                          | Status   |
| ------- | ------------------------------------------------- | -------- |
| ADR-001 | Cloud persistence instead of local storage        | Accepted |
| ADR-002 | Next.js full stack instead of Spring Boot + React | Accepted |
| ADR-003 | Supabase as the backend platform                  | Accepted |
| ADR-004 | Business rules enforced in the database           | Accepted |
| ADR-005 | Pin Next.js 15 rather than adopt 16               | Accepted |
| ADR-006 | Pin TypeScript 5.9 rather than adopt 7.0          | Accepted |
| ADR-007 | No third-party component library                  | Accepted |
| ADR-008 | pg_cron for frequent jobs, Vercel Cron for daily  | Accepted |
| ADR-009 | The queue refuses rather than warns               | Accepted |
| ADR-010 | Overnight Moments split at midnight               | Accepted |
| ADR-011 | Statistics are deterministic; AI only narrates    | Accepted |
| ADR-012 | Installable PWA instead of native applications    | Accepted |
| ADR-013 | Auto-closed is a distinct status                  | Accepted |
| ADR-014 | Account deletion by security definer function     | Accepted |
| ADR-015 | The bundle budget gate names the routes it excuses | Accepted |

---

## ADR-001 - Cloud persistence instead of local storage

**Status:** Accepted, 2026-08-04

### Context

The product began as a browser-local idea using `localStorage`, which needs no account,
no server and no running cost. Two requirements emerged that it cannot satisfy: the data
must not be lost, and the same account must work across a phone and a laptop.

`localStorage` is genuinely fragile for data the user cares about. It is cleared by
"clear browsing data", by browser storage pressure eviction, by private browsing, and by
switching browsers or devices. There is no recovery path: the data is simply gone, with
no warning and no backup. For a dataset built up over months of daily discipline, one
accidental cache clear destroys the entire value of the product.

### Decision

Persist all user data in a hosted PostgreSQL database behind authentication, with
multi-device synchronisation. Local storage is used only for UI preferences and an
offline read cache, never as the system of record.

### Consequences

- Authentication becomes mandatory, adding signup friction before any value is seen.
- The product requires network connectivity to write. Offline write queuing is
  post-1.0.
- Running cost is no longer strictly zero, though it is zero at current scale.
- Data survives device loss, browser resets and platform changes.
- Row level security must be correct from the first migration, since the data is now
  reachable over a network.

### Alternatives rejected

**Local-first with optional cloud sync (for example IndexedDB plus a sync engine).**
Genuinely attractive - instant, offline, private by default. Rejected because building
correct bidirectional sync with conflict resolution is one of the hardest problems in
client engineering, and it would consume more effort than the entire rest of the
product. Revisit if offline capture becomes a top user request.

**File export and import as the backup mechanism.** Depends on the user remembering to
export, which is exactly the kind of discipline the product exists to compensate for.

### Revisit when

Offline capture becomes a frequent request, or hosting cost becomes material.

---

## ADR-002 - Next.js full stack instead of Spring Boot + React

**Status:** Accepted, 2026-08-04

### Context

The realistic options were a single TypeScript application (Next.js), a Java backend
with a separate React frontend (Spring Boot 3), or a hybrid. This is the highest-cost
decision to reverse, so it is documented at length.

### Decision

A single Next.js 15 application in TypeScript, containing the user interface, the API
routes and the scheduled job handlers.

### Reasoning

**The shape of the problem.** DayFlow AI is approximately 85% user interface, data
shaping and visualisation. Its server side is CRUD over eight tables plus a scheduler.
Spring Boot's genuine strengths - declarative transaction management, JPA over complex
schemas, batch processing, enterprise messaging, and layering that keeps a large team
from colliding - are answers to problems this product does not have. Adopting it would
mean paying the ceremony cost (entity, DTO, mapper, repository, service, controller for
every field) while collecting none of the benefit.

**The runtime model, which is decisive.** Spring Boot is a stateful, always-on JVM
process. A cold JVM needs roughly 10 to 40 seconds to serve its first request. DayFlow
is opened in short bursts many times a day - precisely the pattern that cold starts
ruin, and precisely the pattern that free and cheap container hosting punishes, because
those tiers sleep idle containers. Avoiding that requires a paid always-on instance from
day one. Next.js on serverless infrastructure has cold starts around 50 milliseconds and
needs nothing kept awake.

**The two-codebase tax.** Spring Boot is a backend only. A React frontend would still
have to be written in full. Every new field on a Moment would then require a Java
entity, a DTO, a mapper, a repository method, a controller change, an OpenAPI update, a
TypeScript type, a form change and a chart change. In the chosen stack it is one type,
one Zod schema and one migration.

**Feature leverage.** Multi-device sync is a first-class requirement. Supabase Realtime
delivers it in a few lines with row level security already applied. In Spring it means
hand-building WebSocket topics, per-user authorisation, reconnection and backfill - some
weeks of work and a permanent source of subtle bugs. The same applies to authentication.

**Maintainer familiarity, which did not apply.** The strongest argument for Spring Boot
is "the people maintaining this write Java". Development here is AI-assisted with founder
review rather than hand-written Java, so that argument carries no weight. Had the
founder been maintaining the code personally in Java, this decision could reasonably
have gone the other way - familiarity beats theoretical fit more often than architects
like to admit.

**Reversibility, the tie-breaker.** Supabase is standard PostgreSQL, not a proprietary
store. A Spring Boot service can be attached to the very same database later if the
product ever needs heavy JVM-side processing. Choosing Next.js keeps Spring available;
choosing Spring would not have kept this option as cleanly. When two candidates are
close, prefer the one that is easier to walk back.

### Consequences

- One language across the whole stack; types are shared rather than mirrored.
- Heavy CPU-bound work would be awkward and would need a separate service.
- The team is tied to the JavaScript ecosystem's release pace, mitigated by ADR-005.

### Conditions that would have favoured Spring Boot

Recorded so the judgement can be reused: complex multi-step transactional workflows;
integration with enterprise systems such as LDAP, SAP or ServiceNow; a Java-fluent team;
regulatory constraints demanding on-premises deployment; or CPU-intensive server-side
computation.

### Revisit when

Server-side processing becomes CPU-bound, or the product grows a team that is
predominantly Java-fluent.

---

## ADR-003 - Supabase as the backend platform

**Status:** Accepted, 2026-08-04

### Context

The chosen stack still needs a database, authentication, realtime transport and file
storage. Assembling these from separate providers means separate accounts, separate
failure modes and glue code between them.

### Decision

Supabase for PostgreSQL, Auth, Realtime and Storage.

### Consequences

- Authentication, per-row authorisation and cross-device sync arrive together and share
  one identity model. `auth.uid()` inside an RLS policy is the same identity the client
  authenticated with, so authorisation is expressed once, in the database.
- Standard PostgreSQL underneath, so `pg_cron`, generated columns, triggers, materialised
  views and window functions are all available.
- The free tier pauses projects after a week of inactivity, which is acceptable for a
  personal product and would not be for a commercial one.
- A platform dependency exists, bounded by the fact that the data itself is plain
  PostgreSQL and can be dumped and moved.

### Alternatives rejected

**Firebase / Firestore.** Excellent realtime and push, but a document model that fits
this data badly. DayFlow's core queries are time-range aggregations and grouped rollups -
natural in SQL, awkward and expensive in Firestore, which bills per document read.

**Neon or PlanetScale plus a separate auth provider.** More flexible and more assembly
required, with no benefit at this scale.

### Revisit when

The free tier's pause behaviour becomes user-visible, or costs exceed roughly $25/month.

---

## ADR-004 - Business rules enforced in the database

**Status:** Accepted, 2026-08-04

### Context

The queue limit, time-ordering validation and duplicate prevention could live purely in
the client. They cannot be trusted there. A second device, a stale browser tab, a
replayed request or a direct API call would all bypass them - and Supabase deliberately
exposes the database over HTTP, so "the client is the only way in" is simply false here.

### Decision

Every invariant is enforced by a PostgreSQL constraint or trigger. The client enforces
the same rules a second time, for immediate feedback rather than for safety.

### Consequences

- Rules cannot be bypassed by any client, present or future.
- Rules are stated twice, in SQL and in TypeScript, which is genuine duplication. It is
  accepted deliberately: the TypeScript copy exists for user experience, the SQL copy for
  correctness, and unit tests assert the two agree.
- Violations surface as database errors and must be translated into readable messages.

### Alternatives rejected

**Application-only validation.** Fails the multi-device requirement that motivated ADR-001.

**Database-only validation.** Correct but produces a poor experience - the user learns
they have hit the queue limit only after a network round trip and an error dialog.

---

## ADR-005 - Pin Next.js 15 rather than adopt 16

**Status:** Accepted, 2026-08-04

### Context

Next.js 16.3.0 is the current stable release. The initial codebase is being written
without a local Node.js toolchain, meaning no build, lint or test run can verify it
before it reaches a machine that has one.

### Decision

Depend on `next@^15.5.22` and React 19.2 for the initial build.

### Reasoning

Code written blind must target APIs whose behaviour is settled and widely documented.
The value of being one major version newer is small; the cost of an unverifiable
codebase built on less familiar APIs is high. Upgrading later, on a machine that can
actually run the build, is a contained and testable exercise.

### Revisit when

The project builds and tests successfully on a developer machine. Upgrading to 16 is
then a normal dependency task with a working safety net.

---

## ADR-006 - Pin TypeScript 5.9 rather than adopt 7.0

**Status:** Accepted, 2026-08-04

### Context

TypeScript 7.0 is the native-port compiler and is published as `latest`. Its ecosystem
compatibility - particularly with `eslint-config-next` and the Next.js compiler plugin -
is still settling.

### Decision

Depend on `typescript@^5.9.0`.

### Reasoning

Same as ADR-005. The toolchain must be boring while the product is not yet verifiable.

### Revisit when

Next.js 15 or 16 documents TypeScript 7 as supported and the lint stack follows.

---

## ADR-007 - No third-party component library

**Status:** Accepted, 2026-08-04

### Context

shadcn/ui, Radix, Material UI and similar libraries would accelerate the interface.
shadcn/ui in particular requires a CLI that generates files, which cannot run here.

### Decision

Hand-build a small component kit on Tailwind: buttons, inputs, selects, modals,
switches, tabs, cards, toasts.

### Consequences

- Fewer dependencies, fewer version conflicts, a smaller bundle, and total control over
  behaviour.
- More code to write, and accessibility must be implemented deliberately rather than
  inherited - focus trapping, escape handling and ARIA are specified in
  [22 - Accessibility and Responsive Standards](../03-ux/22-accessibility-and-responsive-standards.md)
  and are a real, recurring cost.
- Complex widgets such as combo boxes are more expensive to build.

### Revisit when

A genuinely complex widget is needed. Adopting Radix for that one primitive is
preferable to adopting an entire design system.

---

## ADR-008 - pg_cron for frequent jobs, Vercel Cron for daily

**Status:** Accepted, 2026-08-04

### Context

Reminders need evaluation roughly every ten minutes. Vercel's Hobby plan permits cron
jobs no more often than once per day, so it cannot drive the reminder engine.

### Decision

Frequent jobs - reminder evaluation and auto-close - are scheduled by `pg_cron` inside
Supabase, which calls the application's cron endpoints over HTTP with a shared secret.
The daily AI report job stays on Vercel Cron.

### Consequences

- Two scheduling mechanisms, which is a small amount of extra documentation.
- No paid hosting tier is required for the product's signature feature.
- Schedules live in a migration and are therefore version-controlled and reproducible.

### Alternatives rejected

**Upgrading to Vercel Pro purely for cron frequency.** A recurring cost for something
the database already does.

**Client-side scheduling.** Only fires when the application is open, which is precisely
when the user does not need reminding.

---

## ADR-009 - The queue refuses rather than warns

**Status:** Accepted, 2026-08-04

### Context

Exceeding the queue limit could produce a warning that the user may override, or a hard
refusal.

### Decision

A hard refusal. Creating a Moment while the limit is reached fails, with a message
naming the pending Moments and offering to close one.

### Reasoning

A dismissible warning becomes invisible within a week - this is the reliable fate of all
soft limits. The bounded queue is the mechanic that keeps the dataset honest, as argued
in [02 - Product Charter](02-product-charter.md) section 5.2. A constraint that can be
clicked through is not a constraint.

The escape hatch is configuration, not override: a user who genuinely needs three
concurrent Moments raises the limit in settings, which is a deliberate act rather than a
reflexive dismissal.

### Consequences

- Occasionally obstructive, by design.
- Requires the refusal message to be genuinely helpful, offering the fix inline.

---

## ADR-010 - Overnight Moments split at midnight

**Status:** Accepted, 2026-08-04

### Context

A Moment from 22:30 to 01:30 must be attributed to a day for daily totals, streaks and
goals.

### Decision

Split at local midnight and attribute each part to its own Local Day.

### Reasoning

Attributing the whole Moment to its start day is simpler but produces visibly wrong
output for anyone who works late or sleeps normally: an eight-hour sleep beginning at
23:00 would render as an eight-hour block on the previous day and leave the following
morning empty.

### Consequences

- Aggregation queries must handle interval intersection rather than simple grouping.
- A single Moment may appear in two daily charts, which is correct but needs explaining
  in the interface.
- Sleep tracking behaves sensibly by default.

---

## ADR-011 - Statistics are deterministic; AI only narrates

**Status:** Accepted, 2026-08-04

### Context

An AI model could be handed raw Moments and asked to produce both the numbers and the
narrative.

### Decision

All totals, averages, comparisons and trends are computed in code. The AI receives
pre-computed statistics and produces only language and recommendations.

### Reasoning

Language models make arithmetic errors. A productivity product that misreports the
user's own hours has no route back to trust - the user cannot verify the numbers
independently, which is the entire reason they are using it. Separating the layers also
means every analytic feature works with AI disabled, at zero cost, and that AI prompts
stay small and cheap because they carry summaries rather than thousands of rows.

### Consequences

- The AI cannot surface a pattern that the deterministic layer did not compute, so new
  insight types need code, not just prompt changes.
- Analytics remain fully functional with `AI_ENABLED=false`.

---

## ADR-012 - Installable PWA instead of native applications

**Status:** Accepted, 2026-08-04

### Context

The product must feel like an application on a phone, including notifications.

### Decision

Ship a Progressive Web App with a service worker and Web Push. No native builds in 1.0.

### Consequences

- One codebase, no app store review, instant releases, no developer programme fees.
- iOS requires the user to add the app to the Home Screen before Web Push works, which
  is real onboarding friction and must be handled explicitly in the interface.
- No widgets, no Shortcuts integration, no background OS-level tracking.

### Revisit when

iOS push friction demonstrably costs users, or OS integration becomes a differentiator.

---

## ADR-013 - Auto-closed is a distinct status

**Status:** Accepted, 2026-08-04

### Context

When the auto-close threshold fires, the Moment could simply be marked completed.

### Decision

Store `status = 'auto_closed'` as a third state, distinct from `completed`.

### Reasoning

The end time of an auto-closed Moment is a system guess, and the product must never
present a guess with the same confidence as a fact. Keeping the distinction lets the
interface flag it for correction, lets analytics optionally exclude estimated data, and
lets the product measure how often users forget - which is itself a useful signal about
whether the reminder cadence is working.

### Consequences

- Every query filtering on completion must consider both statuses; a helper predicate
  exists so this is not repeated by hand.
- Editing the end time of an auto-closed Moment promotes it to `completed`.

---

## ADR-014 - Account deletion by security definer function

**Status:** Accepted, 2026-08-04

### Context

DF-PRV-021 requires account deletion to remove every row across every table, including
the `auth.users` record. The `authenticated` role cannot write to `auth.users`, so
something holding more privilege than the session has to perform that last delete.
There are two ways to reach it, and both widen the set of code that is capable of
destroying an account.

The first is the service role key, which bypasses row level security entirely. An
ESLint rule confines `src/lib/supabase/admin.ts` to `src/app/api/cron/`, where the
handlers legitimately act across users. The second is a `security definer` function,
which runs as its owner and can therefore delete a row the caller could not.

No existing record covers that ESLint confinement, which is part of why the question
could not be settled inside a feature branch.

### Decision

Account deletion is performed by `public.delete_account()`, a `security definer`
function taking no arguments, invoked over RPC by the authenticated user whose account
is being deleted. The service role key is not involved, and the confinement of
`src/lib/supabase/admin.ts` to `src/app/api/cron/` stands unchanged.

### Reasoning

**Blast radius, which is the whole argument.** The service role key bypasses row level
security for every user, not merely for the caller. Reaching it from a user-facing
route means a defect in that route - a mixed-up identifier, a missing filter, a value
taken from the request body - is a whole-database defect rather than a one-account
defect. A `security definer` function that derives its subject from `auth.uid()` and
accepts no arguments cannot be aimed. However wrong the calling code is, the only
account it can destroy is the one whose session made the call.

**The confinement is a boundary, not a preference.** The ESLint rule exists so that the
reach of the service role key is answerable by grep: every use of it sits under
`src/app/api/cron/`, and a reviewer can enumerate them in seconds. That property
survives only while nothing else needs the key. Spending it on account deletion would
buy nothing the database cannot do more safely, and would cost the one guarantee that
makes the key auditable at all. This record states, for the first time in writing, that
the confinement is a deliberate architectural boundary rather than a lint setting to be
relaxed when it becomes inconvenient.

**Where the rule belongs.** Deletion is a per-user operation whose correctness is
entirely a question of identity, which is exactly the class of rule ADR-004 places in
the database, and for the same reason: the client is not the only way in.

### Consequences

- `security definer` is itself a privilege escalation and must be written as one. The
  function sets an empty `search_path`, per DF-SEC-004 and check 6 of section 9 of
  [25 - Database Schema and RLS](../04-architecture/25-database-schema-and-rls.md), so
  that it cannot be induced into calling an attacker's function of the same name; it
  takes no arguments, so nothing can redirect its subject; and `execute` is revoked
  from `anon` and granted to `authenticated`, so only a real session reaches it.
- Row level security does not apply to the function's owner, so the function filters by
  `auth.uid()` itself. That filter is not a second line of defence; it is the only one.
- The system category group guard in `0008` refused every delete of a row with
  `is_system = true`. That refusal fires inside the cascade from `auth.users`, which
  made DF-PRV-021 unsatisfiable by any route at all, including an operator deleting the
  user from the Supabase dashboard. `0015` narrows the guard to the life of the account.
- The caller's access token remains valid until it expires, because removing the row
  does not invalidate a token already issued. The interface must sign the user out
  immediately after the call rather than waiting for the next request to fail.
- Deletion is irreversible from inside the product, as DF-PRV-022 requires, but the
  seven days of point-in-time recovery recorded in section 8 of
  [35 - Privacy and Data Protection](../06-operations/35-privacy-and-data-protection.md)
  mean an operator can still recover the rows during that window. The confirmation copy
  must not claim more than the retention table already states.
- No one can delete an account on a user's behalf through the application. That is the
  intent of DF-PRV-024 rather than a limitation of it.

### Alternatives rejected

**The service role key from a user-facing route, widening the ESLint rule.** The
smallest change and the largest exposure. It converts a boundary that can be verified
by grep into one that has to be verified by reading every route importing the admin
client, and it places a key that ignores row level security one defect away from a
request body.

**A Supabase Edge Function holding the service role key.** Genuinely better than the
previous option: the key leaves the Next.js application and the ESLint rule survives
intact. Rejected because the key still bypasses row level security for every user, so
the blast radius is unchanged and the risk has been relocated rather than reduced. It
also adds a second deployment target, a second secret store and a second runtime to a
product that has one of each, in exchange for a single function.

**Deleting the `public` rows and leaving `auth.users` in place.** Needs no elevated
privilege at all, and fails DF-PRV-021 on its face. It also leaves the email address
registered, so the user can neither sign up again with it nor be said in any meaningful
sense to have left.

### Revisit when

Deletion needs to reach something the caller's own identity does not describe - files
in Storage, or sessions held on other devices - or Supabase offers a first-class
self-service deletion endpoint, at which point this function becomes a thin wrapper or
disappears.

---

## ADR-015 - The bundle budget gate names the routes it excuses

**Status:** Accepted, 2026-08-04

### Context

DF-CD-004 requires CI to fail on a route exceeding the "Initial JavaScript, gzipped"
budget of 200 kB in section 9 of
[22 - Accessibility and Responsive Standards](../03-ux/22-accessibility-and-responsive-standards.md).
`scripts/check-bundle-budget.mjs` has existed for some time, has an npm alias, and
appeared nowhere in `.github/workflows/ci.yml`. The requirement was therefore enforced by
nobody, and section 3 of
[33 - CI/CD and Deployment Runbook](../05-engineering/33-cicd-and-deployment-runbook.md)
said so in as many words.

Wiring the script in as written would have failed on its first run. `/insights` was 217 kB
because it imported a Zod schema as a runtime value rather than as a type, which is fixed
in the same change and takes it to 199 kB. Three routes remain over: `/dashboard`,
`/calendar/[date]` and `/goals`, between 202 and 204 kB. They are over for one shared
reason - each pulls the Supabase browser client, with its auth and realtime code, into
First Load JS - and reducing it means changing how authenticated routes read data, which
is architectural work with its own record to write. It is not something a contributor can
do in passing on the way to an unrelated change.

This repository's CI has never executed. A gate that is red on its first run, and on every
pull request after it, for a reason no pull request can address, does not get satisfied. It
gets deleted, or it gets ignored while still red, which is worse: it spends the credibility
of every other job in the workflow.

### Decision

The check runs as a step in the existing `verify` job, immediately after the type check,
parsing the route table that the build step has already captured to `build-output.txt`. It
fails on any route above 200 kB, with the exception of three routes named individually in
an `ALLOWANCES` list in the script, each carrying as its ceiling the size it had on the day
the gate was added.

Four things therefore fail the build: a new route over budget, an existing route crossing
the budget, one of the three named routes growing past its recorded size, and an allowance
that is no longer needed - its route now comfortably within budget, or gone from the table
altogether.

### Reasoning

**The list is a debt register, not a second budget.** The budget stays at 200 kB, in one
place, for every route. What the allowances record is that three named routes are known to
breach it, by how much, and since when. That is a different statement from "the budget is
206 kB for `/dashboard`", and the distinction is the whole reason the entries carry route
names and ceilings rather than the budget being raised.

**Ceilings, not bare names.** An exemption that only records membership lets `/dashboard`
drift from 204 kB to 260 kB unchallenged, which is how every allow-list of this kind fails.
Recording the current size means the three routes are frozen where they are: they may be
fixed, but they may not get worse.

**Failing when an exemption stops being needed.** This is the mechanism that stops the list
outliving its cause. Once the Supabase read path changes and `/dashboard` comes in under
budget, the check fails and says to delete the entry. A build that fails because something
improved is mildly annoying and the fix is deleting two lines; the alternative is an
allow-list that quietly becomes the standard, which is the outcome this record exists to
prevent.

**Margins, because the check cannot be tried before it runs.** The ceilings carry one to
two kB above the measured figure, and an allowance is called obsolete only once its route
is at least 2 kB under budget. These sizes move by a few hundred bytes between platforms
and Node versions - the measurements here were taken on Windows with Node 24, and CI runs
Linux with Node 20 - and a gate that fails on a rounding difference teaches people to
distrust the gate rather than to read it.

### Consequences

- DF-CD-004 is enforced for every route except three, which are enumerated in code where a
  reader can find them, rather than in prose where they were previously not recorded at all.
- The three known breaches now have a home that forces a decision when they are fixed.
- The budget number is still stated once, in
  [22 - Accessibility and Responsive Standards](../03-ux/22-accessibility-and-responsive-standards.md),
  and copied once, in the script. Changing it remains a decision to be recorded here, not
  an edit to make a build green.
- The step costs no build time: it reads a log the build already produced.
- **The workflow has not been executed.** Git was not installed on the machine this was
  written on and CI has never run, so the YAML and the script were verified by reading and
  by running the script against a local build only. The first real run should be watched.

### Alternatives rejected

**A warning step now, hardened to a gate later.** Honest about the state of the repository,
and the obvious answer. Rejected because it enforces nothing in the meantime: the very
regression this change fixes - a Zod schema imported as a value, 18 kB, one route - would
have produced a green build with a warning buried in a long log. Worse, the plan to harden
it depends on the three routes being fixed first, so the interim state would have lasted as
long as the architectural work does. A warning that has been ignored for months is not
upgraded to a gate; it is normalised. The script's own header already argues that a budget
living only in a document is a budget nobody keeps, and a warning is that document.

**A hard gate with no allowances.** What DF-CD-004 asks for literally, and correct in
principle. Rejected on timing rather than principle: it would make the first CI run red for
a cause no author of a pull request could fix, on a repository with no green run to compare
against. When the three routes are fixed, this is what the check becomes, by deletion.

**Raising the budget to 210 kB.** Rejected without much deliberation. The figure is a
performance commitment to the user, it would have to change in
[22](../03-ux/22-accessibility-and-responsive-standards.md) as well, and changing a
measurement because the result is inconvenient is not a decision about performance at all.

**A separate job that rebuilds in order to measure.** Isolates the failure, at the cost of
four minutes of duplicated build for a number the `verify` job has already printed.

### Revisit when

The Supabase client stack is no longer in every authenticated route's First Load JS. Every
allowance should then be deleted, and the check will insist on it.

---

## Change History

| Version | Date       | Author  | Change                                                                                                                                                                                      |
| ------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft with ADR-001-013.                                                                                                                                                             |
| 0.2.0   | 2026-08-04 | Founder | Added ADR-014, which routes account deletion through a `security definer` function rather than the service role key, and records the service role confinement as an architectural boundary. |
| 0.3.0   | 2026-08-04 | Founder | Added ADR-015, which enforces DF-CD-004 in CI with three named routes held at their current sizes rather than as a warning or as a gate that fails on arrival.                              |
