-- =============================================================================
-- 0009 - New user provisioning
-- Reference: docs/02-product/11-prd-core-moments-and-categories.md section 5
--
-- Everything happens in one transaction with the user's creation. A user must
-- never reach the dashboard before their categories exist (DF-UX-011), and a
-- partially seeded account would be worse than an empty one.
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

  insert into public.settings (user_id) values (new.id);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
