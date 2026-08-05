# 32 - Environment and Configuration

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-032 |
| Version      | 0.2.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

Every environment variable, where it comes from, which environments need it, and which are
secret. Also how a developer gets from a clean machine to a running application.

## 2. Environments

| Environment | Purpose          | Supabase project                     | Host                  |
| ----------- | ---------------- | ------------------------------------ | --------------------- |
| Local       | Development      | Local CLI or a dedicated dev project | `localhost:3000`      |
| Preview     | Per pull request | Development project                  | Vercel preview URL    |
| Production  | Live             | Production project                   | The production domain |

Preview deployments share the development database deliberately. Provisioning a database
per pull request is not worth the complexity at this scale, but it does mean **preview
deployments must never point at production**, which is the one rule here that has real
consequences if broken.

## 3. Variable reference

### 3.1 Application

| Variable              | Secret | Environments | Notes                                                                   |
| --------------------- | ------ | ------------ | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL` | no     | all          | Base URL, no trailing slash. Drives auth redirects and push deep links. |

### 3.2 Supabase

| Variable                        | Secret  | Environments | Notes                                               |
| ------------------------------- | ------- | ------------ | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | no      | all          | Project URL.                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no      | all          | Public by design; safe only because RLS is correct. |
| `SUPABASE_SERVICE_ROLE_KEY`     | **yes** | all          | Bypasses RLS. Cron handlers only.                   |

The anon key being public is not a compromise, it is the intended design - it identifies the
project, and authorisation comes from the user's JWT combined with RLS. That safety is
entirely conditional on section 9 of
[25 - Database Schema and RLS](../04-architecture/25-database-schema-and-rls.md) being
verified before every release.

The service role key is the most dangerous value in the system. It reads and writes every
user's data unconditionally. It must never be referenced outside `app/api/cron/`, which is
enforced by an ESLint restricted-import rule per DF-ENG-021.

### 3.3 Web push

| Variable                       | Secret  | Environments | Notes                                    |
| ------------------------------ | ------- | ------------ | ---------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | no      | all          | Sent to the browser during subscription. |
| `VAPID_PRIVATE_KEY`            | **yes** | all          | Signs push messages.                     |
| `VAPID_SUBJECT`                | no      | all          | A `mailto:` or `https:` URL you control. |

Generate with `npm run vapid:generate`. **Regenerating invalidates every existing push
subscription**, which silently stops reminders for every user until they re-subscribe.
Generate once per environment and treat the pair as permanent.

### 3.4 Scheduled jobs

| Variable      | Secret  | Environments | Notes                                                                                           |
| ------------- | ------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `CRON_SECRET` | **yes** | all          | Bearer token for `/api/cron/*`. Must also be stored in Supabase Vault so `pg_cron` can send it. |

Generate with `openssl rand -base64 48`. This value lives in two places - Vercel and
Supabase Vault - and rotating it means updating both, in that order, or reminders stop.

### 3.5 AI

| Variable            | Secret  | Environments | Notes                                             |
| ------------------- | ------- | ------------ | ------------------------------------------------- |
| `AI_ENABLED`        | no      | all          | Master switch. `false` disables every AI surface. |
| `AI_PROVIDER`       | no      | all          | `openai` or `anthropic`.                          |
| `AI_MODEL`          | no      | all          | Model identifier.                                 |
| `OPENAI_API_KEY`    | **yes** | as needed    | Required when the provider is OpenAI.             |
| `ANTHROPIC_API_KEY` | **yes** | as needed    | Required when the provider is Anthropic.          |

`AI_ENABLED=false` is the default for local development so that ordinary work never incurs
model costs.

## 4. Validation at startup

Configuration is validated once, at module load, with Zod. A missing or malformed value
fails the build or the boot rather than surfacing as a confusing runtime error three screens
into the application.

| ID         | Requirement                                                         |
| ---------- | ------------------------------------------------------------------- |
| DF-CFG-001 | Every variable MUST be validated at startup.                        |
| DF-CFG-002 | A missing required variable MUST fail loudly and name the variable. |
| DF-CFG-003 | Server-only variables MUST NOT be importable from client code.      |
| DF-CFG-004 | An AI key MUST be required only when `AI_ENABLED` is true.          |
| DF-CFG-005 | Validation errors MUST NOT print the value of a secret.             |

## 5. Local setup from scratch

```bash
# 1. Install dependencies
npm install

# 2. Environment
cp .env.example .env.local

# 3. Supabase: either the hosted dev project, or locally
supabase start            # local, requires Docker
supabase db reset         # applies every migration in order

# 4. Push keys
npm run vapid:generate    # paste the output into .env.local

# 5. Cron secret
openssl rand -base64 48   # paste as CRON_SECRET

# 6. Run
npm run dev
```

Local development runs no scheduler. Cron routes are invoked by hand:

```bash
curl -X POST http://localhost:3000/api/cron/reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 6. Storing secrets

| Location                | Holds                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `.env.local`            | Local values. Git-ignored, never committed.                          |
| Vercel project settings | Preview and production values, marked sensitive.                     |
| Supabase Vault          | Two secrets, `dayflow_app_url` and `dayflow_cron_secret`. See below. |
| GitHub Actions secrets  | CI values only.                                                      |

Supabase Vault holds exactly two secrets, and the names are load-bearing:
`public.invoke_cron_endpoint` in `0011_scheduled_jobs.sql` looks them up by name, and a
secret stored under any other name reads as absent rather than as an error.

| Vault secret          | Value                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `dayflow_app_url`     | The deployed origin, no trailing slash - the function appends a path to it.           |
| `dayflow_cron_secret` | The same value as `CRON_SECRET` in Vercel. A mismatch means every scheduled job 401s. |

They are in Vault so that `pg_cron`, which runs inside the database, can reach the
application without either value being embedded in a committed migration. Both are read when
the function is called, not when the migration is applied. Section 4.1 of
[33 - CI/CD and Deployment Runbook](33-cicd-and-deployment-runbook.md) covers what that means
for deployment ordering.

| ID         | Requirement                                                            |
| ---------- | ---------------------------------------------------------------------- |
| DF-CFG-010 | Secrets MUST NOT be committed, in any form, including in migrations.   |
| DF-CFG-011 | Production secrets MUST differ from development secrets.               |
| DF-CFG-012 | Secrets MUST be rotatable without a code change.                       |
| DF-CFG-013 | A leaked secret MUST be rotated immediately and the incident recorded. |

## 7. Rotation

| Secret                      | Cadence                        | Impact of rotation                               |
| --------------------------- | ------------------------------ | ------------------------------------------------ |
| `CRON_SECRET`               | Every 6 months or on suspicion | Update Vercel then Supabase Vault, or jobs stop. |
| `SUPABASE_SERVICE_ROLE_KEY` | On suspicion                   | Immediate; update everywhere it is referenced.   |
| VAPID pair                  | Only if compromised            | Severe: every push subscription is invalidated.  |
| AI provider key             | Every 6 months                 | Update Vercel; no user impact.                   |

## 8. Feature flags

Runtime toggles live in the `feature_flags` table rather than in environment variables, so
that turning something on does not require a deployment. Environment variables are for
configuration that differs between environments; flags are for behaviour that differs
between users.

---

## Change History

| Version | Date       | Author  | Change                                                                                                                                                                                                                                                              |
| ------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft.                                                                                                                                                                                                                                                      |
| 0.2.0   | 2026-08-04 | Founder | Section 6 corrected. Supabase Vault holds `dayflow_app_url` and `dayflow_cron_secret`, not `CRON_SECRET`; the previous entry named a secret that does not exist under that name in Vault and omitted the app URL entirely. Added the two names and what each holds. |
