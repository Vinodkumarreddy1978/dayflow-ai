# 03 - Glossary

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-003 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The domain language of DayFlow AI, defined once. These terms are used identically in
documents, code identifiers, database columns, API fields and user-facing copy. Where a
term has a tempting synonym, the synonym is listed as banned so that it does not creep
back in.

---

## 2. Core entities

### Moment

The central entity. A single stretch of lived time belonging to exactly one user and
exactly one Category.

A Moment has a `start_at`, an optional `end_at`, a derived `duration_minutes`, and a
`status`. It is the only entity that records elapsed time; everything else in the
product is a lens over Moments.

> **Banned synonyms:** entry, log, event, task, session, record, activity item.
> "Activity" is acceptable only in marketing copy, never in code or documents.

Why the name: a Moment is something you _lived_, not something you _were assigned_.
Calling it a task imports the wrong mental model - tasks are things you plan and
complete, Moments are things that happened, including the ones you would rather not
have spent time on.

### Category

The specific, user-defined label for what a Moment was. Examples: Python, ServiceNow,
Gym, Netflix, Instagram.

Every Category belongs to exactly one Parent Category. Categories are per-user; there
is no global taxonomy.

### Parent Category

A logical grouping of Categories, used for rollups in analytics. Examples: Learning,
Health, Work, Entertainment, Distracted Time.

Parent Categories are per-user and user-created, with one exception - see **System
Parent Category** below.

### Distracted Time

The system Parent Category, present for every user, which cannot be renamed or deleted.
Its purpose is to make distraction personally defined and measurable: the user files
their own Categories into it, and every analytics view can include or exclude it with a
single control.

Its `is_distraction` flag - not its name - is what analytics keys off, so a user MAY
mark additional Parent Categories as distraction-like without breaking anything.

### System Parent Category

A Parent Category with `is_system = true`. Seeded at signup, protected from deletion
and renaming. In 1.0 the only one is Distracted Time.

---

## 3. Moment lifecycle

### Pending

A Moment with a `start_at` and no `end_at`. It is a real, saved record - not a draft -
that is waiting for its ending. Pending Moments occupy the Queue and generate Reminders.

### Completed

A Moment with both a `start_at` and an `end_at`, set by the user. It has left the Queue
and counts toward all analytics.

### Auto-closed

A Moment that exceeded the Auto-close Threshold and was closed by the system rather
than the user. It is stored as `status = 'auto_closed'`, which is deliberately distinct
from `completed`:

- It counts in analytics, because ignoring it would understate the day.
- It is visually flagged, because the end time is a system guess, not a fact.
- It can be corrected to `completed` by the user editing the end time.

### Open Moment

Informal term for any Moment currently Pending. Interchangeable with Pending in
conversation; in code and schema, only `pending` exists.

---

## 4. The queue mechanic

### Queue

The ordered set of the current user's Pending Moments. Not a database table - it is a
view over `moments` where `status = 'pending'`.

### Queue Limit

The maximum number of simultaneously Pending Moments. Default **2**, user-configurable
between 1 and 5. Attempting to create a Moment that would exceed it is **refused**, not
warned about, and the refusal is enforced by a database trigger as well as by the
interface.

Rationale is in [02 - Product Charter](02-product-charter.md) section 5.2.

### Queue Slot

One unit of Queue Limit. "You have one slot free" is the user-facing phrasing.

---

## 5. Time handling

### Start Time / `start_at`

When the Moment began. Stored as `timestamptz` in UTC. Required.

### End Time / `end_at`

When the Moment ended. Stored as `timestamptz` in UTC. Nullable - null means Pending.

### Duration

`end_at - start_at`, exposed as `duration_minutes`. Always derived, never stored
independently, so that it cannot drift out of agreement with the timestamps.

### Now Capture

The one-tap action that fills a time field with the current date and time. Available
for both start and end. This is the fast path; manual entry is the correction path.

### Overnight Moment

A Moment whose `end_at` falls on a later calendar day than its `start_at`. Fully valid.
For analytics it is attributed by **Day Attribution** below.

### Day Attribution

The rule deciding which calendar day a Moment's minutes count toward. DayFlow AI
**splits at midnight**: a Moment from 22:30 to 01:30 contributes 90 minutes to the first
day and 90 to the next.

The rejected alternative - attributing the whole Moment to its start day - is simpler
but makes a night shift appear as a 12-hour day followed by an empty one.

### Local Day

A calendar day in the user's configured timezone, running from 00:00:00 to 23:59:59.999
local. All grouping, streaks and goals use Local Day, never UTC day.

### Timezone

An IANA identifier such as `Asia/Kolkata`, stored per user. Timestamps are stored in
UTC and rendered in this zone.

---

## 6. Thresholds and nudges

### Reminder

A web push notification about a Pending Moment. Repeats at the Reminder Interval until
the Moment is closed.

### Reminder Interval

Time between repeated Reminders for the same Pending Moment. Default **60 minutes**,
minimum **10 minutes**. The floor exists to prevent the user from configuring the
product into being a nuisance and then uninstalling it.

### Quiet Hours

A daily window in which no notification is delivered. Suppressed reminders are not
queued for later delivery - they are dropped, and the normal cadence resumes when the
window ends. Batching them into a burst at 07:00 would be worse than sending nothing.

### Long Activity Warning Threshold

Elapsed time after which a Pending Moment is flagged as needing attention. Default
**180 minutes**. Produces a visually distinct card and a higher-urgency notification.

### Auto-close Threshold

Elapsed time after which the system closes a Pending Moment itself, setting
`end_at = start_at + threshold` and `status = 'auto_closed'`. Default **360 minutes**.
MUST be greater than the Long Activity Warning Threshold.

### Overlap Limit

The maximum number of Moments that may cover the same instant before the interface
warns. Default **3**. This is a **warning, not a refusal** - genuine simultaneity
exists, such as listening to a podcast while commuting.

---

## 7. Analysis

### Range

The period an analytics view covers: Daily, Weekly, Monthly, Yearly or Lifetime.

### Grouping

Whether a chart aggregates by Parent Category or by Category. User-toggleable in every
chart that supports both.

### Goal

A user-defined target of minutes for a Category or Parent Category over a Daily, Weekly
or Monthly period.

### Streak

The count of consecutive Local Days satisfying a Goal. Both **current streak** and
**longest streak** are tracked. A day with no data at all breaks a streak - absence of
evidence is treated as absence, because the alternative rewards not recording.

### Productivity Score

A number from 0 to 100 for a Local Day, computed from user-assigned weights per Parent
Category. The user owns the formula; DayFlow AI supplies only a starting set of weights.
Deliberately not comparable between users, because the weights are personal.

### Free Time / Gap

An interval within the user's waking window not covered by any Moment. Shown on the
timeline as unrecorded time. It is neutral, not a failure state.

---

## 8. AI

### Insight

A single generated observation about the user's data - a pattern, an anomaly, a
comparison or a recommendation.

### Insight Provider

A pluggable module that produces one class of Insight from a Moment history. New
analysis capabilities are added by registering a new provider rather than by modifying
existing ones. See
[29 - AI Architecture and Prompt Contracts](../04-architecture/29-ai-architecture-and-prompt-contracts.md).

### Report

A stored collection of Insights for a period - daily, weekly or monthly. Persisted in
`ai_reports` so that it is generated once and remains readable without re-running or
re-paying for a model call.

### Deterministic Analysis

Statistics computed in code - totals, averages, trends, comparisons. Runs with AI
disabled, costs nothing and is always correct. The AI layer explains these numbers; it
does not calculate them.

This separation matters: an AI asked to do arithmetic will occasionally get it wrong,
and a productivity tool that misreports the user's own hours has no path back to trust.

---

## 9. Platform

### PWA

Progressive Web App. One codebase serving the browser experience, the installable
application and push notifications.

### RLS

Row Level Security. PostgreSQL's per-row access control. Every DayFlow table enforces
`user_id = auth.uid()`, making cross-user data access impossible at the database level
regardless of application bugs.

### Realtime

Supabase's stream of PostgreSQL changes to subscribed clients, which is how a Moment
created on a phone appears on a laptop within seconds.

### Service Role Key

A Supabase credential that bypasses RLS. Used **only** by scheduled server jobs that
must act across all users. Never sent to a browser.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
