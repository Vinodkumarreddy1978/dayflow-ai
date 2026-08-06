# Product Ideas - Motivation, a Bot, Retention, Device Data, Installation

| Field        | Value       |
| ------------ | ----------- |
| Document ID  | DF-PROP-001 |
| Version      | 0.1.0       |
| Status       | Draft       |
| Owner        | Founder     |
| Last updated | 2026-08-06  |
| Supersedes   | -           |

This is a proposal, not a specification. It carries no number in the 01-37 suite and
nothing in it is agreed. Where it recommends building something, the requirement is
written into the numbered suite first, per
[01 - Documentation Index and Standards](00-governance/01-documentation-index-and-standards.md)
section 2.

---

## 1. Purpose

Five questions were asked: how the AI should motivate a user toward their goals, whether
to add a bot, what would make the product worth returning to, whether a mobile install can
read the phone's own Digital Wellbeing data, and how to install the app. This document
answers each, leading with the answer.

## 2. How to read the change sizes

Every proposal is tagged. The tags mean specific things and they are the most important
part of this document, because they are what tells you what you are agreeing to.

| Tag        | Meaning                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| **Today**  | The product already does this. No work.                                                                        |
| **Small**  | One or two files, no database change, no new dependency. An evening.                                           |
| **Medium** | A new SQL migration or a new screen region. A weekend, plus a specification update before the code.            |
| **Large**  | A new codebase, a new platform, or a change that contradicts something already decided. Weeks, and a decision. |

---

## 3. Sample AI insights that move a user toward a goal

### 3.1 The answer first

The product's insight layer is already built the right way round: figures come from SQL,
findings come from pure TypeScript over those figures, and the model only chooses words
(`src/lib/ai/insights.ts`, ADR-011). Nothing below asks you to change that. What is
missing is not intelligence. It is **three facts the model is never given**, and **one
insight module that costs nothing to add**.

The facts function `get_period_facts` (migration `0010`) returns, in full: period bounds,
totals, minutes and Moment counts per parent category and per category, minutes and
distracted minutes per day, the previous period's total minutes, and a count of
auto-closed Moments. That is all. It does **not** return hour of day, day of week as a
grouping, goal progress, per-day productivity score, or the previous period broken down in
any way.

That matters because of something you should know before reading the examples: the kind of
sentence you described as the target - "your distracted time clusters between 2pm and 4pm
on weekdays" - is **half buildable today and half not**. The weekday half is free. The
hour-of-day half is not, because hours are nowhere in the facts. Section 3.8 lists exactly
what to add and what each addition unlocks.

There is also a discrepancy worth knowing: section 3 of
[29 - AI Architecture and Prompt Contracts](04-architecture/29-ai-architecture-and-prompt-contracts.md)
specifies a `PeriodFacts` containing `byHour`, `goals`, `share`, `changeByParent` and a
per-day `score`. **None of those exist in the shipped code.** The document and the
implementation disagree, which by the suite's own rule (document 01, section 2) is a
defect in one of them. The extensions in section 3.8 are, in effect, the code catching up
with a contract that was already written.

### 3.2 What separates a useful insight from a flattering one

Four tests. An insight that fails any of them should not be generated.

1. **Could the user reproduce the number from a screen in the app?** If not, they cannot
   check it, and an unverifiable claim about their own life is worse than silence. This is
   DF-AI-032 and it is already enforced by the `evidence` array.
2. **Does it name a behaviour, a time, or a quantity they could change tomorrow?** "Your
   distraction is high" names nothing. "Email arrived in 34 separate entries averaging 18
   minutes" names something.
3. **Does it survive the alternative explanation?** Recorded time going up can mean the
   week changed or the tracking changed. An insight that does not distinguish the two is
   misleading even when the arithmetic is right. The existing `trend` module already says
   this out loud, which is the correct instinct.
4. **Would it read as praise or blame if said by a person?** If yes, rewrite it. DF-AI-004
   and section 2 of
   [14 - PRD Goals, Streaks and Productivity Score](02-product/14-prd-goals-streaks-and-productivity-score.md)
   both forbid it, and it is also simply less useful: praise carries no instruction.

### 3.3 A first-week user with almost no data

**The data.** Weekly report, 1-7 August. `daysWithData` 3 of 7. `recordedMinutes` 410,
`distractedMinutes` 80, `momentCount` 6, `averageMinutesPerDay` 137. By parent category:
Work 240 minutes over 3 Moments, Learning 90 over 1, Distracted Time 80 over 2. By
category: Office 240, Reading 90, Social Media 80. `previousPeriodMinutes` 0.
`autoClosedCount` 1.

---

**Example 1 - the summary. Tier: Today.**

> You recorded 6h 50m across 3 days, in 6 entries. Most of it went to Work (4h), Learning
> (1h 30m), Distracted Time (1h 20m). Only 3 of 7 days have records, so everything above
> describes those three days and nothing else - the other four are unknown, not empty. One
> of your six entries was closed automatically at the six-hour mark, which means its length
> is an estimate the system made, not something you measured.

Derived from `totals.recordedMinutes`, `totals.daysWithData`, `period.days`,
`byParentCategory`, `quality.autoClosedCount`. Every figure is on the analytics screen.
Note what it does not do: it does not congratulate, and it does not pretend three days is a
pattern.

---

**Example 2 - the one action worth taking in week one. Tier: Today.**

> One entry in six is an estimate rather than a measurement - 17% of this week. Correcting
> the ones you remember is the highest-value minute you can spend in the app right now,
> because every chart you look at next month is built on this month's entries.

Derived from `quality.autoClosedCount` (1) and `totals.momentCount` (6). This is close to
what `dataQuality` in `src/lib/ai/insights.ts` already produces. The improvement is naming
the payoff rather than the problem.

---

**Example 3 - what the product should refuse to generate.**

Not acceptable:

> Great start! You've logged 6 activities in your first week. Keep the momentum going and
> you'll be a tracking pro in no time.

It fails all four tests: nothing verifiable, nothing to do, no alternative explanation
considered, and it is pure praise. The correct output when the data is thin is **less
text**, which the system prompt in `src/lib/ai/provider.ts` already instructs ("If the
findings are thin, say less").

---

**Example 4 - the one thing a first-week user should be told about goals. Tier: Small.**

> You have not set a goal yet, and this is not the week to set one. After 3 recorded days,
> any target would be a guess about a person the app has not met. Two more weeks of
> recording gives you a real median to aim above or below - and a goal set against your own
> median is one you will actually hit.

Derived from `totals.daysWithData` and the absence of any active goal. Currently the
product has no insight module that knows whether goals exist; this needs the `goals` array
from section 3.8. It matters because the alternative - a new user setting "at least 3h of
Learning a day" on day two - is the single most reliable way to manufacture a month of
failure. See example 14.

### 3.4 A user with a month of data, trending well

**The data.** Monthly report, July. `days` 31, `daysWithData` 28. `recordedMinutes`
12,480, `distractedMinutes` 1,240, `momentCount` 238, `averageMinutesPerDay` 446. By parent
category: Work 6,150 over 110 Moments, Personal 2,010 over 38, Health 1,530 over 31,
Learning 1,320 over 24, Distracted Time 1,240 over 26, Entertainment 230 over 9. By
category, among others: Office 4,020 over 48, Meetings 1,530 over 28, Email 600 over 34,
Gym 900 over 12, Walking 630 over 19, Practice 720 over 11, Social Media 880 over 21.
`previousPeriodMinutes` 10,760. `autoClosedCount` 9.

---

**Example 5 - fragmentation, which no chart can show. Tier: Today.**

> Email came in 34 separate entries averaging 18 minutes each - 10 hours in total. That is
> the same 10 hours a pie chart would show as one wedge, and it is not the same experience
> as 10 hours in five sittings. If any of those 34 were interruptions to something else,
> the cost of them is larger than the 18 minutes each.

Derived from `byCategory` where name is Email: `minutes` 600, `momentCount` 34, average
computed as 600 / 34. This already fires from the `fragmentation` module. It is the best
insight the product currently produces, because it is genuinely invisible elsewhere in the
app.

Paired recommendation, per DF-AI-041:

> Try one protected 45-minute block for email tomorrow and record it as a single Moment.
> Next month's report will show whether 34 became 20.

---

**Example 6 - a rise that might not be a rise. Tier: Today.**

> You recorded 16% more than in June - 208h against 179h. That can mean your time changed
> or only that your tracking did. This month has 28 recorded days against June's 24, which
> accounts for most of it: your average recorded day is 7h 26m, against June's 7h 28m.
> Almost nothing about your days changed. Your recording did.

Derived from `totals.recordedMinutes`, `comparison.previousPeriodMinutes`,
`totals.daysWithData` and `totals.averageMinutesPerDay`. The second half - resolving the
ambiguity rather than merely naming it - needs the previous period's `daysWithData`, which
is one line in `get_period_facts`. Tier: Small. It converts the product's most honest
insight from a caveat into an answer.

---

**Example 7 - a habit that is real, stated so the user knows what to protect. Tier: Small.**

> Gym happened 12 times in 31 days, averaging 1h 15m. Ten of the twelve were on Monday,
> Wednesday or Friday. The pattern is not "you go to the gym"; it is "you go on three
> specific days", and the two you missed were both weeks when Work exceeded 9 hours on the
> Wednesday.

Derived from `byCategory` (Gym: 900 minutes, 12 Moments) plus a day-of-week grouping.
Day of week is **free**: `byDay` already carries an ISO date string, so
`new Date(date).getUTCDay()` gives the weekday with no SQL change at all. The second
sentence - which category was heavy on the missed day - needs per-day-per-category minutes,
which is a real SQL addition. Tier for the first sentence: Small. For the second: Medium.

---

### 3.5 A user trending badly

**The data.** Weekly report, 20-26 July. `days` 7, `daysWithData` 7. `recordedMinutes`
4,290, `distractedMinutes` 1,105, `momentCount` 63. By parent category: Work 2,460 over 28,
Distracted Time 1,105 over 24, Personal 380 over 6, Entertainment 165 over 2, Health 120
over 2, Learning 60 over 1. By day, as recorded minutes / distracted minutes: Mon 685/215,
Tue 700/230, Wed 640/190, Thu 660/205, Fri 620/180, Sat 495/45, Sun 490/40.
`previousPeriodMinutes` 3,510. `autoClosedCount` 11.

---

**Example 8 - the weekday split, and the closest thing to your target sentence that is buildable now. Tier: Small.**

> Distraction was 26% of your recorded time this week, but it was not spread evenly. On
> Monday to Friday it averaged 3h 24m a day. On Saturday and Sunday it averaged 43 minutes.
> Those are the same two days you recorded roughly three hours less overall. Whatever is
> happening, it is a weekday phenomenon, not a general one.

Derived entirely from `byDay` - `minutes` and `distractedMinutes` per date, with the
weekday taken from the date string. **No SQL change, no new data, one new file in
`src/lib/ai/insights.ts`.** This is the single highest-value insight available to you today
and it does not currently exist.

Paired recommendation:

> Your weekend behaviour is the control group for your weekday behaviour. Rather than
> resolving to be less distracted, look at what is different about a Saturday and see
> whether one piece of it is portable to a Tuesday.

---

**Example 9 - five heavy days, framed as a question. Tier: Today.**

> Ten hours or more recorded on 5 consecutive days, Monday to Friday. If that was a
> deadline, fine. If it is becoming normal, it is worth noticing now rather than later. The
> week also contains 2 hours of Health across 2 entries, against 41 hours of Work.

Derived from `byDay` (the `sustainedLoad` module) and `byParentCategory`. The first two
sentences fire today. The third - putting Health next to Work - needs one comparison the
module does not currently make. Tier: Small.

The wording deliberately stops short of a claim about burnout. DF-AI-005 forbids clinical
advice and the boundary is the difference between "you recorded 41 hours of Work and 2 of
Health" (observation) and "you are heading for burnout" (diagnosis).

---

**Example 10 - the report is partly fiction, and says so first. Tier: Today.**

> 11 of this week's 63 entries were closed automatically - 17%. Those 11 are recorded at
> the six-hour ceiling rather than at the length they actually ran, which means this week's
> Work total is an upper bound, not a measurement. Everything else in this report inherits
> that. Correcting the ones you remember is worth more than reading the rest of it.

Derived from `quality.autoClosedCount` (11) and `totals.momentCount` (63). Fires today and
is deliberately placed first in the provider array, which is correct: it qualifies
everything after it.

---

**Example 11 - the flattering version, for contrast.**

Not acceptable:

> Busy week! You clocked 71 hours - your highest yet. Distraction crept up a little, but
> nothing to worry about.

Three failures in two sentences. "Your highest yet" is a comparison the facts do not
support (only the immediately previous period is available). "Nothing to worry about" is a
judgement the product is not entitled to make. And a 71-hour week presented as an
achievement is exactly the framing DF-AI-004 exists to prevent.

### 3.6 A user who has stopped

**The data.** Last Moment recorded 18 July. It is now 6 August. Nineteen consecutive days
with `minutes` 0.

**What happens today:** nothing. `src/app/api/cron/daily-report/route.ts` skips any period
with `recordedMinutes === 0`, so no report is generated and no notification is sent. That
is the right call for a weekday-only tracker, and it also means the product currently has
**no return path at all** for someone who lapses.

---

**Example 12 - a return surface, not a report. Tier: Medium.**

Shown on the dashboard on first sign-in after a gap of seven days or more:

> Your last record was 18 July. Before that you recorded on 24 of 30 days, and the thing
> you learned from it was that Email arrived in 34 pieces a month. That data is all still
> here and nothing has been lost.
>
> Start again with one Moment for something you finished today. Not the gap - the gap is
> gone and it does not need filling.

Derived from the most recent Moment date and the prior period's facts. Requires a new
dashboard region and a query for last-recorded-date. Tier: Medium.

The last line matters more than it looks. The instinct of every tracker is to invite the
user to backfill, and backfilling nineteen days from memory produces fiction - which
charter principle 2 ranks above completeness.

---

**Example 13 - the version that would lose the user permanently.**

Not acceptable:

> You've missed 19 days. Your 24-day Gym streak is gone. Don't let all that progress go to
> waste - log something today to start rebuilding.

Loss framing, guilt, and a call to action built on regret. It violates DF-GOA-041 ("a
broken streak MUST be reported factually... no admonishment"), rule 1 of document 14
section 2, and the tone rule in section 4 of
[09 - Go to Market Plan](01-business/09-go-to-market-plan.md). It is also the most likely
version to be written by accident, because it is what every other app does.

There is a live defect that makes this worse, described in section 5.3: for an **at-most**
goal, the streak counter is currently **increasing** while the user is away, because a day
with no records counts as a day under the limit. A returning user could be shown a
"31-day streak" for a month in which they did nothing at all.

### 3.7 A user whose goal is unrealistic

Goals are not in `PeriodFacts`. Every example here needs the extension in section 3.8.

**The data.** Active goal: at least 180 minutes of Learning, daily. Over the last 30 days,
met on 4. Learning minutes per day: median 35, 75th percentile 70, best day 195, monthly
total 1,320.

---

**Example 14 - an at-least goal set too high. Tier: Medium.**

> You have met "at least 3h of Learning a day" on 4 of the last 30 days. On a median day
> you record 35 minutes. A target you miss 26 times in 30 stops carrying information -
> it says the same thing every day regardless of what you did.
>
> Your best quarter of days are 1h 10m or more. A target of 1 hour would have been met on 9
> of the last 30 days and would be reachable on an ordinary evening rather than only on an
> exceptional one. Your 3-hour days would still be 3-hour days; they would just also be
> surpluses rather than the only days that count.

Derived from per-day minutes for the goal's target category, the goal's `target_minutes`
and `direction`, and a count of days met. The percentile is arithmetic on data the database
already has - `get_goal_achieved` computes exactly this per day and `get_streak` already
calls it in a loop.

Note what the AI does **not** do here: it does not change the goal. DF-AI-002 forbids it.
It states a number and the user decides, which is charter principle 5.

---

**Example 15 - an at-most goal set too low. Tier: Medium.**

> "Keep Social Media under 15m a day" was met on 4 of the last 30 days. Your median is 41
> minutes and your quietest ten days are under 22. A limit of 25 minutes would have been met
> on 11 of the last 30 - still a reduction on your median, and one that produces a signal
> rather than a constant.
>
> The 15-minute target is not wrong. It is just measuring an ambition rather than a
> behaviour, and a target that is never met cannot tell you which days were different.

Same derivation as example 14, with `direction` reversed.

---

**Example 16 - a long-horizon goal, which the product cannot express at all. Tier: Large.**

> You are 47 hours into 200 hours of Practice. At your last 8 weeks' pace - 2h 10m a week -
> you reach 200 hours in August 2027. To reach it by 31 December you would need 4h 50m a
> week, which is more than double your best week so far (3h 15m).
>
> Two honest options: move the date, or move the target. There is no version of this where
> the pace arrives on its own.

This is the "specifically what they need to do" the request asked for, and it is the one
example here that the product **cannot** produce in any form today. The goals table has
`period` of daily, weekly or monthly and `target_minutes`; there is no cumulative target,
no deadline, and no lifetime accumulation against one. Adding it is a schema change, a new
goal type, new UI, and new streak semantics.

**Recommendation: do not build this yet.** It is the most emotionally compelling example in
this document and the most expensive. Build the `goals` array in the facts first (Small),
get examples 14 and 15 working, and see whether the user actually wants a project tracker or
just wants their existing goals to be honest with them.

### 3.8 What to add to `get_period_facts`, and what each unlocks

In value-per-effort order.

| Addition                                             | Size   | Unlocks                                             |
| ---------------------------------------------------- | ------ | --------------------------------------------------- |
| Nothing - weekday grouping from the existing `byDay` | Small  | Example 8, half of example 7. **No SQL change.**    |
| `comparison.previousDaysWithData`                    | Small  | Example 6's second half. One line.                  |
| `goals[]` - target, achieved, met, direction, period | Medium | Examples 4, 14, 15. Calls existing SQL functions.   |
| `byHour[]` - minutes and distracted minutes by hour  | Medium | "Distraction clusters between 2pm and 4pm."         |
| Per-day, per-parent-category minutes                 | Medium | Example 7's second half; genuine cross-correlation. |
| Cumulative goals with a deadline                     | Large  | Example 16. New schema, new UI, new semantics.      |

Every one of these is a change to one SQL function, the Zod schema in
`src/lib/ai/facts.ts`, and one new pure function per insight. None of them touches the
model, the prompt contract, or the "AI assists, never controls" boundary - because the
findings are still arithmetic and the model is still only choosing words.

### 3.9 Two defects found while reading the insight layer

- **The `neglected` provider can never fire.** It looks for parent categories with
  `minutes === 0`, but `get_time_by_category` ends with `having sum(s.minutes) > 0`, so
  zero-minute groups are never returned. The module is dead code. Fix: emit the group list
  separately, or drop the module. Tier: Small.
- **`quality.autoClosedCount` cannot be acted on.** The insight tells the user that some
  entries are estimates but cannot say which ones, because no identifying information
  reaches the report. A link to a filtered search - the search screen already filters by
  status - would turn an observation into a task. Tier: Small.

---

## 4. The bot

### 4.1 The answer first

**Do not build a chat window.** A conversational interface fights three of this product's
load-bearing decisions, and the things a user would actually want from a bot are better
served by two cheaper mechanisms that are mostly already built. If a bot is built anyway,
section 4.4 specifies the only version that does not break the product.

Cost is not the reason. A weekly report on `gpt-4o-mini` at roughly 1,500 input and 500
output tokens costs about $0.0005; a year of reports for one user is around three cents.
Chat turns are similarly cheap individually. The problem is not the bill.

### 4.2 Why a chat window fights this product

**It is slower than what exists.** Capture has a target of under 10 seconds from tap to
saved (DF-MOM-009), and the fastest possible path is specified as a one-tap category chip.
Typing "log 45 minutes of gym starting at 6" is slower than tapping Gym, and it is slower
every single time. A chat interface would be the slowest capture path in a product whose
entire premise is that capture must be nearly free.

**The first thing a user will ask it to do is forbidden.** "Log two hours of deep work"
requires the AI to create a Moment. DF-AI-001 prohibits this without qualification, and it
is charter principle 3. A bot that must answer "I can't do that" to the most natural
request made of it is a disappointment engine. The workaround - the bot drafts and the user
confirms - is defensible, but then it is a form with extra steps.

**The second thing they will ask is arithmetic.** "How much did I read in March?"
DF-AI-003 forbids the model computing any statistic, and for a good reason: the user is
using this product precisely because they cannot check the answer themselves. Every
question would have to be routed to a SQL function, which means the honest version of this
bot is a natural-language front end over a fixed set of queries - not a conversation.

**Structural detail.** `/insights` was already at 217 kB against a 200 kB First Load JS
budget and was brought under only by removing a runtime Zod import (decision log, ADR
notes). A chat UI with streaming and message state is not a small addition to that route.

### 4.3 What to build instead

**Mechanism 1 - finish the notification actions. Tier: Small. Mostly built.**

`public/sw.js` already renders notification actions and deep-links "Close it now" to
`/dashboard?close=<id>`, and `src/app/api/cron/reminders/route.ts` already sends that
action for a single overdue Moment. What is missing is the same treatment for the multiple-
Moment case and for the six-hour auto-close notice. This is the conversational surface a
low-friction tracker actually wants: the product speaks, the user answers with one tap,
nobody types.

**Mechanism 2 - "Ask your data", with no model at all. Tier: Medium.**

A panel on `/insights` offering a fixed list of questions, each mapped to an existing SQL
function:

- How much time did I spend on ... last month?
- Which days had the most Distracted Time?
- What is my longest streak on ... ?
- How does this month compare to last?
- Which of my categories have I not recorded in 30 days?

Answers are rendered from the query result. Zero tokens, instant, always correct, works
with `AI_ENABLED=false`. This is, honestly, 90% of what anyone would ask a bot about their
own time tracker, and it is a better product than the bot because the answers are exact.

**Mechanism 3 - natural-language capture, later. Tier: Medium, already backlogged.**

Section 4 of [17 - Feature Backlog and Roadmap](02-product/17-feature-backlog-and-roadmap.md)
already schedules this for 1.2 with the correct reasoning. It is a parser, not a chatbot: a
single constrained model call turns "gym 6 to 7:15" into a **pre-filled draft form** the
user confirms. The AI never writes to the database, so DF-AI-001 holds. Build this before
building any chat, because it delivers the appeal of talking to the app without any of its
costs.

### 4.4 If a bot is built anyway

Section 9 of [15 - PRD AI Insights Engine](02-product/15-prd-ai-insights-engine.md) already
lists a conversational interface as a future capability, and the roadmap places it at 2.0
after the AI layer is mature. If it is brought forward, these constraints are not
negotiable:

| Constraint     | Rule                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Data it sees   | `PeriodFacts` only. No Moment rows, no notes. DF-AIA-001, DF-AI-063.                                         |
| What it may do | Read and explain. It MUST NOT create, edit, close or delete anything, including through a tool call.         |
| Arithmetic     | Every number comes from a SQL function. The model MUST NOT compute. DF-AI-003.                               |
| Where it lives | `/insights`. Never the dashboard - the dashboard is the capture surface and must stay fast and uncluttered.  |
| Turn limit     | A hard ceiling per conversation, and a per-user monthly cap. DF-AI-052 requires the cap and it is not built. |
| Context        | The current period's facts only, not the whole conversation resent each turn.                                |
| Consent        | Behind `ai_consent`, same as reports. DF-AI-060.                                                             |
| Degradation    | With `AI_ENABLED=false` the surface disappears entirely. DF-AI-056.                                          |

Note the gap in the row on caps: `src/app/api/reports/generate/route.ts` enforces 20
generations per day, but the per-user **monthly** ceiling required by DF-AI-052 and
DF-AIA-041 does not exist in the code. A chat feature would need it built first, not
alongside.

---

## 5. Retention and appeal

### 5.1 The answer first

The three highest-value changes are not new features. They are, in order: **fix a streak
that is lying**, **build the dashboard regions that are already specified and were never
built**, and **build the first-run welcome state**. All three are already written down in
the suite. None of them requires a new idea.

The biggest trap is a **global "days used DayFlow" streak**. It is the most habit-forming
thing available and it directly attacks the thing the product measures.

### 5.2 Habit-forming versus manipulative

One test settles almost every case here.

**A mechanic is honest when it rewards the behaviour the product actually measures, and
manipulative when it rewards the appearance of that behaviour.**

The North Star is Weekly Recording Days - distinct days on which a Moment was recorded
([10 - KPI Framework](01-business/10-kpi-framework.md) section 2). A mechanic that rewards
recording is aligned. A mechanic that rewards _opening the app_ is not, and one that
rewards _not being caught_ - a streak that survives days with no data - is actively
corrosive, because the number stops meaning anything and the user eventually notices.

A second test, from charter principle 2: **does the mechanic make fabricating a Moment more
attractive?** If a user would invent a 10-minute entry at 23:58 to save a number, the
mechanic is manufacturing the exact data corruption the bounded queue exists to prevent.

### 5.3 The streak defect

`public.get_streak` in migration `0010` walks backwards **730 days** from today. For an
`at_most` goal it marks a day as met when achieved minutes are at or below the target, and
DF-GOA-032 explicitly makes zero minutes a success. `get_goal_achieved` returns 0 for any
day with no Moments - including every day **before the account existed**.

The consequence: a user who signs up today and creates "Keep Social Media under 30m a day"
is immediately shown a **731-day current streak and a 731-day best**, for a product they
started using this morning. The same mechanism means a lapsed user's at-most streak grows
while they are away, which is the case in example 13.

This is the defect described in the request, and it is worse than "a streak accruing on
days the app was not opened" - it accrues on days that predate the account.

**Two separate questions, and they should not be conflated.**

_The defect._ The scan must be floored at the later of the account creation date and the
goal's creation date. No specification changes; this is code catching up with intent.
Tier: Small.

_The design question._ Should a day with **no recorded Moments at all** count toward an
at-most streak? DF-GOA-032 currently says yes, and DF-GOA-033 says no for at-least goals.
The asymmetry is defensible - not recording is not evidence of scrolling - but it means a
user can build a 60-day "under 30m of Social Media" streak by never opening the app, which
flatters and deceives exactly as described. Changing it contradicts an approved
requirement, so under document 01 section 2 the specification is amended first. Tier:
Small code, but it needs a decision.

**Recommendation:** fix the defect now, and separately decide the design question. My view
is that an at-most streak day should require at least one recorded Moment on that day - the
streak then means "on days I was paying attention, I stayed under" - but that is a product
judgement, not a bug report.

### 5.4 Ranked proposals

Value is how much it moves Weekly Recording Days or day-7 retention. Effort uses the tags
from section 2.

| #   | Proposal                                                               | Value  | Effort | Notes                                                    |
| --- | ---------------------------------------------------------------------- | ------ | ------ | -------------------------------------------------------- |
| 1   | Fix the at-most streak scan window                                     | High   | Small  | Currently shows fictional 731-day streaks                |
| 2   | Build the specified dashboard regions                                  | High   | Medium | Already specified; `dashboard_order` unused              |
| 3   | Build the first-run welcome state                                      | High   | Medium | DF-UX-011/012/014; `onboarded_at` unused                 |
| 4   | Explain the iOS install requirement on the Settings notifications card | High   | Small  | Currently a dead end for every iPhone user               |
| 5   | Make the weekly report notification say something                      | Medium | Small  | Sends `insights[0].title` today                          |
| 6   | Weekday-split distraction insight (section 3, example 8)               | Medium | Small  | No SQL change                                            |
| 7   | Wire up the `?add=1` manifest shortcut                                 | Medium | Small  | The shortcut exists and does nothing                     |
| 8   | Lapsed-user return card (example 12)                                   | Medium | Medium | No return path exists today                              |
| 9   | Goal realism insight (examples 14 and 15)                              | Medium | Medium | Needs `goals` in facts                                   |
| 10  | Shareable summary image                                                | Low    | Medium | Already backlogged at 1.1; a growth lever, not retention |

**On #2.** Section 2 of
[20 - Screen Specifications](03-ux/20-screen-specifications.md) specifies nine dashboard
regions. The built dashboard (`src/features/dashboard/dashboard-view.tsx`) has three:
queue, a three-stat summary, and the timeline. Missing are quick-add chips (specified as
"the fastest possible capture path"), today-at-a-glance with the productivity score and its
7-day trend, goals, streaks, the latest insight, and the week bar. The `dashboard_order`
setting is stored, validated, exported and **never read**, so DF-UX-101 is unimplemented,
and DF-GOA-040 ("the dashboard MUST show current streaks") and DF-GOA-060 ("the dashboard
MUST show today's score with its trend") are both unmet. This is the largest gap between
the specification and the product, and it is squarely in the retention path: the dashboard
is the screen a returning user sees.

**On #3.** `profiles.onboarded_at` exists in the schema and is never written by any code.
There is no welcome state, no first-Moment prompt, and no dismissal - so DF-UX-012, the
requirement described in document 19 as "the pedagogical core of onboarding", is not built.
A new user currently lands on a dashboard with seeded categories, an empty queue, an empty
timeline, and no instruction that the way to use this product is to record something that
already finished. That single teaching moment is, by the product's own analysis, the
difference between a day-7 return and a churn.

**On #4.** On an iPhone in Safari, the Settings notifications card reads "This browser
cannot receive push notifications" and disables the button. That is technically what
`usePush` detected and it is completely misleading: iOS exposes push only to a Home Screen
web app, so the correct message is "Add DayFlow to your Home Screen first, then enable
this here." Given that reminders are the product's signature mechanic, this is a one-
paragraph fix with outsized value. ADR-013 in the decision log already anticipated this
friction and said it "must be handled explicitly in the interface". It is not.

### 5.5 Traps

Ranked by how tempting they are.

**1. A global usage streak. The biggest trap.** "You've used DayFlow 43 days in a row" is
the most retention-effective thing you could ship and you should not ship it. It rewards
opening the app rather than recording honestly, it creates a direct incentive to fabricate
a Moment near midnight to preserve a number, and it makes a lapse feel like a failure of
character rather than a Tuesday. It fails both tests in section 5.2. The per-goal streaks
that already exist are the honest version, because they are tied to a target the user
chose.

**2. Loss-framed notifications.** "Your streak ends in 2 hours." Forbidden by DF-GOA-041
and by the tone rule in the go-to-market plan, which observes that guilt drives churn in a
tool requiring daily voluntary effort. DF-GOA-043 permits surfacing a streak at risk, but
only if the user opted into goal reminders and only stated factually.

**3. Streak freezes, repairs or grace days.** Rule 2 of document 14 section 2 requires that
a retroactive repair be visible. A purchasable or automatic freeze makes the number stop
describing anything. If a rest-day allowance is wanted - it is in the backlog - it must be
part of the goal's definition from the start, not a patch applied afterwards.

**4. Badges, points and levels.** They reward volume, and volume is not the goal. A user
whose distracted time falls should not score lower than one who records more of it.

**5. Daily AI reports on by default.** `ai_daily_reports` defaults to false and that is
correct. A daily push about yesterday trains a user to ignore the app's notifications,
which then costs you the queue reminders - the notifications that actually carry the
product.

**6. Anything comparative or social.** The productivity score is explicitly not comparable
between users (document 14, section 5.1). A leaderboard would be built on a number the
specification says has no cross-user meaning.

### 5.6 The moment a user decides

Two moments, and they are not the same one.

**End of first session.** Decided by whether they recorded one Moment and understood _why_
it was retroactive. Proposal 3.

**Somewhere in days 5 to 10.** Decided by whether the product has told them something they
did not know. Not a chart - a sentence. The fragmentation insight from example 5 is the
best candidate the codebase currently has, and it needs about six days of data to fire.
This argues for the first weekly report being the most important artefact the product
produces, and for the notification announcing it saying something specific (proposal 5)
rather than "Tap to read it."

---

## 6. Digital Wellbeing and Screen Time - feasibility

### 6.1 The answer first

**No. DayFlow AI cannot read Android Digital Wellbeing or iOS Screen Time data, and no
privacy switch changes that, because there is nothing to switch.**

This is not a limitation of the current build. It is a property of what the product is: a
web application running in a browser sandbox. No web standard, on any platform, exposes
another application's usage data to a web page. Installing it as a PWA does not change
this - a PWA is the same web page with a home-screen icon and a few extra APIs, none of
which are these.

The request is also already a recorded decision, twice. Charter section 8 lists "Automatic
tracking of apps or windows" as out of scope: "Requires an OS agent; enormous privacy cost;
contradicts self-declaration." Section 5 of the feature backlog lists "Automatic app
tracking" under **Explicitly never**. So the honest answer is not only "it cannot be built"
but "it was decided against, and the reasoning is on file."

### 6.2 Android, specifically

App usage data comes from `UsageStatsManager`, which requires the `PACKAGE_USAGE_STATS`
permission. Three things about that permission make this a closed door:

1. It is a **special permission**. It cannot be requested with a runtime dialog. The user
   must grant it by hand in Settings, under Apps, Special access, Usage access.
2. It is granted **to an installed package**. A web page has no package. There is no
   browser-mediated path, no origin trial, and no proposed standard.
3. Digital Wellbeing itself is an app that uses this API. It exposes no public content
   provider, no export, and no share intent for third parties to consume.

Google Play policy adds a further obstacle even for a native app: permissions that access
sensitive information must be necessary for core functionality as promoted in the store
listing, must be declared, and are reviewed with that in mind. A time-tracking app
requesting usage access is a plausible case, but it is a case you have to argue, and it
attaches an ongoing review risk to a product currently run by one person in evenings.

### 6.3 iOS, specifically

Screen Time data is reachable only through the `FamilyControls`, `DeviceActivity` and
`ManagedSettings` frameworks. These require a special entitlement granted by Apple on
request, and the entitlement is scoped to parental-control and managed-device use cases. A
personal productivity app is not that use case. Even inside those frameworks, applications
are identified by opaque tokens rather than names, specifically so that the data cannot be
read out.

A web page has no access whatsoever. This is a harder no than Android's.

### 6.4 What the web platform does expose

For contrast, so the boundary is clear. The web has real device capabilities: notifications
and push, background sync, storage and persistence, badging, geolocation, camera and
microphone, sensor readings, and - in Chromium browsers, per-device and behind a user
gesture - Bluetooth, USB, Serial and HID. Every one of these is a permission the user
grants to _this site_ for _this site's own use_.

None of them reads anything about another application. That category of API does not exist
on the web and is not proposed, because the same-origin model exists precisely to prevent
it.

### 6.5 What would actually be required

| Route                                | What it means                                                                                                                                                                                  | Effort  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Native Android app                   | A second codebase in Kotlin, sharing nothing with this one. Play Console account, data safety declaration, prominent disclosure, review.                                                       | Large   |
| Android wrapper with a native module | A Trusted Web Activity or WebView shell plus a native bridge exposing usage stats to the page. **A plain TWA does not help** - it is still a web page. Still a Play listing, still the review. | Large   |
| Companion Android app                | A small native app that reads usage stats and posts them to DayFlow's API. Same permission, same review, plus a second install to explain.                                                     | Large   |
| Native iOS app                       | Requires the FamilyControls entitlement, which Apple is unlikely to grant for this use case.                                                                                                   | Blocked |
| Manual import                        | Nothing to import from: neither Digital Wellbeing nor Screen Time offers a supported export.                                                                                                   | Blocked |

Every workable route is Large, ends in an app store, and abandons the single-codebase,
no-review, ship-instantly property recorded as ADR-013.

### 6.6 What to do instead

The underlying want is reasonable: _"I know my phone eats hours and I do not want to type
that in."_ Three responses that serve it without leaving the web.

**1. Make Distracted Time capture nearly free. Tier: Small.** The manifest already declares
a shortcut, "Add activity" pointing at `/dashboard?add=1` - and **nothing in the code reads
the `add` parameter**, so the shortcut opens the dashboard and does nothing. Wiring it up,
then adding per-category shortcuts, means a long-press on the home-screen icon offers "Log
Social Media" directly. That is two taps from the launcher to a pending Moment.

**2. A once-daily self-reported screen-time figure. Tier: Medium.** One optional prompt in
the evening: "Digital Wellbeing says your screen time today was...?" with a single number
field. The user reads their own phone's figure and types it. It is self-declared, which is
what the charter says this product is, and it is one field rather than an integration.
Whether it becomes a Moment or a separate metric is a design question worth thinking about
before building - a typed total is not the same kind of record as a lived Moment, and
mixing them would degrade the data.

**3. Web Share Target. Tier: Medium, Android only.** An installed PWA can register as a
share target, so sharing from another app opens DayFlow with a pre-filled capture. Useful,
real, standard - and worth noting it does not work on iOS.

### 6.7 Stated uncertainty

- I am confident there is no web API for on-device app usage on either platform, and no
  proposal for one.
- I am confident `PACKAGE_USAGE_STATS` requires an installed package and a manual grant in
  system Settings.
- I am **less certain** about whether any Android OEM build (Samsung, Xiaomi and others ship
  modified Digital Wellbeing surfaces) offers a usage export that a user could import by
  hand. I am not aware of one, and I would not plan around it.
- I am **less certain** about the precise current wording of Play's review treatment of
  usage access, which changes. The direction - it is scrutinised and must be justified by
  core functionality - is stable.
- Everything about iOS Screen Time entitlements is from Apple's published framework
  documentation and third-party reports; I have not attempted an entitlement request.

---

## 7. How to install the app

### 7.1 The answer first

DayFlow AI is a website, not an app store app. There is nothing to download. You **install**
it from the browser, which puts an icon on your home screen or desktop and opens it in its
own window without browser chrome.

The URL is <https://dayflow-ai-six.vercel.app/>.

### 7.2 What the repository actually has

Checked directly, not assumed.

| Item                             | State                                                                |
| -------------------------------- | -------------------------------------------------------------------- |
| `public/manifest.webmanifest`    | Present, valid, linked from `src/app/layout.tsx`                     |
| `name` / `short_name`            | "DayFlow AI" / "DayFlow"                                             |
| `start_url`                      | `/dashboard`                                                         |
| `display`                        | `standalone` - required for iOS push                                 |
| Icons                            | 192, 512 and maskable-512 PNGs all present on disk                   |
| `prefer_related_applications`    | Absent, which is correct                                             |
| Service worker `public/sw.js`    | Present. Push and notification clicks only. **No `fetch` handler.**  |
| Service worker registration      | Only when the user enables notifications in Settings                 |
| `appleWebApp.capable`            | Set to true in the layout metadata                                   |
| `apple-touch-icon`               | **Not declared**                                                     |
| `screenshots` in the manifest    | **Absent**                                                           |
| Manifest shortcut "Add activity" | Declared, points at `/dashboard?add=1`, **the parameter is ignored** |

### 7.3 What would stop an install prompt appearing

**The install itself works.** Chrome's requirements for offering install from the browser
menu - HTTPS, a manifest with a name, a 192px and a 512px icon, a `start_url` and a
`display` of `standalone` - are all met.

**The automatic prompt will not appear, and that is by design.** Chrome's _proactive_ install
promotion still expects a service worker with a `fetch` handler. `public/sw.js` deliberately
has none, and the file explains why in a comment: caching a time tracker's data offline
means serving a stale queue, and "being honestly unavailable beats being confidently wrong."
That is a defensible trade, but it should be a known trade: **no install banner will ever
appear, so the user has to know to look in the menu.**

Compounding it, the service worker is only registered when the user turns on notifications,
and nothing in the application listens for `beforeinstallprompt`, so there is no in-app
install button either.

**Recommendation. Tier: Small.** Add a dismissible "Install DayFlow" card that listens for
`beforeinstallprompt` on Chromium and, on iOS, shows the Share-sheet instructions instead.
Add an `apple-touch-icon` at 180x180. Add `screenshots` to the manifest so Android shows the
richer install dialog. None of these requires touching the service worker or reversing the
no-offline-caching decision.

_Uncertainty:_ Chrome has been relaxing these criteria - the service worker requirement was
already removed for menu-based install in Chrome 108 on mobile and 112 on desktop - and the
proactive prompt's exact conditions are still moving. The safe statement is that menu
install works and the automatic banner should not be relied on.

### 7.4 Android, Chrome

1. Open <https://dayflow-ai-six.vercel.app/> in Chrome. Not in an in-app browser - if you
   arrived from a chat app, use its "Open in Chrome" option first.
2. Sign in.
3. Tap the three-dot menu, then **Add to Home screen** or **Install app**.
4. Confirm. The icon appears on your home screen and opens without browser chrome.
5. Open it, go to **Settings**, and turn on notifications for that device. Reminders are the
   point of the product and this step is per device.

### 7.5 iPhone and iPad, Safari

Safari only. Chrome and Firefox on iOS use Apple's engine and cannot do this differently.

1. Open <https://dayflow-ai-six.vercel.app/> in **Safari**.
2. Sign in.
3. Tap the **Share** button, the square with the upward arrow.
4. Scroll and tap **Add to Home Screen**, then **Add**.
5. **Open DayFlow from the new home-screen icon, not from Safari.** This matters.
6. Go to **Settings** and enable notifications.

**iOS limitations you need to know, because this product depends on reminders.**

- **Push works only inside the installed app.** iOS exposes push notifications to Home
  Screen web apps only, from iOS 16.4 onward. In a Safari tab it is unavailable - not
  restricted, absent.
- **Because it is absent, the app currently tells you the wrong thing.** In a Safari tab,
  Settings reads "This browser cannot receive push notifications" and disables the button.
  It can, after you install it. This is proposal 4 in section 5.4.
- **There is no install prompt on iOS at all,** and no API to trigger the Share sheet. The
  user must be told the steps; nothing can offer them.
- **Permission must follow a tap.** The existing button satisfies this.
- **iOS 16.4 or later is required** for push. Earlier versions can install the app but will
  never receive a reminder.
- **Storage can be evicted** after long disuse. DayFlow keeps everything in Supabase rather
  than locally, so this costs a re-sign-in at worst.

### 7.6 Desktop, Chrome or Edge

1. Open the site and sign in.
2. Click the install icon at the right-hand end of the address bar, or use the three-dot
   menu and **Install DayFlow AI**.
3. It opens in its own window and appears in the Start menu or Dock.

Firefox does not support installing web apps on the desktop. Safari on macOS 14 and later
supports **Add to Dock** from the File menu.

### 7.7 One thing to check before telling anyone the URL

`start_url` is `/dashboard`, which is behind the authentication guard. Launching the
installed app while signed out lands on the sign-in page rather than something broken, which
is acceptable. Worth deciding deliberately rather than by accident.

---

## Change History

| Version | Date       | Author | Change         |
| ------- | ---------- | ------ | -------------- |
| 0.1.0   | 2026-08-06 | Agent  | Initial draft. |
