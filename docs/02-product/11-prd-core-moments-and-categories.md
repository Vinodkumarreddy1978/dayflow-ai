# 11 - PRD: Core Moments and Categories

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-011 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The requirements for the central entity - the Moment - and the taxonomy that organises
it. Everything else in DayFlow AI is a lens over the data defined here, so this document
takes precedence over the other PRDs when they conflict.

Terms are as defined in [03 - Glossary](../00-governance/03-glossary.md).

## 2. The Moment

### 2.1 Fields

| Field              | Type        | Required | Notes                                                  |
| ------------------ | ----------- | -------- | ------------------------------------------------------ |
| `id`               | uuid        | yes      | Generated.                                             |
| `user_id`          | uuid        | yes      | Owner. Enforced by RLS.                                |
| `category_id`      | uuid        | yes      | Exactly one Category.                                  |
| `start_at`         | timestamptz | yes      | UTC.                                                   |
| `end_at`           | timestamptz | no       | Null means Pending.                                    |
| `duration_minutes` | integer     | derived  | Generated from the timestamps; never written.          |
| `status`           | enum        | yes      | `pending`, `completed`, `auto_closed`.                 |
| `note`             | text        | no       | Up to 500 characters.                                  |
| `source`           | enum        | yes      | `manual`, `quick_add`, `auto_close`. Default `manual`. |
| `created_at`       | timestamptz | yes      | Generated.                                             |
| `updated_at`       | timestamptz | yes      | Maintained by trigger.                                 |

### 2.2 Creation

| ID         | Requirement                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| DF-MOM-001 | A user MUST be able to create a Moment with a Category and a start time only, leaving the end time empty.         |
| DF-MOM-002 | A user MUST be able to create a Moment with a Category, a start time and an end time in a single action.          |
| DF-MOM-003 | Both time fields MUST offer a one-tap Now Capture that fills the current date and time.                           |
| DF-MOM-004 | Both time fields MUST accept manual entry of any date and time, including past dates.                             |
| DF-MOM-005 | A Moment created without an end time MUST be saved with `status = 'pending'`.                                     |
| DF-MOM-006 | A Moment created with both times MUST be saved with `status = 'completed'` and MUST NOT occupy a Queue Slot.      |
| DF-MOM-007 | The Category selector MUST default to the user's most recently used Category.                                     |
| DF-MOM-008 | The user MUST be able to create a new Category from inside the Moment form without losing entered data.           |
| DF-MOM-009 | Creating a Moment MUST complete within 10 seconds of opening the application on a mobile device, measured at p75. |

DF-MOM-001 is the requirement the entire product is built around. It is what makes
retroactive capture the primary path rather than a fallback.

### 2.3 Validation

| ID         | Rule                                                                                              | Behaviour |
| ---------- | ------------------------------------------------------------------------------------------------- | --------- |
| DF-MOM-010 | `end_at` MUST be strictly after `start_at`.                                                       | Refuse    |
| DF-MOM-011 | `start_at` MUST NOT be more than 5 minutes in the future.                                         | Refuse    |
| DF-MOM-012 | `end_at` MUST NOT be in the future.                                                               | Refuse    |
| DF-MOM-013 | A Moment MUST NOT exceed 24 hours in duration.                                                    | Refuse    |
| DF-MOM-014 | A Moment with the same Category and `start_at` as an existing one MUST be refused as a duplicate. | Refuse    |
| DF-MOM-015 | `start_at` MUST NOT be earlier than the account creation date minus 365 days.                     | Refuse    |
| DF-MOM-016 | Overlapping more than the Overlap Limit of other Moments SHOULD warn and allow continuation.      | Warn      |
| DF-MOM-017 | A gap of more than 4 waking hours before this Moment SHOULD be noted, not blocked.                | Inform    |

The refuse-versus-warn split is deliberate. Impossible data is refused; unusual but
possible data is allowed with a note. Listening to a podcast while commuting while walking
is three genuine concurrent Moments, so overlap can never be an error.

Every rule marked Refuse MUST be enforced by a database constraint or trigger as well as
in the client, per ADR-004.

### 2.4 Editing

| ID         | Requirement                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| DF-MOM-020 | Any field of any Moment MUST be editable at any time, regardless of age or status.                                 |
| DF-MOM-021 | Adding an end time to a Pending Moment MUST set `status = 'completed'` and free its Queue Slot.                    |
| DF-MOM-022 | Editing the end time of an auto-closed Moment MUST promote it to `completed`.                                      |
| DF-MOM-023 | Clearing the end time of a completed Moment MUST return it to `pending`, and MUST be refused if the Queue is full. |
| DF-MOM-024 | All validation rules MUST apply equally to edits.                                                                  |

DF-MOM-023 is the one case where an edit can be refused, and the message must explain why.

### 2.5 Deletion

| ID         | Requirement                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| DF-MOM-030 | A user MUST be able to delete any Moment.                                     |
| DF-MOM-031 | Deletion MUST require a confirmation that names the Category and time.        |
| DF-MOM-032 | Deletion MUST offer an undo for at least 10 seconds.                          |
| DF-MOM-033 | Deletion MUST be permanent after the undo window. No soft-delete is retained. |

No soft-delete: a user who deletes a record of how they spent an evening is entitled to
have it actually gone.

### 2.6 Day attribution

| ID         | Requirement                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| DF-MOM-040 | A Moment spanning local midnight MUST have its minutes split across the Local Days it covers, in proportion to time.     |
| DF-MOM-041 | The timeline for a day MUST show the portion of an overnight Moment that falls within it, visually marked as continuing. |
| DF-MOM-042 | All grouping MUST use the user's configured timezone, never UTC.                                                         |

Per ADR-010.

## 3. Categories

### 3.1 Fields

| Field                | Type    | Required | Notes                                |
| -------------------- | ------- | -------- | ------------------------------------ |
| `id`                 | uuid    | yes      | Generated.                           |
| `user_id`            | uuid    | yes      | Owner.                               |
| `parent_category_id` | uuid    | yes      | Exactly one parent.                  |
| `name`               | text    | yes      | 1-50 characters, unique per user.    |
| `color`              | text    | no       | Hex. Inherited from parent if unset. |
| `icon`               | text    | no       | Icon identifier.                     |
| `is_archived`        | boolean | yes      | Default false.                       |
| `sort_order`         | integer | yes      | Default 0.                           |

### 3.2 Requirements

| ID         | Requirement                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| DF-CAT-001 | A user MUST be able to create, rename, recolour, reassign and archive their own Categories.                                             |
| DF-CAT-002 | Every Category MUST belong to exactly one Parent Category.                                                                              |
| DF-CAT-003 | Category names MUST be unique per user, case-insensitively.                                                                             |
| DF-CAT-004 | A Category with no Moments MUST be deletable outright.                                                                                  |
| DF-CAT-005 | A Category with Moments MUST NOT be deletable; it MUST be archivable, or deletable only by reassigning its Moments to another Category. |
| DF-CAT-006 | An archived Category MUST be hidden from selection but MUST remain in historical analytics.                                             |
| DF-CAT-007 | Reassigning a Category to a different Parent MUST retroactively change historical rollups, with a warning shown first.                  |
| DF-CAT-008 | The Category selector MUST support search when the user has more than 10 Categories.                                                    |

DF-CAT-005 protects history. Deleting a Category with 300 Moments behind it would silently
destroy months of data, so the destructive path is made explicit rather than convenient.

DF-CAT-007 is warned about because it changes the past: moving Gaming from Entertainment
to Distracted Time rewrites every historical chart. That is usually what the user wants,
but never something they should discover by accident.

## 4. Parent Categories

### 4.1 Fields

| Field            | Type    | Required | Notes                                       |
| ---------------- | ------- | -------- | ------------------------------------------- |
| `id`             | uuid    | yes      | Generated.                                  |
| `user_id`        | uuid    | yes      | Owner.                                      |
| `name`           | text    | yes      | 1-50 characters, unique per user.           |
| `color`          | text    | yes      | Hex. Default palette assigned on creation.  |
| `icon`           | text    | no       | Icon identifier.                            |
| `is_system`      | boolean | yes      | True only for Distracted Time.              |
| `is_distraction` | boolean | yes      | Drives the distraction toggle in analytics. |
| `sort_order`     | integer | yes      | Display order.                              |

### 4.2 Requirements

| ID         | Requirement                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- |
| DF-CAT-020 | A user MUST be able to create, rename, recolour and reorder their own Parent Categories.      |
| DF-CAT-021 | A Parent Category with `is_system = true` MUST NOT be renamed or deleted.                     |
| DF-CAT-022 | A Parent Category MUST NOT be deleted while it has Categories; they MUST be reassigned first. |
| DF-CAT-023 | A user MUST be able to set `is_distraction` on any non-system Parent Category.                |
| DF-CAT-024 | `is_distraction` MUST be permanently true for the Distracted Time system Parent Category.     |
| DF-CAT-025 | Analytics MUST key distraction behaviour off `is_distraction`, never off the name.            |

### 4.3 Distracted Time

Distracted Time exists because distraction is personal. A vendor cannot know whether
YouTube is a time sink or a classroom for a given user. DayFlow AI therefore ships the
container and lets the user decide what goes in it.

| ID         | Requirement                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| DF-CAT-030 | Every account MUST be seeded with a Distracted Time Parent Category, `is_system` and `is_distraction` true. |
| DF-CAT-031 | The user MUST be able to move any Category into or out of Distracted Time freely.                           |
| DF-CAT-032 | Distracted Time MUST be visually distinct in every chart, using a consistent warning colour.                |
| DF-CAT-033 | Every analytics view MUST offer a control to show or hide Distracted Time.                                  |
| DF-CAT-034 | When shown, Distracted Time MUST be expandable into its constituent Categories.                             |

## 5. Seeded defaults

Every new account is seeded so that the first screen is never empty - an empty state at
signup is the single most reliable way to lose a new user.

| Parent Category | System | Distraction | Categories                    |
| --------------- | ------ | ----------- | ----------------------------- |
| Work            | no     | no          | Office, Meetings, Email       |
| Learning        | no     | no          | Reading, Courses, Practice    |
| Health          | no     | no          | Gym, Walking, Sleep           |
| Personal        | no     | no          | Family, Chores, Travel        |
| Entertainment   | no     | no          | Movies, Music, Gaming         |
| Distracted Time | yes    | yes         | Social Media, Random Browsing |

| ID         | Requirement                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------- |
| DF-CAT-040 | Seeding MUST occur automatically on account creation, in the same transaction as profile creation. |
| DF-CAT-041 | Every seeded item except Distracted Time itself MUST be freely editable and deletable.             |
| DF-CAT-042 | Seeding MUST NOT be repeated if the user deletes the defaults.                                     |

## 6. Timeline

| ID         | Requirement                                                                                |
| ---------- | ------------------------------------------------------------------------------------------ |
| DF-MOM-050 | Each Local Day MUST have a timeline showing every Moment positioned by start and end time. |
| DF-MOM-051 | Moments MUST be coloured by their Parent Category.                                         |
| DF-MOM-052 | Gaps MUST be shown as unrecorded time, neutrally styled.                                   |
| DF-MOM-053 | Pending Moments MUST be visually distinct and shown as running to the current time.        |
| DF-MOM-054 | Overlapping Moments MUST be rendered side by side rather than hidden.                      |
| DF-MOM-055 | Tapping a Moment MUST open it for editing.                                                 |

## 7. Acceptance criteria

1. A Moment saved with category and start time only appears in the queue with `pending`.
2. Adding an end time removes it from the queue and sets `completed`.
3. An end time before the start time is refused in the client and by the database.
4. A Moment from 23:00 to 01:00 contributes 60 minutes to each of two days.
5. A Category with Moments cannot be deleted without reassignment.
6. Distracted Time cannot be renamed or deleted through any path, including direct API calls.
7. A new account has six Parent Categories and seventeen Categories before any user action.
8. Archiving a Category removes it from the selector but not from last month's chart.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
