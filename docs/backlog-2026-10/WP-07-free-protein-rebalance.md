# WP-07 · Free, protein-aware week rebalance (plus the "Premium = heavy AI only" re-gating)

|                   |                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 2 / P1 product. Research Summary **Food 3**, plus the decision of 2 Oct: "Premium is for heavy AI only" |
| Size              | M: about 1 day                                                                                          |
| Branch / worktree | `feat/free-protein-rebalance` / `../chefer-wp07`                                                        |
| DB / ports        | `chefer_wp07` / 3207, 3307, 8107                                                                        |
| Depends on        | **WP-06 merged** (same tracker and rebalance code)                                                      |
| Can run alongside | WP-05 or WP-18 build lanes that stay out of tracker, rebalance and plan                                 |
| Owner decision    | D-4: ship the re-gating during the beta (default yes)                                                   |

## Goal

Week rebalance and training-day nutrition use no AI, so they become **free** for everyone. Rebalance also fixes
**protein** gaps, not only kcal. It shows a preview before it changes future meals.

## Facts

- **Rebalance** is `apps/api/src/application/meal-plan/rebalance.ts`:
  - `selectRebalanceSwaps` :104 is **kcal-only**: a ±15 % weekly threshold, at most 2 swaps, future days only;
  - `rebalanceWeek` :198;
  - client undo helpers are in `packages/utils/src/rebalance.ts`;
  - the mobile banner test is `apps/mobile/tests/unit/rebalance-banner.test.tsx`.
- **Rebalance gate:** `tracker.service.ts:588` uses `hasFeature(user, 'photoLogging')`. There is no dedicated feature key.
- **Training bump gate:** `training-nutrition.service.ts:282-315` gates on `trainingDayTargets` entitlement **or** the
  `trainingBumpFree` flag (`:97`, `isBumpWidened :236`). The rules are `packages/utils/src/training-nutrition.ts:132`.
- **Feature keys:** `packages/types/src/plan-features.ts` (`trainingNutrition` :193 F/T, `trainingDayTargets` :208 F/T,
  `photoLogging` :121 F/T).

## Scope

1. **Re-gating.**
   - Add a feature key `weekRebalance` (free: true, premium: true) and use it at `tracker.service.ts:588`.
   - Flip `trainingNutrition` and `trainingDayTargets` to free: true.
   - Keep the `trainingBumpFree` flag readable but redundant, and note it in `infrastructure.md` §10 for later removal.
   - Update every premium list and upsell that names these features: mobile and web premium sheets, locked cards,
     `docs/plan-premium-tier.md`, `business_flow.md`.
   - Old 1.0.1 clients: check whether any of them hides the rebalance UI behind a client-side premium check. If so, list it
     as "works after the binary updates"; it must not break.
2. **Protein-aware swaps.**
   - Extend `selectRebalanceSwaps` to score candidate swaps on the weekly **protein** gap as well as kcal.
   - Prefer higher-protein swaps within the kcal tolerance.
   - Never fix a protein gap with a kcal increase of more than 10 % on a loss goal. This resolves **UX-PLAN-08**: offer a
     higher-protein swap or a protein snack, not "Bigger portions (+503 kcal)".
   - It must use no AI: it picks from the curated or user pool only. Verify there is no AI call on this path.
3. **Preview before apply (UX-PLAN-09).**
   - After a log that would trigger a rebalance, show "I can rebalance the rest of your week: Sunday dinner → X
     (+28 g protein)" with **Preview · Apply · Not now**. Don't silently rewrite 4 meals.
   - Keep the rebalance reachable from Plan.
   - Fix the squeezed banner layout: actions stack under the text.
   - API: an additive `rebalance.preview` / `rebalance.apply` pair, or an `autoApply: false` option. Old clients keep
     today's auto behaviour.
4. **One-line explanations** for each swap (B-11), on mobile and web.

## Lanes

| Lane                   | Items                      | Owns                                                                                                                                                                      |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, API + types + utils | 1 (server), 2, 3 (API)     | `packages/types/src/plan-features.ts`, `apps/api/src/application/{meal-plan/rebalance*,tracker/tracker.service.ts,training-nutrition/*}`, `packages/utils/src/rebalance*` |
| B, mobile              | 1 (copy/upsell), 3 (UI), 4 | rebalance banner/sheet, premium sheet, locked cards                                                                                                                       |
| C, web + docs          | 1 (web), 3, 4 (web), docs  | web equivalents, `docs/plan-premium-tier.md`, `business_flow.md`, `infrastructure.md`                                                                                     |

## Acceptance

- A Free user logs a 900 kcal snack, sees a rebalance preview, applies it, and the plan changes. Undo works.
- A protein-short week (−36 g) is offered a protein swap, not bigger portions, on a loss goal.
- A Free muscle-gain user gets training-day targets.
- Premium lists no longer name rebalance or training-day nutrition.
- Contract tests cover the new key, preview/apply, and the unchanged old behaviour for old clients.

## Kickoff prompt

```
You are the orchestrator for WP-07 "Free, protein-aware rebalance". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-07-free-protein-rebalance.md
3. The Summary "Decisions" section of docs/product/user-needs-research-2026-10.md
4. CLAUDE.md
Then execute WP-07 end to end under the operating rules:
- fresh worktree off origin/master (WP-06 must be merged); cloned DB; mock AI;
- Sonnet lanes, at most 3 at a time; additive API; OTA-safe; tests per the WP doc; the full ladder;
- iOS plus ONE Android emulator; web parity;
- ONE PR to master, never merged.
Finish by updating the live coordination file, then give the final summary.
```
