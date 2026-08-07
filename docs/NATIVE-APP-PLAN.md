# Native Mobile App Feasibility and Plan

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| Document ID  | DF-DOC-NATIVE                                    |
| Version      | 0.1.0                                            |
| Status       | Draft                                            |
| Owner        | Founder                                          |
| Last updated | 2026-08-06                                       |
| Supersedes   | -                                                |
| Numbering    | Deliberately outside the 01-37 numbered sequence |

---

## 1. Purpose

This document answers one question: can DayFlow AI become a real, installable mobile
application - an APK you can put on an Android phone, or an app in the Apple App Store -
rather than a browser shortcut, and if so, how, at what cost, and when.

It is written for someone who can read carefully but does not write code. Every technical
term is explained the first time it is used. Every claim about what Apple, Google, Vercel
or Android require is cited, with the date the claim was checked.

It is a planning document. Nothing in the codebase was changed to produce it.

---

## 2. The recommendation, and the honest bottom line

### 2.1 The recommendation

**Build the Android app now as a Trusted Web Activity, using GitHub Actions to compile it,
but fix the two blockers in §5 first, and do not start the Google Play submission clock
until the four known product defects are closed. Do not attempt iOS in 2026.**

In one sentence: you can have a genuine, signed, installable Android APK on your phone
within about a day of work, for zero money and with no software your laptop refuses to
install - but putting it on the Google Play Store is a three-to-four week calendar process
that you should not begin while the app has bugs that a store review cycle would freeze in
place.

### 2.2 The honest bottom line

Six things are true at once, and the plan only makes sense if all six are held together.

**A real APK is genuinely achievable, cheaply, this week.** This is not a consolation
prize. A Trusted Web Activity produces a normal Android application package, signed with
your own key, that installs from a file, appears in the app drawer with its own icon,
appears in the Android app switcher as its own app, receives notifications attributed to
itself, and has no browser address bar anywhere in it. If you hand someone that file they
have an app. Nothing about that requires the Play Store, a payment, or administrator
rights on your laptop.

**The Play Store is a separate, slower problem.** Publishing costs 25 US dollars once, and

- because your account would be a new personal account - requires you to run a closed test
  with at least twelve real people who stay opted in for fourteen continuous days before
  you may even apply for production access.[^play-testing] That fourteen-day clock, and
  finding twelve willing people, is the single hardest constraint in this whole document.
  It is not solvable with money or with cleverness.

**iOS is a different order of difficulty and I recommend against it.** It is not impossible
on Windows - services exist that compile on rented Mac hardware in the cloud - but Apple has
no equivalent of a Trusted Web Activity, so an iOS app means either a webview wrapper at
serious risk of rejection under Apple's minimum-functionality rule, or rebuilding the
interface natively. Plus 99 US dollars every year, forever.[^apple-fee]

**Two things in the codebase block the Android path today and must be fixed first.** They
are small, they are described precisely in §5, and neither takes more than an hour. But
without them the app would not verify as yours, and it would have no icon.

**Shipping to a store changes how fixes reach users.** Right now a fix goes live on Vercel
in about ninety seconds. Once the app is in the Play Store, a change to the native shell
waits on Google's review. The good news, explained in §7, is that a Trusted Web Activity
loads its content from your live website, so almost every fix you make still ships
instantly. Only changes to the wrapper itself need review. This is the main reason a
Trusted Web Activity is the right first step rather than a bundled or rewritten app.

**The Digital Wellbeing goal is not reachable by any of these routes without real cost.**
Reading Android's per-app screen time data requires a native Android component and a
permission that Google reviews individually. A Trusted Web Activity cannot do it. See §11.

### 2.3 On the "should this wait" question

You asked for this directly, and you may disagree with waiting. So here is the trade-off
in full rather than a flat no.

The live site currently has four known defects: settings cannot be saved, insights report
generation fails, there is no mobile navigation, and a goal streak displays an impossible
731 days.

Two of those - settings not saving and no mobile navigation - are not cosmetic in this
context. Settings is where reminder intervals, quiet hours and the auto-close threshold
live; a reminder-driven product whose reminder settings cannot be saved is a product whose
core mechanic the user cannot control. And "no mobile navigation" means the thing you would
be packaging as a phone app cannot currently be navigated on a phone.

Google's minimum-functionality policy requires a "stable, responsive, and engaging user
experience", and reviewers explicitly check whether an app crashes, freezes or shows
rendering errors.[^play-quality] An app you cannot navigate on a phone is a plausible
rejection, and a rejection costs you another review cycle.

But - and this matters - **none of that blocks Phase 1**. Building the APK, installing it
on your own phone, and confirming that notifications arrive is testing, not shipping. You
can and should do that now. What should wait is the moment you create the Play Console
account and start the twelve-tester clock, because that is the point at which you are
asking twelve other people to look at the product, and their opinion of it is formed on
the day they install it.

So: build now, publish after the defects are fixed. That is not a delay, because the
fourteen-day testing window will absorb most of the fixing time anyway.

---

## 3. Vocabulary

These terms are used throughout. Each is defined once, here.

| Term                           | What it means                                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **APK** (Android Package)      | A single file containing an Android application. Copy it to a phone, tap it, and the app installs. This is the file people mean by "an APK".                                                                                                                                              |
| **AAB** (Android App Bundle)   | A publishing format. You upload one AAB to Google Play, and Google generates the right APK for each phone model from it. Google Play accepts AABs, not APKs, for new apps. You still produce an APK for your own testing.                                                                 |
| **TWA** (Trusted Web Activity) | An Android app that displays your website full-screen with no browser interface at all - no address bar, no browser tabs, no browser menu. It is a real Android app, but the screens inside it are your website. Google built this specifically so websites could become Play Store apps. |
| **Digital Asset Link**         | A small text file you put on your website that says "this Android app, identified by its signing fingerprint, belongs to me". Android checks for it. Without it, your TWA still runs but shows a browser address bar - which defeats the point.                                           |
| **Signing key / keystore**     | A cryptographic file that stamps an app as coming from you. Every Android app must be signed. Lose the key and you can never update the app again; leak it and someone else can publish updates that phones will accept as yours.                                                         |
| **Capacitor**                  | A tool that puts a web app inside a native app shell on Android and iOS, and gives the web code access to native features like the camera or the file system.                                                                                                                             |
| **React Native / Expo**        | A way of building a genuinely native mobile interface using the same language the web app is written in. Not a wrapper: the screens are rebuilt.                                                                                                                                          |
| **PWA** (Progressive Web App)  | A website that can be added to a phone's home screen and then behaves somewhat like an app. This is what DayFlow is today.                                                                                                                                                                |
| **Static export**              | A mode where Next.js produces a folder of plain files with no server behind them. Fast and portable, but everything that needs a server stops working.                                                                                                                                    |
| **Middleware**                 | Code that runs on the server before every page request. DayFlow uses it to check whether you are signed in and to redirect you if not. See `src/middleware.ts`.                                                                                                                           |
| **VAPID**                      | The key pair that proves push notifications sent to a browser came from your server and not someone else's.                                                                                                                                                                               |
| **Sideloading**                | Installing an app from a file rather than from an app store. Normal and permitted on Android; not possible on iPhone outside the EU.                                                                                                                                                      |

---

## 4. What is actually being packaged

Before assessing options, here is what the code does, because the answers depend on it
entirely.

### 4.1 Architecture in one paragraph

DayFlow is a Next.js App Router application deployed on Vercel, with Supabase as the
database and the authentication provider. The browser talks to Supabase **directly** for
almost all data - `next.config.ts` explicitly permits this in its security policy, allowing
the browser to reach the Supabase origin over both HTTPS and websockets. The screens are
client-side React components fetched through React Query. The server is used for four
things only: checking whether you are signed in, three scheduled background sweeps, a
handful of privileged operations, and serving the files.

### 4.2 The 24 routes, categorised

| Category                     | Count | Routes                                                                                                                    | Runs where                                                                                    |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Authenticated screens        | 9     | `/dashboard`, `/calendar`, `/calendar/[date]`, `/analytics`, `/insights`, `/goals`, `/categories`, `/search`, `/settings` | Thin server wrappers around client components. Data is fetched in the browser from Supabase.  |
| Authentication screens       | 4     | `/sign-in`, `/sign-up`, `/reset-password`, `/update-password`                                                             | Client-side forms.                                                                            |
| Public and error             | 2     | `/`, `not-found`                                                                                                          | Static.                                                                                       |
| Scheduled background jobs    | 3     | `/api/cron/reminders`, `/api/cron/auto-close`, `/api/cron/daily-report`                                                   | **Server only.** Called by the database on a schedule, authenticated by a shared secret.      |
| Push subscription management | 2     | `/api/push/subscribe`, `/api/push/unsubscribe`                                                                            | **Server only.** Reads the signed-in user from a cookie.                                      |
| Privileged operations        | 2     | `/api/reports/generate`, `/api/export`                                                                                    | **Server only.** The report route uses the AI provider key, which must never reach a browser. |
| Authentication plumbing      | 2     | `/auth/callback`, `/auth/sign-out`                                                                                        | **Server only.** The callback exchanges a one-time code from an email link for a session.     |

The important observation: **the nine authenticated screens are already almost entirely
client-side.** `src/app/(app)/dashboard/page.tsx` is eight lines long and simply renders
`<DashboardView />`. The genuinely server-dependent parts of the user interface are just
two files: `src/middleware.ts` and `src/app/(app)/layout.tsx`.

That single fact is what makes the bundled-app option in §7.2 far less frightening than it
would normally be. It is also why a Trusted Web Activity is such a good fit: there is very
little "server-rendered app" here to lose.

### 4.3 How you stay signed in

The web app stores your session in browser **cookies**. `src/lib/supabase/middleware.ts`
refreshes that session on every single page request and redirects you to `/sign-in` if you
are not signed in. `src/lib/supabase/server.ts` reads the same cookies on the server. The
browser client in `src/lib/supabase/client.ts` reads them too.

Remember this. It is the one thing that behaves differently between a website and a native
app, and §10 is devoted to it.

### 4.4 How reminders actually work

This is better news than you might expect. Reminders are **not** produced by your phone.
They are produced by the database.

A scheduled job inside Supabase calls `/api/cron/reminders` every ten minutes. That handler
reads every open Moment, applies the pure rules in `src/lib/domain/reminder-rules.ts` -
hourly nudges (`DEFAULT_REMINDER_INTERVAL_MINUTES = 60`), a three-hour warning
(`DEFAULT_WARNING_MINUTES = 180`), auto-close at six hours
(`DEFAULT_AUTO_CLOSE_MINUTES = 360`), quiet hours, and a minimum ten-minute floor - and
sends a web push notification to every device the user has registered.

The consequence: **your phone does not need to be running the app, or even awake, for a
reminder to be generated.** The server decides; the phone only has to be able to receive.
Every option below therefore reduces to a single question about reminders: _can this
packaging still receive a web push?_ For Android, the answer is yes in every case. For
iOS, it is complicated, and §12 covers it.

### 4.5 The security posture that a static export would discard

`next.config.ts` sets a Content Security Policy, HTTP Strict Transport Security,
`X-Frame-Options`, `X-Content-Type-Options`, a Referrer Policy and a Permissions Policy on
every response, and sets `Service-Worker-Allowed` on the service worker. These implement
documented requirements DF-SEC-021 and DF-SEC-023.

Next.js does not support custom headers in a static export.[^next-export] Any option that
requires a static export therefore throws all of that away and must reimplement it, or
accept the loss. This is a real cost and it is easy to overlook.

---

## 5. What still blocks the Android path today

One remaining defect was confirmed against the live deployment on 6 August 2026.
A second claim — missing icon PNGs — was wrong and is corrected in §5.1. The asset
links middleware exclusion is fixed on the WIP branch; the file itself still has to
be created with a real signing fingerprint before a Trusted Web Activity can verify.

### 5.1 Icons are present — do not regenerate them as a blocker

`public/manifest.webmanifest` references three images: `/icons/icon-192.png`,
`/icons/icon-512.png` and `/icons/icon-maskable-512.png`.

**An earlier draft of this section claimed the PNGs were missing.** That was wrong.
All three are committed and tracked — `git ls-files public` lists them. A workspace
glob of `**/*.png` can still return zero results on this machine because OneDrive
dehydrates the binaries into cloud placeholders; `git ls-files` is the authority,
not the filesystem search.

The conclusions that followed from the missing-icon premise — no home-screen icon,
no splash screen, default push icon, TWA build blocked for want of a 512px asset —
should be disregarded. The icons exist; if a device shows a default icon, look at
caching or the live response for `/icons/icon-192.png`, not at regenerating files
that are already in the repository.

`npm run icons:generate` remains the way to rebuild them if the brand mark changes.

### 5.2 Digital Asset Links verification would fail

**This was verified against the live site on 6 August 2026.**

For a Trusted Web Activity to run without a browser address bar, Android fetches
`https://dayflow-ai-six.vercel.app/.well-known/assetlinks.json`. That file must return HTTP
200, with content type `application/json`, over HTTPS, **with no redirects at all**.[^dal]

Fetching that URL on the live site on 6 August 2026 returned the **sign-in page**.

The cause was in `src/middleware.ts`: its matcher excluded static assets, `sw.js`,
`manifest.webmanifest` and `icons/` - but not `.well-known/`. So a request for the asset
links file passed through `updateSession`, found no session, found the path was not in
`PUBLIC_ROUTES`, and redirected to `/sign-in`.

**Fix (matcher):** `\.well-known/` is now in the matcher exclusion list. Once deployed,
an absent file returns 404 rather than the sign-in page; that is enough for diagnosis
and is required before a real `assetlinks.json` can verify.

**Still to do:** place `public/.well-known/assetlinks.json` with the package name and
SHA-256 fingerprint of the signing key. Without that file, verification still fails and
the app opens with a browser bar - which is exactly the outcome a TWA is meant to avoid.

### 5.3 Neither gap is a reason to abandon the plan

The asset-links matcher fix and the icon clarification are cheap. Correctly-scoped
middleware is something the web app should have regardless. Fixing it costs minutes and is
worth doing whether or not you build a native app.

---

## 6. Option A - Trusted Web Activity (Android only)

### 6.1 What you actually get

A file called something like `app-release-signed.apk`. Copy it to your phone, tap it,
approve the "install from this source" prompt once, and DayFlow appears in your app drawer
with its own icon. Open it and you get a full-screen app with no browser interface. It
appears as its own entry in the Android app switcher. Notifications arrive attributed to
"DayFlow AI" rather than to Chrome. Nothing on screen says "Chrome" anywhere.

To a normal user, this is indistinguishable from any other app. It is not a shortcut, not a
bookmark, and not a PWA icon. It is an Android application.

### 6.2 Does DayFlow meet the criteria

| Requirement                              | Status           | Notes                                                              |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Served over HTTPS                        | Yes              | Vercel.                                                            |
| Web app manifest present                 | Yes              | `public/manifest.webmanifest`, linked from `src/app/layout.tsx`.   |
| `display: standalone`                    | Yes              | Already set.                                                       |
| `start_url`                              | Yes              | `/dashboard`.                                                      |
| Name, short name, theme colour           | Yes              | All present.                                                       |
| Icon of at least 512x512                 | Yes              | Committed at `public/icons/icon-512.png`. See §5.1.                |
| Maskable icon (for a nicely shaped icon) | Yes              | Committed at `public/icons/icon-maskable-512.png`.                 |
| Service worker registered                | Yes              | `public/sw.js`, correctly scoped with `Service-Worker-Allowed: /`. |
| Digital Asset Links reachable            | **No** - blocker | See §5.2. Matcher fixed; `assetlinks.json` not yet committed.      |
| No browser-only features that break      | Yes              | The app is already a browser app.                                  |

One remaining blocker for TWA chrome-less display: the asset links file. Icons are not a blocker.

### 6.3 Digital Asset Links, concretely

You would create `public/.well-known/assetlinks.json` in this repository, containing your
app's package name (something like `app.vercel.dayflow_ai_six.twa`) and the SHA-256
fingerprint of the key the app was signed with. Vercel serves anything in `public/` at the
matching path, so committing the file publishes it. Then fix the middleware matcher as
described in §5.2.

One subtlety that catches almost everyone: **if you later publish through Google Play, and
let Google manage the signing key (which is the default and is the safer choice), Google
re-signs your app with a different key.** The fingerprint in `assetlinks.json` must then
list _both_ your upload key and Google's app-signing key, or the published app will show a
browser bar even though your local test build did not.[^twa-quickstart] Google Play Console
shows you the correct fingerprint after your first upload. Plan for one round trip here.

### 6.4 Does Google Play accept Trusted Web Activities

Yes, with conditions, and the conditions are ones DayFlow meets comfortably.

Google itself builds and maintains Bubblewrap, the tool that produces TWAs, and its own
Chrome developer documentation describes publishing them to Play.[^twa-quickstart] There is
no policy prohibiting them.

The relevant policies are:

- **Webviews and Affiliate Spam.** Google prohibits apps "whose primary purpose is to
  provide a webview of a website without permission from the website owner or
  administrator".[^play-spam] You own the website. This does not apply. (It is also
  structurally impossible to violate with a TWA, because the Digital Asset Link is
  cryptographic proof of ownership - that is what it is for.)
- **Repetitive Content.** Prohibits apps that duplicate an existing app's
  experience.[^play-spam] Does not apply.
- **Minimum Functionality.** Requires a "stable, responsive, and engaging user
  experience".[^play-quality] This is where your four open defects matter, and it is the
  reason §2.3 recommends fixing them before submitting.

I could not find any 2026 statement from Google either endorsing or discouraging TWAs
beyond the continued existence of the tooling and documentation. Absence of a policy against
them, plus Google publishing the tool, is strong but not a guarantee.

### 6.5 Offline behaviour

Honestly: there is none, and that is deliberate.

`public/sw.js` contains an explicit comment explaining that the service worker does not
cache the application shell or any data, because "a user who closes an activity against a
cached view, on a device that has not synced, produces a Moment with a wrong end time and no
way to know it. Being honestly unavailable beats being confidently wrong."

So a TWA with no network shows Chrome's offline page. That is the same behaviour the PWA has
today, so nothing is lost by moving to a TWA - but it is worth knowing that "it's an app
now" does not mean "it works on the Tube".

If offline mattered later, the fix is to add an offline fallback page to the service worker
(a branded "DayFlow needs a connection" screen). That is a small, self-contained piece of
work that improves the PWA and the TWA simultaneously, and it is one of the things Google
reviewers look for.[^play-quality] Perhaps half a day. It is not required to ship.

### 6.6 Do push notifications work

Yes, and better than they do today.

By default a TWA's notifications are handled by Chrome, which means they show your website's
URL rather than your app's name. The fix is a standard, documented Android component called
`TrustedWebActivityService`, which Bubblewrap can wire up for you. With it, notifications are
displayed by your app, attributed to your app, and controlled by your app's notification
settings in Android's system settings rather than by Chrome's.[^twa-service]

Nothing on the server changes. `src/lib/push/send.ts`, VAPID, the subscription table, the
three cron sweeps - all of it works untouched. The push subscription still comes from the
same browser engine, and `/api/push/subscribe` still receives it with the same cookies.

This is the single strongest argument for Option A over everything else: for a product whose
core mechanic is reminders, it is the only option where the reminder machinery requires
literally no changes.

### 6.7 Effort, cost, maintenance, risk

| Dimension           | Assessment                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering work    | Fix the two blockers (1 hour). Set up the build (half a day). Notification delegation (2-3 hours). Total: **roughly one day** of assistant work.                                                                    |
| Your time           | Approving the signing key decision, installing the APK, testing on your phone. **Under two hours.**                                                                                                                 |
| Cost to build       | **Zero.**                                                                                                                                                                                                           |
| Cost to publish     | **25 US dollars, once.**[^play-fee]                                                                                                                                                                                 |
| Ongoing maintenance | **Very low.** The wrapper contains almost no logic. It needs rebuilding when Google raises the minimum Android version - currently API 36 from 31 August 2026.[^play-target-api] Roughly once a year, an afternoon. |
| Risk of rejection   | **Low**, provided the four defects are fixed. You own the domain, the ownership is cryptographically proven, and Google publishes the tool.                                                                         |
| Risk of breakage    | **Low.** If the Digital Asset Link ever breaks, the app degrades to showing a browser bar rather than failing.                                                                                                      |
| What you don't get  | iOS. Digital Wellbeing data. Offline. Native gestures.                                                                                                                                                              |

---

## 7. Option B - Capacitor

Capacitor has two genuinely different variants, and conflating them is the most common
mistake in this area. They have almost nothing in common except the tool's name.

### 7.1 Variant B1 - Capacitor pointing at the live Vercel URL

You configure Capacitor's `server.url` to `https://dayflow-ai-six.vercel.app` and it builds
an app whose only job is to open that address in a webview.

**Why this looks attractive:** no rearchitecting whatsoever. The middleware still runs. The
API routes still work. Cookies still work. Deploy to Vercel and the app updates instantly.
It gets you to both Android and iOS.

**Why it is a bad idea:**

Capacitor's own documentation states, in the type definition of the option itself, "This is
intended for use with live-reload servers. **This is not intended for use in
production.**"[^cap-serverurl] A Capacitor maintainer, closing a pull request that tried to
soften that wording, wrote that `server.url` "is still not recommended for production apps
[...] the recommended is to ship the app assets inside it and not rely in a remote server
that could lead to app rejections."[^cap-pr] Another maintainer, asked directly about
loading a remote site, replied "Apple will likely reject your app since it is not
self-contained."[^cap-forum]

On store policy specifically:

- **Apple.** Guideline 4.2 requires an app to "include features, content, and UI that
  elevate it beyond a repackaged website".[^apple-42-text] Apple explicitly states that
  bolting push notifications onto a thin app is not sufficient.[^apple-42-fix] A Capacitor
  app that loads a URL and nothing else is precisely the pattern reviewers are trained to
  find. There is a secondary concern under Guideline 4.7 about executing code not contained
  in the binary.[^cap-remote-blog] Rejection risk here is high, and the guideline is
  subjective, so appeals are slow.
- **Google.** Lower risk, because you own the site. But you would be building a plain
  webview wrapper with none of the Digital Asset Link machinery that makes a TWA obviously
  legitimate, so you would be relying on the reviewer's judgement rather than on proof.

There is also a plain engineering problem noted in Capacitor's own discussion thread: a
Capacitor app served through a service worker on Android can fail to inject the Capacitor
bridge, breaking the native plugins entirely.[^cap-serverurl] DayFlow registers a service
worker for push. This is not theoretical for us.

**Verdict.** B1 gets you strictly less than Option A on Android - the same webview, but with
a policy argument instead of a cryptographic proof - and on iOS it is the option most likely
to be rejected. It is the wrong shape.

### 7.2 Variant B2 - Capacitor with the app bundled inside

You add `output: 'export'` to `next.config.ts`, Next.js produces a folder of plain files,
and Capacitor bundles that folder into the app. The app runs from the phone's own storage
and talks to Supabase over the network.

This is the store-approved shape. It also means giving up everything Next.js does on a
server. Here is exactly what breaks.

#### What a static export cannot do

Next.js documents the unsupported features precisely: middleware, cookies, redirects,
rewrites, custom headers, server actions, dynamic routes without pre-generated parameters,
and any route handler that reads from the incoming request.[^next-export] Route handlers may
only respond to `GET`, and only with a response computed at build time.

#### Route by route, what happens

| Route(s)                                                                | Fate under static export                                                                                                                | Work required                                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/middleware.ts`                                                     | **Does not run at all.** Every authentication redirect and every session refresh disappears.                                            | Rebuild auth gating as a client-side route guard, and rely on Supabase's client library to refresh tokens. **1-2 days.**                                                                    |
| `src/app/(app)/layout.tsx`                                              | **Breaks.** It is a server component that reads cookies and queries the database before rendering.                                      | Convert to a client component that loads the profile and settings after mount, with a loading state that does not currently exist. **1 day.**                                               |
| The 9 authenticated screens                                             | **Survive, once the layout is fixed.** They are thin wrappers around client components that already fetch from Supabase in the browser. | Little to none. This is the good news.                                                                                                                                                      |
| `/calendar/[date]`                                                      | **Breaks.** A dynamic route with no pre-generated list of dates cannot be statically exported.                                          | Convert to a query parameter, or move date selection entirely client-side. **Half a day.**                                                                                                  |
| The 4 auth screens                                                      | Survive. Already client-side forms.                                                                                                     | None.                                                                                                                                                                                       |
| `/auth/callback`                                                        | **Breaks.** It reads a one-time code from the request URL and exchanges it for a session on the server.                                 | Rebuild as a client-side exchange, and reconfigure every Supabase email template to point at a deep link into the app. **1 day, and fiddly.**                                               |
| `/auth/sign-out`                                                        | **Breaks.**                                                                                                                             | Replace with a direct client call. **1 hour.**                                                                                                                                              |
| `/api/push/subscribe`, `/api/push/unsubscribe`                          | **Break.** They read a POST body and the session cookie.                                                                                | Either keep them on Vercel and call them cross-origin with a bearer token (needs CORS and token auth added), or replace with a direct row write protected by row level security. **1 day.** |
| `/api/reports/generate`, `/api/export`                                  | **Break**, and cannot move into the app: the report route uses the AI provider key, which must never reach a device.                    | Must stay on Vercel and be called cross-origin with a token. **1 day.**                                                                                                                     |
| `/api/cron/reminders`, `/api/cron/auto-close`, `/api/cron/daily-report` | **Break in the export**, but this is fine - they are called by the database, not by the app.                                            | Keep the Vercel deployment running purely to host these. No change, but you now maintain two deployments of one codebase.                                                                   |
| `next.config.ts` `headers()`                                            | **Silently ignored.** CSP, HSTS, `X-Frame-Options` and the rest vanish, taking DF-SEC-021 and DF-SEC-023 with them.                     | Reimplement what can be reimplemented; document what cannot. **Half a day plus a documentation update.**                                                                                    |

#### What B2 really costs

Roughly **six to nine days** of engineering, and afterwards you maintain **two build
targets** of the same codebase forever: the web app on Vercel, and the exported bundle
inside the mobile app. Every future feature has to work in both, and the two have different
authentication mechanisms. That is an ongoing tax on every piece of work you ever do, not a
one-off cost.

You would also lose the thing that makes Option A so attractive: fixes would no longer ship
in ninety seconds. Every bug fix would need a new app build and a store review.

**Verdict.** B2 is legitimate, buildable, and store-safe. It is also the most expensive
option per unit of benefit, because the benefit over a TWA on Android is close to zero. Its
only real advantage is that it also reaches iOS - and even then it faces the same Apple 4.2
scrutiny, because a bundled webview is still a webview. Reconsider it only if you later need
a native capability that the web cannot reach.

---

## 8. Option C - React Native or Expo rewrite

You keep Supabase exactly as it is and rebuild the interface as a genuinely native app.

### 8.1 Scope

**What must be rebuilt.** Every screen, in a different UI system. Nine authenticated screens
plus four authentication screens plus the shared shell - and "the dashboard" is not one
screen, it is a live timeline, the open-Moment state, the quick-add flow and the shared
Moment dialog. The charts alone are a project: `recharts` does not run on React Native, so
analytics, insights and goals need a different charting library and a different
implementation. Tailwind styling does not transfer. Realistically **eight to fourteen weeks**
for one experienced developer, and considerably more elapsed time for one person learning as
they go.

**What genuinely transfers.** More than you might think, and it is the best part of this
option:

- `src/lib/domain/` - `reminder-rules.ts`, `moment-rules.ts`, `goal-rules.ts`,
  `queue-rules.ts`, `timezone.ts`. These are pure functions with explicit `now` parameters
  and no framework dependencies. They move across unchanged, with their tests.
- `src/lib/schemas.ts` - the Zod validation schemas.
- `src/lib/supabase/database.types.ts` - the generated database types.
- `src/lib/format.ts`, `src/lib/query/keys.ts`, and the Supabase client setup with a
  different storage adapter.
- The three server-side sweeps and every API route stay exactly where they are.

**What cannot transfer.** All rendering, all styling, all navigation, all animation, the
charts, the modal system, the toast system, and every piece of platform glue.

### 8.2 What you get for it

A genuinely native app: native navigation gestures, native performance, offline capability
if you build it, native push on both platforms, and - critically for one of your stated
goals - the ability to write a native Android module that reads Digital Wellbeing data
(§11). It is also the only option Apple will not question under Guideline 4.2.

### 8.3 The maintenance reality

You would be maintaining **two complete user interfaces** over one backend, forever. Every
feature is built twice. Every bug is potentially two bugs. For a solo founder this is the
decision that most often quietly ends a project - not because it is impossible, but because
the second implementation is always the one that falls behind, and a half-maintained app is
worse than no app.

**Verdict.** The right answer eventually, if DayFlow succeeds and mobile becomes the primary
surface. Completely wrong as a first step, and wrong while the web app still has open
defects. Building a second interface on top of a foundation that has known bugs means
building those bugs twice.

---

## 9. Option D - stay a PWA

Stated plainly so the comparison is fair.

**What you keep:** every fix reaching users in ninety seconds with no review. One codebase.
Zero cost. Zero accounts. Zero store policies. Working push on Android. It works on iOS
today, once installed to the home screen. No signing keys to lose. No annual fees. It works
on desktop.

**What you give up:**

- **Discoverability.** Nobody finds a PWA. There is no store listing and no search.
- **The install experience.** On iOS, the user must tap Share, scroll, and find "Add to Home
  Screen" - there is no prompt, and no API exists to trigger one.[^ios-push] This is the
  single biggest reason PWAs lose users on iPhone.
- **Legitimacy.** "Download our app" and "add this website to your home screen" land very
  differently, whether or not that is rational.
- **Digital Wellbeing data.** Permanently out of reach.
- **Reliable iOS push.** See §12. It works, but only after a manual install, and Apple's
  service worker eviction makes it less dependable than native.

**Verdict.** Genuinely defensible, and materially better than a badly executed native app.
But since Option A costs about one day and adds a real APK on top of everything a PWA
already gives you, Option D is dominated by Option A on Android. Option D remains the answer
on iOS for now.

---

## 10. Sync between the web version and a native app

You asked specifically about this. The short answer is that it is already solved, with one
exception that is important to get right.

### 10.1 What syncs automatically

Everything, because Supabase is the single source of truth for every piece of user data.
There is no local database and no offline store to reconcile - `public/sw.js` says so
explicitly, and it is a deliberate architectural decision.

Further, `src/lib/query/use-realtime-sync.ts` subscribes to Supabase's realtime channel, so
changes propagate to open clients live. Close a Moment on your phone and the browser tab on
your laptop updates without a refresh. This already works today across two browser tabs; a
native app is just a third client.

Moments, categories, goals, settings, push subscriptions, reports - all of it. **Nothing
needs building for data to sync.** That is a genuinely good architectural position to be in.

### 10.2 The one thing that does not sync: the session

Here is the wrinkle, exactly as you suspected.

The web app keeps your session in **cookies**. This is baked in at three levels:
`createBrowserClient` in `src/lib/supabase/client.ts`, `createServerClient` reading
`cookies()` in `src/lib/supabase/server.ts`, and the middleware refreshing cookies on every
request in `src/lib/supabase/middleware.ts`.

What this means for each option:

- **Option A (TWA):** **No change at all.** A TWA runs inside the device's real browser
  engine, with the browser's real cookie store. If you are signed in to DayFlow in Chrome on
  that phone, you are signed in inside the TWA. Sessions refresh through the same middleware
  as always. This is another significant, and often overlooked, advantage of Option A.
- **Option B1 (Capacitor, remote URL):** Mostly works, since it is a webview with a cookie
  store, but the cookie store is isolated from the browser's, so signing in on the web does
  not sign you in in the app. Acceptable.
- **Option B2 (Capacitor, bundled):** **Real work.** With no middleware and no server, the
  session must move to token storage on the device. Supabase's client supports this via a
  custom storage adapter, but every server call you keep on Vercel - report generation, data
  export, push subscription - must change from reading a cookie to reading an
  `Authorization: Bearer` header, and must be given a CORS policy. That is a change to five
  route handlers and to `src/lib/supabase/server.ts`. Budget **one to two days**, and treat
  it as security-sensitive work.
- **Option C (React Native):** Same as B2 - tokens in the device's secure storage, bearer
  tokens to any surviving endpoint - but you would design it that way from the start rather
  than retrofitting.

### 10.3 The other thing that does not sync: notification permission

Notification permission is per-install, not per-account. Granting it in the browser on your
laptop does not grant it in the app on your phone, and `push_subscriptions` correctly stores
one row per device endpoint, upserted on `endpoint` so a shared device that changes accounts
moves the row rather than duplicating it.

That is correct behaviour, but it means each new install needs its own permission grant.
Worth knowing so it is not mistaken for a bug.

---

## 11. Digital Wellbeing and usage statistics

A previous assessment concluded that a PWA cannot reach Android's `UsageStatsManager`. That
is correct, and here is the position for each of the other options.

Reading per-app screen time on Android requires the `PACKAGE_USAGE_STATS` permission. Two
things are true of it:

1. It cannot be granted by the app. The user must go into Android's system settings and turn
   on "usage access" manually. Android's own documentation is explicit: "declaring the
   permission implies intention to use the API and the user of the device still needs to
   grant permission through the Settings application."[^usage-stats]
2. It is a restricted, high-risk permission. Google Play may require a Permissions
   Declaration Form and separate approval before the app may be
   published.[^play-permissions] Your app must have a core, user-facing purpose that
   justifies the access.

| Option               | Can it read Digital Wellbeing data?                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PWA                  | **No.** No native code exists at all.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **TWA (Option A)**   | **No.** This is the honest answer to your question. A TWA has an Android wrapper, but everything you see and every line of your application code runs inside the browser, and a browser has no access to `UsageStatsManager`. Reaching it would mean writing a native Android module and a bridge into the web content - at which point you are no longer building a TWA, you are building a custom Android app that happens to contain one. |
| Capacitor (B1 or B2) | **Technically yes**, via a custom native plugin. There is no ready-made Capacitor plugin for this that I would rely on; you would be writing Android-specific Java or Kotlin either way.                                                                                                                                                                                                                                                     |
| React Native / Expo  | **Yes**, via a native module. Same underlying work, better supported.                                                                                                                                                                                                                                                                                                                                                                        |
| iOS, any option      | **No.** Apple provides no equivalent API to third-party apps. Screen Time data is not available. This is not a limitation of the packaging; it does not exist.                                                                                                                                                                                                                                                                               |

**The practical conclusion.** Digital Wellbeing integration is a separate project. It needs
native Android code regardless of which option you choose, it needs a Play Store permissions
declaration with a justification Google will scrutinise, and it needs the user to complete a
manual settings flow that many will abandon. Decouple it from this decision entirely. If it
turns out to be the feature that makes DayFlow valuable, it argues for Option C eventually -
but it should not drive the first step.

---

## 12. Push notifications across platforms

Reminders are the product's core mechanic, so this table is weighted heavily in the
recommendation.

| Capability                                  | PWA on Android | **TWA on Android**       | Native Android | PWA on iOS                                           | Native iOS    |
| ------------------------------------------- | -------------- | ------------------------ | -------------- | ---------------------------------------------------- | ------------- |
| Receives DayFlow's existing web push        | Yes            | **Yes, unchanged**       | Needs rebuild  | Yes, but only after home-screen install              | Needs rebuild |
| Works with no code changes at all           | Yes            | **Yes**                  | No             | Yes                                                  | No            |
| Notification shows the app's name           | Chrome's name  | **Yes, with delegation** | Yes            | App name                                             | Yes           |
| Controlled in Android/iOS app settings      | Under Chrome   | **Under DayFlow**        | Under DayFlow  | Under the web app                                    | Yes           |
| Action buttons ("Close it now")             | Yes            | **Yes**                  | Yes            | **No** - Safari ignores `actions`                    | Yes           |
| Install required before push can be granted | No             | Install the app          | Install        | **Yes, manually via the Share sheet**                | Install       |
| Available to EU users                       | Yes            | Yes                      | Yes            | **No** - PWA push unavailable in the EU on iOS 17.4+ | Yes           |
| Reliability of the subscription over time   | Good           | **Good**                 | Best           | Weaker - service workers can be evicted              | Best          |

Sources: iOS web push requires the site to be installed to the Home Screen; a Safari tab
cannot subscribe at all; permission must be requested from a real user tap; Safari ignores
`actions`, `image`, `silent` and `requireInteraction`; and PWA push is unavailable to EU
users on iOS 17.4 and later.[^ios-push][^ios-push-matrix][^ios-limits] Notification
delegation on Android is a documented AndroidX component.[^twa-service]

**What this means for the recommendation.** Two rows of that table decide it:

- Option A is the only route where the reminder system - the cron sweeps, the VAPID keys,
  `src/lib/push/send.ts`, the subscription table, the action buttons - requires **zero
  changes** and gains app-attributed notifications for free.
- iOS is meaningfully worse than Android for this product no matter what you do, unless you
  build a native iOS app. For a reminder-driven product, a notification that silently stops
  arriving because the operating system evicted a service worker is close to a fatal defect.

Since a native iOS app is out of reach in 2026 (§13.2), the correct posture is: **make
Android excellent, and treat iOS as the PWA it is today, honestly documented.**

---

## 13. Build and toolchain reality

This is where feasibility is usually decided, so it is treated in detail.

### 13.1 Android

**What is genuinely required to produce a signed APK or AAB:**

1. Node.js 14.15.0 or above.[^bubblewrap-readme] You have Node 24.
2. A Java Development Kit, version 17 specifically. Bubblewrap's documentation is explicit
   that lower versions cannot compile the project and higher versions are incompatible with
   the Android command line tools.[^bubblewrap-readme]
3. The Android command line tools - **not** Android Studio. These are a plain zip download.
4. Android Build Tools, which the command line tools download on first build.
5. A signing key, which Bubblewrap generates for you.

**Can this be done without administrator rights on Windows?** Yes. This is the important
finding.

Bubblewrap's own documentation describes downloading the JDK from Adoptium and extracting it
"in its own folder", and downloading the Android command line tools and extracting them into
a folder you create - explicitly to avoid installing the whole IDE and to avoid version
conflicts.[^bubblewrap-readme] Both are archive extractions into a user-writable directory.
Neither requires an installer, a system PATH change, or elevation. Bubblewrap asks you where
they are on first run.

That maps exactly onto how Node was already installed on this machine
(`%LOCALAPPDATA%\dayflow-toolchain\`). Bubblewrap itself installs via `npm i -g`, which is
user-scope.

Two practical cautions:

- **No spaces in the Android SDK path.**[^bubblewrap-readme] The workspace is under
  `C:\Users\preddy111\OneDrive - PwC\Documents`, which contains both a space and a hyphen.
  Put the toolchain in `%LOCALAPPDATA%\dayflow-toolchain\`, not beside the repository.
- **OneDrive.** The repository sits inside a synced OneDrive folder. Build tools generate
  thousands of intermediate files; OneDrive will try to sync every one of them, and file
  locking during sync is a known cause of confusing build failures. Build outside the synced
  folder.

**The GitHub Actions alternative, assessed properly.**

The repository already has CI at `.github/workflows/ci.yml` running on `ubuntu-latest` with
Node 24. GitHub's Ubuntu runner images ship the Android SDK pre-installed, and the JDK is
available through a standard setup action. Adding a workflow that runs Bubblewrap and
uploads the resulting APK and AAB as build artefacts is a small piece of work - perhaps two
to three hours - and it has real advantages:

- It removes the local toolchain problem entirely. Nothing is installed on the laptop.
- It sidesteps the OneDrive and path-with-spaces problems.
- Every build is reproducible and logged.
- Anyone can download the APK from the workflow run page.

**And a real disadvantage, which needs stating carefully.** Signing in CI means the signing
key lives in GitHub as a repository secret - typically the keystore file base64-encoded, plus
its password. GitHub encrypts secrets at rest and masks them in logs, but the security
properties are worth being clear about:

- Anyone who can push a workflow file to the repository can write a workflow that reads the
  secret. On a repository where you are the only person with write access, that is you. If
  you ever add a collaborator, it becomes them too.
- Pull requests from forks do not receive secrets by default. Keep that default.
- Restrict the signing job to the `main` branch or to a manually triggered workflow, so an
  ordinary pull request never touches the key.
- **If you publish to Google Play, let Google manage the app signing key.** Then the secret
  in GitHub is only your _upload_ key. If it leaks you ask Google to reset it, and no
  attacker can ship an update that phones accept as yours. This materially reduces the
  consequence of a leak, and it is the reason to prefer Play App Signing.

**Recommendation for Android builds: use GitHub Actions**, with Play App Signing enabled and
the signing job restricted to `main`. Build locally only if you want a faster feedback loop
while iterating.

**Target API level.** From **31 August 2026** - twenty-five days from today - new apps and
app updates must target Android 16, API level 36.[^play-target-api] If you begin a
submission near that date, make sure the build targets 36 from the outset rather than
discovering it at upload.

### 13.2 iOS

**Definitively: you do not need to own a Mac, but you do need to rent one, and you cannot
avoid paying Apple.**

To build and submit an iOS app you need Xcode, which runs only on macOS. There is no
supported way to compile an iOS application on Windows. What exists is a set of services that
run the compile step on Mac hardware they own:

- **Expo EAS Build.** Expo's own documentation states that iOS builds run on macOS runners in
  Expo's cloud, and that EAS Submit works from Windows and Linux, so no Mac is needed to ship
  iOS builds.[^eas-intro][^eas-submit] EAS also generates and stores the signing certificate
  and provisioning profile for you, which is historically the hardest part of iOS without a
  Mac. A third-party summary puts the free tier at fifteen iOS builds a month with a
  forty-five minute timeout and low queue priority; I could not verify that figure against
  Expo's own pricing page.[^no-mac]
- **Codemagic**, **GitHub Actions macOS runners**, and hourly cloud Mac rental are the other
  routes. Reported figures are around 500 free macOS minutes a month on Codemagic, roughly
  200 usable free macOS minutes a month on GitHub Actions, and from about EUR 2.64 for
  twenty-four hours of a rented Mac.[^no-mac] These are third-party figures I could not
  verify against each vendor's own pricing page.

**What you cannot avoid: the Apple Developer Program, 99 US dollars per year**, in local
currency, renewing annually, required for App Store distribution and for code
signing.[^apple-fee] Individual enrolment requires two-factor authentication on your Apple
Account, and if you pay with a card not in your own name, Apple will ask for government
photo identification.[^apple-enroll] Unlike Google's 25 dollars, this is a recurring cost:
stop paying and your app is removed from the store.

**Why I still recommend against iOS in 2026.** Not because of hardware - that is solved. Two
other reasons:

1. **There is no TWA on iOS.** Apple has no equivalent. So the cheap, low-risk shape that
   makes Android easy does not exist. Your iOS options are B2 (six to nine days, plus high
   4.2 risk) or C (eight to fourteen weeks).
2. **Apple's Guideline 4.2 is subjective and is applied to exactly this pattern.** Apple's
   guidance and reviewer behaviour both make clear that a wrapped website is the archetypal
   4.2 rejection, and that adding push notifications alone does not
   cure it.[^apple-42-text][^apple-42-fix] You would be spending 99 dollars and one to two
   weeks for a coin flip.

If iOS becomes essential, the honest path is Option C, and it is a quarter of work, not a
sprint.

### 13.3 Store accounts

| Item                                    | Google Play                                                                                                    | Apple App Store                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Fee                                     | **25 USD, one time**[^play-fee]                                                                                | **99 USD per year**[^apple-fee]                                |
| Identity verification                   | Required. Government ID and a card in your legal name.[^play-register]                                         | Two-factor authentication; ID may be requested.[^apple-enroll] |
| Publicly visible                        | Personal accounts publish your name, address and country.[^play-register]                                      | Your name or organisation.                                     |
| Organisation account                    | Needs a D-U-N-S number; exempt from the twelve-tester rule.[^play-register]                                    | Needs a D-U-N-S number.[^apple-enroll]                         |
| **The rule that costs time, not money** | **Twelve testers, opted in for fourteen continuous days**, before you may apply for production.[^play-testing] | App Review, typically days.                                    |
| Then                                    | Apply for production access, answer questions about your testing, then app review.[^play-testing]              | Guideline 4.2 risk (§13.2).                                    |
| Device verification                     | New personal accounts must verify access to an Android device via the Play Console app.[^play-register]        | -                                                              |

**Things that cost time rather than money, ranked by how likely they are to bite:**

1. **The twelve-tester, fourteen-day closed test.** This applies to personal accounts created
   after 13 November 2023, which yours would be. Twelve people must **install and stay opted
   in**, continuously, for fourteen days. If someone opts out on day nine, the count drops.
   Paid services exist to supply testers; whether that is within the spirit of the policy is
   your call, and Google does ask questions about your testing when you apply for production
   access.[^play-testing] **Plan on three to four weeks of calendar time**, not two.
2. **Identity verification.** Days, not hours, and it can bounce for a name mismatch between
   your ID and your payment card.
3. **Android developer verification.** From **30 September 2026**, apps must be registered to
   a verified developer to install on certified devices - initially only in Brazil,
   Indonesia, Singapore and Thailand, expanding globally in 2027.[^dev-verify] Publishing
   through Google Play registers you automatically.[^dev-verify-guide] So this does not
   affect a Play-published app, but it does mean that **sideloading an unsigned-by-a-verified-developer
   APK to friends will get harder over time**. If you plan to distribute the APK directly
   rather than through Play, note that a "limited distribution" tier exists for up to twenty
   devices without identity verification.[^dev-verify-guide]

### 13.4 What needs PwC IT involvement

Based on this assessment, **most likely nothing**, and that is the point of choosing the
GitHub Actions route. The build tools are user-scope extractions or run on GitHub's servers.
Two things might still need a word, and both are network policy rather than software
installation.

If either is blocked, here is a request you can forward as written:

> **Subject: Request - allow developer toolchain downloads and GitHub Actions artefact
> download**
>
> I am building a personal software project outside of client work and need to confirm two
> things are permitted on my managed laptop.
>
> 1. **Downloading and extracting two developer archives into my own user profile**
>    (`%LOCALAPPDATA%`), with no installer and no administrator rights required:
>    - Eclipse Temurin OpenJDK 17 from `https://adoptium.net`
>    - Android command line tools from `https://developer.android.com`
>      These are extracted as ordinary zip files into a folder I own. Nothing is written
>      outside my user profile and no system settings are changed.
> 2. **Access to `github.com` and `objects.githubusercontent.com`** to download build outputs
>    produced by GitHub Actions, and to `dl.google.com` if the Android tools are fetched
>    directly.
>
> If policy prevents item 1, item 2 alone is sufficient - all compilation would happen on
> GitHub's servers and I would only download the finished file.
>
> No software is being installed for machine-wide use, no elevation is requested, and no PwC
> data is involved.

There is a third item, which is a policy question rather than an IT one, and it is worth
raising deliberately rather than discovering later: **publishing an application to a public
app store under your own name may fall under PwC's outside-business-interests or
moonlighting policy.** That is not a technical blocker and I cannot assess it, but it costs
nothing to check before you pay Google 25 dollars, and a great deal of awkwardness to
discover afterwards.

---

## 14. The plan

Phases are ordered so that each one produces something real and nothing is wasted if you
stop.

### Phase 0 - Unblock (about 1 hour of assistant work, this week)

| Task                                                                          | Who       | Effort |
| ----------------------------------------------------------------------------- | --------- | ------ |
| Confirm the three icon PNGs are tracked (`git ls-files public/icons`)         | Assistant | 5 min  |
| Add `.well-known` to the middleware matcher exclusions in `src/middleware.ts` | Assistant | 15 min |
| Verify `/.well-known/` and `/icons/icon-512.png` both return 200 after deploy | Assistant | 15 min |
| Confirm the PWA installs cleanly with a real icon on your phone               | **You**   | 10 min |

Everything here improves the PWA whether or not you continue. Do it regardless.

### Phase 1 - A real APK on your phone (about 1 day, no money, no accounts)

| Task                                                                            | Who                        | Effort  |
| ------------------------------------------------------------------------------- | -------------------------- | ------- |
| Add a GitHub Actions workflow that runs Bubblewrap and uploads APK and AAB      | Assistant                  | 2-3 hrs |
| Configure app name, colours, icons, and target API 36                           | Assistant                  | 1 hr    |
| Generate the signing key; store it as a GitHub secret; **you keep a backup**    | Assistant, **you approve** | 1 hr    |
| Commit `public/.well-known/assetlinks.json` with the key fingerprint            | Assistant                  | 30 min  |
| Add `TrustedWebActivityService` so notifications are attributed to DayFlow      | Assistant                  | 2-3 hrs |
| Download the APK from the workflow run and install it                           | **You**                    | 15 min  |
| Confirm: no browser bar, icon correct, notification arrives with the right name | **You**                    | 30 min  |

**At the end of Phase 1 you have a real Android app.** Sideloadable, shareable, signed by
you, with working reminders. Total spend: zero. If you stop here, you have most of what you
asked for.

One instruction that matters more than anything else in this document: **keep an offline
copy of the signing keystore and its password somewhere you will still have in five years.**
Lose it and you can never update the app; anyone who installed it must uninstall and
reinstall a differently-identified app.

### Phase 2 - Fix the defects (do this before Phase 3)

Settings not saving, insights generation failing, no mobile navigation, and the 731-day
streak. Scoped elsewhere. Mobile navigation is the one that matters most here, because a
reviewer will open your app on a phone.

While you are here, consider adding a branded offline fallback page to `public/sw.js`. It is
half a day, it removes the Chrome offline page from your app, and Google reviewers
specifically look for it.[^play-quality]

### Phase 3 - Google Play (3-4 weeks of calendar time, 25 US dollars)

| Task                                                                        | Who                               | Effort                     |
| --------------------------------------------------------------------------- | --------------------------------- | -------------------------- |
| Check the PwC outside-interests policy question (§13.4)                     | **You**                           | Ask, then wait             |
| Create the Play Console account, pay 25 USD, complete identity verification | **You**                           | 1 hr, then days of waiting |
| Verify Android device access via the Play Console mobile app                | **You**                           | 15 min                     |
| Prepare listing: description, screenshots, feature graphic                  | Assistant drafts, **you approve** | 3-4 hrs                    |
| Privacy policy at a public URL, linked in-app and in the listing            | Assistant drafts                  | 2 hrs                      |
| Data safety declarations and content rating                                 | Assistant drafts, **you submit**  | 2 hrs                      |
| Enable Play App Signing; add Google's fingerprint to `assetlinks.json`      | Assistant                         | 1 hr                       |
| Upload the AAB to a closed test                                             | **You**                           | 30 min                     |
| **Recruit twelve testers and keep them opted in for fourteen days**         | **You**                           | **The hard part**          |
| Apply for production access, answer the testing questions                   | **You**                           | 30 min, then ~7 days       |
| Final app review                                                            | -                                 | Days                       |

The tester recruitment is not a technical task and no assistant can do it. Start thinking
about who those twelve people are before you pay the 25 dollars, not after.

### Phase 4 - reassess, do not pre-commit

Revisit only with evidence from Phases 1-3.

- **If Android usage is real and people ask for iPhone:** scope Option C for iOS. Not before.
- **If Digital Wellbeing turns out to be the differentiating feature:** it needs native
  Android code and a Play permissions declaration. Scope it on its own merits (§11).
- **If nobody installs it:** you have learned that cheaply, which was the point of doing
  Phase 1 for nothing.

---

## 15. Possible today, needs money, needs hardware, needs permission

**Possible today, with no money and no permission:**

- Fixing the icons and the middleware matcher.
- Building a signed APK in GitHub Actions.
- Installing it on your own phone and sharing the file directly.
- App-attributed push notifications.
- Everything syncing with the web version - already true.

**Needs money:**

- Google Play: 25 US dollars, once.[^play-fee]
- Apple App Store: 99 US dollars per year, forever.[^apple-fee]
- iOS cloud build minutes beyond free tiers - low tens of dollars a month at most.

**Needs hardware you do not have:**

- Nothing, strictly. iOS builds need macOS, but rented macOS in the cloud is a complete
  substitute and Expo's documentation confirms the whole flow works from
  Windows.[^eas-intro][^eas-submit]
- You do need an Android phone to test on. You have one.

**Needs someone's permission:**

- **Google:** production access after the twelve-tester closed test.[^play-testing]
- **Apple:** App Review, with real Guideline 4.2 risk for any wrapper.[^apple-42-text]
- **Google, separately:** a permissions declaration if you ever pursue Digital
  Wellbeing.[^play-permissions]
- **PwC IT:** possibly nothing (§13.4). Worth one email before you start.
- **PwC policy:** the outside-business-interests question, which is not IT's to answer.

**Needs time and cannot be bought:**

- Twelve testers, fourteen continuous days.[^play-testing]

---

## 16. What I could not verify

Stated plainly, so nothing here is mistaken for a checked fact.

1. **Whether the live icons actually 200.** An earlier draft concluded they 404'd because
   a workspace glob found no PNGs; that was OneDrive dehydrating binaries, not missing
   files. `git ls-files public` lists all three. Confirm in ten seconds by opening
   `https://dayflow-ai-six.vercel.app/icons/icon-512.png` in a browser.
2. **Whether the GitHub repository is public or private.** This changes the free GitHub
   Actions minute allowance. I was asked not to run git commands.
3. **Exact cloud-build free tiers and per-minute prices** for Expo EAS, Codemagic, GitHub
   Actions macOS runners and cloud Mac rental. The figures in §13.2 come from a single
   third-party comparison, not from each vendor's own pricing page.[^no-mac] Treat them as
   indicative.
4. **Any current explicit Google statement endorsing or discouraging TWAs.** I found no
   policy against them and Google continues to publish the tooling and
   documentation.[^twa-quickstart] That is strong evidence, not a guarantee.
5. **How aggressively Apple currently applies Guideline 4.2 to Capacitor apps loading a
   remote URL.** The guideline text and Capacitor maintainers' own warnings are cited, but
   outcomes vary by reviewer and cannot be predicted.
6. **Whether Google requires a permissions declaration specifically for
   `PACKAGE_USAGE_STATS`.** Google's documentation names SMS and Call Log as its examples and
   says "high-risk or sensitive permissions" generally.[^play-permissions] Usage access is
   restricted, but I could not find it named explicitly in a current policy page.
7. **The four open defects.** Taken as given from the brief; not reproduced against the live
   site.
8. **Whether Bubblewrap runs cleanly under this specific corporate laptop's policies.** The
   documentation confirms no elevation is needed for the toolchain[^bubblewrap-readme]; only
   an actual attempt confirms the endpoint protection software agrees. The GitHub Actions
   route in §13.1 makes this moot.

---

## Sources

All URLs checked on **6 August 2026** unless stated otherwise.

[^play-testing]: Google, "App testing requirements for new personal developer accounts", Play Console Help. Personal accounts created after 13 November 2023 must run a closed test with at least 12 testers opted in for the last 14 continuous days before applying for production access. https://support.google.com/googleplay/android-developer/answer/14151465

[^play-fee]: Google, "Get started with Play Console", Play Console Help. One-time US$25 registration fee. https://support.google.com/googleplay/android-developer/answer/6112435

[^play-register]: Google, "Get started with Play Console", Play Console Help. Identity verification, government ID and payment card in your legal name, and Android device verification for new personal accounts. https://support.google.com/googleplay/android-developer/answer/6112435

[^play-target-api]: Google, "Meet Google Play's target API level requirement", Android Developers. From 31 August 2026, new apps and updates must target Android 16 (API level 36) or higher. https://developer.android.com/google/play/requirements/target-sdk

[^play-spam]: Google, "Spam", Play Console Help. The Webviews and Affiliate Spam policy and the Repetitive Content policy. https://support.google.com/googleplay/android-developer/answer/9899034

[^play-quality]: Google, "Ensuring app quality", Play Console Help. Minimum functionality requires a stable, engaging, responsive user experience. https://support.google.com/googleplay/android-developer/answer/13965279

[^play-permissions]: Google, "Prepare your app for review", Play Console Help. High-risk or sensitive permissions may require the Permissions Declaration Form and approval. https://support.google.com/googleplay/android-developer/answer/9859455

[^twa-quickstart]: Google, "Quick start to Trusted Web Activities", Chrome for Developers. TWA setup, Bubblewrap, Digital Asset Links, and the distinction between upload and Play signing keys. https://developer.chrome.com/docs/android/trusted-web-activity/quick-start

[^twa-service]: Android Developers, `TrustedWebActivityService` reference. Notification delegation makes notifications attributable to the client app and managed by its own notification permissions rather than the browser's. https://developer.android.com/reference/androidx/browser/trusted/TrustedWebActivityService

[^bubblewrap-readme]: GoogleChromeLabs, Bubblewrap CLI README. Node 14.15.0+, JDK 17 exactly, Android command line tools extracted into their own folder, no spaces in the SDK path. https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md

[^dal]: Android Developers, "Configure website associations", and Google, "Creating a Statement List". The file must be at `https://domain/.well-known/assetlinks.json`, served with `Content-Type: application/json`, over HTTPS, with an HTTP 200 and no redirects. https://developer.android.com/training/app-links/configure-assetlinks and https://developers.google.com/digital-asset-links/v1/create-statement

[^dev-verify]: Google, "Android developer verification timeline", Android Developer Console Help. Enforcement from September 2026 in Brazil, Indonesia, Singapore and Thailand; global rollout in 2027. https://support.google.com/android-developer-console/answer/16650243

[^dev-verify-guide]: Android Developers, "Android developer verification". Publishing through Google Play registers you automatically; a limited-distribution tier allows up to 20 devices without identity verification; sideloading of unregistered apps remains possible via an advanced flow. https://developer.android.com/developer-verification/guides

[^next-export]: Next.js documentation, "How to create a static export of your Next.js application" (version 16.3.0, last updated 21 July 2026). Unsupported: middleware/proxy, cookies, redirects, rewrites, headers, server actions, dynamic routes without `generateStaticParams`, and route handlers that rely on the request. https://nextjs.org/docs/app/guides/static-exports

[^cap-serverurl]: ionic-team/capacitor, Discussion #5075, "Why is `server.url` not intended for use in production?" Quotes Capacitor's own type definition: "This is not intended for use in production." Also records the service-worker/bridge-injection problem on Android. https://github.com/ionic-team/capacitor/discussions/5075

[^cap-pr]: ionic-team/capacitor, PR #6762. Maintainer `jcesarmobile`, 22 January 2024: `server.url` "is still not recommended for production apps [...] the recommended is to ship the app assets inside it and not rely in a remote server that could lead to app rejections." https://github.com/ionic-team/capacitor/pull/6762

[^cap-forum]: Ionic Forum, "Apple App Store approval issue with this?" Ionic team member `max`: "Apple will likely reject your app since it is not 'self-contained.' We do not recommend using the server url option for production apps." https://forum.ionicframework.com/t/apple-app-store-approval-issue-with-this/199417

[^cap-remote-blog]: Capawesome, "The right way to update your Capacitor app remotely". Discusses `server.url` as a grey area under Apple's Guideline 4.7, and the absence of offline support, code signing and native version targeting. https://capawesome.io/blog/the-right-way-to-update-your-capacitor-app-remotely/

[^apple-42-text]: Apple, App Store Review Guidelines, Guideline 4.2 Minimum Functionality: "Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store." https://developer.apple.com/app-store/review/guidelines/#minimum-functionality

[^apple-42-fix]: PTKD Journal, "How to Fix Guideline 4.2 (Design: Minimum Functionality)". Summarises Apple's position that adding push notifications or Core Location to an otherwise thin app does not satisfy 4.2. https://ptkd.com/journal/fix-app-store-guideline-4-2-minimum-functionality

[^apple-fee]: Apple, "Apple Developer Program". US$99 annual membership, in local currency where available; Enterprise Program US$299 per year. https://developer.apple.com/programs/

[^apple-enroll]: Apple, "Enrollment - Membership - Account". Apple Account with two-factor authentication, legal age of majority, government photo ID if the payment card is not in your name, D-U-N-S number for organisations, fee waivers for nonprofits and accredited educational institutions. https://developer.apple.com/help/account/membership/program-enrollment

[^eas-intro]: Expo, "EAS Build" documentation (last modified 22 July 2026). "Android builds run on Linux runners hosted in Google Cloud Platform, and iOS builds run on macOS runners hosted in Expo's macOS cloud." https://docs.expo.dev/build/introduction/

[^eas-submit]: Expo, "Submit to app stores". EAS Submit "works from any OS (including Windows and Linux for iOS)". https://docs.expo.dev/deploy/submit-to-app-stores/

[^no-mac]: Choicely, "How to Publish an iOS App Without a Mac (2026)". Comparison of Expo EAS, Codemagic, GitHub Actions macOS runners, cloud Mac rental and Xcode Cloud, with free tiers and per-minute prices. Third-party figures, not verified against each vendor's own pricing page. https://www.choicely.com/blog/publish-ios-app-without-a-mac

[^ios-push]: web-push-notifications.com, "Safari & iOS Web Push Integration Guide". On iOS the site must be installed to the Home Screen before a subscription can exist; a Safari tab cannot subscribe; `Notification.requestPermission()` must run inside a real user gesture; there is no `beforeinstallprompt` on WebKit and no API to trigger the Share sheet. https://www.web-push-notifications.com/core-protocols-browser-implementation/safari-ios-web-push-integration/

[^ios-push-matrix]: web-push-notifications.com, "Web Push Browser Compatibility Reference Matrix". Safari ignores `requireInteraction`, `silent`, `image` and `actions`; silent push is unavailable; iOS support begins at Safari 16.4 / iOS 16.4. https://www.web-push-notifications.com/core-protocols-browser-implementation/browser-compatibility-reference/

[^ios-limits]: MagicBell, "PWA iOS Limitations and Safari Support [2026]". Push works on iOS 16.4+ outside the EU; PWA features including push and standalone mode are unavailable to EU users on iOS 17.4+; service workers are subject to eviction; background tasks do not run. https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide

[^usage-stats]: Android Developers, `UsageStatsManager` reference. "Declaring the permission implies intention to use the API and the user of the device still needs to grant permission through the Settings application." https://developer.android.com/reference/kotlin/android/app/usage/UsageStatsManager

---

## Change History

| Version | Date       | Author  | Change                                                                                                                     |
| ------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-08-06 | Founder | Initial draft. Assesses TWA, Capacitor, React Native and staying a PWA; recommends an Android TWA built in GitHub Actions. |
