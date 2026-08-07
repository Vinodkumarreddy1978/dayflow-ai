-- =============================================================================
-- 0017 - Write policies for the AI tables
-- Reference: docs/04-architecture/25-database-schema-and-rls.md DF-SEC-002
--            docs/02-product/15-prd-ai-insights-engine.md DF-AIA-030
-- =============================================================================

-- `0007` enabled row level security on `ai_reports` and `ai_usage` and then gave
-- each of them a select policy and, for reports, a delete policy. No insert or
-- update policy was ever written for either, on the reasoning recorded in the
-- comment there: "only the server writes them".
--
-- That reasoning does not survive contact with the architecture. The service
-- role client is the only caller that bypasses these policies, and
-- `src/lib/supabase/admin.ts` may not be imported outside `src/app/api/cron/`
-- (DF-SEC-005, DF-SEC-028, enforced by an ESLint rule). So the scheduled job
-- writes reports happily, while `POST /api/reports/generate` - which acts as the
-- signed-in user, because it must read that user's facts through RLS - had no
-- policy permitting the row it exists to write.
--
-- The effect on the live deployment was that "Generate report" on /insights
-- failed for every user, every time, with a row level security violation on the
-- final upsert. The report itself had already been built correctly by then; only
-- persisting it failed, which is why the failure looked like an AI problem and
-- was not one. It is not related to how much history the account has, and not
-- related to AI configuration: `settings.ai_consent` defaults to false, so the
-- provider is not even consulted on a new account.
--
-- DF-SEC-002 requires explicit select, insert, update and delete policies on
-- every table, so this closes an outright gap rather than relaxing a stance.
-- Both policies are scoped to the caller's own rows, which is the same trust
-- level the user already has over `moments` and `goals`: the worst a forged row
-- can do is mislead its own author.

-- ---------------------------------------------------------------------------
-- ai_reports
--
-- Update as well as insert, because regeneration is an upsert on
-- (user_id, period_type, period_start) and a conflicting upsert is executed as
-- an update - which fails on a missing update policy just as surely.
-- ---------------------------------------------------------------------------
drop policy if exists ai_reports_insert on public.ai_reports;
create policy ai_reports_insert on public.ai_reports
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists ai_reports_update on public.ai_reports;
create policy ai_reports_update on public.ai_reports
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ai_usage
--
-- `recordUsage` in src/lib/ai/report.ts has no caller today, so nothing is
-- currently blocked here. The policies are added anyway: the omission is the
-- same one, in the same migration, and leaving it in place means the first
-- caller to record a model call discovers it in production the way this one was
-- discovered. There is deliberately no update or delete policy - DF-AIA-040
-- wants spend recorded rather than editable, and an append-only usage log is
-- what makes it worth reading.
-- ---------------------------------------------------------------------------
drop policy if exists ai_usage_insert on public.ai_usage;
create policy ai_usage_insert on public.ai_usage
  for insert to authenticated with check (user_id = (select auth.uid()));
