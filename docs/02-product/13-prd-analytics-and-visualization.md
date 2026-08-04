# 13 - PRD: Analytics and Visualization

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-013 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

What DayFlow AI shows the user about their own time, across which ranges, with which
controls. This is where recorded data becomes the reason to keep recording, so the
quality bar is the same as for capture itself.

## 2. Principles

1. **Every number must be verifiable.** All figures are computed deterministically from
   Moments, per ADR-011. A user who adds up the segments must reach the total.
2. **Comparison beats absolutes.** "22 hours of study" means little; "22 hours, up from
   14 last month" means something.
3. **The user controls the view.** Range, grouping, distraction visibility and estimated
   data inclusion are all toggles, not fixed editorial choices.
4. **Empty states teach.** A new user with three Moments still sees something useful.
5. **Charts must work on a 320px screen.** Mobile is the primary review surface.

## 3. Ranges

| Range    | Period           | Default view                         |
| -------- | ---------------- | ------------------------------------ |
| Daily    | One Local Day    | Timeline plus category breakdown     |
| Weekly   | Monday to Sunday | Stacked bars per day plus totals     |
| Monthly  | Calendar month   | Stacked bars per day plus heat map   |
| Yearly   | Calendar year    | Bars per month plus trends           |
| Lifetime | Everything       | Totals, records and long-term trends |

| ID         | Requirement                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------- |
| DF-ANA-001 | All five ranges MUST be available.                                                          |
| DF-ANA-002 | The user MUST be able to step to the previous and next period, and jump to a specific date. |
| DF-ANA-003 | The week start day MUST be configurable, defaulting to Monday.                              |
| DF-ANA-004 | Navigating beyond available data MUST show an informative empty state, not an error.        |
| DF-ANA-005 | The selected range MUST persist across sessions.                                            |

## 4. Controls

These four controls appear on every applicable view. Together they are what make the
analytics genuinely the user's rather than the vendor's.

| ID         | Control                | Behaviour                                                                                          |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| DF-ANA-010 | Grouping               | Switch between Parent Category and Category. Persisted per view.                                   |
| DF-ANA-011 | Distraction visibility | Show or hide all Parent Categories with `is_distraction`. Persisted.                               |
| DF-ANA-012 | Distraction expansion  | When distraction is shown, expand it into its constituent Categories. Available at both groupings. |
| DF-ANA-013 | Estimated data         | Include or exclude auto-closed Moments. Default include, with a footnote stating the count.        |

| ID         | Requirement                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| DF-ANA-014 | Hiding distraction MUST remove those minutes from totals and percentages, and MUST state that it has done so. |
| DF-ANA-015 | Distraction segments MUST use a consistent warning colour across every chart.                                 |
| DF-ANA-016 | Control state MUST be reflected in the URL so a view can be bookmarked and shared with oneself.               |

DF-ANA-014 exists because a percentage that silently excludes a category is a lie. If
distraction is hidden, the chart must say "excluding 2h 10m of distracted time".

## 5. Charts

### 5.1 Composition - pie or donut

Share of total time. Available on every range.

| ID         | Requirement                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| DF-ANA-020 | MUST show percentage and absolute duration for each segment.                     |
| DF-ANA-021 | Segments below 2% MUST be grouped into "Other", expandable on tap.               |
| DF-ANA-022 | MUST respond to the grouping control.                                            |
| DF-ANA-023 | MUST render a legend that is readable at 320px, wrapping rather than truncating. |

### 5.2 Distribution - stacked bar

Time per day or per month, stacked by category. The primary chart for weekly and monthly
ranges, and the one that answers "which days did this actually happen on".

| ID         | Requirement                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------- |
| DF-ANA-030 | Each bar MUST represent one Local Day (weekly, monthly) or one month (yearly).                     |
| DF-ANA-031 | Segments MUST be ordered consistently across bars so the eye can follow one category horizontally. |
| DF-ANA-032 | Tapping a bar MUST navigate to that day's detail.                                                  |
| DF-ANA-033 | Days with no data MUST render as empty slots, not be omitted, so gaps in the habit are visible.    |
| DF-ANA-034 | The user MUST be able to isolate a single category by tapping its legend entry.                    |

### 5.3 Trend - line

A category or parent category over time, with a moving average.

| ID         | Requirement                                                        |
| ---------- | ------------------------------------------------------------------ |
| DF-ANA-040 | MUST support selecting one or more categories to plot.             |
| DF-ANA-041 | MUST offer a 7-day moving average on daily granularity.            |
| DF-ANA-042 | MUST indicate direction of change over the period as a percentage. |

### 5.4 Heat map

A calendar grid coloured by total recorded time or by a chosen category. The clearest
possible view of consistency, and the chart most likely to change behaviour, because gaps
are unmissable.

| ID         | Requirement                                                              |
| ---------- | ------------------------------------------------------------------------ |
| DF-ANA-050 | MUST show a calendar grid for the selected month or year.                |
| DF-ANA-051 | Intensity MUST reflect total minutes, or minutes of a selected category. |
| DF-ANA-052 | MUST use a colourblind-safe sequential scale, never red-to-green.        |
| DF-ANA-053 | Tapping a cell MUST navigate to that day.                                |

### 5.5 Comparison

The current period against the previous one.

| ID         | Requirement                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------- |
| DF-ANA-060 | MUST show absolute and percentage change per category.                                       |
| DF-ANA-061 | MUST identify the largest increase and the largest decrease.                                 |
| DF-ANA-062 | MUST NOT label changes good or bad, except that rising distraction MAY be flagged neutrally. |

DF-ANA-062 matters: only the user knows whether less gym time this month was a failure or a
recovery from injury. The product reports, the user judges.

### 5.6 Distraction analysis

A dedicated view, since it is a headline concept.

| ID         | Requirement                                                                               |
| ---------- | ----------------------------------------------------------------------------------------- |
| DF-ANA-070 | MUST show total distracted time for the range, broken down by Category.                   |
| DF-ANA-071 | MUST show distracted time as a percentage of total recorded time.                         |
| DF-ANA-072 | MUST show the trend across the previous periods.                                          |
| DF-ANA-073 | MUST show distribution by hour of day, so the user can see when they are most vulnerable. |
| DF-ANA-074 | MUST be available for daily, weekly, monthly and yearly ranges.                           |

## 6. Summary statistics

Shown alongside the charts for every range: total recorded time; number of Moments;
average Moment duration; longest Moment; most frequent category; unrecorded time within
the waking window; distracted time and its share; days recorded within the period.

| ID         | Requirement                                                     |
| ---------- | --------------------------------------------------------------- |
| DF-ANA-080 | Durations MUST be formatted as `Xh Ym`, never as decimal hours. |
| DF-ANA-081 | Percentages MUST be shown to at most one decimal place.         |
| DF-ANA-082 | Every statistic MUST state the range it covers.                 |

## 7. Performance

| ID         | Requirement                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- |
| DF-ANA-090 | Daily and weekly views MUST render within 500 ms at p75 for a user with two years of history. |
| DF-ANA-091 | Yearly and lifetime views MUST render within 1.5 s at p75, with a loading state before that.  |
| DF-ANA-092 | Aggregation MUST occur in the database, never by transferring raw Moments to the client.      |
| DF-ANA-093 | Results MUST be cached client-side and invalidated when a Moment in the range changes.        |

DF-ANA-092 is an architectural constraint, not an optimisation: a lifetime view for a
three-year user is tens of thousands of rows, and sending them to a phone to be summed is
not a viable design.

## 8. Empty and sparse states

| Condition          | Behaviour                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| No Moments at all  | Explain what the view will show and offer to add the first Moment.     |
| Fewer than 7 days  | Show what exists; state that trends need a week of data.               |
| Range with no data | State it plainly and offer to jump to the nearest range that has data. |
| One category only  | Render normally. A single-segment pie is honest, not broken.           |

## 9. Export

| ID         | Requirement                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| DF-ANA-100 | The user MUST be able to export all Moments as CSV and as JSON.               |
| DF-ANA-101 | Export MUST include category and parent category names, not only identifiers. |
| DF-ANA-102 | The user MUST be able to export a filtered range.                             |
| DF-ANA-103 | A chart MUST be exportable as an image for personal sharing.                  |

## 10. Acceptance criteria

1. A day with 3h Work, 2h Learning and 1h Distracted shows 50/33/17 percent.
2. Hiding distraction changes those to 60/40 and displays "excluding 1h 0m distracted".
3. Switching grouping to Category splits Work into Office and Meetings, and totals are
   unchanged.
4. A Moment from 23:00 to 01:00 contributes an hour to each of two bars in a weekly chart.
5. A month with no data shows an empty state with a link to the most recent month that has data.
6. Excluding estimated data removes auto-closed Moments and states how many were removed.
7. A lifetime view over two years of data renders within 1.5 seconds.
8. Every chart is legible and interactive at 320px width.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
