# App Store screenshots

**Required:** one iPhone set at **6.9"**, 1320 × 2868 px portrait PNG/JPEG, 3–10 images.
App Store Connect scales it down for smaller iPhones. No iPad set is needed
(`supportsTablet: false`). The files in `iphone-6.9/` are captured on the
**iPhone 17 Pro Max** simulator, which renders exactly 1320 × 2868.

Upload order = the order below. The first three appear in search results, so they carry the pitch.

| #   | File                 | Screen                                     | Caption (for the upload's order, or for framed versions later) |
| --- | -------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| 1   | `01-plan.png`        | Plan tab: this week's meals                | A week of meals, planned in seconds                            |
| 2   | `02-recipe.png`      | Recipe detail with photo, macros           | Every recipe fits your goals and allergies                     |
| 3   | `03-shopping.png`    | Shopping list grouped by category, total   | One shopping list for the whole week                           |
| 4   | `04-home.png`        | Home dashboard: today's meals and progress | See today at a glance                                          |
| 5   | `05-gym-today.png`   | Gym mode: Today / next workout             | Switch to Gym with one tap                                     |
| 6   | `06-gym-workout.png` | Active workout: prefilled sets, rest timer | Log a set in one tap                                           |
| 7   | `07-cook.png`        | Cook mode step                             | Cook one step at a time                                        |

Rules we follow (Guideline 2.3.3 / 2.3.7):

- Show the real app UI only. No other devices, no prices that don't exist, no "#1" claims.
- No personal data. The screenshots use a local test account with made-up data.
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
xcrun simctl io "iPhone 17 Pro Max" screenshot docs/app-store/ios/screenshots/iphone-6.9/01-plan.png
```

To get a Release simulator build without disturbing the production `ios/` folder, build from a
separate git worktree (where `ios/` doesn't exist yet): `APP_VARIANT=development
EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo prebuild --platform ios`, then `xcodebuild
-workspace ios/*.xcworkspace -scheme <scheme> -configuration Release -destination "id=<Pro Max
UDID>" build` and `xcrun simctl install` the resulting `.app`.

Check sizes before uploading:

```bash
sips -g pixelWidth -g pixelHeight docs/app-store/ios/screenshots/iphone-6.9/*.png
```
