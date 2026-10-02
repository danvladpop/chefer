# App Store listing — copy-paste text (English, U.S.)

Everything on this page goes into **App Store Connect → your app → iOS App → the version's Prepare for
Submission page** unless a different location is given. It describes only what has shipped on
`master` at wave 4 (30 Sep 2026) and is free-tier-true on iOS (no Premium, price, plan, trial or
upgrade wording, App Review 3.1.1; no "beta", 2.2). Character limits are Apple's; the counts in
brackets were checked with `scripts/check-lengths.mjs` in this folder.

---

## App information (App Store Connect → App Information)

| Field              | Value                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name (≤ 30)        | `Chefer: Meal Planner & Gym` [26]                                                                                                                                                                                             |
| Subtitle (≤ 30)    | `Weekly meals, lists & lifting` [29]                                                                                                                                                                                          |
| Primary language   | English (U.S.)                                                                                                                                                                                                                |
| Bundle ID          | `com.popdan.chefer`                                                                                                                                                                                                           |
| SKU                | `chefer-ios-001` (internal only, never shown)                                                                                                                                                                                 |
| Primary category   | Food & Drink                                                                                                                                                                                                                  |
| Secondary category | Health & Fitness                                                                                                                                                                                                              |
| Content rights     | **Yes, it contains third-party content, and I have the rights to use it.** Recipe import reads pages the user supplies, exercise photos come from free-exercise-db (public domain), exercise videos are embedded from YouTube |
| Age rating         | see [privacy-and-rating.md](./privacy-and-rating.md#age-rating)                                                                                                                                                               |
| Privacy policy URL | `https://chefer.duckdns.org/privacy`                                                                                                                                                                                          |

**Name approved by the owner (26 Sep 2026).** If App Store Connect says it's taken (names are unique), try these in order:
`Chefer – AI Meal Planner` [24], `Chefer: Meals, Lists & Gym` [26], `Chefer Kitchen & Gym` [20].
The name on the home screen stays "Chefer" regardless (it comes from `app.config.js`).

---

## Version information (1.0 Prepare for Submission)

### Promotional text (≤ 170, editable any time without a new review)

```
Plan a week of meals around your allergies, shop from one list, cook step by step, and log your lifts. Chefer tells you what to lift next, and why.
```

[147]

### Description (≤ 4000)

```
Chefer is a meal planner and a gym log in one app. It plans the week's meals around the way you eat, builds the shopping list, walks you through every recipe, and tells you what to lift next.

A WEEK OF MEALS, IN ONE TAP
• Plan the week in one tap. Choose which meals you want planned, which days, and how long you have to cook.
• Allergies, diets and dislikes are checked on every plan, and each plan shows what it was checked for.
• Don't fancy a meal? Replace it with one of your own recipes, or pin the ones you love so they stay when you plan again.
• Found a week you like? Save it (up to four weeks) and reuse it.

COOKING FOR A HOUSEHOLD
• Add the people you cook for with their own allergies and dislikes. Every plan is checked against everyone at your table.

ONE SHOPPING LIST
• Every ingredient for the week, merged and grouped by category, with a rough cost.
• Tick items off as you shop, and share the list with a tap.
• Your list stays in sync between your phone and the web.

COOK STEP BY STEP
• Cook mode shows one step at a time in large text, with timers, and keeps the screen awake.
• Add your own recipes with photos.

TRACK WHAT YOU EAT
• Today shows tonight's dinner, tomorrow's meals and what is due to shop for.
• Log a meal from your plan in one tap, search for a food, or quick-add calories.
• Log your weight and see the trend.

TRAIN IN GYM MODE
• Switch from Food to Gym with one tap.
• Answer a few questions and get a recommended routine you can edit freely.
• Targets come prefilled, so logging a set is one tap. A rest timer runs between sets.
• Progressive overload that explains itself: after each workout Chefer tells you what to lift next time, and why.
• Short on time? Pick 20, 30 or 45 minutes and get a shorter version of today's workout. What you skip carries over to your next session.
• Save a workout for later and finish it when you can. Made a mistake? Edit or delete a past workout, with Undo.
• Works offline in the gym and syncs when you're back online.
• A weekly goal ring and week streaks instead of a daily streak that punishes rest days.
• Exercise library with photos, cues, common mistakes and video demos.
• Optional workout reminders, and a gentle nudge if you have gone quiet.

PRIVACY FIRST
• Chefer asks before it stores your health information and before it sends anything to an AI service. Your data is never used to train AI models.
• No ads, no data selling. Export your data or delete your account from the app at any time.

Chefer works on iPhone and on the web at chefer.duckdns.org with the same account.

Chefer offers general meal-planning and fitness guidance. It isn't a medical device and doesn't give medical advice. Talk to a doctor or dietitian before major changes to your diet or training, especially if you have a health condition.
```

### Keywords (≤ 100, comma-separated, no spaces after commas)

```
recipes,grocery,shopping list,calorie,macro,nutrition,diet,allergy,strength,cook,workout,weight,food
```

[100]. Do not repeat words already in the name or subtitle (meal, planner, gym, weekly, lists,
lifting); Apple indexes those already.

### Support URL / Marketing URL

| Field         | Value                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Support URL   | `https://chefer.duckdns.org/support` (in `master`; open it in a browser before submitting to confirm it is live) |
| Marketing URL | `https://chefer.duckdns.org` (optional)                                                                          |

### Version / copyright

| Field      | Value                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Version    | `1.0.0` for the first release (must match `version` in `app.config.js`); the owner picks the number for the wave-4 update |
| Copyright  | `2026 <seller name>`: the friend's legal name or company, because they are the seller                                     |
| What's New | not shown for the first version; draft for the first update below                                                         |

#### What's New: draft for the first update after 1.0.0 is live (≤ 4000)

Every line is a shipped, free-tier iOS flow (see the table at the end of this file). Paste only
the lines that are in the build being submitted.

```
• Short on time? Pick 20, 30 or 45 minutes on Gym Today and get a shorter version of your workout. What you skip carries over to next time.
• Edit or delete a past workout, with Undo, and Chefer tells you if your next-time targets changed.
• Every plan is checked against your allergies and shows what it was checked for.
• New Health information setting under Profile > Privacy & data: see it, allow it, or withdraw and delete it.
• Share your shopping list with one tap.
• Save a workout for later and finish it when you can.
```

### Screenshots

See [screenshots/README.md](./screenshots/README.md). The **iPhone 6.9" set** (7 images, 1320 × 2868 px)
is in `screenshots/iphone-6.9/`, retaken on 2 Oct 2026 from the App Review fix build (Free account,
no Premium wording). No iPad set is needed because `supportsTablet: false`.

### App icon

No separate upload. App Store Connect takes the 1024 × 1024 icon from the build
(`apps/mobile/assets/icon.png`, which has no alpha channel and is already correct).

---

## Claims → flow (T-25.3, AC3 evidence)

Checked against `master` at wave 4 (30 Sep 2026). "Tier" is the plan the flow works on in the
iOS app; **every row is Free**, so nothing in the listing depends on Premium. Paths are under
`apps/mobile/`. The tier comes from `packages/types/src/plan-features.ts` (`PLAN_FEATURES`) and
from the absence of any `isPremium` / `openPremium` gate in the screen's code; all feature flags
in `packages/types/src/feature-flags.ts` are treated as **off** (the default), so nothing here
relies on a flag.

| Listing claim                                                                                     | Screen / route (code)                                                                                                  | Tier | Note                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Plan the week in one tap                                                                          | Plan tab `app/(food)/meal-plan.tsx` (Generate)                                                                         | Free | Free plans draw from the chef-curated pool, capped at 3 a day (`planGenerationsPerDay`)                                                  |
| Choose which meals, which days, how long you have to cook                                         | Plan → plan settings `src/features/meal-plan/plan-settings-sheet.tsx`, `how-you-cook-form.tsx` (UX-07)                 | Free | The "fit training" switch inside it is Premium and is **not** claimed                                                                    |
| Allergies, diets and dislikes checked on every plan; shows what it was checked for                | `src/features/safety/checked-for-line.tsx`, `checked-for-chip.tsx`; Settings › Allergies & diets (UX-01/02)            | Free | `safetyPreferences` is free on purpose. If the user declines the health consent, plans are not checked and the app says so (Today card)  |
| Replace a meal with one of your own recipes                                                       | `src/features/meal-plan/recipe-picker-sheet.tsx` (`mealPlan.replaceRecipe`, un-gated)                                  | Free | The AI "regenerate" footer of the same sheet is Premium and is **not** claimed                                                           |
| Pin the meals you love so they stay when you plan again                                           | `src/features/meal-plan/plan-meal-card.tsx` ("Your pick", `mealPlan.setSlotPinned`)                                    | Free |                                                                                                                                          |
| Save a week (up to four) and reuse it                                                             | `app/my-weeks.tsx` (`MAX_TEMPLATES = 4`; "Save a week you like and reuse it…")                                         | Free | The 1.0.0 wording "rotate up to four weeks" was wrong (no automatic rotation, parity-ledger row of 26 Sep); replaced                     |
| Add the people you cook for with their own allergies and dislikes; plans checked against everyone | `app/household.tsx`, `src/features/household/household-editor.tsx`                                                     | Free | Adding members and their allergies is free (`householdMembers`); portion **scaling** is Premium and is **not** claimed                   |
| Ingredients merged and grouped by category, with a rough cost                                     | Shop tab `app/(food)/shopping-list.tsx` (price range via `formatPriceRange`)                                           | Free | "Every tier sees the estimated week cost" (`budgetAwarePlanning` description). Pantry coverage is Premium and is **not** claimed         |
| Tick items off as you shop                                                                        | `app/(food)/shopping-list.tsx`                                                                                         | Free |                                                                                                                                          |
| Share the list with a tap                                                                         | `app/(food)/shopping-list.tsx` → `src/features/shopping-list/share-list-sheet.tsx` (system share sheet)                | Free | Not an AI call, no gate                                                                                                                  |
| List stays in sync between phone and web                                                          | same account on `chefer.duckdns.org`; `shoppingList.*` tRPC                                                            | Free |                                                                                                                                          |
| Cook mode: one step at a time, large text, timers, screen stays awake                             | `app/cook/[id].tsx` (`useKeepAwake`)                                                                                   | Free |                                                                                                                                          |
| Add your own recipes with photos                                                                  | `app/recipe-form.tsx`; on-device resize via `expo-image-manipulator` (`src/lib/prepare-photo.ts`)                      | Free | No gate on the form                                                                                                                      |
| Today shows tonight's dinner, tomorrow's meals, what is due to shop for                           | Today tab `app/(food)/index.tsx` → `src/features/dashboard/components/tonight-card.tsx` (T-04.4)                       | Free |                                                                                                                                          |
| Log a meal from your plan in one tap, search for a food, quick-add calories                       | `app/tracker.tsx`, `src/features/tracker/quick-add-sheet.tsx`                                                          | Free | Photo scan (Snap to log) is Premium and is **not** claimed                                                                               |
| Log your weight and see the trend                                                                 | `app/progress.tsx` → `src/features/coach/weight-log-form.tsx`, `weight-card.tsx`                                       | Free | The weekly chef review is Premium and is **not** claimed                                                                                 |
| Switch from Food to Gym with one tap                                                              | `src/features/gym/components/mode-switch.tsx` (header of every tab root)                                               | Free | `gymTraining` is free                                                                                                                    |
| Recommended routine from a few questions, editable                                                | `app/gym/setup.tsx`, `app/gym/routine-editor.tsx`, `app/(gym)/routine.tsx`                                             | Free |                                                                                                                                          |
| Prefilled targets, one-tap sets, rest timer                                                       | `app/gym/workout.tsx` (`src/features/gym/workout/set-row.tsx`, `rest-timer-bar.tsx`)                                   | Free |                                                                                                                                          |
| "Next time" targets that say why                                                                  | `app/gym/summary/[id].tsx`; Gym Today "Next up"                                                                        | Free |                                                                                                                                          |
| Shorter version of today's workout (20, 30, 45 minutes); skipped work carries over                | `src/features/gym/today/time-today-chips.tsx`, `time-today.ts` (T-36.6)                                                | Free | Wave 3                                                                                                                                   |
| Save a workout for later                                                                          | `src/features/gym/workout/workout-sheets.tsx`, `today/resume-card.tsx` (T-36.3)                                        | Free | Wave 1                                                                                                                                   |
| Edit or delete a past workout, with Undo                                                          | Gym Today Recent (`today/recent-workouts.tsx`), `app/gym/session/[id].tsx`, `workout/edit-session-screen.tsx` (UX-44)  | Free | Wave 2                                                                                                                                   |
| Works offline in the gym, syncs later                                                             | `src/features/gym/offline/*` (SQLite outbox)                                                                           | Free |                                                                                                                                          |
| Weekly goal ring and week streaks                                                                 | `app/(gym)/today.tsx` → `today/today-screen.tsx` (`formatStreakLine`)                                                  | Free |                                                                                                                                          |
| Exercise library with photos, cues, mistakes, video demos                                         | `app/(gym)/exercises.tsx`, `app/gym/exercise/[id].tsx` (YouTube embed)                                                 | Free |                                                                                                                                          |
| Workout reminders, gentle nudge if you have gone quiet                                            | `app/gym/settings.tsx` → `src/features/gym/settings/settings-screen.tsx`, `reminders/schedule.ts` (T-36.2)             | Free | Local notifications only, no push                                                                                                        |
| Asks before storing health information                                                            | `src/features/privacy/use-health-consent.tsx` (sheet on the first save), Profile › Privacy & data › Health information | Free | Wave 3. Copy pending counsel review                                                                                                      |
| Asks before sending anything to an AI service; data not used to train models                      | `useAiConsent()` gate; Profile › Privacy & data › AI & your data                                                       | Free | Sheet names Groq and Cloudflare Workers AI                                                                                               |
| No ads, no data selling                                                                           | No ad SDK, no advertising id, no ATT (see [release-1-checklist.md](../release-1-checklist.md) section D)               | n/a  |                                                                                                                                          |
| Export your data or delete your account from the app                                              | Profile › Privacy & data › Your data (`src/features/profile/account-data-card.tsx`)                                    | Free | Export shares `chefer-export-YYYY-MM-DD.json`                                                                                            |
| Medical disclaimer (AC5)                                                                          | Last paragraph of the description                                                                                      | n/a  | The words "medical device" and "medical advice" appear only in that negative sentence; the copy grep for claims (AC6) finds nothing else |
| Works on iPhone and the web with the same account                                                 | `chefer.duckdns.org`                                                                                                   | Free |                                                                                                                                          |

### Removed from the iOS listing (Premium-gated, or not shipped)

The 1.0.0 (5) draft claimed these. They are gone from this version because they are Premium-only
(and App Review 3.1.1 forbids plan wording in iOS text, so they cannot be marked "Premium"), or
they are not real:

| Removed claim                                                              | Why                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "built around your … calorie and macro targets, budget" in plan generation | Personal targets (`profilePersonalisation`) and budget-aware planning (`budgetAwarePlanning`) are Premium |
| "ask the chef for a new idea" (AI swap)                                    | `aiMealSwaps` is Premium                                                                                  |
| "Pantry mode remembers what you already have, so plans use it up"          | `pantryPlanning` is Premium; UX-25 AC4 forbids pantry-driven claims                                       |
| "Import any recipe from a link … Cheferize it"                             | `recipeImport` is Premium                                                                                 |
| "snap a photo and let Chefer estimate it"                                  | `photoLogging` (`mealScansPerDay`) is Premium                                                             |
| "A weekly review from your chef … adjusts the next one"                    | `adaptiveCoaching` is Premium                                                                             |
| "Chat with an AI chef"                                                     | `chatMessagesPerDay` is Premium                                                                           |
| "Chefer plans meals that work for everyone" (portion scaling)              | Scaling is `householdPlans` (Premium); the safety check for everyone at the table is kept                 |
| "Premium features are free for now."                                       | Plan wording; not allowed in iOS text                                                                     |
| "rotate up to four weeks, or let it carry forward automatically"           | Wrong: My weeks saves and reuses; the followed week repeats until you switch                              |

If the owner wants those features back in the listing, the two routes are: keep them out (this
file), or accept a listing that names features Premium unlocks, which needs a review of
guideline 3.1.1 first. Not decided here.
