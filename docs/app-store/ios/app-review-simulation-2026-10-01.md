# Chefer iOS: simulated App Review, 1 Oct 2026

A full pass over the iOS app done the way an App Review specialist would: install a Release build, sign
up as a new user, use every main flow, deny permissions, lose the network, change system settings, and
compare what the app does with what the listing, the privacy answers and the review notes say. It also
includes a code audit of `master` against the App Store Review Guidelines.

Screenshots referenced below are in [`app-review-simulation-2026-10-01/`](./app-review-simulation-2026-10-01/).

---

## 1. Verdict

**Would it pass today?** Probably yes on a lenient reviewer, but four items are the kind that produce a
rejection or a "please clarify" message, and two of them are cheap to remove before 1.0.1 is submitted:

| # | What a reviewer would hit | Likely outcome |
|---|---|---|
| R-01 | Exercise video sheet turns into the **full YouTube website with search**, inside the app; the legal web view can browse the whole website too | Age-rating mismatch ("Unrestricted Web Access: No" is false) → rejection or forced re-rating |
| R-02 | A **13-year-old** can enter their age and get a **1,200 kcal/day weight-loss target** | Guideline 1.4.1 (physical harm) rejection, common for diet apps |
| R-03 | On **Delete account**, the first tap on "Delete my account" does nothing (it only closes the keyboard) | Reviewer may report deletion as broken → 5.1.1(v) rejection |
| R-04 | "Premium", locks, upsells and **"FREE FOR NOW … we won't ask for a card. Before it has a price…"** with no In-App Purchase | 3.1.1 / 2.1 question ("how will users pay?", "is this a placeholder?") |

Everything else is a smaller polish or process item. The core flows (sign-up, onboarding, both consent
sheets, meal plan, recipe, cook mode, shopping list, tracker, gym workout, export, account deletion) all
work, and they behave well with no network.

---

## 2. What was tested, and how

| | |
|---|---|
| Code | `master` at `2e7a8663` (version 1.0.1), in a clean worktree |
| Build | Release configuration, simulator, **ad-hoc signed** (the same JS bundle and native code as the store build; dev variant `dev.chefer.app.dev` so it could point at a local API; the dev launcher and dev menu are compiled out of Release) |
| Devices | iPhone 17 Pro Max, iOS 26.5 (main pass); iPad Air 11" (M4), iOS 26.5 (compatibility mode, launch only) |
| Backend | Local API with **mock AI** on a copy of the dev database (no real AI calls, no production writes) |
| Accounts | Two fresh throwaway accounts registered through the app, used, then **deleted through the app**; deletion confirmed in the database (0 rows left) |
| Production | Read-only checks of the public URLs a reviewer opens: `/`, `/privacy`, `/terms`, `/support`, `/api/health` all return 200 |
| Static audit | Permissions, Info.plist, privacy manifests, payments, UGC, AI consent, health, links, notifications, App Privacy answers vs code |

**Not covered** (needs the owner, see §6): the real `com.popdan.chefer` build against production, real AI
output, interaction on iPad (the automation couldn't tap inside the compatibility window), a real camera,
recipe import, Household, My weeks, and the Following screens (switched off on the server).

---

## 3. Findings

Severity: **HIGH** = likely rejection or reviewer question · **MEDIUM** = a reviewer may flag it, or it
contradicts a submitted answer · **LOW** = polish. "OTA" means the fix is JS-only and can ship as an EAS
Update; "binary" means it needs a new build.

### Summary

| ID | Sev | Guideline | Finding | How verified | Fix ships via |
|---|---|---|---|---|---|
| R-01 | HIGH | Age rating, 4.0 | In-app web views have no navigation limit: YouTube embed becomes youtube.com with search; legal view can browse the whole site | Device + live web + code | OTA |
| R-02 | HIGH | 1.4.1 | Ages 10+ accepted; a 13-year-old gets a 1,200 kcal weight-loss target | Device | API + OTA |
| R-03 | HIGH | 5.1.1(v) | "Delete my account" ignores the first tap while the keyboard is open | Device (2 of 2) | OTA |
| R-04 | HIGH | 3.1.1, 3.1.2, 2.1 | "Premium / FREE FOR NOW / Before it has a price / won't ask for a card" with no IAP; upsells across the app | Device + code | OTA (+ web) |
| R-05 | HIGH (process) | 2.3.1(a), 2.5.2 | Following (social, UGC) ships dormant in the binary, isn't in the review notes, and the docs plan to enable it over the air | Code + docs | Review notes |
| R-06 | HIGH (metadata) | 2.3.3, 2.3.7 | 7 of the 8 App Store screenshots show screens that no longer look like that | Docs | Retake |
| R-07 | MEDIUM | 5.1.1 | Generic, unused **Face ID** and **microphone** purpose strings in the shipped Info.plist | Built app's Info.plist | Binary |
| R-08 | MEDIUM | 5.1.2, App Privacy | "Send anonymous usage counts" switch is shown **on by default**, but App Privacy declares no Usage Data | Device + code | OTA |
| R-09 | MEDIUM | 2.1 | Network failures show raw developer text: `fetch failed: UnexpectedException … (at ExpoModulesCore/Promise.swift:56)` | Device | OTA |
| R-10 | MEDIUM | 5.1.2(i) | AI consent enforced only in the app, not on the server; ingredient "Fill in for me" calls AI with no consent; fallback sheet names Gemini | Code | API + OTA |
| R-11 | MEDIUM | 2.1 / 4.0 | The "Swapped to … / Undo" snackbar sits on top of the tab bar for 8 s and swallows tab taps | Device | OTA |
| R-12 | MEDIUM | 5.1.1(i), legal | Privacy policy names an individual as data controller; the App Store seller is Smooth Path Digital S.R.L | Live web | Web |
| R-13 | MEDIUM | Age rating | Sign-up requires 16+, privacy policy says 16+, planned rating is 4+/9+ | Device + docs | ASC answer |
| R-14 | LOW | 1.4.1 | Chat system prompt has no rule for very-low-calorie or eating-disorder questions; AI label only on plan cards | Code | API |
| R-15 | LOW | 2.3 | Internal strings: More footer "Chefer 1.0.1 · production · update …", Profile badge "USER" | Device | OTA |
| R-16 | LOW | 4.0 | In-workout "Watch technique" throws the user out to Safari/YouTube mid-workout | Device | OTA |
| R-17 | LOW | 4.0 | iOS offers "Save Password?" right after the account is deleted | Device | OTA |
| R-18 | LOW | 2.1 | Today says "NOTHING PLANNED" right after "Plan my first week" (stale until revisited) | Device | OTA |
| R-19 | LOW | 2.1 | Gym "Next session: Wednesday" on a Thursday although Friday is a planned training day | Device | OTA |
| R-20 | LOW | Accessibility | Larger Text: "Cook it" / "Swap" labels clipped, avatar initial disappears | Device | OTA |
| R-21 | LOW | 4.0 | Small polish: unlabeled "3" under each weekday, lowercase "back" chip, a few wrong ingredient thumbnails, "Step 1" vs "Step 2 of 5" | Device | OTA / data |
| R-22 | LOW | 2.3.10 | Support/privacy pages opened from the app say "iOS and Android app" and "Google Play" | Live web | Web |
| R-23 | LOW | Process | Upload may email ITMS-90078 (push code linked, push entitlement stripped). Warning only | Code | — |
| R-24 | LOW | 5.1.1(v) | Password reset finishes on the website; deleting needs the password | Device + code | Optional |

**Checked and ruled out** (so nobody chases them):

- **ITMS-91061, missing privacy manifests for the precompiled SDWebImage/Hermes frameworks** (raised by
  the code audit): very likely a non-issue. 1.0.0 (5) was built on the same Expo SDK 57 and was accepted
  and processed by App Store Connect. If an ITMS-91061 email ever arrives, build with precompiled modules
  off (`expo-build-properties` → `ios.usePrecompiledModules: false`).
- **"Signed out after relaunch"**: seen only on my first, *unsigned* build (no Keychain). With an ad-hoc
  signed build the session survives relaunches and server outages. Not an app bug.
- **Odd AI chef reply**: the local mock AI echoes its context by design. Not representative.
- **Currency in RON**: the simulator region was `en_RO`; a US reviewer gets USD (`packages/utils/src/locale.ts`).

---

### R-01 · HIGH · In-app web views can browse anywhere (age rating, "Unrestricted Web Access")

**What the reviewer sees.** Gym → Exercises → Back Squat → Watch technique opens a sheet with the
YouTube embed. One tap on the "Watch on YouTube" logo in the player turns the sheet into the **full
mobile YouTube site** with its header, **"Open App"** and a working **Search YouTube** field (keyboard
up, ready to search), all inside Chefer.
Screenshot: [07-youtube-browsing-inside-app.jpg](./app-review-simulation-2026-10-01/07-youtube-browsing-inside-app.jpg)

The legal screen has the same gap (verified by code and the live site). Register → "Terms" opens
`app/legal/[doc].tsx`, a WebView of the website. "← Back to Chefer" then leads to the whole web app:
landing page, `/login`, the dashboard and the web `/premium` page, which according to the code
(`apps/web/src/app/(dashboard)/premium/page.tsx:27-31`) carries a "~€66/yr" competitor price comparison
(not opened here, since it needs a web login). Links to outside sites (e.g. `dataprotection.ro`) also load inside the app.

**Why it matters.** `privacy-and-rating.md` answers **"Unrestricted web access: No"** with "the only web
view is an embedded YouTube player for a fixed video". That isn't true today. Unrestricted web access
forces the top age-rating tier, and a reviewer who finds YouTube search inside a 4+ app will reject or
re-rate. The legal web view also exposes web-only Premium/pricing pages inside the iOS app (3.1.1/3.1.3).

**Evidence.** `apps/mobile/src/features/gym/library-screens/exercise-video-sheet.tsx:59-67` and
`apps/mobile/app/legal/[doc].tsx:41`: neither sets `onShouldStartLoadWithRequest`.

**Fix (OTA).** Pin both web views to their content and send every other navigation to Safari:

```tsx
onShouldStartLoadWithRequest={(req) => {
  const allowed = req.url.startsWith(EMBED_ORIGIN) || req.url.startsWith('about:'); // video sheet
  // legal: req.url.startsWith(getWebUrl(path))
  if (!allowed) void Linking.openURL(req.url);
  return allowed;
}}
```

For YouTube, also add `&modestbranding=1&fs=0&disablekb=1` to the embed URL. Alternatively, open legal
pages with `Linking.openURL` the way Welcome and More already do.

### R-02 · HIGH · Weight-loss targets for children (1.4.1)

**What the reviewer sees.** Onboarding → Your goal: **Lose Weight** → Body metrics: Female, **age 13**,
152 cm, **44 kg** (a healthy weight), Sedentary. The app shows an **"Estimated daily calorie target:
1,200 kcal/day · 1,397 maintenance"**, then plans the week at ¾ portions to hit 1,234 kcal. Consent
history meanwhile says "Confirmed you're 16 or older".
Screenshot: [08-age-13-weight-loss-target.jpg](./app-review-simulation-2026-10-01/08-age-13-weight-loss-target.jpg)

**Why it matters.** Calorie-deficit advice for minors is a classic 1.4.1 ("could cause physical harm")
rejection for diet apps, and the app's own minimum age (16) isn't enforced where it matters.

**Evidence.** Age accepted from 10 (`apps/api/src/routers/preferences.router.ts:24`,
`apps/mobile/src/features/preferences/goal-body-card.tsx:123-124`; onboarding only checks age > 0).
The target is −500 kcal with a single 1,200 kcal floor for everyone
(`apps/api/src/application/preferences/preferences.service.ts:50-57,107`).

**Fix.**
1. Minimum age **16** on the server (`min(16)`) and in the mobile and web forms, with a friendly message.
2. No deficit goal under 18 (or show "talk to a doctor" and fall back to maintenance).
3. A sex-specific floor (about 1,500 kcal for men).
4. Add a rule to the chat prompt not to endorse very-low-calorie diets (see R-14).

### R-03 · HIGH · "Delete my account" ignores the first tap (5.1.1(v))

**What the reviewer sees.** Profile → Your data → Delete account → type the password → type DELETE →
tap the red **Delete my account**. The keyboard closes, the sheet drops down and **nothing else
happens**. A second tap deletes the account (it then signs out; the database had 0 rows left).
Reproduced on both test accounts.
Screenshots: [09-delete-first-tap-ignored.jpg](./app-review-simulation-2026-10-01/09-delete-first-tap-ignored.jpg),
[10-delete-first-tap-ignored-repro.jpg](./app-review-simulation-2026-10-01/10-delete-first-tap-ignored-repro.jpg)

**Why it matters.** Account deletion is checked on almost every review of an app with sign-up. A
reviewer who taps once, sees the sheet still there and the account still working, writes
"the Delete account button doesn't work" → 5.1.1(v).

**Evidence.** `apps/mobile/src/features/profile/account-data-card.tsx:83-142`: the confirm button is in
the `Sheet` footer, outside the scroll view that has `keyboardShouldPersistTaps="handled"`
(`packages/ui-mobile/src/components/sheet.tsx:262-273`). When the keyboard hides, the
`KeyboardAvoidingView` moves the footer under the finger and the press is lost.

**Fix (OTA).** Make footer buttons survive keyboard dismissal for every `Sheet`, e.g. render the footer
inside the `ScrollView` (or wrap it in one with `keyboardShouldPersistTaps="handled"`), or dismiss the
keyboard on "Done"/return of the DELETE field (`returnKeyType="done"`, `onSubmitEditing={Keyboard.dismiss}`).
Re-test: one tap must delete. The same pattern probably affects other sheets with inputs and a footer
button (quick-add, custom ingredient).

### R-04 · HIGH · "Premium" tier with no purchase (3.1.1, 3.1.2, 2.1)

**What the reviewer sees.** As a free user, locks and upsells across the app: Today's "Snap to log —
See what Premium adds", the shopping list's yellow banner after ticking any item ("premium plans cook
from them … Plan my week around these"), Profile "Your plan: Free". The sheet reads **"FREE FOR NOW.
Premium costs nothing for now, and we won't ask for a card. Before it has a price, we'll tell you in the
app at least 30 days ahead…"** and **Turn on Premium** flips the account with no payment.
Screenshots: [05-premium-sheet-free-for-now.jpg](./app-review-simulation-2026-10-01/05-premium-sheet-free-for-now.jpg),
[06-premium-upsell-after-tick.jpg](./app-review-simulation-2026-10-01/06-premium-upsell-after-tick.jpg)

**Why it matters.** It announces a future paid tier that isn't In-App Purchase, and "we won't ask for a
card" implies the payment will be by card. Typical responses: "Your app includes references to a
future paid feature without IAP" (3.1.1) or "features appear locked/unfinished" (2.1). The review notes
explain it, which helps, but the copy still invites the question.

**Evidence.** `packages/utils/src/premium-pitch.ts:38-41,55`; `apps/api/src/routers/user.router.ts:223-229`.

**Fix (cheapest first).**
1. iOS copy: drop "for now", "Before it has a price…" and "card". Say "Premium is included at no cost".
2. Better: on iOS, give every account Premium automatically and hide the lock/upsell UI until a real
   IAP exists.
3. When Premium becomes paid on iOS: In-App Purchase only, and no mention of web prices in the app.

### R-05 · HIGH (process) · Following is dormant in the binary (2.3.1(a), 2.5.2)

The social "Following" feature (profiles, sharing, report/block) is complete in the binary, switched off
by a server flag, and not mentioned in the 1.0.1 review notes. `privacy-and-rating.md` plans to switch it
on later "over the air". Apple forbids hidden or dormant features (2.3.1(a)) and OTA code that adds
significant features beyond what was reviewed (2.5.2). A social network also changes the age rating
(UGC → Yes).

**Fix.** Add one sentence to the 1.0.1 notes, e.g. *"The app contains a 'Following' feature that is
disabled on the server; it will only be enabled together with a future version submitted for review."*
Then turn it on only alongside a submitted version that carries the 1.2 notes and the new age-rating
answer. Before that launch, the code audit also flagged: no human moderation step, Terms that still say
recipes "are not shared with other users", and no zero-tolerance clause (details in §7, F-08).

### R-06 · HIGH (metadata) · App Store screenshots are out of date (2.3.3, 2.3.7)

`docs/app-store/ios/screenshots/README.md` itself marks 7 of the 8 shots (captured 26 Sep, before waves
1–3) as **Retake**. `04-home.jpg` even shows *Snap to log*, which is Premium and no longer on Today for a
free user. Screenshots that don't match the app are a frequent metadata rejection. Retake them from the
1.0.1 build with a free demo account, per that README's shot list.

### R-07 · MEDIUM · Generic, unused permission strings (5.1.1)

The built app's `Info.plist` contains:

- `NSFaceIDUsageDescription`: "Allow $(PRODUCT_NAME) to access your Face ID biometric data." (expo-secure-store default; Face ID is never used)
- `NSMicrophoneUsageDescription`: "Allow $(PRODUCT_NAME) to access your microphone" (expo-image-picker default; the app picks images only)

They are never shown, but reviewers and automated checks read purpose strings. Generic ones are a
standard 5.1.1 rejection reason, and declaring unused sensitive capabilities looks careless.
**Fix (binary, do it before the 1.0.1 build):** in `apps/mobile/app.config.js`,
`['expo-secure-store', { faceIDPermission: false }]` and add `microphonePermission: false` to the
`expo-image-picker` options.

Good: camera ("Chefer uses the camera to scan meals you are about to eat.") is asked only on tap, a
denial shows an inline "Chefer needs camera access… You can turn…" message with a Settings link, photo
picking uses the system picker (no library permission prompt), and photos are re-encoded on the device
(location metadata is dropped).

### R-08 · MEDIUM · Analytics switch contradicts App Privacy (5.1.2)

Profile → Privacy & data → **Usage analytics: "Send anonymous usage counts" is on by default**
([16-profile-privacy-data.jpg](./app-review-simulation-2026-10-01/16-profile-privacy-data.jpg)). The App
Privacy answers declare no Usage Data, because the transport sends nothing without a PostHog key. A
reviewer comparing the label with the app sees a contradiction.
**Fix (OTA):** render the card only when `isTransportEnabled()` is true
(`apps/mobile/src/features/profile/analytics-consent-card.tsx`), or declare Usage Data → Product
Interaction. Also confirm `eas env:list production` has no `EXPO_PUBLIC_POSTHOG_*`.

### R-09 · MEDIUM · Raw developer error text on network failure (2.1)

With the server unreachable, Sign in and Create account print
**`fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)`**
in red. Register also clears both password fields. Reviewers often test on slow or flaky networks.
Screenshot: [12-raw-network-error.jpg](./app-review-simulation-2026-10-01/12-raw-network-error.jpg)
**Evidence:** `apps/mobile/app/(auth)/login.tsx:119`, `apps/mobile/app/(auth)/register.tsx:280` render
`error.message` as is. **Fix (OTA):** map network errors to "Can't reach Chefer right now. Check your
connection and try again." (one helper for every mutation error).

By contrast, signed-in screens handle outages well: Today "Couldn't load your dashboard · Try again",
Plan "Couldn't load your meal plan … Nothing you saved has been lost", and Gym keeps working from cache
([13-server-down-handling.jpg](./app-review-simulation-2026-10-01/13-server-down-handling.jpg)).

### R-10 · MEDIUM · AI consent only enforced on the client (5.1.2(i))

On the device the consent sheet is right: it appears before the first AI call, names **Groq** and
**Cloudflare Workers AI**, lists what is sent, and "Not now" sends nothing and keeps the message
([03-ai-consent.jpg](./app-review-simulation-2026-10-01/03-ai-consent.jpg)). From the code audit:

- The server never checks `aiDataConsentAt` (`apps/api/src/routers/user.router.ts:207` says "Not
  enforced server-side"). An old binary, a stale cache or a just-revoked consent still sends data.
- Ingredient "Fill in for me" sends the typed name to the AI without the sheet
  (`apps/mobile/src/features/ingredients/custom-ingredient-sheet.tsx:29-32`).
- If the provider list fails to load, the sheet's fallback names **Gemini** with a Groq backup
  (`packages/types/src/ai-consent.ts:101-113`), which isn't what production uses.
- The weekly coach review sends weight trend and goal to the AI but isn't listed on any sheet and has no AI label.

**Fix:** one `aiConsentProcedure` middleware on the AI procedures (API, additive); default the
disclosure to Groq/Cloudflare; gate ingredient autofill (OTA).

### R-11 · MEDIUM · Snackbar blocks the tab bar (4.0)

After swapping a meal, "Swapped to Salmon Poke Bowl · Undo" covers the bottom tab bar for 8 seconds
(16 with VoiceOver). Taps on Shop/Today in that time do nothing, which reads as a frozen app.
Screenshot: [11-snackbar-over-tab-bar.jpg](./app-review-simulation-2026-10-01/11-snackbar-over-tab-bar.jpg)
**Evidence:** `<Snackbar />` is mounted once in `apps/mobile/app/_layout.tsx:148` with no
`bottomOffset`. **Fix (OTA):** pass the tab bar height as `bottomOffset` on tab screens, or render the
snackbar above the tab bar.

### R-12 · MEDIUM · Privacy policy controller vs App Store seller

The live privacy policy says "Chefer is run by Pop Dan-Vlad, an individual based in Romania, who is the
data controller". The App Store seller (and the team signing the build) is **Smooth Path Digital S.R.L**.
Apple shows the seller on the product page, and a reviewer or a user may ask who is responsible. Under
GDPR the controller should be whoever actually decides on the processing. Align the policy (and Terms)
with the real controller and seller. It's a web change only.

### R-13 · MEDIUM · Age rating vs minimum age

Sign-up requires "I'm 16 or older", the privacy policy says 16+, but `privacy-and-rating.md` expects a
4+/9+ rating. Apple's 2025 questionnaire has 13+, 16+ and 18+ tiers. Answer it honestly and use the
age-rating override to **16+** so the store page matches the Terms. This pairs with R-02.

### R-14 · LOW · AI chat guardrails (1.4.1)

The chat shows "AI · answers can be wrong" and a "not a doctor / not medical advice" card
([03-ai-consent.jpg](./app-review-simulation-2026-10-01/03-ai-consent.jpg)), and the system prompt says
"chef, not a doctor". But it has no instruction for very-low-calorie or eating-disorder questions
(I asked "Can I eat 800 calories a day to lose weight fast?"; real model output was not tested), and the
"AI-generated" chip only appears on plan cards (`apps/api/src/lib/ai/prompts.ts:437-447`). Add a
decline-and-refer rule to the prompt.

### R-15 to R-24 · LOW · Polish

- **R-15 Internal strings.** More footer shows "Chefer 1.0.1 · production · update …" (`app/(food)/more.tsx:152-154`), and Profile shows the role badge "USER" (`app/profile.tsx:168`). Show "Version 1.0.1" and hide the role for non-admins.
- **R-16 Workout leaves the app.** Inside a workout, the technique sheet's "▶ Watch technique" calls `Linking.openURL` (`src/features/gym/workout/workout-sheets.tsx:76-89`) and opens Safari/YouTube mid-set. Reuse the in-app video sheet (with the R-01 guard).
- **R-17 "Save Password?" after deletion.** The delete sheet's password field uses `autoComplete="current-password"` (`src/features/profile/account-data-card.tsx`), so iOS offers to save the password of the account that was just deleted. Use `textContentType="none"`/`autoComplete="off"` there, or accept it.
- **R-18 Stale Today after onboarding.** Right after "Plan my first week", Today shows "NOTHING PLANNED · 0 of 1,200 kcal"; it updates only after visiting Plan. Invalidate the dashboard query when onboarding generates the plan. This is the reviewer's first screen.
- **R-18b Onboarding shown inconsistently.** The first sign-up on a fresh install went straight to Today with no onboarding; the second sign-up on the same phone got the 5-step wizard. Check which is intended: the review notes ask the owner to go through onboarding when preparing the review account.
- **R-19 Next session day.** Thursday, after doing Full Body A off-schedule: "Next session: Wednesday — Full Body B" although Friday is a planned training day (`src/features/gym/today/today-screen.tsx:488`).
- **R-20 Larger Text.** At Accessibility XL, Today's "Cook it" / "Swap" button labels are cut off, and the header avatar loses its initial ([14-larger-text.jpg](./app-review-simulation-2026-10-01/14-larger-text.jpg)).
- **R-21 Small polish.** Today's "Your week" shows an unlabeled meal count ("3") under every weekday that reads like a broken date; the exercise filter chip "back" is lowercase; some shopping-list thumbnails are wrong (Cucumber shows a lime, Radishes a tart); onboarding says "Step 1" then "Step 2 of 5". The Progress weight field's decimal keypad has no Done key (you tap outside to close it).
- **R-22 Android on pages opened from the app.** `/support` and `/privacy` say "iOS and Android app" and "Google Play". Normally tolerated in policy text; the Support FAQ could say "the app".
- **R-23 ITMS-90078 email.** Push code is linked but `aps-environment` is stripped, so App Store Connect may send a "Missing Push Notification Entitlement" warning. Ignore it; it isn't a rejection.
- **R-24 Password reset on the web.** The emailed link opens the website; the in-app reset screen is unreachable without universal links. Deleting the account needs the password, so a user who forgot it must reset on the web first. Acceptable to Apple; universal links would close the loop.

---

## 4. What a reviewer would find working

| Area | Result |
|---|---|
| Launch, welcome | Clean, branded, no dev UI in Release ([01-welcome.jpg](./app-review-simulation-2026-10-01/01-welcome.jpg)) |
| Sign-up | Field validation, Terms + Privacy links, 16+ checkbox, server re-checks both |
| Sign-in / sign-out / forgot password | Clear "Invalid email or password"; reset gives a neutral "If an account exists…" message; sign-out returns to Sign in |
| Onboarding | 5 steps (what you want help with, diet & safety, how you cook, goal, body metrics), all optional ([02-onboarding.jpg](./app-review-simulation-2026-10-01/02-onboarding.jpg)) |
| Health consent | Appears before the first save of health data; "Allow and save" / "Don't save it" ([04-health-consent.jpg](./app-review-simulation-2026-10-01/04-health-consent.jpg)) |
| AI consent | Before the first AI call; names Groq + Cloudflare; "Not now" sends nothing |
| Meal plan | Generated instantly from the curated pool (no AI); swap with Undo; pin; regenerate |
| Recipe, cook mode | Detail, servings, nutrition, ratings; step-by-step cook mode with progress |
| Shopping list | Categories, prices, tick-off, share sheet (text) |
| Tracker | Log a planned meal in one tap with Undo; macros update |
| Camera | Asked in context with a specific string; denial handled in the UI |
| Notifications | Local only; a pre-prompt explains why before the system prompt ([17-workout-notification-preprompt.jpg](./app-review-simulation-2026-10-01/17-workout-notification-preprompt.jpg)) |
| Gym | Setup wizard, recommended routine, workout with prefilled sets, PR, rest timer, summary with "Next time" |
| Export data | `chefer-export-YYYY-MM-DD.json` via the share sheet |
| Delete account | Clear list of what is deleted, password + DELETE, works (after R-03's extra tap), signs out, rows gone |
| No network / server down | Friendly retry states; Gym works offline; session kept |
| Dark mode | App stays consistently light (deliberate), status bar readable |
| iPad (compatibility) | Launches and renders correctly in a window (interaction not tested) ([18-ipad-compat.jpg](./app-review-simulation-2026-10-01/18-ipad-compat.jpg)) |
| Payments | No IAP, StoreKit, Stripe or price code anywhere in the app |
| Third-party login | None, so Sign in with Apple isn't required |
| Public URLs | Privacy, Terms and Support load (200); Support has an email and an FAQ that covers deletion |

---

## 5. Recommended order before submitting 1.0.1

1. **Binary changes, before the EAS build:** R-07 (two config lines).
2. **OTA, before or right after submission:** R-03 (delete tap), R-01 (web view guards), R-04 (Premium
   copy), R-08 (hide analytics card), R-09 (friendly network errors), R-11 (snackbar), R-18 (stale Today).
3. **API deploy:** R-02 (age ≥ 16, no deficit under 18), R-10 (server consent check), R-14 (prompt rule).
4. **App Store Connect:** R-05 (one sentence in the notes), R-06 (retake screenshots), R-13 (age rating
   16+), and re-check the "Unrestricted web access" answer after R-01 ships.
5. **Web:** R-12 (controller/seller), R-22 (optional wording).

The app currently in review is 1.0.0 (5), which runs older JS than `master`. I tested only `master`, so I
can't say which items 1.0.0 has; R-07 (plugin defaults) and the unguarded web views have been in the
config and code for a while, so assume those are present. If 1.0.0 is rejected for a JS item, the fix
reaches it only if an update is published for its runtime (`3b4fb9f1…`). Otherwise, answer in the
Resolution Center and ship the fix in 1.0.1.

---

## 6. Checks only the owner can do

- Install the **TestFlight 1.0.1 build** (`com.popdan.chefer`) and repeat §4 against production with the
  real review account: Premium turned on, consent sheets, delete on a throwaway account.
- A **5-minute iPad pass** (Apple often reviews iPhone apps on iPad): sign in, Plan, Gym workout, delete sheet.
- Confirm production has **no `friends` flag** and the review account isn't in `FRIENDS_ALLOWLIST`.
- Confirm `eas env:list production` has no `EXPO_PUBLIC_POSTHOG_*` (R-08).
- One real-AI chat question about an 800 kcal diet on a non-production key, to see what the model says (R-14).
- Watch for ITMS-91061 / ITMS-90078 emails after uploading 1.0.1.

---

## 7. Appendix: code-audit IDs

The code audit (F-xx IDs, done on the same commit) maps to this report as follows. Findings are merged
above; nothing was dropped.

| Audit ID | Here | | Audit ID | Here |
|---|---|---|---|---|
| F-01, F-02 | R-07 | | F-12 | R-24 |
| F-03 | R-05 | | F-13 | R-23 |
| F-04 | R-04 | | F-14 | Ruled out (§3) |
| F-05 | R-08 | | F-15 | Accepted: account justified by sync (review notes) |
| F-06, F-07 | R-01 | | F-16 | R-02 |
| F-08 | R-05 (before Following launch) | | F-17, F-18, F-19 | R-10 |
| F-09 | R-13 | | F-20 | §6 (health-consent server enforcement is `off` by default; a GDPR item, not App Review) |
| F-10 | R-22 | | F-21 | R-14 |
| F-11 | R-15 | | | |

**Test environment, for reruns:** clean worktree of `origin/master`, `APP_VARIANT=development`,
`EXPO_PUBLIC_API_URL` set for both `expo prebuild` **and** `xcodebuild` (the JS bundle is built in the
Xcode phase), Release configuration, `CODE_SIGN_IDENTITY=-` (an unsigned build loses the Keychain and
looks like random sign-outs), `EXUpdatesEnabled=false` in `Expo.plist`, local API with
`AI_MOCK_ENABLED=true` on a cloned database. Driven with Maestro, since iPad compatibility windows don't
accept Maestro taps. The worktree and database were removed afterwards.
