# App Review information

App Store Connect → 1.0 Prepare for Submission → **App Review Information**.

## Sign-in information (required: the app needs an account)

Create a dedicated reviewer account **on production** (`https://chefer.duckdns.org`, or in the
TestFlight build) before submitting. Do it yourself; don't reuse your own account.

1. Register with an address you control, e.g. `appreview.chefer@<your-domain-or-gmail-alias>`,
   and a strong password that is used nowhere else.
2. Go through onboarding: pick a goal, add an allergy (e.g. peanuts), and generate the first
   meal plan so the reviewer sees real content immediately. Saving the allergy or goal shows
   the health-information consent sheet once (Allow and save); generating the plan shows the
   AI consent sheet once; tap Allow. (An account created before the health consent existed
   is asked once on the next launch — tap Allow and save.) The reviewer can still see the consent sheet by
   switching off Profile → "AI & your data", and the notes below tell them where.
3. Profile → Your plan: Free → "See what Premium adds" → "Turn on Premium" (free) so every feature is unlocked for review.
4. Save one recipe, log one meal in Tracker (Today → "See full day"), log one weight entry, and in Gym mode run setup and
   finish one short workout, so no screen is empty.
5. Keep this account untouched until the review is approved. Apple may sign in again for
   every update, so keep it working long term.

Paste into the form:

| Field            | Value                             |
| ---------------- | --------------------------------- |
| Sign-in required | ✅                                |
| User name        | the reviewer email from step 1    |
| Password         | the reviewer password from step 1 |

## Contact information

First name, last name, phone, email: **yours** (the reviewer contacts you, not the seller). Use
a phone number you'll answer while the app is in review.

## Notes (paste as-is, ≤ 4000 characters)

```
Chefer is a meal-planning and strength-training app. An account is required because plans, recipes, shopping lists and workouts sync between the iOS app and the web app (chefer.duckdns.org).

DEMO ACCOUNT
The account above already has a meal plan, recipes and a logged workout. Premium features are enabled on it. Premium is currently free for everyone: the "Turn on Premium" button (More → Profile → the "Your plan" card → "See what Premium adds", or the same sheet any locked feature opens) just switches the account's tier, and no payment is taken anywhere in the app. There are no in-app purchases.

WHERE THINGS ARE
- Food mode (default): Today, Plan, Shop, Cookbook, More tabs.
- Gym mode: use the Food/Gym switch in the header of the Food tabs. Gym works offline.
- Account deletion: More → Profile → scroll to "Privacy & data" → "Your data" (last card) → "Delete account". It asks for the password and for DELETE to be typed, then permanently deletes the account and all its data and signs out everywhere.
- Health information consent: the first time allergies, a diet, a goal, body measurements or a weigh-in are saved, the app asks for permission to store them (Allow and save / Don't save it; "Don't save it" stores none of it). It is separate from the AI consent below. It can be withdrawn, deleting that data, under More → Profile → "Privacy & data" → "Health information" → "Withdraw and delete".
- AI data consent: the first time an AI feature is used (plan generation, meal-photo scan, recipe import, chat) the app explains what is sent to Groq and Cloudflare Workers AI and asks for permission (Allow / Not now; "Not now" sends nothing). It can be withdrawn under More → Profile → "Privacy & data" → "AI & your data". To see the consent sheet on the demo account, switch that toggle off, then on the Plan tab tap "Regenerate" and confirm.

PERMISSIONS
- Camera / Photos: only when the user chooses to scan a meal (Tracker → Snap to log) or add a photo to a recipe.
- Notifications: local notifications only (workout reminders, rest timer). No push notifications.

HEALTH
Calorie and macro targets are general guidance computed from the user's own inputs; the app does not diagnose or treat any condition and says so in the App Store description.

CONTENT
Exercise photos are from free-exercise-db (public domain). Exercise videos are embedded YouTube videos from their original channels. Recipe import reads only the page URL or text the user supplies.
```

> The paths above were checked against `master` at wave 4 (30 Sep 2026): the tab names (Today,
> Plan, Shop, Cookbook, More), the More → Profile route, the Profile "Privacy & data" section
> (Health information, AI & your data, Usage analytics, Consent history, Gym settings, Your data),
> the "Delete account" button and the Plan tab's Regenerate button all exist. Re-check them on the
> TestFlight build before pasting.

## Attachment (optional but helps)

A 30–60 s screen recording of onboarding → plan → shopping list → gym workout → account
deletion screen (don't confirm it). Record on the simulator with
`xcrun simctl io booted recordVideo review.mov` and upload it under **Attachment**.

## Release option

Choose **"Manually release this version"** for 1.0, so you decide when it goes live after
approval (and can make sure the production API is up).
