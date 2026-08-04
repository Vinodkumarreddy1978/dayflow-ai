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
