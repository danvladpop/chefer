# Kitchen progress P1: build plan (lane briefs)

_2026-10-22 · owner approved [tech-plan.md](./tech-plan.md) D1–D8 (D9, the support-card copy, is reviewed in the PR)._

This is the work order for the lane agents. Read the [tech plan](./tech-plan.md) for the _why_; this file is the _what, where and how to prove it_. The rules in `docs/backlog-2026-10/00-operating-rules.md` §3 (engineering), §4 (tests) and CLAUDE.md apply to every lane.

## 0. Setup (done by the orchestrator)

| Thing              | Value                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration branch | `claude/intelligent-goldwasser-692d86` (worktree `…/chefer/.claude/worktrees/intelligent-goldwasser-692d86`)                                                                                                                                                                      |
| Contracts commit   | `5acfedef`: `packages/types/src/progress.ts`, flag `gamification`, `GAMIFICATION_ALLOWLIST`, `apps/api/src/lib/progress-flags.ts`, `apps/api/src/routers/progress.router.ts` (final procedure names and types), the `ProgressService` stub, `packages/utils/src/progress/copy.ts` |
| Lane worktrees     | `/Users/danpop/work/git-projects/chefer-gam-<lane>` on branch `gam/<lane>`, cut from the integration branch                                                                                                                                                                       |
| DB                 | `chefer_gam` (clone of `chefer_dev`). Only lane B changes the schema.                                                                                                                                                                                                             |
| Ports              | API 3260 (orchestrator), lane B's own contract API 3261, web 3360, Metro 8160                                                                                                                                                                                                     |
| Order              | **A, C and D start together**. **B starts when A is merged** (it scores with A's rules). At most 3 lanes run at once.                                                                                                                                                             |

**Every lane:**

- Commit on your lane branch with Conventional Commits (scopes: `utils`, `types`, `api`, `database`, `mobile`, `web`, `ui`, `ui-mobile`) and end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Do not push**, open PRs, start simulators or emulators, or run dev servers on 3000/3001/3260/3360/8081/8160.
- Never touch the main checkout `/Users/danpop/work/git-projects/chefer`.
- Don't edit `packages/types/src/progress.ts`, the router or `copy.ts` signatures. If a contract is wrong, say so in your report, and only add **new optional** fields.
- Tests that use dates pin the clock (`vi.setSystemTime` / `jest.useFakeTimers({ now })`) or build fixtures relative to today.
- Report: commit SHAs, files changed, test output, and anything you skipped.

---

## Lane A: rules (`@chefer/utils/progress`, pure, TDD)

**Owns:** `packages/utils/src/progress/*` (except the existing exports of `copy.ts`: you may add to it), `packages/utils/src/gym/weeks.ts` (the `settleWeeks` options only) and its test.
**Read-only:** `packages/types/src/progress.ts`, `packages/types/src/gym/engine.ts`, `packages/utils/src/gym/prs.ts`, `packages/utils/src/today.ts`.

Write the tests first for every function (Vitest, co-located `*.test.ts`). Then add each file to `progress/index.ts`.

1. **`xp-table.ts`**
   - `RULES_VERSION = 1`.
   - `XP = { LOGGED: 5, ON_PLAN: 5, MEALS_PER_DAY: 5, FULL_DAY: 15, PROTEIN_GOAL: 10, COOKED_AT_HOME: 25, FIRST_TIME: 10, WORKOUT_DONE: 40, PR: { e1rm: 20, weight: 15, reps: 10 }, PRS_PER_SESSION: 3, SHOP_DONE: 10, TODAYS_THREE: 40, WEEK_GOAL: 50, DAILY_SOFT_CAP: 150 } as const`.
   - `UNCAPPED_KINDS: readonly ProgressEventKind[] = ['WEEK_GOAL', 'TODAYS_THREE', 'WELCOME']`.
   - `DEFAULT_ACTIVE_DAY_GOAL = 3`.
2. **`candidates.ts`**
   - `type ProgressCandidate = { kind: ProgressEventKind; sourceId: string; localDate: string; lines: ReceiptLine[]; meta: ReceiptMeta }`.
   - `candidateKey(kind, sourceId) => \`${kind}:${sourceId}\``.
   - `candidateXp(c)`: the sum of its lines.
   - Builders (each returns candidate(s) with the lines from `XP`):
     - `mealCandidate({ date, sourceId, mealType?, slotIndex?, recipeId?, onPlan })`: the `sourceId` is `${mealType}:${slotIndex ?? recipeId}` for a recipe entry, or `custom:${entryId}`. The lines are `LOGGED`, plus `ON_PLAN` when `onPlan`.
     - `limitMealsPerDay(existingMealEventsThatDay: number, candidates)`: keeps the first `XP.MEALS_PER_DAY − existing` candidates (never negative).
     - `fullDayCandidate(date)`, `proteinCandidate(date)`.
     - `cookCandidate({ cookId, localDate, recipeId, recipeName, firstTime, cookCount })`: `COOKED_AT_HOME`, plus `FIRST_TIME` when `firstTime`. Meta carries `recipeId`, `recipeName` and `cookCount`.
     - `workoutCandidates({ sessionId, localDate, prs: { kind: PrKind; exerciseName: string }[] })`: `WORKOUT_COMPLETED` (`WORKOUT_DONE`), plus `WORKOUT_PRS` when there are PRs. That one keeps the best `XP.PRS_PER_SESSION` by value (e1rm > weight > reps), one line per PR (`PR_E1RM` / `PR_WEIGHT` / `PR_REPS`) with `detail` = the exercise name, and `meta.prCount`.
     - `shopDoneCandidate({ planId, localDate })`, `todaysThreeCandidate(date)`, `weekGoalCandidate({ weekStart, localDate })` (key source = weekStart), `welcomeCandidate(localDate)` (one `WELCOME` line of `welcomeXp()`, source `'1'`).
   - `dayCandidates(day: DayFacts): ProgressCandidate[]` composes the meal, full-day and protein candidates for one tracker day. The input type is `{ date; entries: { sourceId; mealType?; slotIndex?; recipeId?; onPlan }[]; planSlots: { mealType; slotIndex }[]; handledSlots: { mealType; slotIndex }[]; totals: { kcal; proteinG; carbsG; fatG }; proteinTargetG: number | null }`. It takes `totals` on purpose: the guardrail test below proves only `proteinG` can matter, and only upward.
3. **`soft-cap.ts`**
   - `capXp(dayXpBefore, raw, cap = XP.DAILY_SOFT_CAP)`: the part of `raw` that fits under `cap − dayXpBefore` counts in full, and the rest is halved (`Math.ceil`).
   - `scoreAgainstDay(candidate, dayXpBefore) => { xp, capped }`. `UNCAPPED_KINDS` bypass the cap.
   - Test 149/150/151 and a 200-XP day.
4. **`levels.ts`**
   - `xpToNext(level) = 80 + 60·level` (7 → 8 = 500).
   - `levelForXp(total): LevelInfo`.
   - `RANKS: Rank[]`: Lv1 KITCHEN_PORTER, 3 COMMIS, 5 LINE_COOK, 8 CHEF_DE_PARTIE, 12 SOUS_CHEF, 16 HEAD_CHEF, 20 EXECUTIVE_CHEF, 25 IRON_CHEF, 30 THREE_STAR. Titles come from `rankTitle`.
   - `rankFor(level)`, `nextRank(level)` (null at the top).
   - `pilotLightMax(level)`: 3 from level 8, else 2.
   - `welcomeXp() = Math.round(0.2 · xpToNext(1))` = 28.
   - `levelUpBetween(totalBefore, totalAfter): LevelUp | null`.
5. **`gym/weeks.ts`**
   - Add an optional third parameter, `settleWeeks(rows, currentWeek, options?: { flexMax?: number; flexCoversEmpty?: boolean })`.
   - Defaults keep today's behaviour exactly; the existing tests must pass unchanged.
   - With `flexCoversEmpty`, a settled week under goal with 0 sessions also spends a token when one is held.
6. **`flame.ts`**
   - `summarizeFlame({ activeDates, goalHistory, pauses, today, level, training }): FlameInfo & { weeks: WeekSummary[] }`.
   - `activeDates` are distinct localDates. The first week is the week of the earliest active date (or today's week).
   - Rows: `goal = goalForWeek(goalHistory, wk)`, with `DEFAULT_ACTIVE_DAY_GOAL` when the history is empty. `sessions` = active days in the week. `paused` = the week overlaps a pause.
   - Then call `settleWeeks(rows, currentWeek, { flexMax: pilotLightMax(level), flexCoversEmpty: true })`.
   - `thisWeek.days`:
     - `active` when the date is in the set;
     - else `rest` when it is before today;
     - `today` for today;
     - `future` after today.
   - `pausedUntil` = the end date of the pause that covers today (or null).
   - `nextMilestone` = the first `FLAME_MILESTONES` entry above `best`, or null.
   - Also export `metWeekStarts(weeks)`, for paying `WEEK_GOAL`.
   - Test: late-synced weeks, a goal change mid-history, a pause, pilot lights earned every 4 met weeks (capped at 2 or 3), a zero-activity week covered.
7. **`achievements.ts`**
   - `ACHIEVEMENTS: { id: AchievementId; group: AchievementGroup; metric: AchievementMetric; tiers: number[] }[]`, exactly the table in tech-plan §9:
     - WELCOME [1] `welcome`
     - HOME_CHEF [10, 50, 150] `cooks`
     - RECIPE_EXPLORER [5, 15, 40] `distinctRecipesCooked`
     - HONEST_LOGGER [7, 30, 100] `daysLogged`
     - FULL_DAY [10, 30, 90] `fullDays`
     - PROTEIN_PRO [5, 20, 60] `proteinDays`
     - PR_MACHINE [5, 25, 75] `prs`
     - IRON_WEEKS [4, 12, 26] `trainingStreakBest`
     - FLAME [4, 8, 12, 26, 52] `flameBest`
     - CLEAN_SWEEP [1, 10, 30] `shopsDone`
     - TODAYS_THREE [3, 15, 50] `todaysThreeDays`
   - `type ProgressCounters = Record<AchievementMetric, number>`.
   - `tierFor(tiers, value)`.
   - `newUnlocks(counters, existing: { achievementId; tier }[])`: every tier reached and not in `existing`, including skipped lower tiers.
   - `buildAchievements(counters, unlocks: { id; achievementId; tier; unlockedAt; seenAt }[]): AchievementsDto`. It uses `ACHIEVEMENT_COPY`; `description` = `describe(nextTarget ?? last tier)`; `isNew` = some unlock of it has `seenAt === null`.
   - `closestNext`: the not-finished item with the highest `progress / nextTarget`. Ties go to the smaller remaining count.
8. **`todays-three.ts`**
   - `pickTodaysThree(input: { localDate; plannedSlots: { mealType; slotIndex; recipeId?; recipeName?; logged: boolean }[]; proteinTargetG: number | null; showProtein: boolean; workoutPlannedToday: boolean; shoppingUnchecked: number; quiet: boolean }): TodaysThreeQuest[]` (all `done: false`).
   - Eligible quests in priority order:
     1. `WORKOUT` (when planned);
     2. `COOK` for the dinner slot with a recipe, else lunch, when not yet logged;
     3. `LOG_SLOT` for the earliest unlogged slot that isn't the cook slot (breakfast → lunch → dinner → snack);
     4. `PROTEIN` (when `showProtein && proteinTargetG && !quiet`);
     5. `SHOP` (when `shoppingUnchecked > 0`);
     6. `LOG_ANY` (always).
   - Take the first three distinct ids. Quest XP: WORKOUT 40, COOK 25, LOG_SLOT 10, PROTEIN 10, SHOP 10, LOG_ANY 5.
   - When `quiet`, never PROTEIN.
   - `questDone(quest, dayEvents: { kind; meta }[])`:
     - LOG_SLOT: a `MEAL_LOGGED` with `meta.mealType === quest.mealType`;
     - COOK: any `COOK_FINISHED`;
     - PROTEIN: `PROTEIN_GOAL`;
     - WORKOUT: `WORKOUT_COMPLETED`;
     - SHOP: `SHOP_DONE`;
     - LOG_ANY: any `MEAL_LOGGED`.
9. **`full-day.ts`**: `isFullDay({ planSlots, handledSlots, loggedCount })`.
   - With plan slots: every slot is handled and `loggedCount >= 2`.
   - Without: `loggedCount >= 3`.
10. **`low-intake.ts`**: `lowIntakeSignal(days: { localDate; totalKcal; full: boolean }[], floorKcal)`. True when at least 3 of the **7 most recent full days** have `totalKcal < floorKcal`.
11. **`recap.ts`**: `recapWeekFor(today)`. Sunday gives that week's Monday; Monday and Tuesday give the previous week's Monday; otherwise null.
12. **Guardrail tests (required):**
    - `no-restriction.test.ts`, using `fast-check` (already a devDependency). For random `DayFacts`:
      - lowering `totals.kcal`, `carbsG` or `fatG` never changes `dayCandidates`' total XP;
      - lowering `proteinG` never **raises** it.
    - `catalogue-guard.test.ts`: no `AchievementMetric`, `QuestKind`, `ProgressEventKind` or `ReceiptLineCode` contains `KCAL`, `CALORIE`, `WEIGHT` (except `PR_WEIGHT`, the lifted weight), `UNDER`, `DEFICIT` or `LOSE`.

**Run before reporting:** `pnpm --filter @chefer/utils test && pnpm --filter @chefer/utils typecheck && pnpm --filter @chefer/utils lint`, plus the gym tests (`packages/utils/src/gym/*.test.ts`) green.

---

## Lane B: server (Prisma, repositories, ProgressService, hooks, back-date)

**Starts after lane A is merged into the integration branch.**
**Owns:**

- `packages/database/prisma/schema.prisma` (new models + relation fields only)
- `packages/database/prisma/migrations/<new>`
- `packages/database/src/repositories/{progress-event,progress-state,progress-unlock,progress-quest-day,cook-log}.repository.ts` + interfaces + index exports
- `apps/api/src/application/progress/**`
- `apps/api/src/scripts/progress-backfill.ts`
- the hook lines in `tracker.service.ts`, `workout-session.service.ts`, `shopping-list.service.ts` and `shopping-list.router.ts` (optional `localDate`)
- `privacy.service.ts` (the export section)
- `apps/mobile/tests/contract/progress.contract.test.ts`

**Read-only:** everything else.

1. **Schema:** the five models exactly as in tech-plan §2, with relation fields added to `User` and `Recipe`. Create the migration with `cd packages/database && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chefer_gam pnpm exec prisma migrate dev --name kitchen_progress`. **Never** touch `chefer_dev`. Then `pnpm db:generate`.
2. **Repositories**, interface-driven like the existing ones:
   - `ProgressEventRepository.append(userId, scored: ScoredEvent[])`. It runs one SERIALIZABLE transaction with the retry pattern from `daily-log.repository.ts` `mutateDay`. For each event:
     - skip it when `(userId, key)` exists;
     - read the day's XP sum, apply `scoreAgainstDay`, insert, and increment `ProgressState.totalXp` (upsert the state row).
     - It returns the inserted rows plus `totalBefore`/`totalAfter`.
   - Queries: `dayEvents(userId, localDate)`, `activeDates(userId)` (distinct localDate where kind ∈ `ACTIVE_DAY_KINDS`), `counters(userId)` (the aggregates for `ProgressCounters`; distinct recipes from `meta->>'recipeId'` of `COOK_FINISHED`), `since(userId, cursor)`, `bySource(userId, kind, sourceId)`, and `weekStats(userId, weekStart)`.
3. **`ProgressRecorder`** (`application/progress/progress-recorder.ts`), implementing `IProgressRecorder` with the pipeline from tech-plan §4.1: score → append → for each touched week, `summarizeFlame` → `WEEK_GOAL` for newly met weeks → `TODAYS_THREE` for touched days with a stored quest set where all quests are `questDone` → `newUnlocks` → insert `ProgressUnlock` rows (`unlockedAt` = now, or the event's date for back-dating). Hook entry points:
   - `onDayChanged(userId, date)`. Re-read the `DailyLog` and the day's plan (`planForDate`), then build `DayFacts`:
     - a recipe entry is `onPlan` when `slotStates` marks a slot `eaten` by it;
     - `handledSlots` = eaten / replaced / skipped;
     - the protein target comes from the same source `tracker.getDay` uses.
     - Then call `limitMealsPerDay` with the count of existing `MEAL_LOGGED` events that day, and record.
   - `onWorkoutsCompleted(userId, sessionIds)`. Load those sessions plus the completed history, find PRs with `collectPrs`/`detectPrs` exactly as `gym-stats.service.ts` does, and record `workoutCandidates`.
   - `onShoppingToggled(userId, planId, localDate | undefined)`. When every item key from `shoppingListService.getForWeek` (items + custom items) is checked, record `SHOP_DONE`. `localDate` falls back to `ChefProfile.timeZone`'s today, else UTC.
4. **Hooks:** call the recorder at the end of `TrackerService.upsertDay`, `logRecipe`, `logCustomMeal`, `copyDay`, `skipSlot`, `unskipSlot` and `deleteCustomMeal`/`deleteEntries`/`unlogRecipe`. Calling it on removals is harmless: nothing is ever revoked (D2), and it may complete a full day through skips. Also call it in `WorkoutSessionService.upsertMany` (results `written` with `status === 'COMPLETED'`, including coached syncs) and in `ShoppingListService.toggleItems` when `checked`. Each hook:
   - is `await`ed;
   - is wrapped in try/catch with `logger.warn`, so it **never** fails the parent call;
   - is injected as an interface with a no-op default in tests.

   Recording happens for **every** user regardless of the flag (D1).

5. **`ProgressService`**: replace the stub bodies (the signatures are fixed).
   - `summary` creates the state on first call. With `backfillVersion` null, it runs `ProgressBackfillService.backfillUser` (§7), then records `WELCOME`. At intro, `lastSeenLevel` is set to the current level and every existing unlock is marked seen, and `intro` is filled until `markSeen({ intro: true })`.
   - It builds the Flame (gym streak from `summarizeUserWeeks` in `gym/gym-context.ts` for `training`) and Today's three. The quests are stored in `ProgressQuestDay` on first read of the day; each quest's `done` comes from `questDone`, and protein progress from the day's totals.
   - `quiet` comes from `lowIntakeSignal` with the user's sex floor (`calorieFloor`). `recap` comes from `recapWeekFor(localDate)` when the user hasn't opened it.
   - `inbox`/`ack`: events after `seenCursor` (origin `LIVE`), unseen unlocks, and `levelUp` when `level > lastSeenLevel`.
   - `finishCook`: upsert the `CookLog` (id = the client UUID, so a repeat call is a no-op), then record `cookCandidate` (`firstTime` = no earlier CookLog for the recipe; `cookCount` = the user's CookLog count). Return a receipt **only if** `isProgressEnabledFor(user)`.
   - The rest are straightforward. Settings are parsed with `progressSettingsSchema` merged over `DEFAULT_PROGRESS_SETTINGS`. A goal change appends `{ fromWeek: weekStartOf(localDate), goal }`, replacing an entry for the same week. A pause is at most 4 weeks, and `resumeFlame` ends it yesterday.
6. **`weeklyRecap`** aggregates from the ledger, `CookLog` (dish of the week = the most-cooked recipe that week, then the highest `MealRating`), workouts (`listCompletedInLocalDateRange`) and the gym goal. Flame and level from/to are recomputed with the week before as the cut-off.
7. **Back-date** (`progress-backfill.service.ts` + script `src/scripts/progress-backfill.ts [--user=email] [--dry-run]`): tech-plan §7. Process chronologically, use the same keys as live, set `origin: 'BACKFILL'` and `backfillVersion = 1`. Re-running is a no-op.
   7b. **Numbers mode NONE** (market-review Lane E, 2026-10-23): when the raw `ChefProfile.numbersMode === 'NONE'` (the ED-safe "hide numbers" mode), `pickTodaysThree` gets `showProtein: false`, so there is no protein quest or protein progress. Read the raw column, not `effectiveNumbersMode()`. Lane E's `/recap` (factual, always on) is a different route; ours is `/kitchen-recap/[week]`.
   7a. **Imported workouts never score** (market-review Lane G, 2026-10-23). Strong/Hevy imports write `WorkoutSession` rows with a new nullable `importSource` ('STRONG' | 'HEVY'). They go through `gym.import.commit`, not `upsertMany`, so the live hook never sees them. Back-dating must skip them. The column is not on master yet, so put the session filter for back-dating in ONE place (`scorableSessionWhere()` in the back-date service) with a `// TODO(lane-G importSource)` comment. The orchestrator adds `importSource: null` once Lane G's PR lands.
8. **Privacy:** add the five tables to `privacy.exportData`. Account deletion is covered by `onDelete: Cascade`; check that `deleteAccount` doesn't need a manual step.
9. **Tests**, Vitest with mocked repositories:
   - recorder idempotency (the same input twice = one append), the soft cap within a day, `WEEK_GOAL` paid once, an unlock inserted once;
   - a hook error does not fail `logRecipe`/`upsertMany`/`toggleItems`;
   - an offline doc with an old `localDate` scores on that date;
   - back-date twice gives the same calls and doesn't double-count with live keys;
   - `finishCook` returns `receipt: null` when the flag is off but still writes the CookLog;
   - flag gating on the router (`FORBIDDEN`).

   Also run `cd apps/api && DATABASE_URL=postgresql://nobody:x@127.0.0.1:1/none npx vitest run` green.

10. **Contract test** `apps/mobile/tests/contract/progress.contract.test.ts`. Run your own API on **3261** against `chefer_gam` with `GAMIFICATION_ALLOWLIST=*`: `PORT=3261 AI_MOCK_ENABLED=true RATE_LIMIT_MAX=3000 GAMIFICATION_ALLOWLIST='*' pnpm --filter @chefer/api dev` in the background, then `EXPO_PUBLIC_API_URL=http://localhost:3261 pnpm --filter @chefer/mobile test:contract -- progress`. Check how the existing contract client picks its URL first. Cover:
    - every procedure's shape;
    - `upsertMany` of a COMPLETED doc with an old `localDate`, twice, gives exactly one `WORKOUT_COMPLETED` dated on that `localDate`;
    - `finishCook` twice gives one CookLog and one event;
    - log a meal → `inbox` has a receipt → `ack` empties it;
    - `tracker.logRecipe` and `gym.session.upsertMany` outputs have no new keys (old binaries).

    Stop your API afterwards.

**Run before reporting:** `pnpm --filter @chefer/database --filter @chefer/api typecheck lint test`, the API-without-DB run, and the contract run.

---

## Lane C: mobile (`apps/mobile`, revamp shell only)

**Owns:**

- `apps/mobile/src/features/progress/**` (new)
- new routes `apps/mobile/app/achievements.tsx`, `app/kitchen-recap/[week].tsx`, `app/settings/rewards.tsx`
- the mount lines in `src/features/shell/today/today-screen.tsx`, `src/features/shell/you-screen.tsx`, `app/cook/[id].tsx`, `src/features/gym/workout/workout-screen.tsx`, `src/features/shell/train/workout-summary-v2.tsx`, `src/features/gym/offline/gym-sync-provider.tsx` (`onSynced`), `src/lib/trpc.ts` (mutation-cache hook) and `app/_layout.tsx` (`ProgressHost`)
- `packages/ui-mobile` only for a genuinely reusable primitive (say so in your report)
- `apps/mobile/tests/unit/progress-*.test.tsx`
- `apps/mobile/e2e/gamification.flow.yaml`

**Read-only:** everything else, including the API (it is a stub until lane B lands, so test against mocked tRPC).

**Gate:** `useProgressEnabled()` = `useFlags().gamification && useShellV2() && trpc.progress.availability` → `enabled`. With the gate off, nothing renders and no `progress.*` call is made (except `finishCook`, see 3). Copy only from `@chefer/utils` (`PROGRESS_COPY`, `questLabel`, …), never inline strings. Motion only from `@chefer/ui-mobile` primitives, with MO-xx ids in comments (CLAUDE.md "Motion"). 44 pt targets, accessibility labels, `min-w-0`.

1. **`ProgressStrip`** (mockup 01). Placed above `NutritionCard` in the shell's `today-screen.tsx`:
   - a level `ProgressRing` with the number, the rank title, "340 / 500 XP to Chef de Partie" with a `ProgressBar`, and 🔥 "6 wk";
   - a Mon–Sun dot row from `flame.thisWeek.days`;
   - "2 of 3 active days".

   Hidden when `!settings.showXp || !settings.showFlameOnToday`. When `showXp` is false and the flame is shown, show the flame row only. Tapping it opens the `FlameSheet`.

2. **`TodaysThreeCard`** (mockup 01), before `YourDayCard`: three rows with an animated check (MO-16) and "+10", the bonus pill, a progress bar, and the footer `todaysThreeFooter`. No tip-jar line (P2). Hidden when `todaysThree` is null or `showXp` is false. Tapping a quest deep-links: LOG_SLOT/LOG_ANY → the log flow, COOK → `/cook/<recipeId>`, WORKOUT → Train, SHOP → Shop.
3. **Cook mode** (`app/cook/[id].tsx`, mockup 02). In `finishCooking()`, generate a UUID (the repo already has a uuid helper; check `features/gym`) and call `progress.finishCook` **when the gate is on or off**, because the cook is recorded for everyone (D1). If the call fails, push it to an AsyncStorage queue (`features/progress/cook-queue.ts`) that flushes on app foreground.
   - In the finished branch, render `KitchenReceipt` (lines, `CountUp` total, the Lv bar) and a Biscuit line (`biscuitLine('cookFinished', cookId)`, existing `Biscuit` loop `cooking` or `allSet`), only when the gate is on and the receipt is not null.
   - Keep `track('cook_finished', {})` exactly where it is (`analytics-beta-funnel.test.ts` asserts it).
4. **Live PR banner** (`workout-screen.tsx:~293`). Where `haptics.success()` fires for a new live PR, also show a non-blocking banner, "New best · Bench press 80 kg × 5" (MO-14 pop), for 3 s, gated. **`workout-summary-v2.tsx`:** a `KitchenReceipt` near `PrCard` from `progress.receiptFor({ kind: 'WORKOUT', sourceId: id })`. When it is null (not synced yet), show nothing. `gym-sync-provider.tsx` `onSynced` invalidates `progress.*`.
5. **`ProgressHost`**, mounted once in `app/_layout.tsx`:
   - `src/lib/trpc.ts`'s mutation cache: after `tracker.*`, `shoppingList.toggleItems` or `progress.finishCook` succeeds, invalidate `progress.summary` + `progress.inbox`, in the same hook pattern as `review-signals.ts`.
   - The host reads `progress.inbox` and, by `settings.celebrations`:
     - **FULL:** small receipts → `showSnackbar` ("+15 XP · Full day logged"); `levelUp` → `LevelUpModal` (RN `Modal` + PopIn + `Celebration`, a Biscuit line, "Keep cooking"); unlocks → a snackbar "New badge: Home Chef II";
     - **SUBTLE:** snackbars only, the level-up included;
     - **OFF:** nothing.
   - Then `progress.ack`. Receipts with kind `COOK_FINISHED`/`WORKOUT_*` are skipped by the host (their screens show them). `quiet` suppresses food snackbars and Biscuit.
6. **`FlameSheet`** (mockup 05, ui-mobile `Sheet`): the big count, `flameBestLabel`, a "This week" card with the dots and the explainer, pilot lights, milestones (`FLAME_MILESTONES`, the next one dashed), a training-streak row when `flame.training` is set, "Change weekly goal" (a `SelectSheet` of 1–7 → `setActiveDayGoal`), and pause/resume.
7. **Achievements** (`app/achievements.tsx`, mockup 06): the earned/total pill, group filter chips, the "Closest next" card, and a grid per group (an icon tile with a tier numeral badge; grey when tier 0). Tapping a tile opens a small sheet with the description and progress. Call `markSeen({ achievements: true })` on mount. Linked from You → "Your progress".
8. **`ChefCard`** (mockup 09) between `ShellTopBar` and `TierRow` in `you-screen.tsx`: level ring, rank, XP bar, flame, and a badges count → Achievements. Hidden when `showXp` is false.
9. **Weekly recap** (`app/kitchen-recap/[week].tsx`, mockup 10): story cards with segment progress at the top, tap left or right, and close. The tiles: cooked at home, workouts · goal met, new PRs, new recipes; dish of the week; Flame from→to, XP and Lv from→to, Biscuit's take (when `biscuit`); "Plan next week" → Meals. No Share (P2). A Today banner shows when `summary.recap` is set, and opening the recap calls `markSeen({ recapWeek })`.
10. **Intro card**: when `summary.intro` is set, a Today card "Welcome to the kitchen", with back-dated XP and badges and `introCta`, which calls `markSeen({ intro: true })`. **Quiet card**: when `quiet`, a calm card with `quietSupportTitle`/`Body`.
11. **Settings** (`app/settings/rewards.tsx`, mockup 12), linked from You → Settings ("Rewards & motivation"): a celebrations segmented control, toggles for `showXp`/`biscuit`/`showFlameOnToday`, the goal picker, the pause card, and the reminder time (a time picker plus an on/off switch).
12. **Gentle reminder** (`features/progress/gentle-reminder.ts`), from tech-plan §6, using `expo-notifications` like `features/gym/reminders/schedule.ts`:
    - on foreground, cancel and reschedule for tomorrow at `reminder.time`;
    - back off after 3 ignored (every 3rd day, then weekly), stored in AsyncStorage;
    - skip a day that already has a Chefer notification scheduled;
    - lines from `REMINDER_LINES`;
    - do nothing when the reminder is disabled or the gate is off.

    Request permission only when the user switches it on.

13. **Tests** (Jest + RNTL, mock tRPC like `tests/unit/you-screen.test.tsx`):
    - the strip and quests render from a fixture, are hidden by `showXp`/`showFlameOnToday`/the flag, and the flag off means no `progress.summary` call;
    - the receipt total;
    - host routing by celebration level (OFF shows nothing but acks);
    - `finishCook` is called once per cook, even with the gate off, and the queue retries;
    - the Flame sheet goal change calls the mutation;
    - the reminder scheduler (fake timers: back-off, skip days).

    Maestro flow `e2e/gamification.flow.yaml`: Today strip → Flame sheet → back → Achievements. The orchestrator runs it on devices.

**Run before reporting:** `pnpm --filter @chefer/mobile typecheck && pnpm --filter @chefer/mobile lint && pnpm --filter @chefer/mobile test`, and `pnpm --filter @chefer/mobile bundle:check`.

---

## Lane D: web (`apps/web`)

**Owns:**

- `apps/web/src/features/progress/**` (new)
- new routes `apps/web/src/app/(dashboard)/achievements/{page,layout}.tsx` and `kitchen-recap/[week]/{page,layout}.tsx`
- the mount lines in `dashboard/page.tsx`, `profile/page.tsx`, `preferences/page.tsx`, `features/recipes/components/cook-mode.tsx`, `features/gym/workout/summary-view.tsx` and the web workout logger's set-tick handler, the dashboard layout (`ProgressHost`), the web tRPC provider's mutation cache
- `tests/e2e/helpers/layout.ts` (`APP_ROUTES`)
- web tests

**Read-only:** everything else (the API is a stub until lane B lands, so test against mocks).

**Gate:** `useFlags().gamification && trpc.progress.availability` → `enabled`. Copy from `@chefer/utils`. UI from `@chefer/ui` (`ProgressRing`, `ProgressBar`, `CountUp`/`useCountUp`, `Sheet`, `Toast`, `Biscuit`, `usePresence`, `useReducedMotion`, `pressControl`/`pressCard`). Tailwind tokens only (`duration-*`, `ease-*`, `shadow-e*`, `rounded-*`), with no `transition-all`, no width transitions and no `h-screen`. Mobile-first at 320–430 px, 44 px targets, `min-w-0`. Every page has `<main id="main">` and exactly one `<h1>`, plus a `layout.tsx` with `metadata.title`. Every input is labelled.

1. Dashboard: `ProgressStrip` + `TodaysThreeCard` at the top of `/dashboard`, with the same rules as mobile C1/C2, the intro card, the quiet card and the recap banner. Tapping the strip opens `FlameSheet` (a `Sheet`, same content as C6).
2. Cook mode: in the finished state, call `progress.finishCook` once (a ref guard; `crypto.randomUUID()` for the id) for everyone, and render `KitchenReceipt` + the Biscuit line when gated and not null.
3. Gym: in `summary-view.tsx`, the receipt from `progress.receiptFor`; in the web workout logger, the live PR banner where `livePrs` detects a new best on tick.
4. `ProgressHost` in the dashboard layout: invalidate on the same mutations as mobile C5, read the inbox, and by celebration level show a `Toast`, a `LevelUpModal` (a `Sheet` with `usePresence` exit, `CountUp`), or nothing. Then ack. There is no confetti primitive on web, so the level-up uses a CSS scale/opacity pop with tokens.
5. `/achievements` (mockup 06), `/kitchen-recap/[week]` (mockup 10, a card sequence with keyboard ←/→), a `ChefCard` at the top of `/profile`, and a "Rewards & motivation" card on `/preferences`: celebrations, `showXp`, `showFlameOnToday`, the Biscuit toggle, the goal select, pause/resume. **No reminder row on web** (no web push).
6. Add `/achievements` and a `/kitchen-recap/<this-week-monday>` route to `APP_ROUTES`. Gated pages render a friendly "not available" state when the gate is off, so the sweep still passes. CI `FEATURE_FLAGS` gaining `gamification` is the orchestrator's job.
7. Tests (Vitest + RTL, next to the existing web tests): strip/quests render and hide; the receipt total; host routing by celebration level; the cook page calls `finishCook` once; the achievements page shows closest next; the preferences card calls `updateSettings`.

**Run before reporting:** `pnpm --filter @chefer/web typecheck && pnpm --filter @chefer/web lint && pnpm --filter @chefer/web test`.

---

## Integration and proof (orchestrator)

1. Merge A into the integration branch → start B.
2. Merge C, then D. Re-run typecheck after each merge.
3. Merge B, then run every client against the real API.
4. Docs:
   - `infrastructure.md`: §4 routes, §5.2/§5.3, §6 schema, §7 services, §8 procedures, §10 env;
   - `business_flow.md`: a "Kitchen progress" flow;
   - `GLOSSARY.md`;
   - `docs/adr/0002-progress-ledger.md`.

   No `mobile_parity_backlog.md` entry is needed (both platforms ship). Add `gamification` to CI `FEATURE_FLAGS`.

5. Ladder: typecheck/lint/format → `pnpm test` → API without a DB → contract on 3260 (`GAMIFICATION_ALLOWLIST=*`) → `bundle:check` + fingerprint unchanged → Playwright `--project=mobile` → iOS simulator (Maestro + screenshots) → Android `Pixel_8` layout pass (claim the emulator in the coordination file).
6. Merge `origin/master` in, then open the PR to master (not merged). The body covers the ladder, screenshots, compatibility notes (no API level) and owner actions: the D9 copy review, `GAMIFICATION_ALLOWLIST` for dogfood, then flipping `gamification`.
