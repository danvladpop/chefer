# WP-08 · Protein-only mode

|                   |                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Wave / priority   | 2 / P2 product. Research Summary **Food 5**, moved ahead of Food 4 because the tester counts protein, not calories |
| Size              | M: about 1 day                                                                                                     |
| Branch / worktree | `feat/protein-only-mode` / `../chefer-wp08`                                                                        |
| DB / ports        | `chefer_wp08` / 3208, 3308, 8108                                                                                   |
| Depends on        | WP-07 merged (protein targets and rebalance)                                                                       |
| Can run alongside | any gym-side package                                                                                               |
| Owner decision    | D-5: protein target ≈ 1.6 g per kg body weight, shown as "30–40 g per meal" (the research default)                 |

## Goal

A user who doesn't want to count calories sees **one number: protein**. It appears on Today, in the tracker and in
the weekly review. Meal planning still works underneath, because targets keep driving the generator.

## Facts

- **Targets.**
  - `resolveTargets` is `apps/api/src/application/preferences/preferences.service.ts:197`; `resolveDailyTargets` is
    :289.
  - `TargetMode` is `SUGGESTED | OWN` (`schema.prisma:110`, Prisma only).
  - The targets router is `apps/api/src/routers/targets.router.ts`.
- **No protein-only mode** and no "no numbers" mode exists.
- **Closest existing setting:** `ChefProfile.showNutritionOnToday Boolean?` (`schema.prisma:335`):
  - API: `preferences.service.ts:457` (`setHomeDisplay`), `dashboard.service.ts:370`;
  - UI: mobile/web `home-display-toggle.tsx`.

## Design

- **Data (additive):** `ChefProfile.numbersMode String?`, validated by a Zod enum in `@chefer/types`:
  - `FULL` (default when null) | `PROTEIN_ONLY` | `NONE`;
  - `NONE` is reserved and implemented in WP-16. Accept it in the schema now and treat it as `FULL` in the UI until then.
  - A string column plus a Zod enum avoids a Prisma enum migration each time a value is added.
  - Old clients ignore the field and keep showing full numbers. That's acceptable, so no API-level gating is needed.
- **Protein target.**
  - Use the protein number from `resolveTargets`.
  - If the goal-based suggestion differs from 1.6 g/kg, show the user's effective protein target and explain it in the
    "Why" sheet.
  - The per-meal guide is the target ÷ planned meals, rounded to a 5 g range.
- **UI (mobile and web):**
  - Today's ring becomes a protein ring ("72 of 120 g protein").
  - Macro bars and the kcal caption are hidden.
  - Tracker rows show protein. "Ate something else" (WP-06) asks for protein first.
  - The weekly review shows the protein average.
  - The plan still balances kcal internally. Plan cards show protein per meal instead of kcal.
- **Where to set it:**
  - in onboarding's goal/targets step: "What do you want to keep an eye on?" with "Calories and macros" and "Just
    protein";
  - in Preferences → Your targets.
  - Merge `showNutritionOnToday` into the same card. Keep it working for old clients.

## Lanes

| Lane          | Items                                                                                                                                                     | Owns                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A, data + API | `numbersMode`, read/write procedure (extend `preferences.setHomeDisplay` additively or add `preferences.setNumbersMode`), dashboard/tracker payload hints | `packages/database/prisma/*`, `packages/types/src/*numbers*`, `apps/api/src/application/{preferences,dashboard}/*` |
| B, mobile     | Today ring, tracker, plan cards, review, onboarding step, Preferences card                                                                                | `apps/mobile/src/features/{dashboard,tracker,meal-plan,onboarding,preferences}`                                    |
| C, web        | the same on web                                                                                                                                           | web equivalents                                                                                                    |

## Acceptance

- Choosing "Just protein" in onboarding means no kcal number appears on Today, in the tracker, on plan cards or in the
  weekly review on either platform.
- Switching back restores everything.
- A 1.0.1 client with the same account still works (ladder 2c).
- Research Summary Food 5 is marked shipped.

## Kickoff prompt

```
You are the orchestrator for WP-08 "Protein-only mode". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-08-protein-only-mode.md
3. docs/backlog-2026-10/feedback-2026-10-02.md
4. CLAUDE.md
Then execute WP-08 end to end under the operating rules:
- fresh worktree off origin/master (WP-07 must be merged); cloned DB; mock AI;
- Sonnet lanes, at most 3 at a time; additive API; OTA-safe; tests per the WP doc; the full ladder;
- iOS plus ONE Android emulator; web parity;
- ONE PR to master, never merged.
Finish by updating the live coordination file, then give the final summary.
```
