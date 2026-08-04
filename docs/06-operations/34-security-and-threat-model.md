# 34 - Security and Threat Model

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-034 |
| Version      | 0.2.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

What DayFlow AI is protecting, from whom, and how. The threat model is specific to this
product rather than generic, because the asset being protected is unusual: not money, not
credentials, but a minute-by-minute record of how a person lives.

## 2. Assets

| Asset               | Sensitivity | Why it matters                                                                                                                               |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Moment history      | High        | Reveals working hours, sleep, health habits, religious practice, relationships and productivity. Far more revealing than most people assume. |
| Category names      | Medium      | User-authored free text that may itself disclose personal circumstances.                                                                     |
| Account credentials | High        | Access to everything above.                                                                                                                  |
| Service role key    | Critical    | Reads and writes every user's data unconditionally.                                                                                          |
| VAPID private key   | Medium      | Would allow forged notifications to all subscribed devices.                                                                                  |
| `CRON_SECRET`       | Medium      | Would allow triggering jobs and sending notifications.                                                                                       |
| AI provider key     | Medium      | Financial loss and quota exhaustion.                                                                                                         |

The first row deserves emphasis. A year of DayFlow data would let a reader infer when
someone sleeps, whether they are ill, whether their marriage is going well, when they are at
home, and whether they are looking for another job. It warrants the same care as health data
even though no regulator classifies it that way.

## 3. Adversaries

| Adversary                  | Capability                              | Motivation                         |
| -------------------------- | --------------------------------------- | ---------------------------------- |
| Opportunistic attacker     | Automated scanning, credential stuffing | Any accessible data                |
| Another user               | A valid account and an HTTP client      | Curiosity, or targeted interest    |
| Someone with device access | Physical access to an unlocked phone    | Personal, often domestic           |
| Malicious dependency       | Code execution in the build or client   | Data exfiltration                  |
| The platform               | Full infrastructure access              | Not an adversary, but a dependency |

"Another user" is the most likely realistic attacker, and the one the architecture is most
directly designed against - which is why RLS is the primary control rather than a secondary
one.

## 4. Controls by threat

### 4.1 Cross-user data access

**The central threat.** Supabase exposes PostgreSQL over HTTPS to browsers, so any user can
send arbitrary queries with a valid session. "The application only requests its own data" is
not a control.

| Control                                               | Reference                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| RLS enabled on every table with explicit policies     | DF-SEC-001, 002                                                  |
| Every policy compares `user_id` to `auth.uid()`       | DF-SEC-003                                                       |
| Composite foreign keys preventing cross-user linkage  | Section 3.2 of [24](../04-architecture/24-data-model-and-erd.md) |
| `security definer` functions with empty `search_path` | DF-SEC-004                                                       |
| RLS verified against the REST endpoint each release   | DF-TST-012                                                       |

### 4.2 Credential compromise

Passwords are hashed by Supabase Auth with bcrypt; the application never sees or stores
them. Sessions are short-lived JWTs with refresh tokens, in httpOnly cookies. Sign-in is
rate limited. Errors do not disclose whether an address is registered, per DF-UX-191.

Two-factor authentication is not in 1.0 and is the most significant known gap. It is the
first security item in the 1.1 backlog.

### 4.3 Secret exposure

| Control                                                                      |
| ---------------------------------------------------------------------------- |
| Server-only variables never prefixed `NEXT_PUBLIC_`                          |
| Service role client importable only from `app/api/cron/`, enforced by ESLint |
| `.env.local` git-ignored; `.env.example` contains only placeholders          |
| Secrets stored in Vercel and Supabase Vault, never in migrations             |
| A build-time check that no secret appears in the client bundle               |

The last one is worth having as an automated check rather than a habit, because the failure
mode - a service role key shipped in JavaScript - exposes every user simultaneously and
would not be noticed by any test that only checks behaviour.

### 4.4 Job endpoint abuse

Cron routes send notifications and modify data. Unauthenticated, they would let anyone spam
every user's phone.

Controls: a bearer secret compared in constant time (DF-API-011), no user session accepted
(DF-API-015), idempotency (DF-API-012), and rate limiting.

### 4.5 Injection

Parameterised queries throughout via the Supabase client. React escapes output by default,
and `dangerouslySetInnerHTML` is not used anywhere. Every input is validated with Zod before
it reaches the database. Category names and notes are stored and rendered as text, never
interpreted.

### 4.6 Cross-site scripting and request forgery

A Content Security Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Strict-Transport-Security` and a restrictive `Permissions-Policy` are set in
[next.config.ts](../../next.config.ts). SameSite cookies plus Next.js server action
protections cover request forgery.

Two things about that policy are worth stating rather than leaving to be discovered:

- `connect-src` names the configured Supabase origin, for both `https:` and `wss:`, rather
  than `https://*.supabase.co`. The wildcard would permit this origin to talk to every
  other project on the platform.
- `script-src` permits `'unsafe-inline'`, so the policy is a damage limit rather than a
  complete defence against injected script. The App Router serves its hydration payload as
  inline script tags; removing the allowance means issuing per-request nonces from the
  middleware, which Next.js supports but which opts every route out of static rendering.
  `'unsafe-eval'` is permitted in development only, where React Refresh requires it, and is
  absent from production builds as DF-SEC-023 requires.

`Strict-Transport-Security` is also omitted in development. A browser that has seen it for
`localhost` will refuse plain HTTP there for every project on the machine afterwards.

### 4.7 Supply chain

Dependencies are deliberately few - ADR-007's decision to hand-build the component kit
removed an entire dependency tree. `npm audit --audit-level=high` runs as its own job in
[ci.yml](../../.github/workflows/ci.yml), the lockfile is committed, and major upgrades are
deliberate rather than automatic.

That job carries no `needs` and gates nothing, which is deliberate. An advisory appears when
a third party publishes it, so making it a step in the main job would fail pull requests for
reasons their authors cannot fix - and a check that is red for unrelated reasons is a check
people learn to ignore. Advisories below high severity are not reported at all; see section
4.2 of [GO-LIVE.md](../../GO-LIVE.md) for the manual review that covers them.

### 4.8 Data exposure through AI

Facts sent to a model contain category names and durations, never raw Moments or notes
(DF-AIA-001, DF-AIA-002). Consent is explicit and withdrawable. A provider with a no-training
guarantee is required. A test asserts that no raw Moment data appears in an assembled prompt
(DF-AIA-063), because a privacy guarantee that depends on nobody making a mistake during a
refactor is not a guarantee.

## 5. Requirements

| ID         | Requirement                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| DF-SEC-020 | All traffic MUST be HTTPS. HTTP MUST redirect.                              |
| DF-SEC-021 | HSTS MUST be enabled in production.                                         |
| DF-SEC-022 | Session cookies MUST be httpOnly, Secure and SameSite=Lax.                  |
| DF-SEC-023 | A Content Security Policy MUST be set and MUST NOT permit `unsafe-eval`.    |
| DF-SEC-024 | Every input MUST be validated server-side, regardless of client validation. |
| DF-SEC-025 | Errors MUST NOT disclose internal structure.                                |
| DF-SEC-026 | Dependencies MUST be audited in CI.                                         |
| DF-SEC-027 | Authentication endpoints MUST be rate limited.                              |
| DF-SEC-028 | The service role key MUST NOT appear outside `app/api/cron/`.               |
| DF-SEC-029 | A build MUST fail if a server-only secret is detected in the client bundle. |

## 6. Accepted risks

Stated explicitly, because an unstated accepted risk is indistinguishable from an oversight.

| Risk                                        | Why accepted                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| No two-factor authentication in 1.0         | Single-user product, no financial data. First item in the 1.1 security backlog.            |
| No end-to-end encryption                    | Would make server-side aggregation and AI impossible. The trade-off is disclosed to users. |
| Platform trust in Supabase and Vercel       | Unavoidable without self-hosting. Both are reputable and audited.                          |
| Preview deployments share a dev database    | No production data is present. Complexity of per-PR databases is not justified.            |
| Device-level access is not defended against | An unlocked phone is outside the application's control.                                    |

## 7. Incident response

1. Contain - revoke the compromised credential, disable the affected route.
2. Assess - determine what was accessible and for how long.
3. Notify - inform affected users within 72 hours if personal data was exposed.
4. Remediate - fix, deploy, verify.
5. Record - write it up per
   [36 - Observability and Incident Runbook](36-observability-and-incident-runbook.md).

| ID         | Requirement                                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| DF-SEC-030 | A suspected key compromise MUST result in rotation within one hour.            |
| DF-SEC-031 | A confirmed data exposure MUST be disclosed to affected users within 72 hours. |
| DF-SEC-032 | Every incident MUST be documented, including those with no user impact.        |

## 8. Review

Reviewed on every release for RLS verification and dependency audit; on every schema change
for new tables and policies; and whenever a new external integration is added.

---

## Change History

| Version | Date       | Author  | Change                                                                                                                                     |
| ------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0   | 2026-08-04 | Founder | Initial draft.                                                                                                                             |
| 0.2.0   | 2026-08-04 | Founder | Described the Content Security Policy and HSTS header as actually set, including the `'unsafe-inline'` trade-off, and the audit job in CI. |
