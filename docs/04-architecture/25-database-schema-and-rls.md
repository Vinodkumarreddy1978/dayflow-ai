# 25 - Database Schema and Row Level Security

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-025 |
| Version      | 0.3.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The authoritative description of the database: tables, constraints, triggers, functions,
security policies and scheduled jobs. The executable form is in
[`supabase/migrations/`](../../supabase/migrations/); this document explains what each
piece is for and why it exists where it does.

## 2. Security model

**Every table has row level security enabled and at least one policy. A table without a
policy is a critical defect, not an oversight.**

This is not defence in depth in the ordinary sense - it is the primary access control.
Supabase exposes the database directly over HTTPS to browsers holding the anon key, so
"only our server writes to this table" is simply false. The database is the perimeter.

Every policy reduces to the same predicate:

```sql
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()))
```

`(select auth.uid())` rather than a bare `auth.uid()` is deliberate: wrapping it lets
PostgreSQL evaluate it once per query as an initplan instead of once per row, which is a
large difference on a range scan over a year of Moments.

| ID         | Requirement                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| DF-SEC-001 | RLS MUST be enabled on every table in the `public` schema.                                              |
| DF-SEC-002 | Every table MUST have explicit select, insert, update and delete policies.                              |
| DF-SEC-003 | No policy MUST permit access to a row whose `user_id` differs from the caller's.                        |
| DF-SEC-004 | Functions marked `security definer` MUST set an empty `search_path` and MUST filter by user themselves. |
| DF-SEC-005 | The service role key MUST be used only in cron handlers that legitimately span users.                   |

DF-SEC-004 addresses a real and well-known escalation path: a `security definer` function
with a mutable `search_path` can be tricked into executing an attacker's function of the
same name.

## 3. Enumerated types

```sql
create type moment_status as enum ('pending', 'completed', 'auto_closed');
create type moment_source as enum ('manual', 'quick_add', 'auto_close', 'import');
create type goal_period  as enum ('daily', 'weekly', 'monthly');
create type goal_direction as enum ('at_least', 'at_most');
create type goal_target_type as enum ('category', 'parent_category');
create type report_period as enum ('daily', 'weekly', 'monthly');
```

## 4. Tables

### 4.1 `profiles`

One row per user, created by trigger on signup. Holds display name, timezone-independent
account facts, and `subscription_tier` which defaults to `free` so that entitlement has a
home from day one, per section 7 of
[08 - Business Model and Pricing](../01-business/08-business-model-and-pricing.md).

### 4.2 `settings`

One row per user, one column per setting, exactly as specified in
[16 - PRD Settings and Customization](../02-product/16-prd-settings-and-customization.md).

Every setting carries a check constraint expressing its documented range, so that an
out-of-range value cannot be written by any client:

```sql
queue_limit integer not null default 2
  check (queue_limit between 1 and 5),
reminder_interval_minutes integer not null default 60
  check (reminder_interval_minutes between 10 and 480),
long_activity_warning_minutes integer not null default 180
  check (long_activity_warning_minutes between 60 and 720),
auto_close_minutes integer not null default 360
  check (auto_close_minutes between 120 and 1440),
constraint auto_close_after_warning
  check (auto_close_minutes > long_activity_warning_minutes),
```

The table-level `auto_close_after_warning` constraint implements DF-SET-009, which cannot
be expressed as a single-column check.

### 4.3 `parent_categories`

```sql
id                uuid primary key default gen_random_uuid(),
user_id           uuid not null references auth.users on delete cascade,
name              text not null check (char_length(trim(name)) between 1 and 50),
color             text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
icon              text,
is_system         boolean not null default false,
is_distraction    boolean not null default false,
sort_order        integer not null default 0,
unique (user_id, id),
unique (user_id, lower(name))
```

`unique (user_id, id)` is redundant as a uniqueness statement but is required as the target
of the composite foreign key from `categories`, which is what makes cross-user
misattachment structurally impossible.

Protection of the system parent category is enforced by trigger rather than by convention:

| ID         | Rule                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| DF-SEC-010 | A row with `is_system = true` MUST NOT be deleted, except while the account itself is. |
| DF-SEC-011 | `name` and `is_distraction` MUST NOT be changed on a system row.                       |
| DF-SEC-012 | `is_system` MUST NOT be set to true by a client.                                       |

DF-SEC-010 exempts no role, service role included. The single way past the refusal is
`public.delete_account()`, which raises a transaction-local `dayflow.account_deletion`
flag that the trigger checks; migration `0015` added both halves. Scoping the exemption to
one operation rather than granting it to a role is the narrower of the two designs, and
deliberately so: a role-based exemption would leave every statement the service role ever
runs able to destroy a system row, whereas this one is open only inside a deletion the
account holder asked for. Nothing a client can reach over the REST interface sets the
flag, so check 5 of section 9 continues to hold.

An exemption of some kind is not optional. The refusal fires inside the cascade from
`auth.users`, so while it was absolute, DF-PRV-021 could not be satisfied by any route at
all - not by the function, and not by an operator deleting the user from the Supabase
dashboard either. ADR-014 records the reasoning.

### 4.4 `categories`

```sql
id                  uuid primary key default gen_random_uuid(),
user_id             uuid not null references auth.users on delete cascade,
parent_category_id  uuid not null,
name                text not null check (char_length(trim(name)) between 1 and 50),
color               text check (color ~ '^#[0-9a-fA-F]{6}$'),
icon                text,
is_archived         boolean not null default false,
sort_order          integer not null default 0,
unique (user_id, id),
unique (user_id, lower(name)),
foreign key (parent_category_id, user_id)
  references parent_categories (id, user_id) on delete restrict
```

The `on delete restrict` implements DF-CAT-022.

### 4.5 `moments`

```sql
id                uuid primary key default gen_random_uuid(),
user_id           uuid not null references auth.users on delete cascade,
category_id       uuid not null,
start_at          timestamptz not null,
end_at            timestamptz,
duration_minutes  integer generated always as (
                    case when end_at is null then null
                    else floor(extract(epoch from (end_at - start_at)) / 60)::integer
                    end) stored,
status            moment_status not null default 'pending',
source            moment_source not null default 'manual',
note              text check (note is null or char_length(note) <= 500),
last_reminder_at  timestamptz,
warned_at         timestamptz,
created_at        timestamptz not null default now(),
updated_at        timestamptz not null default now(),

foreign key (category_id, user_id)
  references categories (id, user_id) on delete restrict,

constraint status_matches_end_at check (
  (status = 'pending' and end_at is null) or
  (status in ('completed','auto_closed') and end_at is not null)),

constraint end_after_start check (end_at is null or end_at > start_at),

constraint max_duration check (
  end_at is null or end_at - start_at <= interval '24 hours'),

constraint no_duplicate unique (user_id, category_id, start_at)
```

Four of the validation rules from
[11 - PRD Core Moments and Categories](../02-product/11-prd-core-moments-and-categories.md)
are expressible as constraints and are therefore enforced without any trigger: DF-MOM-010,
DF-MOM-013, DF-MOM-014 and the status consistency rule. Constraints are preferable to
triggers wherever possible because they cannot be bypassed and cost nothing.

### 4.6 `goals`, `ai_reports`, `ai_usage`, `push_subscriptions`, `feature_flags`

As described in [24 - Data Model and ERD](24-data-model-and-erd.md). `push_subscriptions`
enforces `unique (endpoint)` so that re-subscribing the same browser updates rather than
duplicates.

## 5. Triggers

### 5.1 Queue limit - `enforce_queue_limit`

The single most important trigger in the schema. Implements DF-QUE-001 through DF-QUE-005.

Fires `before insert or update on moments`. When the resulting row would be `pending`, it
counts the user's other pending Moments and compares against `settings.queue_limit`,
raising an exception with a recognisable error code when the limit would be exceeded.

Two details matter:

- It must exclude the row being updated from its own count, or closing and reopening a
  Moment would fail spuriously.
- It must raise a distinguishable `errcode`, so the client can translate it into the
  inline refusal experience of DF-UX-113 rather than a generic error.

DF-QUE-006 is satisfied naturally: lowering the limit does not touch existing rows, and the
trigger only prevents new pending Moments while over the limit.

### 5.2 Time validation - `validate_moment_times`

Implements the rules that need context beyond a single column: `start_at` no more than five
minutes in the future (DF-MOM-011), `end_at` under the same five-minute tolerance
(DF-MOM-012), and `start_at` not implausibly far in the past (DF-MOM-015).

Five minutes of future tolerance exists because client clocks drift, and refusing a Moment
because a phone is ninety seconds fast would be indefensible. The tolerance is applied to
`end_at` as well, which is marginally more permissive than DF-MOM-012 as written, and the
same drifting clock supplies both timestamps.

The past bound is a fixed ten years before now rather than DF-MOM-015's account creation
date minus 365 days. The looser bound still serves the purpose, which is catching a mistyped
year that would otherwise place a Moment in 1025; the divergence from the requirement is
unreconciled, and the requirement is the stricter of the two.

### 5.3 Status transitions - `sync_moment_status`

Keeps status consistent with the timestamps automatically: setting `end_at` on a pending
Moment promotes it to `completed`; setting `end_at` on an auto-closed Moment promotes it to
`completed`, implementing DF-MOM-022; clearing `end_at` returns it to `pending`, which then
passes through the queue limit trigger per DF-MOM-023.

The scheduled sweep is the exception. An update carrying `source = 'auto_close'` over a
pending Moment yields `auto_closed` rather than `completed`, so ADR-013's third status is
derived from the source rather than accepted from the caller - which is what allows `status`
to be a column no client is ever trusted to write. Closing a Moment also clears
`last_reminder_at` and `warned_at`, so reopening one restarts the reminder cadence instead of
resuming a stale one.

### 5.4 System category protection - `protect_system_parent_category`

Implements DF-SEC-010 through DF-SEC-012, and therefore DF-CAT-021 and DF-CAT-024.

`0008` creates the trigger; `0015` replaced the function it calls, so the delete branch
described in section 4.3 is the current one.

### 5.5 New user provisioning - `handle_new_user`

Fires `after insert on auth.users`. Creates the profile, the settings row, the six seeded
parent categories and the seventeen seeded categories, and writes the default
`productivity_weights` keyed by the newly created parent category identifiers.

All of it in one transaction, satisfying DF-CAT-040 and DF-UX-011. A user must never reach
the dashboard before their categories exist, and a partial seed would be worse than none.

### 5.6 `set_updated_at`

Maintains `updated_at` on every mutable table.

### 5.7 Goal target integrity - `validate_goal_target`

Fires `before insert or update on goals`. Confirms that `goals.target_id` names a row that
exists and belongs to the same user, looking in `categories` when `target_type` is `category`
and in `parent_categories` when it is `parent_category`, and raising a distinguishable
`errcode` when it finds nothing.

It is a trigger rather than a foreign key because the reference is polymorphic. DF-GOA-001
allows a goal against either a Category or a Parent Category, so `target_id` points into one
of two tables according to the row's own `target_type`, and a foreign key can name exactly
one referenced table. The alternative that would restore declarative integrity is two
nullable columns with a key each, plus a check constraint keeping exactly one of them
populated - which replaces one trigger with a constraint and spreads the target across the
unique constraint on `goals` and every query that reads one. The trigger is the cheaper of
the two, and this paragraph exists so that the absent foreign key reads as a decision rather
than an omission to be tidied away.

The ownership half of the check carries as much weight as the existence half. Existence alone
would accept a goal aimed at another user's category identifier. Row level security would
stop that goal from reading anything, because every analytics function filters by
`auth.uid()`, but the identifier would have been stored - and the `goals` policies cannot
catch it, since they only ever see the `goals` row itself. This trigger is the only thing
standing between the two tables.

What a real foreign key would additionally give, and this does not, is protection after the
fact: the trigger fires only on writes to `goals`, so deleting a Category that a goal targets
leaves the goal pointing at nothing. `get_goal_achieved` then matches no Moments and reports
zero achieved minutes rather than failing, which is why this has never surfaced as an error.
Nothing in the schema or the interface repairs it today, and a goal that reports zero forever
is indistinguishable, to the user, from one they are failing.

## 6. Functions

Aggregation lives in SQL, per DF-ANA-092.

The table is every function some caller names directly, whether that caller is the
browser, a route handler or a scheduled job. The trigger functions of section 5 are
deliberately absent: nothing names them, they are reached only by writing to the table they
guard, and listing them here would turn an interface into an inventory of internals. A
parameter in brackets carries a default and may be omitted.

| Function                                                                                         | Returns                                                                    | Security  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------- |
| `current_user_timezone()`                                                                        | `text`. The caller's timezone from `settings`, or `UTC` when none is set.  | `invoker` |
| `get_time_by_category(p_start, p_end[, p_grouping, p_include_estimated, p_include_distraction])` | `table`. Minutes per category or parent, midnight-split correctly.         | `invoker` |
| `get_daily_totals(p_start, p_end[, p_include_estimated])`                                        | `table`. Minutes per Local Day, for bars and heat maps.                    | `invoker` |
| `get_day_breakdown(p_date)`                                                                      | `table`. One day's Moments with category detail.                           | `invoker` |
| `get_goal_achieved(p_goal_id, p_start, p_end)`                                                   | `numeric`. Achieved minutes for a goal's target across the range.          | `invoker` |
| `get_streak(p_goal_id)`                                                                          | `table`. Current and longest streak.                                       | `invoker` |
| `get_productivity_score(p_date)`                                                                 | `numeric`. The score for a Local Day, or null if no data.                  | `invoker` |
| `get_period_facts(p_start, p_end)`                                                               | `jsonb`. The deterministic fact bundle the AI layer consumes.              | `invoker` |
| `get_period_facts_for_user(p_user_id, p_start, p_end)`                                           | `jsonb`. The same bundle for a named user. Service role only; `0014`.      | `definer` |
| `local_date_for_timezone(p_timezone[, p_offset_days])`                                           | `date`. The current Local Day in a given timezone, offset by whole days.   | `invoker` |
| `invoke_cron_endpoint(p_path)`                                                                   | `bigint`. Calls one of the application's cron endpoints; see section 7.    | `definer` |
| `delete_account()`                                                                               | `void`. Destroys the calling user and every row belonging to them; `0015`. | `definer` |

`get_goal_achieved` takes a start and an end rather than a single date because the period a
goal is measured over depends on `goals.period`, and resolving that belongs to the caller
that already holds the goal row.

Each analytics function resolves the timezone from `settings` through
`current_user_timezone()` rather than assuming UTC, so Local Day grouping is correct per
DF-MOM-042. `local_date_for_timezone` is the exception and deliberately so: the scheduled
job that calls it holds no session and is asking about a user other than itself, so it
passes the timezone in.

The interval-intersection expression that implements ADR-010's midnight split, given in
section 6 of [23 - System Architecture](23-system-architecture.md), is written out
separately in `get_time_by_category`, `get_daily_totals`, `get_day_breakdown`,
`get_goal_achieved` and `get_productivity_score`, clamped in each case to that function's
own boundaries. Only two functions build on another: `get_streak` calls
`get_goal_achieved`, and `get_period_facts` calls `get_daily_totals` and
`get_time_by_category`. Changing the split rule therefore means changing five bodies rather
than one, and keeping them in agreement is a convention rather than a property of the
schema.

Four functions in the schema are `security definer` rather than `security invoker`, and
each sets an empty `search_path` per DF-SEC-004: `handle_new_user` from section 5.5,
`invoke_cron_endpoint` from section 7, `get_period_facts_for_user`, which `0014` adds so
that a scheduled job can compute the fact bundle for a user whose session it does not
hold, and `delete_account`, which `0015` adds for DF-PRV-021. Three of the four appear in
the table; `handle_new_user` does not, because it is a trigger function. This paragraph
rather than the table is therefore the list check 6 of section 9 audits against.

## 7. Scheduled jobs

Registered with `pg_cron` in a migration, so schedules are version-controlled and
reproducible in any environment.

```sql
select cron.schedule('dayflow-reminders',  '*/10 * * * *', $$ ... $$);
select cron.schedule('dayflow-auto-close', '*/15 * * * *', $$ ... $$);
```

Each calls the corresponding application endpoint through `pg_net` with the
`Authorization: Bearer <CRON_SECRET>` header. The secret is read from Vault rather than
being written into the migration, so that the migration file is safe to commit.

## 8. Migration files

| File                                | Contents                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `0001_extensions_and_types.sql`     | Extensions and enumerated types                                          |
| `0002_profiles_and_settings.sql`    | `profiles`, `settings`, constraints                                      |
| `0003_categories.sql`               | `parent_categories`, `categories`                                        |
| `0004_moments.sql`                  | `moments`, constraints, indexes                                          |
| `0005_goals.sql`                    | `goals`                                                                  |
| `0006_ai_and_push.sql`              | `ai_reports`, `ai_usage`, `push_subscriptions`, `feature_flags`          |
| `0007_rls_policies.sql`             | RLS enablement and every policy                                          |
| `0008_triggers.sql`                 | Every trigger, and each trigger function as first written                |
| `0009_seed_new_user.sql`            | `handle_new_user` and the seed data                                      |
| `0010_analytics_functions.sql`      | Aggregation functions                                                    |
| `0011_scheduled_jobs.sql`           | `pg_cron` registrations                                                  |
| `0012_realtime.sql`                 | Publication membership and `replica identity full`                       |
| `0013_seed_new_user_timezone.sql`   | Records the sign-up timezone on the seeded settings row                  |
| `0014_scheduled_report_support.sql` | Service-role-only period facts for a named user, and a local-date helper |
| `0015_account_deletion.sql`         | `delete_account`, and the system category guard narrowed to permit it    |

Forward-only, applied in order, never edited after reaching production, per section 4 of
[05 - Versioning and Release Policy](../00-governance/05-versioning-and-release-policy.md).

A trigger is bound to its function by name and resolves it at call time, so replacing the
function does not disturb the trigger that created it. `0013` replaces `handle_new_user`
from `0009`, and `0015` replaces `protect_system_parent_category` from `0008`. `0008` is
therefore still where every trigger is declared, but no longer always where the current
body of its function is - which is the ordinary consequence of the forward-only rule, not
a sign that something drifted.

`0012` is easy to mistake for optional. Adding the tables to the `supabase_realtime`
publication is only half of it: without `replica identity full`, a DELETE payload carries
only the primary key, so it never matches the `user_id` filter the client subscribes with
and deletions never reach a second device.

## 9. Verification

Before any release:

1. Every table in `public` reports `rowsecurity = true`.
2. Every table has at least four policies.
3. Signing in as user A and querying every table returns nothing belonging to user B.
4. A direct REST insert exceeding the queue limit is rejected.
5. A direct REST attempt to delete the system parent category is rejected.
6. Every `security definer` function has an empty `search_path`.

Checks 3, 4 and 5 are performed against the REST endpoint rather than through the
application, because the application is not the threat model.

---

## Change History

| Version | Date       | Author  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.2.0   | 2026-08-04 | Founder | Added migrations `0012` to `0014` to section 8, with a note on why `replica identity full` matters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.3.0   | 2026-08-04 | Founder | Added `0015` to section 8 and noted that a replaced trigger function outlives the migration that declared the trigger. Corrected DF-SEC-010, which described a service role exemption that was never implemented, to the account-deletion exemption `0015` actually added. Reconciled section 6 against the migrations: `get_goal_progress` does not exist and is now `get_goal_achieved` with its real signature, the parameters omitted from `get_time_by_category` and `get_daily_totals` were restored, `current_user_timezone`, `get_period_facts_for_user`, `local_date_for_timezone`, `invoke_cron_endpoint` and `delete_account` were added, every row now states its security clause and the `security definer` functions are named so that check 6 of section 9 can be audited from this document, and the claim that the midnight-split expression appears in one function was corrected to the five that contain it. Added section 5.7 for `validate_goal_target`, the polymorphic goal target check section 5 omitted entirely, and corrected section 5 where it under-described the triggers it did cover: the five-minute future tolerance applies to `end_at` as well as `start_at`, the past bound is a fixed ten years rather than DF-MOM-015's account-relative one, and `sync_moment_status` derives `auto_closed` from the source and clears the reminder fields on close. |
