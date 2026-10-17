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
3. Profile → Your plan: Free → "See what Premium adds" → "Turn on Premium" (included at no cost) so every feature is unlocked for review.
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
The account above already has a meal plan, recipes and a logged workout. Premium features are enabled on it. Premium is included at no cost for everyone: the "Turn on Premium" button (More → Profile → the "Your plan" card → "See what Premium adds", or the same sheet any locked feature opens) just switches the account's tier, and no payment is taken or asked for anywhere in the app. There are no in-app purchases.

WHERE THINGS ARE
- Food mode (default): Today, Plan, Shop, Cookbook, More tabs.
- Gym mode: use the Food/Gym switch in the header of the Food tabs. Gym works offline.
- Account deletion: More → Profile → scroll to "Privacy & data" → "Your data" (last card) → "Delete account". It asks for the password (or a fresh Apple/Google sign-in for accounts created that way) and for DELETE to be typed, then permanently deletes the account and all its data and signs out everywhere. The same card has "Sign out".
- Health information consent: the first time allergies, a diet, a goal, body measurements or a weigh-in are saved, the app asks for permission to store them (Allow and save / Don't save it; "Don't save it" stores none of it). It is separate from the AI consent below. It can be withdrawn, deleting that data, under More → Profile → "Privacy & data" → "Health information" → "Withdraw and delete".
- AI data consent: the first time an AI feature is used (plan generation, meal-photo scan, recipe import, chat) the app explains what is sent to Groq and Cloudflare Workers AI and asks for permission (Allow / Not now; "Not now" sends nothing). It can be withdrawn under More → Profile → "Privacy & data" → "AI & your data". To see the consent sheet on the demo account, switch that toggle off, then on the Plan tab tap "Week options" → "New meal plan for this week" and confirm.

SIGN-IN
Email and password, Sign in with Apple and Sign in with Google are all offered on the sign-in screen. Deleting an account that was created with Sign in with Apple also revokes its Apple token.

PERMISSIONS
- Camera / Photos: only when the user chooses to scan a meal (Tracker → Snap to log) or add a photo to a recipe.
- Notifications: local notifications only (workout reminders, rest timer). No push notifications.

HEALTH
Calorie and macro targets are general guidance computed from the user's own inputs; the app does not diagnose or treat any condition and says so in the App Store description.

CONTENT
Exercise photos come from the open free-exercise-db dataset and openly licensed Wikimedia Commons images (credited in the app's sources); a few are AI-generated illustrations. Ingredient thumbnails in the shopping list are AI-generated illustrations. Exercise videos are embedded YouTube videos from their original channels; the player and the Terms/Privacy pages are locked to their own content, and any other link opens in Safari. Recipe import reads only the page URL or text the user supplies.

FOLLOWING
The app contains a 'Following' feature (following other users) that is switched off on the server for every account. It will only be enabled together with a future app version submitted for review.
```

> The paths above were re-checked against `master` on 8 Oct 2026 (1.0.1 build 8): the tab names (Today,
> Plan, Shop, Cookbook, More), the More → Profile route, the Profile "Privacy & data" section
> (Health information, AI & your data, Usage analytics, Consent history, Gym settings, Your data with
> Export · Sign out · Delete account) and the Plan tab's "Week options" sheet all exist. Re-check them on
> the TestFlight build before pasting.

## Attachment (optional but helps)

A 30–60 s screen recording of onboarding → plan → shopping list → gym workout → account
deletion screen (don't confirm it). Record on the simulator with
`xcrun simctl io booted recordVideo review.mov` and upload it under **Attachment**.

## Release option

Choose **"Manually release this version"** for 1.0, so you decide when it goes live after
approval (and can make sure the production API is up).

---

## At Following launch (draft)

**Do not use this for the 1.0.1 submission.** The notes and sign-in above describe the build being submitted
now and stay as they are. They already say (R-05 of the [2026-10-01 review simulation](./app-review-simulation-2026-10-01.md))
that Following exists but is off on the server and will only be enabled with a future version submitted for review. Use this section when Following is switched on for everyone (the order is in
[privacy-and-rating.md](./privacy-and-rating.md#order-for-the-owner)). Why each line is there:
[`docs/friends/prd.md`](../../friends/prd.md) §9.6 and §14. Counsel review pending.

### Notes: add this block

Add it after the `CONTENT` paragraph of the notes above, and **delete the short `FOLLOWING` paragraph
("switched off on the server for every account") that the 1.0.x notes now carry**: this block replaces it.
The 1.0.x notes are 2,804 characters including that paragraph (209), and this block is 1,370, so the total
is about 3,967, under the 4,000 limit but with little room. Check the real total in App Store Connect after
pasting.

```
FOLLOWING (user-generated content, enabled for the demo account)
Signed-in users can follow each other and see what each person chooses to share: this week's meals, their own recipes, their routine and last 7 days of workouts. It is off until a user turns it on (More → Following, below Profile; in Gym mode, the gear icon → Following). Names are visible to other users. There is no messaging, comment or feed. Email addresses are never shown, and there is no search by email.
FILTER: a word filter rejects offensive display names and shared-recipe text.
REPORT: on a profile, "..." → "Report and block"; on a recipe, "..." → "Report recipe". One tap on a reason.
BLOCK: "..." → "Block" is instant and works both ways. Reporting also blocks at once. Undo: Following → gear → Sharing & privacy → Blocked people.
TIMELY ACTION: there is no manual queue; every response is automatic. For the reporter it is immediate. A recipe reported by 3 accounts is hidden for everyone; an account reported by 5 accounts is forced private and removed from search.
CONTACT: https://chefer.duckdns.org/support
DEMO: the demo account already follows "Chefer Kitchen" and "Demo Cook" and is followed back by Demo Cook. To try Report and block, use "Demo Cook Two" (Unblock restores it). Following → gear → Turn off Following deletes the user's social data; Delete account removes all of it.
```

Replace the demo names with the real ones if you choose other names. The paths were taken from the UX
design (`docs/friends/ux-design.md` §11) and must be re-checked on the TestFlight build, as the paths above
were.

### Sign-in and demo accounts

- Sign-in fields stay the single review account. The demo profiles it follows ("Chefer Kitchen", "Demo Cook",
  "Demo Cook Two") need no login for the reviewer. Do not paste their passwords anywhere.
- The review account must be able to see Following: its user id in `FRIENDS_ALLOWLIST`, or the `friends`
  flag on. Otherwise App Review sees no user-generated content.
- How to create the three profiles on **production** (the dev seed accounts do not exist there, and their
  passwords must never be used there): [privacy-and-rating.md → Demo accounts for App Review at Following
  launch](./privacy-and-rating.md).
- Keep the three demo profiles' names and recipes clean. The word filter applies to them too.

### Mapping to Guideline 1.2

The full table (filter, report, block, contact, and how "timely" is met by the instant block and hide for the
reporter plus the automatic threshold hide) is in [privacy-and-rating.md → Guideline 1.2](./privacy-and-rating.md).
If App Review asks a follow-up question about moderation, that table is the answer.

### Age rating

Set "User-generated content shared with other users" to **Yes** (see [privacy-and-rating.md](./privacy-and-rating.md)).
