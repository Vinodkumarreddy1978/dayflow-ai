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
