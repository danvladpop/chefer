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
| Opt-in or opt-out?                    | **Opt-out for anonymous counts, opt-in for linking.** Defaults are `anonymous: true`, `linked: false` (Q-8 default in `src/lib/analytics.ts`). Profile → Privacy & data → "Usage analytics" has two switches: "Send anonymous usage counts" (on by default) and "Link usage to my account" (off by default, disabled while the first is off). Turning the first off stops every network call at once (AC3) and turns linking off. Sign-out resets linking to off. Each change is also logged server-side (`privacy.recordAnalyticsConsent`, shown in Consent history).                                                                                                                                                             |
| Distinct id                           | Unlinked: a random UUID created in memory at every cold start and never stored, so it is not a persistent device or user identifier. Linked: the account id (never name or email). **Known gap:** `setCurrentUserId()` is never called from the app (only defined in `analytics.ts`), so today even "Link usage to my account" still sends the random session id. Linking is therefore inert until that call is wired.                                                                                                                                                                                                                                                                                                             |
| Properties sent                       | Only the typed `EventMap` (`packages/types/src/analytics-events.ts`) and the gym event map: counts, booleans and string-literal enums. A unit test fails if any event declares a free-text `string`, so no allergy, diet, weight, food name or message can be sent. No app version, OS, screen size or IP is added by the app; PostHog itself sees the request IP (see the PostHog project setting in the release checklist).                                                                                                                                                                                                                                                                                                      |

**Answers for the build as it ships today (no key configured):** as in the table above. Do **not**
declare Usage Data. Nothing is collected, so a "Yes" would be an over-declaration, and the
privacy policy says the same.

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
answer each question from the facts below and accept the rating it calculates. Expect
**4+ or 9+**. If it comes out higher, the likely cause is the medical/wellness question
(answer "Infrequent"), not a problem.

| Topic in the questionnaire                          | Answer            | Why                                                                                                          |
| --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Violence, horror, sexual content, nudity, profanity | None              |                                                                                                              |
| Alcohol, tobacco or drug use or references          | None / Infrequent | Recipes can mention wine or beer as an ingredient. Choose **Infrequent** if asked about references           |
| Simulated gambling, contests, loot boxes            | None / No         |                                                                                                              |
| Medical or treatment information                    | Infrequent        | Calorie/macro targets and allergy handling; the app gives no diagnosis or treatment                          |
| Health or wellness topics                           | Yes               | Nutrition, body weight, strength training                                                                    |
| Unrestricted web access                             | No                | Recipe import fetches one URL server-side; the only web view is an embedded YouTube player for a fixed video |
| User-generated content shared with other users      | No                | Recipes, chat and household data stay private to the account                                                 |
| Messaging / chat with other users                   | No                | The AI chef chat is one-to-one with an AI, not with people                                                   |
| AI-generated content / chatbot (if asked)           | Yes               | Meal plans, recipe adaptations and chat replies are AI-generated                                             |
| Advertising                                         | No                |                                                                                                              |
| Age assurance / parental controls                   | No                |                                                                                                              |
| Made for Kids                                       | No                |                                                                                                              |

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

Premium is currently a free toggle ("Turn on Premium", under a "FREE FOR NOW" note). That's fine for review. **When
real payments arrive (P2-1 Stripe), digital features sold inside the iOS app must go through
Apple In-App Purchase** (Guideline 3.1.1). A Stripe checkout or a link to one in the iOS app
will be rejected (US storefront link-out rules differ, but don't count on them).
