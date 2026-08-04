# 20 - Screen Specifications

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-020 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

Every screen, region by region, with its states. Routes are as defined in
[18 - Information Architecture](18-information-architecture.md); components as defined in
[21 - Design System](21-design-system.md).

Every screen specification includes four states - loading, empty, populated and error -
because a screen specified only in its populated state gets built only in its populated
state.

---

## 2. Dashboard - `/dashboard`

The default surface and the most frequently seen screen in the product.

### Regions, in default order

**Header.** Greeting with the current date. Queue capacity indicator: "1 of 2 slots in
use". On desktop the header also carries a search entry point.

**Queue.** The pending Moments, one card each. Empty state: "Nothing open. Add a moment
when you finish something." Never hidden, because an empty queue is itself information.

**Quick add.** Up to six chips of the most recently used categories. Tapping one opens the
Moment modal with that category preselected and the start time set to now. This is the
fastest possible capture path.

**Today.** The timeline for the current Local Day. Gaps are tappable to create a Moment
prefilled with the gap's boundaries.

**Today at a glance.** Total recorded, distracted time and its share, productivity score
with its trend against the 7-day average, and count of Moments.

**Goals.** Progress bars for active daily goals. Hidden entirely if none exist.

**Streaks.** Current streaks for active daily goals. Hidden if none.

**Insight.** The single most recent AI insight, with a link to the full report. Hidden if
AI is disabled or consent is absent.

**This week.** A compact stacked bar chart of the current week, linking to analytics.

### States

| State     | Behaviour                                                                            |
| --------- | ------------------------------------------------------------------------------------ |
| Loading   | Skeletons matching each section's final shape, to avoid layout shift on arrival.     |
| Empty     | Welcome card explaining Moments, with a prompt to record something already finished. |
| Populated | As above; sections with nothing to show are omitted rather than shown empty.         |
| Error     | Cached data if available with a stale indicator, otherwise a retry card.             |

### Requirements

| ID        | Requirement                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| DF-UX-100 | The queue MUST always be the first section, regardless of `dashboard_order`.   |
| DF-UX-101 | Section order and visibility MUST otherwise follow `dashboard_order`.          |
| DF-UX-102 | The dashboard MUST reflect changes from another device within the sync target. |
| DF-UX-103 | Elapsed times MUST update at least once per minute without a full refetch.     |

---

## 3. Moment modal - `?moment=new` or `?moment=<id>`

A bottom sheet below 768px, a centred dialog above. The most important interaction surface
in the product.

### Fields, in order

1. **Category.** Searchable, grouped by parent, with inline creation. Defaults to the most
   recently used.
2. **Start time.** `datetime-local` with **Now** and quick offsets of -15m, -30m, -1h.
3. **End time.** Same control, plus a clearly labelled **Leave open** affordance which is
   the path to a pending Moment.
4. **Note.** Optional, collapsed by default, 500 characters.

### Actions

**Save** as primary. **Delete** shown only when editing, styled as destructive. **Cancel**
as ghost.

### Behaviour

| ID        | Requirement                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------- |
| DF-UX-110 | Opening for a new Moment MUST preselect the most recently used category and set start to now.       |
| DF-UX-111 | Leaving the end time empty MUST save a pending Moment, subject to the queue limit.                  |
| DF-UX-112 | Validation MUST run on blur and again on submit, showing errors inline.                             |
| DF-UX-113 | A queue-limit refusal MUST render inside the modal, listing pending Moments with close actions.     |
| DF-UX-114 | Entered data MUST survive a refusal, a validation failure and a network error.                      |
| DF-UX-115 | Closing with unsaved changes MUST prompt for confirmation.                                          |
| DF-UX-116 | Editing an auto-closed Moment MUST show why it was closed and that its end time is an estimate.     |
| DF-UX-117 | The modal MUST be reachable by deep link from a notification and MUST open directly on that Moment. |

---

## 4. Calendar - `/calendar` and `/calendar/[date]`

### Month grid

Seven columns from the configured week start. Each cell shows the day number, a compact
intensity bar of total recorded time, and up to three parent-category colour dots. Today is
outlined; the selected day is filled. Days from adjacent months are dimmed but reachable.

Month navigation with previous, next and a month-year picker.

### Day detail

Header with the full date and navigation to adjacent days. Then the timeline, the Moment
list grouped by parent category, day statistics, and an add action prefilled to that date.

| ID        | Requirement                                                                 |
| --------- | --------------------------------------------------------------------------- |
| DF-UX-120 | A day cell MUST convey recorded volume at a glance without requiring a tap. |
| DF-UX-121 | Days with no data MUST be visually distinct from days with little data.     |
| DF-UX-122 | Selecting a day MUST navigate to `/calendar/YYYY-MM-DD`.                    |
| DF-UX-123 | Adding a Moment from day detail MUST prefill that date, not today.          |
| DF-UX-124 | The grid MUST be keyboard navigable with arrow keys.                        |

DF-UX-123 is a small detail with outsized impact: without it, reconstructing a past day
silently creates Moments on the wrong date.

---

## 5. Analytics - `/analytics`

### Control bar

Sticky beneath the header: range selector (Daily, Weekly, Monthly, Yearly, Lifetime),
period navigation, grouping toggle, distraction toggle, estimated-data toggle. All state is
mirrored into the URL per DF-ANA-016.

On phone the controls collapse into a single "Filters" button opening a sheet, with the
range selector remaining always visible.

### Content by range

| Range    | Sections                                                                   |
| -------- | -------------------------------------------------------------------------- |
| Daily    | Timeline, composition chart, statistics, distraction breakdown             |
| Weekly   | Stacked bars per day, composition, comparison to previous week, statistics |
| Monthly  | Stacked bars per day, heat map, composition, comparison, statistics        |
| Yearly   | Bars per month, trend lines, heat map, statistics                          |
| Lifetime | Totals, records, long-term trends, category history                        |

| ID        | Requirement                                                      |
| --------- | ---------------------------------------------------------------- |
| DF-UX-130 | Control state MUST persist in the URL and be restorable from it. |
| DF-UX-131 | Changing a control MUST NOT reset the period being viewed.       |
| DF-UX-132 | Every chart MUST offer an accessible table alternative.          |
| DF-UX-133 | Hiding distraction MUST display the excluded total explicitly.   |
| DF-UX-134 | Charts MUST be legible and interactive at 320px.                 |

---

## 6. Categories - `/categories`

A list of Parent Categories, each expandable to its Categories. Each parent row shows its
colour, name, category count, total recorded time, and a distraction badge where
applicable. Distracted Time is pinned first and its edit affordances for name and deletion
are absent rather than disabled, so the user is not invited to try.

Actions: add parent, add category, edit, reorder by drag, archive, delete.

| ID        | Requirement                                                                              |
| --------- | ---------------------------------------------------------------------------------------- |
| DF-UX-140 | Distracted Time MUST be visible and MUST offer no rename or delete affordance.           |
| DF-UX-141 | Deleting a category with Moments MUST present archive or reassign, never a plain delete. |
| DF-UX-142 | Moving a category between parents MUST warn that historical rollups change.              |
| DF-UX-143 | Reordering MUST be possible without drag, for keyboard and assistive technology users.   |
| DF-UX-144 | Each row MUST show total recorded time, so the user can judge the cost of deleting it.   |

---

## 7. Goals - `/goals`

Active goals as cards showing target, current progress, period, direction and streak where
applicable. Below, a section for inactive goals, and a streak calendar for the selected
goal.

| ID        | Requirement                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| DF-UX-150 | Progress MUST show achieved and target minutes as well as a percentage.           |
| DF-UX-151 | `at_most` goals MUST be visually distinct from `at_least` goals.                  |
| DF-UX-152 | An exceeded `at_most` goal MUST be reported neutrally, never with an alarm state. |
| DF-UX-153 | The streak calendar MUST mark hit, missed and no-data days distinguishably.       |

---

## 8. Insights - `/insights` and `/insights/[reportId]`

A reverse-chronological list of reports with type, period and a one-line summary. Detail
shows the summary, each insight with its supporting figures, the recommendations, the
underlying statistics, and the model and generation time.

| ID        | Requirement                                                                                 |
| --------- | ------------------------------------------------------------------------------------------- |
| DF-UX-160 | Every insight MUST display the figures it rests on.                                         |
| DF-UX-161 | Recommendations MUST be individually dismissible.                                           |
| DF-UX-162 | Reports MUST state which model produced them and when.                                      |
| DF-UX-163 | With AI disabled, this screen MUST show the deterministic summary rather than being hidden. |

---

## 9. Search - `/search`

Filters for text, category, parent category, date range, duration range and status.
Results as a Moment list with the matching term highlighted, grouped by day.

| ID        | Requirement                                               |
| --------- | --------------------------------------------------------- |
| DF-UX-170 | Filters MUST be combinable.                               |
| DF-UX-171 | Results MUST show total count and total duration matched. |
| DF-UX-172 | A result MUST be editable in place via the Moment modal.  |
| DF-UX-173 | Filter state MUST be reflected in the URL.                |

---

## 10. Settings - `/settings`

Collapsible sections mirroring
[16 - PRD Settings and Customization](../02-product/16-prd-settings-and-customization.md):
Queue and reminders, Validation, Time and locale, Analytics, Productivity score,
Notifications, AI, Appearance, Account, Data.

| ID        | Requirement                                                                            |
| --------- | -------------------------------------------------------------------------------------- |
| DF-UX-180 | Each setting MUST carry a one-line explanation of its effect.                          |
| DF-UX-181 | Changes MUST save automatically and confirm briefly.                                   |
| DF-UX-182 | Invalid values MUST be rejected inline with the permitted range stated.                |
| DF-UX-183 | Consequential changes MUST warn before applying, per DF-SET-005.                       |
| DF-UX-184 | Destructive account actions MUST be visually separated and require typed confirmation. |

---

## 11. Authentication screens

Sign in, sign up, password reset and a check-your-email interstitial. Minimal, centred,
with the product name and one-line description. Sign up collects email and password only,
per DF-UX-010.

| ID        | Requirement                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| DF-UX-190 | Password requirements MUST be stated before submission, not after failure.     |
| DF-UX-191 | Errors MUST NOT reveal whether an email address is registered.                 |
| DF-UX-192 | Authenticated users reaching these routes MUST be redirected to the dashboard. |

---

## 12. Cross-screen requirements

| ID        | Requirement                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------- |
| DF-UX-200 | Every screen MUST define loading, empty, populated and error states.                            |
| DF-UX-201 | Loading states MUST be skeletons shaped like the final content, never spinners on a blank page. |
| DF-UX-202 | Every screen MUST be usable from 320px to 1920px.                                               |
| DF-UX-203 | Every screen MUST be fully keyboard operable.                                                   |
| DF-UX-204 | Every screen MUST set a unique, descriptive document title.                                     |
| DF-UX-205 | Navigation MUST preserve scroll position when returning to a previously viewed screen.          |

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
