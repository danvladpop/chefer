# App Store listing — copy-paste text (English, U.S.)

Everything on this page goes into **App Store Connect → your app → iOS App → 1.0 Prepare for
Submission** unless a different location is given. Character limits are Apple's; the counts in
brackets were checked with `scripts/check-lengths.mjs` in this folder.

---

## App information (App Store Connect → App Information)

| Field              | Value                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name (≤ 30)        | `Chefer: Meal Planner & Gym` [26]                                                                                                                                                                                             |
| Subtitle (≤ 30)    | `Weekly meals, lists & lifting` [29]                                                                                                                                                                                          |
| Primary language   | English (U.S.)                                                                                                                                                                                                                |
| Bundle ID          | `dev.chefer.app`                                                                                                                                                                                                              |
| SKU                | `chefer-ios-001` (internal only, never shown)                                                                                                                                                                                 |
| Primary category   | Food & Drink                                                                                                                                                                                                                  |
| Secondary category | Health & Fitness                                                                                                                                                                                                              |
| Content rights     | **Yes, it contains third-party content, and I have the rights to use it.** Recipe import reads pages the user supplies, exercise photos come from free-exercise-db (public domain), exercise videos are embedded from YouTube |
| Age rating         | see [privacy-and-rating.md](./privacy-and-rating.md#age-rating)                                                                                                                                                               |
| Privacy policy URL | `https://chefer.duckdns.org/privacy`                                                                                                                                                                                          |

**If the name is taken:** App Store names are unique. Try these in order:
`Chefer – AI Meal Planner` [24], `Chefer: Meals, Lists & Gym` [26], `Chefer Kitchen & Gym` [20].
The name on the home screen stays "Chefer" regardless (it comes from `app.config.js`).

---

## Version information (1.0 Prepare for Submission)

### Promotional text (≤ 170, editable any time without a new review)

```
Plan a week of meals around your allergies and goals in seconds, shop from one list, cook step by step, and log your lifts. Premium features are free for now.
```

[158]

### Description (≤ 4000)

```
Chefer is your personal chef and training partner. It plans the week's meals around the way you eat, builds the shopping list for you, walks you through every recipe, and tracks your workouts.

PLAN A WEEK OF MEALS IN SECONDS
• A full week of breakfasts, lunches and dinners, built around your goals, calorie and macro targets, budget and the time you have to cook.
• Allergies, restrictions and dislikes are respected in every plan, on every tier.
• Don't fancy a meal? Replace it from your own recipes, or ask the chef for a new idea.
• Found a week you love? Save it to My Weeks and rotate up to four weeks, or let it carry forward automatically.

SHOP FROM ONE LIST
• Every ingredient for the week, merged and grouped by category, with an estimated total.
• Check items off as you shop; your list stays in sync between your phone and the web.
• Pantry mode remembers what you already have, so plans use it up before it goes to waste.

COOK WITHOUT THE MESS
• Cook mode shows one step at a time in large text and keeps the screen awake.
• Import any recipe from a link or pasted text, then "Cheferize" it to fit your allergies and goals.
• Add your own recipes with photos.

TRACK WHAT YOU EAT
• Log meals from your plan with one tap, or snap a photo and let Chefer estimate it.
• A weekly review from your chef looks at how the week went and adjusts the next one.
• Log your weight and see the trend.

TRAIN IN GYM MODE
• Switch from Food to Gym with one tap.
• Answer a few questions and get a recommended routine you can edit freely.
• Targets come prefilled, so logging a set is one tap. A rest timer runs between sets.
• Progressive overload that explains itself: after each workout Chefer tells you what to lift next time, and why.
• Works offline in the gym and syncs when you're back online.
• A weekly goal ring and week streaks instead of a daily streak that punishes rest days.
• Exercise library with photos, cues, common mistakes and video demos.

COOK FOR THE WHOLE HOUSEHOLD
• Add household members with their own allergies and preferences. Chefer plans meals that work for everyone.

ASK THE CHEF
• Chat with an AI chef about your plan: substitutions, leftovers, prep-ahead tips.

PRIVACY FIRST
• Chefer asks before sending anything to an AI service, and your data is never used to train AI models.
• No ads, no data selling. Delete your account and data from the app at any time.

Chefer works on iPhone and on the web at chefer.duckdns.org with the same account.

Chefer offers general meal-planning and fitness guidance. It is not medical advice. Talk to a doctor or dietitian before major changes to your diet or training, especially if you have a medical condition.
```

### Keywords (≤ 100, comma-separated, no spaces after commas)

```
recipes,grocery,shopping list,calorie,macro,nutrition,diet,allergy,pantry,cook,workout,weight,food
```

[98]. Do not repeat words already in the name or subtitle (meal, planner, gym, weekly, lists,
lifting); Apple indexes those already.

### Support URL / Marketing URL

| Field         | Value                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Support URL   | `https://chefer.duckdns.org/support` (the page is added on branch `feat/app-store-readiness`, so deploy it first) |
| Marketing URL | `https://chefer.duckdns.org` (optional)                                                                           |

### Version / copyright

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| Version    | `1.0.0` (must match `version` in `app.config.js`)                                     |
| Copyright  | `2026 <seller name>`: the friend's legal name or company, because they are the seller |
| What's New | not shown for the first version                                                       |

### Screenshots

See [screenshots/README.md](./screenshots/README.md). The **iPhone 6.9" set** (8 images, 1320 × 2868 px)
is ready in `screenshots/iphone-6.9/`. No iPad set is needed because `supportsTablet: false`.

### App icon

No separate upload. App Store Connect takes the 1024 × 1024 icon from the build
(`apps/mobile/assets/icon.png`, which has no alpha channel and is already correct).
