# App Privacy, age rating, export compliance

Answers for the questionnaires in App Store Connect. They describe the **iOS app as it is on
`master` at wave 4 (30 Sep 2026)**: no third-party analytics or crash SDK in the binary; a small
pure-JS usage-analytics transport that is **switched off in every build until a PostHog key is
configured** (see "Usage analytics" below); a
health-information consent (wave 3) and an AI data consent; and AI features that run only after
the user gives consent.

> **Re-check this page when anything below changes.** Configuring a PostHog key for the mobile
> app, adding Sentry to it, adding ads, adding Sign in with Google/Apple, or adding payments each
> changes the answers.

---

## App Privacy (App Store Connect → App Privacy)

**Privacy policy URL:** `https://chefer.duckdns.org/privacy`

**"Do you or your third-party partners collect data from this app?"** Yes.

For **every** data type below, answer:

- **Linked to the user's identity:** Yes (everything is stored against the account)
- **Used for tracking:** No (no ads, no data brokers, no cross-app tracking)
- **Purpose:** App Functionality, plus Product Personalization where marked

| Category         | Data type          | Purposes                                   | What it is in Chefer                                                                                                  |
| ---------------- | ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Contact Info     | Name               | App Functionality                          | Display name at sign-up                                                                                               |
| Contact Info     | Email Address      | App Functionality                          | Login and password-reset email                                                                                        |
| Health & Fitness | Health             | App Functionality, Product Personalization | Biological sex, age, height, body weight log, allergies and dietary restrictions, calorie/macro targets, logged meals |
| Health & Fitness | Fitness            | App Functionality, Product Personalization | Workouts, sets, reps, weights, routines, training goals                                                               |
| User Content     | Photos or Videos   | App Functionality                          | Meal photos for Snap-to-Log, recipe photos. Only photos the user picks or takes                                       |
| User Content     | Customer Support   | App Functionality                          | "Send feedback" messages                                                                                              |
| User Content     | Other User Content | App Functionality, Product Personalization | Recipes, imported recipe text/links, chat messages with the AI chef, pantry items, household member profiles          |
| Identifiers      | User ID            | App Functionality                          | Account ID and session token                                                                                          |

**Do not declare:** Location, Contacts, Financial Info, Purchases, Browsing/Search History,
Device ID, Usage Data, Diagnostics, Sensitive Info, Audio.

- **Usage Data / Diagnostics:** today, **do not declare either** (see the next section for why
  and for the exact change the day a key is configured). The web app uses PostHog and Sentry,
  but the iOS app ships neither SDK. When mobile Sentry lands (plan task M1-6), add
  _Diagnostics → Crash Data + Performance Data (App Functionality, not linked)_.
- **Health information consent (wave 3, UX-26):** the Health row above is unchanged (same data
  types, same purposes, still linked, not tracking). What changed is that the app now asks for
  the user's permission before storing any of it (a consent sheet on the first allergy, diet,
  goal, measurement or weigh-in save; separate from the AI consent) and Profile → Privacy & data
  → "Health information" lets the user withdraw it, which deletes that data. No change to the
  App Store Connect answers is required. Copy and legal ground are pending counsel review
  (tracked in [release-1-checklist.md](../release-1-checklist.md)).
- **Sensitive Info:** Chefer has no halal/kosher or similar options that would reveal religion,
  so nothing to declare. Revisit if such diet options are added.
- **Third-party AI (Groq, with Cloudflare Workers AI as the fallback):** Apple's label has no
  separate AI row. Data sent to these providers is covered by the rows above ("collected … by
  you or your third-party partners"). The in-app consent sheet and the privacy policy name
  Groq and Cloudflare Workers AI, as Guideline 5.1.2(i) requires. Background jobs send nothing
  for users who haven't consented: the weekly auto-plan skips them, and the weekly coach review
  uses fixed template wording instead of AI text.
- **Provider config (checked 28 Sep 2026):** production runs `AI_FREE_ONLY=true`, which routes
  every AI workload `groq > cloudflare` (Groq primary, Cloudflare Workers AI as the automatic
  fallback when Groq is unavailable) — **Gemini is not used in production**, even though the
  codebase still supports it as a provider option (`GEMINI_API_KEY`/`AI_PROVIDER=gemini`) for
  non-production use. If production config changes back to Gemini, update this section, the
  in-app consent copy and the privacy policy together.
- **YouTube embeds** on exercise detail screens load YouTube's own web player; this is covered
  by YouTube's own privacy terms, and Chefer does not receive that data.

### Usage analytics (mobile JS transport, T-12 / T-39.6)

Verified from code on `master` (wave 4):

| Question                              | Answer from the code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is it?                           | `apps/mobile/src/lib/analytics-transport.ts`: an in-memory queue and `fetch` to `https://eu.i.posthog.com/batch/` every 30 s and when the app goes to the background. No PostHog SDK, no native module, no advertising id, no ATT prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Does it send anything in a build?     | **Only if `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` are both set at bundle time.** Unset = `enabled` is false, `enqueue` stores nothing and `fetch` is never called (unit test `no key configured…` in `apps/mobile/tests/unit/analytics.test.ts`). The host must be exactly `eu.i.posthog.com` or the app fails at startup.                                                                                                                                                                                                                                                                                                                                                                                        |
| Are the variables set for production? | **No, not in anything the repository controls.** `apps/mobile/eas.json` → `build.production.env` sets only `APP_VARIANT` and `EXPO_PUBLIC_API_URL`; `apps/mobile/scripts/common.sh` (`use_production`) sets only `APP_VARIANT`, `EXPO_PUBLIC_API_URL`, `NODE_ENV`; the `mobile-update` job in `.github/workflows/deploy.yml` sets only `EXPO_TOKEN` and `EXPO_APPLE_TEAM_ID`. The owner's local `apps/mobile/.env` (sourced by the build scripts) has no PostHog variable on this machine (checked 30 Sep 2026, names only). **Owner must also confirm the EAS server-side environment variables** (expo.dev → project → Environment variables, or `eas env:list production`), which `eas build` injects and this repo cannot see. |
| Opt-in or opt-out?                    | **Opt-out for anonymous counts, opt-in for linking.** Defaults are `anonymous: true`, `linked: false` (Q-8 default in `src/lib/analytics.ts`). Profile → Privacy & data → "Usage analytics" (**shown only in builds where the transport is enabled**, i.e. never in the App Store build, which has no PostHog key; App Review R-08) has two switches: "Send anonymous usage counts" (on by default) and "Link usage to my account" (off by default, disabled while the first is off). Turning the first off stops every network call at once (AC3) and turns linking off. Sign-out resets linking to off. Each change is also logged server-side (`privacy.recordAnalyticsConsent`, shown in Consent history).                     |
| Distinct id                           | Unlinked: a random UUID created in memory at every cold start and never stored, so it is not a persistent device or user identifier. Linked: the account id (never name or email). **Known gap:** `setCurrentUserId()` is never called from the app (only defined in `analytics.ts`), so today even "Link usage to my account" still sends the random session id. Linking is therefore inert until that call is wired.                                                                                                                                                                                                                                                                                                             |
| Properties sent                       | Only the typed `EventMap` (`packages/types/src/analytics-events.ts`) and the gym event map: counts, booleans and string-literal enums. A unit test fails if any event declares a free-text `string`, so no allergy, diet, weight, food name or message can be sent. No app version, OS, screen size or IP is added by the app; PostHog itself sees the request IP (see the PostHog project setting in the release checklist).                                                                                                                                                                                                                                                                                                      |

**Answers for the build as it ships today (no key configured):** as in the table above. Do **not**
declare Usage Data. Nothing is collected, so a "Yes" would be an over-declaration, and the
privacy policy says the same.

**R-08 (2026-10-01 review simulation):** the "Usage analytics" card in Profile → Privacy & data is
hidden while no PostHog key is configured, so a reviewer never sees an "on by default" analytics switch
next to an App Privacy label that declares no Usage Data. The card (and the policy's "In the app" text)
only apply once a key is configured; do the Usage Data change below in the same release that adds it.
Confirm `eas env:list production` has no `EXPO_PUBLIC_POSTHOG_*` before every submission.

**The change to make the day a PostHog key is configured for a mobile build** (do it before the
build that carries the key is submitted, and re-check on every later build):

1. App Store Connect → App Privacy → Edit → Data Types → **Usage Data → Product Interaction** →
   tick it.
2. Purposes: **Analytics** only.
3. **Linked to the user's identity:**
   - **No** while `setCurrentUserId()` is not wired (every event carries a random per-launch id).
   - **Yes** the day it is wired, because "Link usage to my account" then ties events to the
     account id when the user opts in (Apple counts optional linking as linked).
4. **Used for tracking:** **No** (no ads, no data brokers, no combining with third-party data).
5. Leave Device ID, Advertising Data, Diagnostics and Other Usage Data unticked.
6. Update the privacy policy's "In the app" paragraph (already written to cover both states; see
   `apps/web/src/app/privacy/page.tsx`) and [android/data-safety.md](../android/data-safety.md).

### Native modules added since 1.0.0 (5): no data collection

- `expo-image-manipulator` (on-device photo resize, #65, already in 1.0.0 (5)): resizes a photo
  the user picked, on the phone. Collects and sends nothing.
- `expo-sharing` (wave 4 native release): opens the system share sheet for the data-export JSON
  and the gym CSV as a named file (Android). Collects and sends nothing; the file goes only where
  the user sends it.
- Neither changes any answer on this page.

---

## Age rating

App Store Connect → App Information → Age Rating → Edit. Apple's questionnaire changed in 2025;
answer each question from the facts below. The calculated rating will probably be **4+ or 9+**;
**do not accept it. Use the age-rating override (App Store Connect → Age Rating → "Override age
rating") to set it to 16+** (R-13 of the [2026-10-01 review simulation](./app-review-simulation-2026-10-01.md)).
Why: sign-up requires "I'm 16 or older", the Terms say you must be 16 or over, and the privacy policy says
16+. A 4+/9+ store rating beside a 16+ sign-up gate is a mismatch a reviewer can point at. If the
questionnaire itself calculates something higher than 16+, stop and check which answer caused it.

| Topic in the questionnaire                          | Answer            | Why                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violence, horror, sexual content, nudity, profanity | None              |                                                                                                                                                                                                                                                                                                 |
| Alcohol, tobacco or drug use or references          | None / Infrequent | Recipes can mention wine or beer as an ingredient. Choose **Infrequent** if asked about references                                                                                                                                                                                              |
| Simulated gambling, contests, loot boxes            | None / No         |                                                                                                                                                                                                                                                                                                 |
| Medical or treatment information                    | Infrequent        | Calorie/macro targets and allergy handling; the app gives no diagnosis or treatment                                                                                                                                                                                                             |
| Health or wellness topics                           | Yes               | Nutrition, body weight, strength training                                                                                                                                                                                                                                                       |
| Unrestricted web access                             | No                | Recipe import fetches one URL server-side. The two in-app web views are locked to their content (the YouTube video player, and the Terms/Privacy pages on our own site); every other link opens in Safari. Fixed in this release (R-01), so re-test it on the TestFlight build before answering |
| User-generated content shared with other users      | No                | Recipes, chat and household data stay private to the account                                                                                                                                                                                                                                    |
| Messaging / chat with other users                   | No                | The AI chef chat is one-to-one with an AI, not with people                                                                                                                                                                                                                                      |
| AI-generated content / chatbot (if asked)           | Yes               | Meal plans, recipe adaptations and chat replies are AI-generated                                                                                                                                                                                                                                |
| Advertising                                         | No                |                                                                                                                                                                                                                                                                                                 |
| Age assurance / parental controls                   | No                |                                                                                                                                                                                                                                                                                                 |
| Made for Kids                                       | No                |                                                                                                                                                                                                                                                                                                 |

---

## Export compliance (encryption)

The app uses only HTTPS and the standard encryption built into iOS, which is exempt.
`ios.config.usesNonExemptEncryption: false` in `app.config.js` writes
`ITSAppUsesNonExemptEncryption = NO` into the build, so App Store Connect stops asking about
encryption for each build. If it still asks, answer: **"None of the algorithms mentioned above"**
(standard encryption only) → no documentation needed. No French declaration needed.

---

## Pricing & availability

- **Price:** Free (Tier 0). No in-app purchases.
- **Availability:** all countries, or start with just the ones you can support.
  - **EU (decided 26 Sep 2026): available, and the seller declares trader status.** Your
    friend declares it once in App Store Connect → Business (only the Account Holder can).
    Under the Digital Services Act, a trader's address, phone and email are shown on the EU App
    Store page. For the email, use the Chefer support address (`cheferapp.help@gmail.com`) rather than a personal one; it
    must be verified in App Store Connect. Until Apple verifies the trader details, the app can't
    be published in EU storefronts.
- **App Store Connect → Pricing and Availability → "Make this app available on Apple
  Silicon Macs / Vision Pro":** turn these **off** unless you have tested there.

---

## Paid features: keep it that way until In-App Purchase exists

Premium is a free toggle ("Turn on Premium", under an "INCLUDED" note: "Premium is included at no cost."). The
in-app copy deliberately says nothing about a future price, a card or any other payment method (R-04 of the
2026-10-01 review simulation). That's fine for review. **When
real payments arrive (P2-1 Stripe), digital features sold inside the iOS app must go through
Apple In-App Purchase** (Guideline 3.1.1). A Stripe checkout or a link to one in the iOS app
will be rejected (US storefront link-out rules differ, but don't count on them).

---

## At Following launch (draft: do not apply to the 1.0.1 submission)

**Everything above still describes the build that is being submitted now (1.0.1). Do not change any
answer above for that submission.** This section is what changes the day Following is switched on for
everyone (`friends` in `FEATURE_FLAGS`; plan §14 steps 5 and 6). Following ships over the air, so it
can reach installed apps before a new binary is reviewed. Do the App Store Connect edits below
**before** flipping the flag if App Store Connect lets you edit them without a new version, and
otherwise with the next submission. See "Order" at the end. Sources: [`docs/friends/prd.md`](../../friends/prd.md)
§9, §14 and [`docs/friends/legal-drafts.md`](../../friends/legal-drafts.md). Counsel review pending.

### Age rating at launch

Only one answer changes:

| Topic in the questionnaire                     | Today | **At Following launch** | Why                                                                                                                                                                              |
| ---------------------------------------------- | ----- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-generated content shared with other users | No    | **Yes**                 | A user's first and last name, recipes (including imported ones, with a source link), meal plan and workouts become visible to the people who follow them and to others in search |

All other rows stay as above, with these notes for the questions Apple may ask next:

- **Messaging / chat with other users: still No.** Following has no messages, comments, reactions or
  feed (PRD §3.2).
- **Unrestricted web access: still No.** A shared recipe can show the website it was imported from
  (`Source: {domain}`) and the link opens in the phone's browser through the system, not in an in-app
  web view. The link is user-supplied, so reporting a recipe covers it (PRD FR-17.1).
- **Expect the calculated rating to rise.** "Yes" to user-generated content usually raises the
  result. Accept what the questionnaire calculates, and confirm it is not above 16+, which is the age
  the Terms already require. Run the same answers through the Play IARC questionnaire
  ([android/data-safety.md](../android/data-safety.md#at-following-launch-draft)).
- If a question asks whether the app has features for **reporting or blocking** users, answer Yes (see
  the 1.2 mapping below).

### App Privacy at launch

**Result: no new data type is needed.** Checked against Apple's list of data types, row by row. The
labels do not ask whether other users of the same app can see your data, so the _types_ stay the same,
and the Chefer privacy policy (updated at launch) is what says who can see what.

| What Following adds                                                            | Apple data type that already covers it                                                                                                   | Change to the answer                                                                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First and last name shown to other users, editable when Following is turned on | Contact Info → **Name** (declared)                                                                                                       | None. Add "also shown to other users if Following is on" to the "What it is" cell. Purpose stays App Functionality.                                         |
| Recipes (written and imported) shown to followers, with the source link        | User Content → **Other User Content** (declared)                                                                                         | None. Extend the cell: "...and recipes shared with followers".                                                                                              |
| Meal plan with calories and macros, workouts and routine shown to followers    | Health & Fitness → **Health**, **Fitness** (declared)                                                                                    | None. Same data, now also visible to followers who the user approved (or anyone, if Public). Still linked, not used for tracking.                           |
| Follows, follow requests, blocks, suggestion dismissals, Activity items        | User Content → **Other User Content** (no social-graph type exists; the Contacts type is for the address book, which Chefer never reads) | None. Add "who they follow and block" to the cell. Product Personalization is already ticked (the "Suggested for you" list uses follows).                   |
| Reports filed and the moderation log                                           | User Content → **Other User Content**                                                                                                    | None. Purpose: App Functionality (safety).                                                                                                                  |
| Name searches typed in the search box                                          | _Search History_ (**do not declare**)                                                                                                    | None. Queries are used only to return results and are never logged or sent to analytics (PRD §10), so they are not retained data. Re-check if that changes. |
| "Invite someone"                                                               | none                                                                                                                                     | None. It opens the system share sheet with a fixed text. Chefer sends and stores nothing. No Contacts permission, no contact import.                        |
| Avatar                                                                         | none                                                                                                                                     | None. Avatars are initials on a colour. There is no photo upload, so **Photos or Videos** is unchanged.                                                     |

Still **not** declared: Contacts, Location, Search History, Usage Data and Diagnostics (rules above
unchanged), Identifiers other than User ID, Financial Info. **Linked to the user's identity: Yes. Used
for tracking: No** for every row, unchanged. The analytics events for Following hold counts and fixed
labels only (PRD §15), so the "Usage analytics" section above is not affected.

Privacy policy URL: unchanged (`https://chefer.duckdns.org/privacy`). The updated policy must be live
first (draft: [legal-drafts.md](../../friends/legal-drafts.md) §3).

### Guideline 1.2 (user-generated content): how Chefer meets each requirement

Chefer has **no human moderation queue**, by the owner's decision (Q-F-13). The answer to App Review
is that every response is automatic and immediate, and that "timely" is met by the instant block and
hide for the reporter plus the automatic threshold hide for everyone else (PRD §9.6).

| 1.2 requirement                                                | What Chefer does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Where the reviewer finds it                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A method for filtering objectionable material                  | A bundled English and Romanian word list is checked on display names and on the name and description of shared recipes, whole-word and accent-insensitive. A match is refused with a message. Content reported by several people is also hidden automatically (below).                                                                                                                                                                                                                                                                                                            | Turn on Following and try a blocked word as a name, or as a recipe name on a shared recipe.                                |
| A mechanism to report offensive content, with timely responses | One tap on a reason (five reasons: offensive name or recipe, spam or fake account, harassment, unsafe or harmful content, something else). **Reporting also blocks at once**, so the reporter stops seeing that person and their recipes immediately. A recipe reported by 3 different accounts is **hidden for everyone** automatically. An account reported by 5 different accounts is **forced private and removed from search and suggestions** automatically. Reports count only from accounts older than 24 hours with a confirmed email. Every automatic action is logged. | A person's profile: the "..." menu → "Report and block". A recipe: the "..." menu → "Report recipe".                       |
| The ability to block abusive users                             | Instant and mutual: the blocked person disappears from the blocker everywhere, and any follows are removed. The blocked person is not told. Blocks are listed and can be undone.                                                                                                                                                                                                                                                                                                                                                                                                  | A person's profile or a follower's row: "..." menu → "Block". List: Following → gear → Sharing & privacy → Blocked people. |
| Published contact information                                  | `https://chefer.duckdns.org/support` (already the Support URL) and the support email in the Terms and Privacy Policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | App Store listing, Support URL.                                                                                            |

Also true and useful to say: users can turn Following off at any time (it deletes their social data),
and account deletion removes all of it.

### Demo accounts for App Review at Following launch

The accounts `carol@chefer.dev`, `dave@chefer.dev` and `kitchen@chefer.dev` (and the shared seed
passwords) **exist only in the dev database** (`pnpm db:seed`). They do not exist on production, and
their passwords are in a public repository, so **never create them on production**. The owner must create
review-visible accounts on production. Do it on the real server, in the app, with addresses you control
(an email alias is fine):

1. **Chefer Kitchen** (needed anyway for the cold start, plan §14 step 3): register an account, confirm
   its email, run `apps/api/src/scripts/create-chefer-kitchen.ts --email=<address>` on production, then
   add a few recipes, a routine and a week.
2. **"Demo Cook"** (a second, public profile): register, confirm the email, turn on Following with
   _Public_, and give it 3 recipes (at least one imported, so the `Source:` line shows), a week plan, a
   routine and one workout completed in the last 7 days. Keep every name and recipe clean, because the
   word filter applies to them as well.
3. **The review account** (the one from [review-notes.md](./review-notes.md)): turn on Following with
   _Private_, then follow Chefer Kitchen and Demo Cook. Have Demo Cook follow it back: Demo Cook sends a
   request, the review account accepts. The two then follow each other, as the PRD asks.
4. **Make Following visible to the review account.** Put its user id in `FRIENDS_ALLOWLIST`
   (`infrastructure/scripts/env.sh`), or flip the `friends` flag. If the flag is off for it, App Review
   sees no user-generated content, which contradicts the age rating.
5. **Give the reviewer a spare to report.** Reporting blocks the person, so the review account would
   lose sight of whoever it reports. Create a third throwaway public profile ("Demo Cook Two") and tell
   the reviewer in the notes to report that one. Unblocking in Blocked people restores sight.
6. Keep all demo accounts untouched during review, and keep their emails confirmed (an unconfirmed email
   makes reports from that account ineligible for the thresholds; that is harmless for the demo).

Only the review account's sign-in goes into App Store Connect. The notes block to paste is in
[review-notes.md](./review-notes.md#at-following-launch-draft).

### Order for the owner

1. **Now:** submit 1.0.1 with the answers above. Do not touch App Store Connect for Following.
2. **Before flipping `friends` for everyone** (plan §14 steps 5 and 6): counsel signs off
   [legal-drafts.md](../../friends/legal-drafts.md) and [dpia.md](../../friends/dpia.md); apply the
   legal text and the `LEGAL_VERSIONS` bump; create the demo accounts above.
3. **App Store Connect:** change the age-rating answer to Yes and paste the review notes (edit them
   now if App Store Connect allows, otherwise with the next version). The 1.2 mechanisms are all in the
   over-the-air JavaScript and the API, so the feature is compliant from the moment it is on.
4. **Then** add `friends` to `FEATURE_FLAGS` and restart the API.
5. If a reviewer ever asks why a user-content feature appeared without a new binary, the answer is the
   mapping above, and that the kill switch (`friends` off) hides the feature at once.
