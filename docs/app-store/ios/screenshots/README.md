# App Store screenshots

**Required:** one iPhone set at **6.9"**, 1320 × 2868 px portrait, 3–10 images, no alpha channel.
App Store Connect scales it down for smaller iPhones. No iPad set is needed
(`supportsTablet: false`). The files in `iphone-6.9/` are captured on the
**iPhone 17 Pro Max** simulator, which renders exactly 1320 × 2868.

Upload order = the order below. The first three appear in search results, so they carry the pitch.
All eight are ready in `iphone-6.9/` as alpha-free JPEGs (App Store Connect rejects images with an alpha channel).

| #   | File                 | Screen                                              | Caption idea (for framed versions later) |
| --- | -------------------- | --------------------------------------------------- | ---------------------------------------- |
| 1   | `01-plan.jpg`        | Plan tab: today's three meals, week strip, cost     | A week of meals, planned in seconds      |
| 2   | `02-recipe.jpg`      | Recipe detail: photo, tags, macros, ingredients     | Every recipe fits your goals             |
| 3   | `03-shopping.jpg`    | Shopping list: produce with prices, estimated total | One shopping list for the whole week     |
| 4   | `04-home.jpg`        | Today: calorie ring, macros, Snap to log            | See today at a glance                    |
| 5   | `05-gym-today.jpg`   | Gym mode Today: week ring, next workout             | Switch to Gym with one tap               |
| 6   | `06-gym-workout.jpg` | Active workout: prefilled sets, rest timer          | Log a set in one tap                     |
| 7   | `07-gym-summary.jpg` | Workout done: "Next time" progression suggestion    | Know what to lift next time, and why     |
| 8   | `08-cook.jpg`        | Cook mode step with timer                           | Cook one step at a time                  |

Captured 26 Sep 2026 (before waves 1–3) from branch `feat/app-store-readiness` (Release build, iPhone 17 Pro Max
simulator, iOS 26.3) with a local demo account ("Sam", US region → dollars and imperial units,
peanut allergy, curated plan). The data is made up.

## Wave-4 review: which shots are outdated (30 Sep 2026)

The eight shots were captured on 26 Sep 2026, before waves 1–3. Compared with the screens on
`master` (viewed 01, 04 and 05; the others judged from the code), **seven need retaking and one
is probably still fine**. Shots are taken by the owner or orchestrator from the integrated build
(Release, iPhone 17 Pro Max simulator, 9:41 status bar, made-up demo account). Show only Free
flows: no Premium sheet, no "See what Premium adds" card, no price or plan text (App Review
3.1.1).

| #   | File                 | Verdict                        | What changed since capture                                                                                                                                                                                                                                 |
| --- | -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `01-plan.jpg`        | **Retake**                     | Plan now has the "Checked for" safety line and chip, the how-you-cook summary and settings entry, a visible Regenerate button, "Your pick" pins, undoable Replace, and the week cost is a range (the shot shows one exact `$73.36`). Reads as old.         |
| 2   | `02-recipe.jpg`      | **Retake**                     | Recipe detail now shows safety notes for the table, servings-following nutrition and kitchen fractions ("1¾"), and the custom-ingredient flow changed.                                                                                                     |
| 3   | `03-shopping.jpg`    | **Retake**                     | Shop has the Share button, price ranges instead of exact totals and the safety notes; the Pantry savings chip is gone.                                                                                                                                     |
| 4   | `04-home.jpg`        | **Retake, and change content** | Today is now a card stack (Tonight, Tomorrow, Shop-due) and the ring label reads "Your target"/"Suggested". The shot's **Snap to log** card is a **Premium** feature (on a Free account it shows an example with "See what Premium adds"): do not show it. |
| 5   | `05-gym-today.jpg`   | **Retake**                     | Gym Today gained the richer Resume card, a Recent list, `Time today: 20 30 45 Full` chips, "How this works", the Still-time-this-week card and the Skip Undo snackbar.                                                                                     |
| 6   | `06-gym-workout.jpg` | **Retake**                     | The set row is regrouped (filled steppers, round tick, remove any set with Undo), exercise images use the 3:2 surface with placeholder, and the bottom actions are Finish, Save for later, Discard.                                                        |
| 7   | `07-gym-summary.jpg` | **Check, probably retake**     | The summary is close to the old one but gained the target-change notice path and exercise images; retake with the others so the set is consistent.                                                                                                         |
| 8   | `08-cook.jpg`        | Probably fine                  | Cook mode kept its layout (timer, large step text); only the finish screen and ingredient fractions changed. Keep unless a diff of the retaken set looks off.                                                                                              |

### Shot list to retake from the integrated build

Upload order = the order below (the first three show in search). Suggested captions are 6 words or fewer.

| #   | Screen to capture                                                                                      | Caption idea                     | Free-tier check                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------- |
| 1   | Gym Today with the `Time today` chips and a routine with "Next up" targets                             | Know what to lift next           | Gym is Free                                                          |
| 2   | Plan tab: a curated week with the "Checked for" line, one "Your pick" pin and the how-you-cook summary | A week of meals, checked for you | Curated plan, Free. No training-fit switch                           |
| 3   | Shop tab: aisles, price range, Share button                                                            | One list, sent in a tap          | Free                                                                 |
| 4   | Household editor with one member's allergy and the table summary (no scaling sheet)                    | Checked for everyone's allergies | Adding members is Free; do not show portion scaling                  |
| 5   | Active workout: regrouped set row, rest timer                                                          | Log a set in one tap             | Free                                                                 |
| 6   | Workout summary with "Next time" and its reason                                                        | Know what to lift next time      | Free                                                                 |
| 7   | Cook mode step with a timer                                                                            | Cook it step by step             | Free                                                                 |
| 8   | Today card stack (Tonight, Tomorrow, Shop-due) with the calorie ring, **no** Snap card                 | See today at a glance            | Free. Use a Free demo account, not the reviewer's Premium account    |
| 9   | Optional: Profile › Privacy & data (Health information, AI & your data, Usage analytics)               | Your data stays yours            | Free; shows the consent controls. Do not show the plan card above it |

Do not include screens that show the Premium sheet, "Your plan: Free", a Snap example, the AI chef
chat or the Cheferize import.

Rules we follow (Guideline 2.3.3 / 2.3.7):

- Show the real app UI only. No other devices, no prices that don't exist, no "#1" claims.
- No personal data: a local demo account with made-up data.
- Status bar is set to 9:41, full battery and full signal via `xcrun simctl status_bar … override`.
- Nothing debug-only on screen (no dev-client floating button, no "Chefer Dev" labels, no More-tab
  version footer).

## Re-capturing

The set is captured from a **Release** build of the app (no dev menu) running on the Pro Max
simulator against the local API with the local test data:

```bash
xcrun simctl status_bar "iPhone 17 Pro Max" override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
```

```bash
xcrun simctl io "iPhone 17 Pro Max" screenshot docs/app-store/ios/screenshots/iphone-6.9/01-plan.png  # then: sips -s format jpeg -s formatOptions 92 in.png --out out.jpg
```

To get a Release simulator build without disturbing the production `ios/` folder, build from a
separate git worktree (where `ios/` doesn't exist yet): `APP_VARIANT=development
EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo prebuild --platform ios`, then `xcodebuild
-workspace ios/*.xcworkspace -scheme <scheme> -configuration Release -destination "id=<Pro Max
UDID>" build` and `xcrun simctl install` the resulting `.app`.

Check sizes before uploading:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha docs/app-store/ios/screenshots/iphone-6.9/*.jpg
```
