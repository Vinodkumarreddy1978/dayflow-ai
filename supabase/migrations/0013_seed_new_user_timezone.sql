-- =============================================================================
-- 0013 - New user provisioning reads the signup timezone
-- Reference: docs/02-product/16-prd-settings-and-customization.md
--            docs/00-governance/05-versioning-and-release-policy.md
--
-- The signup form has always sent the browser timezone as user metadata, but
-- 0009 only ever read display_name, so the value was discarded and every account
-- started in UTC. The client corrects it on first load, which means there is a
-- window in which the day boundary is wrong - and for anyone far from UTC, a
-- Moment recorded in that window is filed to the wrong Local Day.
--
-- 0009 is left exactly as it is because it has already been applied; a new file
-- is the only correct way to change an applied migration. Replacing the function
-- is the whole change: the trigger 0009 created resolves the function by name at
-- call time, so it picks this version up with no further work.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path per DF-SEC-004: a security definer function with a mutable
-- search_path can be induced to call an attacker's function of the same name.
set search_path = ''
as $$
declare
  v_timezone      text;
  v_work          uuid;
  v_learning      uuid;
  v_health        uuid;
  v_personal      uuid;
  v_entertainment uuid;
  v_distracted    uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  -- Metadata is client-supplied and settings.timezone carries no check
  -- constraint, so an unrecognised name would be accepted here and then fail
  -- much later inside the `at time zone` calls in 0010, where the cause is far
  -- from obvious. Validating against the catalogue keeps the failure local and
  -- degrades to UTC, which is what the column defaulted to before this file.
  v_timezone := nullif(trim(coalesce(new.raw_user_meta_data ->> 'timezone', '')), '');

  if v_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    v_timezone := 'UTC';
  end if;

  insert into public.settings (user_id, timezone) values (new.id, v_timezone);

  -- Parent categories -------------------------------------------------------
  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Work', '#2563eb', 'briefcase', 1)
  returning id into v_work;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Learning', '#4f46e5', 'book-open', 2)
  returning id into v_learning;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Health', '#16a34a', 'heart-pulse', 3)
  returning id into v_health;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Personal', '#0891b2', 'house', 4)
  returning id into v_personal;

  insert into public.parent_categories (user_id, name, color, icon, sort_order)
  values (new.id, 'Entertainment', '#9333ea', 'clapperboard', 5)
  returning id into v_entertainment;

  -- The one system parent category. Protected from rename and deletion, and
  -- always flagged as distraction. Uses the reserved distraction colour so the
  -- user learns to recognise it instantly across every chart (DF-CAT-032).
  insert into public.parent_categories
    (user_id, name, color, icon, is_system, is_distraction, sort_order)
  values (new.id, 'Distracted Time', '#e11d48', 'circle-alert', true, true, 6)
  returning id into v_distracted;

  -- Categories --------------------------------------------------------------
  -- Everything except Distracted Time itself is freely editable and deletable
  -- (DF-CAT-041). These exist so the first screen is never empty, not to impose
  -- a taxonomy.
  insert into public.categories (user_id, parent_category_id, name, icon, sort_order)
  values
    (new.id, v_work,          'Office',           'building-2',   1),
    (new.id, v_work,          'Meetings',         'users',        2),
    (new.id, v_work,          'Email',            'mail',         3),

    (new.id, v_learning,      'Reading',          'book',         1),
    (new.id, v_learning,      'Courses',          'graduation-cap', 2),
    (new.id, v_learning,      'Practice',         'code',         3),

    (new.id, v_health,        'Gym',              'dumbbell',     1),
    (new.id, v_health,        'Walking',          'footprints',   2),
    (new.id, v_health,        'Sleep',            'moon',         3),

    (new.id, v_personal,      'Family',           'heart',        1),
    (new.id, v_personal,      'Chores',           'brush',        2),
    (new.id, v_personal,      'Travel',           'car',          3),

    (new.id, v_entertainment, 'Movies',           'clapperboard', 1),
    (new.id, v_entertainment, 'Music',            'music',        2),
    (new.id, v_entertainment, 'Gaming',           'gamepad-2',    3),

    (new.id, v_distracted,    'Social Media',     'smartphone',   1),
    (new.id, v_distracted,    'Random Browsing',  'globe',        2);

  -- Productivity weights ----------------------------------------------------
  -- Keyed by the parent category ids just created. Entertainment is exactly 0.0
  -- as a deliberate statement: relaxation is neither virtuous nor wasteful.
  -- Users who disagree can move it either way, which is the entire point.
  update public.settings
  set productivity_weights = jsonb_build_object(
    v_work::text,          0.8,
    v_learning::text,      1.0,
    v_health::text,        0.9,
    v_personal::text,      0.3,
    v_entertainment::text, 0.0,
    v_distracted::text,   -0.8
  )
  where user_id = new.id;

  return new;
end;
$$;
