# WP-10 · Food (Today, tracker, progress, AI Chef) and Plan polish

|                   |                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 3 / P2 (during beta, OTA)                                                                                     |
| Size              | L: about 1–1.5 days                                                                                           |
| Branch / worktree | `fix/food-plan-polish` / `../chefer-wp10`                                                                     |
| DB / ports        | `chefer_wp10` / 3210, 3310, 8110                                                                              |
| Depends on        | Wave 1 merged (WP-01..04). Phase A: runs **before** the new-feature packages WP-06/07, which then build on it |
| Can run alongside | WP-09, WP-11 or WP-12 (different code areas)                                                                  |

Every item has a full block in the audit (§4 or §5) with its fix. Lanes read only their blocks.

## Items

**Tracker and logging:**

- FOOD-11: "These don't add up" with partial macros. Store unknown macros as null.
- FOOD-12: ingredient search ranking. Name prefix and commonness first; demote alias-only matches.
- FOOD-14: first-run "Target changed" banners with the wrong reason; "Keep mine" silently switches to OWN.
- FOOD-15: the hero "I ate this" double tap. Hold a "Logged ✓ · Undo" state for about 2 s.
- FOOD-25: tracker polish (duplicate headers, "Copied 1 entries", unlabelled macro fields, grouping by meal, local reset
  time).
- FOOD-26: Snap result: thumbnail, a 2-line name, editable kcal, a success snackbar with Undo, a 30 s timeout.

**Today and progress:**

- FOOD-13: Today stuck in pull-to-refresh after returning.
- FOOD-18: Tonight "Swap" opens next week on Fri/Sat; Plan keeps yesterday after midnight.
- FOOD-19: one "today's session" selector for Today and Plan.
- FOOD-20: progress chart axes, "days logged", a range control.
- FOOD-22: an empty ring after a cold start. **Re-check on the Android emulator first**; fix only if it reproduces.
- FOOD-23: full-screen spinner after the hour changes (`keepPreviousData`).
- FOOD-27: weight sparkline.
- FOOD-28: one consent modal per weigh-in row; the weight card survives a failed summary.

**AI Chef (FOOD-21):**

- persist the last thread per day;
- action chips with Undo;
- friendly error copy, with retry and draft restore;
- a Stop button (AbortController);
- collapse long bubbles;
- starter prompts.

AI stays mocked during verification.

**Plan:**

- PLAN-04: undoing a swap leaves the slot pinned. Add an additive `restoreSlot`, or restore `pinned`.
- PLAN-05: swap picker ranking, layout and info.
- PLAN-07: cost labels. Label the days covered, check the carry-forward multiplier, use `formatPriceRange`, and derive
  this/next week copy.
- PLAN-11: "Use this week again" into this or next week, and overlay logged ticks on history.
- PLAN-12: the household "Cooking for" read-only summary, a "2 checks passed" label, kid age bands.
- PLAN-15: leftover "History" copy.

## Lanes

| Lane                                      | Items                                   |
| ----------------------------------------- | --------------------------------------- |
| A, tracker + logging                      | FOOD-11, 12 (API), 14, 15, 25, 26       |
| B, Today + progress + AI Chef             | FOOD-13, 18, 19, 20, 21, 22, 23, 27, 28 |
| C, plan (+ web parity for all plan items) | PLAN-04, 05, 07, 11, 12, 15             |

Web parity: FOOD-12, 14, 19, 20 and all PLAN items exist on web. Port them, or add parity backlog rows.

## Kickoff prompt

```
You are the orchestrator for WP-10 "Food + plan polish". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-10-food-plan-polish.md
3. CLAUDE.md
Then execute it end to end under the operating rules. Read only each item's block in the audit.
- Sonnet lanes, at most 3 at a time; OTA-safe; additive API; a regression test per fix; the full ladder;
- iOS plus ONE Android emulator; web parity;
- ONE PR to master, never merged.
Finish by updating the live coordination file and the audit Fix status rows, then give the final summary.
```
