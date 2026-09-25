# Gym Feature: Programming, Progression and Consistency Research

**Status:** research input for the gym implementation plan · **Date:** 2026-09-24
**Product goal:** help users train consistently and progress week over week, month after month.
**Fixed decisions this document builds on:**

- Routines start from a template (Full Body 3×, Upper/Lower 4×, Push/Pull/Legs 6×, plus a 2× minimum option), picked through three setup questions (days per week, experience, equipment). Users can edit everything.
- Every set is logged as weight + reps. After the **last set of each exercise**, the user can tap one optional RIR chip (0 / 1 / 2 / 3+).
- Progression is **deterministic** (no LLM) and can be explained to the user in **one sentence**.

How to read this: §1 is the spec to implement. §2–§3 give the numbers for the routine editor and the templates. §4–§6 cover product and UX decisions. Wherever the evidence is thin, the document says so.

---

## 1. Progression algorithm spec

### 1.1 Design principles (and why)

1. **Double progression inside a rep range.** Keep the weight until every working set reaches the top of the range, then add the smallest sensible amount of weight. Adding reps and adding load produce similar muscle and strength gains in trained people ([Plotkin et al. 2022, PeerJ](https://peerj.com/articles/14142/)). Hevy Trainer uses this rule publicly ("all prescribed sets at the top of the range, then add weight"), and reviewers praise it because users can check it themselves ([Pocket-Fit comparison](https://www.pocket-fit.app/blog/progressive-overload-app-strong-hevy-fitbod-pocket-fit)). Liftosaur ships the same thing as `dp(weight, minReps, maxReps)` ([Liftoscript docs](https://www.liftosaur.com/doc/liftoscript)).
2. **Reps and weight are the source of truth. RIR only adjusts.** The RIR chip is optional, so the algorithm has to work correctly when it is missing. When the chip is present, it can only (a) speed up a load jump when the set was clearly easy, (b) slow down a jump when the user hit the top of the range at failure and the next jump is big, and (c) drive first-week calibration.
3. **RIR only on the last set is the right choice.** People underestimate how many reps they have left by about 1 rep on average, and they estimate more accurately closer to failure, on later sets and with heavier loads ([Halperin et al. 2022 meta-analysis](https://pubmed.ncbi.nlm.nih.gov/34542869/)). Beginners are less accurate than experienced lifters ([Zourdos et al. 2016](https://pubmed.ncbi.nlm.nih.gov/26049792/)). The last set is where the rating is most reliable.
4. **Hold before cutting, and cut rarely.** A single bad session is noise. Only a pattern leads to a weight reduction. This follows the logic of GZCLP, which changes the rep scheme before cutting load and resets to about 85–90% only after repeated failure ([Liftosaur GZCLP](https://www.liftosaur.com/programs/gzclp)).
5. **Every output carries a reason code.** Each suggestion comes from a fixed set of reasons, and each reason has a one-sentence template (§1.12). Fitbod's biggest criticism is that when the weight changes, the app doesn't say why ([Pocket-Fit](https://www.pocket-fit.app/blog/progressive-overload-app-strong-hevy-fitbod-pocket-fit)). We should do the opposite.

### 1.2 Data the algorithm needs

```ts
type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'assisted' | 'smith';

type ExerciseSlot = {
  // one exercise inside a routine day
  exerciseId: string;
  sets: number; // working sets, 1–6
  repMin: number;
  repMax: number;
  targetRir: number; // 2 for compounds, 1 for isolation (default)
  equipment: Equipment;
  isLowerBodyCompound: boolean; // squat/deadlift/RDL/hip thrust/leg press
  restSec: number;
};

type LoggedSet = { weight: number; reps: number; isWarmup: boolean; completed: boolean };

type ExposureLog = {
  // one exercise inside one finished session
  date: Date;
  slot: ExerciseSlot;
  sets: LoggedSet[];
  lastSetRir: 0 | 1 | 2 | 3 | null; // 3 means "3+"
  wasDeload: boolean;
};

type ProgressionState = {
  // per user × exercise (not per routine day)
  workingWeight: number;
  repTargets: number[]; // one per working set
  missStreak: number; // consecutive exposures with a set below repMin
  stallCount: number; // consecutive exposures without progress
  resetsLast10Weeks: number;
  calibrating: boolean; // true until the calibration exit rule fires
  justIncreased: boolean; // the last change was a load increase
  preBreakWeight?: number; // set when re-entry after a break is active
  lastExposureAt: Date;
};

type EquipmentProfile = {
  // per user, editable in settings
  unit: 'kg' | 'lb';
  barWeight: number; // 20 kg / 45 lb
  platePairs: number[]; // kg: [25,20,15,10,5,2.5,1.25]; lb: [45,35,25,10,5,2.5]
  dumbbells: number[]; // kg default: 2,4,6,8,10,12,14,16,18,20,22.5,25,27.5,30,32.5,…,50
  // lb default: 5,10,12.5?,15,20,25,…,100 (5 lb steps)
  machineStep: number; // 5 kg / 10 lb default; per-exercise override allowed
  cableStep: number; // 2.5 kg / 5 lb default; per-exercise override
  hasDipBelt: boolean;
  microPlates: boolean; // adds 0.5 kg pairs → 1 kg barbell steps
};
```

State is keyed by **exercise, not by routine slot**. If Bench Press appears on two days with the same rep range, both slots share one state. If the rep ranges differ (heavy day 5–8, light day 10–15), key the state by `(exerciseId, repRangeBucket)` so a 12-rep day doesn't pull the weight down on a 6-rep day. This pure function belongs in `@chefer/utils` so web and mobile share it (CLAUDE.md shared-first rule).

### 1.3 Load arithmetic

```ts
// All achievable loads for this equipment, sorted ascending.
function achievable(eq, profile): number[] {
  switch (eq) {
    case 'barbell': case 'smith':
      // bar + 2 × every sum of available plate pairs. Standard sets give every
      // 2.5 kg (or 1 kg with micro plates). Compute by subset-sum over platePairs.
    case 'dumbbell': return profile.dumbbells;
    case 'machine':  return multiplesOf(slot.stepOverride ?? profile.machineStep);
    case 'cable':    return multiplesOf(slot.stepOverride ?? profile.cableStep);
    case 'bodyweight': return [0, 1.25, 2.5, 5, 7.5, …] // extra load on belt/vest; only if hasDipBelt
    case 'assisted': return multiplesOf(profile.machineStep)  // stored as assistance; LESS is harder
  }
}
stepUp(W, n=1)    = the n-th achievable load strictly above W      // for 'assisted': n-th below
roundDown(x)      = largest achievable ≤ x                        // for reductions
roundNearestUp(x, W) = nearest achievable to x, but at least stepUp(W, 1)  // calibration jumps
```

Increment rules, in words:

| Equipment                                              | Standard increment                                                                                                                       | Notes                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barbell, upper body (bench, OHP, row)                  | **+2.5 kg** (+5 lb)                                                                                                                      | +1 kg if the user has micro plates and W ≥ 60 kg                                                                                                                                                                                                      |
| Barbell, lower body (squat, deadlift, RDL, hip thrust) | **+5 kg** while `beginner && progressedLastExposure`, otherwise **+2.5 kg**                                                              | This matches the NSCA guideline that lower-body loads can go up faster than upper-body loads ([NSCA 2-for-2 rule summary](https://www.ptpioneer.com/personal-training/certifications/nsca-cscs/cscs-chapter-17/)) and GZCLP's bigger lower-body jumps |
| Dumbbells                                              | **next pair in the user's list**                                                                                                         | A jump is often +15–25%, which is why DB exercises get wide rep ranges (8–15 or 12–20) and a first-exposure tolerance (§1.5)                                                                                                                          |
| Machine / cable                                        | **+1 stack step** (default 5 kg / 2.5 kg)                                                                                                | Per-exercise override ("this machine goes up in 7 kg")                                                                                                                                                                                                |
| Bodyweight (pull-up, dip, push-up)                     | reps first; at the top of the range → **+2.5 kg on a belt** if `hasDipBelt`, else **add a set** (up to 5) and suggest a harder variation | We never invent load the user can't add                                                                                                                                                                                                               |
| Assisted machine                                       | reps first; at the top → **one stack step less assistance**                                                                              | Stored as assistance; the explanation says "less help"                                                                                                                                                                                                |

**Safety cap:** a normal load increase is never more than `max(one step, 10% of W)`. Calibration jumps are the only exception (§1.7).

### 1.4 Definitions used below

- `W`: the working weight the user actually used. If they changed the weight across working sets, take the **lowest weight used across all working sets** (conservative), and adopt it as their new baseline.
- `allTop`: every working set has `reps ≥ repMax`.
- `allFloor`: every working set has `reps ≥ repMin`.
- `totalReps`: sum of reps across working sets done at `W`.
- `progressed`: `W > prev.W`, OR (`W == prev.W` AND `totalReps > prev.totalReps`). A higher e1RM counts as a tiebreaker (for example, same total but redistributed toward the heavier sets).
- `rirEff = lastSetRir ?? null`. For e1RM math, treat a missing chip as 0, which assumes the set went to failure and so underestimates. Treat "3+" as 3.

### 1.5 Core decision function (runs when a session is finished)

```ts
function nextPrescription(slot, state, log, profile, now): Suggestion {
  const W = workingWeight(log);
  const reps = log.sets.filter((s) => !s.isWarmup && s.completed).map((s) => s.reps);
  const rir = log.lastSetRir;

  // 0. Special sessions
  if (log.wasDeload) return resumePreDeload(state); // REASON: DELOAD_DONE
  if (reps.length < slot.sets)
    // sets skipped
    return hold(state, 'INCOMPLETE'); // missStreak and stallCount unchanged

  if (state.calibrating) return calibrate(slot, state, log, profile); // §1.7
  if (state.preBreakWeight) return reentry(slot, state, log); // §1.8

  const allTop = reps.every((r) => r >= slot.repMax);
  const allFloor = reps.every((r) => r >= slot.repMin);

  // 1. Top of range on every set → add load
  if (allTop) {
    const jumpPct = stepUp(W) / W - 1;
    if (rir === 0 && jumpPct > 0.075)
      // at failure AND the next jump is big (DBs)
      return hold(state, 'CONSOLIDATE', (targets = all(slot.repMax)));
    const steps = rir !== null && rir >= 3 ? 2 : 1; // clearly easy → double step
    const W2 = capIncrease(stepUp(W, steps), W); // ≤ max(1 step, 10%)
    return increase(
      W2,
      targetsAfterIncrease(W, W2, reps.at(-1), rir, slot),
      steps === 2 ? 'TOP_EASY_DOUBLE_JUMP' : 'TOP_OF_RANGE',
    );
  }

  // 2. Inside the range on every set
  if (allFloor) {
    // Clearly too light: last set had 3+ in reserve and is at/above the midpoint
    if (rir !== null && rir >= 3 && reps.at(-1) >= mid(slot))
      return increase(
        stepUp(W),
        targetsAfterIncrease(W, stepUp(W), reps.at(-1), rir, slot),
        'EASY_ADD_LOAD',
      );
    return hold(state, 'ADD_REPS', (targets = reps.map((r) => Math.min(slot.repMax, r + 1))));
  }

  // 3. At least one set below repMin
  // First exposure after a load increase: tolerate up to 2 reps under the floor
  if (state.justIncreased && reps.every((r) => r >= slot.repMin - 2))
    return hold(state, 'NEW_WEIGHT_SETTLING', (targets = all(slot.repMin)));
  state.missStreak += 1;
  if (state.missStreak === 1) return hold(state, 'MISSED_ONCE', (targets = all(slot.repMin)));
  // Second consecutive miss → reduce ~10%
  const W2 = Math.min(roundDown(W * 0.9), stepDown(W));
  state.missStreak = 0;
  return decrease(W2, (targets = all(Math.min(slot.repMin + 2, slot.repMax))), 'MISSED_TWICE');
}

// Expected reps after a load increase, keeping effort constant (Epley).
// Bodyweight/assisted exercises skip this and use repMin + 1.
// mid(slot) = ceil((repMin + repMax) / 2)
function targetsAfterIncrease(W, W2, lastReps, rir, slot) {
  const e1rm = W * (1 + (lastReps + (rir ?? 0)) / 30);
  const repsToFailure = Math.floor(30 * (e1rm / W2 - 1));
  const t = clamp(repsToFailure - slot.targetRir, slot.repMin, slot.repMax - 1);
  return all(t);
}
```

After every exposure, update the counters:

```ts
state.stallCount = progressed ? 0 : state.stallCount + 1;
if (allFloor) state.missStreak = 0;
state.justIncreased = suggestion.kind === 'increase';
```

**Targets are per set; success is judged per exercise.** The UI shows one target per set (for example 11 / 10 / 9) because "beat last time by one rep per set" is concrete. The engine counts progress on the exercise as a whole (`totalReps` went up, or the weight went up), so a session that lands 11 / 9 / 9 still counts as a win. Straight sets (same weight on every working set) are the only v1 scheme. Top set + back-off sets can come later as a variant.

### 1.6 Stall detection, exercise reset and deload

**Exercise-level stall**

- `stallCount ≥ 3` (three exposures in a row without progress, and not already handled by `MISSED_TWICE`) → **reset**: `W2 = roundDown(0.9 × W)`, targets = `repMax − 2`, reason `STALL_RESET`. At 2 exposures a week this is about 1.5 weeks. At 1 exposure a week it is 3 weeks.
- If `resetsLast10Weeks ≥ 2` for the same exercise, don't reset automatically again. Show a **suggestion card** instead: "Bench has stalled twice. Try a variation (Incline DB Press, Machine Press) or a different rep range (6–8 → 10–12)." The user decides. This mirrors GZCLP, which changes the stimulus rather than grinding the same failed scheme ([GZCLP rules](https://www.liftosaur.com/programs/gzclp)).

**Routine-level deload.** Evidence: the international Delphi consensus defines a deload as a planned period of reduced training stress. Coaches typically use them every 4–8 weeks, for about 5–7 days, cutting volume and effort ([Bell et al. 2023 Delphi](https://link.springer.com/article/10.1186/s40798-023-00633-0); [Bell et al. 2024 survey](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10948666/)). One RCT found that a _complete-rest_ deload week in the middle of a 9-week block slightly hurt lower-body strength and didn't help hypertrophy ([Coleman et al. 2024](https://peerj.com/articles/16777/)). So the deload should reduce training, not stop it.

- **Reactive trigger (all users):** in the last 7 days, **≥ 3 exercises or ≥ 30% of the routine's exercises** (whichever is larger) are in `MISSED_TWICE`, `STALL_RESET`, or two consecutive exposures with falling `totalReps` → offer a deload.
- **Proactive trigger (intermediate only):** after **6 consecutive "goal-met" training weeks**, offer a deload on the next week. Beginners get no scheduled deloads for their first 12 weeks, because they rarely need one and it interrupts habit building.
- **Deload prescription (one week = the next N sessions, where N is the routine's days/week):** same exercises; `sets = ceil(sets / 2)`; `weight = roundDown(0.9 × W)`; target reps = `repMin`; hint "leave 3–4 reps in the tank". Deload sessions **never** update progression state.
- **After the deload:** go back to the exact pre-deload prescription. Don't reset.
- A deload is **offered, never forced**. The user can dismiss it, and there is also a "Take a deload week" action in the routine menu.

### 1.7 First-week calibration (no history)

When the user picks a routine, they can choose between "I know my weights" (enter a working weight per exercise, which skips calibration) and "Help me find them" (the default for beginners).

**Starting guesses** are prefilled and clearly marked "starting guess, change it freely":

| Equipment             | Beginner default                                       | Intermediate default               |
| --------------------- | ------------------------------------------------------ | ---------------------------------- |
| Barbell presses/rows  | empty bar (20 kg / 45 lb)                              | ask for the weight, or bar + 10 kg |
| Barbell squat / RDL   | empty bar                                              | ask, or bar + 20 kg                |
| Dumbbell presses      | 8 kg per hand (upper-middle of list for intermediates) | 14 kg                              |
| Lateral raise / curls | 4 kg / 6 kg                                            | 8 kg / 10 kg                       |
| Goblet squat          | 12 kg                                                  | 20 kg                              |
| Machine / cable       | 2nd–3rd stack plate                                    | 4th–5th stack plate                |
| Bodyweight            | reps only                                              | reps only                          |

We deliberately don't use body-weight × sex × age strength-standard formulas. They are opaque and poorly calibrated for a single person, and Fitbod's early suggestions (for example, absurdly heavy lateral raises) are its most-cited first-week complaint ([dr-muscle Fitbod reddit roundup](https://dr-muscle.com/fitbod-review-reddit/); [Fitbod App Store reviews](https://apps.apple.com/us/app/fitbod-gym-fitness-planner/id1041517543?see-all=reviews&platform=iphone)).

**Calibration rule.** `calibrating = true` for the first exposure, and it stays true while the user reports 3+. It lasts at most 3 exposures. The UI strongly nudges the RIR chip while calibrating (the chip is highlighted and the copy says "Helps us find your weight"):

| Last-set RIR | Reps              | Next weight                                                                                             | Calibration                                             |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 3+           | all sets ≥ repMax | `roundNearestUp(1.20 × W)` (lower-body barbell: ≥ +10 kg; upper barbell: ≥ +5 kg; DB/machine: ≥ 1 step) | stays on                                                |
| 3+           | in range          | `roundNearestUp(1.10 × W)`                                                                              | stays on                                                |
| 2            | ≥ repMin          | `stepUp(W)`                                                                                             | **exits**                                               |
| 1            | ≥ repMin          | normal §1.5 rules                                                                                       | **exits**                                               |
| 0            | ≥ repMin          | hold                                                                                                    | **exits**                                               |
| any          | some set < repMin | `roundDown(0.85 × W)`, targets = repMin + 2                                                             | stays on (one more try)                                 |
| not given    | —                 | normal §1.5 rules                                                                                       | exits after exposure 1 (without RIR we can't calibrate) |

**Beginners vs intermediates.** Beginners start light on purpose. Technique practice and avoiding soreness in week one matter more than finding the "right" weight in one session. At +10–20% per session they typically land in the right zone within 2–3 sessions, and the +5 kg lower-body step keeps early progress fast afterwards. Intermediates skip calibration with known weights. If they calibrate, the same table applies, but their defaults start higher.

### 1.8 Missed sessions and long breaks (detraining re-entry)

Evidence: in adults under about 65, strength losses are trivial for roughly the first **3–4 weeks** without training and speed up after that. Older adults lose strength about twice as fast. Regaining lost strength takes roughly **half as long** as the time spent detraining ([Stronger By Science detraining guide](https://www.strongerbyscience.com/detraining/)). Trained people who took 3-week breaks every 6 weeks ended six months with the same strength and size gains as people who trained continuously, because retraining quickly recovered the small losses ([Ogasawara et al., via SBS](https://www.strongerbyscience.com/detraining/)).

Re-entry is decided **per exercise**, based on the days since that exercise was last trained (`gap`):

| Gap (days) | Age < 65                                                           | Age ≥ 65 (if known from the Chefer nutrition profile) |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| ≤ 14       | normal rules                                                       | normal rules                                          |
| 15–28      | **hold**: repeat the last prescription, no increase (`BREAK_HOLD`) | 90%                                                   |
| 29–56      | **90%** of last W, rounded down (`BREAK_REENTRY`)                  | 80%                                                   |
| 57–112     | **80%**                                                            | 70%                                                   |
| > 112      | **70%** and `calibrating = true`                                   | 70% + calibrating                                     |

**Fast track back.** While `preBreakWeight` is set, any exposure where every set reaches its target and last-set RIR is ≥ 2 (or not given with `allTop`) jumps **2 steps** (capped at `preBreakWeight`). Once the weight reaches `preBreakWeight`, clear it and resume normal rules. Explanation: "Welcome back, 70 kg today (about 90% of your last 80 kg). You'll be back in a few sessions."

**Missed sessions within a week don't touch progression.** The routine is a **rotation, not a calendar**. "Next workout" is simply the next day in the sequence, and missed days roll forward. Nothing is marked "failed" (see §4).

### 1.9 Warm-up set generation

Warm-ups are generated automatically. They are collapsible, not counted as volume, and not used in progression. Evidence: the heavier warm-up set does most of the work. One lighter set plus one heavier set (about 50–85% of the working weight) is enough, and a heavy warm-up (about 80% × 5) improved subsequent performance more than light ones ([SBS: warm-ups](https://www.strongerbyscience.com/warm-up/); [SBS: heavier warm-ups](https://www.strongerbyscience.com/heavier-warm-ups/)).

```ts
function warmups(slot, W, isFirstExerciseForThisMovement, profile): Set[] {
  if (!['barbell', 'smith', 'machine', 'dumbbell'].includes(slot.equipment)) return [];
  if (!isFirstExerciseForThisMovement)
    // later exercises for the same muscles
    return W >= 40 ? [{ pct: 0.6, reps: 6 }] : []; // one feeler set
  const ramp = [];
  if (slot.equipment === 'barbell' && W >= 40) ramp.push({ load: profile.barWeight, reps: 10 });
  ramp.push({ pct: 0.5, reps: 8 });
  ramp.push({ pct: 0.7, reps: 5 });
  if (W >= 80 || slot.repMax <= 6) ramp.push({ pct: 0.85, reps: 2 });
  // round each to achievable loads (nearest); drop sets within one step of the previous one
  // or of W; drop sets lighter than the empty bar
  return dedupe(ramp.map(roundToAchievable));
}
```

Example: bench at W = 80 kg → 20×10, 40×8, 55×5 (70% = 56 → 55), 67.5×2 (85% = 68 → 67.5).

### 1.10 Estimated 1RM for trend charts

- **Formula: Epley**, `e1RM = w × (1 + r/30)`, with `e1RM = w` when `r = 1`.
- **When the RIR chip is present** on that set, use `r + RIR` (3+ counts as 3), which is the RIR-adjusted form. On sets without a chip, use `r`, which is conservative.
- **Valid range: 1–10 reps.** Sets with 11–12 reps are shown as a faded, low-confidence point. Sets with more than 12 reps are **excluded** from e1RM (they still count for rep PRs and volume). LeSuer et al. found every common equation is reasonably accurate at ≤ 10 reps and drifts beyond that ([LeSuer 1997](https://journals.lww.com/nsca-jscr/abstract/1997/11000/the_accuracy_of_prediction_equations_for.1.aspx)).
- **Why Epley over Brzycki:** they give identical results at 10 reps. Below 10, Epley reads slightly higher (5 reps: ×1.167 vs ×1.125). Above 10, Brzycki grows much faster and breaks down entirely near 37 reps (20 reps: ×2.12 vs ×1.67). Epley is linear, easy to explain, and behaves well at the edges. In LeSuer's data, Epley applied to 3RM loads was among the most accurate pairings. A 2026 preprint fitted on 300k app sets proposes a weight-dependent equation that beats both ([arXiv 2603.17495](https://arxiv.org/abs/2603.17495)). That's worth revisiting once it's peer-reviewed, but not for v1.
- **Chart value per session** = the best working-set e1RM for that exercise. Draw a line for the raw points plus a rolling-max trend over the last 3 sessions. Never draw e1RM from warm-up sets.

### 1.11 Worked examples (these become unit tests)

Defaults: barbell step 2.5 kg, DB list `…8, 10, 12, 14, 16…`, machine step 5 kg, targetRir 2 (compound) / 1 (isolation).

| #   | Exercise & range                                | Input (last exposure; prior state)                        | Suggestion                             | One-sentence explanation shown to user                                                        |
| --- | ----------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Bench 3×8–12 (barbell)                          | 60 kg × 12, 12, 12 · RIR 2                                | **62.5 kg**, aim 10 / 10 / 10          | "You hit 12 on every set, so +2.5 kg today. Aim for 10 reps."                                 |
| 2   | Bench 3×8–12                                    | 60 kg × 12, 12, 12 · no RIR                               | **62.5 kg**, aim 8 / 8 / 8             | "You hit 12 on every set, so +2.5 kg today. Aim for 8+ reps."                                 |
| 3   | Bench 3×8–12                                    | 60 kg × 10, 9, 8 · RIR 1                                  | **60 kg**, aim 11 / 10 / 9             | "Same weight. Beat last time by one rep per set."                                             |
| 4   | Back squat 3×6–8                                | 80 kg × 8, 8, 8 · RIR 3+                                  | **85 kg** (2 steps), aim 6             | "8 reps on every set with 3+ left in the tank, so we're jumping 5 kg."                        |
| 5   | Lateral raise 3×12–20 (DB)                      | 8 kg × 20, 20, 20 · RIR 1                                 | **10 kg**, aim 12 (10+ accepted)       | "Top of the range, so up to the 10 kg pair. It's a big jump, so 10+ reps is a win."           |
| 6   | Lateral raise 3×12–20 (DB)                      | 8 kg × 20, 20, 20 · RIR 0                                 | **8 kg**, aim 20 / 20 / 20             | "You maxed out at failure, so lock in 20s once more before the 10 kg jump."                   |
| 7   | Seated leg curl 3×10–15 (machine)               | 40 kg × 14, 13, 13 · RIR 3+                               | **45 kg**, aim 10                      | "Your last set had 3+ reps left, so we're adding one plate."                                  |
| 8   | Row 3×8–12 (barbell)                            | 70 kg × 8, 7, 6 · missStreak 0                            | **70 kg**, aim 8 / 8 / 8               | "Tough day, so same weight. Get 8 on every set."                                              |
| 9   | Row 3×8–12                                      | 70 kg × 8, 7, 7 · missStreak 1                            | **62.5 kg**, aim 10                    | "Two sessions under 8 reps, so dropping to 62.5 kg to build back up."                         |
| 10  | Bench 3×8–12                                    | first session at 62.5 kg after an increase: 8, 7, 6       | **62.5 kg**, aim 8                     | "New weight takes a session to settle. Same again, aim for 8s."                               |
| 11  | Leg press 3×10–15 (machine)                     | 140 kg, totals 36 → 36 → 35 over 3 exposures, no set < 10 | **125 kg**, aim 13                     | "No progress in 3 sessions, so resetting to 125 kg to build momentum."                        |
| 12  | Bench 3×8–12                                    | 5 weeks since last bench at 80 kg                         | **70 kg** (0.9 × 80 = 72 → round down) | "Welcome back, 70 kg today (about 90% of your last 80). You'll be back up in a few sessions." |
| 13  | Goblet squat 3×8–12 (DB), calibrating, beginner | 12 kg × 12, 12, 12 · RIR 3+                               | **14 kg**, aim 8, still calibrating    | "That looked easy, so trying 14 kg to find your working weight."                              |
| 14  | Pull-up 3×5–10 (bodyweight, no belt)            | BW × 10, 10, 10 · RIR 1                                   | **4 × 10** (add a set)                 | "Top of the range, so add a 4th set. A dip belt would let you add weight instead."            |
| 15  | Assisted pull-up 3×6–10                         | 30 kg assist × 10, 10, 10                                 | **25 kg assist**, aim 7                | "Top of the range, so less help today: 25 kg of assistance."                                  |
| 16  | Any                                             | only 2 of 3 working sets logged                           | unchanged                              | "You skipped a set, so same targets next time."                                               |
| 17  | Bench, in deload week                           | deload week: 55 kg × 2 sets × 8 (0.9 × 62.5 → 55)         | then **62.5 kg**, previous targets     | "Deload done, so back to 62.5 kg where you left off."                                         |

(Examples 1, 4, 5 and 7 were checked numerically: e1RM 88 / 109 / 13.6 / 61 → targets 10 / 6 / 12 / 10; #13 → 8 via `targetsAfterIncrease`.)

### 1.12 Reason codes → explanation templates

`TOP_OF_RANGE`, `TOP_EASY_DOUBLE_JUMP`, `EASY_ADD_LOAD`, `ADD_REPS`, `CONSOLIDATE`, `NEW_WEIGHT_SETTLING`, `MISSED_ONCE`, `MISSED_TWICE`, `STALL_RESET`, `STALL_SUGGEST_SWAP`, `INCOMPLETE`, `DELOAD`, `DELOAD_DONE`, `BREAK_HOLD`, `BREAK_REENTRY`, `BREAK_FAST_TRACK`, `CALIBRATING_UP`, `CALIBRATING_DOWN`, `BW_ADD_SET`, `BW_ADD_LOAD`, `ASSIST_DOWN`.

Each code maps to one localized template with slots (`{delta}`, `{weight}`, `{reps}`). The code, the inputs and the output are stored with the suggestion so a "Why?" tap can show the numbers ("Last time: 60 × 12 / 12 / 12, RIR 2 → rule: all sets at the top of 8–12").

**User overrides are always allowed and are always respected.** If the user logs a different weight than suggested, the next suggestion is computed from what they actually lifted.

---

## 2. Volume and frequency guidance

### 2.1 What the evidence supports

| Variable                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Chefer default                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Weekly hard sets per muscle** | Clear dose-response: more sets → more growth, with diminishing returns ([Schoenfeld et al. 2017](https://pubmed.ncbi.nlm.nih.gov/27433992/): 10+ sets/week beat <5). The largest meta-regression so far (67 studies, 2,058 participants) confirms that hypertrophy keeps rising with volume with gently diminishing returns, while **strength plateaus much sooner** ([Pelland et al. 2025, Sports Med](https://pubmed.ncbi.nlm.nih.gov/41343037/); [preprint](https://sportrxiv.org/index.php/server/preprint/view/460)). Around 20 sets/week is roughly where returns diminish sharply for the average trained lifter ([SBS on Baz-Valle 2022](https://www.strongerbyscience.com/research-spotlight-volume-returns/)). | Aim for **10–20 fractional sets per muscle per week** for intermediates and **6–12** for beginners   |
| **How to count sets**           | Counting indirect sets as **half a set** (for example, bench press = 1 chest + 0.5 triceps) predicted growth best ([Pelland et al.](https://pubmed.ncbi.nlm.nih.gov/41343037/); [SBS](https://www.strongerbyscience.com/the-new-approach-to-training-volume/))                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The editor uses **fractional sets**                                                                  |
| **Per-session volume**          | Beyond about **11 fractional sets per muscle in one session**, extra sets add undetectable benefit ([Remmert/Pelland et al. per-session meta-regression, preprint](https://sportrxiv.org/index.php/server/preprint/view/537))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Warn above 11 per muscle per session                                                                 |
| **Frequency**                   | ≥ 2×/week beats 1×/week ([Schoenfeld et al. 2016](https://link.springer.com/article/10.1007/s40279-016-0543-8)). When volume is equal, frequency matters little for hypertrophy but helps strength ([Schoenfeld 2019](https://pubmed.ncbi.nlm.nih.gov/30558493/); [Pelland et al.](https://biolayne.com/reps/issue-31/the-king-of-volume-metas/)). The practical reason to spread volume is the per-session ceiling above                                                                                                                                                                                                                                                                                                | **2×/week per major muscle** in every template                                                       |
| **Rep ranges**                  | Similar hypertrophy across roughly 5–30 reps _if sets are taken close to failure_. Heavier loads are better for 1RM strength ([Schoenfeld et al. 2021](https://pubmed.ncbi.nlm.nih.gov/33671664/))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Compounds 6–10, machine/DB compounds 8–12, isolation 10–15 or 12–20                                  |
| **Proximity to failure**        | Hypertrophy increases as sets get closer to failure, with a flattening slope. Strength is largely insensitive to RIR ([Robinson et al. 2024](https://pubmed.ncbi.nlm.nih.gov/38970765/)). Failure's edge over non-failure is small ([Refalo et al. 2023](https://pubmed.ncbi.nlm.nih.gov/36334240/)). Adding a set usually matters more than going from 3 RIR to 0                                                                                                                                                                                                                                                                                                                                                       | Target **1–3 RIR** on compounds, **0–2** on isolation; failure is never required                     |
| **Rest**                        | Rest > 60 s gives a small hypertrophy benefit. No detectable difference beyond about 90 s; lower body may benefit from about 2 min ([Singer et al. 2024](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full))                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Rest timer defaults: **heavy barbell compound 180 s**, other compounds **120 s**, isolation **90 s** |
| **Maintenance**                 | About **6 sets/week** maintains muscle when trained ≥ 2× ([RP](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth)). Strength and size can be kept on very small doses ([SBS detraining](https://www.strongerbyscience.com/detraining/))                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Used for the "travel / busy week" mode                                                               |

### 2.2 Volume landmarks per muscle (RP-style, with honest caveats)

The MV / MEV / MAV / MRV framework comes from Renaissance Periodization. RP itself calls the numbers **starting points, not gospel** ([RP](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth)). The per-muscle values are coaching heuristics, not measured thresholds. No study has measured "MEV for side delts". Individual variation is large, and the ranges assume trained lifters. The table below is a consensus of RP-derived tables ([Arvo](https://arvo.guru/tools/volume-calculator), [The Strength Equation](https://thestrengthequation.com/post/volume-landmarks.html)), rounded, and translated into **fractional** sets (compounds already count toward the small muscles).

| Muscle                   | Maintenance            | "Grows for most" floor | Productive range | Warn above |
| ------------------------ | ---------------------- | ---------------------- | ---------------- | ---------- |
| Chest                    | 4                      | 8                      | 10–20            | 22         |
| Back (lats + upper back) | 6                      | 10                     | 12–22            | 25         |
| Quads                    | 6                      | 8                      | 10–18            | 20         |
| Hamstrings               | 4                      | 6                      | 8–16             | 18         |
| Glutes                   | 0 (compounds cover it) | 4                      | 6–16             | 20         |
| Side delts               | 4                      | 6                      | 8–20             | 25         |
| Rear delts               | 0 (rows cover it)      | 4                      | 6–16             | 22         |
| Front delts              | 0 (pressing covers it) | 0                      | 0–8 direct       | 12 direct  |
| Biceps                   | 2 (rows cover it)      | 6                      | 8–16             | 20         |
| Triceps                  | 2 (pressing covers it) | 6                      | 8–16             | 20         |
| Calves                   | 4                      | 6                      | 8–16             | 20         |
| Abs                      | 0                      | 0                      | 0–12             | 20         |

For **beginners**, move each "floor" down by about 2. They grow on less, and RP notes that MEV sits close to MV for novices.

### 2.3 Routine-editor validation rules (gentle warnings)

Tone: informational, never blocking, dismissible per rule per routine. Show the rules as a single "Weekly balance" card with per-muscle bars (fractional sets vs. the productive band), plus inline hints.

| Rule                           | Condition                                                                  | Copy (example)                                                                               | Level            |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| V1 Low volume                  | major muscle (chest/back/quads/hams/side delts) fractional sets < floor    | "Chest: 4 sets/week. Most people need about 8–10 to keep growing."                           | info (amber dot) |
| V2 Very low                    | major muscle < maintenance, and the user didn't mark it "not a priority"   | "Hamstrings get no direct work. Add a curl or RDL?"                                          | info             |
| V3 High volume                 | > "warn above"                                                             | "Side delts: 28 sets/week. That's more than most people recover from, so consider trimming." | warning          |
| V4 Session crowding            | > 11 fractional sets for one muscle in one session                         | "Legs day has 14 quad sets. Extra sets past about 11 add little; move some to another day."  | info             |
| V5 Low frequency               | major muscle with ≥ 8 weekly sets trained on only 1 day                    | "All your chest work is on Monday. Splitting it over 2 days tends to work better."           | info             |
| V6 Session length              | > 25 working sets, or estimated duration > 90 min (Σ sets × (40 s + rest)) | "This day is about 105 min. Long sessions get skipped; consider splitting it."               | warning          |
| V7 Narrow rep range            | `repMax − repMin < 2` (any), or < 4 for DB/cable isolation                 | "8–9 is a narrow range. Double progression works best with room, e.g. 8–12."                 | info             |
| V8 Odd rep range               | `repMax > 30`, or isolation `repMin < 5`                                   | "Sets above 30 reps are mostly endurance work."                                              | info             |
| V9 Push/pull balance           | chest + front-delt direct sets > 1.5 × back sets                           | "You press more than you pull. Adding rows helps shoulder balance."                          | info             |
| V10 Short rest                 | compound rest < 60 s                                                       | "Under 60 s rest tends to cost reps on compounds. 2 min is a good default."                  | info             |
| V11 Too many sets per exercise | > 5 working sets of one exercise                                           | "Past about 4–5 sets, a second exercise usually beats more of the same."                     | info             |

---

## 3. Program templates

Conventions:

- `3 × 6–8` = 3 working sets, rep range 6–8. Warm-ups are generated (§1.9).
- Order within a day: the biggest compound first, then secondary compounds, then isolation. Fatigue-sensitive heavy lifts go early.
- Rest defaults follow §2.1. Target RIR is 2 on compounds and 1 on isolation. Beginners' first 4 weeks use RIR 2–3 everywhere.
- **Beginner vs intermediate:** beginners get fewer sets (2–3 per exercise, about 12 sets per session), stable machine/DB-friendly movements (goblet squat, DB bench, leg press, pulldown), wider rep ranges (8–12), and barbell lifts only as swaps. Intermediates get about 3 sets on main lifts, barbell compounds, more exercises and more isolation, and roughly 30–60% more weekly volume.
- Weekly set tables show **direct / fractional** sets (fractional = direct + 0.5 × indirect; presses → triceps, rows/pulldowns → biceps, rows → rear delts, squats/RDL → glutes, hip thrust → hamstrings). "Days" is how many days the muscle gets direct work. Front delts get indirect work from all pressing and are omitted.
- Every exercise has an equipment-based swap list (for example, Chest-Supported Row ↔ Seated Cable Row ↔ DB Row), filtered by the "equipment" setup answer: full gym / dumbbells + bench / home-bodyweight. Swapping keeps the slot's sets and reps. Progression state carries over only if the new exercise is marked as a close variant.

### 3.1 Full Body 2×/week: minimum effective dose

For busy people and for comebacks. Honest framing in the UI: "Enough to build a base and keep what you have. 3 days grows more." Minimal-dose reviews support 2 sessions a week of multi-joint work as a strong start ([Iversen et al. 2021](https://pubmed.ncbi.nlm.nih.gov/34125411/)).

**Beginner** (about 15 sets/session)

| Day A                        |           | Day B                      |           |
| ---------------------------- | --------- | -------------------------- | --------- |
| Goblet Squat                 | 3 × 8–12  | Leg Press                  | 3 × 10–15 |
| Dumbbell Bench Press         | 3 × 8–12  | Machine Chest Press        | 3 × 8–12  |
| Lat Pulldown                 | 3 × 8–12  | Seated Cable Row           | 3 × 8–12  |
| Romanian Deadlift (DB or BB) | 2 × 8–12  | Seated Leg Curl            | 2 × 10–15 |
| Lateral Raise                | 2 × 12–20 | Overhead Triceps Extension | 2 × 10–15 |
| Dumbbell Curl                | 2 × 10–15 | Standing Calf Raise        | 2 × 10–15 |

**Intermediate** (about 17 sets/session): Day A = Back Squat 3×6–8, Bench Press 3×6–8, Chest-Supported Row 3×8–12, Romanian Deadlift 3×6–10, Lateral Raise 3×12–20, Dumbbell Curl 2×10–15. Day B = Leg Press 3×10–15, Incline Dumbbell Press 3×8–12, Lat Pulldown 3×8–12, Seated Leg Curl 3×10–15, Overhead Triceps Extension 2×10–15, Standing Calf Raise 3×10–15.

| Muscle     | Beginner       | Intermediate |
| ---------- | -------------- | ------------ |
| Chest      | 6 / 6 (2 days) | 6 / 6 (2)    |
| Back       | 6 / 6 (2)      | 6 / 6 (2)    |
| Quads      | 6 / 6 (2)      | 6 / 6 (2)    |
| Hamstrings | 4 / 4 (2)      | 6 / 6 (2)    |
| Glutes     | 0 / 4          | 0 / 4.5      |
| Side delts | 2 / 2 (1)      | 3 / 3 (1)    |
| Biceps     | 2 / 5 (1)      | 2 / 5 (1)    |
| Triceps    | 2 / 5 (1)      | 2 / 5 (1)    |
| Calves     | 2 / 2 (1)      | 3 / 3 (1)    |

Deliberately at the low end (6 per major muscle). Validation rule V1 is **suppressed** on this template, and the editor offers "Add a 3rd day" instead.

### 3.2 Full Body 3×/week: default for beginners (and for anyone with 3 days)

**Beginner** (12–13 sets/session)

| Day A                |           | Day B                    |           | Day C               |           |
| -------------------- | --------- | ------------------------ | --------- | ------------------- | --------- |
| Goblet Squat         | 3 × 8–12  | Romanian Deadlift        | 3 × 8–12  | Leg Press           | 3 × 10–15 |
| Dumbbell Bench Press | 3 × 8–12  | Seated DB Shoulder Press | 2 × 8–12  | Machine Chest Press | 3 × 8–12  |
| Lat Pulldown         | 3 × 8–12  | Seated Cable Row         | 3 × 8–12  | Lat Pulldown        | 2 × 8–12  |
| Seated Leg Curl      | 2 × 10–15 | Leg Extension            | 2 × 10–15 | Triceps Pushdown    | 2 × 10–15 |
| Lateral Raise        | 2 × 12–20 | Dumbbell Curl            | 2 × 10–15 | Standing Calf Raise | 2 × 10–15 |

**Intermediate** (17–18 sets/session)

| Day A               |           | Day B                      |           | Day C               |           |
| ------------------- | --------- | -------------------------- | --------- | ------------------- | --------- |
| Back Squat          | 3 × 6–8   | Romanian Deadlift          | 3 × 6–10  | Hack Squat          | 3 × 8–12  |
| Bench Press         | 4 × 6–8   | Incline Dumbbell Press     | 3 × 8–12  | Machine Chest Press | 3 × 8–12  |
| Chest-Supported Row | 3 × 8–12  | Lat Pulldown               | 3 × 8–12  | Seated Cable Row    | 3 × 8–12  |
| Seated Leg Curl     | 3 × 10–15 | Leg Press                  | 3 × 10–15 | Leg Extension       | 2 × 12–15 |
| Lateral Raise       | 3 × 12–20 | Overhead Triceps Extension | 2 × 10–15 | Lying Leg Curl      | 2 × 10–15 |
| Dumbbell Curl       | 2 × 10–15 | Standing Calf Raise        | 3 × 10–15 | Lateral Raise       | 3 × 12–20 |
|                     |           |                            |           | Triceps Pushdown    | 2 × 10–15 |

Strength-focused swap: Machine Chest Press → Overhead Press 3×6–10 on Day C.

| Muscle     | Beginner       | Intermediate |
| ---------- | -------------- | ------------ |
| Chest      | 6 / 6 (2 days) | 10 / 10 (3)  |
| Back       | 8 / 8 (3)      | 9 / 9 (3)    |
| Quads      | 8 / 8 (3)      | 11 / 11 (3)  |
| Hamstrings | 5 / 5 (2)      | 8 / 8 (3)    |
| Glutes     | 0 / 4.5        | 0 / 6        |
| Side delts | 2 / 3 (1)      | 6 / 6 (2)    |
| Biceps     | 2 / 6 (1)      | 2 / 6.5 (1)  |
| Triceps    | 2 / 6 (1)      | 4 / 9 (2)    |
| Calves     | 2 / 2 (1)      | 3 / 3 (1)    |

### 3.3 Upper/Lower 4×/week: default for 4 days

Schedule suggestion: Mon Upper A, Tue Lower A, Thu Upper B, Fri Lower B. It's still a rotation, so any 4 days work.

**Beginner** (11–12 sets/session)

| Upper A              |           | Lower A             |             | Upper B                |           | Lower B             |           |
| -------------------- | --------- | ------------------- | ----------- | ---------------------- | --------- | ------------------- | --------- |
| Dumbbell Bench Press | 3 × 8–12  | Goblet Squat        | 3 × 8–12    | Machine Chest Press    | 3 × 8–12  | Leg Press           | 3 × 10–15 |
| Seated Cable Row     | 3 × 8–12  | Romanian Deadlift   | 3 × 8–12    | Lat Pulldown           | 3 × 8–12  | Hip Thrust          | 2 × 8–12  |
| Lat Pulldown         | 2 × 8–12  | Seated Leg Curl     | 2 × 10–15   | Incline Dumbbell Press | 2 × 8–12  | Leg Extension       | 2 × 12–15 |
| Lateral Raise        | 2 × 12–20 | Standing Calf Raise | 2 × 10–15   | Lateral Raise          | 2 × 12–20 | Seated Leg Curl     | 2 × 10–15 |
| Triceps Pushdown     | 2 × 10–15 | Plank               | 2 × 30–60 s | Dumbbell Curl          | 2 × 10–15 | Standing Calf Raise | 2 × 10–15 |

**Intermediate** (16–18 sets/session)

| Upper A                |           | Lower A             |           | Upper B                      |           | Lower B               |           |
| ---------------------- | --------- | ------------------- | --------- | ---------------------------- | --------- | --------------------- | --------- |
| Bench Press            | 3 × 6–8   | Back Squat          | 3 × 5–8   | Machine Chest Press (or OHP) | 3 × 8–12  | Hack Squat            | 3 × 8–12  |
| Chest-Supported Row    | 3 × 8–12  | Romanian Deadlift   | 3 × 6–10  | Pull-Up (or Lat Pulldown)    | 3 × 6–10  | Hip Thrust            | 3 × 8–12  |
| Lat Pulldown           | 3 × 8–12  | Leg Press           | 2 × 10–15 | Seated Cable Row             | 3 × 8–12  | Bulgarian Split Squat | 2 × 8–12  |
| Incline Dumbbell Press | 2 × 8–12  | Seated Leg Curl     | 3 × 10–15 | Cable Fly                    | 2 × 12–15 | Lying Leg Curl        | 3 × 10–15 |
| Lateral Raise          | 3 × 12–20 | Standing Calf Raise | 3 × 10–15 | Lateral Raise                | 3 × 12–20 | Leg Extension         | 2 × 12–15 |
| Triceps Pushdown       | 2 × 10–15 | Cable Crunch        | 2 × 10–15 | Overhead Triceps Extension   | 2 × 10–15 | Seated Calf Raise     | 3 × 10–15 |
| Dumbbell Curl          | 2 × 10–15 |                     |           | Incline Dumbbell Curl        | 2 × 10–15 | Hanging Knee Raise    | 2 × 10–15 |

| Muscle     | Beginner       | Intermediate |
| ---------- | -------------- | ------------ |
| Chest      | 8 / 8 (2 days) | 10 / 10 (2)  |
| Back       | 8 / 8 (2)      | 12 / 12 (2)  |
| Quads      | 8 / 8 (2)      | 12 / 12 (2)  |
| Hamstrings | 7 / 8 (2)      | 9 / 10.5 (2) |
| Glutes     | 2 / 6.5 (1)    | 5 / 10.5 (1) |
| Side delts | 4 / 4 (2)      | 6 / 6 (2)    |
| Biceps     | 2 / 6 (1)      | 4 / 10 (2)   |
| Triceps    | 2 / 6 (1)      | 4 / 8 (2)    |
| Calves     | 4 / 4 (2)      | 6 / 6 (2)    |
| Abs        | 2 / 2 (1)      | 4 / 4 (2)    |

### 3.4 Push/Pull/Legs 6×/week: intermediate-first

If setup answers are "6 days + beginner", **recommend Upper/Lower 4× (or Full Body 3×) first**, with copy like "6 days is a big jump; most beginners stick better with 3–4." Still allow PPL. The beginner PPL variant keeps each day short (9–11 sets) so the weekly total stays sensible. PPL's advantage is frequency and shorter sessions, not magic. Its risk is adherence: six planned sessions means more chances to "miss". The consistency mechanics in §4 (a weekly goal with slack) matter most here.

**Beginner** (9–11 sets/session)

| Push A                          | Pull A                  | Legs A                      | Push B                       | Pull B                     | Legs B                      |
| ------------------------------- | ----------------------- | --------------------------- | ---------------------------- | -------------------------- | --------------------------- |
| DB Bench Press 3×8–12           | Lat Pulldown 3×8–12     | Goblet Squat 3×8–12         | Machine Chest Press 3×8–12   | Chest-Supported Row 3×8–12 | Leg Press 3×10–15           |
| Seated DB Shoulder Press 2×8–12 | Seated Cable Row 3×8–12 | Romanian Deadlift 3×8–12    | Incline DB Press 2×8–12      | Lat Pulldown 2×8–12        | Hip Thrust 2×8–12           |
| Lateral Raise 2×12–20           | Face Pull 2×12–20       | Seated Leg Curl 2×10–15     | Lateral Raise 2×12–20        | Reverse Pec Deck 2×12–20   | Seated Leg Curl 2×10–15     |
| Triceps Pushdown 2×10–15        | Dumbbell Curl 2×10–15   | Standing Calf Raise 2×10–15 | Overhead Triceps Ext 2×10–15 | Hammer Curl 2×10–15        | Leg Extension 2×12–15       |
|                                 |                         |                             |                              |                            | Standing Calf Raise 2×10–15 |

**Intermediate** (12–16 sets/session)

| Push A                       | Pull A                | Legs A                      | Push B                       | Pull B                     | Legs B                       |
| ---------------------------- | --------------------- | --------------------------- | ---------------------------- | -------------------------- | ---------------------------- |
| Bench Press 3×6–8            | Pull-Up 3×6–10        | Back Squat 3×5–8            | Incline DB Press 3×8–12      | Lat Pulldown 3×8–12        | Hack Squat 3×8–12            |
| Overhead Press 2×6–10        | Barbell Row 3×6–10    | Romanian Deadlift 3×6–10    | Machine Chest Press 3×8–12   | Seated Cable Row 3×8–12    | Hip Thrust 3×8–12            |
| Incline DB Press 2×8–12      | Face Pull 2×12–20     | Leg Extension 2×12–15       | Cable Fly 2×12–15            | Chest-Supported Row 2×8–12 | Lying Leg Curl 3×10–15       |
| Lateral Raise 4×12–20        | Dumbbell Curl 3×10–15 | Seated Leg Curl 3×10–15     | Lateral Raise 4×12–20        | Reverse Pec Deck 2×12–20   | Bulgarian Split Squat 2×8–12 |
| Triceps Pushdown 2×10–15     | Hammer Curl 2×10–15   | Standing Calf Raise 3×10–15 | Overhead Triceps Ext 2×10–15 | Incline DB Curl 2×10–15    | Seated Calf Raise 3×10–15    |
| Overhead Triceps Ext 2×10–15 |                       |                             |                              |                            | Hanging Knee Raise 2×10–15   |

| Muscle     | Beginner       | Intermediate |
| ---------- | -------------- | ------------ |
| Chest      | 8 / 8 (2 days) | 13 / 13 (2)  |
| Back       | 11 / 11 (2)    | 14 / 14 (2)  |
| Quads      | 8 / 8 (2)      | 10 / 10 (2)  |
| Hamstrings | 7 / 8 (2)      | 9 / 10.5 (2) |
| Glutes     | 2 / 6.5 (1)    | 5 / 9.5 (1)  |
| Side delts | 4 / 5 (2)      | 8 / 9 (2)    |
| Rear delts | 4 / 7 (2)      | 4 / 8 (2)    |
| Biceps     | 4 / 9.5 (2)    | 7 / 14 (2)   |
| Triceps    | 4 / 9 (2)      | 6 / 12.5 (2) |
| Calves     | 4 / 4 (2)      | 6 / 6 (2)    |

(Weekly totals: FB2 30/34 · FB3 37/53 · UL4 47/70 · PPL6 58/84 working sets, beginner/intermediate. All counts were computed from the exercise lists with a script, not by hand.)

### 3.5 Template selection from the 3 setup questions

| Days/week | Beginner                                        | Intermediate                                  |
| --------- | ----------------------------------------------- | --------------------------------------------- |
| 2         | Full Body 2× (beginner)                         | Full Body 2× (intermediate)                   |
| 3         | **Full Body 3×** (alt: Upper/Lower 3×, §3.6)    | Full Body 3× (alt: Upper/Lower 3×, §3.6)      |
| 4         | Upper/Lower 4× (beginner)                       | **Upper/Lower 4×**                            |
| 5         | Upper/Lower 4× + optional 5th "weak points" day | Upper/Lower 4× + PPL-style arms/shoulders day |
| 6         | Recommend UL 4× (allow PPL beginner)            | **PPL 6×**                                    |

Equipment answer: **full gym** → as written. **Dumbbells + bench** → swap barbell and machine lifts for DB equivalents (DB bench, DB RDL, goblet/split squat, one-arm DB row, DB pullover in place of pulldown if there's no bar). Widen rep ranges to 8–15 and 12–20, because DB jumps are big. **Bodyweight/home** → push-up variants, inverted rows, pull-ups (or band), split squats, single-leg RDL, with progression by reps → sets → harder variation.

### 3.6 Upper/Lower 3×/week (2 upper + 1 lower): alternative for 3 days

Dogfood feedback (`docs/gym/dogfood-feedback.md` #1): for 3 days/week, offer a 2×-upper + 1×-lower split next to Full Body 3× (which stays the default). **Honest tradeoff:** legs get their whole weekly dose in a single session — 1×/week frequency instead of Full Body 3×'s three touches — in exchange for more chest/back/shoulder/arm volume spread over two focused upper days. Schedule: Upper A (Mon), Lower (Wed), Upper B (Fri), the same weekday pattern as Full Body 3×.

**Beginner** (12 sets/session)

| Upper A              |           | Lower               |           | Upper B                |           |
| -------------------- | --------- | ------------------- | --------- | ---------------------- | --------- |
| Dumbbell Bench Press | 3 × 8–12  | Goblet Squat        | 4 × 8–12  | Machine Chest Press    | 3 × 8–12  |
| Seated Cable Row     | 3 × 8–12  | Romanian Deadlift   | 3 × 8–12  | Lat Pulldown           | 3 × 8–12  |
| Lat Pulldown         | 2 × 8–12  | Seated Leg Curl     | 3 × 10–15 | Incline Dumbbell Press | 2 × 8–12  |
| Lateral Raise        | 2 × 12–20 | Standing Calf Raise | 2 × 10–15 | Lateral Raise          | 2 × 12–20 |
| Triceps Pushdown     | 2 × 10–15 |                     |           | Dumbbell Curl          | 2 × 10–15 |

**Intermediate** (18 sets/session)

| Upper A                |           | Lower               |           | Upper B                    |           |
| ---------------------- | --------- | ------------------- | --------- | -------------------------- | --------- |
| Bench Press            | 3 × 6–8   | Back Squat          | 4 × 5–8   | Machine Chest Press        | 3 × 8–12  |
| Chest-Supported Row    | 3 × 8–12  | Romanian Deadlift   | 3 × 6–10  | Pull-Up                    | 3 × 6–10  |
| Lat Pulldown           | 3 × 8–12  | Leg Extension       | 3 × 10–15 | Seated Cable Row           | 3 × 8–12  |
| Incline Dumbbell Press | 2 × 8–12  | Lying Leg Curl      | 3 × 10–15 | Cable Fly                  | 2 × 12–15 |
| Lateral Raise          | 3 × 12–20 | Standing Calf Raise | 3 × 10–15 | Lateral Raise              | 3 × 12–20 |
| Triceps Pushdown       | 2 × 10–15 | Cable Crunch        | 2 × 10–15 | Overhead Triceps Extension | 2 × 10–15 |
| Dumbbell Curl          | 2 × 10–15 |                     |           | Incline Dumbbell Curl      | 2 × 10–15 |

Weekly fractional sets per muscle (direct / fractional (days trained)), full gym, computed the same way as §3.1–3.4:

| Muscle     | Beginner  | Intermediate |
| ---------- | --------- | ------------ |
| Chest      | 8 / 8 (2) | 10 / 10 (2)  |
| Back       | 8 / 8 (2) | 12 / 12 (2)  |
| Quads      | 4 / 4 (1) | 7 / 7 (1)    |
| Hamstrings | 6 / 6 (1) | 6 / 6 (1)    |
| Glutes     | 0 / 3.5   | 0 / 3.5      |
| Side delts | 4 / 4 (2) | 6 / 6 (2)    |
| Biceps     | 2 / 6 (1) | 4 / 10 (2)   |
| Triceps    | 2 / 6 (1) | 4 / 8 (2)    |
| Calves     | 2 / 2 (1) | 3 / 4.5 (1)  |
| Abs        | 0 / 0     | 2 / 2 (1)    |

Chest, back, side delts, biceps and triceps land in the same productive range as Upper/Lower 4× (§3.3) — the upper days are unchanged in structure, just run twice instead of across four days' worth of splitting. Quads and hamstrings sit below the two-days-a-week floor because they're trained once: the routine editor shows this honestly as an info-level "grows for most" or "below maintenance" hint (never a warning) rather than hiding it. A lifter who wants more leg frequency should pick Full Body 3× or Upper/Lower 4× instead; this template is for someone who values upper-body volume and accepts the leg-frequency tradeoff.

---

## 4. Consistency and habit mechanics

### 4.1 What the research says

- **Self-monitoring works, and recording is the active ingredient.** A meta-analysis of 138 RCTs (about 20k participants) found that prompting people to monitor goal progress improved goal attainment (d ≈ 0.40). The effects were larger when progress was **physically recorded** and when it was **reported or made public** ([Harkin et al. 2016](https://pubmed.ncbi.nlm.nih.gov/26479070/)). Logging sets is already the intervention. Making the log visible (week ring, monthly recap, optional share) strengthens it.
- **Exercise habits take weeks, and frequency matters.** New gym members needed about **4 sessions/week for 6 weeks** to form an exercise habit ([Kaushal & Rhodes 2015](https://pubmed.ncbi.nlm.nih.gov/25851609/)). Habit automaticity took a median of about 66 days (range 18–254), and **missing a single opportunity did not materially affect habit formation** ([Lally et al. 2010](https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674)). The product should say this out loud: one missed session is not a failure.
- **Broken streaks demotivate.** When people's logs show a broken streak, they are less likely to do the behaviour again than when the streak is intact. The effect is weaker when the break is attributed to **external causes** and when the streak can be **repaired** ([Silverman & Barasch 2023, JCR](https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)). This is the "what-the-hell" pattern: after a lapse, people abandon the goal instead of resuming.
- **Goals with slack beat rigid goals.** An "emergency reserve" (a few allowed skips, with a small cost) makes people prefer the goal _and_ persist longer. People mostly try not to use the reserve ([Sharif & Shu 2017, JMR](https://journals.sagepub.com/doi/10.1509/jmr.15.0231)). A follow-up found that reserves also help persistence _after_ a failure ([Sharif & Shu 2019](https://www.sciencedirect.com/science/article/abs/pii/S0749597818304187)).
- **"Don't miss twice" is the single best-evidenced nudge.** In the StepUp megastudy (61,293 gym members, 54 interventions), the top intervention gave a small bonus for **returning after a missed workout**, which raised visits by about 27%. Planning plus reminders also helped ([Milkman et al. 2021, Nature](https://www.nature.com/articles/s41586-021-04128-4); [Penn Today summary](https://penntoday.upenn.edu/news/wharton-study-best-ways-boost-workout-habits)).
- **Competitor precedent:** Hevy uses a **weekly** streak (at least 1 workout per week), lets users backfill a past workout to repair the streak, and shows rest days neutrally on its calendar ([Hevy help: weekly streak](https://help.hevyapp.com/hc/en-us/articles/34467766576279-How-to-Get-Your-Weekly-Streak-Back-in-the-Hevy-App); [calendar & streak](https://help.hevyapp.com/hc/en-us/articles/35380117933207-Track-Your-Workout-Consistency-with-the-Calendar-and-Streak-Features)).

### 4.2 Recommended mechanics for Chefer

1. **Weekly goal, not daily streak.** The goal is the routine's days per week (editable, for example "3 sessions"). **Week ring**: a segmented ring with one segment per planned session, filling as sessions are logged. Rest days never count against the user.
2. **Streak = consecutive weeks where the goal was met.** Primary copy: "7-week streak". A week counts as met at `sessions ≥ goal`.
3. **Emergency reserve ("flex weeks").** Earn **1 flex token per 4 goal-met weeks**, holding at most 2. A week with `≥ 1 session but < goal` automatically spends a token and keeps the streak alive ("Flex week used. Streak safe."). This is slack with a small cost, as in Sharif & Shu.
4. **Planned breaks.** A "Pause" action (vacation, illness, injury; 1–4 weeks) freezes the streak. It doesn't reset it, because the break is external. After a pause, the progression engine applies §1.8 re-entry automatically.
5. **Streak repair.** A user can backfill a missed session for the current or previous week, as Hevy allows. Showing the repair path is what weakens the broken-streak effect.
6. **"Comeback" moment.** The first session after a missed planned session (or after a week under goal) gets a positive, specific celebration: "Back at it. That's the habit that matters." It also shows the "you'll be back to X kg in N sessions" line from §1.8. This is the StepUp "return after a miss" insight, delivered without money.
7. **Reminders tied to a plan.** In setup, the user picks days and an approximate time. We send one reminder at the planned time, and on the day after a missed planned session, one gentle nudge ("Tomorrow works too. Your next workout is Lower A"). Never more than one reminder per day. No guilt copy.
8. **PR celebrations, with restraint.** Live, in-workout badges for **weight PR** (heaviest ever for the exercise), **rep PR** (most reps at this weight or higher) and **e1RM PR**. At most one badge per exercise per session (the highest-ranked) and a session summary of all of them. Beginners set PRs constantly, and ten confetti animations per session become noise.
9. **Monthly recap** (first session of a new month, or on the 1st): sessions vs goal, weeks met, streak, PR count, the 3 biggest e1RM gains (%), total sets per muscle compared with last month, plus a bodyweight/nutrition tie-in (Chefer's differentiator). Shareable image, optional. Public reporting strengthens monitoring effects (Harkin).
10. **Onboarding expectation-setting:** "The first 6–8 weeks build the habit. Aim for your weekly goal; missing one session changes nothing." This is Lally plus Kaushal & Rhodes in plain language.

### 4.3 Anti-patterns to avoid

- **Daily streaks for training.** They punish rest days, which are part of the program, and they create the broken-streak cliff.
- **Red "missed" markers**, crossed-out days, and "You broke your 23-week streak" copy. Show only what was done. Missed planned days just look empty.
- **Resetting progression after a missed week.** Up to about 2 weeks off, progression continues unchanged (§1.8).
- **Loss-framed or nagging notifications** ("Your muscles are shrinking!"), multiple reminders per day, or notifications at unplanned times.
- **Global leaderboards / strength rankings against strangers** as a default. Optional friends-only sharing is fine.
- **Forced deloads or locked plans.** Everything is a suggestion the user can dismiss.
- **Badge inflation** (badges for opening the app, "5 workouts!" medals every week) that dilutes real PRs.
- **Paywalling logging or routine count.** Strong's 3-routine free cap is a recurring reason Reddit users recommend Hevy instead ([Cora roundup of Reddit threads](https://www.corahealth.app/blog/best-workout-tracker-reddit)).

---

## 5. Competitive UX teardown

| App                | In-workout logging pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | How progression is shown                                                                                                                                                                                                                              | Praised                                                                                                                                             | Complained about                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strong**         | Clean set table: # / **PREVIOUS** / kg / reps / ✓. Tapping ✓ **auto-starts the rest timer**. Plate calculator, warm-up calculator, set tags (warm-up, drop, failure), supersets, full Apple Watch app ([App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577); [rest timer help](https://help.strongapp.io/article/231-rest-timer))                                                                                                                                                                                    | **None.** Progression is manual; the "previous" column is the only cue. It "faithfully records months of the same weights" without flagging it ([Pocket-Fit](https://www.pocket-fit.app/blog/progressive-overload-app-strong-hevy-fitbod-pocket-fit)) | Fastest logging; seen as the reference for speed on r/weightroom ([Setgraph roundup](https://setgraph.app/ai-blog/best-workout-tracker-app-reddit)) | Free tier limited to 3 routines; sync and lost-workout bugs in some reviews ([RepReturn](https://repreturn.com/strong-app-review/))                                                                                                                                                                                                                                           |
| **Hevy**           | Same table model: PREVIOUS column (last time overall, or last time _in this routine_), prefilled values, tap the set number to change set type, optional RPE column, auto rest timer per exercise, **live PR notifications**, inline notes, warm-up and plate calculators, supersets with smart scrolling ([track workouts](https://www.hevyapp.com/features/track-workouts/); [settings](https://help.hevyapp.com/hc/en-us/articles/33882110558743-Workout-Settings-Preferences-Timer-Warm-up-calculator-Plate-Calculator-Smart-Superset-Scrolling)) | Hevy Trainer (Pro) uses a published double-progression rule: all sets at the top of the range → load up; a miss → hold or drop ([Sensai comparison](https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod))                                            | Generous free tier; weekly streak with repair; transparent rules                                                                                    | Social feed clutter for some users; progression struggles with advanced periodization; slightly more taps per set than Strong ([Soma review](https://trysoma.app/blog/hevy-app-review/); [Cora](https://www.corahealth.app/blog/best-workout-tracker-reddit))                                                                                                                 |
| **Fitbod**         | Generates each workout from a "muscle recovery" model, equipment and time; prefilled weights and reps                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Opaque. Weights change without an explanation of which condition was met ([Pocket-Fit](https://www.pocket-fit.app/blog/progressive-overload-app-strong-hevy-fitbod-pocket-fit))                                                                       | Hands-off for people who don't want to plan; polished UI                                                                                            | Odd first-session loads; exercises rotate too often to track progress; custom-routine progression is hard; retention drops after the first few workouts ([dr-muscle Reddit roundup](https://dr-muscle.com/fitbod-review-reddit/))                                                                                                                                             |
| **Boostcamp**      | Program-first: the day's prescribed sets and reps, **last week's results shown next to them**, plate calculator, RPE/RIR fields, exercise swap for "this session only" or "going forward" ([Garage Gym Reviews](https://www.garagegymreviews.com/boostcamp-review))                                                                                                                                                                                                                                                                                   | Auto-progression that follows the chosen program's rules (e.g., GZCLP stages)                                                                                                                                                                         | Huge library of real coach programs (GZCLP, Nippard, etc.); free                                                                                    | No exercise demos (hard for beginners); some reports of workouts not registering as complete ([BarBend](https://barbend.com/boostcamp-review/))                                                                                                                                                                                                                               |
| **RP Hypertrophy** | Prescribed weight × reps per set. After exercises it asks for **feedback on pump, soreness, workload and joint pain**; mesocycles of 4–6 weeks with rising volume and falling RIR, then a deload ([RP app page](https://rpstrength.com/pages/hypertrophy-app))                                                                                                                                                                                                                                                                                        | Per-set weight/rep targets; sets added or removed based on feedback                                                                                                                                                                                   | Evidence-branded, structured mesocycles                                                                                                             | Feedback fatigue (users ask to report soreness once, up front); criticism that the algorithm is simple relative to the price; sets can balloon ([App Store reviews](https://apps.apple.com/us/app/rp-hypertrophy/id1555614554?see-all=reviews&platform=iphone); competitor critique, read with bias in mind: [dr-muscle](https://dr-muscle.com/rp-hypertrophy-app-critique/)) |
| **Liftosaur**      | Tracker with programs written in "Liftoscript"; the next workout's weights update automatically after each session ([overview](https://www.liftosaur.com/blog/posts/liftosaur-overview/))                                                                                                                                                                                                                                                                                                                                                             | Explicit rules: `lp`, `dp`, `sum`, with failure-driven decreases ([docs](https://www.liftosaur.com/doc/liftoscript))                                                                                                                                  | Most flexible; free/open source; faithful GZCL and 5/3/1 implementations                                                                            | Power-user oriented; writing scripts is a barrier for casual lifters                                                                                                                                                                                                                                                                                                          |
| **JEFIT**          | Large exercise library with videos; plan builder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basic                                                                                                                                                                                                                                                 | Exercise instruction library                                                                                                                        | Cluttered, dated UI; ads in the free tier; frustrating UI changes ([Garage Gym Reviews](https://www.garagegymreviews.com/best-weightlifting-app); [App Store](https://apps.apple.com/us/app/jefit-workout-plan-gym-tracker/id449810000?see-all=reviews&platform=iphone))                                                                                                      |

Cross-cutting Reddit themes: lifters value **logging speed** above everything (a set should take 2–3 seconds), transparent progression, faithful program implementations, an honest free tier, and good long-term graphs. They dislike social bloat and paywalled basics ([Cora](https://www.corahealth.app/blog/best-workout-tracker-reddit)). Most prefer separate nutrition apps. That means Chefer's gym tab has to be **as fast as Strong on its own terms**. The nutrition integration is a bonus, not a reason to accept slower logging.

### 5.1 Top 12 must-have patterns for Chefer's active-workout screen (ranked)

1. **Prefilled targets per set from the engine, with a "Last time" column.** Each set row shows the suggested weight and reps as editable values, plus last time's actual numbers in muted text. Accepting the suggestion is zero typing.
2. **One-tap set completion.** A big ✓ (≥ 44 px, per the CLAUDE.md touch-target rule) logs the prefilled values. Editing weight or reps is only needed when the user deviates. Use steppers (±2.5 kg / ±1 rep) plus a numeric keypad; no free-text keyboards.
3. **Suggestion banner per exercise, with its one-sentence reason** (§1.12), for example "↑ 2.5 kg: you hit 12 on every set", plus a "Why?" tap showing the inputs. This is the anti-Fitbod.
4. **Rest timer that auto-starts when a set is completed**, with a per-exercise default (§2.1), ±15 s, skip, vibration/sound, and a lock-screen presence (iOS Live Activity / Android ongoing notification on mobile).
5. **RIR chip row after the last set** (0 / 1 / 2 / 3+). It is inline, non-blocking and skippable, and it collapses once answered. It is highlighted during calibration, subtle otherwise.
6. **Crash-proof, offline-first in-progress workout.** Every tap persists locally and the session resumes after the app is killed or the device reboots. Lost workouts are the most damaging complaint in this category.
7. **Plate calculator.** Tap the weight on any barbell exercise to see plates per side, using the user's plate inventory.
8. **Auto warm-up sets** (§1.9), collapsed by default, with their own ✓ but no rest-timer pressure and no volume counting.
9. **In-session flexibility:** swap an exercise (same slot, filtered by equipment; "this session only" vs "from now on"), add or remove a set, reorder, skip an exercise. Skipped exercises don't count as misses.
10. **Sticky per-exercise notes** (seat height, grip, cues) that reappear next time.
11. **Supersets / grouping:** the rest timer starts after the last exercise in the group, and focus auto-advances to the next exercise.
12. **Live PR badge plus a finish summary:** duration, sets, PRs, week-ring progress ("2 of 3 this week"), and next session preview ("Lower A, Thursday").

Honorable mentions for later: Apple Watch / Wear OS logging, a manual per-set RPE column for advanced users, and a "same as last time" bulk accept.

### 5.2 Top 5 patterns to avoid

1. **Opaque, unexplained weight changes** (Fitbod). Every change has a reason code and a sentence.
2. **Questionnaires during the workout** (RP's multi-question feedback after each exercise). One optional chip on the last set is the whole budget.
3. **Rotating exercises automatically** (Fitbod). Progression needs a stable exercise list; variation happens only when the user swaps or accepts a stall suggestion.
4. **Clutter in the logging view:** social feed, ads, upsells, or coach tips popping up mid-set (JEFIT, Hevy's feed complaints). The active-workout screen shows only the workout.
5. **Blocking modals and data traps:** "rate us" or upgrade prompts during a session, workouts that fail to save, or no export. Offer CSV export of the full history from day one.

---

## 6. Progress and stats

### 6.1 Signal: show these

| View                                                                  | What it shows                                                                                                                                     | Why it works                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **e1RM trend per lift** (default: the user's top 3–5 compounds)       | Best working-set e1RM per session (Epley, ≤ 10 reps, RIR-adjusted when available), with a rolling-max trend and PR dots; ranges 3 mo / 1 yr / all | The clearest single "am I getting stronger" line; comparable across rep ranges                                                            |
| **Rep-PR table per exercise** ("best reps at each weight")            | For 60 kg: 12 reps (Mar 3); 62.5 kg: 10 reps …                                                                                                    | Hypertrophy-range lifters progress in reps; e1RM hides some of these wins                                                                 |
| **Weekly sets per muscle** (fractional) vs the productive band (§2.2) | Stacked bars over the last 8–12 weeks, with the band shaded                                                                                       | Directly actionable; the same numbers as the routine editor                                                                               |
| **Consistency calendar**                                              | 52-week grid **by week** (cell = sessions vs goal, colored by goal met / flex / paused), plus the current streak                                  | Reinforces the weekly goal, not daily perfection; pauses are visually neutral                                                             |
| **PR timeline**                                                       | A feed of PRs by date, filterable by exercise                                                                                                     | Long-term motivation; shows momentum months later                                                                                         |
| **Bodyweight overlay** (Chefer differentiator)                        | Bodyweight trend (from Chefer's weight logs) on the same time axis as e1RM; optional **relative strength** (e1RM ÷ BW)                            | During a cut, "strength held while weight dropped" is a real win users otherwise miss; this links the gym and nutrition halves of the app |
| **Monthly recap**                                                     | §4.2 #9                                                                                                                                           | A regular reflection point; shareable                                                                                                     |
| **Per-exercise history**                                              | The raw table of past sessions (date, sets × reps @ weight, RIR)                                                                                  | Lifters check this constantly; it must be one tap from the workout screen                                                                 |

### 6.2 Noise: avoid or demote

- **Total tonnage (volume load) as a headline number.** It rewards high-rep and leg-heavy days, changes when exercises are swapped, and says little about progress. Keep it per exercise, at most, in the detail view.
- **Estimated calories burned from lifting.** Inaccurate. In a nutrition app it risks double counting against TDEE. If shown at all, don't feed it into nutrition targets.
- **"Muscle recovery %" heat maps** (Fitbod-style). False precision from a model users can't verify.
- **e1RM from high-rep sets (> 12) or warm-ups**, and daily e1RM without smoothing. Both are noisy.
- **Workout duration as a goal or score.** Longer is not better.
- **Strength-standard percentiles against other people** as a default. They can motivate some users but demotivate beginners, and the population comparisons are shaky. Offer them only as opt-in.
- **Too many charts.** Default to 3–5 lifts and one muscle-volume chart; everything else is behind "More".

---

## Appendix A: Implementation notes

- Put the progression engine, warm-up generator, e1RM, fractional set counting and validation rules in **`@chefer/utils`** (pure, shared by web and mobile). Put exercise → muscle mapping (primary = 1, secondary = 0.5), equipment type and swap groups in **`@chefer/types`** / seed data.
- The worked-example table (§1.11) is the first test suite. Add property tests: suggested weight is always achievable with the user's equipment; a normal increase never exceeds `max(step, 10%)`; deload sessions never change state; with RIR `null` the output never exceeds the RIR-aware output.
- Store `{ reasonCode, inputs, output, engineVersion }` with every suggestion, so explanations stay stable when the engine changes later. The API should also stay additive for shipped mobile clients (CLAUDE.md platform-parity rule).
- Units: store kg internally at 0.01 precision, and render and round in the user's unit through the equipment profile. Plate lists for lb gyms differ; don't convert kg plates to lb.
