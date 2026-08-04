-- =============================================================================
-- 0012 - Realtime publication
-- Reference: docs/04-architecture/27-state-and-sync-strategy.md
--
-- Multi-device sync (DF-SYN-020) does not work until the tables are explicitly
-- published. Without this migration everything appears healthy - the channel
-- subscribes, no error is raised - and changes simply never arrive on the second
-- device, which is a difficult failure to diagnose from the client side.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'moments', 'categories', 'parent_categories', 'settings', 'goals'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Replica identity
--
-- Subtle but load-bearing. The client subscribes with `user_id=eq.<id>`, and
-- under the default replica identity a DELETE payload carries only the primary
-- key - so it never matches that filter and the deletion is never delivered. A
-- Moment deleted on a phone would linger on the laptop until a manual refresh.
--
-- FULL makes the old row available to the filter. It widens the write-ahead log,
-- which at personal-tracker volumes is an irrelevant cost.
-- ---------------------------------------------------------------------------
alter table public.moments           replica identity full;
alter table public.categories        replica identity full;
alter table public.parent_categories replica identity full;
alter table public.settings          replica identity full;
alter table public.goals             replica identity full;
