# Cardio Tracking Research — 06

**Date:** 2026-09-27
**Trigger:** owner report — a custom "Indoor bike" exercise gets forced into the strength model (3 sets × 1 s × 15 kg); there is no cardio dataset and no way to log time/distance/intensity properly.
**Scope:** document only, no code changes. Evidence (competitor research, physiology) is kept separate from Chefer-specific recommendations (§5–§7).

---

## 0. Current Chefer model (read from source)

Confirmed by reading `packages/database/prisma/schema.prisma`, `packages/types/src/gym/*`, and the mobile gym feature code — **Chefer has exactly one exercise-logging shape today, and it is strength-only:**

- `Exercise` (`schema.prisma:666`) has `repMin`, `repMax`, `restSec`, `incrementKg`, `loadType` (`WEIGHTED | BODYWEIGHT | BODYWEIGHT_PLUS | ASSISTED`), and a single boolean escape hatch, `isTimed` — `"reps fields hold SECONDS (plank, carries)"`. There is no `trackingType`, no distance, no pace, no incline/resistance level, no heart rate, no calories.
- `SessionSet` (`schema.prisma:838`) is `{ weightKg: Float, reps: Int, isWarmup, completedAt }`. Every set, timed or not, is still a weight × reps row — `isTimed` only changes what the `reps` integer _means_ in the UI, it does not add a field.
- `ExerciseEquipment` (`schema.prisma:619`) is `BARBELL | DUMBBELL | CABLE | MACHINE | BODYWEIGHT | SMITH | EZ_BAR | KETTLEBELL | BAND | ASSISTED` — no treadmill/bike/rower/track category exists.
- `customExerciseInputSchema` (`packages/types/src/gym/schemas.ts:184`) requires `repMin`/`repMax` (1–3600, so it _can_ hold seconds), `restSec`, `isTimed`, but has no distance, pace, or resistance-level field. This is what a user fills in for "Indoor bike" today, and it produces a strength-shaped exercise no matter what they enter.
- Defaults are hard-coded strength defaults: `newExerciseRow()` (`apps/mobile/src/features/gym/routine/reducer.ts:68`) and `defaultSlotParams()` (`apps/mobile/src/features/gym/workout/workout-model.ts:336`) both set `sets: 3` unconditionally; `weightKg` starts from the engine's load-suggestion logic, which is why a bike ends up at "15 kg."
- `packages/utils/src/gym/duration.ts` estimates session length from `sets × (40 s + restSec)` — another place that assumes every exercise is a set/rest strength exercise.

This confirms the owner's report precisely: there is no cardio "shape" anywhere in the type system, database schema, or UI defaults. §5 proposes the additive fix.

---

## 1. How leading apps model cardio

| App                                  | Cardio model                                                                                                                                                                                                                                                                | Fields logged                                                                                                                                                                                                           | Cardio + strength in one session                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hevy**                             | Exercises are typed in the library as Weight, Bodyweight, Cardio, or Duration-based; each type drives what the log screen shows                                                                                                                                             | Duration, distance (manual entry unless synced); PRs tracked as "Best Pace," "Longest Distance," "Longest Time"                                                                                                         | Yes — cardio exercises sit in the same workout list as strength exercises, just with different logged fields per row                                                                   |
| **Strong**                           | "Duration Exercises" as a distinct exercise class, separate from weight×reps                                                                                                                                                                                                | Time, distance (km); if a cardio machine isn't in the catalog, users add it manually                                                                                                                                    | Yes, same workout                                                                                                                                                                      |
| **JEFIT**                            | Per-exercise flags select which cardio fields are shown                                                                                                                                                                                                                     | Calories burned, distance traveled, speed, lap/reps, duration — all as fillable fields on the log screen; Apple Watch adds live heart rate + calories                                                                   | Yes                                                                                                                                                                                    |
| **Fitbod**                           | A separate "Cardio" entry flow (tap Add Exercise → Cardio) from strength; catalog covers Cycling (outdoor), Stationary Bike, Elliptical, Rowing, Treadmill, Running (outdoor), Walking & Hiking                                                                             | Distance, time, resistance level; Strava integration imports GPS pace/distance directly; a "Cardio Recommendations" feature pre-fills duration for warm-up/cool-down/endurance cardio slotted around a strength session | Yes — cardio can be inserted before/after a strength workout                                                                                                                           |
| **Apple Health / Watch (HealthKit)** | `HKWorkoutActivityType` — a large enum of workout types (Running, Cycling, Rowing (Indoor/Outdoor), Elliptical, Stair Stepper, Swimming (Pool/Open Water), HIIT, Jump Rope, Functional/Traditional Strength Training, Mixed Cardio, …); `HKWorkout` is the container sample | Time, distance, pace, elevation gain/ascent, heart rate, active + total calories; fields present depend on activity type and sensors available                                                                          | Not applicable in the same sense — a "workout" is one activity type, but `HKWorkout` can contain a mix via WorkoutKit "custom workouts" (e.g., warm-up → intervals → cool-down blocks) |
| **Garmin Connect**                   | Sport profiles (Run, Bike, Row, …) each with their own configurable data fields and HR zones                                                                                                                                                                                | Pace, cadence (steps/min running; crank RPM cycling, needs a sensor), heart rate + zone (1–5), lap splits                                                                                                               | Garmin's own strength-tracking is separate; multisport activities (triathlon) chain segments                                                                                           |
| **Strava**                           | Activity-first (one GPS/sensor-tracked activity per upload)                                                                                                                                                                                                                 | Route/elevation (net + gain), average/max speed, moving vs. total time, power, heart rate (avg/max + time-series), cadence via API                                                                                      | No native strength log; primarily an endurance-sport platform                                                                                                                          |
| **MacroFactor Workouts**             | Strength-first, like Chefer; cardio is not a first-class type yet — the vendor's own guidance is to "create a custom exercise using the Duration and/or Distance metrics" to log cardio manually; basic cardio support was added recently                                   | Duration, distance (as generic custom metrics)                                                                                                                                                                          | Yes, same workout, but visibly a bolt-on rather than a designed type                                                                                                                   |

**Takeaway pattern:** every app that does this well treats cardio as a _different logging shape_, selected per-exercise (not per-workout), that lives in the same session/workout container as strength sets. None of them try to force cardio through the weight×reps set model — which is exactly the gap the owner hit in Chefer. MacroFactor is the instructive negative example: its "type it into a generic Duration/Distance custom field" is the same workaround Chefer users are doing today, and even that vendor is now adding real cardio typing.

---

## 2. Intensity models

| Model                                       | What it captures                                                                                                    | Practical without a wearable?                                                                                                              | Notes                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPE (Borg CR10, 0–10)**                   | Subjective overall exertion — breathlessness, muscle fatigue, effort, in one number                                 | Yes — no equipment needed                                                                                                                  | 0 = nothing at all, 10 = maximal. This is the scale Chefer already uses for strength (RIR is its inverse-adjacent cousin), so it is the natural default for cardio too — one mental model across the whole gym module.                                         |
| **Talk test**                               | Ventilatory threshold via speech capacity (full sentences → phrases → single words)                                 | Yes                                                                                                                                        | Validated against lab gas-exchange testing at >90% agreement with ventilatory threshold; maps cleanly to a 3-band "easy / moderate / hard" UI without asking the user to think in numbers at all.                                                              |
| **Heart-rate zones (%HRmax, Karvonen/HRR)** | Objective physiological load, banded into Z1–Z5                                                                     | No — needs a chest strap, watch, or the phone's own HR sensor                                                                              | Karvonen (Heart Rate Reserve): `target HR = ((HRmax − HRrest) × %intensity) + HRrest`, more personalized than plain %HRmax because it accounts for resting HR. Only usable if Chefer later ingests wearable data (HealthKit / Health Connect); not a v1 input. |
| **METs / machine "levels"**                 | Standardized energy cost per activity, from the compendium, or an arbitrary 1–20 resistance dial on cardio machines | Partially — METs are looked up per activity, not measured; machine "level" is whatever the equipment shows, not standardized across brands | Good for calorie estimation (§3), not something a user "reports" during a set.                                                                                                                                                                                 |

**Recommendation for a wearable-less v1:** RPE 1–10 as the primary intensity input (reuses Chefer's existing RIR/RPE UI patterns and vocabulary), with the talk test's three plain-language bands ("Easy — can talk normally," "Moderate — can talk in short sentences," "Hard — can barely talk") as the _label_ shown next to the RPE picker, matching how RPE-training tools bucket Z1–Z3 conversationally. HR zones become a _progressive enhancement_ once/if wearable sync exists — additive, not a blocker.

---

## 3. Calorie estimation

**Formula:** `kcal = MET × weight_kg × duration_hours` (the standard compendium convention — 1 MET ≈ 1 kcal/kg/hour, calibrated on a reference 70 kg individual).

**Accuracy caveats (be upfront about these in-product):**

- MET-based estimates carry roughly **±15–25% individual error** — body composition, fitness level, terrain, and environment all shift the true number away from the population average the MET was calibrated on.
- METs are group averages from lab studies, not measurements of _this_ user's effort; the 2024 Adult Compendium of Physical Activities (Herrmann et al., _J Sport Health Sci_ 2024) is the current authoritative source — 1,114 activities, MET values re-measured/updated for adults 19–59.
- Any calorie number Chefer shows should be framed as an **estimate for planning purposes**, not a precise count — the same caveat the compendium's own authors give.

**Feeding cardio burn into "food that follows training" responsibly:**

- Chefer already frames nutrition around training days (higher-carb/higher-calorie on lifting days). Cardio burn can extend that same wellness framing: a completed cardio session nudges the day's target modestly (e.g., "add ~150–250 kcal, mostly carbs, to refuel today's cardio" — never a precise micromanaged number), the same way a training day already nudges macros.
- Guardrails: (1) label it clearly as an estimate ("about," a range, not a single decimal-precision number), (2) cap how much a single cardio session can move the day's target so a bad MET estimate can't cascade into an extreme recommendation, (3) never claim medical/clinical accuracy, weight-loss guarantees, or "calories burned = calories you can eat" as a hard equivalence — that crosses from wellness framing into a health claim Chefer isn't positioned to make. (4) Make the nudge opt-in/visible, not a silent invisible adjustment, so it's inspectable like the rest of Chefer's "explainable" system.

---

## 4. Progression for cardio

Chefer's strength engine (`packages/utils/src/gym/progression.ts`) already follows a deterministic, explainable "next time do X" rule keyed off RIR/reps. The cardio equivalent should use the same philosophy — a small, transparent rule, not an adaptive black box — applied to whichever of **duration, distance, or intensity (pace/RPE)** the exercise tracks:

- **General endurance guidance:** the widely cited **10% rule** — increase weekly duration/distance/intensity by no more than ~10% per week — is the standard non-controversial ceiling for injury-safe endurance progression.
- **A Chefer-shaped deterministic rule**, mirroring the strength engine's "last session's actual vs. target → next target" logic:
  - If the user **hit or beat** last session's target duration/distance at the **same or easier** RPE → next time: **+5–10% duration or distance**, same target RPE (progress volume first, the same "add reps before adding weight" bias the strength engine already uses).
  - If the user hit the target duration but **RPE came in higher** than the target band → hold duration, do not add intensity (mirrors the strength engine's stall/deload logic).
  - If the user fell short of the duration/distance target → repeat the same target next time (no regression by default, matching how the strength engine treats a missed session).
  - Every few sessions at a stable RPE, offer an **intensity step** (pace target, incline, or resistance level) instead of another duration increase — same "vary the dimension you progress" idea used for hypertrophy vs. strength rep ranges.
- This keeps cardio "Next time" suggestions exactly as inspectable as strength ones: one primary dimension progresses at a time, with a plain-language reason, no hidden ML.

---

## 5. Recommended data model for Chefer

**Principle: additive only.** Nothing below renames or removes an existing field — old app binaries (per `CLAUDE.md`'s platform-parity rule: "Never break shipped mobile clients") must keep working against the same API contract; new fields are optional and simply ignored by clients that don't know about them yet.

### 5.1 New `Exercise.trackingType` enum

```
enum ExerciseTrackingType {
  WEIGHT_REPS        // existing model: weightKg × reps (barbell squat, etc.)
  BODYWEIGHT_REPS     // existing "loadType: BODYWEIGHT" case, reps only
  DURATION            // time only (plank-style, but now first-class — folds in isTimed)
  DURATION_DISTANCE   // time + distance (treadmill run, outdoor cycle, row for distance)
  DISTANCE            // distance only, self-paced (some outdoor logging flows)
  INTERVALS           // repeated work/rest segments (HIIT circuits, bike intervals)
}
```

Add `trackingType` as a **nullable/defaulted** column on `Exercise`, backfilled to `WEIGHT_REPS` (or `DURATION` for existing `isTimed = true` rows) in a migration. `isTimed` can stay as-is for one release (derived from `trackingType` for old clients) and be formally retired later — never removed while old binaries might read it.

### 5.2 New per-set/segment fields on `SessionSet`

All new columns, all optional, all ignored by clients that predate them:

| Field             | Type                                                                                | Used by                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `durationSec`     | `Int?`                                                                              | DURATION, DURATION_DISTANCE, INTERVALS                                                                         |
| `distanceM`       | `Float?` (store metric internally; convert for display, same as `WeightUnit` today) | DURATION_DISTANCE, DISTANCE                                                                                    |
| `intensityRpe`    | `Int? (0–10)`                                                                       | any cardio type — the wearable-less intensity input from §2                                                    |
| `avgHeartRateBpm` | `Int?`                                                                              | additive slot for future wearable sync — write-only from a sync integration, never required from manual entry  |
| `resistanceLevel` | `Int?`                                                                              | machine-based cardio (bike/elliptical resistance dial), free text avoided in favor of an int so it's chartable |
| `inclinePct`      | `Float?`                                                                            | treadmill/incline walk                                                                                         |
| `caloriesKcal`    | `Float?`                                                                            | computed (§3) or synced; always labeled as an estimate in the UI                                               |

`weightKg`/`reps` stay exactly as they are — a `WEIGHT_REPS` set just doesn't populate the new columns, and a `DURATION_DISTANCE` set doesn't populate `weightKg`/`reps`. `INTERVALS` reuses `SessionSet.position` as the segment index (interval 1, 2, 3…) with each row's own `durationSec` + `intensityRpe`, so "3 rounds of 30s hard / 90s easy" is just 6 `SessionSet` rows alternating intensity — no new table needed.

### 5.3 New equipment values

`ExerciseEquipment` needs cardio-specific members — today's enum (`BARBELL/DUMBBELL/CABLE/MACHINE/BODYWEIGHT/SMITH/EZ_BAR/KETTLEBELL/BAND/ASSISTED`) has no honest bucket for a treadmill or a bike. Proposed additive members, matching the existing all-caps single/compound-word style:

```
TREADMILL, BIKE, ROWER, ELLIPTICAL, STAIR_CLIMBER, SKI_ERG, ASSAULT_BIKE, JUMP_ROPE, POOL, OUTDOOR
```

(`MACHINE` stays for strength machines; a treadmill is not a "machine" in the strength sense and grouping it there would break equipment-based filtering/theming already built around the existing enum.)

### 5.4 Units

Chefer already has a per-user `WeightUnit` (`KG | LB`) on `GymProfile`. Distance needs the equivalent: extend `GymProfile` additively with a `distanceUnit: DistanceUnit` (`KM | MI`), same pattern as `unit: WeightUnit` — store canonical metric internally (`distanceM`), convert for display only, exactly how `weightKg` is stored canonical and converted for LB users today.

### 5.5 Backward compatibility summary

- New enum values and new nullable columns only — no renames, no removals, no NOT NULL additions to existing rows.
- Old clients that don't understand `trackingType: DURATION_DISTANCE` will still see a `weightKg`/`reps` row shaped exercise if the API keeps serving sensible zero/placeholder values there in the meantime, OR (cleaner) old clients simply don't get the new cardio exercises pushed to them until a min-version gate — matches the "additive/backward-compatible... new procedures" rule already in `CLAUDE.md`'s Platform Parity section.
- `customExerciseInputSchema` gains an optional `trackingType` (defaulting to today's behavior) plus the matching optional distance/intensity fields — this directly fixes the "Indoor bike" bug: a user creating a custom bike exercise picks `DURATION_DISTANCE` and never sees a "sets × 1 s × 15 kg" prompt again.

---

## 6. Proposed cardio catalog (30 exercises)

Checked against the existing catalog's naming style (`packages/types/src/gym/exercise-catalog.ts` — lowercase-hyphen slugs, Title Case names, `[repMin, repMax]`-style tuples, `ex()` builder pattern) and the equipment enum extension in §5.3. MET values are general ranges drawn from the 2024 Adult Compendium of Physical Activities and standard secondary compilations (pacompendium.com, traincalc.com); exact values should be verified per-activity against pacompendium.com before shipping, since effort/incline/pace shift MET substantially within an activity.

| Name                                   | trackingType                   | Default metrics                 | MET range                            | Equipment     | Form/safety cue                                                                               |
| -------------------------------------- | ------------------------------ | ------------------------------- | ------------------------------------ | ------------- | --------------------------------------------------------------------------------------------- |
| Treadmill Walk                         | DURATION_DISTANCE              | time, distance, incline         | 2.8–4.3                              | TREADMILL     | Land midfoot under your hips, don't overstride.                                               |
| Treadmill Incline Walk                 | DURATION_DISTANCE              | time, distance, incline%        | 5–9                                  | TREADMILL     | Hold the rails only for balance, not to take weight off your legs.                            |
| Treadmill Run                          | DURATION_DISTANCE              | time, distance, pace            | 8–13                                 | TREADMILL     | Keep cadence quick and light; let the belt do the pull, don't reach forward.                  |
| Treadmill Interval Run                 | INTERVALS                      | work/rest segments, pace        | 8–14 (avg)                           | TREADMILL     | Set the rest speed before you start — don't fumble the dial mid-sprint.                       |
| Outdoor Walk                           | DURATION_DISTANCE              | time, distance                  | 2.8–4.3                              | OUTDOOR       | Pick even, predictable terrain for pace consistency.                                          |
| Outdoor Run                            | DURATION_DISTANCE              | time, distance, pace            | 6–13                                 | OUTDOOR       | Start conservative; the first outdoor km always feels easier than it is.                      |
| Outdoor Cycle                          | DURATION_DISTANCE              | time, distance, pace            | 4–10                                 | OUTDOOR       | Check brakes and tire pressure before every ride.                                             |
| Stationary Bike (Upright)              | DURATION_DISTANCE              | time, distance, resistance      | 5–8.5                                | BIKE          | Set seat height so your knee has a slight bend at full extension.                             |
| Stationary Bike (Recumbent)            | DURATION_DISTANCE              | time, distance, resistance      | 3.5–7                                | BIKE          | Recline the seat back for lower-back support, not a slouch.                                   |
| Spin Class                             | DURATION                       | time, resistance, RPE           | 6–10                                 | BIKE          | Keep hips still on the saddle even out of the seat.                                           |
| Assault/Air Bike                       | DURATION_DISTANCE or INTERVALS | time, distance/calories, RPE    | 8–16 (effort-dependent)              | ASSAULT_BIKE  | Drive arms and legs together; resistance scales with your own effort, so pace yourself early. |
| Elliptical                             | DURATION_DISTANCE              | time, distance, resistance      | 5–9                                  | ELLIPTICAL    | Keep a tall posture, don't lean on the front rail.                                            |
| Rowing Machine                         | DURATION_DISTANCE              | time, distance (m), pace/500m   | 5–8.5                                | ROWER         | Sequence legs → hips → arms on the drive, reverse on the recovery.                            |
| Rowing Intervals                       | INTERVALS                      | work/rest, pace/500m            | 6–10 (avg)                           | ROWER         | Keep the same stroke length even as splits get faster.                                        |
| Ski Erg                                | DURATION_DISTANCE              | time, distance, pace            | 6–9                                  | SKI_ERG       | Hinge at the hips, drive down with lats, don't just pull with arms.                           |
| Stair Climber                          | DURATION                       | time, level/resistance, RPE     | 8–11                                 | STAIR_CLIMBER | Stand tall — don't lean on the handles, it removes the training effect.                       |
| Jump Rope                              | DURATION                       | time, RPE                       | 8–12                                 | JUMP_ROPE     | Small wrist turns, land softly on the balls of your feet.                                     |
| Jump Rope Intervals                    | INTERVALS                      | work/rest rounds                | 8–12 (avg)                           | JUMP_ROPE     | Reset footing between rounds rather than rushing the first reps.                              |
| Swimming (Freestyle)                   | DURATION_DISTANCE              | time, distance (laps/m)         | 6–10                                 | POOL          | Rotate the whole body, don't just reach with the arm.                                         |
| Swimming (Mixed Strokes)               | DURATION                       | time, RPE                       | 6–10                                 | POOL          | Alternate strokes at wall turns to manage fatigue.                                            |
| Kettlebell Swing Conditioning          | INTERVALS                      | work/rest, reps optional        | 8–10                                 | KETTLEBELL    | Hinge, don't squat — power from the hips, not the arms.                                       |
| Sled Push                              | INTERVALS                      | time or distance per round, RPE | ~8–12 (estimated; not in compendium) | MACHINE       | Keep a low shin angle, drive through the whole foot.                                          |
| Sled Drag (Backward)                   | INTERVALS                      | time or distance per round      | ~6–8 (estimated)                     | MACHINE       | Small controlled steps; keep tension on the strap the whole way.                              |
| Battle Ropes                           | INTERVALS                      | work/rest rounds, RPE           | 8–10                                 | BODYWEIGHT    | Stay in a quarter-squat, drive the waves from the shoulders.                                  |
| Farmer's Carry (Conditioning)          | INTERVALS or DURATION          | time or distance, load optional | 6–8                                  | DUMBBELL      | Brace the core, walk with even, controlled steps.                                             |
| Bodyweight HIIT Circuit                | INTERVALS                      | work/rest rounds, RPE           | 8–12 (avg)                           | BODYWEIGHT    | Scale range of motion before you scale speed when form breaks down.                           |
| Boxing/Kickboxing Cardio               | DURATION or INTERVALS          | time, RPE                       | 7.5–10                               | BODYWEIGHT    | Keep guard hands up between combinations.                                                     |
| Stair Climbing (Outdoor/Stadium)       | DURATION_DISTANCE              | time, flights/steps             | 8–11                                 | OUTDOOR       | Use the rail on the way down, not just up.                                                    |
| Incline Treadmill Ruck (Weighted Walk) | DURATION_DISTANCE              | time, distance, incline, load   | 6–9                                  | TREADMILL     | Keep the pack high and snug against the back, not sagging low.                                |
| Elliptical Intervals                   | INTERVALS                      | work/rest, resistance           | 6–10 (avg)                           | ELLIPTICAL    | Match arm and leg tempo through the transitions, don't let the handles go slack.              |

This is 30 entries, spanning commercial-gym machines, outdoor, home/bodyweight, and interval formats — sized to §6's ~25–35 target. All fit the existing `ex()`-style structural builder plus the new `trackingType`/equipment additions from §5.

---

## 7. UX patterns for fast cardio logging on a phone

- **Timer-driven over manual entry when the activity is happening live.** Hevy, Strong, and Fitbod all let a duration/distance exercise auto-accumulate from a running timer rather than requiring the user to type a number after the fact — matches Chefer's existing rest-timer UX pattern, just repurposed as the primary input instead of a side element.
- **Manual entry as the fallback**, for finished activities (an outdoor run already tracked on a watch, a class that's over) — same two-path model Fitbod uses (live tracking vs. typed-in stats), and the same shape as JEFIT's plain fillable fields (distance, speed, calories, duration) for when there's no sensor at all.
- **Quick presets** ("20 min · moderate", "5 km · easy") cut the field-by-field entry down to one tap, then let the user fine-tune — directly mirrors Fitbod's "Cardio Recommendations" feature, which pre-fills duration for warm-up/cool-down/endurance slots rather than presenting a blank form.
- **RPE/talk-test as a single 3–5 option chip row**, not a bare 0–10 number picker, for users without a wearable — keeps entry to one tap, matching how Chefer already renders RIR as a chip row for strength sets (`RIR_VALUES` in `vocab.ts`), so cardio intensity entry reuses an interaction pattern the user already knows.
- **Sensor sync as progressive enhancement, not a requirement**: Fitbod's Strava partnership and Apple's HealthKit both show the winning pattern is "log manually by default; if a GPS/HR source is connected, pre-fill and let the user just confirm" — never block cardio logging behind requiring a watch.
- **Cardio slotted directly into the same workout flow as strength sets** (add-exercise → pick Cardio or a specific cardio exercise, same picker, different input row shown per `trackingType`) — this is the one thing every competitor above gets right and MacroFactor's "type it into a generic field" approach gets wrong; Chefer should not ship a separate "cardio session" object/screen, it should be the same `WorkoutSession`/`SessionExercise` with a per-exercise input shape switch, per §5.

---

## Sources

- [Exercise Performance Tracking in Library (Weight, Bodyweight, Cardio and Duration Based Exercises) – Hevy Help Centre](https://help.hevyapp.com/hc/en-us/articles/35382889578135-Exercise-Performance-Tracking-in-Library-Weight-Bodyweight-Cardio-and-Duration-Based-Exercises)
- [How to Track Gym and Exercise Performance - Hevy App](https://www.hevyapp.com/features/exercise-performance/)
- [Strong Workout Tracker Gym Log - App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- [I Use This App to Track My Progress at the Gym - MakeUseOf](https://www.makeuseof.com/using-strong-app-to-track-gym-progress/)
- [How Does JEFIT Track Cardio? – Jefit Support](https://support.jefit.com/hc/en-us/articles/202645940-How-Does-JEFIT-Track-Cardio-)
- [JEFIT real-time heart rate & calorie tracking on Apple Watch](https://www.jefit.com/wp/jefit-news-product-updates/newtrack-heart-rate-calories-in-real-time-with-jefit-apple-watch/)
- [Run, Ride, Row And More With Fitbod! – Fitbod](https://fitbod.me/blog/cardio/)
- [Cardio Recommendations – Fitbod Help Center](https://fitbod.zendesk.com/hc/en-us/articles/360006427673-Cardio-Recommendations)
- [Workout types on Apple Watch - Apple Support](https://support.apple.com/en-us/105089)
- [HKWorkoutActivityType | Apple Developer Documentation](https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype)
- [HKWorkout | Apple Developer Documentation](https://developer.apple.com/documentation/healthkit/hkworkout)
- [Build custom workouts with WorkoutKit - WWDC23 - Apple Developer](https://developer.apple.com/videos/play/wwdc2023/10016/)
- [Garmin Forerunner 165 Series Owner's Manual - Data Fields](https://www8.garmin.com/manuals/webhelp/GUID-607F08F6-33FC-40BF-9727-84E54043D82D/EN-US/GUID-73BCE454-042E-420D-96A4-9DBA46626CD4.html)
- [About Heart Rate Zones - Garmin Manuals](https://www8.garmin.com/manuals-apac/webhelp/forerunner245245music/EN-SG/GUID-931BB1F6-0716-4387-9EB0-E6EEDBF5DD09-9894.html)
- [Strava — Wikipedia](https://en.wikipedia.org/wiki/Strava)
- [Pace/Speed | Strava Help Center](https://support.strava.com/en-us/articles/15401806-pace-speed)
- [Heart Rate | Strava Help Center](https://support.strava.com/en-us/articles/15401762-heart-rate)
- [MacroFactor Workouts Quick Start Guide](https://macrofactor.com/welcome-to-macrofactor-workouts/)
- [MacroFactor Workouts - MacroFactor](https://macrofactor.com/workouts/)
- [2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities - PubMed](https://pubmed.ncbi.nlm.nih.gov/38242596/)
- [2024 Adult Compendium of Physical Activities: A third update - ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2095254623001084)
- [Compendium of Physical Activities – pacompendium.com](https://pacompendium.com/)
- [2024 Adult Compendium PDF - pacompendium.com](https://pacompendium.com/wp-content/uploads/2024/03/1_2024-adult-compendium_1_2024.pdf)
- [MET Database: 250+ Activities with Calories & CSV | TrainCalc](https://traincalc.com/met-values)
- [Exercise MET Values: Gym, Strength Training & Fitness Activities | TrainCalc](https://traincalc.com/met-values/exercise)
- [Metabolic equivalent of task — Wikipedia](https://en.wikipedia.org/wiki/Metabolic_equivalent_of_task)
- [Assault Bike Calorie Calculator - Air Bike & Echo Bike | TrainCalc](https://traincalc.com/calculators/calories-burned-assault-bike)
- [Calories to Meters? - Viking Athletics](https://vikingathletics.net/calories-to-meters/)
- [We Tested the SkiErg, Rower, and Assault Bike - Men's Journal](https://www.mensjournal.com/fitness/skierg-vs-rower-vs-assault-bike)
- [Rate of Perceived Exertion (RPE) Scale - Cleveland Clinic](https://my.clevelandclinic.org/health/articles/17450-rated-perceived-exertion-rpe-scale)
- [Rating of perceived exertion — Wikipedia](https://en.wikipedia.org/wiki/Rating_of_perceived_exertion)
- [Borg CR10 Scale: Perceived Exertion Assessment Tool | WeGuide](https://www.weguide.health/instruments/borg-cr10-scale)
- [The Talk Test for Athletes: Master Cardio Intensity Without a Heart Rate Monitor | FitnessRec](https://fitnessrec.com/articles/the-talk-test-for-athletes-master-cardio-intensity-without-a-heart-rate-monitor)
- [Heart Rate Karvonen Formula - Target Heart Rate Calculator - Topend Sports](https://www.topendsports.com/fitness/karvonen-formula.htm)
- [Heart Rate Reserve: Better Zones with the Karvonen Method · TrainingZones](https://trainingzones.app/blog/heart-rate-reserve)
- [Target Heart Rate & Training Zone Calculator (Karvonen) | RPE Training](https://rpetraining.com/workout-intensity)
- [How to Progressively Overload Cardio - Increase Vo2 & Endurance - PumpX](https://pumpx.app/blog/progressive-overload-cardio/)
- [Progressive Overload Example: Practical Plans and 8-Week Templates - Setgraph](https://setgraph.app/ai-blog/progressive-overload-example)
- [Guidelines to progress your physical training over time | HPRC](https://www.hprc-online.org/physical-fitness/training-performance/guidelines-progress-your-physical-training-over-time)
