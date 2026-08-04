# 16 - PRD: Settings and Customization

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-016 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

Every value the user can change, its default, its permitted range, and what it affects.
This document is the authoritative source for the `settings` table and the settings
screen; the schema in
[25 - Database Schema and RLS](../04-architecture/25-database-schema-and-rls.md) is
generated from it.

## 2. Stance

Charter principle 5 states that defaults are opinions, not rules. That principle is only
real if the opinions are genuinely adjustable, which is why the thresholds that define the
product's signature mechanic - queue size, reminder cadence, warning and auto-close times -
are all user-controlled rather than fixed.

The counterweight is that a settings screen with sixty options is its own failure. Every
setting below earns its place by having a persona who genuinely needs a different value
from the default.

## 3. Complete settings reference

### 3.1 Queue and reminders

| Key                             | Type    | Default | Range    | Effect                                                 |
| ------------------------------- | ------- | ------- | -------- | ------------------------------------------------------ |
| `queue_limit`                   | integer | 2       | 1-5      | Maximum simultaneous Pending Moments.                  |
| `reminder_interval_minutes`     | integer | 60      | 10-480   | Time between reminders for a Pending Moment.           |
| `reminders_enabled`             | boolean | true    | -        | Master switch for queue reminders.                     |
| `long_activity_warning_minutes` | integer | 180     | 60-720   | When a Pending Moment is flagged as needing attention. |
| `auto_close_enabled`            | boolean | true    | -        | Whether the system closes abandoned Moments.           |
| `auto_close_minutes`            | integer | 360     | 120-1440 | When it does so. MUST exceed the warning threshold.    |
| `quiet_hours_enabled`           | boolean | false   | -        | Whether a nightly silence window applies.              |
| `quiet_hours_start`             | time    | 22:00   | -        | Local time the window opens.                           |
| `quiet_hours_end`               | time    | 07:00   | -        | Local time it closes. May cross midnight.              |

### 3.2 Validation

| Key                    | Type    | Default | Range | Effect                                                   |
| ---------------------- | ------- | ------- | ----- | -------------------------------------------------------- |
| `overlap_limit`        | integer | 3       | 1-10  | Concurrent Moments before a warning is shown.            |
| `overlap_warn_enabled` | boolean | true    | -     | Whether overlap produces a warning at all.               |
| `gap_warn_hours`       | integer | 4       | 1-12  | Unrecorded waking hours before the timeline notes a gap. |

### 3.3 Time and locale

| Key              | Type    | Default            | Effect                                        |
| ---------------- | ------- | ------------------ | --------------------------------------------- |
| `timezone`       | text    | Detected on signup | The zone defining every Local Day.            |
| `week_starts_on` | integer | 1 (Monday)         | Week boundary for weekly ranges and goals.    |
| `time_format`    | enum    | `24h`              | `12h` or `24h` display.                       |
| `date_format`    | enum    | `dd/mm/yyyy`       | Display format only; storage is always ISO.   |
| `waking_start`   | time    | 07:00              | Start of the window used for gap calculation. |
| `waking_end`     | time    | 23:00              | End of that window.                           |

The waking window exists so that "unrecorded time" is a meaningful figure. Without it, every
user appears to have eight hours of unaccounted time each night.

### 3.4 Analytics

| Key                         | Type    | Default           | Effect                                        |
| --------------------------- | ------- | ----------------- | --------------------------------------------- |
| `default_range`             | enum    | `daily`           | The range analytics opens on.                 |
| `default_grouping`          | enum    | `parent_category` | Parent or child grouping by default.          |
| `show_distraction_default`  | boolean | true              | Whether distraction is visible on first load. |
| `include_estimated_default` | boolean | true              | Whether auto-closed Moments are included.     |
| `chart_style`               | enum    | `donut`           | `pie` or `donut` for composition charts.      |

### 3.5 Productivity score

| Key                    | Type    | Default | Effect                                           |
| ---------------------- | ------- | ------- | ------------------------------------------------ |
| `productivity_enabled` | boolean | true    | Whether the score appears anywhere.              |
| `productivity_weights` | jsonb   | seeded  | Weight from -1.0 to +1.0 per Parent Category id. |

Defaults per [14 - PRD Goals, Streaks and Productivity Score](14-prd-goals-streaks-and-productivity-score.md)
section 5.2. New Parent Categories default to a weight of 0.0.

### 3.6 Notifications

| Key                      | Type    | Default | Effect                                |
| ------------------------ | ------- | ------- | ------------------------------------- |
| `push_enabled`           | boolean | false   | Set true once permission is granted.  |
| `notify_queue_reminders` | boolean | true    | Pending Moment reminders.             |
| `notify_long_activity`   | boolean | true    | The three-hour warning.               |
| `notify_auto_close`      | boolean | true    | Notice that a Moment was closed.      |
| `notify_goal_reminders`  | boolean | false   | Daily unmet-goal nudge.               |
| `goal_reminder_time`     | time    | 20:00   | When that nudge is sent.              |
| `notify_daily_review`    | boolean | false   | End-of-day prompt to review.          |
| `daily_review_time`      | time    | 21:00   | When it is sent.                      |
| `notify_weekly_review`   | boolean | true    | Weekly summary availability.          |
| `notify_achievements`    | boolean | true    | Personal bests and streak milestones. |

Only three are on by default. Everything optional starts silent, because a product that
notifies too much on day one gets its permission revoked on day two.

### 3.7 AI

| Key                  | Type    | Default | Effect                                             |
| -------------------- | ------- | ------- | -------------------------------------------------- |
| `ai_consent`         | boolean | false   | Explicit opt-in. Nothing is sent until it is true. |
| `ai_daily_reports`   | boolean | false   | Generate a daily report.                           |
| `ai_weekly_reports`  | boolean | true    | Generate a weekly report.                          |
| `ai_monthly_reports` | boolean | true    | Generate a monthly report.                         |
| `ai_recommendations` | boolean | true    | Include recommendations in reports.                |

### 3.8 Appearance

| Key               | Type    | Default  | Effect                                      |
| ----------------- | ------- | -------- | ------------------------------------------- |
| `theme`           | enum    | `system` | `light`, `dark` or `system`.                |
| `accent_color`    | text    | default  | Accent used across the interface.           |
| `compact_mode`    | boolean | false    | Denser lists and cards.                     |
| `dashboard_order` | jsonb   | seeded   | Order and visibility of dashboard sections. |

## 4. Requirements

| ID         | Requirement                                                                                |
| ---------- | ------------------------------------------------------------------------------------------ |
| DF-SET-001 | Every setting MUST have a defined default applied at account creation.                     |
| DF-SET-002 | Settings MUST be stored server-side and MUST sync across devices.                          |
| DF-SET-003 | Changes MUST take effect immediately, without a reload.                                    |
| DF-SET-004 | Every setting MUST be validated against its range on the server as well as the client.     |
| DF-SET-005 | A setting whose change alters historical interpretation MUST warn before applying.         |
| DF-SET-006 | The screen MUST be grouped into the sections above, each independently collapsible.        |
| DF-SET-007 | Every setting MUST carry a one-line explanation of what it affects.                        |
| DF-SET-008 | A reset to defaults MUST be available per section and for everything.                      |
| DF-SET-009 | `auto_close_minutes` MUST be rejected if not greater than `long_activity_warning_minutes`. |
| DF-SET-010 | Reducing `queue_limit` below the current pending count MUST be permitted, per DF-QUE-006.  |
| DF-SET-011 | Changing `timezone` MUST warn that historical day grouping will be recalculated.           |
| DF-SET-012 | Appearance settings MAY be cached locally for instant application before sync completes.   |

DF-SET-005 covers the genuinely consequential ones: timezone, productivity weights, and
week start. Each rewrites how past data is presented, and none should surprise the user.

## 5. Account settings

| ID         | Requirement                                                                          |
| ---------- | ------------------------------------------------------------------------------------ |
| DF-SET-020 | The user MUST be able to change their email address, with verification.              |
| DF-SET-021 | The user MUST be able to change their password.                                      |
| DF-SET-022 | The user MUST be able to export all their data as CSV and JSON.                      |
| DF-SET-023 | The user MUST be able to delete their account and all associated data permanently.   |
| DF-SET-024 | Deletion MUST require typed confirmation and MUST state precisely what is destroyed. |
| DF-SET-025 | Deletion MUST offer an export first.                                                 |
| DF-SET-026 | The user MUST be able to see and revoke registered push devices.                     |

## 6. Data management

| ID         | Requirement                                                                             |
| ---------- | --------------------------------------------------------------------------------------- |
| DF-SET-030 | The user MUST be able to bulk-delete Moments within a date range, with confirmation.    |
| DF-SET-031 | The user MUST be able to bulk-reassign Moments from one Category to another.            |
| DF-SET-032 | The user MUST be able to import from a previously exported JSON file.                   |
| DF-SET-033 | Import MUST validate every row and report failures without partially applying the file. |
| DF-SET-034 | Import MUST detect and skip duplicates by category and start time.                      |

## 7. Acceptance criteria

1. A new account has every setting populated at its documented default.
2. Changing the queue limit from 2 to 3 immediately permits a third Pending Moment.
3. Setting the reminder interval below 10 minutes is rejected on both client and server.
4. Setting auto-close below the warning threshold is rejected with an explanatory message.
5. Changing the timezone warns before applying and regroups historical days afterwards.
6. Changing the theme applies instantly and persists to another signed-in device.
7. Resetting the notification section restores exactly the documented defaults.
8. Account deletion removes every row belonging to the user across every table.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
