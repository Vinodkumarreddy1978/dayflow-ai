# 35 - Privacy and Data Protection

| Field        | Value      |
| ------------ | ---------- |
| Document ID  | DF-DOC-035 |
| Version      | 0.4.0      |
| Status       | Draft      |
| Owner        | Founder    |
| Last updated | 2026-08-04 |

---

## 1. Purpose

What data DayFlow AI holds, why, for how long, who else sees it, and what rights the user
has over it. This document is the source for the public privacy policy and is deliberately
written so that it could be published almost unchanged.

## 2. Position

Charter principle 1: **the user owns their data.** In practice that means three commitments
that constrain the product permanently:

1. Data is never sold, rented or brokered, to anyone, at any price.
2. Data is never used to train a model.
3. Data is exportable in full, in an open format, at any time, and deletion is real.

The third is what makes the first two credible. A user who can leave completely at any
moment does not have to take the other promises on trust.

## 3. Data collected

### 3.1 Provided by the user

| Data           | Purpose                          | Required |
| -------------- | -------------------------------- | -------- |
| Email address  | Account identity, authentication | yes      |
| Password       | Authentication                   | yes      |
| Display name   | Interface personalisation        | no       |
| Moments        | The product's entire function    | yes      |
| Category names | Organising Moments               | yes      |
| Moment notes   | Optional context                 | no       |
| Goals          | Progress tracking                | no       |
| Settings       | Personalisation                  | defaults |

### 3.2 Generated automatically

| Data               | Purpose                                 | Retention             |
| ------------------ | --------------------------------------- | --------------------- |
| Account timestamps | Account management                      | Lifetime              |
| Push subscriptions | Delivering reminders                    | Until revoked or dead |
| Device user agent  | Letting the user identify their devices | With the subscription |
| AI usage records   | Cost control and quota                  | 12 months             |
| Server logs        | Debugging and security                  | 30 days               |

### 3.3 Not collected

Stated because absence is a feature: no location, no contacts, no calendar, no device
identifiers, no advertising identifiers, no behavioural tracking, no third-party analytics
SDK, no session recording, no fingerprinting, no cross-site tracking, and no cookies beyond
those strictly required for authentication.

There is no analytics SDK in the client at all. Product metrics are computed by SQL over the
database, per section 5 of [10 - KPI Framework](../01-business/10-kpi-framework.md). Shipping
a third-party tracker inside a privacy-positioned product would be self-contradictory.

## 4. Purposes of processing

| Purpose                       | Lawful basis         | Data used                        |
| ----------------------------- | -------------------- | -------------------------------- |
| Providing the service         | Contract             | Moments, categories, settings    |
| Authentication                | Contract             | Email, password hash             |
| Reminders                     | Contract             | Moments, subscriptions, settings |
| Analytics shown to the user   | Contract             | Moments                          |
| AI insights                   | **Explicit consent** | Aggregated facts only            |
| Security and abuse prevention | Legitimate interest  | Logs                             |
| Product metrics               | Legitimate interest  | Aggregated counts only           |

AI processing is the only purpose requiring separate consent, because it is the only one
that involves a third party.

## 5. Third parties

| Processor     | Purpose               | Data                              | Location                      |
| ------------- | --------------------- | --------------------------------- | ----------------------------- |
| Supabase      | Database, auth, sync  | All user data                     | Chosen project region         |
| Vercel        | Hosting               | Requests, logs                    | Global edge                   |
| AI provider   | Insight generation    | Aggregated facts, on consent only | Provider region               |
| Push services | Notification delivery | Encrypted payloads                | Browser vendor infrastructure |

| ID         | Requirement                                                                |
| ---------- | -------------------------------------------------------------------------- |
| DF-PRV-001 | Every processor MUST be listed publicly with its purpose.                  |
| DF-PRV-002 | An AI provider MUST contractually guarantee no training on submitted data. |
| DF-PRV-003 | Adding a processor MUST update this document before the integration ships. |
| DF-PRV-004 | No processor MUST receive more data than its function requires.            |

Push payloads are end-to-end encrypted with the subscription's own keys, so the browser
vendor's push service relays content it cannot read.

## 6. What the AI receives

Precision matters here, because it is the one place data leaves the system.

**Sent:** period boundaries, total minutes, per-category and per-parent-category minutes and
shares, per-day and per-hour totals, comparison figures, goal targets and achievements,
counts of auto-closed Moments, and **category names**.

**Not sent:** individual Moments, start and end times of specific Moments, Moment notes,
email address, display name, any account identifier, or anything from any other user.

Category names are sent because "category 7 rose 40%" is useless, and this is disclosed
plainly in the consent text rather than buried. A user who considers their category names
sensitive can decline AI entirely and keep a fully functional product.

| ID         | Requirement                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| DF-PRV-010 | AI processing MUST require explicit, separate, opt-in consent.                |
| DF-PRV-011 | The consent screen MUST list what is sent and what is not, in plain language. |
| DF-PRV-012 | Consent MUST be withdrawable at any time, taking effect immediately.          |
| DF-PRV-013 | Withdrawing consent MUST NOT delete existing reports unless the user asks.    |
| DF-PRV-014 | Moment notes MUST NOT be sent to any model in 1.0.                            |

## 7. User rights

Provided to every user regardless of jurisdiction, because building two tiers of privacy
would be both more work and indefensible.

| Right         | How it is exercised                               | Timescale |
| ------------- | ------------------------------------------------- | --------- |
| Access        | Export from Settings                              | Immediate |
| Portability   | Export as CSV or JSON                             | Immediate |
| Rectification | Edit any Moment, category or setting              | Immediate |
| Erasure       | Delete an individual Moment, or the whole account | Immediate |
| Restriction   | Withdraw AI consent; disable notifications        | Immediate |
| Objection     | Delete the account                                | Immediate |

Every right is exercised through the interface. There is no support queue, no form and no
waiting period, which is both better for the user and less work to operate.

| ID         | Requirement                                                                        |
| ---------- | ---------------------------------------------------------------------------------- |
| DF-PRV-020 | Export MUST include every piece of user data in an open, documented format.        |
| DF-PRV-021 | Account deletion MUST remove every row across every table, including auth records. |
| DF-PRV-022 | Deletion MUST be irreversible and MUST say so before confirmation.                 |
| DF-PRV-023 | Deletion MUST offer an export first, per DF-SET-025.                               |
| DF-PRV-024 | No right MUST require contacting support.                                          |

### 7.1 Implementation status

**What a user can do today.** Every right in the table above is now exercised from Settings.
Rectification, restriction and per-Moment erasure always were. Access and portability are the
export described below, and objection and account-wide erasure are the delete-account control
beside it.

One qualification, which is why this section still exists: the deletion control cannot
succeed until migration `0015` has been applied to the project it is running against, and it
has not been applied to the live project yet. Deleting an account there fails today. The
interface says so and states that nothing was deleted, rather than reporting a success it
cannot substantiate.

**The export.** DF-PRV-020, DF-SET-022.

| Piece                                              | Where                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| Table manifest, paging, JSON and CSV serialisation | `src/features/settings/account-export.ts`                             |
| The table names the interface offers               | `src/features/settings/account-export-tables.ts`                      |
| The route that streams it                          | `src/app/api/export/route.ts`                                         |
| The controls and the download                      | `src/features/settings/data-export-card.tsx`, `use-account-export.ts` |

`GET /api/export?format=json` answers with one document holding every row of all ten tables
that carry user data - `profiles`, `settings`, `parent_categories`, `categories`, `moments`,
`goals`, `ai_reports`, `ai_usage`, `push_subscriptions` and `feature_flags` - together with
the identifier, email address, creation date, confirmation date and last sign-in date held on
the `auth.users` record. `format=csv&table=<name>` answers with one of those tables as CSV.

CSV is per table rather than per account because a CSV file has one header row and these ten
tables have ten different shapes. The alternative is a zip archive, which means a new
dependency for a format DF-SET-022 does not ask for.

Three properties matter more than the format, and are what make the export trustworthy rather
than merely present:

- **It holds no elevated privilege.** The route uses the ordinary cookie-scoped server client,
  so row level security applies to it exactly as it does to the browser. The service role key
  is not involved, and its confinement to `src/app/api/cron/` stands. ADR-015.
- **Every read also filters on the owning column.** That is not redundant. `feature_flags_select`
  in [`0007_rls_policies.sql`](../../supabase/migrations/0007_rls_policies.sql) deliberately
  also exposes global rows with a null `user_id`, which are not the user's data and must not
  appear in their export.
- **Every column is included, and the compiler checks it.** A column added to a table and not
  to the manifest fails the build rather than producing a quietly incomplete export.

**Deletion.** DF-PRV-021, DF-PRV-022, DF-PRV-023, DF-SET-023, DF-SET-024, DF-SET-025.

| Piece                                         | Where                                           |
| --------------------------------------------- | ----------------------------------------------- |
| The destruction itself                        | `public.delete_account()`, migration `0015`     |
| Typed confirmation and failure interpretation | `src/features/settings/delete-account.ts`       |
| The dialog                                    | `src/features/settings/delete-account-card.tsx` |
| The call, the sign-out and the redirect       | `src/features/settings/use-delete-account.ts`   |

The dialog states what is destroyed item by item, requires the phrase `delete my account` to
be typed before the control will act, and offers the export in the same dialog per DF-PRV-023.
The typed phrase is checked again inside the call, so the disabled button is a convenience
rather than the guarantee.

On success the session is discarded locally, the cached data is dropped and the browser is
sent to the landing page with a document load. `delete_account()` removes the `auth.users` row
but the access token already issued stays valid until it expires (ADR-014), so a session left
in place would keep rendering an application belonging to an account that no longer exists.

The design question this section previously recorded is settled: the choice between the
service role key and a `security definer` function is decided in favour of the function, with
the reasoning and the rejected alternatives in
[04 - Decision Log](../00-governance/04-decision-log.md) ADR-014. That ADR also records the
confinement of the service role key to `src/app/api/cron/` as an architectural boundary rather
than a lint preference.

**What is verified, and what is not.** 36 unit tests in
`src/features/settings/account-export.test.ts` and
`src/features/settings/delete-account.test.ts` cover the scope of the export, its behaviour on
an account holding nothing, its paging, its refusal to emit a plausible-looking file after a
failed read, the confirmation gate, and each way the deletion call can fail. They exercise the
code against a client that behaves as the database does; **neither feature has been run against
a live Supabase project**, because `0015` is not applied there and this repository holds no
session. The first real deletion will be the first end-to-end test of one.

**Deliberately not built.** Import of a previously exported file (DF-SET-032) is untouched -
the JSON envelope carries a `dayflow_export_version` so that an importer has something stable
to read, and nothing more. There is no single archive containing every table as CSV, for the
reason given above.

The CLI dump in section 4.1 of [GO-LIVE.md](../../GO-LIVE.md) remains the operator's backup of
the whole project. It is not a substitute for this export and never satisfied DF-PRV-024; the
two answer different questions.

## 8. Retention

| Data                        | Retained                                  |
| --------------------------- | ----------------------------------------- |
| Moments                     | Indefinitely, until the user deletes them |
| Categories, goals, settings | For the life of the account               |
| AI reports                  | Until deleted by the user                 |
| Push subscriptions          | Until revoked or reported dead            |
| AI usage records            | 12 months                                 |
| Server logs                 | 30 days                                   |
| Backups                     | 7 days of point-in-time recovery          |
| Deleted account             | Purged from backups within 7 days         |

Moments are kept indefinitely because the product's value grows with history, and expiring
data would destroy exactly what the user came for. Deletion remains entirely the user's
decision.

## 9. Children

Not directed at children under 16. No account is knowingly created for one; any such account
found is deleted.

## 10. Transparency

| ID         | Requirement                                                             |
| ---------- | ----------------------------------------------------------------------- |
| DF-PRV-030 | A privacy policy derived from this document MUST be publicly available. |
| DF-PRV-031 | Material changes MUST be notified in-product before taking effect.      |
| DF-PRV-032 | The processor list MUST be public and current.                          |
| DF-PRV-033 | The policy MUST be readable without a law degree.                       |

## 11. Breach procedure

Contain, assess scope, notify affected users within 72 hours with plain facts about what was
exposed and what to do, notify any applicable regulator, remediate, and document.

---

## Change History

| Version | Date       | Author  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-08-04 | Founder | Initial draft.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0.2.0   | 2026-08-04 | Founder | Added section 7.1 recording that export and account deletion are specified but not yet implemented.                                                                                                                                                                                                                                                                                                                                                     |
| 0.3.0   | 2026-08-04 | Founder | Rewrote section 7.1: the deletion design question is settled by ADR-014 and `public.delete_account()` exists; the export and the confirmation interface remain outstanding.                                                                                                                                                                                                                                                                             |
| 0.4.0   | 2026-08-04 | Founder | Rewrote section 7.1 again: the export and the deletion interface are built, so the section now records what exists, by file, the exact scope of the export, what is verified against tests rather than against a live project, and the one thing still outstanding - applying `0015`. Minor rather than major because the section records implementation status and no approved requirement changed; the same reasoning was applied at 0.2.0 and 0.3.0. |
