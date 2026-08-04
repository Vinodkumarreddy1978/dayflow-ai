-- =============================================================================
-- DayFlow AI - complete database schema, all migrations in one file
--
-- GENERATED FILE. Rebuild it with `npm run db:bundle`; do not edit it directly.
-- It is supabase/migrations/*.sql concatenated in filename order, 0001 through
-- 0015. An edit made here is lost the next time it is rebuilt, and worse, it
-- silently disagrees with the migration it came from.
--
-- Who this is for. It exists for people applying the schema through the Supabase
-- dashboard SQL editor, so that the whole schema can be pasted once instead of
-- 15 times in the right order. If you have the Supabase CLI, run
-- `supabase db push` instead and ignore this file.
--
-- It is safe to run as a whole, and safe to re-run: the migrations are written to
-- be idempotent wherever that is practical. If some of them are already applied
-- to a live project, running the whole file again is still the safe option -
-- never edit an applied migration, because it will not re-run and the live schema
-- and this repository will quietly stop agreeing.
--
-- IMPORTANT - migration 0011. It registers the pg_cron jobs for reminders and
-- auto-close, and it reads two secrets from Supabase Vault, `dayflow_app_url` and
-- `dayflow_cron_secret`. If those secrets do not exist yet, 0011 emits a warning
-- and carries on; scheduled reminders simply will not fire until the secrets are
-- added. That is expected and is not an error. See step 7 of the README for how to
-- create them.
-- =============================================================================


-- ===== 0001_extensions_and_types.sql =====

-- =============================================================================
-- 0001 - Extensions and enumerated types
-- Reference: docs/04-architecture/25-database-schema-and-rls.md section 3
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- Moment lifecycle. `auto_closed` is deliberately distinct from `completed`
-- because its end time is a system estimate, not a fact recorded by the user.
-- See ADR-013 in docs/00-governance/04-decision-log.md.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'moment_status') then
    create type public.moment_status as enum ('pending', 'completed', 'auto_closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'moment_source') then
    create type public.moment_source as enum ('manual', 'quick_add', 'auto_close', 'import');
  end if;

  if not exists (select 1 from pg_type where typname = 'goal_period') then
    create type public.goal_period as enum ('daily', 'weekly', 'monthly');
  end if;

  -- `at_most` goals are what make distraction targets first-class:
  -- "at most 30 minutes of social media per day" is as valid as "at least 60 of gym".
  if not exists (select 1 from pg_type where typname = 'goal_direction') then
    create type public.goal_direction as enum ('at_least', 'at_most');
  end if;

  if not exists (select 1 from pg_type where typname = 'goal_target_type') then
    create type public.goal_target_type as enum ('category', 'parent_category');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_period') then
    create type public.report_period as enum ('daily', 'weekly', 'monthly');
  end if;
end
$$;


-- ===== 0002_profiles_and_settings.sql =====

-- =============================================================================
-- 0002 - Profiles and settings
-- Reference: docs/02-product/16-prd-settings-and-customization.md
--            docs/04-architecture/25-database-schema-and-rls.md section 4
-- =============================================================================

create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text check (display_name is null or char_length(trim(display_name)) between 1 and 60),
  -- Entitlement has a home from the first migration so that introducing a paid
  -- tier later is a check rather than a schema change.
  subscription_tier  text not null default 'free' check (subscription_tier in ('free', 'pro')),
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user. Created by the handle_new_user trigger at signup.';

-- One wide row per user rather than a key-value table: types are enforced by the
-- column, ranges by check constraints, and reading every setting is a single row.
create table if not exists public.settings (
  user_id                        uuid primary key references auth.users (id) on delete cascade,

  -- Queue and reminders --------------------------------------------------------
  queue_limit                    integer     not null default 2
    check (queue_limit between 1 and 5),
  reminders_enabled              boolean     not null default true,
  reminder_interval_minutes      integer     not null default 60
    check (reminder_interval_minutes between 10 and 480),
  long_activity_warning_minutes  integer     not null default 180
    check (long_activity_warning_minutes between 60 and 720),
  auto_close_enabled             boolean     not null default true,
  auto_close_minutes             integer     not null default 360
    check (auto_close_minutes between 120 and 1440),
  quiet_hours_enabled            boolean     not null default false,
  quiet_hours_start              time        not null default '22:00',
  quiet_hours_end                time        not null default '07:00',

  -- Validation -----------------------------------------------------------------
  overlap_limit                  integer     not null default 3
    check (overlap_limit between 1 and 10),
  overlap_warn_enabled           boolean     not null default true,
  gap_warn_hours                 integer     not null default 4
    check (gap_warn_hours between 1 and 12),

  -- Time and locale ------------------------------------------------------------
  timezone                       text        not null default 'UTC',
  week_starts_on                 integer     not null default 1
    check (week_starts_on between 0 and 6),
  time_format                    text        not null default '24h'
    check (time_format in ('12h', '24h')),
  -- Stored as an intent ('dmy'), not a pattern ('dd/MM/yyyy'), so the rendering
  -- can change without a data migration and so the value is validatable.
  date_format                    text        not null default 'dmy'
    check (date_format in ('iso', 'dmy', 'mdy')),
  waking_start                   time        not null default '07:00',
  waking_end                     time        not null default '23:00',

  -- Analytics ------------------------------------------------------------------
  default_range                  text        not null default 'daily'
    check (default_range in ('daily', 'weekly', 'monthly', 'yearly', 'lifetime')),
  default_grouping               text        not null default 'parent_category'
    check (default_grouping in ('parent_category', 'category')),
  show_distraction_default       boolean     not null default true,
  include_estimated_default      boolean     not null default true,
  chart_style                    text        not null default 'donut'
    check (chart_style in ('pie', 'donut')),

  -- Productivity score ---------------------------------------------------------
  productivity_enabled           boolean     not null default true,
  -- Keyed by parent_category id, so it cannot be a set of columns.
  productivity_weights           jsonb       not null default '{}'::jsonb,

  -- Notifications --------------------------------------------------------------
  push_enabled                   boolean     not null default false,
  notify_queue_reminders         boolean     not null default true,
  notify_long_activity           boolean     not null default true,
  notify_auto_close              boolean     not null default true,
  notify_goal_reminders          boolean     not null default false,
  goal_reminder_time             time        not null default '20:00',
  notify_daily_review            boolean     not null default false,
  daily_review_time              time        not null default '21:00',
  notify_weekly_review           boolean     not null default true,
  notify_achievements            boolean     not null default true,

  -- AI -------------------------------------------------------------------------
  ai_consent                     boolean     not null default false,
  ai_daily_reports               boolean     not null default false,
  ai_weekly_reports              boolean     not null default true,
  ai_monthly_reports             boolean     not null default true,
  ai_recommendations             boolean     not null default true,

  -- Appearance -----------------------------------------------------------------
  theme                          text        not null default 'system'
    check (theme in ('light', 'dark', 'system')),
  accent_color                   text        not null default '#4f46e5'
    check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  compact_mode                   boolean     not null default false,
  dashboard_order                jsonb       not null default
    '["queue","quick_add","today","glance","goals","streaks","insight","week"]'::jsonb,

  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),

  -- DF-SET-009: a warning that fires after the automatic close would be useless.
  constraint auto_close_after_warning
    check (auto_close_minutes > long_activity_warning_minutes)
);

comment on table public.settings is
  'One row per user. Every column is documented in docs/02-product/16-prd-settings-and-customization.md.';


-- ===== 0003_categories.sql =====

-- =============================================================================
-- 0003 - Parent categories and categories
-- Reference: docs/02-product/11-prd-core-moments-and-categories.md sections 3 and 4
-- =============================================================================

create table if not exists public.parent_categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 50),
  color           text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon            text,
  -- Only Distracted Time. Protected from rename and deletion by trigger.
  is_system       boolean not null default false,
  -- Analytics keys off this flag, never off the name, so a user may mark any of
  -- their own parent categories as distraction-like. DF-CAT-025.
  is_distraction  boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Redundant as a uniqueness statement, but required as the target of the
  -- composite foreign key from categories. That composite key is what makes it
  -- structurally impossible to attach one user's category to another's parent.
  constraint parent_categories_user_id_id_key unique (user_id, id)
);

create unique index if not exists parent_categories_user_name_key
  on public.parent_categories (user_id, lower(trim(name)));

create index if not exists parent_categories_user_sort_idx
  on public.parent_categories (user_id, sort_order);

create table if not exists public.categories (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  parent_category_id  uuid not null,
  name                text not null check (char_length(trim(name)) between 1 and 50),
  -- Null means inherit the parent's hue at reduced saturation. DF-UX-041.
  color               text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon                text,
  -- Archived categories disappear from the selector but remain in history,
  -- which is how a taxonomy evolves without destroying past analytics. DF-CAT-006.
  is_archived         boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint categories_user_id_id_key unique (user_id, id),

  -- restrict, not cascade: deleting a parent must never silently destroy the
  -- categories beneath it and the months of Moments behind them. DF-CAT-022.
  constraint categories_parent_fkey
    foreign key (parent_category_id, user_id)
    references public.parent_categories (id, user_id)
    on delete restrict
);

create unique index if not exists categories_user_name_key
  on public.categories (user_id, lower(trim(name)));

create index if not exists categories_user_parent_idx
  on public.categories (user_id, parent_category_id);

create index if not exists categories_user_active_idx
  on public.categories (user_id) where is_archived = false;


-- ===== 0004_moments.sql =====

-- =============================================================================
-- 0004 - Moments
-- Reference: docs/02-product/11-prd-core-moments-and-categories.md section 2
--            docs/04-architecture/24-data-model-and-erd.md section 3
-- =============================================================================

create table if not exists public.moments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  category_id       uuid not null,

  start_at          timestamptz not null,
  -- Null means pending: a real, saved record waiting for its ending, not a draft.
  end_at            timestamptz,

  -- Generated rather than maintained, so it can never drift out of agreement
  -- with the timestamps. Stored so it is indexable for duration search.
  duration_minutes  integer generated always as (
                      case
                        when end_at is null then null
                        else floor(extract(epoch from (end_at - start_at)) / 60)::integer
                      end
                    ) stored,

  status            public.moment_status not null default 'pending',
  source            public.moment_source not null default 'manual',
  note              text check (note is null or char_length(note) <= 500),

  -- Reminder bookkeeping lives on the row rather than in a schedule table, which
  -- is what makes the reminder job idempotent by construction. DF-REM-010.
  last_reminder_at  timestamptz,
  warned_at         timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint moments_category_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete restrict,

  -- Keeps status and timestamps from ever disagreeing.
  constraint status_matches_end_at check (
    (status = 'pending' and end_at is null)
    or (status in ('completed', 'auto_closed') and end_at is not null)
  ),

  -- DF-MOM-010
  constraint end_after_start check (end_at is null or end_at > start_at),

  -- DF-MOM-013. Anything longer is a forgotten entry, not an activity.
  constraint max_duration check (
    end_at is null or (end_at - start_at) <= interval '24 hours'
  ),

  -- DF-MOM-014
  constraint no_duplicate_moment unique (user_id, category_id, start_at)
);

-- Serves every range query, the timeline and the calendar.
create index if not exists moments_user_start_idx
  on public.moments (user_id, start_at desc);

-- Pending Moments are a tiny fraction of the table, and the reminder job scans
-- for them every ten minutes across all users. A partial index keeps that cheap.
create index if not exists moments_pending_idx
  on public.moments (user_id, start_at)
  where status = 'pending';

create index if not exists moments_reminder_scan_idx
  on public.moments (start_at, last_reminder_at)
  where status = 'pending';

create index if not exists moments_user_category_start_idx
  on public.moments (user_id, category_id, start_at desc);


-- ===== 0005_goals.sql =====

-- =============================================================================
-- 0005 - Goals
-- Reference: docs/02-product/14-prd-goals-streaks-and-productivity-score.md
-- =============================================================================

create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,

  target_type     public.goal_target_type not null,
  -- Deliberately not a foreign key: it points at either categories or
  -- parent_categories depending on target_type. Referential integrity is
  -- enforced by the validate_goal_target trigger in 0008.
  target_id       uuid not null,

  period          public.goal_period not null,
  direction       public.goal_direction not null default 'at_least',
  target_minutes  integer not null check (target_minutes between 1 and 1440),

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- The same category may carry a daily and a weekly goal, but not two dailies.
  constraint goals_unique_target unique (user_id, target_type, target_id, period, direction)
);

create index if not exists goals_user_active_idx
  on public.goals (user_id) where is_active = true;

-- Streaks are computed on demand rather than stored. Storing them would create a
-- cache needing invalidation whenever any historical Moment changes, and
-- DF-GOA-035 requires that editing a Moment from three days ago repairs the
-- streak correctly.


-- ===== 0006_ai_and_push.sql =====

-- =============================================================================
-- 0006 - AI reports, AI usage, push subscriptions, feature flags
-- Reference: docs/04-architecture/29-ai-architecture-and-prompt-contracts.md
--            docs/04-architecture/28-notification-architecture.md
-- =============================================================================

create table if not exists public.ai_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  period_type   public.report_period not null,
  period_start  date not null,
  period_end    date not null,

  -- The deterministic statistics the report was built from. Stored alongside the
  -- narrative so a report stays verifiable and re-renderable years later, even if
  -- the aggregation logic changes or the model is retired.
  facts         jsonb not null,
  -- The generated summary, insights and recommendations, schema-validated before
  -- it ever reaches this column.
  content       jsonb not null,

  model         text,
  generated_by  text not null default 'ai' check (generated_by in ('ai', 'deterministic')),
  created_at    timestamptz not null default now(),

  constraint ai_reports_period_valid check (period_end >= period_start),
  constraint ai_reports_unique_period unique (user_id, period_type, period_start)
);

create index if not exists ai_reports_user_period_idx
  on public.ai_reports (user_id, period_type, period_start desc);

-- Every model call is recorded so that pricing is set from measurement rather
-- than guesswork, and so per-user quotas can be enforced. DF-AIA-040.
create table if not exists public.ai_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  estimated_cost  numeric(10, 6) not null default 0,
  succeeded       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists ai_usage_user_month_idx
  on public.ai_usage (user_id, created_at desc);

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Unique across the whole table: re-subscribing the same browser must update
  -- the existing row rather than accumulate duplicates. DF-NOT-004.
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- Runtime toggles live here rather than in environment variables so that turning
-- something on does not require a deployment.
create table if not exists public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  -- Null means the flag applies globally.
  user_id     uuid references auth.users (id) on delete cascade,
  flag        text not null,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint feature_flags_unique unique (user_id, flag)
);


-- ===== 0007_rls_policies.sql =====

-- =============================================================================
-- 0007 - Row level security
-- Reference: docs/04-architecture/25-database-schema-and-rls.md section 2
--
-- This is the PRIMARY access control, not a secondary layer. Supabase exposes
-- PostgreSQL over HTTPS to browsers holding the anon key, so "only our server
-- writes to this table" is simply not true here. The database is the perimeter.
--
-- Every policy uses (select auth.uid()) rather than a bare auth.uid(). The
-- wrapped form is evaluated once per query as an initplan instead of once per
-- row, which is a large difference when scanning a year of Moments.
-- =============================================================================

alter table public.profiles           enable row level security;
alter table public.settings           enable row level security;
alter table public.parent_categories  enable row level security;
alter table public.categories         enable row level security;
alter table public.moments            enable row level security;
alter table public.goals              enable row level security;
alter table public.ai_reports         enable row level security;
alter table public.ai_usage           enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.feature_flags      enable row level security;

-- ---------------------------------------------------------------------------
-- profiles - keyed by id rather than user_id
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists settings_delete on public.settings;
create policy settings_delete on public.settings
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- parent_categories
-- ---------------------------------------------------------------------------
drop policy if exists parent_categories_select on public.parent_categories;
create policy parent_categories_select on public.parent_categories
  for select to authenticated using (user_id = (select auth.uid()));

-- A client must never be able to mint a system parent category for itself,
-- which would let it create an undeletable row. DF-SEC-012.
drop policy if exists parent_categories_insert on public.parent_categories;
create policy parent_categories_insert on public.parent_categories
  for insert to authenticated
  with check (user_id = (select auth.uid()) and is_system = false);

drop policy if exists parent_categories_update on public.parent_categories;
create policy parent_categories_update on public.parent_categories
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists parent_categories_delete on public.parent_categories;
create policy parent_categories_delete on public.parent_categories
  for delete to authenticated
  using (user_id = (select auth.uid()) and is_system = false);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- moments
-- ---------------------------------------------------------------------------
drop policy if exists moments_select on public.moments;
create policy moments_select on public.moments
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists moments_insert on public.moments;
create policy moments_insert on public.moments
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists moments_update on public.moments;
create policy moments_update on public.moments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists moments_delete on public.moments;
create policy moments_delete on public.moments
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- goals
-- ---------------------------------------------------------------------------
drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists goals_insert on public.goals;
create policy goals_insert on public.goals
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists goals_update on public.goals;
create policy goals_update on public.goals
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists goals_delete on public.goals;
create policy goals_delete on public.goals
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ai_reports - readable and deletable by the owner; only the server writes them
-- ---------------------------------------------------------------------------
drop policy if exists ai_reports_select on public.ai_reports;
create policy ai_reports_select on public.ai_reports
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists ai_reports_delete on public.ai_reports;
create policy ai_reports_delete on public.ai_reports
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ai_usage - readable by the owner so quota can be shown; written by the server
-- ---------------------------------------------------------------------------
drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- feature_flags - read only for users; a global flag has a null user_id
-- ---------------------------------------------------------------------------
drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));


-- ===== 0008_triggers.sql =====

-- =============================================================================
-- 0008 - Triggers enforcing the domain invariants
-- Reference: docs/04-architecture/25-database-schema-and-rls.md section 5
--            ADR-004 in docs/00-governance/04-decision-log.md
--
-- These rules are stated twice: here, and again in TypeScript under
-- src/lib/domain. That duplication is deliberate. The TypeScript copy exists for
-- immediate feedback; this copy exists for correctness, because a second device,
-- a stale browser tab or a direct REST call would all bypass the client.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

drop trigger if exists parent_categories_set_updated_at on public.parent_categories;
create trigger parent_categories_set_updated_at before update on public.parent_categories
  for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists moments_set_updated_at on public.moments;
create trigger moments_set_updated_at before update on public.moments
  for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Status derivation - runs BEFORE the queue limit check
--
-- Keeps status in agreement with the timestamps automatically, so that clients
-- only ever have to set end_at. Implements DF-MOM-021, DF-MOM-022, DF-MOM-023.
-- ---------------------------------------------------------------------------
create or replace function public.sync_moment_status()
returns trigger
language plpgsql
as $$
begin
  if new.end_at is null then
    new.status := 'pending';
  elsif tg_op = 'INSERT' then
    new.status := 'completed';
  elsif new.end_at is distinct from old.end_at then
    -- A user supplying a real end time promotes an auto-closed Moment to
    -- completed: the system's estimate has been replaced by a fact. DF-MOM-022.
    if new.source = 'auto_close' and old.status = 'auto_closed' then
      new.status := 'completed';
      new.source := 'manual';
    elsif new.source = 'auto_close' and old.status = 'pending' then
      -- The scheduled sweep closing a forgotten Moment. Status is derived from
      -- the source rather than set by the caller, so `status` stays a column no
      -- client is ever allowed to write - which is what makes it trustworthy.
      -- DF-MOM-023.
      new.status := 'auto_closed';
    elsif new.status = 'pending' then
      new.status := 'completed';
    end if;
  end if;

  -- Reminder bookkeeping is meaningless once the Moment is closed, and clearing
  -- it means reopening a Moment restarts the cadence cleanly.
  if new.end_at is not null then
    new.last_reminder_at := null;
    new.warned_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists moments_sync_status on public.moments;
create trigger moments_sync_status
  before insert or update on public.moments
  for each row execute function public.sync_moment_status();

-- ---------------------------------------------------------------------------
-- Time validation
--
-- The rules that need more context than a single column check constraint.
-- Implements DF-MOM-011, DF-MOM-012, DF-MOM-015.
-- ---------------------------------------------------------------------------
create or replace function public.validate_moment_times()
returns trigger
language plpgsql
as $$
begin
  -- DF-MOM-011. Five minutes of tolerance because client clocks drift, and
  -- refusing a Moment because a phone is ninety seconds fast is indefensible.
  if new.start_at > now() + interval '5 minutes' then
    raise exception 'Start time cannot be in the future'
      using errcode = 'DF001';
  end if;

  -- DF-MOM-012
  if new.end_at is not null and new.end_at > now() + interval '5 minutes' then
    raise exception 'End time cannot be in the future'
      using errcode = 'DF002';
  end if;

  -- DF-MOM-015. Guards against a mistyped year producing a Moment in 1025.
  if new.start_at < now() - interval '10 years' then
    raise exception 'Start time is implausibly far in the past'
      using errcode = 'DF003';
  end if;

  return new;
end;
$$;

drop trigger if exists moments_validate_times on public.moments;
create trigger moments_validate_times
  before insert or update on public.moments
  for each row execute function public.validate_moment_times();

-- ---------------------------------------------------------------------------
-- Queue limit - the single most important trigger in the schema
--
-- Implements DF-QUE-001 through DF-QUE-005. This is the mechanic that keeps the
-- dataset honest, so it is a hard refusal rather than a warning (ADR-009), and
-- it is enforced here rather than only in the client because two devices can
-- each see a free slot at the same moment (DF-SYN-033).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_queue_limit()
returns trigger
language plpgsql
as $$
declare
  v_limit   integer;
  v_pending integer;
begin
  -- Only a row that will end up pending can consume a slot.
  if new.status <> 'pending' then
    return new;
  end if;

  -- An already-pending row being edited is not taking a new slot.
  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;
  end if;

  select queue_limit into v_limit
  from public.settings
  where user_id = new.user_id;

  -- Settings are created in the same transaction as the user, but default
  -- defensively rather than allowing an unbounded queue if the row is missing.
  v_limit := coalesce(v_limit, 2);

  select count(*) into v_pending
  from public.moments
  where user_id = new.user_id
    and status = 'pending'
    and id <> new.id;

  if v_pending >= v_limit then
    -- A distinguishable errcode is what lets the client render the inline
    -- refusal of DF-UX-113 instead of a generic failure.
    raise exception 'Queue limit reached: % of % activities already open', v_pending, v_limit
      using errcode = 'DF010',
            hint = 'Close an open activity before starting another.';
  end if;

  return new;
end;
$$;

-- Must fire after sync_moment_status, which decides the final status.
-- Trigger order within the same timing is alphabetical, and "moments_z_" sorts
-- after "moments_sync_status" and "moments_validate_times".
drop trigger if exists moments_z_enforce_queue_limit on public.moments;
create trigger moments_z_enforce_queue_limit
  before insert or update on public.moments
  for each row execute function public.enforce_queue_limit();

-- ---------------------------------------------------------------------------
-- System parent category protection
--
-- Implements DF-SEC-010, DF-SEC-011, DF-SEC-012, and therefore the product
-- guarantee that Distracted Time always exists (DF-CAT-021, DF-CAT-024).
-- ---------------------------------------------------------------------------
create or replace function public.protect_system_parent_category()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'The % category is built in and cannot be deleted', old.name
        using errcode = 'DF020';
    end if;
    return old;
  end if;

  if old.is_system then
    if new.name is distinct from old.name then
      raise exception 'The % category is built in and cannot be renamed', old.name
        using errcode = 'DF021';
    end if;
    if new.is_distraction is distinct from old.is_distraction then
      raise exception 'Distraction grouping cannot be removed from %', old.name
        using errcode = 'DF022';
    end if;
    if new.is_system = false then
      raise exception 'A built-in category cannot be converted to a normal one'
        using errcode = 'DF023';
    end if;
  end if;

  -- Colour, icon and sort order remain freely editable on system rows.
  return new;
end;
$$;

drop trigger if exists parent_categories_protect_system on public.parent_categories;
create trigger parent_categories_protect_system
  before update or delete on public.parent_categories
  for each row execute function public.protect_system_parent_category();

-- ---------------------------------------------------------------------------
-- Goal target integrity
--
-- goals.target_id points at either categories or parent_categories depending on
-- target_type, so it cannot be a declarative foreign key.
-- ---------------------------------------------------------------------------
create or replace function public.validate_goal_target()
returns trigger
language plpgsql
as $$
declare
  v_exists boolean;
begin
  if new.target_type = 'category' then
    select exists (
      select 1 from public.categories
      where id = new.target_id and user_id = new.user_id
    ) into v_exists;
  else
    select exists (
      select 1 from public.parent_categories
      where id = new.target_id and user_id = new.user_id
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception 'Goal target does not exist'
      using errcode = 'DF030';
  end if;

  return new;
end;
$$;

drop trigger if exists goals_validate_target on public.goals;
create trigger goals_validate_target
  before insert or update on public.goals
  for each row execute function public.validate_goal_target();


-- ===== 0009_seed_new_user.sql =====

-- =============================================================================
-- 0009 - New user provisioning
-- Reference: docs/02-product/11-prd-core-moments-and-categories.md section 5
--
-- Everything happens in one transaction with the user's creation. A user must
-- never reach the dashboard before their categories exist (DF-UX-011), and a
-- partially seeded account would be worse than an empty one.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path per DF-SEC-004: a security definer function with a mutable
-- search_path can be induced to call an attacker's function of the same name.
set search_path = ''
as $$
declare
  v_work          uuid;
  v_learning      uuid;
  v_health        uuid;
  v_personal      uuid;
  v_entertainment uuid;
  v_distracted    uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  insert into public.settings (user_id) values (new.id);

  -- Parent categories -------------------------------------------------------
  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Work', '#2563eb', 'briefcase', 1)
  returning id into v_work;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Learning', '#4f46e5', 'book-open', 2)
  returning id into v_learning;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Health', '#16a34a', 'heart-pulse', 3)
  returning id into v_health;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Personal', '#0891b2', 'house', 4)
  returning id into v_personal;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Entertainment', '#9333ea', 'clapperboard', 5)
  returning id into v_entertainment;

  -- The one system parent category. Protected from rename and deletion, and
  -- always flagged as distraction. Uses the reserved distraction colour so the
  -- user learns to recognise it instantly across every chart (DF-CAT-032).
  insert into public.parent_categories
    (user_id, name, color, icon, is_system, is_distraction, sort_order)
  values (new.id, 'Distracted Time', '#e11d48', 'circle-alert', true, true, 6)
  returning id into v_distracted;

  -- Categories --------------------------------------------------------------
  -- Everything except Distracted Time itself is freely editable and deletable
  -- (DF-CAT-041). These exist so the first screen is never empty, not to impose
  -- a taxonomy.
  insert into public.categories (user_id, parent_category_id, name, icon, sort_order)
  values
    (new.id, v_work,          'Office',           'building-2',   1),
    (new.id, v_work,          'Meetings',         'users',        2),
    (new.id, v_work,          'Email',            'mail',         3),

    (new.id, v_learning,      'Reading',          'book',         1),
    (new.id, v_learning,      'Courses',          'graduation-cap', 2),
    (new.id, v_learning,      'Practice',         'code',         3),

    (new.id, v_health,        'Gym',              'dumbbell',     1),
    (new.id, v_health,        'Walking',          'footprints',   2),
    (new.id, v_health,        'Sleep',            'moon',         3),

    (new.id, v_personal,      'Family',           'heart',        1),
    (new.id, v_personal,      'Chores',           'brush',        2),
    (new.id, v_personal,      'Travel',           'car',          3),

    (new.id, v_entertainment, 'Movies',           'clapperboard', 1),
    (new.id, v_entertainment, 'Music',            'music',        2),
    (new.id, v_entertainment, 'Gaming',           'gamepad-2',    3),

    (new.id, v_distracted,    'Social Media',     'smartphone',   1),
    (new.id, v_distracted,    'Random Browsing',  'globe',        2);

  -- Productivity weights ----------------------------------------------------
  -- Keyed by the parent category ids just created. Entertainment is exactly 0.0
  -- as a deliberate statement: relaxation is neither virtuous nor wasteful.
  -- Users who disagree can move it either way, which is the entire point.
  update public.settings
  set productivity_weights = jsonb_build_object(
    v_work::text,          0.8,
    v_learning::text,      1.0,
    v_health::text,        0.9,
    v_personal::text,      0.3,
    v_entertainment::text, 0.0,
    v_distracted::text,   -0.8
  )
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===== 0010_analytics_functions.sql =====

-- =============================================================================
-- 0010 - Analytics functions
-- Reference: docs/02-product/13-prd-analytics-and-visualization.md
--            DF-ANA-092: aggregation happens here, never by shipping raw rows
--            to the client. A lifetime view for a three-year user is tens of
--            thousands of Moments, and summing those on a phone is not a design.
--
-- Every function is `security invoker`, so row level security applies normally
-- and none of them can leak another user's data even if called with unexpected
-- arguments.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The user's timezone. All Local Day grouping depends on it (DF-MOM-042).
-- ---------------------------------------------------------------------------
create or replace function public.current_user_timezone()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select s.timezone from public.settings s where s.user_id = auth.uid()),
    'UTC'
  );
$$;

-- ---------------------------------------------------------------------------
-- Time per category or parent category across a range.
--
-- Clamped to the range boundaries, which is what makes a Moment that starts
-- before the range or ends after it contribute only its overlapping portion.
-- ---------------------------------------------------------------------------
create or replace function public.get_time_by_category(
  p_start                date,
  p_end                  date,
  p_grouping             text    default 'parent_category',
  p_include_estimated    boolean default true,
  p_include_distraction  boolean default true
)
returns table (
  group_id       uuid,
  group_name     text,
  group_color    text,
  parent_name    text,
  is_distraction boolean,
  minutes        numeric,
  moment_count   bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
begin
  v_tz   := public.current_user_timezone();
  v_from := (p_start::timestamp) at time zone v_tz;
  v_to   := ((p_end + 1)::timestamp) at time zone v_tz;

  return query
  with sliced as (
    select
      c.id                as category_id,
      c.name              as category_name,
      coalesce(c.color, p.color) as category_color,
      p.id                as parent_id,
      p.name              as parent_name,
      p.color             as parent_color,
      p.is_distraction    as parent_is_distraction,
      m.id                as moment_id,
      extract(epoch from (
        least(coalesce(m.end_at, now()), v_to)
        - greatest(m.start_at, v_from)
      )) / 60.0           as minutes
    from public.moments m
    join public.categories c        on c.id = m.category_id
    join public.parent_categories p on p.id = c.parent_category_id
    where m.user_id = auth.uid()
      and m.start_at < v_to
      and coalesce(m.end_at, now()) > v_from
      and (p_include_estimated or m.status <> 'auto_closed')
      and (p_include_distraction or p.is_distraction = false)
  )
  select
    case when p_grouping = 'category' then s.category_id else s.parent_id end,
    case when p_grouping = 'category' then s.category_name else s.parent_name end,
    case when p_grouping = 'category' then s.category_color else s.parent_color end,
    s.parent_name,
    s.parent_is_distraction,
    round(sum(s.minutes))::numeric,
    count(distinct s.moment_id)
  from sliced s
  group by 1, 2, 3, s.parent_name, s.parent_is_distraction
  having sum(s.minutes) > 0
  order by 6 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Minutes per Local Day.
--
-- This is where ADR-010's midnight split lives. A Moment from 22:30 to 01:30
-- contributes 90 minutes to each of two days rather than 180 to the first,
-- because attributing a whole overnight sleep to the previous day would render
-- an eight-hour block followed by an empty morning.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_totals(
  p_start               date,
  p_end                 date,
  p_include_estimated   boolean default true
)
returns table (
  day                date,
  minutes            numeric,
  distracted_minutes numeric,
  moment_count       bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text;
begin
  v_tz := public.current_user_timezone();

  return query
  with days as (
    select generate_series(p_start, p_end, interval '1 day')::date as day
  ),
  bounded as (
    select
      d.day,
      (d.day::timestamp) at time zone v_tz       as day_start,
      ((d.day + 1)::timestamp) at time zone v_tz as day_end
    from days d
  ),
  sliced as (
    select
      b.day,
      m.id as moment_id,
      p.is_distraction,
      extract(epoch from (
        least(coalesce(m.end_at, now()), b.day_end)
        - greatest(m.start_at, b.day_start)
      )) / 60.0 as minutes
    from bounded b
    join public.moments m
      on m.user_id = auth.uid()
     and m.start_at < b.day_end
     and coalesce(m.end_at, now()) > b.day_start
    join public.categories c        on c.id = m.category_id
    join public.parent_categories p on p.id = c.parent_category_id
    where p_include_estimated or m.status <> 'auto_closed'
  )
  select
    b.day,
    coalesce(round(sum(s.minutes)), 0)::numeric,
    coalesce(round(sum(s.minutes) filter (where s.is_distraction)), 0)::numeric,
    count(distinct s.moment_id)
  from bounded b
  left join sliced s on s.day = b.day
  group by b.day
  order by b.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- One day's Moments, in full, for the timeline and day detail screens.
-- ---------------------------------------------------------------------------
create or replace function public.get_day_breakdown(p_date date)
returns table (
  moment_id       uuid,
  category_id     uuid,
  category_name   text,
  parent_id       uuid,
  parent_name     text,
  color           text,
  is_distraction  boolean,
  start_at        timestamptz,
  end_at          timestamptz,
  status          public.moment_status,
  minutes_in_day  numeric,
  note            text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz        text;
  v_day_start timestamptz;
  v_day_end   timestamptz;
begin
  v_tz        := public.current_user_timezone();
  v_day_start := (p_date::timestamp) at time zone v_tz;
  v_day_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  return query
  select
    m.id,
    c.id,
    c.name,
    p.id,
    p.name,
    coalesce(c.color, p.color),
    p.is_distraction,
    m.start_at,
    m.end_at,
    m.status,
    round(extract(epoch from (
      least(coalesce(m.end_at, now()), v_day_end)
      - greatest(m.start_at, v_day_start)
    )) / 60.0)::numeric,
    m.note
  from public.moments m
  join public.categories c        on c.id = m.category_id
  join public.parent_categories p on p.id = c.parent_category_id
  where m.user_id = auth.uid()
    and m.start_at < v_day_end
    and coalesce(m.end_at, now()) > v_day_start
  order by m.start_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Achieved minutes for a goal's target, over an arbitrary day range.
-- ---------------------------------------------------------------------------
create or replace function public.get_goal_achieved(
  p_goal_id uuid,
  p_start   date,
  p_end     date
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz      text;
  v_from    timestamptz;
  v_to      timestamptz;
  v_type    public.goal_target_type;
  v_target  uuid;
  v_minutes numeric;
begin
  select g.target_type, g.target_id into v_type, v_target
  from public.goals g
  where g.id = p_goal_id and g.user_id = auth.uid();

  if v_target is null then
    return 0;
  end if;

  v_tz   := public.current_user_timezone();
  v_from := (p_start::timestamp) at time zone v_tz;
  v_to   := ((p_end + 1)::timestamp) at time zone v_tz;

  select coalesce(round(sum(
    extract(epoch from (
      least(coalesce(m.end_at, now()), v_to)
      - greatest(m.start_at, v_from)
    )) / 60.0
  )), 0)
  into v_minutes
  from public.moments m
  join public.categories c on c.id = m.category_id
  where m.user_id = auth.uid()
    and m.start_at < v_to
    and coalesce(m.end_at, now()) > v_from
    and (
      (v_type = 'category'        and c.id = v_target)
      or (v_type = 'parent_category' and c.parent_category_id = v_target)
    );

  return coalesce(v_minutes, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Current and longest streak for a daily goal.
--
-- Walks backwards day by day. DF-GOA-033: a day with no data at all breaks an
-- at_least streak, because the alternative rewards not recording. DF-GOA-036:
-- today cannot break a streak until the Local Day has ended.
-- ---------------------------------------------------------------------------
create or replace function public.get_streak(p_goal_id uuid)
returns table (current_streak integer, longest_streak integer)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz         text;
  v_today      date;
  v_direction  public.goal_direction;
  v_target     integer;
  v_period     public.goal_period;
  v_day        date;
  v_achieved   numeric;
  v_met        boolean;
  v_current    integer := 0;
  v_longest    integer := 0;
  v_running    integer := 0;
  v_broken     boolean := false;
  v_scan_limit integer := 730;
  i            integer;
begin
  select g.direction, g.target_minutes, g.period
  into v_direction, v_target, v_period
  from public.goals g
  where g.id = p_goal_id and g.user_id = auth.uid();

  if v_target is null or v_period <> 'daily' then
    return query select 0, 0;
    return;
  end if;

  v_tz    := public.current_user_timezone();
  v_today := (now() at time zone v_tz)::date;

  for i in 0 .. v_scan_limit loop
    v_day := v_today - i;
    v_achieved := public.get_goal_achieved(p_goal_id, v_day, v_day);

    if v_direction = 'at_least' then
      v_met := v_achieved >= v_target;
    else
      -- DF-GOA-032: zero minutes satisfies an at_most goal.
      v_met := v_achieved <= v_target;
    end if;

    if v_met then
      v_running := v_running + 1;
      if not v_broken then
        v_current := v_running;
      end if;
    else
      -- Today in progress must not count as a break yet.
      if i = 0 and v_direction = 'at_least' then
        null;
      else
        v_longest := greatest(v_longest, v_running);
        v_running := 0;
        v_broken  := true;
      end if;
    end if;
  end loop;

  v_longest := greatest(v_longest, v_running, v_current);
  return query select v_current, v_longest;
end;
$$;

-- ---------------------------------------------------------------------------
-- Productivity score for a Local Day.
--
-- Formula per docs/02-product/14 section 5.2. Returns null rather than zero for
-- a day with no data (DF-GOA-054): absence of a record is not a bad day.
-- ---------------------------------------------------------------------------
create or replace function public.get_productivity_score(p_date date)
returns numeric
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_weights jsonb;
  v_raw     numeric := 0;
  v_denom   numeric := 0;
  v_any     boolean := false;
  r         record;
  v_weight  numeric;
begin
  select s.productivity_weights into v_weights
  from public.settings s where s.user_id = auth.uid();

  v_weights := coalesce(v_weights, '{}'::jsonb);
  v_tz      := public.current_user_timezone();
  v_start   := (p_date::timestamp) at time zone v_tz;
  v_end     := ((p_date + 1)::timestamp) at time zone v_tz;

  for r in
    select
      p.id as parent_id,
      sum(extract(epoch from (
        least(coalesce(m.end_at, now()), v_end)
        - greatest(m.start_at, v_start)
      )) / 60.0) as minutes
    from public.moments m
    join public.categories c        on c.id = m.category_id
    join public.parent_categories p on p.id = c.parent_category_id
    where m.user_id = auth.uid()
      and m.start_at < v_end
      and coalesce(m.end_at, now()) > v_start
    group by p.id
  loop
    v_any    := true;
    v_weight := coalesce((v_weights ->> r.parent_id::text)::numeric, 0);
    v_raw    := v_raw + (r.minutes * v_weight);
    if v_weight > 0 then
      v_denom := v_denom + r.minutes;
    end if;
  end loop;

  if not v_any then
    return null;
  end if;

  return greatest(0, least(100, round(50 + 50 * (v_raw / greatest(v_denom, 1)))));
end;
$$;

-- ---------------------------------------------------------------------------
-- The deterministic fact bundle the AI layer consumes.
--
-- ADR-011: the model receives finished figures and never a raw Moment, so there
-- is nothing for it to miscalculate. Category names are included because
-- "category 7 rose 40%" would be useless; this is disclosed in the consent text
-- rather than buried (DF-AIA-003).
-- ---------------------------------------------------------------------------
create or replace function public.get_period_facts(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_days       integer := (p_end - p_start) + 1;
  v_prev_start date    := p_start - v_days;
  v_prev_end   date    := p_start - 1;
  v_result     jsonb;
begin
  select jsonb_build_object(
    'period', jsonb_build_object(
      'start', p_start, 'end', p_end, 'days', v_days
    ),
    'totals', (
      select jsonb_build_object(
        'recordedMinutes',   coalesce(sum(d.minutes), 0),
        'distractedMinutes', coalesce(sum(d.distracted_minutes), 0),
        'momentCount',       coalesce(sum(d.moment_count), 0),
        'daysWithData',      count(*) filter (where d.minutes > 0),
        'averageMinutesPerDay',
          case when count(*) filter (where d.minutes > 0) = 0 then 0
          else round(coalesce(sum(d.minutes), 0)
                     / count(*) filter (where d.minutes > 0)) end
      )
      from public.get_daily_totals(p_start, p_end) d
    ),
    'byParentCategory', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', g.group_name,
        'isDistraction', g.is_distraction,
        'minutes', g.minutes,
        'momentCount', g.moment_count
      ) order by g.minutes desc), '[]'::jsonb)
      from public.get_time_by_category(p_start, p_end, 'parent_category') g
    ),
    'byCategory', (
      -- DF-AIA-004: capped so prompt size is bounded by the taxonomy, not by
      -- the number of Moments. A three-year user costs the same as a new one.
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', g.group_name,
          'parentName', g.parent_name,
          'minutes', g.minutes,
          'momentCount', g.moment_count
        ) as x
        from public.get_time_by_category(p_start, p_end, 'category') g
        order by g.minutes desc
        limit 15
      ) t
    ),
    'byDay', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day,
        'minutes', d.minutes,
        'distractedMinutes', d.distracted_minutes
      ) order by d.day), '[]'::jsonb)
      from public.get_daily_totals(p_start, p_end) d
    ),
    'comparison', jsonb_build_object(
      'previousPeriodMinutes', (
        select coalesce(sum(d.minutes), 0)
        from public.get_daily_totals(v_prev_start, v_prev_end) d
      )
    ),
    'quality', (
      select jsonb_build_object(
        'autoClosedCount', count(*) filter (where m.status = 'auto_closed')
      )
      from public.moments m
      where m.user_id = auth.uid()
        and m.start_at >= (p_start::timestamp) at time zone public.current_user_timezone()
        and m.start_at <  ((p_end + 1)::timestamp) at time zone public.current_user_timezone()
    )
  ) into v_result;

  return v_result;
end;
$$;


-- ===== 0011_scheduled_jobs.sql =====

-- =============================================================================
-- 0011 - Scheduled jobs
-- Reference: ADR-008 in docs/00-governance/04-decision-log.md
--            docs/04-architecture/28-notification-architecture.md
--
-- Vercel's Hobby plan permits cron no more often than once per day, so it cannot
-- drive a reminder engine that needs ten-minute resolution. pg_cron runs inside
-- Supabase and calls the application over HTTPS with a shared secret instead.
--
-- BEFORE APPLYING THIS MIGRATION, store the two values in Vault. They are read
-- at run time rather than embedded here, so that this file is safe to commit:
--
--   select vault.create_secret('https://your-app.vercel.app', 'dayflow_app_url');
--   select vault.create_secret('<your CRON_SECRET>',          'dayflow_cron_secret');
--
-- Re-run with vault.update_secret(...) if either value changes. A rotated
-- CRON_SECRET must be updated in BOTH Vercel and here, or reminders stop
-- silently - which is the most common cause of the runbook in document 36.
-- =============================================================================

create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

-- ---------------------------------------------------------------------------
-- Calls one of the application's cron endpoints.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_cron_endpoint(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'dayflow_app_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'dayflow_cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'dayflow: app url or cron secret missing from vault; skipping %', p_path;
    return null;
  end if;

  select net.http_post(
    url     := v_url || p_path,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_id;

  return v_id;
end;
$$;

revoke all on function public.invoke_cron_endpoint(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedules
--
-- Reminders run every 10 minutes rather than hourly so that users on a shorter
-- interval than the 60-minute default are served accurately. The endpoint is
-- idempotent (DF-REM-010), so a duplicate delivery produces no duplicate
-- notification.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('dayflow-reminders')
  where exists (select 1 from cron.job where jobname = 'dayflow-reminders');

  perform cron.unschedule('dayflow-auto-close')
  where exists (select 1 from cron.job where jobname = 'dayflow-auto-close');
end
$$;

select cron.schedule(
  'dayflow-reminders',
  '*/10 * * * *',
  $$ select public.invoke_cron_endpoint('/api/cron/reminders'); $$
);

select cron.schedule(
  'dayflow-auto-close',
  '*/15 * * * *',
  $$ select public.invoke_cron_endpoint('/api/cron/auto-close'); $$
);

-- Verification after deployment, per DF-CD-010:
--
--   select jobname, schedule, active from cron.job;
--   select jobid, status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 20;


-- ===== 0012_realtime.sql =====

-- =============================================================================
-- 0012 - Realtime publication
-- Reference: docs/04-architecture/27-state-and-sync-strategy.md
--
-- Multi-device sync (DF-SYN-020) does not work until the tables are explicitly
-- published. Without this migration everything appears healthy - the channel
-- subscribes, no error is raised - and changes simply never arrive on the second
-- device, which is a difficult failure to diagnose from the client side.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'moments', 'categories', 'parent_categories', 'settings', 'goals'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Replica identity
--
-- Subtle but load-bearing. The client subscribes with `user_id=eq.<id>`, and
-- under the default replica identity a DELETE payload carries only the primary
-- key - so it never matches that filter and the deletion is never delivered. A
-- Moment deleted on a phone would linger on the laptop until a manual refresh.
--
-- FULL makes the old row available to the filter. It widens the write-ahead log,
-- which at personal-tracker volumes is an irrelevant cost.
-- ---------------------------------------------------------------------------
alter table public.moments           replica identity full;
alter table public.categories        replica identity full;
alter table public.parent_categories replica identity full;
alter table public.settings          replica identity full;
alter table public.goals             replica identity full;


-- ===== 0013_seed_new_user_timezone.sql =====

-- =============================================================================
-- 0013 - New user provisioning reads the signup timezone
-- Reference: docs/02-product/16-prd-settings-and-customization.md
--            docs/00-governance/05-versioning-and-release-policy.md
--
-- The signup form has always sent the browser timezone as user metadata, but
-- 0009 only ever read display_name, so the value was discarded and every account
-- started in UTC. The client corrects it on first load, which means there is a
-- window in which the day boundary is wrong - and for anyone far from UTC, a
-- Moment recorded in that window is filed to the wrong Local Day.
--
-- 0009 is left exactly as it is because it has already been applied; a new file
-- is the only correct way to change an applied migration. Replacing the function
-- is the whole change: the trigger 0009 created resolves the function by name at
-- call time, so it picks this version up with no further work.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path per DF-SEC-004: a security definer function with a mutable
-- search_path can be induced to call an attacker's function of the same name.
set search_path = ''
as $$
declare
  v_timezone      text;
  v_work          uuid;
  v_learning      uuid;
  v_health        uuid;
  v_personal      uuid;
  v_entertainment uuid;
  v_distracted    uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  -- Metadata is client-supplied and settings.timezone carries no check
  -- constraint, so an unrecognised name would be accepted here and then fail
  -- much later inside the `at time zone` calls in 0010, where the cause is far
  -- from obvious. Validating against the catalogue keeps the failure local and
  -- degrades to UTC, which is what the column defaulted to before this file.
  v_timezone := nullif(trim(coalesce(new.raw_user_meta_data ->> 'timezone', '')), '');

  if v_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    v_timezone := 'UTC';
  end if;

  insert into public.settings (user_id, timezone) values (new.id, v_timezone);

  -- Parent categories -------------------------------------------------------
  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Work', '#2563eb', 'briefcase', 1)
  returning id into v_work;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Learning', '#4f46e5', 'book-open', 2)
  returning id into v_learning;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Health', '#16a34a', 'heart-pulse', 3)
  returning id into v_health;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Personal', '#0891b2', 'house', 4)
  returning id into v_personal;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Entertainment', '#9333ea', 'clapperboard', 5)
  returning id into v_entertainment;

  -- The one system parent category. Protected from rename and deletion, and
  -- always flagged as distraction. Uses the reserved distraction colour so the
  -- user learns to recognise it instantly across every chart (DF-CAT-032).
  insert into public.parent_categories
    (user_id, name, color, icon, is_system, is_distraction, sort_order)
  values (new.id, 'Distracted Time', '#e11d48', 'circle-alert', true, true, 6)
  returning id into v_distracted;

  -- Categories --------------------------------------------------------------
  -- Everything except Distracted Time itself is freely editable and deletable
  -- (DF-CAT-041). These exist so the first screen is never empty, not to impose
  -- a taxonomy.
  insert into public.categories (user_id, parent_category_id, name, icon, sort_order)
  values
    (new.id, v_work,          'Office',           'building-2',   1),
    (new.id, v_work,          'Meetings',         'users',        2),
    (new.id, v_work,          'Email',            'mail',         3),

    (new.id, v_learning,      'Reading',          'book',         1),
    (new.id, v_learning,      'Courses',          'graduation-cap', 2),
    (new.id, v_learning,      'Practice',         'code',         3),

    (new.id, v_health,        'Gym',              'dumbbell',     1),
    (new.id, v_health,        'Walking',          'footprints',   2),
    (new.id, v_health,        'Sleep',            'moon',         3),

    (new.id, v_personal,      'Family',           'heart',        1),
    (new.id, v_personal,      'Chores',           'brush',        2),
    (new.id, v_personal,      'Travel',           'car',          3),

    (new.id, v_entertainment, 'Movies',           'clapperboard', 1),
    (new.id, v_entertainment, 'Music',            'music',        2),
    (new.id, v_entertainment, 'Gaming',           'gamepad-2',    3),

    (new.id, v_distracted,    'Social Media',     'smartphone',   1),
    (new.id, v_distracted,    'Random Browsing',  'globe',        2);

  -- Productivity weights ----------------------------------------------------
  -- Keyed by the parent category ids just created. Entertainment is exactly 0.0
  -- as a deliberate statement: relaxation is neither virtuous nor wasteful.
  -- Users who disagree can move it either way, which is the entire point.
  update public.settings
  set productivity_weights = jsonb_build_object(
    v_work::text,          0.8,
    v_learning::text,      1.0,
    v_health::text,        0.9,
    v_personal::text,      0.3,
    v_entertainment::text, 0.0,
    v_distracted::text,   -0.8
  )
  where user_id = new.id;

  return new;
end;
$$;


-- ===== 0014_scheduled_report_support.sql =====

-- =============================================================================
-- 0014 - Scheduled report support
-- Reference: docs/04-architecture/29-ai-architecture-and-prompt-contracts.md
--            docs/05-engineering/33-cicd-and-deployment-runbook.md
-- =============================================================================

-- Every analytics function is `security invoker` and scoped by auth.uid(), which
-- is exactly right for a user request and useless for a scheduled job: the cron
-- worker connects as service_role, where auth.uid() is null and every aggregate
-- comes back empty.
--
-- The alternative would be a second, user_id-parameterised copy of every
-- aggregation function - two implementations of the midnight-split rule that
-- would disagree the first time either changed. Instead this sets the request
-- claims for the duration of the calling statement and delegates to the existing
-- function unchanged.
--
-- set_config(..., is_local => true) confines the impersonation to the current
-- transaction, so it cannot leak into a later statement on a pooled connection.
create or replace function public.get_period_facts_for_user(
  p_user_id uuid,
  p_start   date,
  p_end     date
)
returns jsonb
language plpgsql
-- security definer is required: only the owner may set request.jwt.claims. The
-- function is correspondingly locked down below.
security definer
-- Empty search_path per DF-SEC-004: a security definer function with a mutable
-- search_path can be induced to call an attacker's function of the same name.
-- The one reference below that a search path could resolve is therefore
-- schema-qualified. The built-ins are not, because pg_catalog is searched ahead
-- of an empty path and so cannot be shadowed by anything a caller plants.
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  v_result := public.get_period_facts(p_start, p_end);

  return v_result;
end;
$$;

-- A security definer function that impersonates an arbitrary user by id is a
-- privilege escalation the moment any client can reach it. Execute is stripped
-- from everyone and granted only to service_role, which no browser ever holds.
revoke all on function public.get_period_facts_for_user(uuid, date, date)
  from public, anon, authenticated;

grant execute on function public.get_period_facts_for_user(uuid, date, date)
  to service_role;

comment on function public.get_period_facts_for_user(uuid, date, date) is
  'Service-role only. Computes period facts on behalf of a user for scheduled report generation.';

-- ---------------------------------------------------------------------------
-- Local day for a given user, so the scheduled job can decide whose "yesterday"
-- has actually finished. Running one job at 02:00 UTC otherwise generates a
-- daily report for a user in Auckland that covers a day still in progress.
-- ---------------------------------------------------------------------------
create or replace function public.local_date_for_timezone(p_timezone text, p_offset_days integer default 0)
returns date
language sql
-- stable, not immutable: it reads now(). Marking it immutable would licence the
-- planner to fold it to a constant, and the job would keep reporting the day it
-- was first planned on.
stable
-- Not security definer, so DF-SEC-004 does not bind this one and there is no
-- privilege boundary to protect. Both clauses are stated regardless, so that the
-- security posture of every function in this schema can be read off its header
-- rather than inferred from which defaults apply. An empty search_path is the
-- stricter of the two choices and costs nothing here: every name in the body
-- resolves in pg_catalog, which is searched ahead of the path and so cannot be
-- shadowed by anything a caller plants.
security invoker
set search_path = ''
as $$
  select ((now() at time zone coalesce(p_timezone, 'UTC'))::date + p_offset_days);
$$;

grant execute on function public.local_date_for_timezone(text, integer) to service_role, authenticated;


-- ===== 0015_account_deletion.sql =====

-- =============================================================================
-- 0015 - Account deletion
-- Reference: docs/06-operations/35-privacy-and-data-protection.md section 7
--            ADR-014 in docs/00-governance/04-decision-log.md
--
-- DESTRUCTIVE. public.delete_account() destroys an entire account in one
-- transaction: every Moment, category, category group, goal, report, usage
-- record, push subscription and setting belonging to the caller, and the
-- auth.users row itself. Nothing survives it and nothing can be restored from
-- inside the product afterwards, which is precisely what DF-PRV-021 and
-- DF-PRV-022 ask for.
--
-- It is safe to expose to an ordinary session because the subject is auth.uid()
-- and nothing else. There is no argument that could redirect it at another
-- account, so a defect in the calling code can destroy the caller's own data and
-- no one else's. That property is the entire reason this is a function rather
-- than a service-role delete from a route handler; ADR-014 records the reasoning
-- and the alternatives that were rejected.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The system category group guard, narrowed to the life of the account
--
-- 0008 refuses every delete of a parent category with is_system = true, which is
-- right while the account exists (DF-CAT-021, DF-CAT-024) and fatal when it ends.
-- The refusal fires inside the cascade from auth.users, so with 0008 as written
-- DF-PRV-021 cannot be satisfied at all: not by the function below, and not by an
-- operator deleting the user from the dashboard either. Keeping Distracted Time
-- present for the life of an account is not a reason to obstruct the end of it.
--
-- Replaced here rather than corrected in 0008, which is already applied. Only the
-- delete branch differs.
-- ---------------------------------------------------------------------------
create or replace function public.protect_system_parent_category()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- public.delete_account raises this flag for the duration of its own
    -- transaction. Nothing a client can reach over the REST interface sets it,
    -- and if something could, row level security would still confine that client
    -- to its own rows - so the worst case is a user discarding their own
    -- Distracted Time group rather than anyone reaching another account.
    if old.is_system
      and coalesce(current_setting('dayflow.account_deletion', true), 'off') <> 'on'
    then
      raise exception 'The % category is built in and cannot be deleted', old.name
        using errcode = 'DF020';
    end if;
    return old;
  end if;

  if old.is_system then
    if new.name is distinct from old.name then
      raise exception 'The % category is built in and cannot be renamed', old.name
        using errcode = 'DF021';
    end if;
    if new.is_distraction is distinct from old.is_distraction then
      raise exception 'Distraction grouping cannot be removed from %', old.name
        using errcode = 'DF022';
    end if;
    if new.is_system = false then
      raise exception 'A built-in category cannot be converted to a normal one'
        using errcode = 'DF023';
    end if;
  end if;

  -- Colour, icon and sort order remain freely editable on system rows.
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion - DF-PRV-021, DF-PRV-022, DF-SET-023
-- ---------------------------------------------------------------------------
create or replace function public.delete_account()
returns void
language plpgsql
-- security definer is unavoidable: auth.users is not writable by `authenticated`,
-- and the ordered deletes below must not be filtered a second time by row level
-- security. Taking no arguments is the containment - the subject can only ever be
-- whoever called it. ADR-014.
security definer
-- Empty search_path per DF-SEC-004: a security definer function with a mutable
-- search_path can be induced to call an attacker's function of the same name.
-- Every reference below is therefore schema-qualified.
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    -- Only reachable if execute is granted more widely than it is below. A
    -- session-less caller has no account to delete, so this is a defect report
    -- rather than a user-facing message.
    raise exception 'Account deletion requires an authenticated session'
      using errcode = 'DF040';
  end if;

  -- is_local => true keeps the flag out of the session's persistent state, so it
  -- cannot survive this transaction into a later statement on a pooled
  -- connection. The cascade that needs it runs inside the delete below.
  perform set_config('dayflow.account_deletion', 'on', true);

  -- Row level security does not apply to the owner of these tables, so the
  -- filter on user_id is the only thing scoping these statements. DF-SEC-004.
  --
  -- These two are removed by hand, in this order, because the foreign keys above
  -- them are `on delete restrict` (DF-CAT-022). A restrict check cannot be
  -- deferred, and the order in which PostgreSQL fires the cascade triggers
  -- hanging off auth.users is not part of its contract, so leaving these to the
  -- cascade would work or fail depending on an implementation detail.
  delete from public.moments where user_id = v_user_id;
  delete from public.categories where user_id = v_user_id;

  -- Everything else reaches auth.users through `on delete cascade` and goes with
  -- it: parent_categories, profiles, settings, goals, ai_reports, ai_usage,
  -- push_subscriptions and this user's feature_flags rows, together with the
  -- identities, sessions and refresh tokens Supabase keeps in the auth schema.
  -- Restating those deletes here would be a second copy of the schema, and it
  -- would be the copy nobody updates when a table is added.
  --
  -- A feature flag with a null user_id is global rather than owned. A null
  -- matches no cascade, so those rows correctly survive the account.
  delete from auth.users where id = v_user_id;
end;
$$;

comment on function public.delete_account() is
  'Irreversibly deletes the calling user and every row belonging to them. Subject is auth.uid(); takes no arguments by design. DF-PRV-021.';

-- create function grants execute to public by default, so the revoke is the part
-- that matters here. `authenticated` is granted it back because DF-PRV-024
-- requires the user to be able to exercise this right without asking anyone,
-- and service_role is not: nothing in this product deletes an account on
-- somebody's behalf, and auth.uid() is null there in any case.
revoke all on function public.delete_account() from public, anon, service_role;

grant execute on function public.delete_account() to authenticated;
