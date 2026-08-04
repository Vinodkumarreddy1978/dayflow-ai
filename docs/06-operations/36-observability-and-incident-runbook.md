# 36 - Observability and Incident Runbook

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-036 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

How DayFlow AI is monitored, what constitutes an incident, and what to do about each kind.
Sized for a solo operator: everything here must be checkable in a few minutes, or it will
not be checked at all.

## 2. The observability problem specific to this product

Most failures in DayFlow AI are **silent**. If reminders stop firing, no page errors, no
request fails, and no user complains for days - they simply stop being reminded and quietly
lose the habit. By the time it is noticed, weeks of the product's central value have been
lost.

Monitoring is therefore weighted toward **things that should have happened and did not**,
rather than toward errors.

## 3. Signals

| Signal                        | Source                   | Why                                       |
| ----------------------------- | ------------------------ | ----------------------------------------- |
| Function errors               | Vercel logs              | Server failures                           |
| Client errors                 | Error boundary reporting | Interface failures                        |
| Web vitals                    | Vercel Analytics         | Performance budgets                       |
| Cron run history              | `cron.job_run_details`   | Whether scheduled work actually ran       |
| Reminder send counts          | Application logs         | Whether notifications are being delivered |
| Auto-close rate               | SQL over `moments`       | Whether the reminder ladder is working    |
| Database size and connections | Supabase dashboard       | Capacity                                  |
| AI spend                      | `ai_usage`               | Cost control                              |

## 4. Health checks

### Daily, about two minutes

```sql
-- Did the scheduled jobs run and succeed?
select jobname, status, start_time, return_message
from cron.job_run_details
where start_time > now() - interval '24 hours'
  and status <> 'succeeded';

-- Auto-close rate: the health of the whole queue mechanic
select
  count(*) filter (where status = 'auto_closed') as auto_closed,
  count(*) as total,
  round(100.0 * count(*) filter (where status = 'auto_closed') / nullif(count(*),0), 1) as pct
from moments
where created_at > now() - interval '7 days';
```

An auto-close rate above 20% means either the reminders are not arriving or the thresholds
are wrong, per the decision rules in
[10 - KPI Framework](../01-business/10-kpi-framework.md) section 7.

### Weekly

North Star metric, day-7 and day-30 retention, error rate, p75 web vitals, AI spend against
budget, database growth.

## 5. Alerts

| Condition                                         | Severity | Response                  |
| ------------------------------------------------- | -------- | ------------------------- |
| Cron job failed twice consecutively               | High     | Investigate within 1 hour |
| No reminders sent in 2 hours with pending Moments | High     | Investigate within 1 hour |
| Error rate above 5% for 15 minutes                | High     | Investigate immediately   |
| Database above 80% of quota                       | Medium   | Plan within a week        |
| AI daily spend cap reached                        | Medium   | Review same day           |
| p75 LCP above 3 seconds for a day                 | Low      | Next release              |
| Push failure rate above 20%                       | Medium   | Investigate within a day  |

## 6. Incident severity

| Level | Meaning                                              | Example                             | Response  |
| ----- | ---------------------------------------------------- | ----------------------------------- | --------- |
| SEV1  | Data loss, data exposure, or capture entirely broken | Moments deleted by a migration      | Immediate |
| SEV2  | A core feature is unusable                           | Reminders not sending               | Same day  |
| SEV3  | A feature is degraded                                | Analytics slow, or one chart broken | Same week |
| SEV4  | Cosmetic or minor                                    | Misaligned label                    | Backlog   |

**Anything touching the integrity of a user's Moment history is SEV1 regardless of how few
users it affects.** The product's entire proposition is that the record can be trusted.

## 7. Runbooks

### 7.1 Reminders have stopped

The most likely incident, and the one most likely to go unnoticed.

1. Are the jobs registered? `select * from cron.job;`
2. Are they succeeding? `select * from cron.job_run_details order by start_time desc limit 20;`
3. Does the endpoint respond? `curl -X POST .../api/cron/reminders -H "Authorization: Bearer $CRON_SECRET"`
4. If it returns 401, `CRON_SECRET` differs between Vercel and Supabase Vault - the classic
   cause, usually after a rotation that updated only one.
5. Are there live subscriptions? `select count(*) from push_subscriptions;`
6. Send a test push to your own device.
7. If subscriptions were mass-deleted, check whether the VAPID keys were regenerated. That
   invalidates every subscription and requires every user to re-subscribe.

### 7.2 A user reports missing Moments

1. Confirm the count directly: `select count(*) from moments where user_id = ...`.
2. If the rows exist, it is a query, timezone or filter problem, not data loss.
3. Check whether the timezone setting changed recently - a changed timezone re-groups
   historical days and can look exactly like disappearance.
4. If rows are genuinely gone, treat as SEV1 and go to
   [37 - Backup and Disaster Recovery](37-backup-and-disaster-recovery.md).

### 7.3 The queue limit is not being enforced

Treat as SEV2, because it undermines the product's core mechanic.

1. Verify the trigger exists on `moments`.
2. Attempt a direct REST insert exceeding the limit; it must be rejected.
3. If the database rejects it but the interface does not, the client check is broken - lower
   severity, since data integrity holds.
4. If the database accepts it, a migration has dropped or replaced the trigger. Restore it
   with a new forward migration.

### 7.4 Elevated error rate

Read the Vercel function logs, identify the route, check whether it correlates with a recent
deployment, and if so promote the previous deployment first and investigate afterwards.

### 7.5 Database near capacity

Check table sizes, confirm `ai_usage` and logs are being pruned on schedule, then upgrade the
Supabase plan. Never delete user Moments to reclaim space, under any circumstances.

## 8. Logging

| ID         | Requirement                                                             |
| ---------- | ----------------------------------------------------------------------- |
| DF-OBS-001 | Logs MUST be structured JSON with a level, message and context.         |
| DF-OBS-002 | Logs MUST NOT contain Moment notes, category names or email addresses.  |
| DF-OBS-003 | Logs MAY contain user identifiers for correlation.                      |
| DF-OBS-004 | Every cron run MUST log counts of processed, sent, skipped and failed.  |
| DF-OBS-005 | Errors MUST include enough context to reproduce, without personal data. |
| DF-OBS-006 | Logs MUST be retained for 30 days.                                      |

DF-OBS-002 is a real constraint with a real cost: it makes some debugging harder. It holds
anyway, because a log aggregator is a second, less protected copy of the most sensitive data
in the system.

## 9. Incident record

Every incident, including those with no user impact, gets a short written record: what
happened, when it was detected and how, what caused it, what was done, who was affected, and
what changes prevent a recurrence.

Records live in `docs/incidents/YYYY-MM-DD-short-name.md`.

The value is cumulative. A single incident record is administration; twenty of them are a
map of where this system actually breaks.

## 10. Post-incident actions

Every SEV1 and SEV2 must produce at least one concrete change - a test, an alert, a
documentation fix or a code change. An incident that produces no change will recur, and the
absence of a change usually means the cause was never really understood.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
