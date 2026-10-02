# WP-06 · Flexible eating: "Ate something else" / "Skipped", plus neutral copy

|                   |                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 2 / P1 product. Research Summary **Food 1 + Food 2**                                                     |
| Size              | M–L: about 1–1.5 days                                                                                    |
| Branch / worktree | `feat/flexible-eating` / `../chefer-wp06`                                                                |
| DB / ports        | `chefer_wp06` / 3206, 3306, 8106                                                                         |
| Depends on        | Phase A merged, including WP-10 (food/plan polish), which reshapes the tracker and Today; build on those |
| Can run alongside | WP-05 (no shared files). It must finish **before WP-07**, which edits the same tracker/rebalance code    |
| API level         | Claims the next free level if "skipped" entries would mis-render on old clients (see below)              |

## Goal

Every planned meal can be:

- eaten as planned (today);
- swapped for **what you actually ate**;
- marked **skipped**.

Each takes ≤ 3 taps, and the app never calls it a failure. Eating out stops reading as "off-plan".

## Facts

- **Tracker procedures** are in `apps/api/src/routers/tracker.router.ts`: `logRecipe` :99, `logCustomMeal` :119 (no
  `slotIndex`), `unlogRecipe` :140, and so on. The service is `apps/api/src/application/tracker/tracker.service.ts`.
- **No skipped state.** There is no "skipped" state and no replace procedure. An implicit rule exists in
  `packages/utils/src/today.ts:105` (`isSlotEaten`): a custom entry with the same `mealType` marks a planned non-snack slot
  as eaten.
- **Entry type:** `LoggedMealEntry` (`packages/database/src/repositories/daily-log.repository.ts:7`). `OffPlanLoggedMeal`
  is in `tracker.service.ts:59,85,267-292`.
- **"Off-plan" and "honestly" copy:**
  - mobile `features/tracker/quick-add-sheet.tsx:300,670`, `app/tracker.tsx:568-575`, `app/cook/[id].tsx:338`;
  - web `apps/web/src/app/(dashboard)/tracker/page.tsx:194-302,395`;
  - AI prompts `apps/api/src/lib/ai/prompts.ts:546`, `chat-tools.ts:95`.

## Design

### API (additive)

- `tracker.logCustomMeal` gains an optional `replacesSlot: { mealType, slotIndex }`. The entry stores it, and the planned
  slot then counts as "replaced". It shows "You had: Shawarma (≈ 650 kcal)", and its planned recipe leaves the day's
  planned totals.
- New `tracker.skipSlot({ date, mealType, slotIndex })` and `tracker.unskipSlot(...)`. These store a `skipped` marker in
  the day log. Prefer a separate `skippedSlots` array on the day over a new entry shape, so old clients that iterate
  entries don't see it. If you must use an entry, gate it by API level.
- `isSlotEaten` / Today / tracker / rebalance treat a replaced slot as eaten (with the replacement's numbers) and a
  skipped slot as neither eaten nor remaining.
- Rebalance (`maybeRebalance`) runs after replace and skip, as it does after other logs. Its gating stays as it is until
  WP-07.

### UX (mobile and web)

- Every planned slot (Today hero, tracker row, Plan day) gets an overflow action next to "I ate this": **"Ate something
  else"** and **"Skipped it"**.
- **"Ate something else"** opens one sheet with three ways in:
  1. **Quick estimate.** Rule-based, no AI, free. Pick a cuisine (shawarma, pizza, burger, sushi, salad, Romanian lunch
     menu, pasta, Asian) and a size (light / normal / big). The kcal and protein table lives in `@chefer/utils`
     (`eatOutEstimates`). Round restaurant food **up**. Show the result as a range ("≈ 700–850 kcal").
  2. **Recents & favourites.** Recent custom entries and recipes.
  3. **Describe / photo.** The existing quick-add text and Snap (premium) flows, pre-targeted at the slot.
- **"Skipped it"** marks the slot with Undo, with no judgement copy.
- **Neutral copy (Food 2, B-31 remainder):**
  - "Off-plan" becomes "Also eaten" (tracker section) or nothing (quick-add eyebrow).
  - Drop "log it honestly" / "stays honest".
  - Over and under are reported, not judged: no red for "over" on the day, and the weekly average is the praised number
    ("This week you averaged 1,640 kcal · 112 g protein a day").
  - Update the AI prompts' wording in `prompts.ts` and `chat-tools.ts` to match.
  - Align with WP-02's Today pill copy.

## Lanes

| Lane           | Items                                                                                           | Owns                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, API + utils | `replacesSlot`, skip/unskip, `isSlotEaten` + totals rules, `eatOutEstimates` table, prompt copy | `apps/api/src/{routers,application}/tracker/*`, `daily-log.repository.ts`, `packages/utils/src/{today,eat-out}*`, `apps/api/src/lib/ai/{prompts,chat-tools}.ts` |
| B, mobile      | slot actions, the "Ate something else" sheet, skip + Undo, copy                                 | `apps/mobile/app/tracker.tsx`, `src/features/{tracker,dashboard}/*`, plan-day slot actions, `cook/[id].tsx` copy                                                |
| C, web         | the same on web                                                                                 | `apps/web/src/app/(dashboard)/tracker/*`, web Today + plan slot components                                                                                      |

## Acceptance

- Replacing dinner with "Shawarma · normal" shows on Today, the tracker and Plan.
  - The day total uses the replacement.
  - The slot can't be ticked a second time.
  - Undo restores the slot.
- Skipping lunch removes it from "remaining" and doesn't count it as eaten. Undo works.
- An old 1.0.1 client reading a day with a skipped slot doesn't crash or mis-total (ladder 2c).
- A grep finds no "off-plan" / "honestly" copy left in user-facing strings. Tests and identifiers may keep the names.
- Research Summary Food 1 + 2 are marked shipped.

## Kickoff prompt

```
You are the orchestrator for WP-06 "Flexible eating". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-06-flexible-eating.md
3. The Summary section of docs/product/user-needs-research-2026-10.md
4. CLAUDE.md
Then execute WP-06 end to end under the operating rules:
- fresh worktree off origin/master; cloned DB; mock AI; Sonnet lanes, at most 3 at a time;
- additive API (gate by API level if needed); OTA-safe; tests per the WP doc; the full ladder including
  old-client compatibility;
- iOS plus ONE Android emulator; web parity;
- ONE PR to master, never merged.
Finish by updating the live coordination file, then give the final summary.
```
