# 19 - User Flows

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-019 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

The step-by-step journeys through DayFlow AI, including the failure branches. Flows are
specified before screens because a screen that serves no flow does not need to exist.

## 2. Flow 1 - First run

The most consequential flow in the product. A user who does not record a Moment in their
first session almost never returns.

```mermaid
flowchart TD
  Land["Landing page"] --> SignUp["Sign up: email and password"]
  SignUp --> Verify{"Email verification required?"}
  Verify -->|yes| Check["Check your email screen"]
  Check --> Confirm["User confirms"]
  Verify -->|no| Seed
  Confirm --> Seed["Seed categories and settings"]
  Seed --> Welcome["Dashboard with welcome state"]
  Welcome --> Prompt["Record something you already finished today"]
  Prompt --> Form["Moment modal, category preselected"]
  Form --> Save["Save with start and end"]
  Save --> First["First Moment on the timeline"]
```

| ID        | Requirement                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------- |
| DF-UX-010 | Sign up MUST require only email and password. No survey, no plan choice, no onboarding questionnaire. |
| DF-UX-011 | Categories and settings MUST be seeded before the dashboard first renders, so it is never empty.      |
| DF-UX-012 | The first prompt MUST be for an activity already finished, teaching retroactive capture immediately.  |
| DF-UX-013 | Notification permission MUST NOT be requested during this flow.                                       |
| DF-UX-014 | The user MUST be able to dismiss the welcome prompt and explore freely.                               |

DF-UX-012 is the pedagogical core of onboarding. Asking the user to record something
already finished teaches, in one action, that DayFlow is not a stopwatch.

## 3. Flow 2 - Complete capture

The common case: recording something already finished.

```mermaid
flowchart TD
  Any["Any screen"] --> Add["Tap Add"]
  Add --> Modal["Moment modal opens"]
  Modal --> Cat["Category preselected to most recent"]
  Cat --> Start["Set start: Now, or adjust"]
  Start --> End["Set end: Now, or adjust"]
  End --> Validate{"Valid?"}
  Validate -->|no| Error["Inline error on the offending field"]
  Error --> Start
  Validate -->|yes| Saved["Saved as completed"]
  Saved --> Toast["Toast with Undo"]
```

Target: under 10 seconds from tap to saved, per DF-MOM-009.

## 4. Flow 3 - Pending capture and closure

The signature flow, and the reason the product exists.

```mermaid
flowchart TD
  Add["Tap Add"] --> Modal["Moment modal"]
  Modal --> Fill["Category plus start time only"]
  Fill --> Check{"Queue has a free slot?"}
  Check -->|no| Refuse["Refusal naming pending Moments, with Close actions"]
  Refuse --> Resolve["User closes one inline"]
  Resolve --> Check
  Check -->|yes| Pending["Saved as pending"]
  Pending --> Card["Queue card appears"]
  Card --> Wait["Time passes"]
  Wait --> Remind["Reminder at each interval"]
  Remind --> Choice{"How does the user respond?"}
  Choice -->|"End now from notification"| Closed["Completed at current time"]
  Choice -->|"Opens app"| Edit["Edit form, deep-linked"]
  Choice -->|"Ignores"| Escalate{"Elapsed time"}
  Escalate -->|"3 hours"| Warn["Needs attention state"]
  Warn --> Choice
  Escalate -->|"6 hours"| Auto["Auto-closed, flagged, notified"]
  Edit --> Closed
```

| ID        | Requirement                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| DF-UX-020 | The refusal MUST list every pending Moment with a one-tap close action.          |
| DF-UX-021 | Data already entered MUST survive the refusal and the inline resolution.         |
| DF-UX-022 | After closing one inline, the pending save MUST be retried automatically.        |
| DF-UX-023 | The queue explanation MUST be shown once, the first time a Moment goes pending.  |
| DF-UX-024 | Notification permission MUST be requested at this point, with the reason stated. |

DF-UX-021 and DF-UX-022 are what make a hard limit tolerable. The user experiences it as
"close one first", not as lost work.

## 5. Flow 4 - Filling in a forgotten day

The recovery flow. Users will forget entire days, and the product must make repair easy
rather than shameful.

```mermaid
flowchart TD
  Cal["Calendar"] --> Gap["A day with little or no data"]
  Gap --> Day["Day detail"]
  Day --> Timeline["Timeline showing gaps"]
  Timeline --> Tap["Tap a gap"]
  Tap --> Modal["Moment modal prefilled with the gap's start and end"]
  Modal --> Adjust["Adjust category and times"]
  Adjust --> Save["Saved as completed"]
  Save --> Timeline
```

Prefilling from the gap is the important detail: it turns reconstructing a day from a
typing exercise into a series of taps.

## 6. Flow 5 - Weekly review

Where the product delivers on its promise.

```mermaid
flowchart TD
  Entry["Dashboard or notification"] --> Ana["Analytics, weekly range"]
  Ana --> Charts["Composition, distribution and comparison"]
  Charts --> Controls{"Adjust the view"}
  Controls -->|"Grouping"| Regroup["Parent or child"]
  Controls -->|"Distraction"| Toggle["Show or hide"]
  Regroup --> Charts
  Toggle --> Charts
  Charts --> Drill["Tap a day"]
  Drill --> DayDetail["Day detail"]
  Charts --> Insight["AI weekly report, if enabled"]
  Insight --> Rec["Recommendations"]
```

## 7. Flow 6 - Building a taxonomy

```mermaid
flowchart TD
  Cats["Categories screen"] --> Choice{"What is being changed?"}
  Choice -->|"New category"| NewCat["Name, parent, colour, icon"]
  Choice -->|"New parent"| NewPar["Name, colour, distraction flag"]
  Choice -->|"Reorganise"| Move["Move a category to another parent"]
  Move --> Warn["Warning: historical rollups will change"]
  Warn --> Apply["Apply"]
  Choice -->|"Remove"| Del{"Has Moments?"}
  Del -->|no| Delete["Delete outright"]
  Del -->|yes| Options["Archive, or reassign then delete"]
```

## 8. Flow 7 - Goals and streaks

```mermaid
flowchart TD
  Goals["Goals screen"] --> New["Create goal"]
  New --> Target["Choose category or parent"]
  Target --> Dir["at_least or at_most"]
  Dir --> Period["daily, weekly or monthly"]
  Period --> Amount["Target minutes"]
  Amount --> Active["Goal active"]
  Active --> Track["Progress updates as Moments are recorded"]
  Track --> Streak{"Daily goal?"}
  Streak -->|yes| Count["Streak counts each qualifying day"]
  Count --> Break{"Day missed?"}
  Break -->|yes| Reset["Current streak resets, longest retained"]
  Break -->|no| Count
```

## 9. Flow 8 - Enabling AI

```mermaid
flowchart TD
  Insights["Insights screen"] --> Off{"Consent given?"}
  Off -->|no| Explain["Explain what is sent, to whom, and what is not"]
  Explain --> Consent{"User decides"}
  Consent -->|"Declines"| Det["Deterministic summary only"]
  Consent -->|"Accepts"| On["ai_consent = true"]
  On --> Min{"Enough data?"}
  Min -->|no| Wait["States how many more days are needed"]
  Min -->|yes| Gen["Generate report"]
  Gen --> Show["Report with insights, recommendations and figures"]
```

The declining branch must remain genuinely useful. A user who refuses AI keeps a complete
product, per DF-AI-010.

## 10. Flow 9 - Data export and account deletion

```mermaid
flowchart TD
  Settings["Settings, account section"] --> Act{"Action"}
  Act -->|"Export"| Fmt["Choose CSV or JSON, and range"]
  Fmt --> File["File downloaded"]
  Act -->|"Delete account"| Offer["Offer export first"]
  Offer --> Type["Type the confirmation phrase"]
  Type --> List["Exactly what will be destroyed is listed"]
  List --> Gone["All rows deleted, session ended"]
```

## 11. Error handling across all flows

| Situation             | Behaviour                                                                             |
| --------------------- | ------------------------------------------------------------------------------------- |
| Network unavailable   | Cached data remains readable; writes show a clear failure with retry. No silent loss. |
| Validation failure    | Inline, on the offending field, phrased as what to do rather than what went wrong.    |
| Queue full            | Refusal with inline resolution, per flow 3.                                           |
| Session expired       | Redirect to sign in, returning to the same route afterwards.                          |
| Server error          | Human-readable message with a retry action and a support route.                       |
| Realtime disconnected | Silent reconnect, with an indicator only if it persists beyond 30 seconds.            |

| ID        | Requirement                                                                             |
| --------- | --------------------------------------------------------------------------------------- |
| DF-UX-030 | No error message MUST expose a stack trace, a database error or an internal identifier. |
| DF-UX-031 | Every error MUST offer a next action.                                                   |
| DF-UX-032 | A failed write MUST NOT discard the user's entered data.                                |

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
