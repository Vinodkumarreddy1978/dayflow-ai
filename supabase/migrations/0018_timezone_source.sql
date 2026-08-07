-- =============================================================================
-- 0018 - A timezone the user chose is no longer overwritten by detection
-- Reference: docs/02-product/16-prd-settings-and-customization.md DF-SET-011
--            docs/04-architecture/25-database-schema-and-rls.md
-- =============================================================================

-- The client corrects `settings.timezone` whenever the browser disagrees with
-- the stored value. That correction was written when `0009` discarded the
-- sign-up timezone and every account therefore started in UTC; `0013` fixed the
-- seeding, and what was left behind was a correction with no way to tell a value
-- the user had chosen from one the app had guessed.
--
-- So choosing a timezone in Settings wrote the choice, the stored value changed,
-- the correction ran again, and the browser's zone was written straight back
-- over it. The setting could not be changed at all, and nothing in the interface
-- explained why. It is a data bug rather than a display one: every Local Day,
-- streak and chart is boundaried by this column.
--
-- This column is the missing distinction. Detection may correct a value it
-- produced itself. It must leave a chosen value alone, on every device and for
-- good, which is also what DF-SET-011 requires: changing the timezone has to
-- warn that historical day grouping will be recalculated, and a background
-- effect cannot warn anybody.
--
-- Rows that already exist are marked 'user' rather than taking the 'auto'
-- default. The database cannot tell which of them were chosen, and of the two
-- ways to be wrong, silently overwriting a real choice is the one the user
-- notices and cannot do anything about. Rows seeded by `handle_new_user` take
-- the default instead, because a value read from sign-up metadata is a detection
-- by definition - so that function needs no change here.

do $$
begin
  -- The backfill below is correct exactly once, on the transition. Guarding the
  -- whole block on the column's absence keeps this file safe to re-run, which
  -- supabase/all-migrations.sql tells people it is.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settings'
      and column_name = 'timezone_source'
  ) then
    return;
  end if;

  alter table public.settings
    add column timezone_source text not null default 'auto'
      constraint settings_timezone_source_check
        check (timezone_source in ('auto', 'user'));

  update public.settings set timezone_source = 'user';
end
$$;

comment on column public.settings.timezone_source is
  'auto = detected from the browser and may be corrected again; user = chosen in Settings and never overwritten.';
