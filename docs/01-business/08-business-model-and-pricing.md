# 08 - Business Model and Pricing

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-008 |
| Version      | 0.1.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

How DayFlow AI sustains itself, what is free, what is paid, and which revenue models are
refused outright. Written now, before any user exists, because pricing decisions
constrain architecture - metering, entitlement checks and cost attribution are painful to
retrofit.

## 2. Current stage

DayFlow AI is pre-revenue and single-user. Nothing in this document is implemented in
1.0. It exists so that 1.0 does not make choices that foreclose it.

## 3. Refused models

| Model                        | Why it is refused                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Advertising                  | Requires attention, which is the exact resource the product helps users protect. Self-defeating.                                       |
| Selling or brokering data    | Contradicts principle 1 of the charter. The data is a detailed record of a person's life; it is not a saleable asset.                  |
| Employer or team licensing   | Turns the product into supervision software. See anti-personas in [07](07-personas-and-jobs-to-be-done.md).                            |
| Freemium with a data ceiling | Holding a user's own history hostage - "upgrade to see beyond 30 days" - is coercive and punishes exactly the long-term users to keep. |

That last one deserves emphasis because it is the industry norm and it is genuinely
tempting. DayFlow AI will not do it: **a user's own history is always fully visible to
them, forever, on every tier.** Paid tiers may add interpretation, never access.

## 4. Chosen model

Freemium, where the free tier is a complete and permanently usable product and the paid
tier covers marginal cost plus a margin.

The dividing line is deliberate: **free covers everything deterministic, paid covers
everything that costs money per use.** AI model calls have a real per-user cost; SQL
aggregations do not. Pricing that mirrors cost structure is defensible to users and does
not require artificial crippling.

### 4.1 Free tier - "DayFlow"

Unlimited Moments, unlimited categories and parent categories, full history forever, the
complete queue and reminder engine, every deterministic chart and range including
lifetime, goals, streaks, the productivity score, multi-device sync, full export, and the
installable PWA.

This is a genuinely complete time tracker. A user who never pays is not a failed
conversion; they are a working reference and a source of referrals.

### 4.2 Paid tier - "DayFlow AI"

Indicative pricing, to be validated: **$4 per month or $36 per year.** Roughly ₹349 and
₹2,999 in India, priced regionally rather than converted.

Adds daily, weekly and monthly AI reports; habit and focus-pattern detection; burnout
signals; personalised recommendations; predictive reminders; natural-language search when
it ships; and priority on new insight providers.

The price is set against the honest comparison: a user is asked to pay less than a single
coffee for something they will consult weekly for years. Above roughly $8 per month the
comparison shifts to Toggl and Notion, which have vastly larger feature surfaces, and
DayFlow loses that argument.

### 4.3 Lifetime option

A one-time purchase, offered only to the first cohort of paying users, priced near three
years of subscription. It trades long-term revenue for early validation and for users who
feel like owners rather than renters. Capped at a fixed number of purchases, because
unlimited lifetime deals against an ongoing per-use cost is how small products go
insolvent.

## 5. Cost structure

| Cost           | At 1 user | At 1,000 users | Notes                                                    |
| -------------- | --------- | -------------- | -------------------------------------------------------- |
| Supabase       | $0        | ~$25/month     | Free tier to roughly 500MB and 50k monthly active users. |
| Vercel         | $0        | $0 - $20/month | Hobby suffices until commercial use requires Pro.        |
| Web push       | $0        | $0             | Browser vendor infrastructure is free.                   |
| Domain         | ~$12/year | ~$12/year      | Fixed.                                                   |
| AI model calls | $0        | Variable       | The only cost that scales per user. See below.           |

**AI cost control.** A daily report over pre-computed statistics is a small prompt -
on the order of 1,500 input and 500 output tokens with a mid-tier model, which is
fractions of a cent. Because ADR-011 keeps raw Moments out of the prompt, cost per user
per month stays comfortably inside a $4 subscription. Reports are cached in `ai_reports`
and regenerated only on demand, so a user re-reading last Tuesday's report costs nothing.

Guard rails that must exist before the paid tier launches: a per-user monthly call
ceiling, a global daily spend cap with automatic disable, and per-request token limits.

## 6. Unit economics

At $4/month with an estimated AI cost near $0.30 per active paying user per month, gross
margin is roughly 90%. Payment processing takes 3-5%. The break-even point against fixed
infrastructure is in the region of ten paying users, which is a reassuringly low bar and
means the product does not require scale to be sustainable.

## 7. Architectural implications for 1.0

Even though nothing here ships in 1.0, the following must be true of the initial build so
that monetisation is not a rewrite:

1. AI features sit behind `AI_ENABLED` and an `InsightProvider` registry, so gating them
   per user is a check, not a refactor.
2. A `subscription_tier` column on `profiles` exists from the start, defaulting to
   `free`, so entitlement has somewhere to live.
3. Every AI call records tokens and estimated cost, so pricing is set from measurements
   rather than guesses.
4. `feature_flags` allows a tier-gated feature to be trialled per user.

## 8. Open questions

- Does the AI tier deliver enough perceived value to convert, or is it a feature rather
  than a product? Requires real users to answer.
- Should regional pricing be automatic by IP or self-selected? Automatic detection is
  hostile to travellers.
- Is an annual-only option simpler than offering both cadences at this scale?

---

## Change History

| Version | Date       | Author  | Change         |
| ------- | ---------- | ------- | -------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft. |
