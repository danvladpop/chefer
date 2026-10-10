# Mobile UX revamp

The full plan (audit, platform guidelines, reference apps, target navigation,
design system, screen specs, roadmap, metrics) is the Claude Doc
**Chefer Mobile UX Revamp Plan** (9 Oct 2026):
https://claude.ai/code/artifact/079912dc-8346-4739-88fa-8b9ed42c89b8

This file is the in-repo summary that code comments point at.

## Decisions (proceeding on the recommended option until the owner says otherwise)

1. **One tab bar:** Today · Meals · Shop · Train · You for every account (Plan
   was renamed Meals on 10 Oct 2026, route still `/plan`; the
   job-aware first cut stranded training-only accounts that also plan meals,
   so it was dropped). The Food|Gym switch goes away.
2. **Recipes live inside Meals**, not as their own tab: a Cookbook entry card on
   Meals, matched by a Routines card on Train (10 Oct redesign).
3. **Add (+)** is a header button (FAB on Android), never a tab: Apple's HIG says
   tab bars are for navigation, not actions.
4. **Ask Chef** is a labelled pill in the top bar of every tab (10 Oct redesign),
   not buried in More.
5. **More is gone:** Progress, My weeks, Household, Following, Settings and Help
   live under You.
6. **An active workout** shows as a mini bar above the tab bar on every tab.
7. **Dark mode ships in this revamp** (phase 4); the colour roles already carry
   dark values.

## Phases

| Phase              | Ships                       | What                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Foundations      | OTA                         | Colour roles (`@chefer/tokens` `color.ts`, contrast-tested), named text styles and radius classes, `ListSection`/`ListRow`/`SurfaceCard`/`IconButton`/`LargeHeader`, `Icon`, design-drift guard test, iOS forced light (UX-X-07), `mobileShellV2` flag + per-device preview |
| 1 New shell        | OTA, behind `mobileShellV2` | `app/(main)`: one tab bar, new Today, Add sheet, Train, You, Recipes in Plan, Ask Chef buttons, workout mini bar                                                                                                                                                            |
| 2 Screen rebuilds  | OTA, behind the flag        | Plan split, recipe detail, cook mode, shop, settings sub-screens, unified Progress, onboarding plan reveal                                                                                                                                                                  |
| 3 Binary 1.1       | Store build                 | Native tabs (Liquid Glass / Material), SF Symbols, gesture-handler, keyboard-controller, predictive back, plus the existing native batch                                                                                                                                    |
| 4 Dark mode + a11y | OTA                         | Appearance setting, VoiceOver/TalkBack and largest-text passes                                                                                                                                                                                                              |

## How the switch works

`src/features/shell/shell-store.ts`: the new shell is on when the server flag
`mobileShellV2` is on (cached in KV for a flash-free cold start) **or** this
device opted in through Settings → "Preview the new design" (shown to admins
and dev builds only). Off by default, so merging changes nothing for testers.

## Guardrails

- `tests/unit/design-drift-guard.test.ts`: zero hex colours / raw palette
  classes in the revamp code; a ratchet for the rest of the app.
- `tests/unit/color-sync.test.ts`: `global.css` matches the colour roles.
- `packages/tokens/src/color.test.ts`: every text role meets WCAG AA on every
  background, light and dark.

## Status

| Phase              | State                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Foundations      | Done (PR #134)                          | Colour roles + AA tests, `ListSection`/`ListRow`, `IconButton`, `LargeHeader`, `SurfaceCard`, `Icon`, drift guard, `mobileShellV2` flag, iOS light appearance.                                                                                                                                                                                                                                                    |
| 1 New shell        | Done (PR #134), needs a device check    | `app/(main)` tabs, five-tab set, old URLs forwarded, Today's Add sheet, Train links, You, workout mini bar, preview switch. Existing screens reused through `ShellTopBar`.                                                                                                                                                                                                                                        |
| 2 Screen rebuilds  | 10 Oct redesign shipped behind the flag | Owner feedback 2026-10-10 (`docs/design/feedback/2026-10-10/`): Today, Your day, Stats, Meals, Meal settings, Cookbook, Shop, Train, Routine, workout header + summary, Training settings, program setup, New exercise, You, Account, Goals & diet. Shared tiles/gauge/macros in `@chefer/ui-mobile`. Still legacy-styled: recipe detail, cook mode, set rows, Preferences cards, kit Button/Stepper/SelectField. |
| 3 Binary 1.1       | Not started                             | Native tabs, SF Symbols, gesture-handler sheets, keyboard-controller, predictive back. Needs a store build.                                                                                                                                                                                                                                                                                                       |
| 4 Dark mode + a11y | Not started                             |                                                                                                                                                                                                                                                                                                                                                                                                                   |
