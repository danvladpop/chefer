# Chefer iOS: App Store submission runbook

Everything needed to get `apps/mobile` from "runs on my phone with a 7-day free certificate"
to "live on the App Store", in order. Companion files:

| File                                             | What's in it                                                    |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [metadata.md](./metadata.md)                     | Name, subtitle, description, keywords, URLs, categories         |
| [privacy-and-rating.md](./privacy-and-rating.md) | App Privacy answers, age rating, encryption, pricing, EU trader |
| [review-notes.md](./review-notes.md)             | Demo account setup + notes for the reviewer                     |
| [screenshots/README.md](./screenshots/README.md) | Screenshot set, captions, how to capture                        |
| `scripts/check-lengths.mjs`                      | Checks the listing text against Apple's character limits        |

---

## 0. Checklist

**Code (done; merged to `master` in #45, per the waves README):**

- [x] In-app **account deletion** on iOS and web (Guideline 5.1.1(v); missing = certain rejection)
- [x] **AI data consent** before the first call to an AI provider (Guideline 5.1.2(i)); plus, since wave 3, a separate **health information consent**
- [x] "Beta" wording removed from the app (Guideline 2.2 rejects apps that look like betas)
- [x] Public **/support** page; **/privacy** updated (deletion, consent, contact)
- [x] Support email: `cheferapp.help@gmail.com` (`SUPPORT_EMAIL` in `packages/types/src/support.ts`)
- [x] Backup AI provider checked: production uses Groq, and the consent sheet and privacy page name it
- [ ] Fill `eas.json` → `submit.production.ios` (`appleId`, `ascAppId`, `appleTeamId`) once the app record exists; eas-cli rejects empty placeholders, so they aren't there yet
- [ ] After merging, re-run `pnpm mobile:release:ios` / `:android` for your own phones: the 1.0.0 bump changes the native fingerprint, and `publish-update.sh` refuses to publish OTA updates until the installed builds match
- [x] Root **error boundary** in the mobile app (a render error used to crash the whole release build)
- [x] `app.config.js`: `version: '1.0.0'`, `usesNonExemptEncryption: false`
- [x] `eas.json` production profile carries `APP_VARIANT` / `EXPO_PUBLIC_API_URL` (otherwise the cloud build fails the config's https check)
- [ ] Deployed to production, so the reviewer's build talks to an API that has the new procedures

**Accounts (you + your friend):**

- [ ] Invitation accepted; your friend's team shows up at developer.apple.com/account (§1)
- [ ] Your role is **Admin**, or **App Manager** with _Access to Certificates, Identifiers & Profiles_ (§2)
- [ ] Friend has accepted the latest Apple Developer Program License Agreement
- [ ] Friend declares EU **trader** status in App Store Connect → Business (decided: EU included; see privacy-and-rating.md)

**App Store Connect:**

- [ ] App record created (§4)
- [ ] Build uploaded via EAS and tested through TestFlight (§5, §6)
- [x] Screenshots captured: `screenshots/iphone-6.9/` (7 × 1320 × 2868 JPEG, retaken 2 Oct 2026)
- [ ] Listing text, screenshots, privacy, age rating, review info filled in (§7)
- [ ] Submitted (§8)

---

## 1. Your Apple account: what the screenshot means

The page you screenshotted (developer.apple.com/account with **"Join the Apple Developer
Program — Enroll today"** and only _Tools / Profile / Emails / Agreements_) is what an Apple ID
sees **when it is not on any paid team**. So right now the invitation is either not accepted
yet, or it was sent to a different Apple ID/email.

1. Look for an email from Apple titled like _"You've been invited to join <team name>"_
   (developer program) or _"… App Store Connect"_. Open the link **while signed in with the
   Apple ID you want to use** and accept.
2. Reload developer.apple.com/account. It worked when you see your friend's team name at the top
   right (with a team switcher if you belong to more than one team), and sections such as
   _Certificates, IDs & Profiles_ instead of "Enroll today".
3. Also sign in to **appstoreconnect.apple.com**. You should see the team there too.

**Yes, a team membership is enough to build, upload and submit**, provided your role allows it
(§2). You don't need your own $99 membership. What that means in practice:

- The app is published **under your friend's developer account**. Their legal name (or company)
  appears as **Seller** on the App Store page and in the copyright line, and they are the
  party that agrees to Apple's terms for this app.
- They can remove your access at any time. If you enroll yourself later, Apple's **App
  Transfer** moves the app, with its reviews and ratings, to your account (TestFlight builds
  aren't carried over).
- Talk to your friend about this before submitting, not after.

---

## 2. What to ask your friend for

Send them this list:

1. **Role for your Apple ID:** App Store Connect → Users and Access → your user →
   **Admin**, _or_ **App Manager** with **"Access to Certificates, Identifiers & Profiles"**
   ticked. Admin/App Manager is needed to create the app record and submit. Certificate access
   is needed so EAS can create the distribution certificate and provisioning profile.
   _Developer_ alone can upload builds but **cannot submit for review**.
2. **Their Team ID** (10 characters, developer.apple.com/account → Membership details). You
   need it in §3.
3. Accept any pending **agreements** in App Store Connect → Business (only the Account Holder
   can). A free app needs only the standard Program License Agreement, not the Paid Apps
   agreement.
4. Declare **EU trader** status in App Store Connect → Business (address, phone, email are shown on EU store pages; use the Chefer support email).
5. _(Optional, instead of 1's certificate access)_ an **App Store Connect API key** (Users and
   Access → Integrations → Team keys, role App Manager). They send you the `.p8` file, Key ID and
   Issuer ID; EAS can use it for builds and submits with no Apple ID login.

---

## 3. Switch the project to your friend's team

Today `EXPO_APPLE_TEAM_ID` in `apps/mobile/.env` is your **free personal team** (`45P674Q3CW`),
and the same value is the GitHub repo variable used by the `mobile-update` deploy job.

**Why this matters:** the iOS runtime fingerprint includes the team ID. If the App Store build
and the OTA publisher see different team IDs, their fingerprints differ and **over-the-air
updates silently never reach the App Store build**. Use the friend's team ID everywhere:

```bash
# 1. local
sed -i '' 's/^EXPO_APPLE_TEAM_ID=.*/EXPO_APPLE_TEAM_ID=<FRIEND_TEAM_ID>/' apps/mobile/.env
```

```bash
# 2. GitHub repo variable used by deploy.yml → mobile-update
gh variable set EXPO_APPLE_TEAM_ID --body "<FRIEND_TEAM_ID>"
```

```bash
# 3. EAS cloud builds don't see the gitignored .env; give them the same value
cd apps/mobile && npx eas-cli env:create --environment production --name EXPO_APPLE_TEAM_ID --value "<FRIEND_TEAM_ID>" --visibility plaintext
```

After the first store build, check that the runtime version on the EAS build page equals the
one `pnpm mobile:update` prints. If they differ, OTA won't reach the store build.

**Bundle ID `com.popdan.chefer`** (decided 2026-09-28). The first EAS build reported
`dev.chefer.app` as **"not available"**: bundle IDs are unique across all Apple teams, and the
free personal team that signed the early phone builds still holds it. The production iOS
`bundleIdentifier` is now `com.popdan.chefer`; the Android package stays `dev.chefer.app`.

- Let the **paid** team register it first: run the EAS build (or register it under
  Certificates, IDs & Profiles → Identifiers) before any local build.
- Never run `pnpm mobile:release:ios` with the free team's `EXPO_APPLE_TEAM_ID` again: Xcode
  would register `com.popdan.chefer` to the free team and lock it the same way.

Once TestFlight works (§6), install Chefer on your iPhone **from TestFlight** and drop the 7-day
`pnpm mobile:release:ios` re-sign. TestFlight builds last 90 days.

---

## 4. Create the app record

App Store Connect → **Apps → + → New App**:

| Field            | Value                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platforms        | iOS                                                                                                                                                                                        |
| Name             | `Chefer: Meal Planner & Gym` (fallbacks in metadata.md)                                                                                                                                    |
| Primary language | English (U.S.)                                                                                                                                                                             |
| Bundle ID        | `com.popdan.chefer` (if it's missing from the dropdown, register it first under Certificates, IDs & Profiles → Identifiers → +, App IDs, Explicit; or let the first EAS build register it) |
| SKU              | `chefer-ios-001`                                                                                                                                                                           |
| User access      | Full access                                                                                                                                                                                |

Note the **Apple ID** number of the app (App Information → General). That's the `ascAppId`
for `eas.json` → `submit.production.ios.ascAppId`, which saves EAS from asking every time.

---

## 5. Build and upload

Requires the EAS login for the `cheferoni` org (`npx eas-cli whoami`). The free EAS plan's
monthly iOS builds are enough for this.

```bash
cd apps/mobile && npx eas-cli build --platform ios --profile production
```

- When asked, **log in with your Apple ID** and **choose your friend's team**. Let EAS create
  the distribution certificate and provisioning profile. With an API key (§2.5), set
  `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID` and `EXPO_APPLE_TEAM_ID`
  first, and there's no Apple ID prompt.
- `autoIncrement` + `appVersionSource: remote` bump the build number on each build; the
  marketing version comes from `app.config.js` (`1.0.1` since wave 4's native release; 1.0.0 (5) was
  the first submission).

Then upload it to App Store Connect:

```bash
cd apps/mobile && npx eas-cli submit --platform ios --latest
```

Apple processes the build for 5–30 min and emails you when it shows up in TestFlight.

_No EAS?_ The same works locally: `APP_VARIANT=production` prebuild, then Xcode → Product →
Archive with the friend's team selected → Organizer → Distribute → App Store Connect.

---

## 6. TestFlight check (don't skip)

1. App Store Connect → TestFlight → Internal Testing → create a group, add yourself. Team
   members can be internal testers with no Beta App Review.
2. Install the **TestFlight** app on your iPhone and install Chefer from it.
3. Walk the reviewer's path on **production**: register → onboarding (consent sheet appears)
   → plan → recipe → shopping list → cook mode → tracker photo → Gym setup + a workout →
   Profile → Delete account on a throwaway account.
4. Check the build was really built for production: the More-tab footer shows
   `Chefer 1.0.0 · production`.

Every crash or dead end here is a rejection avoided.

---

## 7. Fill in the listing

Work through the App Store Connect sidebar using the companion files:

1. **App Information:** name, subtitle, categories, content rights, age rating
   (metadata.md, privacy-and-rating.md).
2. **Pricing and Availability:** Free; all countries (EU needs the trader declaration first).
3. **App Privacy:** privacy policy URL + the data table (privacy-and-rating.md).
4. **1.0 Prepare for Submission:** screenshots (6.9" set), promotional text,
   description, keywords, support URL, marketing URL, version, copyright
   (metadata.md) → **Build** → pick the TestFlight build → **App Review
   Information** (review-notes.md) → **Version Release: Manually release**.

---

## 8. Submit

**Add for Review → Submit.** Review usually takes 24–48 h. You'll get an email for every
status change.

If it's rejected, the message cites a guideline number. Reply in App Store Connect's
Resolution Center, fix, and resubmit. **A pure JS/copy fix doesn't need a new binary**: publish
it with `pnpm mobile:update "fix: …"` (EAS Update), confirm it on the TestFlight build, then
reply to the reviewer that it's fixed. Native changes need a new `eas build` + `eas submit`.

### Rejection risks we've already handled

| Guideline | Risk                                                 | Status                                                                                                                                                                                                                                   |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1.1(v)  | Account creation without in-app deletion             | Fixed (merged to `master`, #45)                                                                                                                                                                                                          |
| 5.1.2(i)  | Personal data sent to third-party AI without consent | Fixed (merged to `master`, #45)                                                                                                                                                                                                          |
| 2.2       | App labelled "beta"                                  | Copy fixed (merged to `master`, #45)                                                                                                                                                                                                     |
| 2.1       | Crash on launch or on a screen                       | Root error boundary added; a render error now shows "Something went wrong / Try again" instead of killing the release app. Deploy the API **before** the build goes to review: an app newer than its API crashed on Home before this fix |
| 2.1       | Reviewer can't sign in / empty screens               | Demo account with data (review-notes.md)                                                                                                                                                                                                 |
| 5.1.1     | Permission prompts without a clear purpose           | Camera/photo strings already specific                                                                                                                                                                                                    |
| 1.4.1     | Health claims                                        | Description disclaimer; no diagnosis                                                                                                                                                                                                     |
| 3.1.1     | Digital upgrades outside IAP                         | Premium is free; no payment in app                                                                                                                                                                                                       |
| 4.8       | Third-party login without Sign in with Apple         | N/A: email + password only                                                                                                                                                                                                               |

### After the 2026-10-01 review simulation

Findings and fixes: [app-review-simulation-2026-10-01.md](./app-review-simulation-2026-10-01.md). Before
submitting, tick these off:

- [ ] **R-06 screenshots:** retake the set. The new captures go into `screenshots/iphone-6.9/`; see
      [screenshots/README.md](./screenshots/README.md) for what changes per shot.
- [ ] **R-07 permission strings:** the corrected camera/photos/notification purpose strings are a native
      change. They land in a separate native PR and need a new binary, so don't submit before that build.
- [ ] **R-13 age rating:** override the calculated rating to **16+** in App Store Connect so it matches the
      16+ sign-up gate and the Terms ([privacy-and-rating.md](./privacy-and-rating.md#age-rating)).
- [ ] **R-05 review notes:** paste the current notes from [review-notes.md](./review-notes.md); they now
      carry the `FOLLOWING` sentence (switched off on the server, enabled only with a future reviewed version).
- [ ] **R-01 / "Unrestricted web access: No":** re-check on the TestFlight build that the video sheet and
      Terms/Privacy screens stay on their own content and that other links open in Safari.
- [ ] **R-08:** confirm `eas env:list production` has no `EXPO_PUBLIC_POSTHOG_*`.
- [ ] **R-23 (expect, ignore):** after upload App Store Connect may email **ITMS-90078** ("Missing Push
      Notification Entitlement"). Push code is linked in the binary but `aps-environment` is stripped on
      purpose, because the app uses local notifications only. It is a warning, not a rejection. No action.

### After approval

- **Release:** App Store Connect → Release this version.
- **OTA:** the `mobile-update` deploy job publishes an EAS Update to channel `production`
  on every master deploy. It stays skipped until the **`EXPO_TOKEN`** repo secret exists
  (expo.dev → Access tokens), and it reaches the store build only if the fingerprints
  match (§3).
- **Next version:** bump `version` in `app.config.js` (e.g. `1.0.1`) only for native
  changes that need a store build; JS-only changes ship over the air.
