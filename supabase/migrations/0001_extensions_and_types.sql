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
