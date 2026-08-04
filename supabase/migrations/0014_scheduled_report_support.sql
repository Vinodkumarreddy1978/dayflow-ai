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
