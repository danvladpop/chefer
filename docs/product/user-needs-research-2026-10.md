# Chefer: User Needs Research & Product Direction

_Last updated 2026-10-02 · owner: Dan. Mirror of the "Chefer: User Needs Research & Product Direction" doc (three tabs: Summary, Interview guide, Full analysis). Ideas parked for later live in [nice-to-have.md](./nice-to-have.md)._

**Read the Summary first; it is the current plan.** Where the Full analysis disagrees with it, the Summary wins.

## Summary

Chefer serves one person well today: a lifter on a fixed routine who cooks to a weekly plan. About a third of gym members train in small groups or with a coach, and many people mix home cooking with eating out. The changes below let chefer serve them without becoming a second app.

### What the research says

- **Coached training is big and growing.**
  - About a third of US gym members do small-group training ([HFA](https://www.healthandfitness.org/how-77-million-fitness-members-work-out-new-hfa-data-reveals-shifting-equipment-training-and-membership-trends/)).
  - A Bucharest coach told Forbes.ro her demand rose 40% in 2025, mostly from women aged 30–40 buying combined training and nutrition plans ([Forbes.ro](https://www.forbes.ro/piata-de-fitness-din-romania-a-atins-970-milioane-lei-in-2024-romancele-investesc-tot-mai-mult-in-coaching-si-sanatate-personalizata-468604)).
- **Class-goers aren't making a worse choice.** Group and solo programmes raise activity about equally, and groups do slightly better on strength ([Nature Human Behaviour 2026](https://www.nature.com/articles/s41562-026-02429-0)). People pick classes for structure, company and enjoyment.
- **Trainers fix the structure and rotate the exercises.** The session shape and movement slots stay the same for 4–6 weeks; the exercises change. Most class members don't log anything today ([CrossFit](https://www.crossfit.com/pro-coach/unlocking-crossfit-athlete-data)).
- **Romanian cities order in a lot.**
  - Over 80% of big-city residents ordered delivery in the last 6 months ([g4food](https://g4food.ro/studiu-romanii-comanda-mancare-mai-des-decat-ies-la-restaurant-bonul-mediu-pentru-o-comanda-este-de-61-lei-persoana-apel-la-sindicalizare-pentru-studii-in-privinta-comportamentului-consumatorilor/)).
  - 33% of office workers order lunch in ([HotNews](https://hotnews.ro/masa-de-prnz-un-angajat-din-3-si-comanda-prnzul-la-birou-n-timp-ce-peste-jumatate-din-salariati-vin-cu-pachetul-pregatit-de-acasa-915030)).

### Gym: what to build, in order

**Step 0, this week:** run the Interview guide with your wife, two women from her group and her trainer. Build steps 2–4 only after that.

| #   | Change                                                                                                                                                                                                                                   | Status today                                                                         | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------ |
| 1   | **Let class-goers in, safely.** A setup path, "I train in classes", that asks how many classes a week (that becomes the weekly goal). It also keeps these sessions out of the progression engine, so they don't move a lifter's targets. | Freestyle exists but sits behind the routine wizard; the engine counts every session | M      |
| 2   | **Class check-in.** Set your weekly class times once. After each class: one tap for "went" or "skipped", plus effort. Duration, calories from your watch, a note and weights are optional.                                               | New                                                                                  | M      |
| 3   | **Progress for varied training.** Classes per week against the goal, effort trend, which movement patterns were covered, "last time" weights                                                                                             | "Last time" already shown; the rest is new                                           | M      |
| 4   | **Cardio** with time, distance and effort                                                                                                                                                                                                | Specced in the technical plan (W2/W5)                                                | L      |

All items ship on web and mobile. Circuits with timers and the trainer platform have moved to [Nice to have](./nice-to-have.md).

**Dropped**, because they clash with your recorded decisions:

- AI import of trainer workouts: the gym makes no AI calls.
- User-built combo exercises: you chose a governed library, so curate combos instead.

Nothing on the gym side uses AI. Every item above is plain rules and data.

### Food: what to build, in order

| #   | Change                                                                                                 | Status today                                                 | Effort |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------ |
| 1   | **"Ate something else" or "Skipped"** on any planned meal: quick estimate, recents, or photo (premium) | Quick add can't replace a planned meal yet; no skipped state | M      |
| 2   | **Neutral copy:** drop "off-plan" and "log it honestly"; praise weekly averages, not perfect days      | Partly planned (B-31)                                        | S      |
| 3   | **Week rebalance that balances protein too**, free (it uses no AI)                                     | Kcal only; premium today                                     | M      |
| 4   | **"How do you eat" setting:** Full plan · Plan what I cook · Just guide me · No numbers                | Parts exist (B-07, B-35)                                     | M–L    |
| 5   | **Light modes:** protein only (about 1.6 g per kg) or a plate guide                                    | Own targets planned (B-35)                                   | M      |

For your wife's segment, protein only (5) probably matters more than a full plan. Revisit its place after the interviews. Cycle tracking is out of scope.

Already planned: photo estimates you can correct (B-37). Menu snap and planning a meal out ahead have moved to Nice to have.

### Profile setting: yes, two questions

Add them to the existing onboarding step, not as a separate "user type". Ship each question with the feature it switches on:

- **How do you train?** Own program, coach or classes, cardio, or a bit of everything. Multi-select. Ships with Gym 1.
- **How do you eat?** One of the four levels. Ships with Food 4.

Keep a single main goal, as today. The answers only set defaults, and everything stays reachable from settings.

### Decisions

**Decided (2 Oct 2026):**

- **Class days on the food plan: a marker, no calorie bump.** Class days show like run days, with a nudge to put protein in the meal after class. Watch numbers are too rough to drive targets. The weekly Adaptive Chef review already corrects calories from the weight trend, so a bump would count the same effort twice.
- **Watch calories** are shown on the class log, never added to food targets. Wrist devices were off by 27–93% on calories in a Stanford study ([Shcherbina 2017 via ACSH](https://www.acsh.org/news/2017/05/24/7-fitness-trackers-deliver-very-inaccurate-data-new-study-shows-11321)).
- **Premium is for heavy AI only:** regenerating the week, AI meal swaps and photo logging. Week rebalance and training-day nutrition use no AI, so they become free. That is a change from today's gating.
- **Trainer platform:** later, after talking to trainers. It is in Nice to have.
- **Plan a meal out ahead:** moved to Nice to have. "Ate something else" covers most of the need for now.

### How you'll know it works

- A class-goer checks in after class in under 10 seconds.
- At week 4, class-goers are still active at the same rate as lifters.

## Interview guide

Three short conversations, about 20 minutes each, plus one timed test. The goal is to check the Summary's gym assumptions (Step 0) before building steps 2–4.

**Ground rules:**

- Ask about the last real session, not habits in general.
- Don't show chefer until the end.
- Write down their exact words.

### 1. Your wife and 3–5 women from her group (one at a time)

1. Walk me through your last class, from arriving to leaving. What did you do, in what order?
2. How did you know what to do next? (screen, trainer, whiteboard, a partner)
3. Which exercises do you remember? Which weights did you use? Would you have known that a month ago?
4. How do you know you're getting better? When did you last feel that?
5. Do you wear a watch in class? Which one? Do you look at the calories afterwards, and what do you do with that number? Do you track anything else (notes, photos, the trainer's app)?
6. What makes you go back every week? What made you miss a week?
7. Has a trainer ever told you what to eat? What do you actually eat on class days? How often do you eat out or order in, and which meals?
8. If an app took 10 seconds after class, what would you want it to show you a month later?

### 2. Her trainer

1. How do you plan a week for this group? What stays the same across weeks, and what changes?
2. Do you work in phases (e.g. 4–6 weeks)? How do you decide when someone goes heavier?
3. How do you send or show the workout today (whiteboard, WhatsApp, an app)?
4. What do you record about each client, and where? What's annoying about it?
5. Would you post the session once if each client could add their own weights? What would stop you?
6. What do your clients ask you about food?

### 3. Timed check-in test (the first gate)

- Right after a real class, show her a paper or Figma mock of the class check-in: "How was Tuesday 18:00?" with _went_ or _skipped_, then effort 1–10. Optional extras: duration, watch calories, note, weights.
- Time it. **Target: under 10 seconds for the check-in alone.**
- Note which optional fields she fills in without being asked. Those are the ones worth keeping.

### What to look for

- **Is "last time" weight the thing they care about?** If they talk mostly about attendance or how they feel, leave circuits and timers in Nice to have.
- **Does the trainer already send workouts in writing?** If yes, the trainer-layer idea gets stronger.
- **Do eat-out meals cluster on certain days** (Friday dinner, weekday lunch)? If yes, "plan a meal out ahead" moves up.

## Full analysis (first pass, kept for reference)

### Read first: corrections from the second pass

The **Summary** tab is the current recommendation. This tab keeps the first-pass analysis for reference. A second pass checked it against chefer's code, chefer's own research docs and primary sources. Where the two tabs disagree, the Summary wins.

- **Already built or planned:**
  - Freestyle workouts exist (G1), but only after routine setup.
  - Supersets and "last time" weights have shipped.
  - Cardio (G6) is fully specced in `04-technical-plan.md`.
  - Photo estimates (F6) are B-37, neutral copy (F8) is B-31, and Health sync (G7) is B-38.
- **Dropped because they conflict with recorded decisions:**
  - G4, AI workout import. The gym plan says the gym "makes zero AI calls" and stays free.
  - G3, user-built combos. You chose a governed exercise library (B-43).
  - Food targets that follow any session type. You decided on 30 Sept: run days are markers only.
- **A new prerequisite.** The progression engine counts every finished session, freestyle included. Class sessions must be excluded before G1 and G2 reach class-goers.
- **Code limits.**
  - Weights and reps can't become optional fields without breaking shipped apps. Keep 0 as the empty value.
  - Logging never takes anything out of the pantry, so F2's "return ingredients to the pantry" is moot.
  - "Budget" already means money in chefer, so F4 should say "weekly target".
- **Evidence corrections.**
  - The 33% photo-underestimate figure is a NUTRITION 2026 conference abstract (NIH, 4 apps, 102 meals), not peer-reviewed.
  - Kassiano 2022 also says _planned_ variation helps.
  - Conlin 2021's authors do not credit the lean-mass gain to the flexible diet.
  - Group and individual programmes are equivalent for activity levels ([Nature Human Behaviour 2026](https://www.nature.com/articles/s41562-026-02429-0)).
- **Romanian data is now in the Summary.** The roadmap at the end of this tab is replaced by the Summary's order.

### Where chefer is today

I read this from the code and docs as they stand on master. The gym side is a strong engine for strength training on a fixed routine. The food side is a strong engine for planned, home-cooked weeks, with early tools for going off-plan.

| Area        | What exists                                                                                                                                                                                                      | What it assumes about the user                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Routines    | Templates (Full Body 2×/3×, Upper/Lower 4×, Push/Pull/Legs 6×), fully editable; rotation pointer; planned weekdays                                                                                               | You repeat the same days for weeks                                   |
| Logging     | Sets of weight × reps with reps-in-reserve (how many reps you had left); warm-ups; offline-first; swap, skip or add for one session                                                                              | Every exercise is a strength set; `isTimed` is the only escape hatch |
| Progression | Per-exercise double progression with deload, stall and comeback offers (`ExerciseProgression` keyed by exercise + rep range)                                                                                     | Progress means more weight or reps on the same exercise              |
| Structure   | `supersetGroup` on a routine exercise                                                                                                                                                                            | Pairs at most; no rounds, timers or scores                           |
| Profile     | Experience (beginner / intermediate), equipment, weekly session goal, pause                                                                                                                                      | One style of training                                                |
| Catalogue   | 54 strength exercises with a `movementPattern` field; no cardio (30 cardio exercises are proposed in the 06 research)                                                                                            |                                                                      |
| Meal plans  | AI or curated weekly plans, "My weeks" templates, Sunday auto-plan, household, pantry, priced shopping list                                                                                                      | You cook most meals at home from the plan                            |
| Tracking    | Tick planned meals with portion chips; quick add (free); chat "I ate this" (free); photo scan (premium)                                                                                                          | Off-plan eating is the exception                                     |
| Adaptation  | Adaptive Chef weekly review (kcal from adherence + weight trend); week rebalance after any log (premium, kcal only, swaps up to 2 future meals); training-day kcal/protein bump (premium, muscle-gain goal only) |                                                                      |
| Onboarding  | Intent (eat better / household / train) and goal (lose / maintain / gain muscle / eat healthier)                                                                                                                 | No "how do you train" or "how do you eat" question                   |

The September persona study already points the same way. Its beachhead is "training cooks", and it calls for training that bends to a chaotic week (B-36), onboarding by job (B-03) and correctable snap-to-log (B-37). This report widens the gym half of that beachhead beyond the self-programmed lifter. It also gives the food half a clear model for eating out.

### Gym: who trains, and what they need

The self-programmed lifter is one of six or seven gym segments, and not the largest. Among US gym members:

- 43.4% use treadmills
- 32.1% use free weights
- 32.3% do small-group training
- 22.6% use a personal trainer

The two coached figures are historic highs ([HFA](https://www.healthandfitness.org/how-77-million-fitness-members-work-out-new-hfa-data-reveals-shifting-equipment-training-and-membership-trends/)). Group strength has grown from 30% to 36% of regular exercisers since 2018. 81% of Gen Z gym-goers do group workouts ([Les Mills 2026](https://www.lesmills.com/articles/2026-global-fitness-report-strength-and-wellness-to-drive-next-wave-of-member-growth), [Les Mills Gen Z](https://www.lesmills.com/us/clubs-and-facilities/research-insights/fitness-trends/landmark-report-lifts-the-lid-on-gen-z-fitness/)). 54% of Strava users track more than one activity type ([Strava 2025](https://www.prnewswire.com/news-releases/strava-releases-12th-annual-year-in-sport-trend-report-revealing-that-doomscrolling-is-out-movement-is-in-302631107.html)).

| Segment                                                        | Rough size signal                                                                                                                                        | What they want from an app                                                           | What "progress" means to them                                                       | Chefer fit today                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Self-programmed lifter** (you)                               | 32% use free weights                                                                                                                                     | A fixed plan, fast set logging, overload suggestions                                 | More weight or reps on the same lifts; strength and size                            | Strong                                               |
| **Coached / small-group functional** (your wife)               | 32% small-group, 22.6% PT                                                                                                                                | Log a workout someone else designed, quickly, after the class; see they're improving | Showing up, feeling fitter, lifting heavier dumbbells than last month, body changes | Weak: no circuits, combos or session-level logging   |
| **Class and studio goers** (Pilates, barre, F45, Orangetheory) | Pilates +66%, barre +30% ClassPass bookings in 2025 ([SGB](https://sgbonline.com/pilates-dominates-fitness-bookings-for-classpass-in-2025/))             | A record of attendance; minutes; maybe heart rate                                    | Consistency and how they feel                                                       | None                                                 |
| **Cardio / endurance** (run, bike, row, swim)                  | Treadmill is the most-used piece of kit; run clubs 3.5× on Strava                                                                                        | Duration, distance, pace, heart rate, wearable sync                                  | Faster, longer, lower heart rate at the same pace                                   | None; the 06 research has the model                  |
| **Hybrid athlete** (lift + run, HYROX)                         | HYROX 1.5M athletes in 2025/26, 2M projected ([BoxRox](https://www.boxrox.com/hyrox-expands-global-2026-27-season-to-2-million-athletes-and-107-races/)) | Strength and conditioning in one place                                               | Both lifts and times                                                                | Half                                                 |
| **Casual / health** ("I should move more")                     | Mental wellbeing is the top reason for 78% ([ACSM 2026](https://acsm.org/top-fitness-trends-2026/))                                                      | Low friction, encouragement, no jargon                                               | Doing it at all; weekly minutes; mood                                               | Partial: good beginner onboarding, but strength-only |

**Motivation differs more by format than by gender.** Group exercisers were 26% less likely to cancel their gym membership than gym-only members ([Health Club Management](https://www.healthclubmanagement.co.uk/health-club-management-features/GX-vs-gym/28885)). Women over-index on group and coached formats. They also rated fitness and enjoyment motives higher, while men rated appearance higher ([MDPI](https://www.mdpi.com/2075-4663/9/8/113)). "Women are social, men track numbers" is too simple, though. Women's weight-training uploads were Strava's fastest-growing category in 2024 ([Strava](https://press.strava.com/articles/strava-releases-annual-year-in-sport-trend)).

### Understanding varied, trainer-led training

What looks chaotic is usually structured one level up. A good trainer keeps the **movement patterns** constant across weeks: squat, hinge, lunge, push, pull, carry, rotate, plus conditioning. What changes is the **exercise** that fills each pattern. A dumbbell lunge into an overhead press is a lunge pattern plus a vertical push. Medicine-ball slams are power and conditioning. Next week, a goblet squat and a push press may cover the same ground.

**Why trainers do it (with evidence):**

- **Enjoyment and adherence, which is the main reason.** In an RCT with 121 inactive adults, a high-variety program produced higher adherence ([Sylvester 2016](https://link.springer.com/article/10.1007/s10865-015-9688-4)). In trained men, randomly varied exercises gave the same muscle and strength gains as a fixed plan. Motivation rose in the varied group and fell in the fixed group ([Baz-Valle 2019](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0226989)). Enjoyment _during_ exercise predicts whether people keep exercising ([review](https://link.springer.com/article/10.1007/s12160-015-9704-5)).
- **General fitness, not one quality.** High-intensity functional training is built from multi-joint movements that can be scaled to any level and are "constantly varied" ([Kennesaw](https://digitalcommons.kennesaw.edu/facpubs/4262/)). The goal is broad capacity: strength, power, stamina and coordination together.
- **Group logistics.** Ten people share a limited set of dumbbells, balls and floor space. Stations and circuits keep everyone moving.
- **"Muscle confusion" is not a real reason.** Muscles adapt; they don't get confused. Too much random change does cost something: a review of 8 studies warns that excessive random variation can blunt gains ([Kassiano 2022](https://newbaselineclimbing.com/does-varying-resistance-exercises-promote-superior-muscle-hypertrophy-and-strength-gains-a-systematic-review/), secondary summary). Good trainers rotate exercises and keep the patterns.

**So your instinct and hers are both right, for different goals.** For maximum size and strength, your fixed routine wins on precision. For fitness, enjoyment and sticking with it for years, her format is at least as good, and probably better for most people.

**What she would actually want from chefer** (a hypothesis to check with her and her group):

- Log a session in under a minute after class, without setting anything up first.
- See that she's consistent: sessions per week, a streak that survives a missed week.
- See "last time you did walking lunges you used 8 kg; today 10 kg", even if it was 5 weeks ago.
- Know which body areas she worked this week, without counting sets.
- Possibly share with the group or the trainer, since the social side is the point.

### Gym: recommendations

The principle: **one data model, several ways in.** The routine, progression engine and offline logging stay as they are for lifters. Everything below is additive. Each item has an ID (G1–G9) for the roadmap.

**G1. "Log what I did" without a routine.** A session can already exist without a routine (`routineId` is nullable). Make that a first-class entry point on the Gym home: _Start empty_, _Repeat a past session_, or _Import_. After class, she picks exercises from recents, ticks rounds, and optionally adds weights. Weight and reps per set become optional. A ticked exercise with no numbers still counts.

**G2. Workout blocks.** Add one layer between session and exercise: a block with a type. The existing `supersetGroup` becomes a special case.

| Block type         | Example                                  | What is logged                               | Score                            |
| ------------------ | ---------------------------------------- | -------------------------------------------- | -------------------------------- |
| Straight sets      | Bench 3×8                                | weight × reps per set (today)                | per-exercise progression (today) |
| Superset / circuit | 3 rounds: lunge-press, ball slams, plank | rounds completed; optional load per exercise | rounds                           |
| AMRAP              | As many rounds as possible in 12 min     | time cap                                     | rounds + reps                    |
| EMOM               | Every minute on the minute, 10 min       | minutes, reps per minute                     | reps                             |
| For time           | 50 burpees for time                      | target work                                  | time                             |
| Intervals          | 8 × (30 s on / 90 s off)                 | work and rest seconds                        | completed intervals              |

With a built-in timer (countdown, EMOM beep, round counter), the app becomes useful _during_ a class too. Competitors split here: Strong and Hevy treat circuits as long supersets with no rounds or score. SugarWOD and WodBuddy model AMRAP, EMOM and For Time properly. Trainerize has explicit Circuit and Interval types. Chefer can have both.

**G3. Combo movements.** "Lunge + overhead press" should not need its own catalogue entry. Let a user build a combo from 2–3 catalogue movements. It takes one load, its muscles are the union of its parts, and its pattern tags are inherited, so it still counts toward lunge and vertical push. A curated set of the 20–30 most common combos (thruster, clean and press, burpee to box jump, lunge + curl) covers most classes.

**G4. Import a trainer's workout.** Chefer already turns recipe videos and links into structured, reviewable drafts. Apply the same pipeline to workouts: a photo of the whiteboard, a WhatsApp message from the trainer, or pasted text becomes blocks plus exercises. Unknown names are matched to the catalogue, and the user confirms the result. WodBuddy does exactly this with whiteboard photos. It is the fastest route to "log in under a minute".

**G5. Progress for people whose workouts don't repeat.** Progress is already stored per exercise, so varied training still builds history. It just needs surfacing:

- **"Last time" cards.** When an exercise shows up again after weeks, show the last load and reps, and celebrate a beat.
- **Pattern balance.** Weekly coverage by movement pattern (squat, hinge, lunge, push, pull, carry, core, conditioning) using the existing `movementPattern` field. This replaces set-counting per muscle for these users.
- **Session effort.** Ask one question at the end: "How hard was that?" on a 1–10 scale. Effort × minutes gives a training-load number that tracks heart-rate-based load across sports ([Frontiers](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/pdf)). Show it as a weekly bar.
- **Benchmarks.** Optionally repeat a short test monthly (e.g. max push-ups, a 1 km row, a 10-minute AMRAP) to see fitness trend over time. Beyond the Whiteboard builds a whole fitness score on this idea ([BTWB](https://support.btwb.com/en/support/solutions/articles/35000172933-what-is-fitness-level-how-does-it-work-)).
- **Consistency first.** Sessions and minutes per week, with "come back" mechanics instead of streaks that break. In a 61,293-person megastudy, the best intervention was a small reward for returning after a missed workout ([CMU](https://www.cmu.edu/dietrich/news/news-stories/2021/megastudy-exercise.html)).

**G6. Cardio as a first-class activity.** Adopt the 06 cardio research as written:

- `trackingType` on exercises
- duration, distance, effort and heart-rate fields on sets
- cardio equipment
- a 30-exercise catalogue

Also add three things:

- **A standalone "cardio session"** (a run, a bike ride) that never touches the strength UI.
- **The WHO target as a ring:** 150–300 moderate minutes plus 2 strength days a week ([WHO 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/)). It suits every segment, including casual users.
- **Mixed sessions.** Class conditioning counts toward cardio minutes.

**G7. Health sync, moved earlier.** Apple Health / Health Connect sync (B-38, currently Later) should come forward once cardio ships. Cardio and class users already record on a watch, and making them type a run twice is a deal-breaker. Read workouts in, write chefer sessions out. Both platforms already have HIIT and functional-strength workout types.

**G8. Trainer and group layer (later, possibly a business line).** The owner already floated a "trainer" role for adding exercises. Take that further: a trainer publishes this week's sessions to a group, members log against them, and the trainer sees attendance and loads. That is how TrueCoach, Trainerize and Ladder work. It is also a distribution channel, because one trainer brings ten clients. Do it only after G1–G5 prove that varied trainees stick around.

**G9. Don't over-engineer the varied user's progression.** Don't run the overload engine on circuits. Suggest loads only when an exercise repeats inside the same block type, and otherwise just show "last time". Trying to prescribe week-over-week targets for a routine that never repeats would be wrong and annoying.

### Should chefer have user types?

Yes, but as preferences that set defaults, not as identities that gate features. Your instinct is right that one UI can't serve the lifter, the class-goer and the runner equally. A rigid "type" breaks for the many people who mix: Strava's 54% multi-activity users, hybrid athletes, and a lifter who also runs on Sundays. Among the apps I checked, only Ladder routes users by preferred training _style_ at onboarding. Fitbod and JEFIT personalise by goal and experience.

**Recommended shape: two short questions, multi-select, changeable any time in Gym settings.**

| Question                                    | Options                                                                                                                               | What it changes                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **How do you train?** (pick all that apply) | I follow my own program · I train with a coach or in classes · Cardio: running, cycling, rowing · A bit of everything / just starting | Gym home screen, default logging mode, which blocks show first, whether routine setup is offered    |
| **What's it for?** (pick one main)          | Build muscle · Get stronger · Lose fat · Fitness and health · Train for an event                                                      | Which progress charts lead, nutrition targets (protein, training-day carbs), copy and encouragement |

How the defaults play out:

- **Own program + build muscle (you).** Today's experience: routine, overload, volume per muscle.
- **Coach/classes + fitness (your wife).** Home shows "Log today's class" and recent sessions. Logging opens in quick mode with blocks. Progress leads with consistency, minutes, pattern balance and "last time" bests. Routine setup is offered but not pushed.
- **Cardio + event.** Home shows weekly minutes and distance, health sync, and cardio sessions.
- **A bit of everything + health.** Home shows the WHO ring and a gentle suggestion for today, with nothing that needs setting up.

Two safeguards keep this from getting complicated:

1. **Everything stays reachable.** A coached user can still build a routine, and a lifter can still log a class.
2. **The app can suggest a switch.** If someone set "own program" but has logged five ad-hoc sessions in a row, offer "Looks like your workouts change each week. Switch to class mode?"

This fits the persona study's B-03 (onboarding by job). It also gives you a clean analytics dimension for seeing which segments retain.

### Food: who eats how, and what they need

The typical user is neither a meal-prepper nor a delivery addict. They are a hybrid: they cook most days and eat out or order a few times a week. In the US, 76% cook at least a few times a week, 34% get takeout weekly and 17% order delivery weekly ([YouGov 2026](https://yougov.com/en-us/articles/54098-food-delivery-takeout-cooking)). Food away from home is now 56% of US food spending ([USDA ERS](https://www.ers.usda.gov/data-products/chart-gallery/chart-detail?chartId=58364)).

Romania leans more toward home cooking. Food at home is 23.1% of household spending versus 13.2% for the EU ([Eurostat](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Household_consumption_by_purpose)). Delivery is still growing fast there: Glovo orders were up 26% in 2025, 34% in Bucharest ([Bugetul](https://www.bugetul.ro/piata-food-delivery-romania-2026-glovo-bolt-wolt-miliarde-euro/), press figures). I found no Romanian survey of how often people order, which is worth asking your own users.

| Segment                         | What they want                                                        | What breaks them in a strict plan                                          | Chefer fit today                                                           |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Planner / meal-prepper**      | A week decided for them, macros hit, one shopping list                | Rigid days that don't match batch cooking (B-09)                           | Strong                                                                     |
| **Hybrid eater** (the majority) | A plan for the meals they cook, and a painless way to handle the rest | Every meal out reads as "off plan"; the plan and list assume 21 home meals | Partial: quick add and rebalance exist; rebalance is premium and kcal-only |
| **Mostly eats out / delivery**  | Help choosing _what_ to order; rough numbers                          | Recipes and shopping lists are irrelevant                                  | Weak                                                                       |
| **Precision tracker**           | Their own targets, fast accurate logging, correctable photos          | Wrong targets; can't fix estimates (B-35, B-37)                            | Partial                                                                    |
| **Non-counter / intuitive**     | Eat well for training without numbers                                 | Calorie rings, red numbers, "failed" days                                  | Weak: the calorie ring is the default home (B-31 already says stop)        |

**Why strict tracking fails so often.**

- In a real-world study, 80% of MyFitnessPal users found it easy, but only 20% would keep using it. They also missed about 18% of food items ([Chen 2019](https://www.sciencedirect.com/science/article/abs/pii/S0899900718303678)).
- Health and fitness apps keep about 3% of users at day 30 ([Business of Apps](https://www.businessofapps.com/data/health-fitness-app-benchmarks/)).
- Shame about logging "bad" food and missing rigid targets is a recurring theme in user posts ([UCL 2025](https://www.ucl.ac.uk/news/2025/oct/emotional-strain-fitness-and-calorie-counting-apps-revealed)).
- Former calorie-app users scored higher on both thinness- and **muscularity**-oriented disordered eating ([Messer 2021](https://www.sciencedirect.com/science/article/abs/pii/S1471015321000957)). That matters for a gym audience.

**What works instead.**

- **Regular, imperfect logging beats precision.** Daily engagement was the top predictor of weight loss ([MDPI](https://www.mdpi.com/2072-6643/18/11/1766)).
- **One meal can carry most of the value.** In Noom's data, logging dinner alone was the strongest predictor of success (OR 10.7) ([Nature Sci Rep](https://www.nature.com/articles/srep34563)).
- **Flexible beats rigid on side effects.** Flexible dieting matched a rigid meal plan for fat loss in lifters ([Conlin 2021](https://fitchef.com/studies/flexible-vs-strict-dieting-muscle/), secondary, small n). Rigid, not flexible, dieting is linked to eating-disorder symptoms ([Appetite](https://www.sciencedirect.com/science/article/abs/pii/S0195666301904453)).
- **People want protein help.** 71% of Americans try to eat more protein, but 79% don't know their need ([IFIC](https://ific.org/media/protein-dazed-and-still-confused-new-ific-research-reveals-americas-high-protein-hype-doesnt-match-knowledge/)).

### Food: recommendations

The principle mirrors the gym side: **the plan is a default, not a contract.** Each item has an ID (F1–F8) for the roadmap.

**F1. A "how do you eat?" setting with four levels.** Changeable any time; it sets defaults, not locks.

| Level             | Who                | Plan                                                       | Tracking                                | Home shows                                  |
| ----------------- | ------------------ | ---------------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Full plan         | Planners, preppers | All meals                                                  | Tick planned meals                      | Today's meals + macros                      |
| Plan what I cook  | Hybrid eaters      | Only chosen slots (e.g. dinners, or weekday lunches); B-07 | Planned meals + quick logs for the rest | Tonight's dinner + protein so far           |
| Guide me, no plan | Mostly eat out     | None (recipes optional)                                    | Optional photo/describe logs            | Protein target, ordering tips, weekly trend |
| No numbers        | Non-counters       | Optional                                                   | None; plate or hand portions only       | Meal ideas, plate guide, training-day tips  |

**F2. "I ate something else" on every planned meal.** One tap on a planned slot opens:

- _Ate out / ordered_: photo, describe in words, or pick a cuisine and size (light / normal / big)
- _Ate something from home_: recents and favourites
- _Skipped it_

The estimate is logged and the planned recipe's ingredients go back to the pantry, so they can be reused later in the week. Quick add and chat logging already exist. This puts them where the decision actually happens.

**F3. Plan meals out in advance.** While planning, mark "Friday dinner: out" or "Saturday: no plan". The plan leaves a calorie and protein allowance for that slot, and the shopping list doesn't buy for it. This answers the persona study's "this is a restaurant menu, not a meal-prep plan" complaint.

**F4. Week-level budgets, rebalanced.** Weekend overeating is a well-documented reason dieters stall ([Racette 2008](https://www.sciencedaily.com/releases/2008/07/080701115649.htm)). Intermittent and continuous restriction work equally well ([meta-analysis](https://www.jomes.org/journal/view.html?doi=10.7570%2Fjomes22050)).

Show a **weekly** calorie and protein budget alongside the daily one. Chefer's existing week rebalance is ahead of competitors: Eat This Much and Fitia only re-balance the current day. Extend it:

- rebalance protein, not only kcal
- update the shopping list and pantry after a swap
- explain each swap in one line (B-11)
- give free users the explanation ("you're 600 kcal over for the week; here's how Thursday could absorb it") even if the automatic swap stays premium

**F5. Menu and delivery helper.** For people who eat out a lot, the useful moment is _before_ ordering. Snap a menu, or pick a cuisine (shawarma, pizza, sushi, burger, Romanian lunch menu), and chefer suggests the best fit for what's left of today's protein and calories. This is a likely differentiator: no checked competitor does it well. Glovo, Bolt Food and Wolt deep links are a possible later partnership (the persona study lists them as "partners, not rivals").

**F6. Honest photo estimates.** AI photo apps under-estimated weighed meals by about 33%, mostly fat ([NIH 2026 abstract via Medical Daily](https://www.medicaldaily.com/ai-calorie-tracking-apps-underestimate-calories-fat-nih-study-2026-476487)). After a scan, ask one follow-up ("Was it cooked in oil or with a sauce?") and round up for restaurant food. Show the estimate as a range. This is B-37 plus a bias fix.

**F7. Light-tracking modes.**

- **Protein only.** One number for lifters who won't count: about 1.6 g per kg per day, beyond which extra protein stops adding muscle ([Morton 2018](http://breathe-edu-downloads.s3.amazonaws.com/Morton-2018.pdf)). Show it as "30–40 g per meal" or "a palm or two".
- **Hand portions or the plate method.** Half vegetables, a quarter protein, a quarter carbs ([Harvard](https://www.health.harvard.edu/healthbeat/building-a-plan-for-healthy-eating)). Hand estimates were within 25% for 80% of foods with a regular shape, such as bread or fruit ([Cambridge](https://www.cambridge.org/core/journals/journal-of-nutritional-science/article/accuracy-of-hands-v-household-measures-as-portion-size-estimation-aids/E7193B701BF92DDF0A043D71EE70C95A)).
- **Log one meal.** Dinner, or meals out only.

The Adaptive Chef review should then work on partial data: use the weight trend plus whatever was logged, the way MacroFactor's adherence-neutral approach does ([MacroFactor](https://macrofactor.com/adherence-neutral/)).

**F8. Adherence-neutral language everywhere.**

- No red numbers and no "failed" days.
- "Over" and "under" are reported, not judged.
- Celebrate the weekly average, not the perfect day.
- In onboarding, offer "No numbers" as an equal option, not a lesser one. That is the main guardrail against disordered-eating harm for a gym audience.

### How gym and food connect, and who else does this

Chefer's moat is the link between the two halves, so every new training style should feed the food side. Today's training-day bump only fires for muscle-gain lifters with a finished or scheduled routine. Widen it (B-06) so that any logged session counts, whether a class, a run or a lift, and so the type of session shapes the adjustment:

| Session type                | Food adjustment on that day                                   |
| --------------------------- | ------------------------------------------------------------- |
| Strength (routine or class) | Protein emphasis; a modest kcal bump if the goal is muscle    |
| Conditioning / HIIT class   | Kcal bump from effort × minutes; post-session protein + carbs |
| Long cardio (60 min+)       | Carbs before and after; fluids reminder                       |
| Rest day                    | Base targets; no guilt copy                                   |

**Competitive map.** No checked app covers the varied trainee _and_ the flexible eater _and_ planned cooking. Ladder comes closest on the gym and logging side, but it has no meal planning.

| App                                                                                                                               | Fixed-routine lifting             | Varied / class / circuits                        | Cardio                       | Meal planning    | Flexible / eat-out logging                        |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ | ---------------------------- | ---------------- | ------------------------------------------------- |
| **Chefer today**                                                                                                                  | Strong                            | Weak                                             | None                         | Strong           | Partial (week rebalance)                          |
| [Hevy](https://www.hevyapp.com/features/track-workouts/) / [Strong](https://help.strongapp.io/article/98-supersets-and-circuits)  | Strong                            | Supersets only                                   | Duration / distance          | —                | —                                                 |
| [Fitbod](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout)                                   | AI-generated, varies each session | Circuits                                         | Imports from Health / Strava | —                | —                                                 |
| [SugarWOD](https://www.sugarwod.com/athlete-features/) / [WodBuddy](https://wodbuddy.app/)                                        | —                                 | AMRAP / EMOM / For Time; whiteboard photo import | Partial                      | —                | —                                                 |
| [Trainerize](https://help.trainerize.com/hc/en-us/articles/208688896-What-Types-of-Workouts-Can-I-Create)                         | Trainer-built                     | Circuit + Interval types                         | Watch                        | Trainer add-on   | Partial                                           |
| [Ladder](https://www.joinladder.com/)                                                                                             | Coach programs                    | New coach workouts weekly; team community        | Partial                      | —                | Nutrition logging                                 |
| [MacroFactor](https://macrofactor.com/new-food-logger/)                                                                           | Workouts add-on                   | —                                                | —                            | —                | Strong: quick add, AI describe, adherence-neutral |
| [MyFitnessPal](https://www.prnewswire.com/news-releases/myfitnesspal-announces-its-2025-summer-release-302536319.html) (+ Cal AI) | —                                 | —                                                | Syncs                        | Premium+ planner | Strong: restaurants, scan                         |
| [Eat This Much](https://blog.eatthismuch.com/eat-this-much-tutorial-8-traking-what-you-eat-and-your-progress/)                    | —                                 | —                                                | —                            | Strong           | Regenerates the rest of the **day**               |

The gap chefer can own: **"the app that plans your food around however you train"**. That covers a lifter's split, a Tuesday class with friends, a Saturday long run, and the Friday pizza you planned for.

### Roadmap and what to validate

Start by widening the door, because each Now item is small and reuses what exists. Go deeper only once real class-goers show they will log.

_(The doc shows a roadmap diagram here. It is superseded by the Summary's order above.)_

The Now items mostly re-expose existing pieces: nullable `routineId`, quick add, chat logging, the 06 cardio model. That keeps them cheap. They fit the persona study's Now bucket as extensions of B-03, B-07, B-19 and B-36, not as a new track. Week rebalance and photo scan are premium today. Keep the automatic version premium, but make the explanation and the manual "I ate something else" free, consistent with the existing "logging off-plan food is free" principle.

**Validate before building the Next column.** All of this rests on desk research and one household, so these are hypotheses.

- [ ] Watch your wife and 3–5 people from her group log one real class in a prototype, and time it. The target is under 60 seconds.
- [ ] Ask her trainer how they plan a week: what stays fixed, what rotates, and how they'd want to send workouts to clients (WhatsApp, a photo, an app).
- [ ] Ask 10 chefer users how many meals a week they eat out or order in, and which ones (weekday lunch? Friday dinner?). No Romanian data on this exists.
- [ ] Test the two profile questions on 10 new sign-ups. Count how many pick more than one training style; if most do, multi-select is confirmed.
- [ ] Track 4-week retention by training style and by eating level once the profile questions ship. That is the evidence for the second gate.

**Open decisions for you.**

- Do weights and reps stay optional for every user, or only in class mode?
- Is the trainer layer (G8) a product direction you want, given it turns chefer partly into a B2B tool?
- Which parts of the flexible-food work are free and which are premium?

### Sources

Internal: `gym_plan.md`, `business_flow.md` §15, `schema.prisma`, `docs/persona-study-2026-09/synthesis/02-business-strategy.md` and `06-cardio-research.md`, and owner feedback from 2026-09-27.

The research below was gathered on 2026-10-02. Some figures came from secondary write-ups because the original was paywalled or blocked; those are marked "secondary" in the text.

**Training**

- [HFA: how 77M members work out](https://www.healthandfitness.org/how-77-million-fitness-members-work-out-new-hfa-data-reveals-shifting-equipment-training-and-membership-trends/)
- [Les Mills 2026 Global Fitness Report](https://www.lesmills.com/articles/2026-global-fitness-report-strength-and-wellness-to-drive-next-wave-of-member-growth)
- [Les Mills Gen Z report](https://www.lesmills.com/us/clubs-and-facilities/research-insights/fitness-trends/landmark-report-lifts-the-lid-on-gen-z-fitness/)
- [ACSM Top Fitness Trends 2026](https://acsm.org/top-fitness-trends-2026/)
- [ClassPass 2025 via SGB](https://sgbonline.com/pilates-dominates-fitness-bookings-for-classpass-in-2025/)
- [Strava Year in Sport 2025](https://www.prnewswire.com/news-releases/strava-releases-12th-annual-year-in-sport-trend-report-revealing-that-doomscrolling-is-out-movement-is-in-302631107.html)
- [Strava Year in Sport 2024](https://press.strava.com/articles/strava-releases-annual-year-in-sport-trend)
- [HYROX 2026/27 via BoxRox](https://www.boxrox.com/hyrox-expands-global-2026-27-season-to-2-million-athletes-and-107-races/)
- [Group exercise vs gym retention (Health Club Management)](https://www.healthclubmanagement.co.uk/health-club-management-features/GX-vs-gym/28885)
- [Motives by gender in fitness centres (MDPI Sports)](https://www.mdpi.com/2075-4663/9/8/113)
- [Baz-Valle 2019, exercise variation (PLOS ONE)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0226989)
- [Kassiano 2022 summary](https://newbaselineclimbing.com/does-varying-resistance-exercises-promote-superior-muscle-hypertrophy-and-strength-gains-a-systematic-review/)
- [Sylvester 2016, variety and adherence](https://link.springer.com/article/10.1007/s10865-015-9688-4)
- [Affect during exercise and future activity](https://link.springer.com/article/10.1007/s12160-015-9704-5)
- [HIFT definition (Kennesaw)](https://digitalcommons.kennesaw.edu/facpubs/4262/)
- [Session-RPE validity (Frontiers)](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/pdf)
- [BTWB Fitness Level](https://support.btwb.com/en/support/solutions/articles/35000172933-what-is-fitness-level-how-does-it-work-)
- [Exercise megastudy (CMU)](https://www.cmu.edu/dietrich/news/news-stories/2021/megastudy-exercise.html)
- [Health & fitness app benchmarks](https://www.businessofapps.com/data/health-fitness-app-benchmarks/)
- [WHO 2020 guidelines](https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/)
- Apps: [Strong](https://help.strongapp.io/article/98-supersets-and-circuits), [Hevy](https://www.hevyapp.com/features/track-workouts/), [Fitbod](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout), [Trainerize](https://help.trainerize.com/hc/en-us/articles/208688896-What-Types-of-Workouts-Can-I-Create), [SugarWOD](https://www.sugarwod.com/athlete-features/), [WodBuddy](https://wodbuddy.app/), [Ladder](https://www.joinladder.com/)

**Nutrition**

- [USDA ERS food-away-from-home share](https://www.ers.usda.gov/data-products/chart-gallery/chart-detail?chartId=58364)
- [YouGov 2026: delivery, takeout, cooking](https://yougov.com/en-us/articles/54098-food-delivery-takeout-cooking)
- [Eurostat household consumption](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Household_consumption_by_purpose)
- [Romania delivery market (Bugetul)](https://www.bugetul.ro/piata-food-delivery-romania-2026-glovo-bolt-wolt-miliarde-euro/)
- [IFIC protein survey](https://ific.org/media/protein-dazed-and-still-confused-new-ific-research-reveals-americas-high-protein-hype-doesnt-match-knowledge/)
- [Chen 2019, MyFitnessPal in real life](https://www.sciencedirect.com/science/article/abs/pii/S0899900718303678)
- [Engagement and weight loss (MDPI Nutrients)](https://www.mdpi.com/2072-6643/18/11/1766)
- [UCL 2025, emotional strain of tracking apps](https://www.ucl.ac.uk/news/2025/oct/emotional-strain-fitness-and-calorie-counting-apps-revealed)
- [Messer 2021, calorie apps and disordered eating](https://www.sciencedirect.com/science/article/abs/pii/S1471015321000957)
- [Rigid vs flexible dieting (Appetite)](https://www.sciencedirect.com/science/article/abs/pii/S0195666301904453)
- [Noom predictors (Nature Sci Rep)](https://www.nature.com/articles/srep34563)
- [Flexible vs rigid dieting in lifters, summary](https://fitchef.com/studies/flexible-vs-strict-dieting-muscle/)
- [Racette 2008, weekend eating](https://www.sciencedaily.com/releases/2008/07/080701115649.htm)
- [Intermittent vs continuous restriction meta-analysis](https://www.jomes.org/journal/view.html?doi=10.7570%2Fjomes22050)
- [AI calorie apps underestimate (NIH 2026 abstract)](https://www.medicaldaily.com/ai-calorie-tracking-apps-underestimate-calories-fat-nih-study-2026-476487)
- [Hand vs household measures (Cambridge)](https://www.cambridge.org/core/journals/journal-of-nutritional-science/article/accuracy-of-hands-v-household-measures-as-portion-size-estimation-aids/E7193B701BF92DDF0A043D71EE70C95A)
- [Harvard healthy plate](https://www.health.harvard.edu/healthbeat/building-a-plan-for-healthy-eating)
- [Morton 2018 protein meta-analysis](http://breathe-edu-downloads.s3.amazonaws.com/Morton-2018.pdf)
- Apps: [MacroFactor adherence-neutral](https://macrofactor.com/adherence-neutral/), [MacroFactor logger](https://macrofactor.com/new-food-logger/), [MyFitnessPal 2025 release](https://www.prnewswire.com/news-releases/myfitnesspal-announces-its-2025-summer-release-302536319.html), [Eat This Much](https://blog.eatthismuch.com/eat-this-much-tutorial-8-traking-what-you-eat-and-your-progress/)
