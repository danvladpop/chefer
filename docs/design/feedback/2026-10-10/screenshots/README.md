# 10 Oct redesign — before / after

- `before-board-*.png`: the canvas "Before — 10 Oct" boards, faithful redraws of `master` before the redesign.
- `after-*.png`: the app running this branch with You → Preview → "New design" on, iPhone 17 simulator (iOS 26), demo account on a local seeded database with mock AI.
- `after-android-*.png`: the same on the `Pixel_8` emulator.

The iOS simulator used here draws every emoji as a "?" box (Safari on it does too), so the macro emojis and 🏆 badges look broken in the iOS shots. Android renders them correctly.

| Screen                                  | Before                               | After (iOS)                                | After (Android)           |
| --------------------------------------- | ------------------------------------ | ------------------------------------------ | ------------------------- |
| Today                                   | `before-board-home.png`              | `after-today.png`                          | `after-android-today.png` |
| Meals (was Plan)                        | `before-board-plan.png`              | `after-meals.png`                          | `after-android-meals.png` |
| Shop                                    | `before-board-shop.png`              | `after-shop.png`, `after-shop-checked.png` | `after-android-shop.png`  |
| Train                                   | `before-board-train.png`             | `after-train.png`                          | `after-android-train.png` |
| You                                     | `before-board-you.png`               | `after-you.png`                            |                           |
| Account (was Settings)                  | `before-board-settings.png`          | `after-account.png`                        |                           |
| Meal settings (was Plan settings sheet) | `before-board-plansettingssheet.png` | `after-meal-settings.png`                  |                           |
| Training settings (was Gym settings)    | `before-board-gymsettings.png`       | `after-training-settings.png`              |                           |
| Stats (was Progress)                    | `before-board-progress.png`          | `after-stats.png`                          |                           |
