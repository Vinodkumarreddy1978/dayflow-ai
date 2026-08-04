-- =============================================================================
-- 0004 - Moments
-- Reference: docs/02-product/11-prd-core-moments-and-categories.md section 2
--            docs/04-architecture/24-data-model-and-erd.md section 3
-- =============================================================================

create table if not exists public.moments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  category_id       uuid not null,

  start_at          timestamptz not null,
  -- Null means pending: a real, saved record waiting for its ending, not a draft.
  end_at            timestamptz,

  -- Generated rather than maintained, so it can never drift out of agreement
  -- with the timestamps. Stored so it is indexable for duration search.
  duration_minutes  integer generated always as (
                      case
                        when end_at is null then null
                        else floor(extract(epoch from (end_at - start_at)) / 60)::integer
                      end
                    ) stored,

  status            public.moment_status not null default 'pending',
  source            public.moment_source not null default 'manual',
  note              text check (note is null or char_length(note) <= 500),

  -- Reminder bookkeeping lives on the row rather than in a schedule table, which
  -- is what makes the reminder job idempotent by construction. DF-REM-010.
  last_reminder_at  timestamptz,
  warned_at         timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint moments_category_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete restrict,

  -- Keeps status and timestamps from ever disagreeing.
  constraint status_matches_end_at check (
    (status = 'pending' and end_at is null)
    or (status in ('completed', 'auto_closed') and end_at is not null)
  ),

  -- DF-MOM-010
  constraint end_after_start check (end_at is null or end_at > start_at),

  -- DF-MOM-013. Anything longer is a forgotten entry, not an activity.
  constraint max_duration check (
    end_at is null or (end_at - start_at) <= interval '24 hours'
  ),

  -- DF-MOM-014
  constraint no_duplicate_moment unique (user_id, category_id, start_at)
);

-- Serves every range query, the timeline and the calendar.
create index if not exists moments_user_start_idx
  on public.moments (user_id, start_at desc);

-- Pending Moments are a tiny fraction of the table, and the reminder job scans
-- for them every ten minutes across all users. A partial index keeps that cheap.
create index if not exists moments_pending_idx
  on public.moments (user_id, start_at)
  where status = 'pending';

create index if not exists moments_reminder_scan_idx
  on public.moments (start_at, last_reminder_at)
  where status = 'pending';

create index if not exists moments_user_category_start_idx
  on public.moments (user_id, category_id, start_at desc);
