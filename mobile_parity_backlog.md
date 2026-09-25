# Mobile Parity Backlog

> **Purpose:** the ledger of user-facing changes that landed on web while the affected
> feature did **not yet exist** on mobile (`apps/mobile`). Governed by the
> **Platform Parity** section of [`CLAUDE.md`](./CLAUDE.md). Porting agents executing
> [`mobile_native_plan.md`](./mobile_native_plan.md) Wave 2 **must** check this file for
> their feature and mark entries done in the same PR that ports them.
>
> **Baseline:** entries are only needed for changes made **after 2026-08-30** (the date
> `mobile_native_plan.md` was created). Anything older is already covered by the plan's
> rule "port from the current web source" — the web code itself is the spec.

## How to add an entry (for the agent making a web-only change)

Append a row to the table below in the **same PR** as the web change. Keep it one line;
the porting agent will read the web source for details — the entry's job is to make sure
the change is _noticed_, and to capture anything **not discoverable from the web source**
(e.g. "also applies to the mobile-only scan flow", "API added optional field X for this").

## How to drain an entry (for the porting agent)

When porting the feature (or when the feature already exists on mobile and you're
back-filling), implement the change on mobile, verify per `mobile_native_plan.md` §4, and
change the entry's Status to `done (<commit>)` in the same PR. Do not delete rows.

## Ledger

| Date       | Feature (web dir)                                       | Change (one line)                                                                                                                                                                                                                                                                                      | Web commit/PR                                                                             | Non-obvious notes for mobile                                                                                                                        | Status                                                                                   |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 2026-09-23 | features/meal-plan (**reverse: mobile → web**)          | Per-meal replace opens a recipe-picker sheet (own/favourites first, search, pick any recipe via `mealPlan.replaceRecipe`; AI regen as premium footer action) — landed on MOBILE first, web meal-plan page still has no per-meal replace picker                                                         | mobile `apps/mobile/src/features/meal-plan/recipe-picker-sheet.tsx`                       | `replaceRecipe` is un-gated (any tier); web already calls it from the tracker RebalanceBanner — reuse that pattern                                  | done (web ReplaceMealSheet, 2026-09-23; `buildPickerSections` lifted to `@chefer/utils`) |
| 2026-09-24 | features/gym (**reverse: mobile → web**, whole feature) | Gym mode (Food/Gym switch, setup, Today, active workout, routine editor, exercise library, stats, dashboard card) ships on MOBILE first by owner decision (gym_plan.md D7); web gets it in wave G5                                                                                                     | mobile `apps/mobile/app/(gym)/*`, `app/gym/*`                                             | API complete and platform-neutral; reuse `@chefer/utils` engine + `workoutReducer` + outbox core with a localStorage adapter; see gym_plan.md §7 G5 | in progress (G5)                                                                         |
| 2026-09-24 | nav (**reverse: mobile → web**)                         | Food / Gym mode switch (gym_plan.md D3): a `Food \| Gym` segmented control in every tab-root header swaps the tab bar to Today / Routine / Exercises / Stats; the mode persists and the app reopens in it — landed on MOBILE first (G1-C, placeholders only), web sidebar + bottom nav do not swap yet | mobile `apps/mobile/src/features/gym/components/mode-switch.tsx`, `app/(gym)/_layout.tsx` | Owner-scoped mobile-first (D7): web lands in G5. First switch to Gym without a gym profile opens Setup (`gym.bootstrap.profile === null`)           | in progress (G5)                                                                         |
