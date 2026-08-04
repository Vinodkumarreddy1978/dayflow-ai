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
