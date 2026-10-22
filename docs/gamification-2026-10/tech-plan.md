# Kitchen progress P1: technical plan

_Draft for owner approval · 2026-10-22 · builds the P1 scope of [README.md](./README.md) §8. No code yet._

**Summary**

- One append-only **ledger** (`ProgressEvent`) records every reward. Each row has an idempotency key, so a sync retry, an offline replay or the back-date run can never pay twice.
- Every rule is a **pure function** in `@chefer/utils/progress`: XP, soft cap, levels and ranks, Flame, pilot lights, achievements, Today's three, the low-intake guard and the receipt copy. The API scores with them, and mobile and web render with them.
- The **server is authoritative.** Rewards are written by hooks inside the existing tracker, gym-sync and shopping services, plus one new `progress.finishCook` that gives cook mode a server record (`CookLog`).
- **Only new things are added**: new `progress.*` procedures, new tables, and one new optional input field. No existing output changes and **no new API level**, so binaries 1.0.1 and 1.0.2 in the field are untouched.
- The ledger records for **everyone from deploy day**. The `gamification` flag (plus `GAMIFICATION_ALLOWLIST`) only decides who **sees** it. Back-dating reuses the live idempotency keys, so it can run any number of times.

Nine decisions need a yes or no from you. They are in §11, each with a recommendation.

---

## 1. Constraints this plan is built around

| Constraint                                                     | Where it comes from                                            | Consequence                                                                                                                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No per-user time zone on writes                                | `WeeklyEmailWorker` uses fixed UTC hours                       | Every event carries the **device-local `localDate`** the action belongs to, taken from data that already has one: `WorkoutSession.localDate`, `DailyLog.date`, and new inputs. `ChefProfile.timeZone` is the fallback. |
| A finished cook is client-only                                 | `cook_finished` analytics, `apps/mobile/app/cook/[id].tsx:229` | New `CookLog` table and `progress.finishCook`, keyed by a client UUID.                                                                                                                                                 |
| No meal-plan approval step                                     | `MealPlanStatus` is DRAFT/ACTIVE/ARCHIVED                      | "Plan approved by Sunday" (+10) moves to P2 together with idea 36 ("Prepped").                                                                                                                                         |
| No "full day" concept                                          | tracker has only `slotStates`                                  | "Full day" becomes a pure rule over `slotStates` (§3.4).                                                                                                                                                               |
| PRs are computed on read                                       | `collectPrs` in `gym-stats.service.ts`                         | The sync hook scores PRs with the same `collectPrs` over the user's completed history.                                                                                                                                 |
| No server push                                                 | reminders are local `expo-notifications`                       | Gentle reminders are local notifications on mobile. Web has none (no web push), noted as N/A for parity.                                                                                                               |
| No veg data                                                    | no veg field on recipes or logs                                | The "veg serving" half of idea 30 moves to P2. "Protein reached" ships.                                                                                                                                                |
| `db push` in production                                        | `docker-compose.deploy.yml` migrate                            | Schema changes are additive only: new tables, no new constraints on existing tables.                                                                                                                                   |
| Shipped binaries call `upsertMany`, `logRecipe`, `toggleItems` | CLAUDE.md "never break shipped clients"                        | Hooks run **after** the existing write and are best-effort (try/catch + log), like the progression recompute. Outputs are unchanged.                                                                                   |

## 2. Data model (Prisma, additive)

```prisma
/// Kitchen progress ledger. Append-only: rows are never updated or deleted
/// (except by the user cascade). XP is stored as awarded, so later tuning of
/// the XP table never rewrites history.
model ProgressEvent {
  id           String   @id @default(cuid())
  userId       String
  key          String   // idempotency key "<KIND>:<sourceId>", unique per user
  kind         String   // ProgressEventKind (Zod in @chefer/types; a string so P2 kinds need no schema change)
  sourceId     String
  localDate    String   // "YYYY-MM-DD": the device-local day the action counts for
  xp           Int      // after the daily soft cap
  lines        Json     // ReceiptLine[]: [{ code, xp }] before the cap, plus { capped }
  meta         Json     @default("{}") // { recipeId, mealType, prCount, weekStart, … }
  origin       String   // LIVE | BACKFILL
  rulesVersion Int
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
  @@index([userId, localDate])
  @@index([userId, createdAt])
  @@map("progress_events")
}

/// A finished cook-mode session (the server record that was missing).
model CookLog {
  id         String    @id // client UUID: retries and the offline queue are idempotent
  userId     String
  recipeId   String?
  localDate  String
  startedAt  DateTime?
  finishedAt DateTime
  createdAt  DateTime  @default(now())

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  recipe Recipe? @relation(fields: [recipeId], references: [id], onDelete: SetNull)

  @@index([userId, localDate])
  @@index([userId, recipeId])
  @@map("cook_logs")
}

/// One row per user: cached totals, settings and "seen" cursors.
model ProgressState {
  userId          String    @id
  totalXp         Int       @default(0)  // = SUM(progress_events.xp), updated in the same transaction
  settings        Json      @default("{}") // ProgressSettings (Zod, defaults applied on read)
  goalHistory     Json      @default("[]") // active-day goal [{ fromWeek, goal }], same shape as GymProfile.goalHistory
  pauses          Json      @default("[]") // Flame pauses: PauseRange[]
  backfillVersion Int?      // null = history not back-dated yet
  introducedAt    DateTime? // the "Welcome to the kitchen" card was shown
  seenCursor      DateTime? // events created after this still need a moment
  lastSeenLevel   Int       @default(1)
  recapSeenWeek   String?   // Monday of the last weekly recap opened
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("progress_states")
}

model ProgressUnlock {
  id            String    @id @default(cuid())
  userId        String
  achievementId String
  tier          Int       // 1..n
  unlockedAt    DateTime  // when the threshold was crossed (back-dated for history)
  seenAt        DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, achievementId, tier])
  @@map("progress_unlocks")
}

/// The day's three quests, fixed when first shown so they don't change under the user.
model ProgressQuestDay {
  userId    String
  localDate String
  quests    Json // TodaysThreeQuest[]

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, localDate])
  @@map("progress_quest_days")
}
```

`ProgressSettings` (Zod, `@chefer/types`), with defaults: `celebrations: 'FULL' | 'SUBTLE' | 'OFF'` (FULL), `showXp` (true), `showFlameOnToday` (true), `biscuit` (true), `reminder: { enabled: false, time: '19:30' }`.

All five tables cascade from `User` (account deletion), and `privacy.exportData` gains a `progress` section.

## 3. Rules: `packages/utils/src/progress/` (pure, shared, unit-tested)

| File              | Exports                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xp-table.ts`     | `XP` constants (the README §5 table), `RULES_VERSION`                                                                                                                                            |
| `score.ts`        | `scoreCandidate(candidate, ctx) → { key, kind, localDate, lines, rawXp }`, plus one builder per source (`mealCandidates`, `workoutCandidates`, `cookCandidate`, …)                               |
| `soft-cap.ts`     | `capXp(dayXpBefore, rawXp)`: XP up to 150 a day counts in full, and the part above 150 is halved (rounded up). Bonuses (`WEEK_GOAL`, `TODAYS_THREE`, `WELCOME`) are not capped.                  |
| `levels.ts`       | `xpToNext(n) = 80 + 60·n`, `levelForXp(total) → { level, xpIntoLevel, xpForLevel }`, `RANKS`, `rankFor(level)`, `nextRank(level)`, `pilotLightMax(level)` (2, or 3 from level 8, Chef de Partie) |
| `flame.ts`        | `summarizeFlame({ activeDates, goalHistory, pauses, today, level }) → FlameInfo` (§5)                                                                                                            |
| `achievements.ts` | `ACHIEVEMENTS` catalogue, `evaluateAchievements(counters) → { id, tier, reachedAt? }[]`, `closestNext(list)`                                                                                     |
| `todays-three.ts` | `pickTodaysThree(input) → TodaysThreeQuest[]`, `questDone(quest, dayEvents)`                                                                                                                     |
| `full-day.ts`     | `isFullDay({ slots, entries, skipped })`                                                                                                                                                         |
| `low-intake.ts`   | `lowIntakeSignal(days, floorKcal) → boolean` (§3.6)                                                                                                                                              |
| `copy.ts`         | `receiptLineLabel(code, params)`, rank titles, quest labels, Biscuit lines, reminder lines. Scanned by `no-forbidden-copy` and `copy-lint.test.ts`.                                              |

### 3.1 Event kinds, keys and XP

| Kind                | Key (`sourceId`)                                                         | Written by                                              | XP (receipt lines)                                                                                  | Active day? |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| `MEAL_LOGGED`       | `<date>:<mealType>:<slotIndex \| recipeId>` or `<date>:custom:<entryId>` | tracker hook                                            | 5 `LOGGED`, +5 `ON_PLAN` when it fills a plan slot ("I ate this" = 10). At most 5 meals a day earn. | ✅          |
| `FULL_DAY`          | `<date>`                                                                 | tracker hook                                            | 15                                                                                                  |             |
| `PROTEIN_GOAL`      | `<date>`                                                                 | tracker hook                                            | 10                                                                                                  |             |
| `COOK_FINISHED`     | `<cookLogId>`                                                            | `progress.finishCook`                                   | 25 `COOKED_AT_HOME`, +10 `FIRST_TIME` (no earlier `CookLog` for that recipe)                        | ✅          |
| `WORKOUT_COMPLETED` | `<sessionId>`                                                            | gym sync hook                                           | 40                                                                                                  | ✅          |
| `WORKOUT_PRS`       | `<sessionId>`                                                            | gym sync hook                                           | e1RM 20 / weight 15 / reps 10, counting the best 3 PRs in the session                               |             |
| `SHOP_DONE`         | `<planId>`                                                               | shopping hook                                           | 10                                                                                                  |             |
| `TODAYS_THREE`      | `<date>`                                                                 | any hook, when all three quests of a shown day are done | 40                                                                                                  |             |
| `WEEK_GOAL`         | `<weekStart>`                                                            | any hook that adds an active day                        | 50 (and the Flame grows)                                                                            |             |
| `WELCOME`           | `1`                                                                      | first `progress.summary`                                | 20% of level 1 (28 XP), plus the "Welcome to the kitchen" badge (endowed start, idea 6)             |             |

### 3.2 XP is never taken back

Unlogging a meal or deleting a workout keeps its XP and its active day, and a level never goes down (guardrail 4: no "you lost"). Abuse is bounded:

- per-entry keys mean re-logging the same slot pays nothing;
- only 5 meals a day earn;
- the soft cap halves anything above 150 a day;
- XP buys nothing.

This needs your OK: **D2**.

### 3.3 Honest logging and the no-restriction rule (guardrail 1, ideas 28 and 59)

- No rule reads `kcal`, carbs, fat, weight or a deficit. The only intake number any rule reads is protein, and it can only **add** XP when protein goes **up**.
- An enforcing test (`no-restriction.test.ts`) generates random days and checks that lowering any intake number never raises XP. A second test checks that no event kind, achievement metric or quest type mentions weight, kcal or "under".

### 3.4 Full day (idea 29)

A day is full when every plan slot for that date is logged, replaced (`replacesSlot`) or skipped, **and** at least two entries were logged. Without a plan, a day with at least 3 logged entries is full. The rule uses the existing `slotStates` / `resolveTodayMeals` from `today.ts`.

### 3.5 Today's three (idea 15)

`pickTodaysThree` is deterministic, seeded by userId and date. It picks up to three quests from what is real today:

- **log a meal slot**, for a slot that is planned and not yet logged;
- **cook a planned dish**, a dinner or lunch recipe from the plan;
- **reach protein**, only when the numbers mode shows protein;
- **finish today's workout**, only when the routine plans a workout today;
- **finish the shopping list**, only when the list has unchecked items;
- **log any meal**, the fallback when there is no plan.

No quest is ever about eating less. The pick is stored in `ProgressQuestDay` the first time it is shown. A quest is "done" when the matching ledger event exists for that date. The +40 bonus is paid once all three are done.

### 3.6 Low-intake guard (idea 59)

`lowIntakeSignal` is true when at least 3 of the last 7 **full days** are below the user's sex-specific calorie floor (`CALORIE_FLOOR_FEMALE` 1,200 / `CALORIE_FLOOR_MALE` 1,500, from `calorie-target.ts`). When it is true:

- `progress.summary` returns `quiet: true`;
- clients skip food celebrations and Biscuit lines, and drop the protein and full-day quests;
- Today shows a calm support card. **Its copy needs your sign-off.**

XP is still recorded exactly the same way, because honest logging is never penalised.

## 4. Server: `apps/api/src/application/progress/`

```
routers/progress.router.ts        thin: Zod input → service
application/progress/
  progress.service.ts             summary, inbox/ack, settings, goal, pause, achievements, recap, finishCook
  progress-recorder.ts            IProgressRecorder: what the tracker/gym/shopping services call
  progress-backfill.service.ts    back-dating (§7)
  progress-recap.service.ts       weekly recap DTO
packages/database/src/repositories/
  progress-event.repository.ts    append(userId, scored[]) in one SERIALIZABLE tx + retry
  progress-state.repository.ts, progress-unlock.repository.ts, cook-log.repository.ts, progress-quest-day.repository.ts
```

### 4.1 One write path

All writes go through `ProgressRecorder.record(userId, candidates)`:

1. **Score** each candidate with the pure functions.
2. **Append** in one serializable transaction:
   - skip any key that already exists;
   - read the day's XP so far and apply `capXp`;
   - insert the row and increment `ProgressState.totalXp`.
3. **Derive** the follow-on rewards:
   - for every week that gained an active day, run `summarizeFlame` and append `WEEK_GOAL` when the goal is met;
   - for each touched day that has a stored quest set, append `TODAYS_THREE` when all three are done.
4. **Evaluate achievements** from the counters (aggregates over the ledger, plus the gym streak's best) and insert any new `ProgressUnlock` rows.

The recorder is injected into services as an interface (`IProgressRecorder`), following architecture rule 3. Services under test get a no-op.

### 4.2 Hooks in existing services

All hooks run after the main write. They are awaited so the client's next `progress.inbox` read sees the reward, and they are wrapped in try/catch: a progress error must never fail a log or a sync.

| Existing call                                                                              | Hook                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TrackerService.logRecipe` / `logCustomMeal` / `upsertDay` / `copyDay` / `skipSlot`        | `recorder.onDayChanged(userId, date)`. It re-reads the day once and emits candidates for every entry, plus full day and protein. Idempotent, so a single "diff" hook covers every write path.           |
| `WorkoutSessionService.upsertMany` (live app **and** offline outbox **and** coached syncs) | `recorder.onWorkoutsCompleted(userId, ids)` for docs whose result is `written` and whose status is `COMPLETED`. PRs come from `collectPrs` over completed history, as `gym-stats.service` already does. |
| `ShoppingListService.toggleItems` with `checked: true`                                     | `recorder.onShoppingToggled(userId, planId, localDate?)`. When every key is checked, it appends `SHOP_DONE`.                                                                                            |

**Scoring offline workouts.** The outbox replays old docs through the same `upsertMany`. The event's `localDate` is the workout's own, so a workout synced on Wednesday for last Saturday counts for Saturday: it can complete last week's goal and the Flame for that week. The key is the client session id, so retries and replays pay once. The mobile `onSynced` callback (`gym-sync-provider.tsx:102`) invalidates `progress.*`, and the summary screen shows the receipt once the server has scored it.

### 4.3 Procedures (new, additive)

Gate: `progressProcedure = protectedProcedure.use(requireProgressEnabled)`. It is enabled when the `gamification` flag is on or the email is on `GAMIFICATION_ALLOWLIST` (`*` = everyone), the same pattern as `friends-middleware.ts`. When it is off, calls get `FORBIDDEN` with `data.progressUnavailable`.

| Procedure                             | Type     | Input                                                       | Output                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `progress.availability`               | query    | —                                                           | `{ enabled }` (ungated)                                                                                                                                                                                                                                        |
| `progress.summary`                    | query    | `{ localDate }`                                             | `{ xp: { total, level, xpIntoLevel, xpForLevel }, rank, nextRank, flame: FlameInfo, todaysThree, settings, quiet, intro?: { backdatedXp, badges }, recap?: { weekStart } }`. On first call it creates the state, adds `WELCOME` and runs the user's back-date. |
| `progress.inbox`                      | query    | —                                                           | `{ receipts: Receipt[], unlocks: Unlock[], levelUp?: { from, to, rank } }`: everything since `seenCursor` that hasn't had its moment yet                                                                                                                       |
| `progress.ack`                        | mutation | `{ upTo: Date, unlockIds?: string[], level?: number }`      | `{ ok }`                                                                                                                                                                                                                                                       |
| `progress.receiptFor`                 | query    | `{ kind: 'WORKOUT' \| 'COOK', sourceId }`                   | `Receipt \| null`, so the cook-finished and workout-summary screens show their own receipt                                                                                                                                                                     |
| `progress.finishCook`                 | mutation | `{ id: uuid, recipeId, localDate, startedAt?, finishedAt }` | `{ receipt: Receipt \| null }`. **Not gated**: it always stores the `CookLog`, and returns a receipt only when progress is enabled for the user (D1).                                                                                                          |
| `progress.achievements`               | query    | —                                                           | `{ earned, total, closestNext, groups: [{ group, items: [{ id, tier, tiers, progress, target, unlockedAt }] }] }`                                                                                                                                              |
| `progress.weeklyRecap`                | query    | `{ weekStart }`                                             | `{ cooked, workouts, workoutGoalMet, prs, newRecipes, dishOfWeek?, flame: { from, to }, xp, level: { from, to }, biscuitLine? }`                                                                                                                               |
| `progress.updateSettings`             | mutation | `Partial<ProgressSettings>`                                 | `ProgressSettings`                                                                                                                                                                                                                                             |
| `progress.setActiveDayGoal`           | mutation | `{ goal: 1..7, localDate }`                                 | `FlameInfo`. Takes effect from this week (appended to `goalHistory`).                                                                                                                                                                                          |
| `progress.pauseFlame` / `resumeFlame` | mutation | `{ startDate, weeks: 1..4 }` / `{ localDate }`              | `FlameInfo`                                                                                                                                                                                                                                                    |
| `progress.markSeen`                   | mutation | `{ intro?: true, recapWeek?: string }`                      | `{ ok }`                                                                                                                                                                                                                                                       |

**Changes to existing procedures:** only `shoppingList.toggleItems` gets an optional `localDate`. Nothing else changes in any input or output.

**API level:** none is needed, because old binaries never call `progress.*` and see no new fields. The coordination file's level table stays as it is.

## 5. The Flame, and how it meets the gym streak

- An **active day** is a `localDate` with at least one `MEAL_LOGGED`, `COOK_FINISHED` or `WORKOUT_COMPLETED` event.
- `summarizeFlame` **reuses `settleWeeks`** from `gym/weeks.ts`. The input rows are `{ weekStart, goal: activeDayGoal, sessions: activeDays, paused }`, so the Flame and the gym streak run the **same** settlement code: met / current / paused / flex / under.
- `settleWeeks` gains two optional options, and existing callers keep today's behaviour:
  - `flexMax` (default 2): the Flame passes `pilotLightMax(level)`, which is 3 from Chef de Partie;
  - `flexCoversEmpty` (default false): the Flame passes true, so a pilot light also covers a week with **zero** active days (a sick week). **D3.**
- **Pilot lights** are the Flame's own tokens, earned every 4 met weeks. The gym's flex tokens stay as they are.
- **Gym streak = sub-flame (idea 13).**
  - The gym weekly streak, its goal, flex tokens and `TrainingPause` are untouched. Every surface that shows them today keeps doing so.
  - Workouts feed the Flame as active days.
  - The Flame sheet shows a "Training: N-week streak" row from the existing `gym.bootstrap` streak.
  - The "Iron Weeks" achievement reads the gym streak's best.
- **Pause my flame (idea 11):** `ProgressState.pauses`, at most 4 weeks at a time, ends automatically. A Flame pause does not pause the training streak, and a training pause does not pause the Flame, because you can still cook while you rest from the gym (**D8**).
- **Flame milestones (idea 14):** badges at 4/8/12/26/52 weeks of the Flame's best. Each one gets a tier-3 celebration.
- **History** starts at the week of the user's first event, so back-dated users get their real Flame.

## 6. Clients

**Mobile: revamp shell only (D7).** Production runs `mobileShellV2`, so the legacy shell gets nothing new. Everything sits in `apps/mobile/src/features/progress/` and is gated by `useFlags().gamification && useShellV2()` plus `progress.availability`.

| Mockup                     | Mobile                                                                                                                                                                                                 | Web                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 01 Today strip + three     | `ProgressStrip` (ProgressRing for the level, ProgressBar for XP, a 7-day dot row, the Flame count) above `NutritionCard`, and `TodaysThreeCard` before `YourDayCard` in `shell/today/today-screen.tsx` | the same two cards at the top of `/dashboard`                                  |
| 02 Cook finished + receipt | `KitchenReceipt` after the title in `cook/[id].tsx`'s finished branch, plus a Biscuit line; `finishCook` is called in `finishCooking()`                                                                | `cook-mode.tsx` finished state                                                 |
| 03 PR (live + summary)     | live PR banner at `workout-screen.tsx:293`, using the existing `livePr`; receipt on `workout-summary-v2.tsx` near `PrCard`                                                                             | `summary-view.tsx` PR block; live banner in the web workout logger (`livePrs`) |
| 04 Level up                | `LevelUpModal` (RN `Modal` + PopIn + `Celebration`, MO-18 in code, MO-07 in the audit), from `ProgressHost`                                                                                            | `Sheet`-based modal with `usePresence` exit                                    |
| 05 Flame sheet             | `FlameSheet` (ui-mobile `Sheet`), opened by tapping the strip                                                                                                                                          | `Sheet` on the dashboard                                                       |
| 06 Achievements            | route `app/achievements.tsx`, linked from You → "Your progress"                                                                                                                                        | `/achievements` (with `layout.tsx` metadata)                                   |
| 09 Chef card               | `ChefCard` between `ShellTopBar` and `TierRow` in `you-screen.tsx`                                                                                                                                     | top of `/profile`                                                              |
| 10 Weekly recap            | route `app/recap/[week].tsx` (story cards, tap to advance), with a Today banner from Sunday to Tuesday                                                                                                 | `/recap/[week]`, with a dashboard banner                                       |
| 12 Rewards & motivation    | route `app/settings/rewards.tsx`, linked from You → Settings                                                                                                                                           | a "Rewards & motivation" card on `/preferences`                                |
| (idea 58) Gentle reminder  | `features/progress/gentle-reminder.ts`, a local notification (see below)                                                                                                                               | N/A: no web push. Noted in the PR.                                             |

- **Moments.** `ProgressHost` is mounted once in `app/_layout.tsx` (web: the dashboard layout). After the mutation cache sees a success on `tracker.*`, `shoppingList.toggleItems` or `progress.finishCook`, or a gym sync, it refetches `progress.inbox`. This is the same hook point as `review-signals.ts`. Then, by celebration level:
  - **Full:** a Kitchen-receipt snackbar for small rewards, a level-up modal, and a tier-3 `Celebration` for milestones;
  - **Subtle:** the snackbar only, with a level-up shown as a snackbar too;
  - **Off:** nothing is shown, and everything is acked silently.

  Receipts already shown inline (cook, workout summary) are acked there. Reduced motion is always respected (`Celebration` already renders nothing under it).

- **Hide it all (idea 57).** `showXp: false` hides the strip, the chef card, receipts and level-ups. `showFlameOnToday: false` hides only the strip. Achievements stay reachable from You.
- **Biscuit cameo (idea 44).** One line from `copy.ts` on cook finished, level-up, Flame milestones and the recap. It uses the existing `Biscuit` loops (`allSet`, `cooking`), so there are **no new loops**. Off when `settings.biscuit` is false or `quiet` is true.
- **Gentle reminder (idea 58).** Default **off** (**D6**).
  - On every app foreground, cancel the pending reminder and schedule one for **tomorrow** at the chosen time. It therefore only fires on a day the app wasn't opened.
  - After 3 reminders in a row with no open in between, step back to every 3rd day, then weekly. Opening the app resets this.
  - It skips days that already have a Chefer notification (`food-nudges`, gym reminders), so the total stays at one a day.
  - It uses `expo-notifications`, which is already installed, so it is OTA-safe and the fingerprint is unchanged.
- **Cook finish offline.** `finishCook` is retried from a small AsyncStorage queue on the next foreground. The id is the cook's UUID, so the queue is idempotent.
- **Motion.** Only the shared primitives and tokens are used (`PressableScale`, `haptics`, `CountUp`, `ProgressRing`/`ProgressBar`, `timing()`/`springs`; web uses `pressControl`, `usePresence`, `useCountUp`), each with its MO-xx id in a comment. The XP bar and ring use the shared progress primitives (MO-06), and the receipt total uses `CountUp`.
- **Copy.** Every user-facing string lives in `@chefer/utils/progress/copy.ts`, so mobile and web share it and `no-forbidden-copy` scans it. Example: the pilot-light line can't say "Streak safe", because "safe" is on the banned list.

## 7. Back-dating (idea 7)

`ProgressBackfillService.backfillUser(userId)` turns existing history into ledger events with `origin: BACKFILL`. It uses the **same keys as the live hooks**, so overlap with anything recorded since deploy is a no-op.

| Source                                | Events                                                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkoutSession` COMPLETED            | `WORKOUT_COMPLETED`, plus `WORKOUT_PRS` from one chronological `collectPrs` pass                                                                                                                                                               |
| `DailyLog` rows                       | `MEAL_LOGGED` per entry (max 5 a day), plus `FULL_DAY` with the plan resolved per week (`planForDate`'s week rule, all plans loaded once). `PROTEIN_GOAL` is **not** back-dated, because the target in force on old days isn't known reliably. |
| `ShoppingList` with every key checked | `SHOP_DONE` (`localDate` = the Sunday of the plan's week)                                                                                                                                                                                      |
| Cooks                                 | None: before `CookLog` the server never knew. Cook-mode logs can't be told apart from ordinary logs.                                                                                                                                           |
| Derived                               | `WEEK_GOAL` per met week, the Flame, and achievements with a back-dated `unlockedAt`                                                                                                                                                           |

- Events are processed in date order, so the soft cap applies per day just as it would have live.
- **When it runs:**
  - lazily, inside the user's first `progress.summary` (bounded: one user's history is small today);
  - or ahead of time with `pnpm --filter @chefer/api exec tsx src/scripts/progress-backfill.ts [--user=email] [--dry-run]`.

  `backfillVersion` makes it re-runnable when rules change.

- **No celebration storm.** At intro, `lastSeenLevel` is set to the current level and every back-dated unlock is marked seen. Instead the user gets **one** "Welcome to the kitchen" card: "Your history earned 1,240 XP and 6 badges". That card is the endowed-start moment.

## 8. Feature flag and rollout

1. New flag `gamification` in `featureFlagsSchema`, and the new env var `GAMIFICATION_ALLOWLIST` (emails, or `*`), added to `env.ts`, `.env.example` and `infrastructure.md` §10.
2. **Merge → deploy** (API, web) and **OTA** (mobile). The ledger starts recording for everyone (D1). Nobody sees anything yet.
3. Dogfood with `GAMIFICATION_ALLOWLIST=<owner + testers>` for about 2 weeks, then tune the XP table (`RULES_VERSION` + 1).
4. Add `gamification` to `FEATURE_FLAGS` so everyone sees it. Web and mobile switch on at the same moment (owner decision 8).
5. **Measure:** the analytics events `progress_level_up`, `progress_celebrations_changed` (the pressure signal), `progress_hidden`, `progress_reminder_toggled` and `recap_opened`, added to `analytics-events.ts`.

## 9. P1 scope check

| Ideas         | In P1 as                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–7           | Chef XP, ranks, the level-up modal, the Kitchen receipt, the soft cap, the endowed start, back-dating                                                      |
| 8–11, 13, 14  | the Flame, active days, pilot lights, pause, the gym sub-flame, milestones                                                                                 |
| 15            | Today's three. The tip-jar line in mockup 01 is P2 (idea 16), so the card reads "Finish all three for +40 XP".                                             |
| 20, 21        | the cooked-at-home bonus and first-time bonus. The plate photo (+5) is P2 (idea 24).                                                                       |
| 28–30         | honest logging, full day, protein reached. Veg is P2 (no data).                                                                                            |
| 31            | the live PR banner and PR receipt                                                                                                                          |
| 37            | Clean sweep                                                                                                                                                |
| 38, 39        | tiered achievements and closest next. The full-screen "unlocked" sheet (mockup 07) is P2: in P1 an unlock is a receipt line plus a "new" dot on the shelf. |
| 44, 52, 56–59 | the Biscuit cameo, weekly recap, celebration level, hide it all, gentle reminders, no-restriction rule                                                     |

**Achievements at launch: 11 achievements, 36 badges** (the README said "about 25"; trim if you like):

| Group   | Achievement            | Tiers                        | Counts                       |
| ------- | ---------------------- | ---------------------------- | ---------------------------- |
| Kitchen | Welcome to the kitchen | 1                            | intro                        |
| Kitchen | Home Chef              | 10 / 50 / 150                | cook-mode finishes           |
| Kitchen | Recipe Explorer        | 5 / 15 / 40                  | different recipes cooked     |
| Table   | Honest Logger          | 7 / 30 / 100                 | days with a logged meal      |
| Table   | Full Day               | 10 / 30 / 90                 | full days                    |
| Table   | Protein Pro            | 5 / 20 / 60                  | protein-goal days            |
| Gym     | PR Machine             | 5 / 25 / 75                  | PRs                          |
| Gym     | Iron Weeks             | 4 / 12 / 26                  | best training streak (weeks) |
| Flame   | Flame                  | 4 / 8 / 12 / 26 / 52 (crown) | best Flame (weeks)           |
| Plan    | Clean Sweep            | 1 / 10 / 30                  | shopping lists finished      |
| Plan    | Today's Three          | 3 / 15 / 50                  | days with all three done     |

Achievements that need data we don't have yet (fish or egg dishes, cuisines, photos, secrets, limited monthly badges) are P2.

## 10. Test strategy

| Layer                                                                            | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@chefer/utils` (Vitest, TDD)                                                    | Every rule file, with table-driven cases: level boundaries (7→8 = 500), the soft cap at 149/150/151, Flame settlement including pilot lights, the empty-week cover, pauses, goal changes, the max-3 pilot lights from level 8 and late-synced weeks, `settleWeeks` defaults unchanged (the existing gym tests stay green), achievement tiers and `closestNext`, determinism of `pickTodaysThree`, full day with and without a plan, `lowIntakeSignal`. **Guardrail tests:** `no-restriction.test.ts` (property: lowering intake never raises XP) and a catalogue test (no weight/kcal/"under" metric). `copy-lint.test.ts` is extended to `progress/copy.ts`. Every test that uses dates pins the clock (operating rules §4). |
| API services (Vitest, mocked repos)                                              | The recorder is idempotent (the same candidates twice = one row), applies the soft cap within a day, pays `WEEK_GOAL` once, and survives errors (a recorder throw never fails `logRecipe`/`upsertMany`). The hooks fire only for `written` + `COMPLETED`. Back-dating twice gives the same ledger and does not double-count with live events. Flag gating returns `progressUnavailable`.                                                                                                                                                                                                                                                                                                                                      |
| API without a DB                                                                 | `DATABASE_URL=…nobody… npx vitest run` stays green                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Contract (`apps/mobile/tests/contract/progress.contract.test.ts`, real API + DB) | The shape of every `progress.*` procedure. An **offline-sync scenario**: `upsertMany` of an old COMPLETED doc twice gives one `WORKOUT_COMPLETED` dated on the doc's `localDate`. `finishCook` retry is idempotent. Log → inbox has a receipt → ack empties it. A **level-8 client** still gets byte-identical `tracker.logRecipe` / `gym.session.upsertMany` outputs. Contract runs need `GAMIFICATION_ALLOWLIST=*`.                                                                                                                                                                                                                                                                                                         |
| Mobile (Jest + RNTL)                                                             | Strip and quests render from a fixture, and are hidden by `showXp`/`showFlameOnToday` and by the flag. The receipt totals. Celebration levels route correctly (Off shows nothing). The `cook-mode` finished branch calls `finishCook` once. `analytics-beta-funnel.test.ts` is kept green. The gentle-reminder scheduler (fake timers: back-off, skip days that have another notification).                                                                                                                                                                                                                                                                                                                                   |
| Web (Vitest/RTL + Playwright)                                                    | Component tests for the strip, the Flame sheet, the achievements page and the settings card. `/achievements` and `/recap/<week>` are added to `APP_ROUTES` for the mobile overflow and touch-target sweep (320–430 px). CI `FEATURE_FLAGS` gains `gamification`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Devices                                                                          | Maestro flow `gamification.flow.yaml`: Today strip → Flame sheet → cook a recipe → receipt → achievements. iOS simulator end to end, and Android `Pixel_8` for layout (strip, receipt, recap, settings). Screenshots go in the PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Ladder                                                                           | typecheck, lint, format → `pnpm test` → API without a DB → `pnpm mobile:contract` → `bundle:check` + unchanged runtime fingerprint → Playwright mobile → devices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 11. Decisions for you (each with a recommendation)

| #   | Question                                                                                                                                                 | Recommendation                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Does the ledger (and `CookLog`) record for **everyone** from deploy, with the flag only gating what people see?                                          | **Yes.** It costs a few small writes per action. When the flag flips, nothing has to be back-dated for the dogfood weeks, and cooks get a history. The alternative leaves a gap that can't be filled, because cooks can't be back-dated. |
| D2  | XP, active days and levels are **never taken back** (unlog or delete keeps them).                                                                        | **Yes.** No "you lost" moments. Farming is bounded by idempotent keys, the 5-meal cap and the soft cap, and XP buys nothing.                                                                                                             |
| D3  | Can a pilot light cover a week with **zero** active days? The gym flex token needs at least 1 session.                                                   | **Yes, for the Flame only.** "Busy or sick week" is exactly the empty week. The gym streak keeps its rule.                                                                                                                               |
| D4  | Moving to P2: veg serving (no data), plate photo (+5), plan approval (no approval step exists), the tip jar, the full "achievement unlocked" sheet (07). | **Yes.** All of them are P2 ideas or need data we don't have.                                                                                                                                                                            |
| D5  | The weekly recap reaches people through a **Today banner (Sunday to Tuesday)**, not a new push notification.                                             | **Yes.** No server push exists, and a local Sunday notification would compete with the one-a-day reminder budget.                                                                                                                        |
| D6  | Gentle reminder **off by default**, turned on in Rewards & motivation.                                                                                   | **Yes.** Invitational, and it asks for no new notification permission at launch.                                                                                                                                                         |
| D7  | Mobile ships on the **revamp shell only**. The legacy shell (off in production) gets nothing.                                                            | **Yes.**                                                                                                                                                                                                                                 |
| D8  | The Flame pause and the training pause stay **independent**.                                                                                             | **Yes.** You can still cook during a training break. Both can be set.                                                                                                                                                                    |
| D9  | Low-intake support card copy (idea 59): we draft it in the PR for your review before the flag flips.                                                     | **Yes.** It points to the existing "talk to a professional" wording, with no numbers and no alarm.                                                                                                                                       |

## 12. Build plan (after approval)

Run as one orchestrator with up to 3 Sonnet lanes, following `docs/backlog-2026-10/00-operating-rules.md`:

- DB clone `chefer_gam`, ports `3260/3360/8160`, no API-level claim.
- Commit the contracts (`@chefer/types` DTOs, procedure names) first, so the lanes don't block on each other.

| Lane                     | Owns                                                                                                           | Depends on               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A: rules                 | `packages/types/src/progress/`, `packages/utils/src/progress/`, `settleWeeks` options                          | —                        |
| B: server                | Prisma models, repositories, `application/progress/`, the hooks, router, back-date, flag + env, contract tests | A's types                |
| C: mobile                | `apps/mobile/src/features/progress/`, the routes, the Today/You/cook/workout mount points                      | A + B's procedure shapes |
| D: web (after A, B or C) | dashboard, profile, preferences, cook mode, summary, `/achievements`, `/recap`                                 | A + B                    |

**Docs in the same PR:**

- `infrastructure.md`: §4 (routes), §5.2/§5.3 (`progress` modules), §6 (schema), §7 (`ProgressService`, recorder, back-date), §8 (procedures), §10 (env).
- `business_flow.md`: a new "Kitchen progress" flow.
- `GLOSSARY.md`: Chef XP, Chef rank, Active day, Active-day goal, Flame, Pilot light, Today's three, Kitchen receipt, Achievement/badge/tier, Weekly recap, Celebration level, Cook (finished).
- `docs/adr/0002-progress-ledger.md`: the append-only ledger, idempotency keys, records for everyone, XP never revoked.

The PR goes to master and is not merged.
