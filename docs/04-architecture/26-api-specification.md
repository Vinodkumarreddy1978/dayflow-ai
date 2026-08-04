# 26 - API Specification

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-026 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

Every programmatic surface: what exists, what it accepts, what it returns and how it fails.
Also, importantly, what deliberately does not exist.

## 2. Three surfaces, and when each is used

| Surface                  | Used for                                                      |
| ------------------------ | ------------------------------------------------------------- |
| Supabase client, direct  | Ordinary reads and writes of the user's own rows              |
| Server actions           | Form mutations invoked from React components                  |
| Route handlers `/api/v1` | Anything needing a secret, spanning users, or calling outward |

### 2.1 Why most operations have no endpoint

Creating a Moment does not go through a hand-written endpoint. The client calls Supabase
directly, RLS confirms ownership, and triggers enforce the domain rules.

A custom endpoint here would add a network hop, duplicate authorisation that RLS already
performs correctly, and introduce a second place for bugs to live - while providing no
additional safety, because the direct path remains open regardless. Endpoints are therefore
written only where they genuinely add something.

## 3. Conventions

Base path `/api/v1`. Versioned from the first release so that a future breaking change has
somewhere to go.

Requests and responses are JSON. Authentication is the Supabase session cookie, except for
cron routes which use a bearer secret.

Success:

```json
{ "data": {}, "meta": {} }
```

Failure:

```json
{
  "error": {
    "code": "QUEUE_LIMIT_REACHED",
    "message": "You already have 2 activities open. Close one first.",
    "details": { "pendingCount": 2, "limit": 2 }
  }
}
```

| Code                     | HTTP | Meaning                                       |
| ------------------------ | ---- | --------------------------------------------- |
| `UNAUTHENTICATED`        | 401  | No valid session                              |
| `FORBIDDEN`              | 403  | Authenticated but not permitted               |
| `NOT_FOUND`              | 404  | No such resource for this user                |
| `VALIDATION_FAILED`      | 422  | Input failed schema validation                |
| `QUEUE_LIMIT_REACHED`    | 409  | Would exceed the pending limit                |
| `DUPLICATE_MOMENT`       | 409  | Same category and start time already exists   |
| `INVALID_TIME_RANGE`     | 422  | End not after start, or a time out of bounds  |
| `SYSTEM_CATEGORY_LOCKED` | 403  | Attempt to modify a protected system row      |
| `CATEGORY_IN_USE`        | 409  | Deletion attempted on a category with Moments |
| `AI_DISABLED`            | 403  | AI is off, or consent not given               |
| `AI_QUOTA_EXCEEDED`      | 429  | Per-user AI ceiling reached                   |
| `RATE_LIMITED`           | 429  | Too many requests                             |
| `INTERNAL_ERROR`         | 500  | Unexpected failure                            |

| ID         | Requirement                                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| DF-API-001 | Every response MUST use these envelopes.                                       |
| DF-API-002 | Error messages MUST be safe to display directly to a user.                     |
| DF-API-003 | Errors MUST NOT leak stack traces, SQL text or internal identifiers.           |
| DF-API-004 | Database errors MUST be translated into these codes before leaving the server. |

DF-API-004 is what makes DF-UX-113 possible: the queue trigger raises a PostgreSQL
exception, and the translation layer turns it into `QUEUE_LIMIT_REACHED` with the pending
count, which the modal renders as an actionable refusal.

## 4. Direct Supabase operations

Performed from the client with the user's session. RLS restricts every one of them to the
caller's own rows.

| Operation                                | Table               |
| ---------------------------------------- | ------------------- |
| List, create, update, delete Moments     | `moments`           |
| List, create, update, archive Categories | `categories`        |
| List, create, update Parent Categories   | `parent_categories` |
| Read and update Settings                 | `settings`          |
| Manage Goals                             | `goals`             |
| Read AI reports                          | `ai_reports`        |
| Call analytics functions                 | `rpc`               |

## 5. Server actions

| Action             | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `createMoment`     | Validate, insert, translate errors, revalidate the cache.           |
| `updateMoment`     | The same for edits.                                                 |
| `deleteMoment`     | Delete with undo support.                                           |
| `closeMoment`      | Set the end time to now, the one-tap close of DF-QUE-020.           |
| `createCategory`   | Including creation from inside the Moment modal.                    |
| `reassignCategory` | Move a category to a different parent, with the historical warning. |
| `updateSettings`   | Validate against documented ranges and persist.                     |
| `upsertGoal`       | Create or update a goal.                                            |

Every action validates with the same Zod schema the client form uses, so client and server
cannot disagree about what is valid.

## 6. Route handlers

### 6.1 Push notifications

| Method | Path                        | Purpose                                    |
| ------ | --------------------------- | ------------------------------------------ |
| POST   | `/api/v1/push/subscribe`    | Register this browser's push subscription. |
| DELETE | `/api/v1/push/subscribe`    | Remove it.                                 |
| GET    | `/api/v1/push/devices`      | List registered devices, per DF-SET-026.   |
| DELETE | `/api/v1/push/devices/[id]` | Revoke one.                                |
| POST   | `/api/v1/push/test`         | Send a test notification to this device.   |

### 6.2 AI

| Method | Path                      | Purpose                         |
| ------ | ------------------------- | ------------------------------- |
| POST   | `/api/v1/ai/reports`      | Generate a report for a period. |
| GET    | `/api/v1/ai/reports`      | List reports.                   |
| GET    | `/api/v1/ai/reports/[id]` | Fetch one.                      |
| DELETE | `/api/v1/ai/reports/[id]` | Delete one.                     |
| POST   | `/api/v1/ai/consent`      | Record or withdraw consent.     |

These are route handlers rather than direct table operations because the provider key must
never reach the browser, and because quota enforcement has to happen server-side.

### 6.3 Data

| Method | Path                               | Purpose                                 |
| ------ | ---------------------------------- | --------------------------------------- |
| GET    | `/api/v1/export?format=&from=&to=` | Export as CSV or JSON.                  |
| POST   | `/api/v1/import`                   | Import a previously exported JSON file. |
| DELETE | `/api/v1/account`                  | Delete the account and all data.        |

Export streams rather than buffering, so that a multi-year history does not exhaust
function memory. Import validates the entire file before applying anything, per DF-SET-033 -
a partially applied import is worse than a rejected one.

### 6.4 Cron

| Method | Path                     | Schedule     | Purpose                            |
| ------ | ------------------------ | ------------ | ---------------------------------- |
| POST   | `/api/cron/reminders`    | every 10 min | Evaluate and send queue reminders. |
| POST   | `/api/cron/auto-close`   | every 15 min | Close Moments past the threshold.  |
| POST   | `/api/cron/daily-report` | daily        | Generate scheduled AI reports.     |

| ID         | Requirement                                                                              |
| ---------- | ---------------------------------------------------------------------------------------- |
| DF-API-010 | Cron routes MUST require `Authorization: Bearer <CRON_SECRET>` and return 401 otherwise. |
| DF-API-011 | The secret MUST be compared in constant time.                                            |
| DF-API-012 | Cron routes MUST be idempotent within their window.                                      |
| DF-API-013 | Cron routes MUST return counts of processed, succeeded, skipped and failed.              |
| DF-API-014 | A single user's failure MUST NOT abort the run.                                          |
| DF-API-015 | Cron routes MUST NOT be reachable with a user session; only the secret grants access.    |

DF-API-011 prevents a timing attack against the secret. It costs one function call and
removes an entire class of vulnerability.

## 7. Rate limits

| Surface              | Limit                   |
| -------------------- | ----------------------- |
| AI report generation | 10 per user per hour    |
| Export               | 5 per user per hour     |
| Import               | 3 per user per day      |
| Push test            | 10 per user per hour    |
| Other routes         | 100 per user per minute |

Exceeding a limit returns 429 with `Retry-After`.

## 8. Not provided in 1.0

A public API with personal access tokens, webhooks, OAuth for third-party applications, and
bulk write endpoints. Each is in the backlog. None is needed for a single-user product, and
each would expand the security surface considerably.

## 9. Contract testing

| ID         | Requirement                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| DF-API-020 | Every route handler MUST validate its input with a Zod schema.                     |
| DF-API-021 | Request and response schemas MUST be defined once and shared by client and server. |
| DF-API-022 | Every documented error code MUST have a test that provokes it.                     |
| DF-API-023 | Adding a required request field MUST be treated as a breaking change.              |

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
