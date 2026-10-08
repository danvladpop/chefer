# App Store screenshots

**Required:** one iPhone set at **6.9"**, 1320 × 2868 px portrait, 3–10 images, no alpha channel.
App Store Connect scales it down for smaller iPhones. No iPad set is needed
(`supportsTablet: false`). The files in `iphone-6.9/` are captured on the
**iPhone 17 Pro Max** simulator, which renders exactly 1320 × 2868.

Upload order = the order below. The first three appear in search results, so they carry the pitch.
All seven are ready in `iphone-6.9/` as alpha-free JPEGs (App Store Connect rejects images with an alpha channel).

| #   | File                 | Screen                                                                              | Caption idea                     |
| --- | -------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| 1   | `01-gym-routine.jpg` | Gym Routine: Full Body 3×, every exercise with its "Next" target                    | Know what to lift next           |
| 2   | `02-plan.jpg`        | Plan: "Checked for Peanuts", training day, Week options, macros per meal            | A week of meals, checked for you |
| 3   | `03-shopping.jpg`    | Shop: "From your plan's recipes", "Checked for your table", price range, thumbnails | One list, sent in a tap          |
| 4   | `04-today.jpg`       | Today card stack: Tomorrow, things to buy, Later today, Your week                   | See today at a glance            |
| 5   | `05-gym-workout.jpg` | Active workout: prefilled sets, PR, reps-in-reserve prompt, rest timer              | Log a set in one tap             |
| 6   | `06-gym-summary.jpg` | Workout done: PR and "Next time" with its reason                                    | Know what to lift next time      |
| 7   | `07-cook.jpg`        | Cook mode step with a running timer                                                 | Cook it step by step             |

**Retaken 2 Oct 2026** (App Review simulation R-06) from the `fix/app-review-2026-10` Release build on the
iPhone 17 Pro Max simulator (iOS 26.5, en_US region → dollars and imperial units, status bar 9:41) with a
local Free demo account ("Sam", peanut allergy, curated week, Full Body 3×). The data is made up. Seven
shots (Apple needs 3–10). Deliberately left out, per the rules below: the Household editor (its page
carries a Premium upsell), Profile › Privacy & data (its coach-review note says "(Premium)"), and the top
of Today (the Free "Snap to log" example card). The previous set (26 Sep, before waves 1–3) was removed.

**8 Oct 2026:** `02-plan` and `03-shopping` retaken for 1.0.1 (8) after the tester-feedback round (Plan cards with
macros and one "Week options" button, no price line; Shop without "In my kitchen", with ingredient thumbnails),
on the iPhone 17 Pro Max simulator (dev client, status bar 9:41, same local "Sam" demo data). `06-gym-summary`
kept: the only change there is that exercise names are no longer underlined.

Before uploading, check the shots against the build you submit; retake any screen that changed since.

Rules we follow (Guideline 2.3.3 / 2.3.7):

- Show the real app UI only. No other devices, no prices that don't exist, no "#1" claims.
- No personal data: a local demo account with made-up data.
- Status bar is set to 9:41, full battery and full signal via `xcrun simctl status_bar … override`.
- Nothing debug-only on screen (no dev-client floating button, no "Chefer Dev" labels, no More-tab
  version footer).
- Free-tier screens only: no Premium sheet or upsell, no "Your plan" text, no Snap example, no AI chef
  chat, no recipe import (App Review 3.1.1 forbids plan wording in iOS screenshots).

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
