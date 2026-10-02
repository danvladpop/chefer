# WP-04 · Readability (bigger text and controls), plus the freestyle swap fix

|                          |                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority          | 1 / P1. It is user-reported: [feedback](./feedback-2026-10-02.md) improvements 1 and 2                                                                                                                                                                                                                                                                                                   |
| Size                     | M–L: about 1 day                                                                                                                                                                                                                                                                                                                                                                         |
| Branch / worktree        | `fix/mobile-readability` / `../chefer-wp04`                                                                                                                                                                                                                                                                                                                                              |
| DB / ports               | `chefer_wp04` / 3204, 3304, 8104                                                                                                                                                                                                                                                                                                                                                         |
| Depends on               | nothing. It can start **alongside WP-01**.                                                                                                                                                                                                                                                                                                                                               |
| Conflict rule with WP-01 | WP-04 owns `apps/mobile/tailwind.config.js`, `packages/ui-mobile/src/components/{text,button,value-stepper,chip*,segmented*,input*}.tsx` and `apps/mobile/src/features/gym/workout/{set-row,exercise-card,workout-sheets}.tsx`. It must **not** touch the `Sheet`, the tracker, onboarding, gym setup or `number-sheet.tsx`. Whichever of the two merges second rebases and re-verifies. |

## Goal

1. **Readability.** A person without reading glasses can read and hit everything on the screens used during and after
   training: gym Today, the workout logger, the class check-in (later), Today and the tracker. This should hold at the
   default OS text size and still lay out at large OS text sizes.
2. **The freestyle swap asks no question.** In a session without a routine, Swap goes straight to the picker.

## Facts

- **Type scale.** `apps/mobile/tailwind.config.js:22-30`: xs 13/18, sm 15/21, base 17/24, lg 19/26, xl 21/28,
  2xl 25/31, 3xl 31/37. There are about 523 `text-xs` usages and 30 arbitrary `text-[Npx]` (24× 12 px, 2× 11 px, 1× 10 px).
- **Text component.** `packages/ui-mobile/src/components/text.tsx`: `maxFontSizeMultiplier` defaults to 1.8, and the
  dense variant is **1.3**. So a user who raises the phone's font size gets at most +30 % on dense controls.
- **Logger.**
  - Set-row labels are `text-xs` (`set-row.tsx:139-152`), and the weight value is `text-base` (:178).
  - `ValueStepper` value is 17/15/13 px by length, and its caption is `text-[12px]`.
  - Exercise cards are mostly `text-sm`/`text-xs`.
- **Swap scope.** The page is `workout-sheets.tsx:365-391` ("Just today" / "Today and my routine"). The reason logic is
  `workout-screen.tsx:673-679`, which has no freestyle check: in freestyle, the routine option is merely disabled.
  Web has no scope page.

## Scope

1. **Type floor.**
   - Raise the scale's floor so secondary text stays legible: xs → 14/19 and sm → 16/22 is a starting point; tune it with
     screenshots.
   - Replace every `text-[10–12px]` with `text-xs` (this also covers X-14).
   - Bring low-contrast labels up to the `text-muted-foreground` minimum.
   - Keep the change central (the tailwind config and the Text variants). Don't edit 523 call sites.
2. **Respect the OS text size.**
   - Raise `DENSE_MAX_FONT_SCALE` from 1.3 to about 1.6 and the default from 1.8 to 2.0.
   - Then fix what breaks at 1.3×, 1.6× and the iOS accessibility-XL size (this also covers X-08):
     - safety chips wrap;
     - inputs use `min-h-11 py-2`, not a fixed `h-11`;
     - segmented labels get short forms or `adjustsFontSizeToFit`;
     - exercise names wrap to 2 lines.
3. **Bigger primary controls where the hands are busy.** In the workout logger, the set tick, the weight and reps values,
   Add set and Finish get one size step up (values `text-xl`, ticks ≥ 52 pt). Start workout and Freestyle on gym Today get
   the `lg` button. Tracker ticks and Today's "I ate this" get a 48 pt minimum.
4. **Accessibility basics (X-09).**
   - `accessibilityLabel` on placeholder-only inputs, `accessibilityState` on chips and segmented controls, and 44 pt hit
     areas.
   - Add a lint or grep test for a `TextInput` without `accessibilityLabel`.
   - **X-10:** the segmented pill is drawn under the wrong option on Android. Compute the offset inside the worklet from
     a shared width, and test it with the value at index 1.
5. **Layout polish on the same primitives:** FOOD-24 (ring caption), ACC-27 (card text clipped), PLAN-13 (badge row
   overflow).
6. **Freestyle swap (feedback 2).**
   - When the session has no routine (`routineId == null`), or the exercise has no `routineExerciseId`, the Swap action
     opens the exercise picker directly and applies "Just today". It shows no scope page.
   - Keep the scope page for routine sessions.
   - Add a Jest test for both branches.
   - Web needs nothing (there is no scope page there); note this in the PR.
7. **Web parity for 1–4.** The web app already uses `text-xs` as its floor. Raise the base and secondary type tokens there
   as well if the same screens read small at 390 px, and run the Playwright mobile sweep.

**Optional, owner decision D-3.** An in-app **Text size** setting (Standard / Large / Larger), applied as a multiplier
through the shared `Text` component and the tailwind font tokens. Build it only if the owner asks after seeing 1–3.

## Lanes

| Lane                  | Items                         | Owns                                                                                                                         |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A, scale + primitives | 1, 2 (primitives), 4, X-10    | `tailwind.config.js`, `packages/ui-mobile/src/components/*` (except `sheet*`, `confirm-sheet*`)                              |
| B, gym screens        | 3 (gym), 6, the gym part of 2 | `src/features/gym/{today,workout}/*` (except `number-sheet.tsx`)                                                             |
| C, food screens + web | 3 (food), 5, 7                | `src/features/dashboard/*`, the tracker row component (presentational only; WP-01 owns the tracker state), `apps/web` tokens |

Lane A goes first, because B and C build on its scale.

## Acceptance

- Before and after screenshots of gym Today, the logger, Today and the tracker, at the default size and at 1.6× (Android
  font scale) / accessibility-XL (iOS), on both platforms.
- At those sizes nothing is clipped mid-word, nothing overlaps, and every control is at least 44 pt.
- Freestyle → Swap opens the picker directly. A routine session still shows the scope page.
- The Playwright mobile sweep is green if web tokens changed.

## Kickoff prompt

```
You are the orchestrator for WP-04 "Readability + freestyle swap". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-04-readability-and-freestyle-swap.md
3. docs/backlog-2026-10/feedback-2026-10-02.md
4. CLAUDE.md
Then execute WP-04 end to end under the operating rules:
- fresh worktree off origin/master; cloned DB; mock AI; Sonnet lanes, at most 3 at a time;
- OTA-safe; a regression test per fix;
- before/after screenshots at default and large text on the iOS simulator plus ONE Android emulator
  (check the live coordination file: WP-01 may be holding the emulator);
- ONE PR to master, never merged.
WP-01 may be running in parallel, so respect the conflict rule in the WP doc.
Finish by updating the live coordination file, then give the final summary.
```
