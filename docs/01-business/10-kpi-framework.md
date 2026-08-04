# 10 - KPI Framework

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-010 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

What DayFlow AI measures to know whether it is working, which single metric overrides the
others, and which tempting metrics are deliberately ignored. Also - importantly for a
product built on personal data - what is measured about users and how that is kept
compatible with the privacy commitments in
[35 - Privacy and Data Protection](../06-operations/35-privacy-and-data-protection.md).

## 2. The North Star

**Weekly Recording Days per Active User** - the average number of distinct Local Days per
week on which a user records at least one Moment.

| Level     | Meaning                            |
| --------- | ---------------------------------- |
| Below 2   | Failing. The habit has not formed. |
| 3 to 4    | Working. Analytics are meaningful. |
| 5 or more | Excellent. The user relies on it.  |

**Why this one.** It is the only metric that simultaneously proves the habit formed, the
data is dense enough to analyse, and the user finds the effort worthwhile. Signups measure
curiosity. Session counts measure fiddling. Recording days measure the thing the product
exists to cause.

## 3. Metric tiers

### Tier 1 - Health

| Metric                | Definition                                                 | Target at Stage 2 |
| --------------------- | ---------------------------------------------------------- | ----------------- |
| Weekly Recording Days | North Star, above                                          | 3.5+              |
| Day-30 retention      | Share of signups recording a Moment on day 30              | 25%+              |
| Day-7 retention       | Share of signups recording a Moment on day 7               | 50%+              |
| Queue closure rate    | Pending Moments closed by the user rather than auto-closed | 85%+              |
| Data honesty rate     | Completed Moments as a share of all Moments                | 90%+              |

**Queue closure rate is the health check on the signature mechanic.** If it falls, either
the reminders are not landing or the cadence is wrong, and it should be investigated
before any feature work.

### Tier 2 - Engagement

| Metric                    | Definition                                           | Target |
| ------------------------- | ---------------------------------------------------- | ------ |
| Moments per recording day | Average Moments on days with any recording           | 4+     |
| Analytics visit rate      | Weekly active users who open analytics at least once | 60%+   |
| Category customisation    | Users who create at least one category of their own  | 70%+   |
| Goal adoption             | Users with at least one active goal                  | 40%+   |
| Notification opt-in       | Users who grant push permission                      | 60%+   |

Category customisation is a leading indicator of retention: a user who has built their own
taxonomy has invested in the product and is markedly less likely to leave.

### Tier 3 - Quality

| Metric                         | Target            |
| ------------------------------ | ----------------- |
| Largest Contentful Paint, p75  | Under 2.0 seconds |
| Interaction to Next Paint, p75 | Under 200 ms      |
| Time to save a Moment, p75     | Under 10 seconds  |
| API error rate                 | Under 0.5%        |
| Sync propagation, p95          | Under 5 seconds   |
| Reminder delivery accuracy     | 95%+ within 2 min |
| Uptime                         | 99.5%+            |

### Tier 4 - Business, from Stage 4

Free to paid conversion 3%+; monthly churn under 5%; AI cost per paying user under $0.50;
gross margin above 85%.

## 4. Deliberately not measured

| Not measured                | Why                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Time in app                 | The product's purpose is to reduce time spent on it. Rewarding this metric would corrupt design. |
| Total signups               | A vanity number, unconnected to whether anyone is helped.                                        |
| Individual category content | What a user calls their categories is private. Only counts are aggregated, never labels.         |
| Any per-user Moment content | Never leaves the user's own rows. Analytics operate on counts and durations, never on meaning.   |

The third and fourth entries are commitments, not preferences: category names and Moment
notes are excluded from all product analytics by construction, because a category name can
itself be sensitive personal information.

## 5. Measurement method

Tier 1 and 2 metrics are computed by scheduled SQL over the production database into an
aggregate table. No third-party analytics SDK is embedded in the client, which keeps the
privacy story simple and avoids shipping a tracker inside a privacy-positioned product.

Tier 3 web vitals come from Vercel Analytics, which is aggregate and cookieless. Error
rates come from server logs.

## 6. Review cadence

| Cadence   | Reviewed                                       |
| --------- | ---------------------------------------------- |
| Weekly    | North Star, queue closure rate, error rate     |
| Monthly   | All Tier 1 and 2, retention cohorts            |
| Quarterly | Everything, plus whether these are still right |

## 7. Decision rules

Rules written in advance, so that they are followed rather than rationalised away.

- **Weekly Recording Days below 2 for two consecutive months** - stop feature work and
  investigate the habit loop. Nothing else matters until this recovers.
- **Queue closure rate below 70%** - the reminder engine is failing. Treat as a defect.
- **Day-7 retention below 30%** - onboarding is broken, not the product.
- **Auto-close rate above 20% of Moments** - either thresholds are wrong or reminders are
  not arriving.
- **Analytics visit rate below 30%** - the insight layer is not delivering value and the
  paid tier premise is in doubt.

## 8. Stage 0 success criteria

At the founder-only stage, the framework reduces to four questions, answered honestly:

1. Did I record on at least 21 of the last 30 days?
2. Did I close my own Moments, or did the system close them for me?
3. Did I look at the analytics without forcing myself to?
4. Can I name one thing I changed because of something it showed me?

Four yeses permit Stage 1. Anything less means the product changes before it meets
anyone else.

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
