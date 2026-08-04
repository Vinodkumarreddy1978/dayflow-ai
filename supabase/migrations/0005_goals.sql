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
