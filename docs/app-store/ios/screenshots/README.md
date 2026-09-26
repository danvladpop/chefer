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

Captured 26 Sep 2026 from branch `feat/app-store-readiness` (Release build, iPhone 17 Pro Max
simulator, iOS 26.3) with a local demo account ("Sam", US region → dollars and imperial units,
peanut allergy, curated plan). The data is made up.

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
