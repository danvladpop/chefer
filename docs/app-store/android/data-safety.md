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
