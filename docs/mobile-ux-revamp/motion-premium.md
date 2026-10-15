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

| #   | Moment                                | Where                                                   |
| --- | ------------------------------------- | ------------------------------------------------------- |
| 1   | Tick a meal on Today                  | `shell/today/your-day-card.tsx`, `next-meal-card.tsx`   |
| 2   | Day complete (last meal)              | `shell/today/use-day-complete.ts`, `nutrition-card.tsx` |
| 3–4 | Shop check-off, aisle fold, list done | `shell/shop/shop-screen.tsx`                            |
| 9   | Tab bar pop, haptic, crossfade        | `app/(main)/_layout.tsx`, `shell/tab-icon.tsx`          |

Haptics: ticking is `haptics.tick`, unticking `haptics.selection`, the day's last meal and the
shop list's last item `haptics.success`.
