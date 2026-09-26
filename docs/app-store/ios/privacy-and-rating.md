# App Privacy, age rating, export compliance

Answers for the questionnaires in App Store Connect. They describe the **iOS app as it is on
branch `feat/app-store-readiness`**: no analytics or crash SDK in the mobile app (the gym
analytics module is a no-op stub, and Sentry for mobile has not been set up yet), and AI
features run only after the user gives consent.

> **Re-check this page when anything below changes.** Adding Sentry or PostHog to the mobile
> app, adding ads, adding Sign in with Google/Apple, or adding payments each changes the answers.

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

- **Usage Data / Diagnostics:** the web app uses PostHog and Sentry, but the iOS app ships
  neither. When mobile Sentry lands (plan task M1-6), add _Diagnostics → Crash Data +
  Performance Data (App Functionality, not linked)_.
- **Sensitive Info:** Chefer has no halal/kosher or similar options that would reveal religion,
  so nothing to declare. Revisit if such diet options are added.
- **Third-party AI (Google Gemini):** Apple's label has no separate AI row. Data sent to
  Gemini is covered by the rows above ("collected … by you or your third-party partners").
  The in-app consent sheet and the privacy policy name Gemini, as Guideline 5.1.2(i) requires.
  Background jobs send nothing for users who haven't consented: the weekly auto-plan skips them, and the weekly coach review uses fixed template wording instead of AI text.
- **Backup AI provider (checked 26 Sep 2026):** production sets `AI_SECONDARY_API_KEY` with
  `api.groq.com` (model `openai/gpt-oss-120b`). When Gemini is overloaded, text-only requests
  fall back to **Groq**. The consent sheet and privacy page name Groq. If the prod key is
  removed, drop those sentences.
- **YouTube embeds** on exercise detail screens load YouTube's own web player; this is covered
  by YouTube's own privacy terms, and Chefer does not receive that data.

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
    Store page. For the email, use the Chefer support address rather than a personal one; it
    must be verified in App Store Connect. Until Apple verifies the trader details, the app can't
    be published in EU storefronts.
- **App Store Connect → Pricing and Availability → "Make this app available on Apple
  Silicon Macs / Vision Pro":** turn these **off** unless you have tested there.

---

## Paid features: keep it that way until In-App Purchase exists

Premium is currently a free toggle ("Upgrade — free for now"). That's fine for review. **When
real payments arrive (P2-1 Stripe), digital features sold inside the iOS app must go through
Apple In-App Purchase** (Guideline 3.1.1). A Stripe checkout or a link to one in the iOS app
will be rejected (US storefront link-out rules differ, but don't count on them).
