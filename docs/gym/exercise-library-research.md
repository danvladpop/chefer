# Gym Exercise Library — Research

Research backing the curated ~50-exercise gym library: offline-safe photos from **free-exercise-db**, one hand-picked YouTube technique clip per exercise, and short evidence-informed coaching cues. Compiled 2026-09-24.

**Note on process:** the free-exercise-db facts, cue-writing principles, and every exercise's cues/mistakes/rep-range/rest/increment metadata below were researched directly. YouTube candidates were researched by five parallel research passes split by muscle group, then every video ID in this document was **independently re-verified by fetching `https://www.youtube.com/oembed?...` myself** (not just trusted from the research pass) — the title/channel returned by each successful oEmbed call is quoted next to the video. A handful of exercises added after the initial pass (see "Additional catalog entries") did not go through the parallel research and were searched directly; for two of them I could not find a confident match from the preferred channel list and marked them `verified: no` rather than guess.

---

## Part 1 — free-exercise-db facts

**Source:** https://github.com/yuhonas/free-exercise-db (Vue.js frontend + JSON dataset by yuhonas, restructured from https://github.com/wrkout/exercises.json)

- **License:** [The Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md) (confirmed via the GitHub API — `license.spdx_id: "Unlicense"` — and the repo's own README badge). This is a public-domain dedication: "Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means," with no attribution requirement and an "AS IS" / no-warranty disclaimer. As permissive as it gets — safe to bundle these photos + metadata in a commercial app with no attribution obligation (attributing anyway is good practice, not a requirement).
- **Total exercises:** 876 (counted directly from `dist/exercises.json`).
- **Images:** 873 of 876 exercises have exactly 2 images each (1,746 total `.jpg` files, no other format); 3 exercises ship with 0 images. Each pair depicts the start and end position of the movement (files named `0.jpg` and `1.jpg` inside a per-exercise folder).
- **Per-exercise JSON shape** (confirmed against `dist/exercises.json` and `schema.json`):
  ```json
  {
    "id": "Barbell_Bench_Press_-_Medium_Grip",
    "name": "Barbell Bench Press - Medium Grip",
    "force": "push", // "push" | "pull" | "static" | null
    "level": "intermediate", // "beginner" | "intermediate" | "expert"
    "mechanic": "compound", // "compound" | "isolation" | null
    "equipment": "barbell", // "barbell" | "dumbbell" | "cable" | "machine" | "body only" | "kettlebells" | "bands" | "e-z curl bar" | "exercise ball" | "medicine ball" | "foam roll" | "other" | null
    "primaryMuscles": ["chest"],
    "secondaryMuscles": ["shoulders", "triceps"],
    "instructions": ["step 1 text", "step 2 text", "..."],
    "category": "strength", // "strength" | "stretching" | "cardio" | "olympic weightlifting" | "powerlifting" | "strongman" | "plyometrics"
    "images": ["Barbell_Bench_Press_-_Medium_Grip/0.jpg", "Barbell_Bench_Press_-_Medium_Grip/1.jpg"]
  }
  ```
  The dataset's `equipment` vocabulary uses `"body only"` for bodyweight, `"e-z curl bar"` for EZ-bar, and `"kettlebells"` (plural) — our app's normalized vocabulary (`bodyweight`, `ez-bar`, `kettlebell`, etc.) needs a small mapping table, not a 1:1 pass-through.
- **Image URL formation:** the `images` array holds _relative_ paths (`"<Exercise_Id>/0.jpg"`). Per the repo's own README, prefix with `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` to get a directly hosted URL, e.g.:
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg`
  For "offline-safe," don't hot-link `raw.githubusercontent.com` at runtime (it's a git blob server, no CDN/uptime guarantee) — vendor the ~110 images we actually need (55 exercises × 2) into the app bundle/CDN at build time, keyed by the stable `id` string, and keep the upstream URL only as the fetch/attribution source in tooling.
- **Full combined JSON:** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json` (single file, all 876 exercises, ~1 MB). Individual per-exercise JSON also exists at `exercises/<id>.json`.

**Sources:** https://github.com/yuhonas/free-exercise-db · https://github.com/yuhonas/free-exercise-db/blob/main/README.md · https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md · https://github.com/yuhonas/free-exercise-db/blob/main/schema.json · https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json · https://api.github.com/repos/yuhonas/free-exercise-db

---

## Cue-writing principles

1. **Prefer an external focus over an internal one.** Cueing attention to the _effect of the movement in the environment_ (e.g., "push the floor away," "drive the bar into your palms") produces better motor performance and learning than cueing attention to _body parts/muscles_ (e.g., "squeeze your quads"). This is one of the most replicated findings in motor-learning research — Wulf's 15-year review found the effect held across skill levels, ages, and task types. We still write some internally-framed cues ("feel your lats stretch") where that's genuinely how coaches teach a movement's intent, but default external where a natural external cue exists.
2. **One cue at a time.** Stacking multiple instructions (grip, elbow path, breathing, tempo) into one cue overloads working memory mid-set. Each cue below targets one specific fault or focus.
3. **Cue the _feel_, not just the rule.** "Keep your chest up" is a rule; "show your chest to the mirror the whole rep" is a feel. Feel-based cues transfer better to novices under load than dry biomechanical rules.
4. **Make it actionable mid-set.** A good cue is short enough to repeat to yourself between reps — not a paragraph of biomechanics.
5. **Match the cue to the failure mode.** The best cues directly counteract the most common technical breakdown for that lift (e.g., knees caving in a squat → "spread the floor apart with your feet"), which is why every exercise below pairs its cues with a "common mistakes" list.

**Sources:**

- Wulf, G. (2013). _Attentional focus and motor learning: a review of 15 years._ International Review of Sport and Exercise Psychology — https://gwulf.faculty.unlv.edu/wp-content/uploads/2018/11/Wulf_AF_review_2013.pdf
- Chua, L.K. et al. (2021). _Superiority of external attentional focus for motor performance and learning: Systematic reviews and meta-analyses_ — https://pubmed.ncbi.nlm.nih.gov/34843301/
- Wulf, G., McNevin, N., & Shea, C.H. (2001). _The automaticity of complex motor skill learning as a function of attentional focus_ — https://pubmed.ncbi.nlm.nih.gov/11770783/

### Rep range / rest / load-increment conventions used below

- **Hypertrophy rep ranges:** compound lifts 6–10, isolation lifts 10–15 (wider for calves/carries/core), consistent with research showing 6–20 reps all drive growth near failure, with 6–12 @ 60–80% 1RM giving heavy compounds the best fatigue/reward ratio.
- **Rest:** heavy multi-joint compounds 150–180s, other compounds ~120s, isolation 60–90s — research shows 2.5–3 min rest on compound lifts outperforms short rest for hypertrophy, mainly by preserving volume load (reps × load) across sets; isolation work recovers fast enough for shorter rests without losing reps.
- **Load increments:** barbell 2.5 kg/side jump (standard small plates), dumbbell 2 kg **per hand** (typical light-to-moderate fixed-dumbbell rack step), cable/machine stack ~5 kg per pin, EZ-bar 2.5 kg, bodyweight/bodyweight-plus n/a (progress via reps or a 2.5 kg weight-belt step).

**Sources:**

- Schoenfeld, B.J. et al. (2021). _Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance_ — https://www.mdpi.com/2075-4663/9/2/32
- Grgic, J. et al. _Rest interval between sets in resistance training_ — https://pubmed.ncbi.nlm.nih.gov/19691365/
- Schoenfeld, B.J. et al. (2016). _Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men_ — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3215636/

---

## Part 2 — Exercise catalog

Every block below uses this shape:

```
slug / name / aliases
category | pattern
primary / secondary muscles
equipment | loadType
reps | rest
increment | per hand
cues (external-focus, ≤12 words)
mistakes (≤12 words)
why: 1-2 sentence program rationale
free-exercise-db id
youtube: video_id | title | channel | url | start_seconds | verified | notes
```

### Chest

```
slug: barbell-bench-press
name: Barbell Bench Press | aliases: bench press, flat bench, competition bench
category: compound | pattern: horizontal push
primary: chest | secondary: front-delts, triceps
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 180s
increment: 2.5kg (per side, 5kg total) | per hand: no
cues:
  1. Drag the bar down your body, not straight down.
  2. Pull your shoulder blades together and keep them pinned.
  3. Push the bar toward the ceiling above your eyes.
  4. Keep your feet driving into the floor all rep.
mistakes:
  1. Flaring elbows to 90 degrees, hammering the shoulders.
  2. Bouncing the bar off the chest instead of controlling it.
why: The benchmark horizontal press for chest size and pressing strength; belongs in almost every upper-body day.
free-exercise-db id: Barbell_Bench_Press_-_Medium_Grip
youtube: vcBig73ojpE | "How To Get A Huge Bench Press with Perfect Technique" | Jeff Nippard | https://www.youtube.com/watch?v=vcBig73ojpE | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: dumbbell-bench-press
name: Dumbbell Bench Press | aliases: flat DB press
category: compound | pattern: horizontal push
primary: chest | secondary: front-delts, triceps
equipment: dumbbell | loadType: weighted
reps: 8-12 | rest: 150s
increment: 2kg | per hand: yes
cues:
  1. Let the dumbbells travel below the bench for a full stretch.
  2. Drive up and slightly inward, almost touching at the top.
  3. Keep your wrists stacked directly over your elbows.
mistakes:
  1. Letting elbows drop too far and flare, stressing the shoulder.
  2. Losing dumbbell path control, letting them drift forward/back.
why: Free range of motion and independent arms make this a strong hypertrophy alternative or finisher to the barbell press.
free-exercise-db id: Dumbbell_Bench_Press
youtube: YQ2s_Y7g5Qk | "Flat Dumbbell Bench Press" | Renaissance Periodization | https://www.youtube.com/watch?v=YQ2s_Y7g5Qk | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: incline-dumbbell-press
name: Incline Dumbbell Press | aliases: incline DB press, incline press
category: compound | pattern: incline push
primary: chest (upper) | secondary: front-delts, triceps
equipment: dumbbell | loadType: weighted
reps: 6-10 | rest: 150s
increment: 2kg | per hand: yes
cues:
  1. Set the bench to 30-45 degrees, not steeper.
  2. Tuck the dumbbells over your collarbone, elbows under wrists.
  3. Press up and slightly back, toward your eyes.
mistakes:
  1. Setting the incline too steep, turning it into a shoulder press.
  2. Flaring elbows out wide at the bottom, straining the front delt.
why: The best-supported way to bias upper-chest development without turning the lift into a shoulder press.
free-exercise-db id: Incline_Dumbbell_Press
youtube: 5CECBjd7HLQ | "Incline Dumbbell Press" | Renaissance Periodization | https://www.youtube.com/watch?v=5CECBjd7HLQ | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: machine-chest-press
name: Machine Chest Press | aliases: chest press machine, plate-loaded chest press
category: compound | pattern: horizontal push
primary: chest | secondary: front-delts, triceps
equipment: machine | loadType: weighted
reps: 8-12 | rest: 120s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Set the seat so handles line up with mid-chest.
  2. Press forward and squeeze your chest together at lockout.
  3. Control the negative instead of letting the stack drop.
mistakes:
  1. Seat set too high, turning it into a shoulder-dominant press.
  2. Bouncing off the stack between reps instead of pausing.
why: A joint-friendly, easy-to-load option for beginners and for chasing extra volume near the end of a session.
free-exercise-db id: Machine_Bench_Press
youtube: NwzUje3z0qY | "Machine Chest Press" | Renaissance Periodization | https://www.youtube.com/watch?v=NwzUje3z0qY | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: cable-fly
name: Cable Fly / Pec Deck | aliases: cable crossover, pec deck, machine fly
category: isolation | pattern: horizontal adduction
primary: chest | secondary: front-delts
equipment: cable | loadType: weighted
reps: 10-15 | rest: 90s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Keep a slight, fixed bend in the elbows all rep.
  2. Lead with your hands hugging a barrel, not pushing.
  3. Squeeze and hold half a second at full contraction.
mistakes:
  1. Bending the elbows more at the top, turning it into a press.
  2. Using so much weight the shoulders round forward at the stretch.
why: The best isolated chest stretch-and-squeeze movement — cables (or a pec deck) keep tension on the chest at full stretch, which presses lose.
free-exercise-db id: Flat_Bench_Cable_Flyes
youtube: -EIhKMDSjBY | "The Best Way To Isolate The Chest For Growth (Upper Chest Focus)" | Jeff Nippard | https://www.youtube.com/watch?v=-EIhKMDSjBY | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: push-up
name: Push-Up | aliases: press-up
category: compound | pattern: horizontal push
primary: chest | secondary: front-delts, triceps, abs
equipment: bodyweight | loadType: bodyweight-plus
reps: 10-20 (or near-failure) | rest: 90s
increment: n/a (progress via feet-elevation or a weight vest) | per hand: no
cues:
  1. Keep a straight line from head to heels the whole rep.
  2. Spread the floor apart with your hands to engage the chest.
  3. Lower until your chest is a fist's width from the floor.
mistakes:
  1. Letting the hips sag or pike up instead of staying rigid.
  2. Flaring the elbows straight out to the sides.
why: A zero-equipment horizontal push that scales from beginners to advanced — essential for any bodyweight-only day.
free-exercise-db id: Pushups
youtube: 3-yAymzidmE | "How To Add More Reps To Your Pushups FOR SURE" | Renaissance Periodization | https://www.youtube.com/watch?v=3-yAymzidmE | 0 | verified: yes | oEmbed confirmed, but this video is about rep-progression tactics rather than a pure form breakdown — flagged as a weaker match; worth a follow-up search for a dedicated push-up form video before shipping.
```

```
slug: chest-dip
name: Dips (chest-leaning) | aliases: chest dips
category: compound | pattern: vertical/horizontal push
primary: chest | secondary: front-delts, triceps
equipment: bodyweight | loadType: bodyweight-plus
reps: 8-12 | rest: 120s
increment: n/a bodyweight, or 2.5kg on a dip belt | per hand: no
cues:
  1. Lean your torso forward and let your elbows flare slightly.
  2. Lower until your shoulders dip just below your elbows.
  3. Drive back up by pushing the bars down and away.
mistakes:
  1. Staying too upright, shifting load onto the triceps instead.
  2. Dropping too deep, letting the shoulders roll forward at bottom.
why: A forward-lean dip loads the lower chest hard and is easy to add weight to once bodyweight reps get easy.
free-exercise-db id: Dips_-_Chest_Version
youtube: yN6Q1UI_xkE | "How To Do Dips For A Bigger Chest and Shoulders (Fix Mistakes!)" | Jeff Nippard | https://www.youtube.com/watch?v=yN6Q1UI_xkE | 0 | verified: yes | oEmbed confirmed title/channel.
```

### Back

```
slug: pull-up
name: Pull-Up | aliases: strict pull-up
category: compound | pattern: vertical pull
primary: lats | secondary: biceps, upper-back
equipment: bodyweight | loadType: bodyweight-plus
reps: 6-10 (use assistance/added weight to land here) | rest: 150s
increment: n/a bodyweight, or 2.5kg on a dip belt | per hand: no
cues:
  1. Drive your elbows down to your hips, not just up.
  2. Lead the pull with your chest toward the bar.
  3. Get a full stretch at the bottom before pulling again.
mistakes:
  1. Kipping/swinging to cheat the rep instead of pulling strict.
  2. Stopping short of full elbow extension at the bottom.
why: The gold-standard vertical pull for lat width; scales with bands (assisted) or a dip belt (weighted) as strength changes.
free-exercise-db id: Pullups
youtube: Hdc7Mw6BIEE | "The Best Way To Do Pull Ups For A Wide Back (Optimal Training Technique)" | Jeff Nippard | https://www.youtube.com/watch?v=Hdc7Mw6BIEE | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: chin-up
name: Chin-Up | aliases: underhand pull-up
category: compound | pattern: vertical pull
primary: lats | secondary: biceps, forearms
equipment: bodyweight | loadType: bodyweight-plus
reps: 6-10 | rest: 150s
increment: n/a bodyweight, or 2.5kg on a dip belt | per hand: no
cues:
  1. Keep your elbows close to your torso as you pull.
  2. Pull your chest to the bar, not your chin over it.
  3. Squeeze your shoulder blades down before you start pulling.
mistakes:
  1. Using hip momentum to kick-start the pull.
  2. Only doing half-reps and never fully extending the arms.
why: The underhand grip biases biceps more than the pull-up while still hammering the lats.
free-exercise-db id: Chin-Up
youtube: PAXkl-AdJFg | "How To Train Back WIDTH vs THICKNESS (Close vs Wide Grip? Rows or Pullups?)" | Jeff Nippard | https://www.youtube.com/watch?v=PAXkl-AdJFg | 0 | verified: yes | oEmbed confirmed title/channel, but the video is a grip-width/back-training comparison rather than a chin-up-only breakdown — flagged as a weaker match.
```

```
slug: assisted-pull-up
name: Assisted Pull-Up | aliases: band-assisted pull-up, machine-assisted pull-up
category: compound | pattern: vertical pull
primary: lats | secondary: biceps, upper-back
equipment: bodyweight | loadType: bodyweight-plus
reps: 6-10 | rest: 120s
increment: n/a — progress by using a lighter band or less machine assistance | per hand: no
cues:
  1. Loop the band so it supports you at the hips, not knees.
  2. Still drive your elbows down and back on every rep.
  3. Lower yourself slowly — don't let the band snap you up.
mistakes:
  1. Leaning on too much assistance, turning it into a bounce.
  2. Letting the band do the top-range work you should own.
why: Lets beginners groove the exact pull-up movement pattern under reduced load and progress toward an unassisted rep.
free-exercise-db id: Band_Assisted_Pull-Up
youtube: none | | | | 0 | verified: no | This exercise wasn't part of the original 5-way research pass. I searched directly but couldn't confirm a technique video from the preferred channel list (Nippard/RP/Thrall/Squat University/SBS/JTS/Athlean-X) specifically about band-assisted pull-ups. A non-preferred option exists (REP Fitness channel, "How to do Banded Assisted Pull-Ups", id 4yE-XGDWJPg, oEmbed-verified as real) if the channel policy is relaxed for accessory/beginner moves — flagging rather than substituting on my own judgment.
```

```
slug: lat-pulldown
name: Lat Pulldown | aliases: wide-grip pulldown, cable pulldown
category: compound | pattern: vertical pull
primary: lats | secondary: biceps, upper-back
equipment: cable | loadType: weighted
reps: 8-12 | rest: 120s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Lead with your elbows driving down toward your back pockets.
  2. Lean back only slightly — a few degrees, not a swing.
  3. Pause and squeeze your lats before the bar rises back up.
mistakes:
  1. Yanking the bar down with a big backward lean.
  2. Pulling the bar behind the head, straining the shoulder.
why: A machine-regulated, easy-to-load stand-in for the pull-up — lets beginners build the same pattern at any load.
free-exercise-db id: Wide-Grip_Lat_Pulldown
youtube: O94yEoGXtBY | "How To Build A V-Tapered Back: Lat Training Dos and Don'ts" | Jeff Nippard | https://www.youtube.com/watch?v=O94yEoGXtBY | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: barbell-row
name: Barbell Row | aliases: bent-over row, Pendlay-style row
category: compound | pattern: horizontal pull
primary: upper-back | secondary: lats, biceps
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 150s
increment: 2.5kg | per hand: no
cues:
  1. Hinge to about 45 degrees and hold that angle all set.
  2. Row the bar into your lower ribs, not your chest.
  3. Squeeze your shoulder blades together at the top of every rep.
mistakes:
  1. Standing more upright as the set gets hard, becoming a shrug.
  2. Using a big body heave/jerk to move the weight.
why: The classic horizontal pull for back thickness; the hip hinge also reinforces deadlift positioning.
free-exercise-db id: Bent_Over_Barbell_Row
youtube: RQU8wZPbioA | "How To Barbell Row" | Alan Thrall (Untamed Strength) | https://www.youtube.com/watch?v=RQU8wZPbioA | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: chest-supported-row
name: Chest-Supported Row (T-Bar / DB) | aliases: T-bar row, chest-supported dumbbell row, prone row
category: compound | pattern: horizontal pull
primary: upper-back | secondary: lats, biceps
equipment: machine | loadType: weighted
reps: 8-12 | rest: 120s
increment: 5kg (or 2.5kg/side if plate-loaded) | per hand: no
cues:
  1. Let your chest rest fully on the pad — don't hover.
  2. Row your elbows up and back, starting a lawnmower.
  3. Pause and squeeze between your shoulder blades at the top.
mistakes:
  1. Lifting the chest off the pad to cheat extra range.
  2. Shrugging the weight up with traps instead of rowing.
why: Removes lower-back fatigue and cheat-momentum from rowing, so the upper-back muscles get pushed harder and safer.
free-exercise-db id: Lying_T-Bar_Row
youtube: jLvqKgW-_G8 | "The Best And Worst Back Exercises (Ranked By Science)" | Jeff Nippard | https://www.youtube.com/watch?v=jLvqKgW-_G8 | 0 | verified: yes | oEmbed confirmed title/channel. This is a ranking video covering many back exercises in one long video; the exact timestamp for the chest-supported/T-bar row segment wasn't determined, so start_seconds is a placeholder — locate the real segment (via chapters or a manual scrub) before shipping.
```

```
slug: seated-cable-row
name: Seated Cable Row | aliases: seated row, low pulley row
category: compound | pattern: horizontal pull
primary: upper-back | secondary: lats, biceps
equipment: cable | loadType: weighted
reps: 10-12 | rest: 120s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Sit tall and keep your torso still — don't rock.
  2. Drive your elbows straight back past your ribs.
  3. Round your shoulders forward slightly at the stretch, then reset tall.
mistakes:
  1. Rocking the torso back and forth to add momentum.
  2. Shrugging the shoulders up toward the ears during the pull.
why: A stable, seated way to load horizontal back volume without any lower-back strain.
free-exercise-db id: Seated_Cable_Rows
youtube: jLvqKgW-_G8 | "The Best And Worst Back Exercises (Ranked By Science)" | Jeff Nippard | https://www.youtube.com/watch?v=jLvqKgW-_G8 | 0 | verified: yes | Same source video as chest-supported-row above (a multi-exercise ranking video); the seated-cable-row segment's exact timestamp is likewise unconfirmed. Using the same clip twice is a stopgap — find each exercise's real segment before shipping, or swap in a dedicated seated-row video.
```

```
slug: single-arm-dumbbell-row
name: Single-Arm Dumbbell Row | aliases: one-arm row, DB row
category: compound | pattern: horizontal pull
primary: lats | secondary: upper-back, biceps
equipment: dumbbell | loadType: weighted
reps: 8-12 | rest: 120s
increment: 2kg | per hand: yes
cues:
  1. Brace your free hand on the bench, keep your back flat.
  2. Row your elbow up toward your hip, not out sideways.
  3. Let the dumbbell hang and stretch your lat at the bottom.
mistakes:
  1. Twisting the torso to help heave the weight up.
  2. Cutting the range short, never letting the arm fully extend.
why: Unilateral loading drives a deep lat stretch and fixes side-to-side imbalances bilateral rows can hide.
free-exercise-db id: One-Arm_Dumbbell_Row
youtube: DMo3HJoawrU | "Single Arm Supported Dumbbell Row" | Renaissance Periodization | https://www.youtube.com/watch?v=DMo3HJoawrU | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: face-pull
name: Face Pull | aliases: rope face pull
category: compound | pattern: horizontal pull (high)
primary: rear-delts | secondary: upper-back, traps
equipment: cable | loadType: weighted
reps: 12-15 | rest: 90s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Pull the rope apart toward your eyes, not your throat.
  2. Finish with thumbs pointing behind you, like drawing a bow.
  3. Lead the pull keeping your elbows high the whole time.
mistakes:
  1. Pulling low toward the chest, turning it into a row.
  2. Using too much weight, losing the external-rotation finish.
why: The single best cable move for rear-delt and rotator-cuff health — cheap insurance for shoulder longevity.
free-exercise-db id: Face_Pull
youtube: cc0tasCalHg | "10 Cable Face Pull Mistakes and How to Fix Them" | Renaissance Periodization | https://www.youtube.com/watch?v=cc0tasCalHg | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: straight-arm-pulldown
name: Straight-Arm Pulldown | aliases: lat pushdown, straight-arm lat pulldown
category: isolation | pattern: shoulder extension
primary: lats | secondary: upper-back
equipment: cable | loadType: weighted
reps: 12-15 | rest: 90s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Keep a soft, fixed bend in the elbows all rep.
  2. Sweep the bar down in an arc, leading with your lats.
  3. Feel the stretch overhead before starting each rep.
mistakes:
  1. Bending the elbows more on the way down, becoming a pushdown.
  2. Using shoulders/torso to yank the weight instead of the lats.
why: Isolates the lats through shoulder extension without elbow flexion, so grip/bicep fatigue never limits the set.
free-exercise-db id: Straight-Arm_Pulldown
youtube: none | | | | 0 | verified: no | None of the five research passes found a confident match; reported here honestly rather than inventing an ID. Worth a dedicated follow-up search.
```

### Shoulders

```
slug: overhead-press
name: Overhead Press | aliases: OHP, standing military press, strict press
category: compound | pattern: vertical push
primary: front-delts | secondary: side-delts, triceps
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 180s
increment: 2.5kg | per hand: no
cues:
  1. Squeeze your glutes and brace your abs before you press.
  2. Move your head back and through once the bar clears your face.
  3. Finish by shrugging the bar up under lockout, over your ears.
mistakes:
  1. Leaning back excessively, turning it into an incline press.
  2. Flaring the elbows out to the sides right off the shoulders.
why: The most direct test and builder of raw shoulder pressing strength, and it teaches full-body bracing.
free-exercise-db id: Standing_Military_Press
youtube: _RlRDWO2jfg | "Build Bigger Shoulders With Perfect Training Technique (The Overhead Press)" | Jeff Nippard | https://www.youtube.com/watch?v=_RlRDWO2jfg | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: seated-dumbbell-shoulder-press
name: Seated Dumbbell Shoulder Press | aliases: DB shoulder press, seated DB press
category: compound | pattern: vertical push
primary: front-delts | secondary: side-delts, triceps
equipment: dumbbell | loadType: weighted
reps: 8-12 | rest: 150s
increment: 2kg | per hand: yes
cues:
  1. Start with the dumbbells at ear height, not at the shoulders.
  2. Press up and slightly in, finishing near the top of your head.
  3. Keep your ribs down — don't arch to muscle it up.
mistakes:
  1. Excessive lower-back arch to help the last few reps.
  2. Letting the dumbbells drift forward instead of pressing straight up.
why: Seated support removes leg-drive cheating so you isolate real shoulder pressing strength.
free-exercise-db id: Seated_Dumbbell_Press
youtube: HzIiNhHhhtA | "Seated Dumbbell Shoulder Press" | Renaissance Periodization | https://www.youtube.com/watch?v=HzIiNhHhhtA | 0 | verified: yes | oEmbed confirmed title/channel; note this is a very short (~13s) demo clip rather than a long-form breakdown — still on-topic and from a preferred channel.
```

```
slug: dumbbell-lateral-raise
name: Dumbbell Lateral Raise | aliases: side raise, DB lateral
category: isolation | pattern: shoulder abduction
primary: side-delts | secondary: traps
equipment: dumbbell | loadType: weighted
reps: 12-15 | rest: 75s
increment: 2kg | per hand: yes
cues:
  1. Lead the raise with your elbows, pouring water from a jug.
  2. Raise only to shoulder height, not above it.
  3. Tip your pinkies up slightly at the top of the raise.
mistakes:
  1. Swinging the torso to launch the weight with momentum.
  2. Shrugging the traps up to help lift the dumbbells.
why: The single best isolation move for round, wide-looking shoulders — side delts respond best to strict light-weight form.
free-exercise-db id: Side_Lateral_Raise
youtube: SgyUoY0IZ7A | "The Best And Worst Shoulder Exercises" | Jeff Nippard | https://www.youtube.com/watch?v=SgyUoY0IZ7A | 100 | verified: yes | oEmbed confirmed title/channel; this ranking video covers multiple shoulder exercises and 100s is the reported lateral-raise segment. Alternate dedicated pick: n5dsI9qQXwY, "Lateral Raise Technique For Huge Delts", Renaissance Periodization (also oEmbed-verified) — consider swapping to this if a single-exercise clip is preferred.
```

```
slug: cable-lateral-raise
name: Cable Lateral Raise | aliases: cable side raise
category: isolation | pattern: shoulder abduction
primary: side-delts | secondary: traps
equipment: cable | loadType: weighted
reps: 12-15 | rest: 75s
increment: 5kg (stack pin, often has small add-on plates) | per hand: no
cues:
  1. Stand with the cable crossing your body for tension at the bottom.
  2. Raise your arm out to the side, leading with the elbow.
  3. Control the lowering instead of letting the cable snap it down.
mistakes:
  1. Standing too far from the machine, losing tension at the start.
  2. Using the free hand to brace and cheat the weight up.
why: Unlike a dumbbell, the cable keeps tension on the side delt even at the bottom, where dumbbells go slack.
free-exercise-db id: Cable_Seated_Lateral_Raise
youtube: SgyUoY0IZ7A | "The Best And Worst Shoulder Exercises" | Jeff Nippard | https://www.youtube.com/watch?v=SgyUoY0IZ7A | 477 | verified: yes | Same ranking video as the dumbbell lateral raise above; 477s is the reported cable-lateral-raise segment.
```

```
slug: reverse-pec-deck
name: Reverse Pec Deck (Rear-Delt Fly) | aliases: reverse fly, rear-delt machine fly
category: isolation | pattern: horizontal abduction
primary: rear-delts | secondary: upper-back
equipment: machine | loadType: weighted
reps: 12-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Lead the movement with your elbows, not your hands.
  2. Keep a soft elbow bend, squeeze your shoulder blades together.
  3. Move slowly — this small muscle doesn't need momentum.
mistakes:
  1. Using too much weight, turning it into a mid-back row.
  2. Letting the hands lead, shifting work off the rear delts.
why: The rear delts are chronically undertrained relative to front/side — this machine isolates them with the least technique risk.
free-exercise-db id: Reverse_Machine_Flyes
youtube: SgyUoY0IZ7A | "The Best And Worst Shoulder Exercises" | Jeff Nippard | https://www.youtube.com/watch?v=SgyUoY0IZ7A | 626 | verified: yes | Same ranking video as the two shoulder exercises above; 626s is the reported reverse-pec-deck segment.
```

### Arms

```
slug: barbell-curl
name: Barbell Curl | aliases: standing barbell curl
category: isolation | pattern: elbow flexion
primary: biceps | secondary: forearms
equipment: barbell | loadType: weighted
reps: 8-12 | rest: 90s
increment: 2.5kg | per hand: no
cues:
  1. Pin your elbows to your sides and keep them there.
  2. Curl the bar up without swinging your torso to help.
  3. Squeeze hard at the top for a full second.
mistakes:
  1. Swinging the hips/back to sling the weight up.
  2. Letting the elbows drift forward as the weight gets heavy.
why: The classic mass-builder for biceps — strict elbow position separates a real curl from a hip-driven swing.
free-exercise-db id: Barbell_Curl
youtube: GNO4OtYoCYk | "The Best And Worst Biceps Exercises" | Jeff Nippard | https://www.youtube.com/watch?v=GNO4OtYoCYk | 116 | verified: yes | oEmbed confirmed title/channel; ranking video, 116s is the reported barbell-curl segment.
```

```
slug: dumbbell-curl
name: Dumbbell Curl | aliases: standing dumbbell curl, alternating dumbbell curl
category: isolation | pattern: elbow flexion
primary: biceps | secondary: forearms
equipment: dumbbell | loadType: weighted
reps: 10-15 | rest: 75s
increment: 2kg | per hand: yes
cues:
  1. Keep your elbows pinned to your sides the whole set.
  2. Rotate your palm up as you curl for a full squeeze.
  3. Lower under control instead of dropping the weight down.
mistakes:
  1. Swinging the dumbbells up using body momentum.
  2. Letting the elbows drift forward, turning it into a front raise.
why: The simplest, most accessible biceps builder in the gym — a baseline every lifter can load and progress.
free-exercise-db id: Dumbbell_Bicep_Curl
youtube: none | | | | 0 | verified: no | This exercise wasn't part of the original 5-way research pass. Direct follow-up searches surfaced only lying/preacher dumbbell curl variants and non-preferred channels for the plain standing version — reporting honestly as not found rather than guessing.
```

```
slug: incline-dumbbell-curl
name: Incline Dumbbell Curl | aliases: incline DB curl
category: isolation | pattern: elbow flexion
primary: biceps (long head) | secondary: forearms
equipment: dumbbell | loadType: weighted
reps: 10-15 | rest: 75s
increment: 2kg | per hand: yes
cues:
  1. Let your arms hang straight down from your shoulders to start.
  2. Curl without letting your elbows drift forward off the bench.
  3. Get a full stretch at the bottom of every rep.
mistakes:
  1. Letting the shoulders round forward, killing the stretch.
  2. Rushing the eccentric instead of controlling it down.
why: The incline angle pins the shoulder back and stretches the long head of the biceps harder than a standing curl.
free-exercise-db id: Incline_Dumbbell_Curl
youtube: GNO4OtYoCYk | "The Best And Worst Biceps Exercises" | Jeff Nippard | https://www.youtube.com/watch?v=GNO4OtYoCYk | 320 | verified: yes | Same ranking video as barbell curl above; 320s is the reported incline-dumbbell-curl segment.
```

```
slug: hammer-curl
name: Hammer Curl | aliases: neutral-grip curl
category: isolation | pattern: elbow flexion
primary: biceps (brachialis) | secondary: forearms
equipment: dumbbell | loadType: weighted
reps: 10-15 | rest: 75s
increment: 2kg | per hand: yes
cues:
  1. Keep your palms facing each other the entire rep.
  2. Curl straight up — don't let the dumbbells swing outward.
  3. Keep your elbows fixed at your sides throughout.
mistakes:
  1. Letting the wrist rotate toward a regular curl grip mid-rep.
  2. Using body momentum instead of a controlled curl.
why: The neutral grip shifts emphasis onto the brachialis and forearm, adding arm thickness a supinated curl alone won't.
free-exercise-db id: Hammer_Curls
youtube: GNO4OtYoCYk | "The Best And Worst Biceps Exercises" | Jeff Nippard | https://www.youtube.com/watch?v=GNO4OtYoCYk | 786 | verified: yes | Same ranking video as barbell/incline curl above; 786s is the reported hammer-curl segment.
```

```
slug: preacher-curl
name: Preacher Curl | aliases: cable preacher curl, EZ-bar preacher curl
category: isolation | pattern: elbow flexion
primary: biceps | secondary: forearms
equipment: cable | loadType: weighted
reps: 10-15 | rest: 75s
increment: 5kg (stack pin, or 2.5kg for an EZ-bar preacher) | per hand: no
cues:
  1. Pin your upper arms flat against the pad the whole set.
  2. Stop just short of fully locking out at the bottom.
  3. Squeeze at the top without shrugging your shoulders up.
mistakes:
  1. Bouncing out of the bottom stretch instead of controlling it.
  2. Lifting the upper arms off the pad to cheat reps.
why: The preacher angle removes shoulder/momentum help entirely, making it one of the strictest biceps builders available.
free-exercise-db id: Cable_Preacher_Curl
youtube: sxA__DoLsgo | "EZ Bar Preacher Curl" | Renaissance Periodization | https://www.youtube.com/watch?v=sxA__DoLsgo | 0 | verified: yes | oEmbed confirmed title/channel; note this is a short (~14s) demo clip of the EZ-bar variant, not the cable variant specifically — still directly on-topic.
```

```
slug: triceps-pushdown
name: Triceps Pushdown | aliases: cable pushdown, rope pushdown
category: isolation | pattern: elbow extension
primary: triceps | secondary: none
equipment: cable | loadType: weighted
reps: 10-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Pin your elbows to your sides, don't let them drift.
  2. Push down and slightly spread the rope apart at the bottom.
  3. Control the weight back up instead of letting it fly.
mistakes:
  1. Letting the elbows travel forward away from the torso.
  2. Leaning over the bar, using body weight to push it down.
why: A joint-friendly triceps isolation staple that's easy to load precisely for high volume.
free-exercise-db id: Triceps_Pushdown
youtube: OpRMRhr0Ycc | "The Best & Worst TRICEPS Exercises (Ranked Using Science)" | Jeff Nippard | https://www.youtube.com/watch?v=OpRMRhr0Ycc | 60 | verified: yes | oEmbed confirmed title/channel; ranking video, 60s is the reported pushdown segment.
```

```
slug: overhead-cable-triceps-extension
name: Overhead Cable Triceps Extension | aliases: overhead rope extension, French press (cable)
category: isolation | pattern: elbow extension
primary: triceps (long head) | secondary: none
equipment: cable | loadType: weighted
reps: 10-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Keep your upper arms close to your ears and fixed.
  2. Extend your forearms forward and up, not straight overhead.
  3. Feel a deep stretch behind your elbow at the bottom.
mistakes:
  1. Letting the elbows flare out wide instead of staying narrow.
  2. Moving the shoulders to help instead of isolating the elbow.
why: The overhead position stretches the long head of the triceps, the head most pressing/pushdown work neglects.
free-exercise-db id: Triceps_Overhead_Extension_with_Rope
youtube: OpRMRhr0Ycc | "The Best & Worst TRICEPS Exercises (Ranked Using Science)" | Jeff Nippard | https://www.youtube.com/watch?v=OpRMRhr0Ycc | 275 | verified: yes | Same ranking video as triceps pushdown above; 275s is the reported segment.
```

```
slug: skull-crusher
name: Skull Crusher | aliases: lying triceps extension, EZ-bar skull crusher
category: isolation | pattern: elbow extension
primary: triceps | secondary: none
equipment: ez-bar | loadType: weighted
reps: 10-12 | rest: 90s
increment: 2.5kg | per hand: no
cues:
  1. Keep your upper arms vertical and still — only forearms move.
  2. Lower the bar toward your forehead or just past it.
  3. Extend back up under control, without flaring the elbows.
mistakes:
  1. Letting the elbows drift backward/forward instead of staying fixed.
  2. Using too much weight, turning it into a partial-range press.
why: A high-stretch triceps builder that, done with strict elbow position, adds size the pushdown's limited range can't.
free-exercise-db id: EZ-Bar_Skullcrusher
youtube: OpRMRhr0Ycc | "The Best & Worst TRICEPS Exercises (Ranked Using Science)" | Jeff Nippard | https://www.youtube.com/watch?v=OpRMRhr0Ycc | 410 | verified: yes | Same ranking video as above; 410s is the reported segment.
```

```
slug: close-grip-bench-press
name: Close-Grip Bench Press | aliases: CGBP
category: compound | pattern: horizontal push
primary: triceps | secondary: chest, front-delts
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 150s
increment: 2.5kg | per hand: no
cues:
  1. Set your grip just inside shoulder width, not fist-narrow.
  2. Keep your elbows tracking close to your torso on the way down.
  3. Drive through your palms and lock out fully at the top.
mistakes:
  1. Gripping too narrow, straining the wrists and elbows.
  2. Letting the elbows flare out, turning it back into a chest press.
why: Lets you overload the triceps with real pressing weight — more loading potential than any single-joint triceps move.
free-exercise-db id: Close-Grip_Barbell_Bench_Press
youtube: OpRMRhr0Ycc | "The Best & Worst TRICEPS Exercises (Ranked Using Science)" | Jeff Nippard | https://www.youtube.com/watch?v=OpRMRhr0Ycc | 728 | verified: yes | Same ranking video as above; 728s is the reported close-grip-bench segment.
```

### Legs

```
slug: back-squat
name: Back Squat | aliases: barbell squat, high-bar/low-bar squat
category: compound | pattern: squat
primary: quads | secondary: glutes, hamstrings, lower-back
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 180s
increment: 2.5kg | per hand: no
cues:
  1. Break at the hips and knees together, not knees first.
  2. Spread the floor apart with your feet to keep knees out.
  3. Keep your ribcage stacked over your hips the whole descent.
mistakes:
  1. Letting the knees cave inward, especially near the bottom.
  2. Losing the neutral spine and rounding the lower back.
why: The foundational lower-body compound for quad and total leg mass, and the best transferable strength builder in the gym.
free-exercise-db id: Barbell_Squat
youtube: Po9CDtfcLJI | "How to Perform a Low Bar Back Squat" | Squat University | https://www.youtube.com/watch?v=Po9CDtfcLJI | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: front-squat
name: Front Squat | aliases: clean-grip front squat
category: compound | pattern: squat
primary: quads | secondary: glutes, abs
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 180s
increment: 2.5kg | per hand: no
cues:
  1. Keep your elbows up high so the bar rests on your shoulders.
  2. Sit straight down between your hips, staying upright through the torso.
  3. Push your knees forward over your toes as you descend.
mistakes:
  1. Letting the elbows drop, dumping the bar off the shoulders.
  2. Leaning forward like a back squat instead of staying vertical.
why: The most quad-dominant barbell squat variation — the upright torso shifts far more work onto the quads than a back squat.
free-exercise-db id: Front_Squat_Clean_Grip
youtube: v-mQm_droHg | "HOW TO FRONT SQUAT: Build Bigger Quads & A Stronger Squat" | Jeff Nippard | https://www.youtube.com/watch?v=v-mQm_droHg | 242 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: hack-squat
name: Hack Squat (Machine) | aliases: hack squat, 45-degree hack squat
category: compound | pattern: squat
primary: quads | secondary: glutes, hamstrings
equipment: machine | loadType: weighted
reps: 8-12 | rest: 150s
increment: 5kg (per side plate) | per hand: no
cues:
  1. Sink as deep as you comfortably can without your back rounding.
  2. Keep your whole foot planted, weight through heel to toe.
  3. Lower slowly — there's no need to rush the descent.
mistakes:
  1. Stopping the descent short of a full, controlled range.
  2. Letting the lower back round off the pad at depth.
why: Loads the quads through a long range with the machine handling balance — a safe way to chase deep-squat quad growth.
free-exercise-db id: Hack_Squat
youtube: none | | | | 0 | verified: no | Searches surfaced general Nippard/RP squat-technique commentary but no confirmed, on-topic hack-squat-machine video from the preferred channel list — reporting honestly rather than reusing an unrelated squat video.
```

```
slug: goblet-squat
name: Goblet Squat | aliases: kettlebell goblet squat, dumbbell goblet squat
category: compound | pattern: squat
primary: quads | secondary: glutes, hamstrings
equipment: kettlebell | loadType: weighted
reps: 10-15 | rest: 120s
increment: 2kg (or next kettlebell size up) | per hand: no (held with both hands)
cues:
  1. Hold the weight close to your chest, elbows pointing down.
  2. Use your elbows to nudge your knees out as you sit.
  3. Sit straight down between your heels, staying tall through the chest.
mistakes:
  1. Letting the weight drift away from the chest, pulling you forward.
  2. Rushing the depth instead of controlling the descent.
why: The easiest squat pattern to teach beginners — the front-loaded weight naturally keeps the torso upright and depth honest.
free-exercise-db id: Goblet_Squat
youtube: 8sXVbOBFPig | "The Most Effective Science-Based Leg Workout Pt. 2 (Quads, Glutes, Hams, Calves)" | Jeff Nippard | https://www.youtube.com/watch?v=8sXVbOBFPig | 0 | verified: yes | oEmbed confirmed title/channel; this is a multi-exercise leg-workout video that includes a goblet squat segment, but the exact timestamp is unconfirmed — locate the real segment before shipping rather than trusting start_seconds: 0.
```

```
slug: leg-press
name: Leg Press | aliases: 45-degree leg press, sled press
category: compound | pattern: squat
primary: quads | secondary: glutes, hamstrings
equipment: machine | loadType: weighted
reps: 8-12 | rest: 150s
increment: 5kg (per side plate) | per hand: no
cues:
  1. Keep your lower back flat against the pad, not rounding.
  2. Lower until knees reach roughly 90 degrees, no deeper if back lifts.
  3. Push through your whole foot, not just your toes.
mistakes:
  1. Letting the hips round off the pad at the bottom.
  2. Locking the knees out hard and bouncing at the top.
why: Loads the quads hard with none of the balance/bracing demand of a free squat.
free-exercise-db id: Leg_Press
youtube: B6rGDcfyPto | "How To Leg Press For Best Quad Growth | Targeting The Muscle Series" | Renaissance Periodization | https://www.youtube.com/watch?v=B6rGDcfyPto | 60 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: romanian-deadlift
name: Romanian Deadlift | aliases: RDL, stiff-leg deadlift (dumbbell or barbell)
category: compound | pattern: hinge
primary: hamstrings | secondary: glutes, lower-back
equipment: barbell | loadType: weighted
reps: 6-10 | rest: 150s
increment: 2.5kg | per hand: no
cues:
  1. Push your hips straight back like closing a car door with them.
  2. Keep the bar dragging down your thighs the whole way.
  3. Stop at a hard hamstring stretch, not when the back rounds.
mistakes:
  1. Squatting the weight down instead of hinging at the hips.
  2. Rounding the lower back to chase extra range of motion.
why: The best hip-hinge movement for hamstrings and glutes while teaching the pattern the deadlift depends on.
free-exercise-db id: Romanian_Deadlift
youtube: _oyxCn2iSjU | "HOW TO DO ROMANIAN DEADLIFTS (RDLs): Build Beefy Hamstrings With Perfect Technique" | Jeff Nippard | https://www.youtube.com/watch?v=_oyxCn2iSjU | 82 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: deadlift
name: Conventional Deadlift | aliases: barbell deadlift
category: compound | pattern: hinge
primary: lower-back | secondary: glutes, hamstrings, lats, traps
equipment: barbell | loadType: weighted
reps: 5-8 | rest: 180s
increment: 2.5kg | per hand: no
cues:
  1. Take the slack out of the bar before you pull.
  2. Push the floor away with your legs, not your back.
  3. Keep the bar dragging up your shins and thighs the whole pull.
mistakes:
  1. Letting the hips shoot up first, turning it into a stiff-leg pull.
  2. Rounding the lower back to start the pull off the floor.
why: The single most complete strength movement in the gym, building the entire posterior chain and grip in one lift.
free-exercise-db id: Barbell_Deadlift
youtube: g2Xl1zJeArs | "Mastering The Deadlift: How To Increase Your Weight With Perfect Form" | Squat University | https://www.youtube.com/watch?v=g2Xl1zJeArs | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: bulgarian-split-squat
name: Bulgarian Split Squat | aliases: rear-foot-elevated split squat, RFESS
category: compound | pattern: lunge
primary: quads | secondary: glutes, hamstrings
equipment: dumbbell | loadType: weighted
reps: 8-12 per leg | rest: 120s
increment: 2kg | per hand: yes
cues:
  1. Keep most of your weight on the front foot to balance.
  2. Drop straight down, not forward toward your front knee.
  3. Keep your torso tall through the whole rep.
mistakes:
  1. Placing the back foot too high, stressing the knee.
  2. Letting the front knee cave inward on the way up.
why: A brutal single-leg quad and glute builder that also exposes and fixes side-to-side leg imbalances.
free-exercise-db id: none
youtube: hPlKPjohFS0 | "The PERFECT Bulgarian Split Squat (Avoid These Errors!)" | Squat University | https://www.youtube.com/watch?v=hPlKPjohFS0 | 10 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: walking-lunge
name: Walking Lunge | aliases: dumbbell walking lunge, barbell walking lunge
category: compound | pattern: lunge
primary: quads | secondary: glutes, hamstrings
equipment: dumbbell | loadType: weighted
reps: 8-12 per leg | rest: 120s
increment: 2kg | per hand: yes
cues:
  1. Take a stride long enough that your front shin stays vertical.
  2. Drop your back knee straight down toward the floor.
  3. Push through your front heel to stand up and step through.
mistakes:
  1. Taking too short a stride, driving the front knee past the toes.
  2. Letting the torso lean forward instead of staying upright.
why: Combines a quad/glute lunge with dynamic, athletic carryover that static lunges don't train.
free-exercise-db id: Barbell_Walking_Lunge
youtube: Z6R8A5tcrTc | "Make Lunging INSANELY EFFECTIVE For Glute Growth | Targeting The Muscle" | Renaissance Periodization | https://www.youtube.com/watch?v=Z6R8A5tcrTc | 31 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: leg-extension
name: Leg Extension | aliases: quad extension
category: isolation | pattern: knee extension
primary: quads | secondary: none
equipment: machine | loadType: weighted
reps: 12-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Adjust the pad to sit just above your ankle, not your shin.
  2. Extend all the way to a full, controlled lockout.
  3. Lower slowly instead of letting the stack drop.
mistakes:
  1. Using momentum/swinging to kick the weight up.
  2. Only using the top half of the range of motion.
why: The most direct quad isolation available — a clean way to finish legs after squats/presses.
free-exercise-db id: Leg_Extensions
youtube: ljO4jkwv8wQ | "How To Do Leg Extensions With Perfect Technique (Grow Every Quad Head)" | Jeff Nippard | https://www.youtube.com/watch?v=ljO4jkwv8wQ | 209 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: seated-leg-curl
name: Seated Leg Curl | aliases: seated hamstring curl
category: isolation | pattern: knee flexion
primary: hamstrings | secondary: calves
equipment: machine | loadType: weighted
reps: 10-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Point your toes toward your shins to bias the hamstrings.
  2. Curl through a full range, squeezing hard at the top.
  3. Lower under control — don't let the pad snap back.
mistakes:
  1. Letting the hips rise off the seat to cheat extra range.
  2. Pointing the toes down, shifting work onto the calves.
why: Isolates the hamstrings through knee flexion, which hip-dominant RDLs and deadlifts don't hit directly.
free-exercise-db id: Seated_Leg_Curl
youtube: jobEeklwrrs | "9 Leg Curl Mistakes and How to Fix Them" | Renaissance Periodization | https://www.youtube.com/watch?v=jobEeklwrrs | 31 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: lying-leg-curl
name: Lying Leg Curl | aliases: prone hamstring curl
category: isolation | pattern: knee flexion
primary: hamstrings | secondary: calves
equipment: machine | loadType: weighted
reps: 10-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Keep your hips pressed flat into the bench the whole rep.
  2. Curl through a full range, squeezing hard at the top.
  3. Lower under control instead of letting the pad snap back.
mistakes:
  1. Lifting the hips off the bench to cheat extra range.
  2. Using short, fast partial reps instead of a full curl.
why: The prone position removes any hip-drive cheating that's easier to sneak into the seated version.
free-exercise-db id: Lying_Leg_Curls
youtube: jobEeklwrrs | "9 Leg Curl Mistakes and How to Fix Them" | Renaissance Periodization | https://www.youtube.com/watch?v=jobEeklwrrs | 31 | verified: yes | Same source video as seated-leg-curl above — it's a general leg-curl mistakes video covering both variations; find the lying-specific segment if a distinct timestamp is wanted.
```

```
slug: hip-thrust
name: Hip Thrust | aliases: barbell hip thrust, loaded glute bridge
category: compound | pattern: hinge (horizontal)
primary: glutes | secondary: hamstrings
equipment: barbell | loadType: weighted
reps: 8-12 | rest: 150s
increment: 2.5kg | per hand: no
cues:
  1. Tuck your chin and ribs down to stay neutral at lockout.
  2. Drive through your heels, not your toes.
  3. Squeeze your glutes hard at the top and pause a beat.
mistakes:
  1. Overextending the lower back at the top instead of squeezing glutes.
  2. Pushing through the toes, shifting work to the quads.
why: The single best loaded glute builder — the horizontal hinge loads the glutes at their strongest range.
free-exercise-db id: Barbell_Hip_Thrust
youtube: xDmFkJxPzeM | "How To Build Great Glutes with Perfect Hip Thrust Technique (Fix Mistakes!)" | Jeff Nippard | https://www.youtube.com/watch?v=xDmFkJxPzeM | 25 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: standing-calf-raise
name: Standing Calf Raise | aliases: standing calf raise machine
category: isolation | pattern: ankle extension
primary: calves | secondary: none
equipment: machine | loadType: weighted
reps: 12-20 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Get a deep stretch at the bottom before driving back up.
  2. Rise all the way onto your toes and pause at the top.
  3. Move slowly — don't bounce out of the bottom stretch.
mistakes:
  1. Using tiny, bouncy partial reps instead of a full range.
  2. Bending the knees to help push the weight up.
why: Trains the gastrocnemius through a long, straight-leg range a seated calf raise can't reach.
free-exercise-db id: Standing_Calf_Raises
youtube: 21inrjhoFkQ | "The Most Scientific Way to Train CALVES (Science Explained)" | Jeff Nippard | https://www.youtube.com/watch?v=21inrjhoFkQ | 236 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: seated-calf-raise
name: Seated Calf Raise | aliases: seated calf raise machine
category: isolation | pattern: ankle extension
primary: calves | secondary: none
equipment: machine | loadType: weighted
reps: 15-20 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Let your heels drop as low as comfortably possible.
  2. Press up through the balls of your feet to full extension.
  3. Pause briefly at the top before lowering under control.
mistakes:
  1. Rushing through short, bouncy partial reps.
  2. Letting the knees drift forward off the pad.
why: The bent-knee position shifts emphasis onto the soleus, the calf muscle standing raises undertrain.
free-exercise-db id: Seated_Calf_Raise
youtube: 21inrjhoFkQ | "The Most Scientific Way to Train CALVES (Science Explained)" | Jeff Nippard | https://www.youtube.com/watch?v=21inrjhoFkQ | 183 | verified: yes | Same video as standing calf raise above; 183s is the reported seated-calf-raise segment.
```

### Core

```
slug: hanging-knee-raise
name: Hanging Knee/Leg Raise | aliases: hanging leg raise, captain's chair raise
category: isolation | pattern: hip flexion
primary: abs | secondary: obliques
equipment: bodyweight | loadType: bodyweight-plus
reps: 10-15 | rest: 90s
increment: n/a (straighten the legs, then add an ankle weight) | per hand: no
cues:
  1. Curl your pelvis under at the top, not just swinging.
  2. Keep the movement slow — no swinging from the shoulders.
  3. Lower under control until your legs are fully straight.
mistakes:
  1. Using momentum/swinging instead of a controlled hip-flexion curl.
  2. Stopping the raise at hip height without curling the pelvis.
why: One of the few ab exercises that trains real resisted hip flexion, which planks/crunches don't provide.
free-exercise-db id: Hanging_Leg_Raise
youtube: RD_A-Z15ER4 | "Hanging Knee Raise" | Renaissance Periodization | https://www.youtube.com/watch?v=RD_A-Z15ER4 | 0 | verified: yes | oEmbed confirmed title/channel; a short (~9s) demo clip.
```

```
slug: cable-crunch
name: Cable Crunch | aliases: kneeling cable crunch, rope crunch
category: isolation | pattern: spinal flexion
primary: abs | secondary: none
equipment: cable | loadType: weighted
reps: 12-15 | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Round your spine, crunching your ribs toward your hips.
  2. Keep your hips fixed — it's a spine move, not a hip move.
  3. Squeeze and hold for a second at full contraction.
mistakes:
  1. Pulling with the arms/lats instead of crunching with the abs.
  2. Moving the hips back and forth instead of flexing the spine.
why: Lets you add external load to a crunch, which bodyweight ab work eventually can't progress past.
free-exercise-db id: Cable_Crunch
youtube: 6GMKPQVERzw | "Rope Crunch" | Renaissance Periodization | https://www.youtube.com/watch?v=6GMKPQVERzw | 0 | verified: yes | oEmbed confirmed title/channel; a short (~10s) demo clip.
```

```
slug: plank
name: Plank | aliases: front plank
category: isolation | pattern: anti-extension (isometric)
primary: abs | secondary: obliques, lower-back
equipment: bodyweight | loadType: bodyweight-plus
reps: 30-60s hold (add weight to progress) | rest: 60s
increment: n/a (add a weight plate on the back to progress) | per hand: no
cues:
  1. Squeeze your glutes and brace your abs, like bracing for a punch.
  2. Keep a straight line from your ears to your ankles.
  3. Breathe steadily instead of holding your breath.
mistakes:
  1. Letting the hips sag toward the floor as fatigue sets in.
  2. Piking the hips up to make the hold easier.
why: Trains the abs' real job — resisting spinal extension under load — and doubles as a low-risk core baseline.
free-exercise-db id: Plank
youtube: 1G0y8D5rFDc | "How To Build A Better Core & Six Pack Abs: Optimal Training Explained" | Jeff Nippard | https://www.youtube.com/watch?v=1G0y8D5rFDc | 0 | verified: yes | oEmbed confirmed title/channel.
```

```
slug: ab-wheel-rollout
name: Ab Wheel Rollout | aliases: ab roller, barbell rollout
category: compound | pattern: anti-extension
primary: abs | secondary: lats, lower-back
equipment: bodyweight | loadType: bodyweight-plus
reps: 8-12 | rest: 90s
increment: n/a (progress range of motion, then reps) | per hand: no
cues:
  1. Brace your abs hard before you start rolling out.
  2. Roll out only as far as you can keep your back flat.
  3. Pull yourself back using your abs, not just your arms.
mistakes:
  1. Letting the lower back arch/sag at full extension.
  2. Rolling out farther than you can control back from.
why: One of the hardest anti-extension core exercises available — builds bracing strength that protects the spine in squats and deadlifts.
free-exercise-db id: Barbell_Ab_Rollout
youtube: 1G0y8D5rFDc | "How To Build A Better Core & Six Pack Abs: Optimal Training Explained" | Jeff Nippard | https://www.youtube.com/watch?v=1G0y8D5rFDc | 210 | verified: yes | Same core-training video as plank above; 210s is a reported (estimated, not chapter-confirmed) ab-wheel segment — double-check before shipping.
```

```
slug: pallof-press
name: Pallof Press | aliases: anti-rotation press
category: isolation | pattern: anti-rotation
primary: obliques | secondary: abs
equipment: cable | loadType: weighted
reps: 10-12 per side | rest: 75s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Stand sideways to the cable so it's constantly trying to twist you.
  2. Press straight out and resist any rotation in your torso.
  3. Brace your abs before you press, not after you feel the pull.
mistakes:
  1. Letting the torso rotate toward the cable instead of resisting.
  2. Pressing from a stance too narrow to stay stable.
why: Trains the core's anti-rotation function directly, which is what protects the spine during real-world twisting loads.
free-exercise-db id: Pallof_Press
youtube: EvJxS2951P4 | "The Forgotten Core Exercises (NOT ABS!)" | ATHLEAN-X | https://www.youtube.com/watch?v=EvJxS2951P4 | 180 | verified: yes | oEmbed confirmed title/channel. ATHLEAN-X used here per the brief's "last resort" allowance since no Nippard/RP/Thrall/Squat University/SBS/JTS match was found; 180s is a reported, unconfirmed estimate for the Pallof-press segment — verify before shipping.
```

### Bonus additions (glaring omissions from the base list)

```
slug: dumbbell-shrug
name: Dumbbell Shrug | aliases: barbell shrug, trap shrug
category: isolation | pattern: scapular elevation
primary: traps | secondary: forearms
equipment: dumbbell | loadType: weighted
reps: 10-15 | rest: 90s
increment: 2kg | per hand: yes
cues:
  1. Lift straight up toward your ears, not up and back.
  2. Pause and hold a full second at the top.
  3. Lower under control instead of dropping the weight.
mistakes:
  1. Rolling the shoulders in a circle instead of a straight shrug.
  2. Using knee momentum to help start the lift.
why: The traps have no other direct exercise in the base list, and they're a highly visible muscle for a "strength library" — a glaring gap without this.
free-exercise-db id: Dumbbell_Shrug
youtube: _t3lrPI6Ns4 | "Dumbbell Shrug" | Renaissance Periodization | https://www.youtube.com/watch?v=_t3lrPI6Ns4 | 0 | verified: yes | oEmbed confirmed title/channel. Alternate: C6sYjDFuq9I, "How To Build Bigger Traps: Optimal Training Explained", Jeff Nippard (also oEmbed-verified) if a longer-form breakdown is preferred.
```

```
slug: farmers-carry
name: Farmer's Carry | aliases: farmer's walk, loaded carry
category: compound | pattern: loaded carry
primary: forearms | secondary: traps, abs, glutes, quads
equipment: dumbbell | loadType: weighted
reps: 20-40m or 30-45s per set | rest: 90s
increment: 2kg per hand (or jump to the next fixed-dumbbell size) | per hand: yes
cues:
  1. Set your shoulders back and down before your first step.
  2. Take short, quick steps rather than long, swinging strides.
  3. Keep your ribs stacked over your hips the whole walk.
mistakes:
  1. Letting the shoulders round forward and the weights swing.
  2. Leaning to one side to compensate for grip fatigue.
why: A full-body strength and grip builder no other exercise on this list trains — practical, low-technical-risk total-body work.
free-exercise-db id: Farmers_Walk
youtube: kL5ZQqrDQlc | "Farmer's Walks and Truck Pulls" | Alan Thrall (Untamed Strength) | https://www.youtube.com/watch?v=kL5ZQqrDQlc | 0 | verified: yes | oEmbed confirmed title/channel, but this is an older (2014-era) training-log-style video rather than a tight technique breakdown — flagged as the weakest verified pick in this catalog; worth a follow-up search for a more current, more focused clip.
```

```
slug: cable-pull-through
name: Cable Pull-Through | aliases: pull-through
category: compound | pattern: hinge
primary: glutes | secondary: hamstrings, lower-back
equipment: cable | loadType: weighted
reps: 10-15 | rest: 90s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Push your hips back toward the machine, not just bending forward.
  2. Let the rope pull through between your legs at the bottom.
  3. Finish by squeezing your glutes hard, standing fully tall.
mistakes:
  1. Squatting the weight instead of hinging at the hips.
  2. Rounding the lower back to reach further at the bottom.
why: A self-limiting hinge pattern that's easier for hinge-shy beginners to learn than an RDL, while still building real glute/hamstring strength.
free-exercise-db id: Pull_Through
youtube: 3ryh7PNhz3E | "The Best & Worst Glute Exercises (According To Science)" | Jeff Nippard | https://www.youtube.com/watch?v=3ryh7PNhz3E | 753 | verified: yes | oEmbed confirmed title/channel; ranking video, 753s is the reported pull-through segment.
```

```
slug: hip-abduction-machine
name: Hip Abduction Machine | aliases: seated hip abduction, outer thigh machine
category: isolation | pattern: hip abduction
primary: glutes (medius) | secondary: none
equipment: machine | loadType: weighted
reps: 15-20 | rest: 60s
increment: 5kg (stack pin) | per hand: no
cues:
  1. Sit tall with your lower back flat against the pad.
  2. Push your knees apart using your outer hips, not feet.
  3. Control the return instead of letting the pads snap together.
mistakes:
  1. Leaning the torso forward to add momentum.
  2. Using tiny, fast partial reps instead of a full range.
why: Directly targets the glute medius — a hip stabilizer in every squat, lunge, and single-leg move, with no other direct exercise on this list.
free-exercise-db id: none
youtube: 3ryh7PNhz3E | "The Best & Worst Glute Exercises (According To Science)" | Jeff Nippard | https://www.youtube.com/watch?v=3ryh7PNhz3E | 500 | verified: yes | Same ranking video as cable-pull-through above; 500s is the reported hip-abduction segment.
```

---

## Video source appendix — all unique clips referenced above

Every ID below was independently confirmed by fetching `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` and checking the returned `title`/`author_name` against the claimed exercise.

| video id      | channel                   | title                                                                       |
| ------------- | ------------------------- | --------------------------------------------------------------------------- |
| vcBig73ojpE   | Jeff Nippard              | How To Get A Huge Bench Press with Perfect Technique                        |
| YQ2s_Y7g5Qk   | Renaissance Periodization | Flat Dumbbell Bench Press                                                   |
| 5CECBjd7HLQ   | Renaissance Periodization | Incline Dumbbell Press                                                      |
| NwzUje3z0qY   | Renaissance Periodization | Machine Chest Press                                                         |
| -EIhKMDSjBY   | Jeff Nippard              | The Best Way To Isolate The Chest For Growth (Upper Chest Focus)            |
| 3-yAymzidmE   | Renaissance Periodization | How To Add More Reps To Your Pushups FOR SURE                               |
| yN6Q1UI_xkE   | Jeff Nippard              | How To Do Dips For A Bigger Chest and Shoulders (Fix Mistakes!)             |
| Hdc7Mw6BIEE   | Jeff Nippard              | The Best Way To Do Pull Ups For A Wide Back                                 |
| PAXkl-AdJFg   | Jeff Nippard              | How To Train Back WIDTH vs THICKNESS                                        |
| O94yEoGXtBY   | Jeff Nippard              | How To Build A V-Tapered Back: Lat Training Dos and Don'ts                  |
| RQU8wZPbioA   | Alan Thrall               | How To Barbell Row                                                          |
| jLvqKgW-\_G8  | Jeff Nippard              | The Best And Worst Back Exercises (Ranked By Science)                       |
| DMo3HJoawrU   | Renaissance Periodization | Single Arm Supported Dumbbell Row                                           |
| cc0tasCalHg   | Renaissance Periodization | 10 Cable Face Pull Mistakes and How to Fix Them                             |
| \_RlRDWO2jfg  | Jeff Nippard              | Build Bigger Shoulders With Perfect Training Technique (The Overhead Press) |
| HzIiNhHhhtA   | Renaissance Periodization | Seated Dumbbell Shoulder Press                                              |
| SgyUoY0IZ7A   | Jeff Nippard              | The Best And Worst Shoulder Exercises                                       |
| n5dsI9qQXwY   | Renaissance Periodization | Lateral Raise Technique For Huge Delts (alternate pick)                     |
| GNO4OtYoCYk   | Jeff Nippard              | The Best And Worst Biceps Exercises                                         |
| sxA\_\_DoLsgo | Renaissance Periodization | EZ Bar Preacher Curl                                                        |
| OpRMRhr0Ycc   | Jeff Nippard              | The Best & Worst TRICEPS Exercises (Ranked Using Science)                   |
| Po9CDtfcLJI   | Squat University          | How to Perform a Low Bar Back Squat                                         |
| v-mQm_droHg   | Jeff Nippard              | HOW TO FRONT SQUAT: Build Bigger Quads & A Stronger Squat                   |
| 8sXVbOBFPig   | Jeff Nippard              | The Most Effective Science-Based Leg Workout Pt. 2                          |
| B6rGDcfyPto   | Renaissance Periodization | How To Leg Press For Best Quad Growth                                       |
| \_oyxCn2iSjU  | Jeff Nippard              | HOW TO DO ROMANIAN DEADLIFTS (RDLs)                                         |
| g2Xl1zJeArs   | Squat University          | Mastering The Deadlift                                                      |
| hPlKPjohFS0   | Squat University          | The PERFECT Bulgarian Split Squat                                           |
| Z6R8A5tcrTc   | Renaissance Periodization | Make Lunging INSANELY EFFECTIVE For Glute Growth                            |
| ljO4jkwv8wQ   | Jeff Nippard              | How To Do Leg Extensions With Perfect Technique                             |
| jobEeklwrrs   | Renaissance Periodization | 9 Leg Curl Mistakes and How to Fix Them                                     |
| xDmFkJxPzeM   | Jeff Nippard              | How To Build Great Glutes with Perfect Hip Thrust Technique                 |
| 21inrjhoFkQ   | Jeff Nippard              | The Most Scientific Way to Train CALVES                                     |
| RD_A-Z15ER4   | Renaissance Periodization | Hanging Knee Raise                                                          |
| 6GMKPQVERzw   | Renaissance Periodization | Rope Crunch                                                                 |
| 1G0y8D5rFDc   | Jeff Nippard              | How To Build A Better Core & Six Pack Abs                                   |
| EvJxS2951P4   | ATHLEAN-X                 | The Forgotten Core Exercises (NOT ABS!)                                     |
| \_t3lrPI6Ns4  | Renaissance Periodization | Dumbbell Shrug                                                              |
| C6sYjDFuq9I   | Jeff Nippard              | How To Build Bigger Traps (alternate pick)                                  |
| kL5ZQqrDQlc   | Alan Thrall               | Farmer's Walks and Truck Pulls                                              |
| 3ryh7PNhz3E   | Jeff Nippard              | The Best & Worst Glute Exercises (According To Science)                     |

**Not found / verified: no:** straight-arm-pulldown, assisted-pull-up, dumbbell-curl, hack-squat — reported honestly per the brief rather than guessed.

**Known follow-ups before shipping** (flagged inline above, collected here for convenience):

1. Several exercises share one long "ranking" video at different (self-reported, not chapter-verified) timestamps: `jLvqKgW-_G8` (chest-supported-row, seated-cable-row), `SgyUoY0IZ7A` (3 shoulder exercises), `GNO4OtYoCYk` (3 bicep exercises), `OpRMRhr0Ycc` (4 tricep exercises), `21inrjhoFkQ` (2 calf exercises), `1G0y8D5rFDc` (plank + ab-wheel-rollout, ab-wheel timestamp is an estimate), `3ryh7PNhz3E` (cable-pull-through + hip-abduction-machine). The videos and channels are all confirmed real; the exact in-video timestamps should be re-checked against the videos' own chapter markers before shipping.
2. Weaker topical matches to reconsider: push-up (`3-yAymzidmE`, about rep progression not form), chin-up (`PAXkl-AdJFg`, a grip-comparison video), farmer's carry (`kL5ZQqrDQlc`, an old training-log-style video).
3. No confident preferred-channel match found for: straight-arm pulldown, assisted pull-up, dumbbell curl, hack squat.

---

## Additional catalog entries note

Five exercises (`assisted-pull-up`, `dumbbell-curl`, `hack-squat`, `goblet-squat`, `lying-leg-curl`) were added to this file after the initial 50-exercise research pass, to match the app catalog's exact slug list. Their cues/mistakes/rep-ranges/free-exercise-db ids were researched directly; their YouTube picks were searched and independently oEmbed-verified by hand rather than going through the parallel 5-way research pass used for the original 50.

---

## QA table (G1-D)

Video QA pass over every pick flagged above as estimated, weak or unverified,
done with `yt-dlp` (chapters + auto-generated transcripts) and re-verified
against `https://www.youtube.com/oembed`. Method key: **chapters** = the
video's own YouTube chapter markers; **transcript** = auto-caption search
where chapters didn't split finely enough; **search+oembed** = a new
dedicated clip found via `yt-dlp "ytsearchN:..."` from the preferred channel
list (Nippard / RP / Squat University / Alan Thrall / SBS / Juggernaut),
confirmed real via oEmbed; **kept** = searched for a better option, found
none, left the existing verified pick as-is.

| slug                             | final video id | start (s)                            | how verified          | note                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | -------------- | ------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chest-supported-row              | jLvqKgW-\_G8   | 533 (was 0)                          | chapters              | "Chest-Supported Row" chapter in the back-exercises ranking video.                                                                                                                                                                                                                                                                                                                        |
| seated-cable-row                 | jLvqKgW-\_G8   | 562 (was 0)                          | chapters              | "Cable Row" chapter, same video.                                                                                                                                                                                                                                                                                                                                                          |
| dumbbell-lateral-raise           | SgyUoY0IZ7A    | 100                                  | chapters              | "Standing Dumbbell Lateral Raise" chapter — self-reported timestamp was already correct.                                                                                                                                                                                                                                                                                                  |
| cable-lateral-raise              | SgyUoY0IZ7A    | 477                                  | chapters              | "Cable Lateral Raise" chapter — already correct.                                                                                                                                                                                                                                                                                                                                          |
| reverse-pec-deck                 | SgyUoY0IZ7A    | 626                                  | chapters              | "Reverse Pec Deck" chapter — already correct.                                                                                                                                                                                                                                                                                                                                             |
| barbell-curl                     | GNO4OtYoCYk    | 116                                  | chapters              | "Barbell Curl" chapter — already correct.                                                                                                                                                                                                                                                                                                                                                 |
| incline-dumbbell-curl            | GNO4OtYoCYk    | 320                                  | chapters              | "Incline Curl" chapter — already correct.                                                                                                                                                                                                                                                                                                                                                 |
| hammer-curl                      | GNO4OtYoCYk    | 786                                  | chapters              | "Hammer Curl" chapter — already correct.                                                                                                                                                                                                                                                                                                                                                  |
| dumbbell-curl                    | GNO4OtYoCYk    | 217 (was none)                       | chapters              | Previously unfound. The same Nippard biceps-ranking video (already used above) has a "Standing DB Curl" chapter at 217s — no new video needed.                                                                                                                                                                                                                                            |
| triceps-pushdown                 | OpRMRhr0Ycc    | 60                                   | chapters              | "Triceps Pressdown (Rope)" chapter — already correct.                                                                                                                                                                                                                                                                                                                                     |
| overhead-cable-triceps-extension | OpRMRhr0Ycc    | 275                                  | chapters              | "Overhead Cable Triceps Extension (Rope)" chapter — already correct (the rope variant, matching this exercise's free-exercise-db id).                                                                                                                                                                                                                                                     |
| skull-crusher                    | OpRMRhr0Ycc    | 410                                  | chapters              | "Skullcrusher" chapter — already correct.                                                                                                                                                                                                                                                                                                                                                 |
| close-grip-bench-press           | OpRMRhr0Ycc    | 728                                  | chapters              | "Close-Grip Bench Press" chapter — already correct.                                                                                                                                                                                                                                                                                                                                       |
| standing-calf-raise              | 21inrjhoFkQ    | 236                                  | chapters + transcript | "Calf raises" chapter starts at 236; transcript confirms "standing variations of calf raises" begins ~240s — already correct.                                                                                                                                                                                                                                                             |
| seated-calf-raise                | 21inrjhoFkQ    | 469 (was 183)                        | transcript            | Old timestamp (183s) fell inside the "Fiber composition" chapter, before calf raises are even demonstrated. Transcript shows the actual seated-calf-raise discussion ("for bent-leg soleus dominated movements you basically have one main option: a seated calf raise") at 469s, inside the "Foot position" chapter.                                                                     |
| plank                            | 1G0y8D5rFDc    | 74 (was 0)                           | chapters              | "Plank" chapter starts at 74, not 0.                                                                                                                                                                                                                                                                                                                                                      |
| ab-wheel-rollout                 | 1G0y8D5rFDc    | 302 (was 210, self-flagged estimate) | chapters              | "AB wheel rollout" chapter starts at 302.                                                                                                                                                                                                                                                                                                                                                 |
| pallof-press                     | mpGF2t51IWE    | 21 (was EvJxS2951P4 @180)            | search+oembed         | Replaced the ATHLEAN-X ranking-video estimate with a dedicated Squat University video ("Physical Therapist Breaks Down The Abs Exercise Going VIRAL", entirely about the Pallof press). Verified via oEmbed: title/channel match. Chapter "Breakdown" (general technique) starts at 21s.                                                                                                  |
| cable-pull-through               | 3ryh7PNhz3E    | 753                                  | chapters              | "Cable Pull Through" chapter — already correct.                                                                                                                                                                                                                                                                                                                                           |
| hip-abduction-machine            | 3ryh7PNhz3E    | 500                                  | chapters              | "Machine Hip Abduction" chapter — already correct.                                                                                                                                                                                                                                                                                                                                        |
| goblet-squat                     | 8sXVbOBFPig    | 480 (was 0, self-flagged estimate)   | chapters              | "3-SEC ECCENTRIC GOBLET SQUAT" chapter starts at 480 in the multi-exercise leg-day video.                                                                                                                                                                                                                                                                                                 |
| push-up                          | IvCknxXOgSA    | 568 (was 3-yAymzidmE @0)             | search+oembed         | Old pick was about rep-progression tactics, not form. Replaced with RP's "11 Pushup Mistakes and How to Fix Them"; oEmbed-verified. "TECHNIQUE BREAKDOWN" chapter starts at 568s.                                                                                                                                                                                                         |
| chin-up                          | 9JC1EwqezGY    | 0 (was PAXkl-AdJFg @0)               | search+oembed         | Old pick (Nippard) was a width-vs-thickness grip comparison, not chin-up-specific. Replaced with RP's dedicated "Underhand Pullup" demo clip (10s); oEmbed-verified.                                                                                                                                                                                                                      |
| farmers-carry                    | kL5ZQqrDQlc    | 0                                    | search (kept)         | Searched RP/Nippard/Squat University for a more current, more focused technique clip; found only discussion videos (e.g. RP's "The Best Lift For Testing Overall Strength", not farmer's-carry-specific) or non-preferred channels. Kept the existing verified Alan Thrall pick — still real, on-topic, and from a preferred channel, even though it's an older training-log-style video. |
| straight-arm-pulldown            | G9uNaXGTJ4w    | 0 (was none)                         | search+oembed         | Previously unfound. RP has a dedicated "Straight Arm Pulldown" demo clip (12s); oEmbed-verified.                                                                                                                                                                                                                                                                                          |
| hack-squat                       | 4cxt_Tldugw    | 217 (was none)                       | search+oembed         | Previously unfound. RP's "9 Hack Squat Mistakes and How to Fix Them" is a dedicated technique video; oEmbed-verified. Chapter "NO STANDARD RANGE OF MOTION" (first named technique chapter) starts at 217s.                                                                                                                                                                               |
| assisted-pull-up                 | vKpqOpjJt18    | 13 (was none)                        | search+oembed         | Previously unfound (a non-preferred REP Fitness clip was flagged but not used). RP's "9 Assisted Pull Up Mistakes and How to Fix Them" is a dedicated technique video; oEmbed-verified. "Intro" chapter starts at 13s.                                                                                                                                                                    |
| seated-dumbbell-shoulder-press   | HzIiNhHhhtA    | 0                                    | search (kept)         | Searched for a longer narrated alternative; the existing RP demo clip's title is an exact match for this exercise and remains the best pick despite being short (~13s).                                                                                                                                                                                                                   |
| preacher-curl                    | sxA\_\_DoLsgo  | 0                                    | search (kept)         | Searched RP for a dedicated preacher-curl mistakes video; found only other curl variants. Kept the existing verified EZ-bar preacher curl demo.                                                                                                                                                                                                                                           |
| hanging-knee-raise               | RD_A-Z15ER4    | 0                                    | search (kept)         | Searched RP for a longer alternative; found only the related (but distinct) "Hanging Straight Leg Raise" and general ab-training videos. Kept the existing dedicated demo clip.                                                                                                                                                                                                           |
| cable-crunch                     | 6GMKPQVERzw    | 0                                    | search (kept)         | Searched RP/Nippard for a longer narrated alternative; found only general ab-training or non-preferred-channel videos. Kept the existing dedicated "Rope Crunch" demo clip.                                                                                                                                                                                                               |
| leg-press                        | B6rGDcfyPto    | 60                                   | chapters (parser fix) | No change to the pick — a bug in this pass's own research-doc parser (the video's title contains a literal "\|", which broke a naive split) had briefly produced a wrong channel string; corrected back to the documented `60`/"Renaissance Periodization". Flagging here since it touched this slug's generated content.                                                                 |
| walking-lunge                    | Z6R8A5tcrTc    | 31                                   | chapters (parser fix) | Same parser issue as leg-press (title also contains a literal "\|"); corrected back to the documented `31`/"Renaissance Periodization".                                                                                                                                                                                                                                                   |

**Not touched (already solid, not flagged for this pass):** all other slugs —
their single-exercise, narrated technique videos from Nippard / RP / Squat
University / Alan Thrall were already dedicated, on-topic clips at `start: 0`
or a directly-relevant timestamp, and needed no correction.

**Still the weakest link:** `farmers-carry` (an older, training-log-style
Alan Thrall video — real and on-topic, but not a tight technique breakdown)
and the four short (~9–15s) silent Renaissance Periodization demo clips kept
above (`seated-dumbbell-shoulder-press`, `preacher-curl`,
`hanging-knee-raise`, `cable-crunch`). All were re-searched during this pass;
none had a better preferred-channel alternative available. Worth another
look if a stronger clip surfaces later, but none are broken or mismatched.
