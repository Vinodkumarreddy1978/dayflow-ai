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
