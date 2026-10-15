# Premium motion (2026-10-15)

Proposal: <https://claude.ai/code/artifact/ed98eb20-3d26-4b55-a3e3-2ff7d3e852b1> (owner chose "everything").
This file is the in-repo record of the patterns it added and where each moment lives.

## Ground rules

- **OTA only.** Reanimated 4.5, `react-native-svg`, `expo-haptics`, `expo-image`. No Lottie, Skia,
  `react-native-gesture-handler` or `expo-blur` (each needs a new store binary).
- Tokens from `@chefer/tokens` only; transform and opacity only; every config carries
  `ReduceMotion.System`, and components that read `useReducedMotion()` jump to the end state.
- Animations play on a user action or a screen's first load of the session, never on every tab
  switch. Celebrations are 1 s and never take touches.

## Patterns added

The original motion-system catalogue (MO-01…MO-15) predates this file; these extend it.

| ID    | Pattern                                                                                                      | Kit piece                     |
| ----- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| MO-16 | Check-off: disc grows from the centre on `bouncy`, tick draws along its stroke in `fast`; reversed on untick | `AnimatedCheck`, `FloatUp`    |
| MO-17 | Strike-through sweeps left → right (`scaleX`, `base`, `enter`)                                               | `StrikeLine`                  |
| MO-18 | Celebration: ~24 confetti shapes from one shared value, `celebrate` (1 s), success haptic by the caller      | `Celebration`                 |
| MO-14 | (existing) pop on `bouncy`, now with an optional one-time shine                                              | `PopIn`                       |
| MO-03 | (existing) skeleton → content: 8 pt rise + fade, 30 ms stagger capped at 6                                   | `enterUp`, `useFirstEntrance` |
| MO-04 | (existing) list insert/remove; siblings glide on `gentle`                                                    | `listEntering/Exiting/Layout` |

## Moments

| #   | Moment                                                                                                                  | Where                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Tick a meal on Today                                                                                                    | `shell/today/your-day-card.tsx`, `next-meal-card.tsx`        |
| 2   | Day complete (last meal)                                                                                                | `shell/today/use-day-complete.ts`, `nutrition-card.tsx`      |
| 3–4 | Shop check-off, aisle fold, list done                                                                                   | `shell/shop/shop-screen.tsx`                                 |
| 5   | Set ✓ in a workout (drawn tick, tint fade)                                                                              | `gym/workout/set-row.tsx`                                    |
| 6   | PR pill pops with one shine                                                                                             | `gym/workout/set-row.tsx`                                    |
| 7   | Rest bar slides in/out, linear fill, last-3-s pulse                                                                     | `gym/workout/rest-timer-bar.tsx`                             |
| 8   | Workout summary choreography + burst on a PR or week goal                                                               | `shell/train/workout-summary-v2.tsx`                         |
| 13  | Workout mini bar rises in, live dot breathes                                                                            | `shell/workout-mini-bar.tsx`                                 |
| 10  | Tab entrances (first load per session)                                                                                  | `Stagger` + `useFirstEntrance` in Today, Meals, Train, You   |
| 11  | Workout sets added/removed glide                                                                                        | `gym/workout/exercise-card.tsx`                              |
| 12  | Shop aisle chevron turns; rows fade in/out                                                                              | `Rotate`, `shell/shop/shop-screen.tsx`                       |
| 14  | Photos fade in (and again on a swap); Meals loads as skeleton cards                                                     | `MediaFrame`, `shell/meals/meals-screen.tsx`                 |
| 9   | Tab bar pop, haptic, crossfade                                                                                          | `app/(main)/_layout.tsx`, `shell/tab-icon.tsx`               |
| 15  | Suggested kcal counts up                                                                                                | `preferences/targets-card.tsx`                               |
| 16  | Charts draw in (lines left → right, bars bottom → top)                                                                  | `charts/chart-reveal.tsx`, `line-chart.tsx`, `bar-chart.tsx` |
| 17  | Onboarding: progress fill glides, steps slide in from their side                                                        | `onboarding/onboarding-wizard.tsx`                           |
| 18  | Cook mode: ingredient tick + strike, step slide, progress, finish burst                                                 | `app/cook/[id].tsx`                                          |
| 19  | Stats: tabs slide in from their side; a range switch redraws the charts, recounts the tiles and regrows the muscle bars | `shell/stats/stats-screen.tsx`, `strength-tab.tsx`           |

Haptics: ticking is `haptics.tick`, unticking `haptics.selection`, the day's last meal and the
shop list's last item and finishing cook mode `haptics.success`.
