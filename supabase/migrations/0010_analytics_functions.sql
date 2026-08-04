-- =============================================================================
-- 0010 - Analytics functions
-- Reference: docs/02-product/13-prd-analytics-and-visualization.md
--            DF-ANA-092: aggregation happens here, never by shipping raw rows
--            to the client. A lifetime view for a three-year user is tens of
--            thousands of Moments, and summing those on a phone is not a design.
--
-- Every function is `security invoker`, so row level security applies normally
-- and none of them can leak another user's data even if called with unexpected
-- arguments.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The user's timezone. All Local Day grouping depends on it (DF-MOM-042).
-- ---------------------------------------------------------------------------
create or replace function public.current_user_timezone()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select s.timezone from public.settings s where s.user_id = auth.uid()),
    'UTC'
  );
$$;

-- ---------------------------------------------------------------------------
-- Time per category or parent category across a range.
--
-- Clamped to the range boundaries, which is what makes a Moment that starts
-- before the range or ends after it contribute only its overlapping portion.
-- ---------------------------------------------------------------------------
create or replace function public.get_time_by_category(
  p_start                date,
  p_end                  date,
  p_grouping             text    default 'parent_category',
  p_include_estimated    boolean default true,
  p_include_distraction  boolean default true
)
returns table (
  group_id       uuid,
  group_name     text,
  group_color    text,
  parent_name    text,
  is_distraction boolean,
  minutes        numeric,
  moment_count   bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
begin
  v_tz   := public.current_user_timezone();
  v_from := (p_start::timestamp) at time zone v_tz;
  v_to   := ((p_end + 1)::timestamp) at time zone v_tz;

  return query
  with sliced as (
    select
      c.id                as category_id,
      c.name              as category_name,
      coalesce(c.color, p.color) as category_color,
      p.id                as parent_id,
      p.name              as parent_name,
      p.color             as parent_color,
      p.is_distraction    as parent_is_distraction,
      m.id                as moment_id,
      extract(epoch from (
        least(coalesce(m.end_at, now()), v_to)
        - greatest(m.start_at, v_from)
      )) / 60.0           as minutes
    from public.moments m
    join public.categories c        on c.id = m.category_id
    join public.parent_categories p on p.id = c.parent_category_id
    where m.user_id = auth.uid()
      and m.start_at < v_to
      and coalesce(m.end_at, now()) > v_from
      and (p_include_estimated or m.status <> 'auto_closed')
      and (p_include_distraction or p.is_distraction = false)
  )
  select
    case when p_grouping = 'category' then s.category_id else s.parent_id end,
    case when p_grouping = 'category' then s.category_name else s.parent_name end,
    case when p_grouping = 'category' then s.category_color else s.parent_color end,
    s.parent_name,
    s.parent_is_distraction,
    round(sum(s.minutes))::numeric,
    count(distinct s.moment_id)
  from sliced s
  group by 1, 2, 3, s.parent_name, s.parent_is_distraction
  having sum(s.minutes) > 0
  order by 6 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Minutes per Local Day.
--
-- This is where ADR-010's midnight split lives. A Moment from 22:30 to 01:30
-- contributes 90 minutes to each of two days rather than 180 to the first,
-- because attributing a whole overnight sleep to the previous day would render
-- an eight-hour block followed by an empty morning.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_totals(
  p_start               date,
  p_end                 date,
  p_include_estimated   boolean default true
)
returns table (
  day                date,
  minutes            numeric,
  distracted_minutes numeric,
  moment_count       bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz text;
begin
  v_tz := public.current_user_timezone();

  return query
  with days as (
    select generate_series(p_start, p_end, interval '1 day')::date as day
  ),
  bounded as (
    select
      d.day,
      (d.day::timestamp) at time zone v_tz       as day_start,
      ((d.day + 1)::timestamp) at time zone v_tz as day_end
    from days d
  ),
  sliced as (
    select
      b.day,
      m.id as moment_id,
      p.is_distraction,
      extract(epoch from (
        least(coalesce(m.end_at, now()), b.day_end)
        - greatest(m.start_at, b.day_start)
      )) / 60.0 as minutes
    from bounded b
    join public.moments m
      on m.user_id = auth.uid()
     and m.start_at < b.day_end
     and coalesce(m.end_at, now()) > b.day_start
    join public.categories c        on c.id = m.category_id
    join public.parent_categories p on p.id = c.parent_category_id
    where p_include_estimated or m.status <> 'auto_closed'
  )
  select
    b.day,
    coalesce(round(sum(s.minutes)), 0)::numeric,
    coalesce(round(sum(s.minutes) filter (where s.is_distraction)), 0)::numeric,
    count(distinct s.moment_id)
  from bounded b
  left join sliced s on s.day = b.day
  group by b.day
  order by b.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- One day's Moments, in full, for the timeline and day detail screens.
-- ---------------------------------------------------------------------------
create or replace function public.get_day_breakdown(p_date date)
returns table (
  moment_id       uuid,
  category_id     uuid,
  category_name   text,
  parent_id       uuid,
  parent_name     text,
  color           text,
  is_distraction  boolean,
  start_at        timestamptz,
  end_at          timestamptz,
  status          public.moment_status,
  minutes_in_day  numeric,
  note            text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz        text;
  v_day_start timestamptz;
  v_day_end   timestamptz;
begin
  v_tz        := public.current_user_timezone();
  v_day_start := (p_date::timestamp) at time zone v_tz;
  v_day_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  return query
  select
    m.id,
    c.id,
    c.name,
    p.id,
    p.name,
    coalesce(c.color, p.color),
    p.is_distraction,
    m.start_at,
    m.end_at,
    m.status,
    round(extract(epoch from (
      least(coalesce(m.end_at, now()), v_day_end)
      - greatest(m.start_at, v_day_start)
    )) / 60.0)::numeric,
    m.note
  from public.moments m
  join public.categories c        on c.id = m.category_id
  join public.parent_categories p on p.id = c.parent_category_id
  where m.user_id = auth.uid()
    and m.start_at < v_day_end
    and coalesce(m.end_at, now()) > v_day_start
  order by m.start_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Achieved minutes for a goal's target, over an arbitrary day range.
-- ---------------------------------------------------------------------------
create or replace function public.get_goal_achieved(
  p_goal_id uuid,
  p_start   date,
  p_end     date
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz      text;
  v_from    timestamptz;
  v_to      timestamptz;
  v_type    public.goal_target_type;
  v_target  uuid;
  v_minutes numeric;
begin
  select g.target_type, g.target_id into v_type, v_target
  from public.goals g
  where g.id = p_goal_id and g.user_id = auth.uid();

  if v_target is null then
    return 0;
  end if;

  v_tz   := public.current_user_timezone();
  v_from := (p_start::timestamp) at time zone v_tz;
  v_to   := ((p_end + 1)::timestamp) at time zone v_tz;

  select coalesce(round(sum(
    extract(epoch from (
      least(coalesce(m.end_at, now()), v_to)
      - greatest(m.start_at, v_from)
    )) / 60.0
  )), 0)
  into v_minutes
  from public.moments m
  join public.categories c on c.id = m.category_id
  where m.user_id = auth.uid()
    and m.start_at < v_to
    and coalesce(m.end_at, now()) > v_from
    and (
      (v_type = 'category'        and c.id = v_target)
      or (v_type = 'parent_category' and c.parent_category_id = v_target)
    );

  return coalesce(v_minutes, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Current and longest streak for a daily goal.
--
-- Walks backwards day by day. DF-GOA-033: a day with no data at all breaks an
-- at_least streak, because the alternative rewards not recording. DF-GOA-036:
-- today cannot break a streak until the Local Day has ended.
-- ---------------------------------------------------------------------------
create or replace function public.get_streak(p_goal_id uuid)
returns table (current_streak integer, longest_streak integer)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz         text;
  v_today      date;
  v_direction  public.goal_direction;
  v_target     integer;
  v_period     public.goal_period;
  v_day        date;
  v_achieved   numeric;
  v_met        boolean;
  v_current    integer := 0;
  v_longest    integer := 0;
  v_running    integer := 0;
  v_broken     boolean := false;
  v_scan_limit integer := 730;
  i            integer;
begin
  select g.direction, g.target_minutes, g.period
  into v_direction, v_target, v_period
  from public.goals g
  where g.id = p_goal_id and g.user_id = auth.uid();

  if v_target is null or v_period <> 'daily' then
    return query select 0, 0;
    return;
  end if;

  v_tz    := public.current_user_timezone();
  v_today := (now() at time zone v_tz)::date;

  for i in 0 .. v_scan_limit loop
    v_day := v_today - i;
    v_achieved := public.get_goal_achieved(p_goal_id, v_day, v_day);

    if v_direction = 'at_least' then
      v_met := v_achieved >= v_target;
    else
      -- DF-GOA-032: zero minutes satisfies an at_most goal.
      v_met := v_achieved <= v_target;
    end if;

    if v_met then
      v_running := v_running + 1;
      if not v_broken then
        v_current := v_running;
      end if;
    else
      -- Today in progress must not count as a break yet.
      if i = 0 and v_direction = 'at_least' then
        null;
      else
        v_longest := greatest(v_longest, v_running);
        v_running := 0;
        v_broken  := true;
      end if;
    end if;
  end loop;

  v_longest := greatest(v_longest, v_running, v_current);
  return query select v_current, v_longest;
end;
$$;

-- ---------------------------------------------------------------------------
-- Productivity score for a Local Day.
--
-- Formula per docs/02-product/14 section 5.2. Returns null rather than zero for
-- a day with no data (DF-GOA-054): absence of a record is not a bad day.
-- ---------------------------------------------------------------------------
create or replace function public.get_productivity_score(p_date date)
returns numeric
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_weights jsonb;
  v_raw     numeric := 0;
  v_denom   numeric := 0;
  v_any     boolean := false;
  r         record;
  v_weight  numeric;
begin
  select s.productivity_weights into v_weights
  from public.settings s where s.user_id = auth.uid();

  v_weights := coalesce(v_weights, '{}'::jsonb);
  v_tz      := public.current_user_timezone();
  v_start   := (p_date::timestamp) at time zone v_tz;
  v_end     := ((p_date + 1)::timestamp) at time zone v_tz;

  for r in
    select
      p.id as parent_id,
      sum(extract(epoch from (
        least(coalesce(m.end_at, now()), v_end)
        - greatest(m.start_at, v_start)
      )) / 60.0) as minutes
    from public.moments m
    join public.categories c        on c.id = m.category_id
    join public.parent_categories p on p.id = c.parent_category_id
    where m.user_id = auth.uid()
      and m.start_at < v_end
      and coalesce(m.end_at, now()) > v_start
    group by p.id
  loop
    v_any    := true;
    v_weight := coalesce((v_weights ->> r.parent_id::text)::numeric, 0);
    v_raw    := v_raw + (r.minutes * v_weight);
    if v_weight > 0 then
      v_denom := v_denom + r.minutes;
    end if;
  end loop;

  if not v_any then
    return null;
  end if;

  return greatest(0, least(100, round(50 + 50 * (v_raw / greatest(v_denom, 1)))));
end;
$$;

-- ---------------------------------------------------------------------------
-- The deterministic fact bundle the AI layer consumes.
--
-- ADR-011: the model receives finished figures and never a raw Moment, so there
-- is nothing for it to miscalculate. Category names are included because
-- "category 7 rose 40%" would be useless; this is disclosed in the consent text
-- rather than buried (DF-AIA-003).
-- ---------------------------------------------------------------------------
create or replace function public.get_period_facts(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_days       integer := (p_end - p_start) + 1;
  v_prev_start date    := p_start - v_days;
  v_prev_end   date    := p_start - 1;
  v_result     jsonb;
begin
  select jsonb_build_object(
    'period', jsonb_build_object(
      'start', p_start, 'end', p_end, 'days', v_days
    ),
    'totals', (
      select jsonb_build_object(
        'recordedMinutes',   coalesce(sum(d.minutes), 0),
        'distractedMinutes', coalesce(sum(d.distracted_minutes), 0),
        'momentCount',       coalesce(sum(d.moment_count), 0),
        'daysWithData',      count(*) filter (where d.minutes > 0),
        'averageMinutesPerDay',
          case when count(*) filter (where d.minutes > 0) = 0 then 0
          else round(coalesce(sum(d.minutes), 0)
                     / count(*) filter (where d.minutes > 0)) end
      )
      from public.get_daily_totals(p_start, p_end) d
    ),
    'byParentCategory', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', g.group_name,
        'isDistraction', g.is_distraction,
        'minutes', g.minutes,
        'momentCount', g.moment_count
      ) order by g.minutes desc), '[]'::jsonb)
      from public.get_time_by_category(p_start, p_end, 'parent_category') g
    ),
    'byCategory', (
      -- DF-AIA-004: capped so prompt size is bounded by the taxonomy, not by
      -- the number of Moments. A three-year user costs the same as a new one.
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', g.group_name,
          'parentName', g.parent_name,
          'minutes', g.minutes,
          'momentCount', g.moment_count
        ) as x
        from public.get_time_by_category(p_start, p_end, 'category') g
        order by g.minutes desc
        limit 15
      ) t
    ),
    'byDay', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day,
        'minutes', d.minutes,
        'distractedMinutes', d.distracted_minutes
      ) order by d.day), '[]'::jsonb)
      from public.get_daily_totals(p_start, p_end) d
    ),
    'comparison', jsonb_build_object(
      'previousPeriodMinutes', (
        select coalesce(sum(d.minutes), 0)
        from public.get_daily_totals(v_prev_start, v_prev_end) d
      )
    ),
    'quality', (
      select jsonb_build_object(
        'autoClosedCount', count(*) filter (where m.status = 'auto_closed')
      )
      from public.moments m
      where m.user_id = auth.uid()
        and m.start_at >= (p_start::timestamp) at time zone public.current_user_timezone()
        and m.start_at <  ((p_end + 1)::timestamp) at time zone public.current_user_timezone()
    )
  ) into v_result;

  return v_result;
end;
$$;
