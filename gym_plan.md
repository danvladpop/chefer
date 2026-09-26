# Chefer Gym: weight training, progressive overload, consistency

> **Author:** 2026-09-24, orchestrator session. Companion research (read for the
> _why_; this file is the _how_):
>
> - [`docs/gym/programming-research.md`](./docs/gym/programming-research.md): the
>   progression algorithm spec with 17 worked examples, weekly set targets per muscle,
>   program templates, consistency research and a teardown of competing apps.
> - [`docs/gym/exercise-library-research.md`](./docs/gym/exercise-library-research.md):
>   the 54-exercise catalogue with cues, common mistakes, free-exercise-db ids and
>   verified YouTube clips.
>
> **Execution model:** one orchestrating session plus parallel subagents in isolated
> git worktrees (same mechanics as `premium_plan.md` §8, restated in §9). Task ids are
> `G<wave>-<n>`. Progress lives in §12 and is the source of truth.

---

## 0. Decision record (made with the product owner, do not relitigate)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                    | Consequence for the build                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **North star: consistency and progression, week over week and month over month.**                                                                                                                                                                                                                                                                                                                           | Every screen answers either "what do I do today" or "am I progressing". Nothing else goes on the workout screen.                                                                              |
| D2  | **Media is hybrid.** free-exercise-db start/end photos (public domain, work offline) everywhere, plus one hand-picked YouTube clip per exercise on the detail screen, starting at the relevant timestamp.                                                                                                                                                                                                   | Photos are self-hosted and cached on the device. YouTube needs a WebView plus a fallback that opens the YouTube app.                                                                          |
| D3  | **Navigation is a Food / Gym mode switch.** In Gym mode the tab bar becomes **Today / Routine / Exercises / Stats**.                                                                                                                                                                                                                                                                                        | A second expo-router tab group. The mode is persisted. On web the sidebar and bottom nav swap sets.                                                                                           |
| D4  | **Routines come from templates and are fully editable.** A setup of three or four questions recommends Full Body 2×/3×, Upper/Lower 4× or Push/Pull/Legs 6×. Building from scratch is also possible. No AI.                                                                                                                                                                                                 | Templates are static data. Selection and validation run in the pure engine.                                                                                                                   |
| D5  | **Everything is editable at three levels:** (a) the routine itself (days, exercises, sets, rep ranges, rest, order, planned weekdays); (b) **this week and today's session** (do a different day next, skip a day, swap, skip or add exercises and sets for this session only, or push a change into the routine); (c) **the engine's targets** (override next session's weight and reps for any exercise). | Sessions copy the routine day when started, so edits never leak into the routine unless the user chooses "Update routine". Overrides are stored alongside the progression state and replayed. |
| D6  | **Logging is offline-first on mobile.** A workout is never lost, whether the app is killed, the gym basement has no signal, or the phone reboots.                                                                                                                                                                                                                                                           | Local persistence for every tap, an outbox that syncs to an idempotent upsert, and a cached read model. This needs one native rebuild (§5.6).                                                 |
| D7  | **Mobile first.** Web, both the mobile-web and desktop layouts, is a **later wave (G5)**. The owner scoped this explicitly, which is the exception clause of the CLAUDE.md parity rule.                                                                                                                                                                                                                     | Each mobile wave adds "reverse: mobile → web" rows to `mobile_parity_backlog.md`, and G5 clears them. The API is built platform-neutral from day one.                                         |
| D8  | **Effort input is weight and reps on every set, plus an optional RIR chip (0 / 1 / 2 / 3+) on the last set of each exercise.**                                                                                                                                                                                                                                                                              | The engine must be correct when RIR is missing. RIR only adjusts the result (research §1.1).                                                                                                  |
| D9  | **Every gym feature is free.**                                                                                                                                                                                                                                                                                                                                                                              | A single `PLAN_FEATURES.gymTraining` key, free on both tiers with `upsell: false`. A later premium tier is a one-file edit. No paywall ever appears on the logging screen.                    |
| D10 | **Primary user: commercial gym with full equipment, no fixed split.** The setup recommends one.                                                                                                                                                                                                                                                                                                             | The default equipment answer is "Full gym". The dumbbells-only and bodyweight variants ship as swap lists but get less polish in v1.                                                          |
| D11 | **Link to nutrition in v1:** a "Today's workout" card on the food dashboard, and bodyweight comes from the existing `WeightEntry` log (used for bodyweight lifts, relative strength and the stats overlay). **Adjusting calories and protein on training days is deferred** (§10).                                                                                                                          | No change to meal-plan generation in this plan.                                                                                                                                               |
| D12 | **Progression is deterministic and explainable in one sentence.** Every suggestion carries a reason code, its inputs and an engine version.                                                                                                                                                                                                                                                                 | The engine is a pure function in `@chefer/utils`, shared by the API, mobile and web, and tested against the 17 worked examples.                                                               |

---

## 1. Product design

### 1.1 The core loop

```
 Setup (once, about 90 s)
   → recommended routine (editable)
     → TODAY: "Next up: Upper A · 6 exercises · ~55 min"
       → ACTIVE WORKOUT: targets prefilled, one tap per set, rest timer
         → FINISH: PRs, week ring 2/3, "next time: Bench ↑ 2.5 kg"
           → STATS (monthly recap, e1RM trend, streak)
             → back to TODAY
```

The loop is closed by the **finish screen**. It shows the progressive-overload decision
for next time right away ("Bench: you hit 12 on every set → 62.5 kg next time"), so
the user leaves every session knowing what "better" looks like next week.

### 1.2 Principles, drawn from the research

1. **As fast as Strong.** Logging a set that matches the target takes one tap. A set
   that deviates takes a stepper nudge. No keyboard for common edits.
2. **Every number explains itself.** The suggestion banner shows a reason sentence,
   and tapping "Why?" shows the inputs. Never change a weight without saying why.
3. **A rotation, not a calendar.** "Next workout" is the next day in the sequence.
   Missed days roll forward. Nothing is ever red or marked "failed".
4. **Weekly goal, not daily streak.** A week ring and a streak of weeks where the goal
   was met, with slack: flex weeks, pause, repair.
5. **Suggestions, never locks.** Deloads, resets and swaps are offered and dismissible.
   User overrides always win.
6. **The workout screen is sacred.** No upsells, tips, feeds or modals during a session.

### 1.3 Screens (mobile, Gym mode)

**Mode switch.** A `Food | Gym` segmented control sits in the header of every
tab-root screen in both modes. The first switch to Gym, when there is no GymProfile,
opens **Setup**. After that the app remembers the last mode used and opens in it.

**Setup** (a stack of 4 steps, then a preview):

1. How many days a week can you realistically train? `2 3 4 5 6` ("Pick what you can
   keep up on a busy week. Consistency beats ambition.")
2. Experience: _New or returning_ (under 6 months of consistent lifting) / _Experienced_.
3. Equipment: **Full gym** (default) / Dumbbells + bench / Bodyweight. Units: kg / lb,
   defaulting to the locale. The answer is a hard limit (audit F-GYM-2-1): a generated
   program only uses equipment in that access set (`EQUIPMENT_ACCESS_SETS`: Dumbbells =
   dumbbell + bodyweight moves, Bodyweight = bodyweight moves only, which may still need a
   pull-up bar or a sturdy table). Curated swaps (`EQUIPMENT_SWAPS`) cover every template
   slot; the engine replaces anything left over with the closest same-pattern alternative
   or drops the slot. Saved routines are never rewritten.
4. Which days, roughly, and when? A weekday picker plus an optional time, used for the
   week strip and reminders. Can be skipped.
5. **Preview:** the recommended template, with its days and exercises in cards, a
   "Why this program" line, a weekly balance mini-chart, and "Choose another program".
   Then **Starting weights:** "Help me find them" (the default for beginners: prefilled
   light guesses, then calibration) or "I know my weights" (a quick list with a weight
   input per exercise).
6. Done. Expectation copy: "The first 6–8 weeks build the habit. Missing a session
   changes nothing. Aim for your weekly goal." Then Today.

**Today tab**

- **Resume banner** (sticky) when a session is in progress locally.
- **Week strip** Mon–Sun: done sessions are filled dots, planned days are outlined,
  and missed days are neutral (plain, not red). Below it, a **week ring** ("2 of 3
  this week") and the **streak** ("7-week streak · 1 flex week saved").
- **Next up card:** the day name, exercise list with target sets×reps @ weight,
  estimated duration, and the **Start workout** primary button.
  - "Do another day instead": a picker of the routine's days. This is the week-level
    edit.
  - "Edit before starting": opens the session editor for this session only (swap,
    skip, add, reorder, change sets). Each change offers "just today" or "update
    routine".
  - "Skip this day": advances the rotation and never counts as a miss.
- **Contextual cards**, at most one at a time, in priority order: comeback ("Back at
  it. 70 kg bench today, you'll be at 80 again in about 4 sessions"), deload offer,
  stall suggestion, monthly recap (first open of a new month).
- **Last session** summary row, linking to its detail.
- **Freestyle workout** link: an empty session that picks exercises as it goes.

**Active workout** (full-screen stack route `gym/workout`, keep-awake on)

- Header: elapsed time, overall progress (sets done out of planned), **Finish**.
- One card per exercise, with the current exercise expanded and auto-scrolled:
  - Name, a thumbnail (tap opens a technique sheet with the cues and a video button),
    and a ⋯ menu: Swap (just today / update routine), Skip, Add set, Remove set,
    Move up/down, Note, Exercise history.
  - **Suggestion banner:** "↑ 2.5 kg: you hit 12 on every set last time", with **Why?**
  - **Warm-ups**, collapsed by default (the "3 warm-up sets" row expands).
  - **Set rows:** `# | Last time (muted) | [− weight +] | [− reps +] | ✓`. Values are
    prefilled from the engine's targets. ✓ is at least 44 pt, and a tap logs the
    prefilled values. Tapping a weight opens the **plate calculator** (barbell only)
    or a numeric keypad.
  - **RIR chips** appear inline after the last set is ticked: "How many more could
    you have done? 0 · 1 · 2 · 3+". They are optional, collapse once answered, and are
    highlighted with "Helps us find your weight" while calibrating.
  - **Live PR badge** on the set that beat a record, at most one per exercise.
- **Rest timer bar** (sticky at the bottom, starts automatically when a set is
  ticked): countdown, −15 / +15, Skip. Haptic and sound at zero, plus a local
  notification when the app is in the background.
- **Finish** → confirmation if sets remain unticked ("Finish anyway / Keep going") →
  **Summary screen**: duration, sets, PRs, week ring, streak update, a **"Next time"**
  list of engine decisions (per exercise: ↑ / = / ↓ with the reason), each with an
  **Adjust** stepper (the target-level edit), then **Done**.

**Routine tab**

- The active routine's name and weekly goal, and a list of **days** as cards (name,
  planned weekday, exercises with sets×reps, **next targets** per exercise).
- A **weekly balance** card: fractional sets per muscle against the productive band,
  with amber dots for rule hits (V1–V11 from research §2.3, dismissible).
- **Edit** opens the routine editor: rename; add, delete, duplicate or reorder days;
  set each day's planned weekday; add exercises (library picker with search and
  muscle filter); per exercise, sets / rep range / rest / target RIR and "Edit next
  targets"; swap exercise (suggests same-swap-group alternatives first); reorder. Save
  is explicit ("Save changes"), and editing needs a connection in v1 (§5.4).
- A routine switcher: **My routines** (create from a template, from scratch, or by
  duplicating; set active; archive), "Take a deload week", "Pause training" (vacation,
  illness, injury; 1–4 weeks).

**Exercises tab**

- Search, plus filter chips by muscle and equipment, and a "Mine" filter for custom
  exercises. Rows show a thumbnail, name, primary muscle and equipment.
- **Detail:** start/end photos as a looping crossfade (a cheap "animation" that works
  offline), **Watch technique** (YouTube at a timestamp in an inline player sheet,
  falling back to the YouTube app), **Focus on** (3–4 cues), **Avoid** (2 common
  mistakes), muscles worked, a "why it's in your program" blurb, and then **your
  history**: e1RM mini-chart, best sets / rep PR table, last 5 sessions, and a sticky
  personal note.
- **Create custom exercise:** name, equipment, primary and secondary muscles, load
  type, default rep range. No media; the user's own cues are optional.

**Stats tab** (5 views at most by default, the rest under "More")

1. **Strength trend:** e1RM line per lift for the user's top 3–5 compounds (picker),
   with PR dots, a rolling-max trend, ranges of 3 months / 1 year / all, and an
   optional bodyweight overlay and relative-strength toggle.
2. **Weekly sets per muscle:** bars over the last 8–12 weeks with the productive band
   shaded.
3. **Consistency:** a grid of weeks (goal met / flex / paused / under goal / empty)
   with the current and best streak.
4. **PR timeline:** filterable by exercise.
5. **Monthly recap:** sessions against goal, weeks met, PR count, the 3 biggest e1RM
   gains, sets per muscle against last month, and the bodyweight trend. A shareable
   image is G4.

**Food dashboard card** ("Today's workout"): the next day's name, or "Done ✓ · 3 PRs",
plus the week ring. Tapping it switches to Gym mode on Today.

### 1.4 Habit mechanics (research §4.2, adopted as written)

- **Weekly goal** = the routine's days per week, and it's editable. A week is _met_
  when sessions ≥ goal.
- **Streak** = consecutive met weeks. **Flex weeks:** earn 1 per 4 met weeks, hold at
  most 2. A week with at least one session but fewer than the goal auto-spends a flex
  week ("Flex week used. Streak safe.").
- **Pause** (1–4 weeks) freezes the streak, and progression applies re-entry rules
  after it.
- **Repair:** backfill a session into the current or previous week.
- **Comeback moment** after a miss: positive copy plus a line showing the way back.
- **Reminders:** one local notification at the planned day and time, and one gentle
  nudge the day after a missed planned session. Never more than one a day, and no
  guilt copy. Opt-in during setup and editable in the gym settings.
- **PRs:** weight / rep / e1RM, at most one badge per exercise per session, all listed
  on the summary.
- **Anti-patterns banned:** daily streaks, red "missed" markers, loss-framed copy,
  leaderboards, forced deloads, paywalled logging.

### 1.5 Success metrics (PostHog events in §6.6)

| Metric                                                 | Target (first-user sanity, not a launch KPI) |
| ------------------------------------------------------ | -------------------------------------------- |
| Weeks with the goal met, over the first 8 weeks        | ≥ 70 %                                       |
| Median time to log one set (tap ✓ → next row focused)  | < 3 s                                        |
| Engine suggestions accepted without edit               | ≥ 70 % (lower means the engine is mistuned)  |
| Lost workouts (started and never reached the server)   | **0**                                        |
| Sessions synced within 5 min of regaining connectivity | ≥ 99 %                                       |
| e1RM trend over 12 weeks on the top 3 lifts            | upward for a consistent user                 |

---

## 2. Domain model

### 2.1 Concepts

- **Exercise:** a library entry, curated (seeded, shared by everyone) or custom
  (owned by one user).
- **Routine → RoutineDay → RoutineExercise:** the editable template. One routine is
  active per user. A RoutineExercise is a _slot_ with sets, rep range, target RIR and
  rest.
- **WorkoutSession → SessionExercise → SessionSet:** what actually happened. A session
  **snapshots** its routine day when started, so later routine edits never rewrite
  history, and in-session edits never touch the routine unless the user asks.
- **ProgressionState** per (user, exercise, rep-range bucket): the engine's memory
  (working weight, rep targets, miss and stall counters, calibration, pre-break
  weight, and a pending **user override**). It is a **derived cache**: always
  recomputable by folding the engine over that exercise's completed sessions in date
  order, plus overrides. This one design choice is what makes offline sync, editing
  past sessions, deleting sessions and multi-device use consistent without merge
  logic.
- **GymProfile:** setup answers, units, equipment inventory (bar, plates, dumbbells,
  machine and cable steps, dip belt, micro plates), weekly goal, reminder schedule,
  flex-week balance.
- **TrainingPause:** date ranges that freeze the streak.

### 2.2 Prisma schema (all additive; lands in G0-2)

Storage conventions: weights are stored in **kg as Float rounded to 0.01** and
rendered in the user's unit. Ids for anything a phone creates offline are **UUIDs
generated on the client** (`@id` without a default). Everything else uses `cuid()`.
Dates the user thinks in are stored as `localDate String` ("YYYY-MM-DD", the
device's local date, matching the tracker's convention) next to a UTC `DateTime`.

```prisma
enum ExerciseEquipment { BARBELL DUMBBELL CABLE MACHINE BODYWEIGHT SMITH EZ_BAR KETTLEBELL BAND ASSISTED }
enum ExerciseLoadType  { WEIGHTED BODYWEIGHT BODYWEIGHT_PLUS ASSISTED }
enum ExerciseCategory  { COMPOUND ISOLATION }
enum TrainingExperience { BEGINNER INTERMEDIATE }
enum GymEquipmentAccess { FULL_GYM DUMBBELLS BODYWEIGHT }
enum WeightUnit { KG LB }
enum WorkoutStatus { IN_PROGRESS COMPLETED DISCARDED }

model Exercise {
  id               String   @id            // curated: stable slug ("barbell-bench-press"); custom: cuid
  ownerId          String?                  // null = curated
  name             String
  aliases          String[]
  category         ExerciseCategory
  movementPattern  String                   // horizontal-push, vertical-pull, squat, hinge, lunge, …
  equipment        ExerciseEquipment
  loadType         ExerciseLoadType
  primaryMuscles   String[]                 // normalized vocab (chest, lats, quads, …)
  secondaryMuscles String[]
  repMin           Int
  repMax           Int
  restSec          Int
  incrementKg      Float
  perHand          Boolean  @default(false)
  isLowerBody      Boolean  @default(false)
  swapGroup        String?                  // e.g. "horizontal-row"
  cues             String[]
  mistakes         String[]
  blurb            String?
  imageKeys        String[]                 // self-hosted photo paths (§5.5)
  videoId          String?
  videoStartSec    Int?
  videoChannel     String?
  contentVersion   Int      @default(1)
  archivedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  owner            User?    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  @@index([ownerId])
  @@map("exercises")
}

model GymProfile {
  userId          String   @id
  experience      TrainingExperience
  equipmentAccess GymEquipmentAccess @default(FULL_GYM)
  unit            WeightUnit @default(KG)
  weeklyGoal      Int                           // 1–7
  barWeightKg     Float    @default(20)
  platePairsKg    Float[]                       // defaults per unit (research §1.2)
  dumbbellsKg     Float[]
  machineStepKg   Float    @default(5)
  cableStepKg     Float    @default(2.5)
  hasDipBelt      Boolean  @default(false)
  microPlates     Boolean  @default(false)
  reminderEnabled Boolean  @default(false)
  reminderTime    String?                       // "18:30" local
  flexTokens      Int      @default(0)
  setupCompletedAt DateTime?
  updatedAt       DateTime @updatedAt
  user            User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("gym_profiles")
}

model Routine {
  id          String   @id @default(cuid())
  userId      String
  name        String
  templateKey String?                           // "fb3-beginner", null = scratch
  isActive    Boolean  @default(false)
  nextDayId   String?                           // rotation pointer
  version     Int      @default(1)              // optimistic concurrency for document saves
  archivedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  days        RoutineDay[]
  @@index([userId, isActive])
  @@map("routines")
}

model RoutineDay {
  id              String  @id @default(cuid())
  routineId       String
  position        Int
  name            String                        // "Upper A"
  plannedWeekday  Int?                          // 0=Mon … 6=Sun, optional
  exercises       RoutineExercise[]
  routine         Routine @relation(fields: [routineId], references: [id], onDelete: Cascade)
  @@map("routine_days")
}

model RoutineExercise {
  id            String  @id @default(cuid())
  dayId         String
  exerciseId    String
  position      Int
  sets          Int
  repMin        Int
  repMax        Int
  targetRir     Int     @default(2)
  restSec       Int
  supersetGroup String?                         // G4
  notes         String?
  day           RoutineDay @relation(fields: [dayId], references: [id], onDelete: Cascade)
  exercise      Exercise   @relation(fields: [exerciseId], references: [id])
  @@map("routine_exercises")
}

model WorkoutSession {
  id              String   @id                  // client UUID
  userId          String
  routineId       String?
  routineDayId    String?
  name            String
  status          WorkoutStatus
  startedAt       DateTime
  finishedAt      DateTime?
  localDate       String                        // "YYYY-MM-DD" of startedAt on device
  isDeload        Boolean  @default(false)
  notes           String?
  clientUpdatedAt DateTime                      // last-write-wins guard
  engineVersion   Int
  exercises       SessionExercise[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([userId, localDate])
  @@index([userId, status])
  @@map("workout_sessions")
}

model SessionExercise {
  id                String  @id               // client UUID
  sessionId         String
  exerciseId        String
  routineExerciseId String?
  position          Int
  repMin            Int                        // snapshot of the slot at start
  repMax            Int
  targetRir         Int
  restSec           Int
  skipped           Boolean @default(false)
  swappedFromId     String?
  lastSetRir        Int?                       // 0..3 (3 = "3+")
  prescription      Json                       // { weightKg, reps[], reasonCode, inputs, engineVersion }
  notes             String?
  sets              SessionSet[]
  session           WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  exercise          Exercise       @relation(fields: [exerciseId], references: [id])
  @@index([exerciseId])
  @@map("session_exercises")
}

model SessionSet {
  id                String   @id              // client UUID
  sessionExerciseId String
  position          Int
  weightKg          Float                      // external load; ASSISTED = assistance
  reps              Int
  isWarmup          Boolean  @default(false)
  completedAt       DateTime?                  // null = planned, not ticked
  sessionExercise   SessionExercise @relation(fields: [sessionExerciseId], references: [id], onDelete: Cascade)
  @@map("session_sets")
}

model ExerciseProgression {
  userId        String
  exerciseId    String
  repBucket     String                        // "6-8", "8-12" … (research §1.2)
  state         Json                          // ProgressionState
  override      Json?                         // user-edited next targets
  overrideAt    DateTime?
  engineVersion Int
  updatedAt     DateTime @updatedAt
  @@id([userId, exerciseId, repBucket])
  @@map("exercise_progressions")
}

model TrainingPause {
  id        String   @id @default(cuid())
  userId    String
  startDate String                              // localDate
  endDate   String
  reason    String?                             // vacation | illness | injury | other
  createdAt DateTime @default(now())
  @@index([userId])
  @@map("training_pauses")
}
```

A `User` gets back-relations only. There is no `WeightEntry` change: bodyweight is read
through `weightEntryRepository.findLatest` and a new `findInRange`. Deploys apply the
schema through the compose `migrate` service (`prisma db push`), so no migration files
are needed.

### 2.3 Shared contracts (`@chefer/types/src/gym/`, lands in G0-3)

`@chefer/types` gains a `zod` dependency. This is the first Zod in the package, and it
fulfils CLAUDE.md's shared-first rule. Contents:

- `vocab.ts`: the muscle vocabulary, equipment and load-type string unions, plus the
  `MUSCLE_LABELS` display map.
- `exercise-catalog.ts`: **the curated library as data** (54 entries plus aliases,
  built from the research file). The API seeds from it. Tests assert every entry's
  invariants.
- `templates.ts`: the 4 programs × beginner/intermediate variants from research §3, as
  data referencing exercise slugs.
- `schemas.ts`: Zod schemas for every gym tRPC input, including the offline
  **`workoutSessionDocSchema`** (the full session document the phone uploads).
- `dto.ts`: output types (`GymBootstrap`, `NextWorkout`, `Suggestion`, `WeekSummary`,
  `StatsSeries`, and so on).

---

## 3. The engine (`@chefer/utils/src/gym/`, pure, shared, lands in G1-A)

This implements research §1 as written. Modules:

| Module               | Exports                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loads.ts`           | `achievableLoads(equipment, profile, stepOverride?)`, `stepUp`, `stepDown`, `roundDown`, `roundNearestUp`, `capIncrease`, `platesPerSide(weight, profile)` (plate calculator), kg↔lb display helpers                                                                                                     |
| `progression.ts`     | `ENGINE_VERSION`, `initialState(slot, profile, experience, knownWeight?)`, `nextPrescription(slot, state, exposure, profile, now)`, `applyExposure(state, exposure) → state'`, `foldHistory(slot, exposures[], overrides[], profile, now) → { state, suggestion }`                                       |
| `reasons.ts`         | the `ReasonCode` union, `explain(suggestion, unit) → string` (the one-sentence templates), `explainInputs()` for the "Why?" sheet                                                                                                                                                                        |
| `warmups.ts`         | `warmupSets(slot, W, isFirstForPattern, profile)`                                                                                                                                                                                                                                                        |
| `e1rm.ts`            | `epley(weight, reps, rir?)`, `bestSessionE1rm(sets)`, and the validity rules (≤ 10 reps; 11–12 low confidence; > 12 excluded)                                                                                                                                                                            |
| `prs.ts`             | `detectPrs(history, set) → Pr[]` (weight, rep-at-weight and e1RM PRs, ranked; one badge per exercise)                                                                                                                                                                                                    |
| `volume.ts`          | `fractionalSets(routine)` per muscle per week and per session, `MUSCLE_LANDMARKS` (research §2.2), and `validateRoutine(routine, experience) → Hint[]` (rules V1–V11)                                                                                                                                    |
| `templates.ts`       | `recommendTemplate({ days, experience, equipment })` (research §3.5), `instantiateTemplate(key, equipment)` (applies the equipment swaps, then enforces the access set via `resolveSlotExercise` / `closestAccessibleAlternative`), `estimateDurationMin(day)`                                           |
| `weeks.ts`           | Monday-based `weekKey(localDate)`, `summarizeWeeks(sessions, goalHistory, pauses) → WeekSummary[]` (met / flex / paused / under / empty, flex-token accrual and spend), `currentStreak`                                                                                                                  |
| `deload.ts`          | the reactive and proactive triggers, `deloadPrescription(slot, state)`                                                                                                                                                                                                                                   |
| `reentry.ts`         | break-gap rules (research §1.8, including the age ≥ 65 column when the nutrition profile knows the user's age)                                                                                                                                                                                           |
| `workout-reducer.ts` | **the pure active-workout state machine**, shared by mobile and web: `startSession(day, states, profile) → SessionDoc`, and actions `completeSet`, `editSet`, `uncompleteSet`, `setRir`, `addSet`, `removeSet`, `swapExercise`, `skipExercise`, `addExercise`, `reorder`, `setNote`, `finish`, `discard` |

**Tests** (Vitest, in `packages/utils`): the 17 worked examples, one test each; the
property tests from research appendix A (suggested weights are always achievable; a
normal increase is at most max(step, 10 %); deloads never mutate state; a null-RIR
result is never above the RIR-aware result; `foldHistory` doesn't depend on the order
of ingestion once sessions are sorted); template set-count tables that match research
§3 exactly; week and streak edge cases (goal change mid-streak, pause spanning weeks,
flex spend and accrual, week boundaries across daylight-saving changes). Add
`fast-check` as a devDependency for the property tests.

**Versioning:** a change that alters any output bumps `ENGINE_VERSION`. Stored
suggestions keep their version so old explanations stay truthful. Recomputing uses
the current version.

---

## 4. API (`apps/api`)

### 4.1 Layers

`routers/gym.router.ts` merges these thin sub-routers:
`gym.library / gym.profile / gym.routine / gym.session / gym.progression / gym.stats / gym.bootstrap`.

Services live in `application/gym/`, as classes with repositories injected through
the constructor (the `FeedbackService` pattern):

- **`ExerciseLibraryService`:** list curated plus the caller's custom exercises, with
  a delta (`updatedSince`); custom create, update and archive (checking ownership).
- **`GymProfileService`:** get and save the profile. `completeSetup(answers,
knownWeights?)` creates the profile, instantiates the template into an active
  routine, and seeds `ExerciseProgression` initial states. All in one transaction.
- **`RoutineService`:** list and get; `createFromTemplate`; `createBlank`;
  `saveDocument(routineDoc, expectedVersion)` does a full replace in one transaction
  and returns a CONFLICT with the current doc when the version is stale;
  `setActive`, `duplicate`, `archive`; `setNextDay` (for "do another day instead" and
  "skip").
- **`WorkoutSessionService`:**
  - **`upsertMany(docs[])`** is the sync endpoint and is idempotent. Per doc: check
    ownership (the session id belongs to the caller or is new); compare
    `clientUpdatedAt` (drop older writes and return the stored version); replace the
    children in a transaction; if status is COMPLETED, advance the rotation pointer
    (once per session, tracked by a `rotationAppliedAt` flag in the service logic),
    then recompute progression for the touched exercises. Returns per-doc
    `{ id, status: 'applied' | 'stale' | 'rejected', reason?, nextSuggestions }`.
  - Also `discard`, `delete` (completed sessions can be deleted, which triggers a
    recompute), `get`, and `list` (cursor pagination by `startedAt`).
- **`ProgressionService`:** `recompute(userId, exerciseIds)` loads each exercise's
  completed exposures, runs `foldHistory`, and writes `ExerciseProgression`. Also
  `setOverride` and `clearOverride`, `offerDeload` and `startDeload` and
  `dismissDeload`, and `forExercises`.
- **`GymStatsService`:** e1RM series, rep-PR table, fractional weekly sets per muscle,
  week summaries and streak, PR timeline, monthly recap, bodyweight series joined from
  `WeightEntry`. Everything is computed from sessions with the pure engine, and
  results are cached per request.
- **`GymBootstrapService`:** **one query for offline-first mobile.** It returns
  `{ profile, activeRoutine, nextWorkout (day + prescriptions + warm-ups), library
(delta), progressions, recentSessions (last 12 weeks, compact), weekSummaries (last
12), streak, pendingOffers (deload/stall/comeback/recap), serverTime,
engineVersion }`. This is the query mobile persists.

Repositories go in `packages/database/src/repositories/`: `exercise`, `gym-profile`,
`routine`, `workout-session`, `exercise-progression`, `training-pause`, each with an
`I*Repository` interface and a singleton, following the existing pattern. They're
re-exported from both `repositories/index.ts` and `src/index.ts`.

**Curated library seeding:** `lib/exercise-library/ensure.ts` exposes
`ensureExerciseLibrary()`, run once per process (mirroring `ensureCuratedRecipes`).
It upserts from `@chefer/types` `EXERCISE_CATALOG` by slug and bumps `contentVersion`
when content changes. It runs at boot in production, where the seed never runs.

### 4.2 Procedure map (all `protectedProcedure`; `gymTraining` is free, so no gate)

| Procedure                                                                                                                                                    | Kind     | Notes                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `gym.bootstrap({ librarySince? })`                                                                                                                           | query    | Offline read model (above).                                                                    |
| `gym.library.list({ updatedSince? })` / `get({ id })`                                                                                                        | query    |                                                                                                |
| `gym.library.createCustom` / `updateCustom` / `archiveCustom`                                                                                                | mutation | Owner-only.                                                                                    |
| `gym.profile.get` / `save`                                                                                                                                   | q/m      | Units, equipment inventory, goal, reminders.                                                   |
| `gym.profile.recommend({ days, experience, equipment })`                                                                                                     | query    | Returns the template key, the instantiated preview and the balance hints (pure engine; no DB). |
| `gym.profile.completeSetup({ answers, templateKey, knownWeights? })`                                                                                         | mutation | Transactional.                                                                                 |
| `gym.routine.list` / `get({ id })`                                                                                                                           | query    |                                                                                                |
| `gym.routine.createFromTemplate` / `createBlank` / `duplicate` / `archive` / `setActive`                                                                     | mutation |                                                                                                |
| `gym.routine.save({ routine, expectedVersion })`                                                                                                             | mutation | Document replace. CONFLICT → the client shows the diff and offers "keep mine / take theirs".   |
| `gym.routine.setNextDay({ routineId, dayId })`                                                                                                               | mutation | Week-level edit: "do another day instead" and "skip".                                          |
| `gym.session.upsertMany({ docs })`                                                                                                                           | mutation | **Idempotent sync**, max 20 docs per call.                                                     |
| `gym.session.get` / `list({ cursor })` / `discard` / `delete`                                                                                                | q/m      |                                                                                                |
| `gym.progression.forExercises({ ids })` / `setOverride` / `clearOverride`                                                                                    | q/m      | Target-level edit.                                                                             |
| `gym.progression.startDeload` / `dismissOffer({ kind })`                                                                                                     | mutation |                                                                                                |
| `gym.stats.e1rm({ exerciseId, range })` / `repPrs` / `muscleVolume({ weeks })` / `consistency` / `prs` / `monthlyRecap({ month })` / `bodyweight({ range })` | query    |                                                                                                |
| `gym.pause.create` / `end`                                                                                                                                   | mutation | Streak freeze.                                                                                 |
| `gym.export.csv`                                                                                                                                             | query    | G4. Full history.                                                                              |

**Compatibility rules:** everything is additive, and later changes add optional fields
only, because the phones run OTA-updated but fingerprint-pinned binaries. The session
doc schema carries `schemaVersion: 1` so a future breaking shape can be negotiated.

### 4.3 Security and integrity

Every repository query is scoped by `userId`. Custom exercises and sessions check
ownership. The upsert rejects foreign ids with "rejected" and returns no data. Upserts
are bounded: at most 20 docs per call, 30 exercises and 20 sets per exercise, plus a
sanity cap on weight (0–1000 kg) and reps (0–200). The rate limiter uses the existing
per-user bucket.

---

## 5. Mobile architecture (`apps/mobile`)

### 5.1 Navigation (the D3 mode switch)

- Rename `app/(tabs)` to `app/(food)`. URLs don't change, because groups don't add
  path segments, but the E2E flows and docs need updating.
- Add `app/(gym)/_layout.tsx` with its own `Tabs`: `today.tsx`, `routine.tsx`,
  `exercises.tsx`, `stats.tsx`. They can't be `index.tsx`, because both groups resolve
  at the root.
- Stack routes under `app/gym/`: `setup.tsx`, `workout.tsx` (active workout,
  full-screen, gestures disabled while active), `summary/[id].tsx`, `session/[id].tsx`,
  `routine-editor.tsx`, `routines.tsx`, `exercise/[id].tsx`, `exercise-form.tsx`,
  `settings.tsx` (units, equipment inventory, reminders, pause).
- `src/features/gym/mode-store.ts`: the persisted `'food' | 'gym'` mode, shaped like
  `auth-store` (cache plus subscribe) on the new KV store. The root layout picks the
  initial group from it. `<ModeSwitch/>` (ui-mobile `SegmentedControl`) calls
  `router.replace('/today')` or `router.replace('/')`.
- The food dashboard gets the `TodaysWorkoutCard`, which reads the persisted
  `gym.bootstrap` so it works offline.

### 5.2 Offline layer (G1-C, the riskiest piece, owned by one agent)

```
            ┌─────────────── device ────────────────┐
 tap ✓ ───► │ workoutReducer (pure, @chefer/utils)   │
            │   │                                    │
            │   ▼ setItemSync on every action        │
            │ KV: gym.active-session  (crash-safe)   │
            │   │ on Finish                          │
            │   ▼                                    │
            │ KV: gym.outbox [ {doc, attempts} ]  ───┼──► gym.session.upsertMany
            │   ▲ flush: online / foreground / 30 s  │        (idempotent)
            │   │                                    │            │
            │ TanStack cache (persisted, gym keys) ◄─┼── gym.bootstrap (refetch after ack)
            │   ▲ optimistic local fold after Finish │
            └───┴────────────────────────────────────┘
```

- **Storage:** `expo-sqlite` and its `kv-store` (a synchronous `setItemSync` API).
  - `gym.active-session` holds the in-progress `SessionDoc`, written synchronously on
    every reducer action (a document is about 10 KB). App start checks it and shows
    **Resume**.
  - `gym.outbox` holds finished (or discarded) docs waiting to be sent. An entry is
    removed **only on a server `applied` or `stale` ack**. On `rejected` (validation),
    the entry is parked as "needs attention" and shown in gym settings with a
    "Copy / Retry / Discard" choice. **User data is never dropped silently.**
  - A best-effort in-progress checkpoint: while online, debounce-upload the active doc
    as IN_PROGRESS every 60 s, so a phone that dies mid-session still leaves a
    server copy.
- **Connectivity:** `@react-native-community/netinfo` feeds TanStack `onlineManager`,
  and `AppState` feeds `focusManager`. The flusher runs on regaining connectivity, on
  foreground, after each enqueue, and every 30 s while the outbox is non-empty, with
  exponential backoff capped at 5 min.
- **Read model:** `@tanstack/react-query-persist-client` with an async-storage
  persister backed by the KV store. `shouldDehydrateQuery` persists only `gym.*`
  queries. `maxAge` is 30 days. `buster` is `ENGINE_VERSION + ':' + schemaVersion`.
  Gym queries use `networkMode: 'offlineFirst'`.
- **Optimistic next workout:** on Finish, the client runs `foldHistory` on the cached
  progressions plus the finished doc, advances the cached rotation pointer and writes
  the result into the persisted `gym.bootstrap` with `setQueryData`. Today shows the
  correct "next up" and the summary shows correct "next time" decisions while
  offline. After the server acks, bootstrap is invalidated, and the server's fold is
  the same deterministic function, so nothing visibly changes.
- **What needs a connection in v1:** the first bootstrap after install, setup, routine
  editing, custom exercise creation, and stats beyond the cached last 12 weeks.
  Offline UI states say this explicitly ("Editing routines needs a connection.
  Logging works offline.").
- **Ids:** `expo-crypto` `randomUUID()` for sessions, session exercises and sets.
- **Clock:** `localDate` comes from the device, `startedAt`/`finishedAt` are ISO UTC,
  and the server never re-buckets by its own timezone.

### 5.3 Active workout implementation notes

- `useActiveWorkout()` wraps the shared reducer, the KV persistence and the
  rest-timer state. The rest timer stores `endsAt` (an absolute timestamp) so it
  survives the app being backgrounded or killed. A local notification is scheduled
  at `endsAt` when the app goes to the background and cancelled when it returns.
- Performance: flat exercise cards, memoised set rows, no re-rendering the whole list
  on every tick (the timer lives in its own component and store).
- `expo-keep-awake` (already installed) is on while a session is active.
  `expo-haptics` fires on ✓, on timer zero and on a PR.
- Accessibility: every control is at least 44 pt, the ✓ is 56 pt, steppers can be
  long-pressed to repeat, and there are `testID`s on every actionable element for
  Maestro.

### 5.4 Routine editing

Edits happen on a local draft, and **Save** calls `gym.routine.save(doc,
expectedVersion)`. A conflict opens a sheet: "This routine changed on another device.
Keep mine / Use the other version". Leaving with unsaved edits asks for confirmation.
In v1 editing requires a connection; queuing routine edits offline is G4 or later.

### 5.5 Media

- **Photos:** a script in G0-4 downloads the start/end JPGs for the matched
  free-exercise-db ids (public domain), converts them to WebP at about 600 px, and
  commits them under `apps/api/static/exercises/<slug>-{0,1}.webp`. Caddy already
  routes `/uploads/*` to the API; this adds `/static/exercises/*` the same way.
  Mobile renders them with **`expo-image`**, which caches to disk, so photos work
  offline after the first view. G2 adds a background **prefetch** of every image in
  the active routine after bootstrap.
- **Video:** `react-native-webview` plays the YouTube iframe inside a sheet
  (`https://www.youtube-nocookie.com/embed/<id>?start=<s>&playsinline=1`). The WebView
  sets `baseUrl`/`origin` to `https://chefer.duckdns.org`, because **YouTube refuses
  embeds that don't send a referrer** (error 153). **Fallback:** an "Open in
  YouTube" button (`Linking.openURL('https://youtu.be/<id>?t=<s>')`) shows when the
  embed fails or the phone is offline.
- **Link rot:** `scripts/check-exercise-videos.ts` checks every `videoId` against
  oEmbed. It runs weekly as a CI cron job and opens an issue if any video has
  disappeared.

### 5.6 Native module batch (**one rebuild, done in G0-5**)

Add these in one go so every later wave is pure JS and OTA-deliverable:
`expo-sqlite`, `@react-native-community/netinfo`, `expo-crypto`, `expo-image`,
`react-native-svg`, `react-native-webview`, `expo-notifications`, `expo-haptics`.
They must be **direct** dependencies of `apps/mobile` (pnpm strictness, gotcha #9),
with plugins registered in `app.config.js`. Then `ensure-variant` prebuild, a dev
client rebuild for both platforms, and `pnpm mobile:release:ios|android` for the
owner's phones. The runtime fingerprint changes, so **old production binaries stop
receiving OTA updates until they're reinstalled**, which is expected. Add the
`@tanstack/*-persist*` JS packages at the same time; they're pure JS.

### 5.7 UI kit additions (`packages/ui-mobile`, G1-C)

`SegmentedControl`, `Stepper` (with long-press repeat), `Chip`/`ChipGroup`, `Sheet`
(a Modal-based bottom sheet with a consistent header and close), `ProgressRing`,
`Badge`, `EmptyState`, and **charts** on `react-native-svg`: `LineChart` (points, a
trend line, dots, an optional second axis for the bodyweight overlay), `BarChart`
(stacked, with a shaded band), `WeekGrid` (consistency). They're small and in-house,
because a chart library such as victory-native would pull in Skia and is overkill.
Each gets RNTL tests.

---

## 6. Cross-cutting

### 6.1 Units

`GymProfile.unit` is **free** and separate from the premium-only
`ChefProfile.preferredUnits`. Weights are stored in kg. Display and rounding go
through `formatLoad(kg, unit)` in `@chefer/utils`. A pound user's plate list is native
pounds (45/35/25/10/5/2.5), not converted kilogram plates.

### 6.2 Bodyweight

`BODYWEIGHT_PLUS` exercises use the latest `WeightEntry` on or before the session date
for relative strength and bodyweight-inclusive e1RM, which is shown as "BW + 10 kg".
If no bodyweight has been logged, the stats show a one-tap "Log your weight" that uses
the existing `tracker.logWeight`.

### 6.3 Dashboard integration

The mobile food dashboard gets `TodaysWorkoutCard` after `WeightCard`. It reads the
persisted bootstrap, with no change to `dashboard.summary`. The web version comes in
G5.

### 6.4 Entitlements

Add `PLAN_FEATURES.gymTraining = { free: true, premium: true, label: 'Gym training &
progression', description: '…', upsell: false }`. The web comparison table picks it
up automatically.

### 6.5 Reminders (G4)

Local `expo-notifications` only, with no push server. They're rescheduled whenever the
profile, the routine's planned weekdays or the last session change. The next 14 days
are scheduled at most. The "missed yesterday" nudge is computed on app open and
scheduled for the next planned time. Permission is requested in the setup step "Want a
reminder?", never on cold start.

### 6.6 Analytics (PostHog, existing helper)

`gym_mode_switched`, `gym_setup_completed {template, days, experience, knownWeights}`,
`workout_started {source: next|picked|freestyle}`, `workout_finished {durationMin,
sets, prs, offline, edited}`, `suggestion_overridden {reasonCode, direction}`,
`routine_edited {kind}`, `pr_achieved {kind}`, `week_goal_met {streak}`,
`flex_week_used`, `training_paused`, `sync_failed {reason}` (also sent to Sentry),
`video_opened {fallback}`.

### 6.7 Docs updated in the same wave that lands each piece (CLAUDE.md table)

| Doc                         | Section / change                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `infrastructure.md` §1/§5   | `@chefer/types` gains Zod and gym data; `@chefer/utils` gains the gym engine; `ui-mobile` primitives             |
| `infrastructure.md` §4.3    | mobile route table: the `(food)`/`(gym)` groups and the `gym/*` stack routes; the offline layer                  |
| `infrastructure.md` §6      | the 9 models and 7 enums                                                                                         |
| `infrastructure.md` §7      | the 7 gym services, repositories and `ensureExerciseLibrary`                                                     |
| `infrastructure.md` §8      | the gym procedure map                                                                                            |
| `infrastructure.md` §11/§12 | the native batch rebuild note; the `/static/exercises` Caddy route; the video link-check cron                    |
| `business_flow.md`          | new **§21 Gym**: setup, the daily loop, offline sync, progression rules summary, habit mechanics, editing levels |
| `mobile_parity_backlog.md`  | "reverse: mobile → web" rows per mobile wave                                                                     |
| `mobile_native_plan.md`     | M3-5 "Offline & resilience baseline" gets a pointer to the gym offline layer as its first implementation         |

---

## 7. Work breakdown

Tags: **[CRITICAL]** is on the critical path, **[PARALLEL]** can fan out, **[USER]**
needs the owner. Each task names its **owner model** (§9.3).

### Dependency graph

```
G0 foundations (serial) ──► G1-A engine ─────────┐
                        ├─► G1-B API ─────────────┼─► G2 screens (4 parallel) ─► G3 dogfood ─► G4 habit+polish ─► G5 web (3 parallel) ─► G6 later
                        ├─► G1-C mobile infra ────┘            ▲
                        └─► G1-D content ──────────────────────┘
```

### Wave 0: Foundations [CRITICAL] (serial, orchestrator, about 1 day)

| ID   | Task                                                                                                                                                                                                                                                                                                  | Acceptance                                                                                    | Model  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| G0-1 | Create the `integrate/gym` branch from master once PR danvladpop/chefer#3 is merged (otherwise from `feat/mobile-ota-prod-builds`). Commit this plan and the research. Add the parity-backlog header row.                                                                                             | Branch exists; docs are committed.                                                            | Opus   |
| G0-2 | The Prisma models and enums from §2.2, `db push` to dev, and repository **interfaces with stub classes** (signatures only), exported.                                                                                                                                                                 | `pnpm db:generate` and typecheck are green, and dev DB tables exist.                          | Opus   |
| G0-3 | `@chefer/types/gym`: vocab, Zod schemas, DTOs, **the engine's public function signatures as types**, templates data, and `PLAN_FEATURES.gymTraining`.                                                                                                                                                 | Typecheck is green across the repo. Schemas round-trip a sample session doc in a unit test.   | Opus   |
| G0-4 | Import the exercise catalogue: convert `docs/gym/exercise-library-research.md` into `EXERCISE_CATALOG` data, plus a photo vendoring script (download, convert to WebP, commit) and invariant tests (unique slugs, known muscles, repMin < repMax, cues ≤ 12 words, each has ≥ 1 photo or is flagged). | 54 entries; the tests pass; photos are served locally at `/static/exercises/…`.               | Sonnet |
| G0-5 | The native batch from §5.6: dependencies, plugins, prebuild, **dev client rebuild on iOS and Android**, `bundle:check`, and the existing Maestro suite is still 7/7.                                                                                                                                  | Both dev clients boot, the suite is green, and the new fingerprint is recorded.               | Opus   |
| G0-6 | The `gym` router skeleton: every procedure in §4.2 is registered with real Zod inputs and returns `NOT_IMPLEMENTED`. Mobile contract-test scaffolding (`tests/contract/gym.test.ts`, marked todo).                                                                                                    | `AppRouter` exposes the full gym surface, so every G1 and G2 agent codes against final types. | Opus   |

Wave 0 is complete when every G1 agent can work without touching `schema.prisma`,
`@chefer/types/gym`, `routers/index.ts`, `app.config.js` or `package.json` dependency
lists. **Those files freeze here.**

### Wave 1: Core, 4 agents in parallel [PARALLEL] (about 1½ days plus ½ day integration)

| ID                    | Scope (file ownership)                                                                                                                                                                                                                                                            | Acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Model                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **G1-A engine**       | `packages/utils/src/gym/**` (all of §3, including the `workout-reducer`)                                                                                                                                                                                                          | All 17 worked examples pass as named tests; property tests pass; the template set counts match research §3; streak and week edge cases pass; 100 % branch coverage on `progression.ts`. The `explain()` copy matches research §1.11 wording.                                                                                                                                                                                                                            | **Opus**                                                |
| **G1-B API**          | `packages/database/src/repositories/{exercise,gym-profile,routine,workout-session,exercise-progression,training-pause}.repository.ts`, `apps/api/src/application/gym/**`, `apps/api/src/routers/gym/**`, `apps/api/src/lib/exercise-library/**`                                   | Service unit tests with mocked repositories (upsert idempotency: the same doc twice gives one row; a stale `clientUpdatedAt` is ignored; foreign id is rejected; the rotation pointer advances exactly once; delete triggers a recompute); **contract tests** against the live dev API: setup → bootstrap → upsert → bootstrap shows the next prescriptions. Until G1-A merges, B uses the engine **through the G0-3 signatures**, with a local fake for its own tests. | Sonnet (Opus for `ProgressionService` and `upsertMany`) |
| **G1-C mobile infra** | `apps/mobile/app/(food)` rename; `app/(gym)/_layout.tsx` with **placeholder** screens; the `app/gym/*` placeholders registered in the root Stack; `src/features/gym/{mode-store,offline/*,use-active-workout,use-gym-bootstrap}.ts`; the `packages/ui-mobile` additions from §5.7 | Mode switch works and persists across restarts; Jest tests for the outbox (enqueue, flush, ack removes, rejected parks, backoff) and KV crash-restore; a simulated kill mid-session restores the exact state; RNTL tests for each new primitive; Maestro flows updated for the rename and still 7/7 on both platforms.                                                                                                                                                  | **Opus**                                                |
| **G1-D content QA**   | `packages/types/src/gym/exercise-catalog.ts` content only; `scripts/check-exercise-videos.ts`; the CI cron                                                                                                                                                                        | Every clip's oEmbed is verified; the estimated timestamps flagged in the research are checked against chapters or transcripts via yt-dlp; the four ~10 s silent RP clips are replaced with narrated ones where possible; a cue style pass (≤ 12 words, imperative, focused on what to feel); straight-arm pulldown gets a clip. Output: a QA table in the research file.                                                                                                | Sonnet                                                  |

**Integration (orchestrator):** merge A → B → C → D into `integrate/gym`; B swaps its
fake for the real engine; run the full gates (§8); an end-to-end API check with a
throwaway account `gym-e2e@chefer.dev`: setup → bootstrap → offline-style doc upsert →
the suggestions match the engine's worked example #1.

### Wave 2: Mobile screens, 4 agents in parallel [PARALLEL] (about 2 days plus 1 day integration)

Every agent owns its screen files. The shared kit, hooks and route registration froze
in G1-C. An agent that needs a new primitive builds it locally in its feature folder
and flags it in the handoff for promotion.

| ID                       | Scope                                                                                                                                                                                                                                                                                                                                                 | Acceptance                                                                                                                                                                                                                                                                                                            | Model    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **G2-A workout**         | `app/gym/workout.tsx`, `app/gym/summary/[id].tsx`, `src/features/gym/workout/**`: set rows, steppers, RIR chips, warm-ups, suggestion banner with Why?, rest timer (with a background notification), plate calculator, swap/skip/add/reorder with "just today / update routine", PR badges, finish flow, and the summary with "Next time" plus Adjust | RNTL tests for each state; a Maestro `gym-workout.flow.yaml` (start → tick all sets → RIR → finish → summary shows ↑); **an offline run on Android** (`setAirplaneMode` on → full workout → off → the session appears on the server); iOS offline tested manually on the simulator with the network link conditioner. | **Opus** |
| **G2-B today + setup**   | `app/(gym)/today.tsx`, `app/gym/setup.tsx`, `src/features/gym/{today,setup}/**`, and `TodaysWorkoutCard` on the food dashboard                                                                                                                                                                                                                        | Setup completes for all 4 template paths; "do another day", skip and the pre-start editor work; the week strip and ring are correct; the streak and flex display is correct; a Maestro `gym-setup.flow.yaml` with a fresh throwaway account.                                                                          | Sonnet   |
| **G2-C routine**         | `app/(gym)/routine.tsx`, `app/gym/{routine-editor,routines}.tsx`, `src/features/gym/routine/**`                                                                                                                                                                                                                                                       | Full editing including planned weekdays, next-target overrides, the balance card with the V-rule hints, the conflict sheet (tested by bumping the version from a contract client), multiple routines and set active; Maestro `gym-routine.flow.yaml`.                                                                 | Sonnet   |
| **G2-D library + stats** | `app/(gym)/{exercises,stats}.tsx`, `app/gym/{exercise/[id],exercise-form,session/[id]}.tsx`, `src/features/gym/{library,stats}/**`                                                                                                                                                                                                                    | Search and filters, photo crossfade, video sheet with the fallback, cues and mistakes, history, custom exercise CRUD; the 5 stats views on svg charts with a bodyweight overlay; image prefetch; Maestro `gym-library.flow.yaml`.                                                                                     | Sonnet   |

**Integration:** merge and resolve; the orchestrator runs **the whole loop live on
simulators** (iPhone 16e and the Pixel_8 AVD); the full mobile test ladder (§8);
`pnpm mobile:release:ios|android` onto the owner's phones; add
`mobile_parity_backlog.md` rows for G2; deploy (the API is additive, so it's safe on
master).

### Wave 3: Dogfooding [USER] (1–2 real training weeks)

The owner trains with it: at least 3 sessions, at least one fully offline, at least
one routine edit and one target override. The orchestrator watches Sentry and the
PostHog `sync_failed` and `suggestion_overridden` events, then turns the findings into
a triage list and fixes it (usually a Sonnet agent per cluster). **Go/no-go for G4 and
G5 is the owner's call.**

### Wave 4: Habit and polish (2 agents plus the orchestrator, about 1½ days)

| ID       | Scope                                                                                                                                                                                                                                                                                                   | Model  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **G4-A** | Reminders (§6.5), pause, streak repair (backfill a session into a past week, API included), comeback card, deload and stall offer flows end to end, and the monthly recap card with a shareable image (`react-native-view-shot` is JS on top of the native batch; if it isn't covered, defer the share) | Sonnet |
| **G4-B** | Supersets (`supersetGroup` in the editor and the workout: rest after the group, auto-advance), CSV export (`gym.export.csv` plus the share sheet), the settings screen for the equipment inventory (plates, dumbbells, steps, dip belt), and outbox "needs attention" UI polish                         | Sonnet |
| orch.    | A performance pass on the workout screen (Hermes profiling: set-tick → render under 16 ms), an accessibility pass, and a prod OTA publish                                                                                                                                                               | Opus   |

### Wave 5: Web, mobile-web and desktop (3 agents, about 2 days plus 1 day integration)

The API is already complete. Web reuses the engine, the **`workoutReducer`** and the
outbox core through a storage adapter (localStorage). Pages sit under
`apps/web/src/app/(dashboard)/gym/*`: `today`, `workout/[id]`, `routine`,
`routine/edit`, `exercises`, `exercises/[slug]`, `stats`, `setup`. The nav splits
`NAV_ITEMS` into `FOOD_NAV_ITEMS` and `GYM_NAV_ITEMS`. SideBar and BottomNav get the
mode switch, with the mode persisted in localStorage and a cookie so SSR renders the
right nav with no flash (remember the `useHasMounted` hydration lesson).

| ID                       | Scope                                                                                                                                                                                                                                                               | Model  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **G5-A shell + workout** | Nav mode switch, setup, today, and the active workout (the phone-width layout is the primary target; desktop is a two-column layout with the exercise list next to the active card), localStorage crash-safety plus outbox, `Sheet`/`Drawer` from `@chefer/ui` only | Opus   |
| **G5-B routine editor**  | **Desktop-first strength:** drag-and-drop days and exercises (`@dnd-kit`), a side-by-side weekly balance panel, keyboard shortcuts; the phone layout mirrors mobile                                                                                                 | Sonnet |
| **G5-C library + stats** | Library pages (the image gallery, `lite-youtube-embed` style click-to-load video), stats with recharts (already a dependency), and the dashboard card                                                                                                               | Sonnet |

Acceptance: Playwright E2E for setup → workout → summary; the **mobile Playwright
sweep at 320/375/390/430 px** has no overflow and correct touch targets on every
`/gym/*` route; the parity ledger rows are marked `done (<commit>)`.

### Wave 6: Later (not scheduled; each needs owner sign-off)

- ~~**Training-day nutrition targets:** +150–250 kcal and a protein floor on training
  days, fed into meal-plan generation (touches `MealPlanInput`, which is why it's
  deferred per D11).~~ **Shipped as audit P2-4** (2026-09-26, `business_flow.md`
  §10.1): lifters (GAIN_MUSCLE) get 1.8 g/kg protein on every tier; premium gets
  +10% kcal (150–300) and 2.2 g/kg on training days, and AI weeks built around
  the routine's weekdays; every tier gets a post-workout protein nudge.
- Apple Health / Health Connect export of workouts and bodyweight.
- An iOS Live Activity and an Android ongoing notification for the rest timer.
- Apple Watch / Wear OS logging.
- Chat tools: "how's my bench going?" and "swap today's leg day" (the tool-registry
  pattern exists).
- Offline routine editing (queued document saves with conflict UI).
- Top-set plus back-off schemes; an advanced per-set RPE column; periodized
  mesocycles.

---

## 8. Verification ladder (every wave, per platform)

| Level   | Command / action                                                                                                                   | Owner              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| L0      | `pnpm lint && pnpm typecheck && pnpm format`                                                                                       | every agent        |
| L1      | `pnpm test` (engine, API services, mobile Jest)                                                                                    | every agent        |
| L1-CI   | `DATABASE_URL="postgresql://invalid:1@127.0.0.1:9/none" pnpm --filter @chefer/api test` (catches unmocked Prisma, a known CI trap) | every API agent    |
| L2      | `pnpm mobile:contract` against the local API (gym contract tests, throwaway accounts)                                              | G1-B and G2 agents |
| L3      | `pnpm --filter @chefer/mobile bundle:check`                                                                                        | every mobile agent |
| L4      | Maestro per-flow runner `e2e/run-suite.sh <udid>` on **both** the iOS sim and the Pixel_8 AVD (layout-heavy, per CLAUDE.md)        | orchestrator       |
| L5      | Live simulator walkthrough of the whole loop, with screenshots read                                                                | orchestrator       |
| L6 (G5) | Playwright `--project=mobile` sweep plus the gym E2E specs                                                                         | orchestrator       |
| Prod    | Deploy is green, `/api/health` OK, a throwaway prod account runs setup → one workout → bootstrap                                   | orchestrator       |

Never mark a level verified if it couldn't be run. Say so in the handoff instead.

---

## 9. Delegation with Claude Code agents

### 9.1 Topology

- **Orchestrator:** this session (Opus 5.5). It owns wave 0, every integration, the
  live simulator and device verification, deploys, docs consistency, memory updates
  and the §12 progress table. It never delegates integration or merges: it's the only
  place that sees the whole diff.
- **Wave agents:** `Agent` calls with `isolation: "worktree"`, `run_in_background:
true`, one per row in the wave tables, all launched **in a single message** so they
  run concurrently. Each gets a self-contained brief: task id, file ownership list,
  frozen files, acceptance criteria, the gates from §8, the handoff format, and
  pointers to this plan and the research files.
- **Optional Workflow:** if the owner opts in ("use a workflow"), a wave can be driven
  by a Workflow script (fan out the builders, then an adversarial **verify** agent per
  builder that runs the gates and checks the acceptance criteria independently).
  That's more tokens for more assurance. Without an explicit opt-in, the plain Agent
  fan-out above is the default.

### 9.2 Rules (from `premium_plan.md` §8, which worked for the premium waves)

- Agents commit to their own branch. They **never push**, never touch master, never
  merge.
- **Frozen files** after G0: `schema.prisma`, `packages/types/src/gym/{schemas,dto}.ts`,
  `routers/index.ts`, `app.config.js`, dependency lists, `app/_layout.tsx`. An agent
  that needs a change **stops and reports** it instead of editing.
- **Registry files** (the doc tables, the parity backlog, analytics event constants):
  append only, and expect conflicts. The orchestrator resolves them.
- **Shared dev DB:** schema is applied in G0, so agents don't `db push`. Each agent
  uses its own throwaway account `agent-g<wave>-<x>@chefer.dev`, never the seed
  accounts.
- **Only the orchestrator runs dev servers, Metro, simulators and Maestro.** Two
  Metros can't share port 8083, and simulators are single-tenant. Agents stop at
  L0–L3 and list the L4/L5 checks they expect in the handoff.
- **Handoff format:** branch, files added or changed, registry additions, tests added,
  deviations from the plan, the acceptance script for the integrator, and known gaps.

### 9.3 Model choice

| Work type                                                                                                                                                                                                                                            | Model                                          | Why                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Orchestration, integration, schema and contracts (G0), anything where a subtle bug silently corrupts user data or the user's trust: the **engine (G1-A)**, **offline sync (G1-C)**, **active workout (G2-A)**, `upsertMany` and the progression fold | **Opus**                                       | Correctness under many edge cases; stateful reasoning across files; these are the parts the owner will feel at the gym.           |
| Patterned CRUD (repositories, services, routers), screens that follow existing mobile patterns (G2-B/C/D), content QA (G1-D, G0-4), web pages (G5-B/C), dogfood fix clusters                                                                         | **Sonnet**                                     | Well-specified by this plan plus existing code patterns; fast and cheap; quality holds when the acceptance criteria are concrete. |
| Mechanical chores: doc table updates, video link checks, lint and format fixes, renaming the `(tabs)` references in E2E flows                                                                                                                        | **Haiku**                                      | Deterministic edits with trivial verification.                                                                                    |
| Research (already done for this plan)                                                                                                                                                                                                                | Opus for synthesis, Sonnet for fan-out lookups | That's how `docs/gym/*` was produced.                                                                                             |

### 9.4 Parallelism, honestly

- **Wall-clock estimate:** G0 1 day → G1 2 days → G2 3 days → **dogfood 1–2 weeks**
  → G4 1½ days → G5 3 days. That's about **10–11 working days of build** around the
  owner's test weeks, compared with roughly 20 days serially.
- **What can't be parallelised:**
  - G0: every later agent depends on frozen contracts.
  - Integration: one brain has to see the merge.
  - L4/L5 device testing: the simulators are a single shared resource.
  - The dogfood gate.
- **Parallelism ceiling:** 4 agents per wave. With more, the integration cost and the
  collisions on shared UI primitives outweigh the speedup. The G2 split follows
  screen boundaries because the tab and stack structure makes those boundaries real
  file boundaries.

---

## 10. Risks and mitigations

| Risk                                                                 | Mitigation                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lost workouts from sync bugs                                         | Synchronous KV write per action; the outbox deletes only on ack; "needs attention" parking; `sync_failed` telemetry; the offline Maestro flow; dogfooding offline. |
| Engine mistuned (users override a lot)                               | The `suggestion_overridden` metric by reason code; every rule is table-tested; the version bump makes tuning safe; the owner is the first tuner.                   |
| YouTube embed refusal (error 153) or video deletion                  | Referrer-bearing WebView plus the fallback to the YouTube app; the weekly oEmbed cron; photos and cues carry the screen without video.                             |
| Native batch fingerprint strands the owner's installed prod binaries | Planned in G0-5 with an immediate `mobile:release:*` for both phones; the iPhone's free-cert 7-day expiry is already routine.                                      |
| The mode switch complicates navigation and deep links                | Route groups keep the URLs; one rename commit in G1-C with E2E updates; the mode store is the single source of truth.                                              |
| Scope creep (supersets, watch, AI coach)                             | Hard wave boundaries; G6 needs sign-off.                                                                                                                           |
| Gemini/Groq quotas                                                   | **Not relevant: the gym feature makes zero AI calls.**                                                                                                             |
| free-exercise-db photo quality varies                                | G1-D flags weak photos; custom illustration is out of scope; the video covers the gap.                                                                             |

---

## 11. Open items for the owner [USER]

1. **Merge PR danvladpop/chefer#3** (OTA and prod builds; `EXPO_TOKEN` secret still
   pending) before G0-1, so the gym branch sits on the release tooling. If it isn't
   merged, G0 branches from it.
2. **Phones connected and unlocked** for the G0-5 and G2 release builds (the iPhone
   free cert also expires around Sep 30, so it's rebuilt anyway).
3. **Spot-check the ~6 flagged video picks** after G1-D. The QA table lists them.
4. **Dogfood weeks (G3)** and the go/no-go for G4 and G5.

---

## 12. Progress

| Step                            | Status                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Research (programming, library) | ✅ 2026-09-24 (`docs/gym/*`)                                                                       |
| Plan                            | ✅ 2026-09-24 (this file)                                                                          |
| G0 foundations                  | ☐                                                                                                  |
| G1-A engine                     | ✅ 2026-09-24 — 17 worked examples + property tests, 100% branch cov. on progression.ts            |
| G1-B API                        | ✅ 2026-09-24 — repos, 8 services, idempotent upsertMany, bootstrap; contract tests                |
| G1-C mobile infra               | ✅ 2026-09-24 — (food)/(gym) groups, mode switch, KV + outbox + persisted bootstrap, ui-mobile kit |
| G1-D content QA                 | ✅ 2026-09-24 — 55/55 content, 53 photo pairs (2.4 MB), 55 verified videos, weekly link check      |
| G2-A workout                    | ✅ 2026-09-25 — iOS + Android Maestro green                                                        |
| G2-B today + setup              | ✅ 2026-09-25 — iOS + Android Maestro green                                                        |
| G2-C routine                    | ✅ 2026-09-25 — iOS + Android Maestro green                                                        |
| G2-D library + stats            | ✅ 2026-09-25 — iOS + Android Maestro green                                                        |
| G3 dogfood                      | ☐ owner — real training weeks (needs the phone release builds)                                     |
| G4 habit + polish               | ✅ 2026-09-25 — reminders, backfill, pause, supersets, set removal, CSV export, web analytics      |
| G5 web                          | ✅ 2026-09-25 — pulled forward in parallel; Playwright gym 13/13 + mobile sweep 50/50 on /gym/\*   |

### Deviations log

_(append as `n. YYYY-MM-DD: what changed and why`)_

1. 2026-09-24: `integrate/gym` branched from `feat/mobile-ota-prod-builds` (PR #3 still open), as §11 allowed.
2. 2026-09-24: G0-2 landed the schema only; the repository interfaces moved to G1-B, which owns them end to end, so no stub layer was needed.
3. 2026-09-24: Added `Exercise.isTimed` (plank, carries: the reps fields hold seconds), `WorkoutSession.rotationAppliedAt` (makes the rotation advance exactly once), and `GymProfile.goalHistory` / `offerState` Json (weekly-goal changes, deload and offer bookkeeping).
4. 2026-09-24: The catalog has 55 entries (54 in the plan, plus `assisted-pull-up` for the ASSISTED load type). Structure (`exercise-catalog.ts`, orchestrator-owned) is split from coaching content (`exercise-content.ts`, content-agent-owned) so the two can be worked on in parallel.
5. 2026-09-24: The engine API was frozen as typed stubs in `packages/utils/src/gym/*` rather than type-only signatures, so G1-B and G1-C import real function names while G1-A fills in the bodies.
6. 2026-09-24 (G1-B): `upsertMany` results carry no `nextSuggestions` (§4.1) — the frozen
   `SyncResultDto` is `{ id, status, reason? }`; clients refetch `gym.bootstrap` after an ack.
7. 2026-09-24 (G1-B): setup's "known weights" are kept in `GymProfile.offerState.knownWeightsKg`
   so a recompute (`foldHistory({ knownWeightKg })`) reproduces the seeded start — the schema has no
   dedicated column. Candidate for a real column if the schema is ever reopened.
8. 2026-09-24 (G1-B): routine CONFLICT exposes the current doc as `error.data.conflict = { kind:
'routine', current: RoutineDto }` (a TRPCError `cause` never reaches clients); added through
   `apps/api/src/lib/conflict.ts` + one additive field in the tRPC error formatter.
9. 2026-09-24 (G1-B): an identical re-send (same `clientUpdatedAt`) is `applied` without a write
   (rather than `stale`), and a failed post-write progression recompute is logged, not thrown, so
   a poison recompute can never block a phone's outbox.
10. 2026-09-24 (G1-B): overrides are cleared server-side once an exposure newer than
    `override.at` exists (the engine's `foldHistory` takes no overrides; "applies once" is enforced
    by the service).
11. 2026-09-25 (G2-B): `packages/utils/src/gym/index.ts` didn't re-export `reasons.ts` (`explain`),
    so the Today/setup screens had no way to import it — added `export * from './reasons'`. Purely
    additive; no other export changed.
12. 2026-09-25 (G2-B): `apps/mobile/jest.config.js`'s `transformIgnorePatterns` never matched a
    transitive, non-hoisted pnpm dependency (`.pnpm/@expo+vector-icons@<v>/node_modules/@expo/vector-icons/`)
    because the old `(?:\\.pnpm/)?` prefix assumed the package name followed `.pnpm/` directly.
    Any screen importing `@expo/vector-icons` (Ionicons, used by the setup/settings back button and
    already used elsewhere in the app) failed to even parse under Jest. Fixed the regex to skip the
    whole hashed pnpm directory (`(?:\\.pnpm/[^/]+/node_modules/)?`) before matching. No other
    behavior changes.
13. 2026-09-25 (G2-B): setup's "Choose another program" preview is computed **on-device** from the
    curated catalog (`EXERCISE_BY_ID` from `@chefer/types`) and the shared engine
    (`instantiateTemplate` / `estimateDurationMin` / `volumeByGroup` from `@chefer/utils`) —
    `apps/mobile/src/features/gym/setup/template-preview.ts` — rather than adding a new
    `profile.recommend`-like endpoint per alternative. `profile.recommend` is still called once per
    setup for the recommendation reason, the alternatives list and the "needs a connection" gate;
    switching between alternatives afterwards needs no further round trip and works offline. This
    mirrors exactly what `gymProfileService.recommend()` does server-side.
14. 2026-09-25 (G2-B): Settings' "end a pause early" (`pause.end`, needs a pause `id`) has nothing
    to call it with — neither `GymProfileDto` nor `GymBootstrap` exposes the active pause's id
    (`packages/types/src/gym/{dto,schemas}.ts` are frozen, and `apps/api` is out of G2-B's file
    ownership). Settings shows "Training is paused this week" (derived from `bootstrap.weeks`) with
    no end-early action. "Pause training" (create) is fully wired. Needs a follow-up: add
    `activePause: { id, startDate, endDate, reason } | null` to `GymBootstrap`.
15. 2026-09-25 (orchestrator): **G5 web ran in parallel with G2**, not after G3/G4. The owner asked for the whole plan overnight, and web touches disjoint files. G3 dogfooding moves to after everything is built.
16. 2026-09-25 (orchestrator, found by on-device E2E): Metro now forces React Native runtime singletons (a duplicate nativewind/css-interop from pnpm peer variants crashed the SegmentedControl). The mode switch navigates to `/(food)`, because a bare `/` also matches the guarded `(auth)/index` and silently no-ops. The launch redirect is one-shot. `gym/workout` is a slide-up card, not a `fullScreenModal`, because iOS safe-area insets read 0 inside native modals and pushed the header under the status bar. A "Finish workout" button also sits at the end of the list. The routine editor's Save moved to a bottom bar.
17. 2026-09-25: Mobile analytics are a typed no-op, since the app has no analytics SDK. The §6.6 events fire on web only.
18. 2026-09-25 (G4-A): Closed #14's follow-up — added `activePause` to `GymBootstrap` (additive;
    the only DTO change this wave made), filled in `GymBootstrapService` from the pause covering
    the client's `today`. Mobile and web settings now show "Paused until <date>" with a real
    **End pause** button everywhere, not just on the device that started it. Removed the web's
    `pause-store.ts` (browser-local id bookkeeping) entirely — it's dead code now.
19. 2026-09-25 (G4-A): Web Today (`today-view.tsx`) picked its one contextual offer as
    `data.offers[0]`, with no priority order — found while verifying the comeback/deload flows end
    to end (this wave's acceptance criterion). If more than one offer was pending, web and mobile
    could show different cards. Moved mobile's `pickOffer`/priority list
    (comeback > deload > stall > recap) into `@chefer/utils` (`gym/offers.ts`) and pointed both
    platforms at the shared function; `today-helpers.ts` (mobile) re-exports it so existing callers
    are unaffected.
20. 2026-09-25 (G4-A): "Log a past workout" (streak repair) needed a `backfillDate` on the active-
    workout `start()` API on BOTH platforms. Mobile's `use-active-workout.ts` is outside G4-A's file
    ownership only nominally (it isn't under `workout/**`); web's `apps/web/src/features/gym/workout/
use-active-workout.ts` genuinely IS another wave's file. Per §9.2 ("keep it minimal and list it
    in your handoff"), added one additive field to `StartWorkoutInput` on both variants plus a
    6-line local `localInstant` helper (a duplicate of the mobile reminders one, kept local rather
    than cross-imported since the file is owned elsewhere) — nothing else in that file changed.
21. 2026-09-25 (G4-A): `computeGymReminders`'s signature grew past the plan's literal
    `(profile, activeRoutine, lastSessionDate, today, now)` in two ways: (a) an `activePause`
    field, needed to actually satisfy "skip days inside a pause" (nothing else in that list carries
    pause info); (b) an optional `toLocalInstant` test seam, because this repo's Jest environment
    (jest-expo) pins `Date`/`Intl` to the host machine's own timezone and ignores `process.env.TZ`
    reassignment mid-process — verified empirically — so DST correctness had to be tested by
    injecting a synthetic zone rather than forcing a real one. Production always uses the real,
    device-local `localInstant` (unchanged behavior).
22. 2026-09-25 (polish, "notes from last time" + supersets outside the workout): touched the
    frozen `packages/types/src/gym/dto.ts` — added `SessionSummaryDto.exercises[].notes?: string |
null`. This is explicitly additive (optional, new field only) per this task's own instructions
    and CLAUDE.md's platform-parity rule, so a shipped mobile client that doesn't send/read it keeps
    working unchanged. Filled by `toSessionSummary` (`@chefer/utils/gym/session.ts`); no router or
    schema change. Supersets outside the workout (Routine tab day cards, Today's "Next up") reuse
    the existing `supersets.ts` helper and, on web, the existing `SupersetHeading` component — no
    new superset logic was added, only new call sites.
23. 2026-09-25 (polish): `apps/web/vitest.config.mts` had no React plugin, so this was the first
    component-render test (`@testing-library/react` + `@vitest-environment jsdom`) written for
    `apps/web` — `@vitejs/plugin-react` was already a devDependency but unwired. Added
    `plugins: [react()]` so JSX resolves under Vitest's esbuild transform; this only affects test
    runs, not the Next.js build (which already uses its own JSX transform). `NextUpCard` in
    `today-view.tsx` was exported (was module-private) so it could be rendered in isolation.
24. 2026-09-26 (audit F-GYM-2-1, S2): the equipment answer was ignored — Dumbbells setups got
    a barbell RDL, EZ-bar skull crusher, barbell hip thrust and reverse pec deck; Bodyweight
    setups got 7–16 machine/barbell/dumbbell/cable lifts per program (152 off-equipment slots
    across the 30 setup combinations). Fixed by 22 new home variants (catalog 55 → 77: DB RDL,
    DB hip thrust, DB overhead/lying triceps extensions, DB reverse fly, DB fly, chest-supported
    DB row, DB calf raise; bodyweight squat, reverse lunge, bodyweight Bulgarian split squat,
    single-leg RDL, slider leg curl, nordic curl, glute bridge, single-leg glute bridge,
    single-leg calf raise, inverted row, incline/decline/diamond/pike push-ups), complete swap
    tables and an engine rule (every slot within `EQUIPMENT_ACCESS_SETS`, else closest
    same-pattern alternative, else dropped). Bodyweight moves use `loadType BODYWEIGHT`
    (reps → sets → "try a harder variation" from the same swap group). 69/77 have photo pairs;
    all 22 new ones have an oEmbed-verified video. D10's "less polish" still applies to
    volume balance (bodyweight programs get only info-level side-delt hints), not equipment.
    Existing saved routines are untouched; a "swap exercises you can't do" hint is deferred.
