# 02 - Product Charter

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-002 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

This document states what DayFlow AI is, who it serves, what it will deliberately not
do, and the principles that settle arguments when requirements conflict. Every other
document in the suite must be consistent with this one.

## 2. Vision

> Most people cannot answer the question "where did your last week actually go?"
> DayFlow AI exists so that they can - and so that the answer changes something.

DayFlow AI is a personal time intelligence platform. It records lived time as
**Moments**, organises them into a taxonomy the user owns, and turns the resulting
history into analysis, goals and AI-generated guidance.

## 3. Problem statement

Existing time trackers fail personal use in three specific ways.

**They assume you remember in real time.** Timer-based tools require you to press start
before an activity and stop after it. Real life does not cooperate: you get pulled into
a conversation, you start reading and forget, you finish a gym session and shower
before touching your phone. The result is either abandoned tracking or fabricated data.

**They are built for billing, not for insight.** Toggl, Clockify and Harvest exist to
turn hours into invoices. Their data model, their reports and their pricing all point
at clients and projects. A person trying to understand their own week is using a tool
aimed at somebody else's problem.

**They report rather than interpret.** A pie chart showing 22% "Entertainment" states a
fact. It does not tell you that your entertainment time has doubled on the days
following meetings that run past 7pm. That interpretation is the actual product.

## 4. Target user

The primary user is an individual - a working professional, student or self-directed
learner - who is trying to improve how they spend their time and is willing to spend a
small amount of effort recording it. See
[07 - Personas and Jobs to be Done](../01-business/07-personas-and-jobs-to-be-done.md).

DayFlow AI is explicitly **not** built for teams, agencies, or client billing.

## 5. What makes it different

These four together are the product. Individually each exists somewhere; the
combination does not.

### 5.1 Retroactive-first capture

A Moment can be saved with only a category and a start time. It is a legitimate,
complete-enough record that waits for its ending. This inverts the assumption of every
timer app: forgetting is the normal case and the system is designed around it.

### 5.2 The bounded queue

At most two Moments may be pending at once, by default. A third is refused until one is
closed.

This constraint is counter-intuitive and it is the most important design decision in
the product. An unbounded backlog of unclosed entries becomes archaeology - the user
faces fourteen open items, cannot remember any of them accurately, and abandons the
tool. A hard ceiling of two forces resolution while memory is still fresh, which is
what keeps the dataset trustworthy. Analytics built on invented data are worse than no
analytics.

### 5.3 Escalating attention

An open Moment is nudged, not ignored: a reminder every hour, a warning at three hours,
and an automatic close at six. The six-hour close encodes a belief - that a single
unbroken focused activity lasting six hours is far more likely to be a forgotten timer
than a real event. The auto-closed Moment is flagged so the user can correct it rather
than silently trusting it.

### 5.4 Distraction as a modelled concept

**Distracted Time** is a system parent category that cannot be deleted, into which the
user files their own categories - their particular Instagram, their particular mobile
game. Distraction is therefore personal, self-declared, and measurable over time, and
every chart can show or hide it on demand.

## 6. Product principles

These are ordered. When two conflict, the higher one wins.

1. **The user owns their data.** Full export in an open format, real deletion,
   no sale of data to anyone, ever.
2. **Honest data over complete data.** Any feature that makes fabrication easier is
   rejected, even if it improves the numbers on a dashboard.
3. **AI assists, never controls.** The AI may summarise, detect and recommend. It may
   never create, edit or delete a Moment on its own initiative.
4. **Privacy and security by design.** Row level security on every table from the first
   migration, not retrofitted.
5. **The user decides.** Queue size, reminder cadence, thresholds, and the productivity
   formula itself are all configurable. Defaults are opinions, not rules.
6. **Extensible by construction.** New insight types, chart types and categories are
   added as modules, without editing existing ones.
7. **Fast and accessible.** Performance and accessibility are product features with
   budgets, defined in
   [22 - Accessibility and Responsive Standards](../03-ux/22-accessibility-and-responsive-standards.md).

## 7. In scope for version 1.0

- Moments: create, edit, delete, close, auto-close
- Categories and user-defined parent categories, including Distracted Time
- The pending queue with a configurable limit
- Reminder engine with quiet hours, long-activity warning and auto-close
- Daily timeline and calendar
- Analytics across daily, weekly, monthly, yearly and lifetime ranges
- Goals, streaks and a configurable productivity score
- AI daily, weekly and monthly reports plus recommendations
- Cloud accounts, multi-device sync, export
- Installable PWA with web push, responsive from 320px upward

## 8. Explicitly out of scope for 1.0

Recorded here so that they are decisions rather than oversights.

| Not doing                             | Why                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Teams, sharing, collaboration         | A different product with different data, permissions and pricing.                  |
| Client billing and invoicing          | The market DayFlow is deliberately not entering.                                   |
| Automatic tracking of apps or windows | Requires an OS agent; enormous privacy cost; contradicts self-declaration.         |
| Native iOS and Android applications   | A PWA covers install, offline and push. Revisit only if push proves limiting.      |
| Calendar import                       | Imported meetings are intentions, not lived time. Post-1.0 as a suggestion source. |
| Wearable and health integrations      | Post-1.0. Interesting, not foundational.                                           |
| Natural language and voice capture    | Post-1.0. Depends on a stable core data model.                                     |
| Offline-first write support           | 1.0 caches for reading offline; queued offline writes are post-1.0.                |

## 9. Success criteria for 1.0

The product is a success at 1.0 if a single user - the founder - records Moments on at
least 21 of 30 consecutive days without the data becoming fiction, and can point to one
concrete behavioural change caused by something the product showed them.

Growth metrics matter later. Proving the mechanic works on one honest user comes first.
Quantitative targets are defined in
[10 - KPI Framework](../01-business/10-kpi-framework.md).

## 10. Constraints

- **Solo development,** AI-assisted, in evenings and weekends.
- **Near-zero running cost** until real usage exists. Free tiers only.
- **No always-on server.** All scheduled work must run serverless or in-database.
- **Data loss is unacceptable.** This drove the move from local storage to a cloud
  database, recorded as ADR-001 in [04 - Decision Log](04-decision-log.md).

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
