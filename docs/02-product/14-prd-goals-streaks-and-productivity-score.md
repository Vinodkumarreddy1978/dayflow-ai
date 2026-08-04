# 14 - PRD: Goals, Streaks and Productivity Score

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-014 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The motivation layer: targets the user sets, consistency they build, and a single summary
number they define themselves. These features convert passive measurement into something
that changes behaviour.

## 2. Design stance

Motivation mechanics are easy to get wrong in a way that causes harm. Three rules
constrain everything below:

1. **Never manufacture guilt.** A missed goal is information. The interface reports it
   without scolding, because a tool that makes the user feel bad about opening it will
   stop being opened.
2. **Never reward dishonesty.** No mechanic may make fabricating a Moment attractive. This
   is why streaks cannot be repaired retroactively without the correction being visible.
3. **The user owns the definition of success.** DayFlow AI does not decide that coding is
   productive and gaming is not.

## 3. Goals

### 3.1 Model

| Field            | Type        | Notes                            |
| ---------------- | ----------- | -------------------------------- |
| `id`             | uuid        |                                  |
| `user_id`        | uuid        |                                  |
| `target_type`    | enum        | `category` or `parent_category`. |
| `target_id`      | uuid        | The Category or Parent Category. |
| `period`         | enum        | `daily`, `weekly`, `monthly`.    |
| `direction`      | enum        | `at_least` or `at_most`.         |
| `target_minutes` | integer     | Greater than zero.               |
| `is_active`      | boolean     | Default true.                    |
| `created_at`     | timestamptz |                                  |

`direction` is what makes goals work for distraction as well as ambition. "At least 60
minutes of Gym per day" and "at most 30 minutes of Social Media per day" are equally
first-class, and the second is often the more valuable one.

### 3.2 Requirements

| ID         | Requirement                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| DF-GOA-001 | A user MUST be able to create goals against a Category or a Parent Category.                 |
| DF-GOA-002 | Daily, weekly and monthly periods MUST be supported.                                         |
| DF-GOA-003 | Both `at_least` and `at_most` directions MUST be supported.                                  |
| DF-GOA-004 | Multiple goals MAY target the same Category with different periods.                          |
| DF-GOA-005 | A goal MUST be editable and deactivatable without deleting its history.                      |
| DF-GOA-006 | Progress MUST be shown as achieved minutes against target, with a percentage and a bar.      |
| DF-GOA-007 | Progress MUST update within the sync target when a relevant Moment changes.                  |
| DF-GOA-008 | An exceeded `at_least` goal MUST be shown as met, with any surplus displayed.                |
| DF-GOA-009 | An exceeded `at_most` goal MUST be shown as exceeded, neutrally, with the overage displayed. |
| DF-GOA-010 | Weekly progress MUST use the configured week start; monthly MUST use the calendar month.     |
| DF-GOA-011 | Editing a goal's target MUST NOT retroactively re-evaluate completed periods.                |

DF-GOA-011 prevents a user from lowering yesterday's target to turn a miss into a hit. The
past is fixed.

### 3.3 Notifications

| ID         | Requirement                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| DF-GOA-020 | An optional reminder MAY be sent at a user-chosen time when a daily goal is unmet. |
| DF-GOA-021 | Goal notifications MUST be off by default and MUST be individually controllable.   |
| DF-GOA-022 | At most one goal notification MUST be sent per day, combining all unmet goals.     |
| DF-GOA-023 | Goal notifications MUST respect Quiet Hours.                                       |

## 4. Streaks

### 4.1 Definition

A streak counts consecutive Local Days on which a daily goal was met. Both current and
longest streaks are tracked per goal.

| ID         | Requirement                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| DF-GOA-030 | Streaks MUST be computed for daily goals only.                                                                  |
| DF-GOA-031 | A day counts toward an `at_least` streak when the target is met or exceeded.                                    |
| DF-GOA-032 | A day counts toward an `at_most` streak when actual time is at or below the target, **including zero minutes**. |
| DF-GOA-033 | A day with no Moments at all MUST break an `at_least` streak.                                                   |
| DF-GOA-034 | Both current and longest streaks MUST be stored and displayed.                                                  |
| DF-GOA-035 | Streaks MUST recompute correctly when historical Moments are added or edited.                                   |
| DF-GOA-036 | Today MUST NOT break a streak until the Local Day ends.                                                         |

DF-GOA-033 is deliberate and slightly harsh: absence of evidence is treated as absence.
The alternative - not counting empty days as breaks - would reward not recording, which
directly attacks the North Star metric.

DF-GOA-036 avoids the absurdity of a streak appearing broken at 09:00 because the user has
not yet been to the gym.

### 4.2 Presentation

| ID         | Requirement                                                                               |
| ---------- | ----------------------------------------------------------------------------------------- |
| DF-GOA-040 | The dashboard MUST show current streaks for all active daily goals.                       |
| DF-GOA-041 | A broken streak MUST be reported factually, showing the previous length. No admonishment. |
| DF-GOA-042 | Reaching a personal best MUST be acknowledged once.                                       |
| DF-GOA-043 | A streak at risk MAY be surfaced late in the day if the user has enabled goal reminders.  |
| DF-GOA-044 | Streak history MUST be viewable as a calendar of hit and missed days.                     |

## 5. Productivity Score

### 5.1 Concept

A single number from 0 to 100 for a Local Day, computed from weights the user assigns to
their own Parent Categories. It exists to answer "was that a good day?" in one glance -
and it only works because the user, not the vendor, defines what good means.

**It is explicitly not comparable between users.** Two people with identical days will
score differently, and that is correct.

### 5.2 Formula

For each Parent Category _p_ with minutes _m(p)_ and weight _w(p)_ in the range -1 to +1:

```
raw   = sum( m(p) x w(p) ) for all p
denom = sum( m(p) ) for all p with w(p) > 0
score = clamp( 0, 100, 50 + 50 x ( raw / max(denom, 1) ) )
```

A day with only positively weighted time scores near 100. A day with only negatively
weighted time scores near 0. A day with none recorded has no score rather than a zero -
absence of data is not a bad day.

| ID         | Requirement                                                                                |
| ---------- | ------------------------------------------------------------------------------------------ |
| DF-GOA-050 | Each Parent Category MUST have a user-assignable weight between -1 and +1 in steps of 0.1. |
| DF-GOA-051 | Default weights MUST be seeded: Work +0.8, Learning +1.0, Health +0.9, Personal +0.3,      |
|            | Entertainment 0.0, Distracted Time -0.8.                                                   |
| DF-GOA-052 | The score MUST be recomputed whenever a Moment or a weight changes.                        |
| DF-GOA-053 | Changing weights MUST recompute historical scores, with the user warned first.             |
| DF-GOA-054 | A day with no Moments MUST show no score, never zero.                                      |
| DF-GOA-055 | The score MUST be expandable to show each category's contribution.                         |
| DF-GOA-056 | The score MUST be disableable; when disabled it MUST disappear from all views.             |
| DF-GOA-057 | Weekly and monthly scores MUST be the mean of days that have a score.                      |

DF-GOA-051's Entertainment weight of exactly 0.0 is a deliberate statement: relaxation is
neither virtuous nor wasteful. Users who disagree can move it in either direction, which is
the point.

DF-GOA-055 exists because an unexplained number is not trustworthy. The user must be able
to see why today scored 62.

### 5.3 Presentation

| ID         | Requirement                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| DF-GOA-060 | The dashboard MUST show today's score with its trend against the 7-day average.  |
| DF-GOA-061 | The score MUST be shown on a neutral scale, never with a pass or fail threshold. |
| DF-GOA-062 | A score trend chart MUST be available for weekly, monthly and yearly ranges.     |
| DF-GOA-063 | The interface MUST make clear that the formula is user-defined.                  |

## 6. Acceptance criteria

1. A goal of at least 60 minutes of Gym daily shows 45/60 and 75% after a 45-minute Moment.
2. A goal of at most 30 minutes of Social Media shows as exceeded, neutrally, at 50 minutes.
3. An at-most streak counts a day with zero minutes of that category as a success.
4. An at-least streak breaks on a day with no Moments at all.
5. Adding a Moment for three days ago correctly repairs or extends the streak through that day.
6. A day of 4h Learning and 1h Distracted, with default weights, scores above 50.
7. A day of 4h Distracted alone scores below 50.
8. A day with no Moments shows no score.
9. Changing the Entertainment weight warns that historical scores will change.
10. Disabling the score removes it from the dashboard, analytics and reports.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
