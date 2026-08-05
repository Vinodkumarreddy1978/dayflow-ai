# Who does what to get this live

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| Document ID  | - (root operator document, outside the docs/ suite) |
| Version      | 0.1.0                                               |
| Status       | Draft                                               |
| Owner        | Founder                                             |
| Last updated | 2026-08-05                                          |
| Supersedes   | -                                                   |

---

## 1. Purpose

This document answers one question: of the work left before DayFlow AI is live, which parts
are yours and which parts belong to the assistant. It routes; it does not explain. Every row
below points at a numbered step in [GO-LIVE-STEPS.md](GO-LIVE-STEPS.md), which is where the
actual procedure, the exact commands and the confirmations live. If you find yourself
wondering _how_, you are in the wrong document.

**Secrets, once, prominently.** Never type or paste a secret into a terminal, and never paste
one into a chat. This has already happened twice on this project - the Supabase secret key and
`CRON_SECRET` - and both must now be replaced because of it. PowerShell echoes what you type,
and PSReadLine also writes every line you enter to a plain-text file that survives closing the
window and rebooting. Step 6 has the safe method and the clean-up; steps 9 to 12 have the
rotation. Read those rather than a summary of them.

---

## 2. Only you can do this

These need a browser session on an account the assistant cannot sign into, or a physical
device. Longest-lead items first: start the top of this list today and work on the rest while
it waits.

| What you do                                                               | Step      | Time                              | What it unblocks                                                                                                  |
| ------------------------------------------------------------------------- | --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Set up a custom email sender and add its DNS records                      | 8         | 20-60 min, then hours of DNS wait | Steps 29, 33 and 38. Until this works, nobody outside your Supabase organisation can create an account at all     |
| Rotate the exposed Supabase secret key                                    | 9-12      | 15 min                            | Deploying safely. Do it before the site is public, not after. Step 12 cannot be undone                            |
| Apply migrations `0014` and `0015` in the Supabase SQL editor             | 13-16     | 25 min                            | The daily report job (`0014`) and the whole of step 42 (`0015`). The live project is still on `0013`              |
| Generate a fresh `CRON_SECRET` straight to the clipboard, never displayed | 6         | 5 min                             | Steps 24 and 31. The old one is burned                                                                            |
| Decide the production URL and write it down                               | 3         | 5 min                             | Steps 21, 23, 28 and 30. The same value has to appear in four places, character for character                     |
| Decide whether reminders and push are in scope for this deploy            | 4-5       | 7 min                             | Whether steps 5 and 40, and half of steps 30 to 32, apply to you at all                                           |
| Create the Vercel project, enter the environment variables, deploy        | 20-27     | 40 min plus a 2-5 min build       | Everything in phases 5, 6 and 7. Nothing has been deployed yet, so nothing downstream can be tested or diagnosed  |
| Set the Site URL and redirect allow-list, then turn Confirm email on      | 28-29     | 10 min                            | Sign-up and password reset. Do not turn Confirm email on until step 8 actually delivers mail                      |
| Create the Vault secrets `dayflow_app_url` and `dayflow_cron_secret`      | 30-32     | 13 min                            | Reminders and the daily report. Neither secret exists yet, and a missing one fails silently                       |
| Check row level security, extensions, scheduled jobs, realtime            | 17-19, 48 | 10 min                            | Confidence that no table is readable by the wrong user. Re-run step 17 after every future schema change           |
| Read the first CI run in the repository's Actions tab                     | 7         | 5 min                             | Any repository fix the run turns out to need. The assistant cannot see GitHub                                     |
| Turn on Dependabot alerts                                                 | 46        | 5 min                             | Being told about a vulnerable dependency instead of having to ask                                                 |
| Take the first database dump and set a weekly calendar reminder           | 43        | 15 min, then 5 min a week         | Your only recovery path. Point-in-time recovery is not on the free plan; a dump you took yourself is all you have |

---

## 3. The assistant does this

Everything inside the repository:

- Local verification before anything is pushed - Prettier, ESLint, TypeScript, the Vitest
  suite, `next build` and the bundle budget. This is the local half of step 2.
- Committing and pushing. **This no longer needs you.** The GitHub credential is held by Git
  Credential Manager in Windows Credential Manager, and a read against the private repository
  now succeeds with no sign-in prompt, so the assistant can push without you being present.
- Fixing whatever the first CI run reports - but only once you have pasted the failing job's
  log, because the assistant cannot open the Actions tab.
- Writing new migrations when something needs correcting. The assistant writes the SQL; you are
  the only one who runs it (steps 15 and 16). A database is not rolled back here; a mistake is
  corrected by a new migration.
- Updating the documents after each phase, which is step 47 - the pending-deployment and
  pending-migration statements scattered through `HANDOFF.md` and `README.md` stop being true
  as you work.
- Diagnosing anything you paste back from a browser, from Vercel or from the SQL editor.

**What the assistant cannot do**, so that you are not waiting on it: sign in to GitHub,
Supabase, Vercel, your DNS provider or your email; hold a phone; or see a dashboard. It also
will not run `git config`, `git commit --amend` or a force push, which means the placeholder
commit author on the three commits already pushed is a decision for you (see section 5).

---

## 4. Shared, and how to hand off

These need a real person using the real application, on a real device, against the real
database. The assistant cannot perform any of them and cannot guess at the result.

| You do this                                                     | Step  | The assistant does                                                   |
| --------------------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| Sign up with a real address and click the confirmation link     | 33    | Diagnoses a wrong link target, a redirect loop or a missing email    |
| Check the new account was seeded with categories and a timezone | 34    | Reads `0009` and `0013` and works out which trigger did not fire     |
| Record an activity and close it, then try to open a third       | 35-36 | Checks the rule against the domain function and the database trigger |
| Sign in on a second device and watch a change appear on both    | 37    | Diagnoses realtime, `0012`, and `replica identity full`              |
| Request a password reset and follow the emailed link            | 38    | Diagnoses the redirect allow-list, which is what usually breaks here |
| Visit the guarded routes signed out, in a private window        | 39    | Reads the middleware and works out why a guard did not fire          |
| Enable reminders on a phone and confirm one arrives             | 40    | Diagnoses VAPID keys, subscriptions and the send path                |
| Export your data, then delete a throwaway account               | 42    | Diagnoses the export contents, the cascade, and any error you get    |

**The handoff protocol.** You perform the action; if it does not do what the step says it
should, you paste back the evidence and the assistant works out why. "It didn't work" cannot be
diagnosed. A status code and one console line usually can. Paste back:

1. **What you did and where** - the exact URL, which device, and whether you were signed in.
2. **The message on screen**, copied word for word rather than summarised.
3. **The browser console.** Press F12, open the **Console** tab, and copy the red lines
   including the indented `at ...` lines underneath them.
4. **The failing network request.** F12, the **Network** tab, click the request that went red,
   and copy its path, its status code - 401, 404, 500 - and its response body.
5. **Vercel's own view.** Vercel, your project, **Logs**. Find the same minute and copy the
   lines for that request. Some failures appear only here and nowhere in the browser, for
   example `Invalid server environment configuration: CRON_SECRET`.
6. **For SQL** - the query you ran and the exact error text or row count it returned.

Screenshots are acceptable but text is better, because text can be searched against the code.
Before pasting anything, remove keys, any `Authorization: Bearer ...` header and any session
cookie. That is the mistake that caused two rotations already.

---

## 5. Blocked on each other

- **Data export and account deletion cannot be verified by anyone until you apply `0015` in
  step 16.** This is the clearest case. Both features are built and unit-tested, but no export
  has ever run against a real project and `delete_account()` has never been called against a
  real row. Until `0015` is applied the delete button refuses with a message saying the database
  change is missing - which is the code behaving correctly, not a fault.
- **The daily report job needs three things only you can do**: `0014` (step 15), `CRON_SECRET`
  in Vercel (step 24) and both Vault secrets (steps 30 and 31). Step 32 is what proves it.
- **Nothing in phases 5, 6 or 7 can be diagnosed before step 26**, because nothing is deployed.
  There are no logs to read yet.
- **Sign-up verification waits on step 8 and step 29.** With confirmation on and no working
  sender, sign-up appears to succeed and the mail never arrives, and nothing errors anywhere.
- **CI is genuinely unknown.** The first run in the project's history is in progress and no run
  has ever completed, so there is no basis for expecting it to pass - it runs on clean Ubuntu
  with `npm ci` and placeholder variables, and the `migrations` job has never been exercised at
  all. The assistant cannot fix what it cannot see, and you cannot get a green run until it
  fixes what the log says. You read the log, it fixes, it pushes, you read the next log.
- **The document corrections in step 47 wait on you**, phase by phase, because they record what
  you actually did.

---

## 6. Right now, do this next

1. **Start step 8, the custom email sender.** Do this before anything else today. It is the
   only item whose waiting time you cannot shorten, and steps 29, 33 and 38 all sit behind it.
2. **Open the repository's Actions tab and read the first CI run.** It is already running, it
   has never completed before, and it is free information. Paste any failing job's log back.
3. **Rotate the Supabase secret key, steps 9 to 12.** Fifteen minutes, and it has to happen
   before the site is public rather than afterwards.
4. **Generate a fresh `CRON_SECRET` (step 6), then apply `0014` and `0015` (steps 13 to 16).**
   These three unblock more of the later verification than anything else on the list.

---

## Change History

| Version | Date       | Author | Change                                                                                                                                                                                                                                                       |
| ------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0   | 2026-08-05 | Agent  | Initial draft. Routes the remaining work in `GO-LIVE-STEPS.md` into operator-only, assistant-only and shared, with a handoff protocol for the shared verification. Records that every step in that document is still marked `Who: operator`, which is stale. |
