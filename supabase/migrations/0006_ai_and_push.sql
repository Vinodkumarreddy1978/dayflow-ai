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
