# WP-02 · Remaining S1s, plus "no silent failures" (audit §6.3 and §6.8)

|                   |                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 1 / P1                                                                                                                                                   |
| Size              | L: about 1 day with 3 lanes                                                                                                                              |
| Branch / worktree | `fix/mobile-ux-silent-failures` / `../chefer-wp02`                                                                                                       |
| DB / ports        | `chefer_wp02` / 3202, 3302, 8102                                                                                                                         |
| Depends on        | WP-01 merged. **First read WP-01's "Fix status" table** in `docs/mobile-ux-audit-2026-10/README.md` on master, and pick up every S1 that WP-01 deferred. |
| Can run alongside | WP-03. Split: WP-02 owns mutation and query error handling plus `ConfirmSheet`; WP-03 owns keyboard, scroll and back. Neither restyles screens.          |

## Goal

After this WP, no mutation fails silently, no failed load renders as "Loading…" or "empty", and no raw Zod or JSON
reaches a user. The four S1s left after WP-01 are closed.

## Scope

**S1s:**

| ID                | One line                                             | Pointer                                                                                                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-FOOD-04        | "Rate it" on Today is a dead button                  | `src/features/dashboard/components/tonight-card.tsx:56-64`. Render the existing `StarRating` inline (cook mode's finish screen already saves ratings), and hide it once `recipe.getMyRating` returns a value                                                           |
| UX-FOOD-05        | Green "PLAN ON TRACK" pill while 871 kcal over       | `packages/utils/src/day-nutrition.ts:10-21`, `nutrition-summary.tsx:75`. Today's status is eaten + remaining planned vs target ("On track" / "Heading over" / "Over by N"); macro bars get an over state. Use neutral wording, no red shaming (see WP-06's copy rules) |
| UX-GYM-04         | Reminders say "On" although notifications are denied | `src/features/gym/settings/settings-screen.tsx:275-284`, `setup/setup-wizard.tsx:500-506`                                                                                                                                                                              |
| UX-GYM-08         | Android Exercises chips cover the search box         | `src/features/gym/library/collapsible-chip-filters.tsx`, `library-screens/exercises-tab.tsx:111-141`. Re-check on the emulator first; if it reproduces, drop `LinearTransition` on the chip container                                                                  |
| _WP-01 deferrals_ | Whatever WP-01 marked deferred or partial            | —                                                                                                                                                                                                                                                                      |

**§6.3 silent failures:** FOOD-09, PLAN-14, SHOP-02 (error and undo parts), GYM-21 (field errors and labels), GYM-22,
GYM-24, GYM-25, ONB-09, ACC-10, X-06 (the rest), X-12, X-13 (migrate native `Alert` confirms to `ConfirmSheet`),
REC-03, COOK-03.

**§6.8 permissions:**

- GYM-11 (rest timer "Allow" when denied);
- ACC-20 (Open Settings button);
- GYM-23 (an outbox ack deletes a newer edit). This is not a permission item but sits in the same offline code as GYM-25.

## Structural fixes (build these first, in lane A)

1. A default **`MutationCache.onError`** in `makeQueryClient` (`apps/mobile/src/lib/trpc.ts:35`):
   - it shows a `userFacingErrorMessage` snackbar unless `meta: { silent: true }`;
   - mutations with their own UI opt out;
   - do the web equivalent in the web tRPC provider.
2. **`useQueryState(query)`** in `@chefer/ui-mobile` (and web) returns `loading | error | empty | data`:
   - convert screens that branch on `isLoading || !data`;
   - render `ErrorState` with Retry on error;
   - add an ESLint rule (or a grep test) against new `isLoading || !data`.
3. **`userFacingErrorMessage`** maps BAD_REQUEST with a Zod or JSON-looking message to "Check the value you entered" plus
   the field, when one is known. Mirror schema bounds client-side through shared Zod in `@chefer/types`.
4. **`ConfirmSheet` `busy` / `error` props** (`packages/ui-mobile/src/components/confirm-sheet.tsx:84-91`):
   - if WP-01 already added them, reuse them;
   - wire them to copy day, downgrade, health-data withdraw and every migrated `Alert`.
5. **`useNotificationPermission()`** returns `granted | denied | undetermined`:
   - it re-checks on app foreground;
   - it comes with a standard "Off for Chefer · Open Settings" row (`Linking.openSettings()`; the pattern is in
     `scan-meal-card.tsx:233`);
   - use it in gym reminders, the rest timer, weekly updates and onboarding.

## Lanes

| Lane                    | Items                                                                            | Owns                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A, primitives           | structural fixes 1–5, X-06, X-13                                                 | `apps/mobile/src/lib/trpc.ts`, `packages/ui-mobile/src/{components/confirm-sheet.tsx,hooks/*}`, `apps/mobile/src/lib/errors*`, web provider + `apps/web/src/lib/errors*` |
| B, food/account screens | FOOD-04, 05, 09, PLAN-14, SHOP-02, ONB-09, ACC-10, ACC-20, X-12, REC-03, COOK-03 | the screens named in each audit block (mobile + web)                                                                                                                     |
| C, gym                  | GYM-04, 08, 11, 21, 22, 23, 24, 25                                               | `apps/mobile/src/features/gym/**` (except files WP-03 owns: `workout/*-sheet*` keyboard parts, and `exercise-notes`)                                                     |

Run lanes B and C after lane A has merged into the WP branch, because they consume its primitives.

## Acceptance

- With the API stopped, every Today, tracker, plan, shop, recipe and gym screen shows an error with Retry. None shows
  "Loading…" forever or an empty state.
- Each mutation that fails shows a plain-language snackbar and rolls back optimistic UI.
  - Spot-check 10, including the gym batch retry.
  - For GYM-25: after 3 rounds a failing item is parked, and "N waiting · last error · Sync now" is shown.
- No Zod or JSON text appears anywhere. Test with the import of an invalid URL, the custom exercise form and gym setup.
- With notifications denied: gym settings show Off plus Open Settings, and the rest timer's "Allow" opens Settings.
- "Rate it" saves a rating, and the link then disappears.
- The Today pill tells the truth at 871 over.
- GYM-23 has a unit test: an ack for an older `clientUpdatedAt` doesn't drop the newer entry.

## Kickoff prompt

```
You are the orchestrator for WP-02 "S1 leftovers + silent failures". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-02-s1-leftovers-and-silent-failures.md
3. CLAUDE.md
Then execute WP-02 end to end under the operating rules:
- fresh worktree off origin/master; cloned DB; mock AI;
- Sonnet lanes, at most 3 at a time;
- OTA-safe and additive API;
- a regression test per fix; the full ladder; iOS plus ONE Android emulator;
- ONE PR to master, never merged.
Start by reading WP-01's Fix status table on origin/master, and add WP-01's deferred S1s to your scope.
Finish by updating the live coordination file, then give the final summary.
```
