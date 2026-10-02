# WP-05 · Class-goers: the "I train in classes" path and the class check-in

|                   |                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave / priority   | 2 / P1 product. Research Summary **Gym 1 + Gym 2**, backed by [tester feedback](./feedback-2026-10-02.md)                                                                                                                           |
| Size              | L: about 1.5–2 days. Schema + API + mobile + web                                                                                                                                                                                    |
| Branch / worktree | `feat/gym-class-goers` / `../chefer-wp05`                                                                                                                                                                                           |
| DB / ports        | `chefer_wp05` / 3205, 3305, 8105                                                                                                                                                                                                    |
| Depends on        | Phase A merged (WP-01..04, WP-09..14), and **WP-18's design**. The trainer platform's member side reuses this package's class-session model; WP-18 Phase 0 decides whether WP-05 ships first on its own or as part of WP-18 Phase 1 |
| Can run alongside | WP-06. WP-05 must not touch the tracker, quick add or rebalance. Its only food-side surface is the plan-day marker and a Today card                                                                                                 |
| API level         | Claims the **next free level** (probably 6) for class sessions. Record the claim in the live coordination file before coding                                                                                                        |
| Owner decisions   | **Signed off 2026-10-02:** D-1 yes (no wait for more interviews). D-2 "calories reached" = **calories burned** (watch)                                                                                                              |

## Goal

A person who trains in coached classes can:

- start using Chefer's gym side **without building a routine**;
- check in after a class in **under 10 seconds**;
- see "classes this week against my goal".

None of this disturbs a lifter's progression.

## What exists today (facts)

- **Freestyle needs a profile and a routine on mobile.**
  - `today-screen.tsx:283-314`: no profile gives "Set up your training"; no active routine gives "No active routine".
  - Both states hide Freestyle.
  - Web needs only a profile (`apps/web/src/features/gym/today/today-view.tsx:62-66`).
- **Progression counts every completed session, freestyle included.**
  - `progression.service.ts:73-123`, using `findCompleted` (`workout-session.repository.ts:268-297`), which has no
    routine filter.
  - `exposuresFromSession` (`packages/utils/src/gym/session.ts:450`).
- **Weekly goal.**
  - `GymProfile.weeklyGoal` is computed by `settleWeeks` (`packages/utils/src/gym/weeks.ts:110-159`) from
    `findCompletedDates`, which counts every completed session.
  - It is shown as `ProgressRing` (`today-screen.tsx:323,401-415`) and as web `WeekRing`.
- **Session fields.**
  - `WorkoutSession` (`schema.prisma:1343-1367`) has **no** effort, focus, kind, duration or kcal field.
  - `SessionSet` already has `intensityRpe`, `durationSec` and `caloriesKcal`, but those are per set.
- **Setup and onboarding.**
  - The setup wizard (`setup-wizard.tsx`) has 7 steps: days per week, experience/split, equipment, which days, program,
    starting weights, done.
  - Onboarding's `training-days-step.tsx` asks which days, plus run/ride.
  - Nothing anywhere asks "How do you train?".
- **Catalogue.** It lacks box jump, jump squat, jump lunge, barbell reverse lunge and (lateral) duck-under. It has leg
  press, deadlift, plank and dumbbell/bodyweight reverse lunge (`packages/types/src/gym/exercise-catalog.ts`, upserted
  by `apps/api/src/lib/exercise-library/ensure.ts`).
- **Training-day markers on the food plan.** Run days already show as markers (`packages/utils/src/plan-training.ts:77`,
  `training-nutrition.ts:132`). The decision of 2 Oct: class days get a **marker only, with no kcal bump**.

## Design

### Data (additive)

- `GymProfile.trainingStyles String[]`. Values come from a Zod enum in `@chefer/types`: `OWN_PROGRAM | CLASSES | CARDIO |
MIXED`. Multi-select. Empty means unknown, and old behaviour applies.
- **`ClassSlot`:** userId, weekday, local time, optional name ("Leg day with Ana"), default focus tags, active. These are
  the "weekly class times, set once".
- **`WorkoutSession` additions, all optional:**
  - `kind` (`STRENGTH` default | `CLASS`);
  - `effort Int?` (1–10);
  - `focus String[]` (Zod enum `LEGS | UPPER | CORE | FULL_BODY | CARDIO | MOBILITY`; the tester named legs, upper body,
    abs and cardio);
  - `durationMin Int?`;
  - `watchKcal Int?`;
  - `classSlotId?`.
- **"Skipped."** Store `ClassCheckIn { userId, classSlotId?, localDate, status: WENT | SKIPPED, sessionId? }`.
  - WENT creates a COMPLETED `WorkoutSession` with `kind = CLASS`, which works with zero exercises.
  - SKIPPED creates no session and doesn't count as a miss. Use kind copy, as the gym already does for skips.
- **Progression.** `ProgressionService.recompute` and the overload suggestions ignore `kind = CLASS` sessions.
  "Last time" lookups **include** them (research G9: show "last time", don't prescribe).
- **Weekly goal.** CLASS sessions count. For a CLASSES-only user, `weeklyGoal` = classes a week.
- **Weekly burn goal (D-2: "calories reached" means calories burned).**
  - Add an optional `GymProfile.weeklyBurnGoalKcal Int?`, set in the class path or gym settings ("Weekly calories burned
    goal, from your watch").
  - `watchKcal` can be entered on **any** finished session (class check-in, and the strength workout summary).
  - The week view sums the week's `watchKcal` against the goal.
  - These numbers are **never** added to food targets or the training-day bump (decision of 2 Oct: wrist kcal is off
    by 27–93 %). Copy says "from your watch".
- **Old clients (API level < claimed level).** Decide and test, using ladder 2c (old contract tests against the new API).
  Either hide `kind = CLASS` sessions from list and history endpoints, or render them as a normal freestyle session named
  after the class with zero exercises. Hiding is the default.

### Flows (mobile and web)

1. **"How do you train?"** (multi-select: own program · coach or classes · cardio · a bit of everything). Ask it in
   onboarding's `training-days-step` when TRAIN is a job, and again at the top of gym setup. It is editable in gym
   settings.
2. **Class path in setup.** If CLASSES is chosen and OWN_PROGRAM isn't, setup becomes 2 short steps:
   - classes a week, which sets `weeklyGoal`;
   - optional class times: weekday + time + focus, quick-picked.

   Then it finishes. No equipment, split, program or weights. Lifters keep today's wizard. Choosing both runs the lifter
   wizard, then offers the class times.

3. **Gym Today for class-goers.**
   - The primary card is "Log today's class". When a ClassSlot exists for today, it reads "How was Tuesday 18:00?".
   - The week ring shows classes against the goal, and under it "1,450 of 2,000 kcal burned this week" when a burn goal
     is set.
   - Below it: recent classes, and Freestyle (now allowed **without** a routine on mobile).
   - Lifters see today's screen unchanged, plus a small "Log a class" link if CLASSES is among their styles.
4. **Check-in, the < 10 s path.**
   - Step 1: **Went** / **Skipped**.
   - If Went: effort as a 1–10 chip row (copy "How hard was it?"), plus focus chips pre-selected from the slot.
   - **Save** is reachable without scrolling.
   - "Add details" expands: duration, watch calories ("from your watch", never added to food targets), note, and "Add
     exercises" (library picker; weights optional, `0` = empty, no breaking optional-weight change).
5. **Reminder.** If the user turns on gym reminders, schedule a local notification at the slot's end + 15 min ("How was
   class?"). This uses `expo-notifications`, which is already installed, plus WP-02's `useNotificationPermission`. Opt-in,
   in the class-times step.
6. **Food plan marker.** Class days show like run days on Plan and Today, with a nudge ("Protein in the meal after
   class"). There is no target change.
7. **Catalogue.** Add box jump, jump squat, jump lunge, barbell reverse lunge, lateral duck-under, and the plyometric
   staples burpee, mountain climber and kettlebell swing if missing. Each needs a movement pattern and muscles. Photos
   aren't needed (decision L-D1 keeps the existing photos; new entries can ship without one).

## Lanes

| Lane          | Items                                                                                                                                                                                                            | Owns                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, data + API | the schema migration, Zod enums in `@chefer/types`, `class-slot` + `class-check-in` repositories/services/routers, the progression exclusion, the weeklyGoal semantics, old-client gating, the catalogue entries | `packages/database/prisma/*`, `packages/database/src/repositories/{class-*,workout-session*}`, `apps/api/src/{application,routers}/gym/*`, `packages/types/src/gym/*`, `packages/utils/src/gym/*` |
| B, mobile     | the "How do you train?" step, the setup class path, Gym Today variants, the check-in sheet, the reminder, the freestyle gate, the food-plan marker                                                               | `apps/mobile/src/features/{gym,onboarding/training-days-step*}`, `apps/mobile/app/gym/*`                                                                                                          |
| C, web        | the same flows on web                                                                                                                                                                                            | `apps/web/src/features/gym/*`, web onboarding training step, web plan marker                                                                                                                      |

Lanes B and C start once lane A's contract is merged into the WP branch. Lane A writes the contract tests first.

## Tests

- **API:** progression ignores CLASS sessions; "last time" includes them; the weekly goal counts them; SKIPPED doesn't
  count; old-level clients get the chosen fallback.
- **Contract:** `classSlot.*`, `classCheckIn.*`, and the new optional session fields.
- **Jest:** the check-in sheet goes Went → effort → Save in ≤ 3 taps; the setup class path is 2 steps.
- **Maestro:** register → Train → "Coach or classes" → 3 a week + Tue 18:00 + burn goal 2,000 → Today → check in with
  450 kcal → ring 1/3 and "450 of 2,000 kcal burned".

## Acceptance

- A new class-goer finishes setup in under a minute with no routine, and the check-in takes ≤ 3 taps. Time it on the
  simulator; the owner repeats the timed test with the tester after deploy.
- A lifter's progression targets are unchanged after logging a class that contains a lifted exercise.
- An old 1.0.1 client against the new API passes ladder 2c.
- Research Summary Gym 1 + 2 are marked "Shipped (WP-05, #PR)".

## Kickoff prompt

```
You are the orchestrator for WP-05 "Class-goers". Read, in order:
1. docs/backlog-2026-10/00-operating-rules.md
2. docs/backlog-2026-10/WP-05-class-goers.md
3. docs/backlog-2026-10/feedback-2026-10-02.md
4. The Summary section of docs/product/user-needs-research-2026-10.md
5. CLAUDE.md
Then execute WP-05 end to end under the operating rules:
- fresh worktree off origin/master; cloned DB with migrations on the clone only; mock AI;
- Sonnet lanes, at most 3 at a time;
- additive API, gated by API level (claim the level in the live coordination file first); OTA-safe;
- tests per the WP doc; the full ladder including the old-client compatibility run;
- iOS plus ONE Android emulator; web on the Playwright mobile sweep;
- ONE PR to master, never merged.
Owner decisions D-1 (yes) and D-2 (calories burned; weekly burn goal) are signed off; see the WP doc.
Finish by updating the live coordination file, then give the final summary.
```
