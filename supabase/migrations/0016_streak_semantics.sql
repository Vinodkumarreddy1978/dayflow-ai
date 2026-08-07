-- =============================================================================
-- 0016 - Streak semantics: a streak counts days that were actually recorded
-- Reference: docs/02-product/14-prd-goals-streaks-and-productivity-score.md
--            DF-GOA-030 to DF-GOA-037
--            docs/00-governance/04-decision-log.md ADR-016
-- =============================================================================

-- get_streak as written in 0010 walked a fixed window of `0 .. 730` days and
-- asked one question per day: did this day violate the goal? For an `at_most`
-- goal a day with no data violates nothing - zero minutes is under any target -
-- so every unrecorded day counted. A brand-new account therefore reported a
-- "731 day streak" on the day it was created, 731 being the length of the loop
-- rather than any property of the user.
--
-- Three things were wrong.
--
-- 1. A day with no Moments at all is not evidence of restraint.
--
--    DF-GOA-032 counts zero minutes toward an `at_most` streak, and acceptance
--    criterion 3 of the PRD states the case it is protecting: "a day with zero
--    minutes OF THAT CATEGORY". That is a day the user recorded eight hours of
--    Work and no Social Media - a real observation about a real day. A day on
--    which nothing whatever was recorded is not an observation; it is the
--    absence of one, and DF-GOA-033 already says so for the other direction:
--    "absence of evidence is treated as absence... the alternative would reward
--    not recording, which directly attacks the North Star metric".
--
--    The specification never says which of those two rules governs an `at_most`
--    day with no Moments. ADR-016 resolves the gap the way DF-GOA-033 argues:
--    a day counts toward a streak in either direction only if the user was
--    recording on it. Anything else pays people to close the app.
--
-- 2. The scan had no lower bound tied to the user. It now stops at the Local Day
--    the account was created, because no streak can predate the account.
--
-- 3. The day-by-day loop issued 731 separate calls to get_goal_achieved for
--    every daily goal on the Goals screen. That is replaced by one set-based
--    query over the user's own history.
--
-- DF-GOA-036 (today must not break a streak until the Local Day ends) now
-- covers an `at_most` day with nothing recorded yet. Under rule 1 such a streak
-- would otherwise break at 00:01 every single day, before the user has had any
-- chance to record anything - precisely the absurdity that requirement exists
-- to prevent. It was previously applied to `at_least` only, because under the
-- old rule an `at_most` day could never fail for lack of data.
--
-- An `at_most` goal already over its target today still breaks, as before:
-- spent minutes cannot be unspent, so that failure is settled rather than
-- pending, and carrying the streak on would be showing the user a number
-- already known to be wrong.
--
-- Progress and the "Met" badge are deliberately untouched: for the current
-- period, DF-GOA-032 is exactly right as written and zero minutes is met. This
-- migration changes what counts as a link in a chain of days, not what counts
-- as meeting a goal today.
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
  v_type       public.goal_target_type;
  v_target_id  uuid;
  v_first_day  date;
  v_current    integer := 0;
  v_longest    integer := 0;
  v_running    integer := 0;
  v_broken     boolean := false;
  v_met        boolean;
  r            record;
  -- A ceiling on the series, not a semantic bound. It exists so that a profile
  -- row with an implausible created_at cannot ask Postgres to generate an
  -- unbounded number of rows; ten years is longer than this product has existed.
  v_max_days   constant integer := 3660;
begin
  select g.direction, g.target_minutes, g.period, g.target_type, g.target_id
    into v_direction, v_target, v_period, v_type, v_target_id
  from public.goals g
  where g.id = p_goal_id and g.user_id = auth.uid();

  -- DF-GOA-030: streaks are computed for daily goals only. A "3 week streak" of
  -- a weekly goal needs a definition this product has not agreed on.
  if v_target is null or v_period <> 'daily' then
    return query select 0, 0;
    return;
  end if;

  v_tz    := public.current_user_timezone();
  v_today := (now() at time zone v_tz)::date;

  -- The account's own first Local Day. Read through RLS like everything else
  -- here, so it can only ever be the caller's own row.
  select (p.created_at at time zone v_tz)::date
    into v_first_day
  from public.profiles p
  where p.id = auth.uid();

  v_first_day := greatest(coalesce(v_first_day, v_today), v_today - v_max_days);

  -- A profile created later today in a timezone ahead of the server's clock.
  -- There is no history to walk and no streak to report.
  if v_first_day > v_today then
    return query select 0, 0;
    return;
  end if;

  for r in
    with bounds as (
      select
        d::date                                      as day,
        (d::date::timestamp) at time zone v_tz       as day_start,
        ((d::date + 1)::timestamp) at time zone v_tz as day_end
      from generate_series(v_first_day, v_today, interval '1 day') d
    ),
    per_day as (
      select
        b.day,
        -- Minutes against this goal's target, clamped to the Local Day exactly
        -- as get_goal_achieved and get_daily_totals clamp them, so a Moment
        -- spanning midnight splits identically everywhere (ADR-010).
        coalesce(round(sum(
          case
            when (v_type = 'category' and c.id = v_target_id)
              or (v_type = 'parent_category' and c.parent_category_id = v_target_id)
            then extract(epoch from (
                   least(coalesce(m.end_at, now()), b.day_end)
                   - greatest(m.start_at, b.day_start)
                 )) / 60.0
            else 0
          end
        )), 0) as goal_minutes,
        -- Moments in any category. This is the "was the user recording at all"
        -- signal that separates keeping under an hour of Social Media from
        -- having no idea what the day contained.
        count(m.id) as moment_count
      from bounds b
      left join public.moments m
        on m.user_id = auth.uid()
       and m.start_at < b.day_end
       and coalesce(m.end_at, now()) > b.day_start
      left join public.categories c on c.id = m.category_id
      group by b.day
    )
    select pd.day, pd.goal_minutes, pd.moment_count
    from per_day pd
    order by pd.day desc
  loop
    if v_direction = 'at_least' then
      -- DF-GOA-031, and DF-GOA-033 for free: a day with no Moments has no
      -- minutes, so it fails this comparison without a special case.
      v_met := r.goal_minutes >= v_target;
    else
      -- DF-GOA-032 as clarified by DF-GOA-037: at or below the target, on a day
      -- the user was demonstrably recording.
      v_met := r.moment_count > 0 and r.goal_minutes <= v_target;
    end if;

    if v_met then
      v_running := v_running + 1;
      v_longest := greatest(v_longest, v_running);
      if not v_broken then
        v_current := v_running;
      end if;
    elsif r.day = v_today
      and not (v_direction = 'at_most' and r.goal_minutes > v_target) then
      -- DF-GOA-036. The Local Day is still in progress, so today neither counts
      -- toward the streak nor breaks it.
      --
      -- The exception is an at_most goal already over its target: minutes that
      -- have been spent cannot be unspent, so that failure is settled and
      -- pretending otherwise would show a streak already known to be dead. An
      -- at_most day with nothing recorded yet is not settled, which is the case
      -- DF-GOA-037 introduces and the reason this guard is no longer a plain
      -- test on direction.
      null;
    else
      v_running := 0;
      v_broken  := true;
    end if;
  end loop;

  return query select v_current, v_longest;
end;
$$;

comment on function public.get_streak(uuid) is
  'Current and longest streak for a daily goal. A day counts only if the user recorded at least one Moment on it (DF-GOA-037), the scan starts at the account creation date, and today never breaks the streak (DF-GOA-036).';
