# 30 - Coding Standards

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-030 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

Conventions for the codebase: structure, naming, typing, error handling and comments. The
goal is that a contributor - or the founder returning after three months away - can predict
where something lives and what it looks like before opening the file.

## 2. Repository structure

```
src/
├── app/                      # routes, layouts, API handlers
│   ├── (auth)/               # unauthenticated route group
│   ├── (app)/                # authenticated route group
│   └── api/
│       ├── v1/
│       └── cron/
├── components/
│   ├── ui/                   # the hand-built component kit
│   ├── layout/               # shell, navigation, sidebar, bottom bar
│   └── charts/               # chart wrappers over Recharts
├── features/                 # feature modules
│   ├── moments/
│   ├── categories/
│   ├── analytics/
│   ├── goals/
│   ├── insights/
│   └── settings/
├── lib/
│   ├── supabase/             # clients and generated types
│   ├── domain/               # pure business rules
│   ├── ai/                   # providers, prompts, adapters
│   ├── notifications/        # push helpers and templates
│   └── utils/                # formatting, dates, colours
└── types/
```

### 2.1 Feature module shape

Each feature folder is self-contained and follows the same internal layout:

```
features/moments/
├── components/     # UI specific to this feature
├── hooks/          # queries and mutations
├── schemas.ts      # Zod schemas shared by form, action and API
├── queries.ts      # data access
└── index.ts        # the public surface of the module
```

**Cross-feature imports go through `index.ts` only.** Reaching into another feature's
internals is what turns a modular codebase into a tangled one, and it happens gradually
unless the rule is explicit.

### 2.2 `lib/domain` is special

Business rules live here as **pure functions with no imports from React, Next.js or
Supabase**. Queue limit evaluation, time validation, midnight splitting, streak computation,
productivity scoring and quiet-hours arithmetic all live here.

This is what makes the rules unit-testable without a database and what lets the same code
run in a form, a server action and a cron job. It is also the TypeScript half of the
deliberate duplication accepted in ADR-004, and the tests in this folder are what keep it in
agreement with the SQL half.

## 3. Naming

| Kind                 | Convention         | Example               |
| -------------------- | ------------------ | --------------------- |
| Component files      | `PascalCase.tsx`   | `QueueCard.tsx`       |
| Other files          | `kebab-case.ts`    | `queue-rules.ts`      |
| Components           | `PascalCase`       | `MomentForm`          |
| Hooks                | `useCamelCase`     | `usePendingMoments`   |
| Functions            | `camelCase`        | `calculateStreak`     |
| Constants            | `UPPER_SNAKE_CASE` | `DEFAULT_QUEUE_LIMIT` |
| Types and interfaces | `PascalCase`       | `MomentWithCategory`  |
| Database columns     | `snake_case`       | `start_at`            |
| Route segments       | `kebab-case`       | `/reset-password`     |

Domain vocabulary comes from [03 - Glossary](../00-governance/03-glossary.md) without
exception. A variable named `activity`, `entry` or `task` where a Moment is meant is a
review comment, because inconsistent naming is how a shared vocabulary quietly dies.

## 4. TypeScript

`strict` and `noUncheckedIndexedAccess` are both on.

| ID         | Requirement                                                                          |
| ---------- | ------------------------------------------------------------------------------------ |
| DF-ENG-001 | `any` MUST NOT be used. `unknown` with narrowing where a type is genuinely open.     |
| DF-ENG-002 | Type assertions MUST be justified by a comment stating why the compiler cannot know. |
| DF-ENG-003 | Database types MUST be generated from the schema, never hand-written.                |
| DF-ENG-004 | Shared types MUST be defined once and imported, never duplicated per feature.        |
| DF-ENG-005 | Function parameters and returns MUST be explicitly typed on exported functions.      |
| DF-ENG-006 | Discriminated unions MUST be preferred over optional-field combinations.             |

DF-ENG-003 matters in practice: a hand-written `Moment` type will drift from the table after
the second migration, and the drift is silent.

## 5. React and Next.js

| ID         | Requirement                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------- |
| DF-ENG-010 | Server components MUST be the default. `"use client"` only where interactivity requires it. |
| DF-ENG-011 | `"use client"` MUST be placed as deep in the tree as possible, not on a layout.             |
| DF-ENG-012 | Server state MUST come from TanStack Query and MUST NOT be copied into `useState`.          |
| DF-ENG-013 | `useEffect` MUST NOT be used for data fetching.                                             |
| DF-ENG-014 | Every list MUST use a stable key. Array index is not a key.                                 |
| DF-ENG-015 | Components over roughly 200 lines SHOULD be decomposed.                                     |
| DF-ENG-016 | Charts MUST be dynamically imported, per DF-A11Y-060.                                       |

## 6. Data access

| ID         | Requirement                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| DF-ENG-020 | Supabase clients MUST come from `lib/supabase`, never constructed inline.                                                |
| DF-ENG-021 | The service role client MUST only be imported inside `app/api/cron/`.                                                    |
| DF-ENG-022 | Every query MUST select explicit columns. `select("*")` is forbidden outside generated types.                            |
| DF-ENG-023 | Every mutation MUST validate with a Zod schema first.                                                                    |
| DF-ENG-024 | Database errors MUST be translated to the codes in [26 - API Specification](../04-architecture/26-api-specification.md). |

DF-ENG-021 is enforced by an ESLint restricted-import rule rather than left to memory,
because a service role key reaching a client bundle would expose every user's data at once.

## 7. Error handling

| ID         | Requirement                                                            |
| ---------- | ---------------------------------------------------------------------- |
| DF-ENG-030 | Errors MUST NOT be swallowed. Handle, or propagate with context.       |
| DF-ENG-031 | User-facing messages MUST be actionable and free of technical detail.  |
| DF-ENG-032 | Every async operation MUST have an error path in the interface.        |
| DF-ENG-033 | Error boundaries MUST wrap each route segment.                         |
| DF-ENG-034 | Logged errors MUST include context but MUST NOT include personal data. |

## 8. Comments

Comments explain **why**, never **what**. The code already says what it does.

Forbidden: comments narrating the next line; comments describing a change or its history;
commented-out code; explanations that a reviewer needs but a future reader does not.

Worth writing: a requirement identifier justifying a non-obvious constant; a constraint the
code cannot express; a workaround with the reason it is necessary.

```typescript
// DF-MOM-011: five minutes of tolerance for client clock drift.
const FUTURE_TOLERANCE_MINUTES = 5;
```

That comment earns its place because `5` is otherwise arbitrary and the next reader would
reasonably wonder whether they can change it.

## 9. Formatting and linting

Prettier settings are in `.prettierrc` and are not negotiable per-file. ESLint uses
`next/core-web-vitals` plus `next/typescript`, with `consistent-type-imports`, unused
variables as errors, restricted imports for the service role client, and `jsx-a11y` rules
treated as errors rather than warnings.

## 10. Git

Branches: `feature/<short-description>`, `fix/<short-description>`,
`docs/<short-description>`.

Commits follow Conventional Commits. The body explains why; the subject stays under 72
characters.

```
feat(moments): enforce queue limit in the database

The client check alone could be bypassed by a second device or a direct
API call. Adds a trigger per ADR-004 and DF-QUE-005.
```

| ID         | Requirement                                                                |
| ---------- | -------------------------------------------------------------------------- |
| DF-ENG-040 | `main` MUST always be deployable.                                          |
| DF-ENG-041 | Every change MUST pass typecheck, lint and tests before merge.             |
| DF-ENG-042 | Migrations MUST NOT be edited after being applied to production.           |
| DF-ENG-043 | Secrets MUST NOT be committed. `.env.local` is ignored and stays that way. |

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
