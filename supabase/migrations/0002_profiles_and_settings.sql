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
