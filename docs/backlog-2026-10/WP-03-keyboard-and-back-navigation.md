# WP-03 · Keyboard and back navigation everywhere, JS-only (audit §6.1 and §6.2)

|                   |                                                                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 1 / P1                                                                                                                                                                                                                                                                            |
| Size              | L: about 1 day                                                                                                                                                                                                                                                                    |
| Branch / worktree | `fix/mobile-keyboard-and-back` / `../chefer-wp03`                                                                                                                                                                                                                                 |
| DB / ports        | `chefer_wp03` / 3203, 3303, 8103                                                                                                                                                                                                                                                  |
| Depends on        | WP-01 merged. It provides `useUnsavedGuard`, `useKeyboardInset` and the fixed `Sheet`.                                                                                                                                                                                            |
| Can run alongside | WP-02. WP-03 owns layout, keyboard and back behaviour; WP-02 owns error handling. If both touch a screen, WP-03 edits only the scroll/keyboard wrapper and the guard.                                                                                                             |
| Native note       | `react-native-keyboard-controller` and `react-native-gesture-handler` are not installed. Use the RN-core primitives from WP-01 plus `PanResponder` + Reanimated. The full keyboard-controller adoption is in the native batch ([OWNER-ACTIONS](./OWNER-ACTIONS.md#native-batch)). |

## Goal

On every screen and both platforms:

- the focused field and the primary action are visible above the keyboard;
- the first tap on a button works even while the keyboard is up;
- leaving a screen with unsaved work always asks first, whether by ← button, iOS swipe or Android BACK.

## Scope

**§6.1 keyboard:**

| ID                                                              | Fix                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X-04                                                            | Make `keyboardShouldPersistTaps="handled"` the default in the shared scroll component. Add a grep test that fails on a form `ScrollView` without it                                                                                                              |
| X-05, FOOD-08, FOOD-10, ONB-07, ACC-25, ACC-26, GYM-35, PLAN-10 | A keyboard-aware scroll with a sticky footer on: Today (weight card), Preferences, Household, More/feedback, the onboarding wizard, quick add, My weeks, delete-account, exercise notes                                                                          |
| ONB-06                                                          | One `NumericReturnBar` / `inputAccessoryViewID` per input. Next goes to the next field, and Done submits on the last. Also on gym setup weights                                                                                                                  |
| FOOD-16                                                         | `Keyboard.dismiss()` in the `Sheet` close path                                                                                                                                                                                                                   |
| X-17                                                            | A shared `SearchField`: `returnKeyType="search"`, a clear button, `keyboardDismissMode="on-drag"` on its list (Cookbook, Exercises, Replace picker)                                                                                                              |
| X-16                                                            | Snackbar Undo: pause the timer while touched, make it about 10 s, and ignore taps in the bar's area for 300 ms after it hides, so taps don't fall through to the control underneath                                                                              |
| X-03                                                            | Sheets drag down to dismiss from the grabber and header, built with `PanResponder` + Reanimated (MO-pattern per `CLAUDE.md`, respects reduced motion). If it can't be made smooth without gesture-handler, remove the grabber instead and add a native-batch row |

**§6.2 back and unsaved work.** Apply WP-01's `useUnsavedGuard` to:

- REC-06: import, while a preview exists;
- COOK-02: BACK closes the ingredients panel first, then confirms when step > 0. Persist the step and ticks per recipe for
  the session;
- ACC-05: the jobs screen, which also gets a ScrollView, a back row and `ErrorState`;
- ONB-03: consent sheet BACK, ✕ or backdrop counts as **cancel** and keeps the selections;
- GYM-26: the workout log and edit modes; persist drafts per mode;
- X-11: persist the Food/Gym mode only once that side is set up; otherwise land by jobs.

## Lanes

| Lane                  | Items                                                                                     | Owns                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A, primitives + food  | X-04 default, X-17 `SearchField`, X-03, X-16 snackbar, FOOD-08, FOOD-10, FOOD-16, PLAN-10 | `packages/ui-mobile/src/components/{scroll*,search-field*,sheet*}`, `app/(food)/index.tsx` weight card, quick-add, My weeks |
| B, account/onboarding | X-05 (Preferences, Household, More), ONB-03, ONB-06, ONB-07, ACC-05, ACC-25, ACC-26, X-11 | `src/features/{onboarding,preferences,household,settings}`, `app/(food)/more.tsx`                                           |
| C, recipe/cook/gym    | REC-06, COOK-02, GYM-26, GYM-35, the gym setup number bar                                 | `app/{import-recipe,cook/[id]}.tsx`, `src/features/gym/workout/{edit-session*,log-past*}`, `exercise-notes`                 |

## Acceptance

- Run a Maestro **keyboard sweep** on iOS and Android: focus every input on the screens above, and assert that the
  primary action is visible and tappable once. Use L3's matrix in the audit as the checklist.
- Run a Maestro **back sweep**: on each guarded screen, an iOS edge swipe and Android BACK with unsaved changes show the
  confirm, and "Keep editing" keeps the edits.
- Sheets dismiss by dragging, or the grabber is gone.
- `bundle:check` passes and the fingerprint is unchanged.

## Kickoff prompt

```
You are the orchestrator for WP-03 "Keyboard + back navigation". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-03-keyboard-and-back-navigation.md
3. CLAUDE.md
Then execute WP-03 end to end under the operating rules:
- fresh worktree off origin/master (WP-01 must be merged; check first);
- cloned DB; mock AI; Sonnet lanes, at most 3 at a time;
- JS-only, with no new native modules;
- a regression test per fix; Maestro keyboard and back sweeps on iOS plus ONE Android emulator;
- ONE PR to master, never merged.
Finish by updating the live coordination file, then give the final summary.
```
