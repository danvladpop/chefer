# Google Play: Data safety form (draft)

**Status: prepared for when the Play developer account exists. Nothing here has been entered in
Play Console.** It gives the Data safety answers for the Android app as it is on `master` at
wave 4 (30 Sep 2026) and is derived from the same facts as
[../ios/privacy-and-rating.md](../ios/privacy-and-rating.md). Re-check both files together
whenever the app's data handling changes. Play Console → App content → Data safety.

Android package: `dev.chefer.app` (production variant). Privacy policy URL:
`https://chefer.duckdns.org/privacy`.

## Overview questions

| Question                                                              | Answer                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?   | Yes                                                                                                                                                                                                                                                                                            |
| Is all of the user data collected by your app encrypted in transit?   | **Yes.** Every request goes to `https://chefer.duckdns.org` (HTTPS); analytics, when configured, goes to `https://eu.i.posthog.com`.                                                                                                                                                           |
| Do you provide a way for users to request that their data is deleted? | **Yes.** In the app: Profile → Privacy & data → Your data → Delete account (password + typed `DELETE`; removes the account and everything in it at once). On the web: the same, plus `https://chefer.duckdns.org/support` explains the steps and the email route (`cheferapp.help@gmail.com`). |
| Account creation methods                                              | Username/email and password (own accounts; no Sign in with Google/Apple)                                                                                                                                                                                                                       |
| Account deletion URL (Play requires a web link)                       | `https://chefer.duckdns.org/support` (the FAQ "How do I delete my account?")                                                                                                                                                                                                                   |
| Data deletion beyond the account (partial deletion)                   | Yes: Profile → Privacy & data → Health information → Withdraw and delete removes allergies, diets, dislikes, goal, measurements and weigh-ins for the user and household without deleting the account                                                                                          |
| Independent security review                                           | No                                                                                                                                                                                                                                                                                             |
| Committed to the Play Families policy                                 | No (the app is 16+ and not aimed at children)                                                                                                                                                                                                                                                  |

## Data types

"Shared" below follows Play's definition, which **excludes** transfers to a service provider that
processes the data on the developer's behalf under contract. Chefer's processors (Oracle Cloud
hosting, Groq and Cloudflare Workers AI, the email provider, Expo Updates) are service providers,
so nothing is declared as shared. **Counsel should confirm this reading** (see the checklist),
because the AI providers receive health-related data, only after the user's AI consent.

Collection is "processed ephemerally" only where stated; everything else is stored on Chefer's
servers against the account.

| Play category      | Data type                    | Collected                                                                              | Shared | Optional?                                                    | Purposes                                              | What it is in Chefer                                                                                                        |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Personal info      | Name                         | Yes                                                                                    | No     | Required                                                     | App functionality, Account management                 | Display name at sign-up                                                                                                     |
| Personal info      | Email address                | Yes                                                                                    | No     | Required                                                     | App functionality, Account management, Communications | Login, password reset, the weekly emails the user turns on                                                                  |
| Personal info      | User IDs                     | Yes                                                                                    | No     | Required                                                     | App functionality, Account management                 | Account id and session token                                                                                                |
| Health and fitness | Health info                  | Yes                                                                                    | No     | Optional (asked with a consent sheet)                        | App functionality, Personalization                    | Sex, age, height, body weight log, allergies and diets, calorie and macro targets, logged meals                             |
| Health and fitness | Fitness info                 | Yes                                                                                    | No     | Optional                                                     | App functionality, Personalization                    | Workouts, sets, reps, weights, routines, training goals                                                                     |
| Photos and videos  | Photos                       | Yes                                                                                    | No     | Optional (only photos the user picks or takes)               | App functionality                                     | Meal photos for Snap to log (sent to the AI provider to be read, processed ephemerally, not stored), recipe photos (stored) |
| Messages           | Other in-app messages        | Yes                                                                                    | No     | Optional                                                     | App functionality                                     | Chat messages with the AI chef and "Send feedback" messages                                                                 |
| App activity       | Other user-generated content | Yes                                                                                    | No     | Optional                                                     | App functionality, Personalization                    | Recipes, imported recipe text/links, pantry items, household member profiles                                                |
| App activity       | App interactions             | **Only when a PostHog key is configured for the mobile build. Today: leave unticked.** | No     | Optional (in-app switch, on by default for anonymous counts) | Analytics                                             | Screen and button usage counts, typed events with no free text. See "When analytics is switched on" below.                  |

**Not collected (leave unticked):** Approximate or precise location, Contacts, Calendar,
Financial info (no payments in the app), Web browsing, Files and docs, Audio (the app records
none; audio of a video link the user imports is transcribed on the server and deleted), Health
Connect data, Device or other IDs (**no advertising id, no Android ID or IMEI read**), App info
and performance (crash logs and diagnostics: mobile Sentry is not set up), Race, religion,
sexual orientation or other sensitive attributes.

## When analytics is switched on

Applies the day `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` are set for a mobile
build (today they are not; see the iOS page for how this was verified). Then:

- Tick **App activity → App interactions**, collected, not shared, purpose **Analytics**, optional.
- Users can turn it off in the app (Profile → Privacy & data → Usage analytics), which stops every
  request.
- Nothing free-text is ever sent (the typed event map forbids it).
- Play has no "linked or not" question for this; the privacy policy carries that part.

## Other Play forms that go with this one

| Form                                      | Answer / note                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advertising ID declaration                | **No**, the app does not use an advertising id. Evidence for it is in [../release-1-checklist.md](../release-1-checklist.md) section D.                                                                                                                          |
| Health apps declaration                   | Chefer gives general nutrition and training guidance, not a medical device. Tick "Nutrition and weight management" / "Activity and fitness" if offered; do not tick medical or clinical categories. The "not medical advice" line is in the store description.   |
| Target audience and content               | 16 and over (the age gate at sign-up is 16+); not designed for children.                                                                                                                                                                                         |
| Content rating (IARC)                     | Same answers as the iOS age-rating table in [../ios/privacy-and-rating.md](../ios/privacy-and-rating.md#age-rating).                                                                                                                                             |
| Government apps, financial features, news | No                                                                                                                                                                                                                                                               |
| Data used for AI                          | The app sends user data to Groq and Cloudflare Workers AI only after the in-app AI consent; it is not used to train models. Mirror the wording in the store description and privacy policy.                                                                      |
| Permissions declaration                   | Camera and photo access (only when the user scans a meal or adds a recipe photo) and local notifications (workout reminders, rest timer). No push, no location, no contacts. Confirm against the merged Android manifest of the release build before submitting. |

---

## At Following launch (draft)

**Do not apply this to the form that matches the build you submit first.** Everything above describes the
Android app as it is on `master` at wave 4. This section is what changes when Following is switched on
for everyone (plan §14 steps 5 and 6). It comes from [`docs/friends/prd.md`](../../friends/prd.md) §14 item 4 and
the iOS equivalent in [../ios/privacy-and-rating.md](../ios/privacy-and-rating.md#at-following-launch-draft-do-not-apply-to-the-101-submission).
Counsel review pending. Following ships over the air, so the Data safety form and the content rating must be
correct before `friends` is switched on, not only at the next store build. The Play account does not exist yet, so
fill the form with these answers from the start.

### Data safety: what changes

**No new data type.** The types Following touches are already ticked above. Only the descriptions change:

| Play data type                              | Change to "What it is in Chefer"                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal info → Name                        | Add: "also shown to other users, with the first and last name editable, when the user turns on Following"                                                                   |
| App activity → Other user-generated content | Add: "recipes shared with followers; who the user follows and blocks; follow requests; reports the user files"                                                              |
| Health info, Fitness info                   | Add: "the meal plan with calories and macros, the routine and the last 7 days of workouts can be seen by followers the user approved (or anyone, if the profile is Public)" |

**Do not tick:** Contacts (no import), Photos and videos (no profile photo upload), Location, Search history (names
typed in the search box are never logged or sent to analytics), Messages (there is no messaging).

**"Shared" stays No, recommended, but counsel must confirm.** Play's definition of sharing excludes a transfer the
user starts and expects. Showing the user's own content to the people they chose to share it with, after an explicit
opt-in with a clear intro screen, fits that reading. A reader could also say other users are third parties.
**Fallback if counsel says so:** mark **Name, Health info, Fitness info and Other user-generated content** as
**Collected: Yes, Shared: Yes**, purpose **App functionality**, optional, with the note "Shown to other users of the
app that the user chooses". Nothing else in the form changes. The privacy policy carries the detail either way.

| Question                             | At Following launch                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the data encrypted in transit     | Yes, unchanged                                                                                                                                                                                          |
| Can users ask for deletion           | Yes. Account deletion removes all of it. **Partial deletion** row: add "Following → Sharing & privacy → Turn off Following removes the social profile, follows, blocks, requests and Activity at once". |
| Is any of it required                | No. Following is optional and off until the user turns it on, so every Following item is **Optional**                                                                                                   |
| Data used for tracking / advertising | No, unchanged                                                                                                                                                                                           |
| Push, device or ad identifiers       | None. Following adds no permission, no push registration and no new SDK.                                                                                                                                |

### Content rating (IARC questionnaire)

Use the same answers as the iOS age rating ([../ios/privacy-and-rating.md](../ios/privacy-and-rating.md#age-rating-at-launch)),
with these changes:

| Question (wording varies by IARC version)                                                          | Answer                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Can users interact or exchange content with each other? (user interaction, user-generated content) | **Yes.** Users see each other's shared recipes, meal plans and workouts. There is no chat, comment or messaging. |
| Is a user's personal information visible to other users?                                           | **Yes**, a first and last name and what the user chooses to share. No location, no email address.                |
| Is the user's location shared with others                                                          | No                                                                                                               |
| Is there unrestricted internet access or an in-app browser                                         | No. A recipe's source link opens in the phone's browser.                                                         |
| Digital purchases, gambling                                                                        | No, unchanged                                                                                                    |

The rating may rise. Accept what it calculates; the Terms already require 16+.

### Google Play "User Generated Content" policy

Play requires an app with user-generated content to have all of the following. Each one is in the app.

| Play requirement                                                                   | Chefer                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User terms that define objectionable content and require acceptance before posting | The Terms (draft section "Following and shared content", [`legal-drafts.md`](../../friends/legal-drafts.md) §2.2). Every user accepts Terms at sign-up, and re-accepts after the version bump at launch.                                                                                                                                                      |
| An in-app system to report objectionable content and users                         | "Report and block" on a profile, "Report recipe" on a recipe. One tap on a reason (five reasons).                                                                                                                                                                                                                                                             |
| Moderation, removal and blocking of abusive users and content                      | Automatic and immediate: a recipe reported by 3 different eligible accounts is hidden for everyone, an account reported by 5 is forced private and removed from search, a word filter rejects offensive names and shared-recipe text, and every user can block anyone instantly. There is no manual queue (owner decision); every automatic action is logged. |
| Safeguards for user content that can be monetised or shared widely                 | Not applicable: no payments, no ads, no public web pages. Profiles are visible only to signed-in Chefer users who turned Following on, and a profile is Private by default.                                                                                                                                                                                   |

### Other Play forms

| Form                    | Change at launch                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Target audience         | Unchanged: 16 and over. Following adds no feature aimed at children and no age check beyond the existing 16+ gate.   |
| Health apps declaration | Unchanged. Following shows the user's own meal plan and workouts to people they choose, and gives no medical advice. |
| Permissions declaration | Unchanged: no new permission. "Invite someone" uses the system share sheet.                                          |
| Store listing text      | Mention Following only in the same wording as the iOS metadata, and say it is optional.                              |
