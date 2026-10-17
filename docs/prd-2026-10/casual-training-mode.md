# PRD · Simple training mode ("casual lifting")

|           |                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | **Decisions in + grilled (2026-10-17)**: D-1…D-7, F-1 answered; F-2 accepted; terms in [GLOSSARY.md](../../GLOSSARY.md), [ADR 0001](../adr/0001-one-active-routine.md) |
| Source    | Owner PRD "Chefer Trainers PRD" (Google Doc), section _Casual Lifting_                                                                                                 |
| Companion | [trainer-coaching.md](./trainer-coaching.md): the two features share a user (see §9)                                                                                   |
| Platforms | Web + mobile (both have the gym feature, so both ship together)                                                                                                        |
| Builds on | Gym v1, freestyle sessions, WP-20 activity quick-log (#121), exercise photos (#163)                                                                                    |

---

## 1. Problem

Chefer's gym side is built for one kind of gym-goer: the **tracker**. Trackers follow a program, log every set's
weight and reps, and want the progression engine to tell them when to add load. Chefer does this well.

The owner sees a second, probably larger group in the gym: the **mover**. Movers:

- show up, train for 30–60 minutes and go home;
- think in "upper / lower / full body", "yoga on Tuesday" or "a class", not in a program;
- care about **having done a good workout** and **roughly how many calories** it burned;
- do not care whether their pull-ups went up this week, and will not log 18 sets of numbers to find out.

For a mover, today's Chefer asks too much:

| Today in Chefer                                                                                      | What a mover experiences                                  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Setup builds a **routine** with a rotation (`nextDayId`) before Today shows anything useful (mobile) | "I just want to work out today."                          |
| The logger is per-set: weight × reps, RIR, warm-ups, calibration                                     | Homework. They skip logging, then stop opening the app.   |
| The summary celebrates e1RM, PRs, progression changes                                                | Numbers they do not track.                                |
| The burn estimate is a single line on the summary; strength is a flat 3.5 MET                        | The one number they _do_ care about is the least visible. |
| WP-20 activity quick-log covers classes and runs done elsewhere, after the fact                      | Close, but it can't be planned ahead or run live.         |

**Risk of doing nothing:** movers churn out of the gym side within a week and keep Chefer only for food, or leave.
The gym side then serves a niche.

## 2. Goal and non-goals

**Goal.** A mover can:

- open Chefer at the gym and start a **workout in one tap**, without building anything first;
- optionally say what their week looks like ("Tuesday yoga, Friday cardio");
- finish with a summary about **time, calories and what kind of session it was**.

A tracker's experience does not change.

**Non-goals (this PRD).**

- **No generated workouts or routines by default** (D-4). Chefer does not invent exercises for the user.
- No new progression engine. Simple mode keeps unconfirmed numbers out of the existing engine (§6.5).
- No wearables. HealthKit / Health Connect stays a separate native project (§8, phase 3).
- Burned calories do **not** change food targets (D-3). Chefer keeps its "no eating back" policy.

## 3. Users and jobs

| Persona             | Job to be done                                                                      | Mode they want                                                    |
| ------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Tracker** (today) | "Tell me what to lift today and when to go heavier."                                | Track my progress                                                 |
| **Mover**           | "I'm at the gym for 45 minutes of upper body. Tell me roughly what it burned."      | Keep it simple                                                    |
| **Class-goer**      | "Tuesday is yoga, Thursday is spin. Log it in 10 seconds, count it toward my week." | Keep it simple                                                    |
| **Coached client**  | "My trainer decides the workout. I just want to see it and tick it off."            | Either. Usually simple (see [trainer PRD](./trainer-coaching.md)) |

The mode is about **how someone wants to train**, not how good they are. An experienced lifter can choose simple
mode; a beginner can track progress. It is therefore a separate setting from the existing `TrainingExperience`
(BEGINNER / INTERMEDIATE), which keeps driving templates and progression steps for trackers.

## 4. Naming (D-1: accepted)

| Layer         | Term                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| User-facing   | **Training style**: "Keep it simple" / "Track my progress"                                                             |
| Code / domain | `TrainingStyle = 'SIMPLE' \| 'PROGRESSIVE'` on `GymProfile`                                                            |
| User-facing   | **Workout**: one bout of training of any type (upper body, yoga, a run…), live or logged afterwards. The default unit. |
| User-facing   | **My week**: the optional weekday plan in simple mode ("Tue · Yoga")                                                   |
| User-facing   | **Workout type**: the kind of workout (§6.3). Code: `WorkoutType`                                                      |

All terms are defined in [GLOSSARY.md](../../GLOSSARY.md), settled in the 2026-10-17 grilling:

- "Training session", "session" and "activity" are **retired** as separate words. A WP-20 activity is now a logged
  workout, and the button reads **"Log a workout"** in both styles.
- "Freestyle workout" stays, in "Track my progress" only: a workout that does not follow a routine day.
- "Training style" is not a skill level.
- "My week" is the simple-mode face of the one active routine ([ADR 0001](../adr/0001-one-active-routine.md)), not a
  second plan.

## 5. Concept (D-2: accepted)

Three concepts were weighed: a global mode switch, a per-session choice, and auto-detecting progressive disclosure.
The owner chose the **global mode switch**, with two borrowed pieces:

- **A generic workout can be started in both modes.** In progressive mode it is today's freestyle session.
- **Nudges, never an automatic switch.** A simple-mode user who adds exercises with weights in 3 sessions in a row
  sees "Want Chefer to track your progress?"; a progressive user who skips logging 3 times sees the reverse.

Switching is **lossless** and available any time in gym settings. Both modes write the same `WorkoutSession` data.

## 6. Solution

### 6.1 Choosing a style

- **Onboarding V4** (the TRAIN job) and **gym setup** ask one question, "How do you like to train?":
  - "I follow a program and track my lifts" → PROGRESSIVE (today's setup continues);
  - "I just want a good workout" → SIMPLE;
  - "Mostly classes, or with a trainer" → SIMPLE.
- **Existing users** default to PROGRESSIVE. Nobody already using the gym side sees a change.
- **SIMPLE setup asks nothing else.** It ends with one optional step: "Want to plan your week? You can do it later."
  No routine is required. This removes today's "No active routine" dead end on mobile.

### 6.2 The default: a generic workout (D-4)

The unit of simple mode is a **workout**, not a list of exercises.

**Start one live** (at the gym) or **log one afterwards** (WP-20 style). Both use the same form:

| Field        | Required     | Notes                                                                                 |
| ------------ | ------------ | ------------------------------------------------------------------------------------- |
| Workout type | yes, one tap | Prefilled from My week when today is planned; otherwise the last used type            |
| Duration     | live: timer  | Logged afterwards: 30 / 45 / 60 chips or custom                                       |
| Effort       | optional     | "Easy / Solid / Hard" at the end. Improves the calorie estimate (§6.6)                |
| Exercises    | **optional** | "+ Add exercise" from the library, then tick it off; weight and reps are optional too |
| Watch kcal   | optional     | "Got a number from your watch?" It wins over the estimate                             |

So the smallest possible session is **one tap to start and one tap to finish**. Everything else is optional.

This replaces the "quick workout generator" from the first draft. Chefer does not pick exercises for the user. If
movers later ask for ideas, an opt-in "Need ideas?" button is a phase-3 candidate. It is never the default.

### 6.3 Workout types

One shared list for live workouts, logged workouts and My week. It extends the WP-20 activity catalogue with
strength focuses:

| Group    | Types                                                    |
| -------- | -------------------------------------------------------- |
| Strength | Upper body · Lower body · Full body · Strength (other)   |
| Cardio   | Cardio machines · Running · Walking · Swimming · Cycling |
| Classes  | Yoga · Pilates · Spin · HIIT · Dance · Other class       |
| Other    | Other                                                    |

**Every workout type counts** (D-6 + F-1):

- toward the **weekly goal and streak**;
- as a **nutrition training day**. A yoga Tuesday is a training day just like an upper-body Monday.

Each type has a MET range for the calorie estimate. The cardio and class types reuse the existing catalogue values.

**What "training day" changes, and what it does not.** The training-day bump stays as it is today:

- it is a fixed +10% of the base target, clamped to 150–300 kcal, with protein raised to 2.2 g/kg;
- it applies only to the GAIN_MUSCLE goal;
- it is not based on calories burned, so D-3 ("no eating back") still holds.

F-1 only widens **which days** qualify.

**One rule in both modes.** The same yoga session must not mean different things depending on the training style.
So progressive mode's WP-20 logged workouts (formerly "Log activity") also start counting as training days. This reverses today's
`isActivityLogSession` exclusion in `training-nutrition.service.ts` and needs an update to `business_flow.md`.

### 6.4 My week (optional plan)

The owner's example: "Tuesday is yoga, Friday is cardio". My week is seven rows:

```
Mon  Upper body
Tue  Yoga
Wed  —  rest
Thu  Lower body
Fri  Cardio
Sat  —  rest
Sun  —  rest
```

- Each weekday is **Rest** or a **workout type**. That is all most people will ever set.
- **Optionally**, a day can hold exercises ("Mon · Upper body: bench, rows, curls"). Then the live workout for that
  day starts with those exercises listed, ready to tick. Adding them is the "edit their routine if they want to"
  path from D-4.
- **One planned workout per weekday** in phase 1.
- The **weekly goal defaults to the number of planned days** (still editable).
- **Today** shows the planned workout for today: "Tuesday · Yoga", with **Start**, **Log a workout** and **Skip**. On an
  unplanned day it shows **"Start a workout"** with the workout-type picker, plus the routine's **unscheduled days**
  as one-tap shortcuts.
- Missing a planned day is not a failure state. There are no red marks; the week ring simply shows 2 of 3.

**One routine, two views** ([ADR 0001](../adr/0001-one-active-routine.md)). Each person has exactly one active routine.
"Track my progress" shows it as a rotation; "Keep it simple" shows it as My week. Routine days without a weekday,
such as a rotation built by a trainer or kept from progressive mode, appear as **unscheduled days**. The user can put
one on a weekday or start it from Today. Switching style changes only the view.

**Data.** `RoutineDay` uses the existing `plannedWeekday` plus a new optional `workoutType`. Simple mode ignores the
rotation pointer (`nextDayId`). A day with zero exercises is valid.

> **Compatibility risk to verify at build time:** older mobile binaries may not expect a routine day with no
> exercises. If they break on it, the server hides simple-mode routines from clients below the new API level. The
> same mechanism already strips cardio types for old clients (`client-level.ts`).

### 6.5 Progression guard (D-5: still needed, but narrower)

With D-4, most simple-mode sessions contain no exercises and never touch progression. The risk remains in one case:
a My week day **with exercises** and target numbers. A user who ticks Done without editing would otherwise record
the prefilled weight as a real lift.

**Rule:** a ticked exercise whose numbers were not edited is stored as **done, load not confirmed**, and the
progression engine ignores it. It is invisible to the user and cheap to build. It also closes a gap WP-05 found
(progression counts every completed session, freestyle included). Coaching needs the same rule (§9).

### 6.6 Calories: honest, then visible (D-3: no food-target change)

Today's estimate (`estimateSessionKcal`) is MET × body weight × time. Strength uses a flat 3.5 MET.

1. **Honest display.** Always "~240 kcal", with a "How we estimate this" sheet. Without a weigh-in, ask for weight
   inline instead of showing nothing.
2. **Better estimate.** The workout type and the effort answer set the MET within the type's range. Strength moves
   from a flat 3.5 to about 3.5–6.
3. **Watch number wins** when given.
4. **Weekly view.** Minutes and ~kcal per week on Stats.
5. **Food side unchanged.** Burned calories stay informational, per D-3.

### 6.7 What changes per screen

| Surface     | Track my progress (unchanged)                    | Keep it simple                                                                         |
| ----------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Today**   | Next routine day, progression hints              | Today's planned workout (or "Start a workout"), week ring, minutes and ~kcal this week |
| **Routine** | Program with rotation, days, progression state   | **My week**: 7 weekday rows, each Rest or a workout type, exercises optional           |
| **Logger**  | Per-set weight × reps, RIR, warm-ups, rest timer | Timer, workout type, ~kcal so far; optional exercise list with Done ticks              |
| **Summary** | Volume, PRs, e1RM, progression changes           | Minutes, ~kcal, workout type, effort, week ring, streak                                |
| **Stats**   | Lift charts, e1RM, volume                        | Minutes and ~kcal per week, sessions by type, sessions vs goal                         |
| **Hidden**  | —                                                | RIR, calibration, deload, e1RM, tempo, warm-up sets, progression messages              |

### 6.8 Wireframes (mobile, simple mode)

Low-fidelity sketches for alignment. Visual mockups are the next step, on the mobile design canvas.

```
TODAY (planned day)                   LIVE WORKOUT                        SUMMARY
┌──────────────────────────────┐      ┌──────────────────────────────┐    ┌──────────────────────────────┐
│ Train                        │      │ Upper body        32:10  ⏸   │    │ Nice work 💪                 │
│                              │      │ ~190 kcal so far             │    │ Upper body · 46 min          │
│ This week   ◔ 1 of 3         │      │                              │    │ ~280 kcal (est.) ⓘ           │
│ 45 min · ~280 kcal           │      │ Exercises (optional)         │    │                              │
│                              │      │  ✓ Bench press               │    │ How did it feel?             │
│ Tuesday · Yoga               │      │  ✓ Lat pulldown              │    │ [Easy] [Solid] [Hard]        │
│ [Start] [Log workout]  Skip  │      │  ○ Biceps curl               │    │                              │
│                              │      │ [ + Add exercise ]           │    │ Watch says… [ ___ kcal ]     │
│ Something else today?        │      │                              │    │                              │
│ [    Start a workout     ]   │      │ [     Finish workout     ]   │    │ Week ◑ 2 of 3 · 🔥 4 weeks   │
└──────────────────────────────┘      └──────────────────────────────┘    └──────────────────────────────┘

MY WEEK                               PICK A WORKOUT TYPE (sheet)
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ ← My week                    │      │ What are you training?       │
│ Mon  Upper body          ›   │      │ Strength                     │
│ Tue  Yoga                ›   │      │ [Upper] [Lower] [Full]       │
│ Wed  Rest                ›   │      │ Cardio                       │
│ Thu  Lower body          ›   │      │ [Machines] [Run] [Walk] …    │
│ Fri  Cardio              ›   │      │ Classes                      │
│ Sat  Rest                ›   │      │ [Yoga] [Pilates] [Spin] …    │
│ Sun  Rest                ›   │      │ [Other]                      │
│ Weekly goal: 4 workouts      │      └──────────────────────────────┘
└──────────────────────────────┘
```

## 7. Owner decisions

| #   | Decision                                                      | Answer (2026-10-17)                                                                                                        |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Names: "Keep it simple / Track my progress" (`TrainingStyle`) | **Yes**                                                                                                                    |
| D-2 | Global mode switch, generic session in both modes, nudges     | **Yes**                                                                                                                    |
| D-3 | Burned calories raise the food target?                        | **Not now**                                                                                                                |
| D-4 | Generated workouts?                                           | **No generation by default.** A generic workout; the user may add exercises; weekday plan ("Tue yoga, Fri cardio")         |
| D-5 | Unconfirmed ticks don't feed progression                      | Owner unsure it still applies after D-4. **It does, narrowly** (§6.5). Treated as accepted unless the owner objects (F-2). |
| D-6 | Simple-mode workout counts as a nutrition training day        | **Yes, every workout type** (F-1, 2026-10-17): strength, cardio and classes, in both modes (§6.3)                          |
| D-7 | Free or premium                                               | **Simple mode free**                                                                                                       |

**Open follow-ups**

- **F-1 (answered):** classes and cardio count as training days. All workout types count (§6.3).
- **F-2:** keep the progression guard (§6.5)? Recommendation: yes. Treated as accepted unless the owner objects.

## 8. Phasing

| Phase                  | Scope                                                                                                                                                                                                              | Size |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| **1 · MVP**            | `trainingStyle` + the onboarding/setup question; generic workout (start live + "Log a workout"); workout types; My week (types only); Today, logger and summary in simple mode; progression guard; settings switch | ~L   |
| **2 · Make it sticky** | Exercises on My week days; effort-based estimate; weekly minutes/kcal and sessions-by-type stats; watch kcal on all sessions; style nudges                                                                         | ~M   |
| **3 · Later**          | HealthKit / Health Connect import (native; the owner builds), then revisit D-3; opt-in "Need ideas?" exercise suggestions if users ask                                                                             | ~L   |

Phase 1 ships behind one feature flag (`simpleTraining`) for a dark launch to testers, the same pattern as
`mobileShellV2`.

**Unifying with WP-20.** There is one "Log a workout" sheet in both styles; it replaces "Log an activity". A WP-20
activity _is_ a logged workout of a cardio or class type, so no data migration is needed.

## 9. How this connects to trainers

Most people with a personal trainer are **movers**: the trainer does the thinking, the client shows up. So:

- A coached client in SIMPLE mode sees the trainer's plan in **My week**, with exercises filled in by the trainer,
  Done ticks and the trainer's per-exercise notes: "Mon · Upper body (from Ana)".
- The trainer still sees adherence (sessions done, exercises completed). Weights count only when the client edited
  them. Trainers who need exact loads ask the client to switch to "Track my progress", or log on the client's
  behalf (trainer PRD S2).
- **Build order:** the progression guard (§6.5) ships before or together with coaching.

## 10. Success metrics

Measured with the WP-13 beta events.

| Metric                                                 | Target (beta, 4 weeks)                      |
| ------------------------------------------------------ | ------------------------------------------- |
| New gym users who finish a first session within 7 days | +30% relative to the current baseline       |
| Time from opening Train to a started session (simple)  | median < 10 s                               |
| Simple-mode users still training in week 4             | ≥ progressive-mode users                    |
| Sessions per active simple-mode user per week          | ≥ 2                                         |
| Simple-mode users who set up My week                   | ≥ 40% (shows the plan is wanted)            |
| Users who switch style within 14 days                  | < 15% (shows the onboarding question works) |

**Next steps:**

1. The owner objects to F-2 if they disagree; otherwise it stands.
2. Visual mockups of the screens in §6.8 on the mobile design canvas.
3. A WP doc with lanes (types/utils → API → mobile → web), following the backlog format.
