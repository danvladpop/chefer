# Exercise library expansion — research (2026-10-02)

Research behind [`plan-library-supersets.md`](./plan-library-supersets.md). The
proposed rows are in [`proposals.json`](./proposals.json) (95 strength
exercises, 37 P1 staples and 58 P2).

## 1. There is no "USDA for exercises"

The ingredient catalog cites USDA FoodData Central row by row. Exercise science
has no equivalent official dataset. The official bodies define **what a program
must cover and how much**, not a list of exercises:

| Source                                                                                                                                                                                          | What it requires of an exercise library                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HHS _Physical Activity Guidelines for Americans_, 2nd ed. (2018), [PDF](https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf) — US Government work | Muscle-strengthening on ≥ 2 days/week for "the major muscle groups — legs, hips, back, chest, abdomen, shoulders, and arms". One set of 8–12 reps works; 2–3 sets may work better. Older adults: multicomponent (balance + strength) activity. Bands, bodyweight and kettlebells count. |
| WHO 2020 guidelines, [Bull et al., BJSM](https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/)                                                                                                     | All major muscle groups, ≥ 2 days/week. Age 65+: functional balance and strength ≥ 3 days/week.                                                                                                                                                                                         |
| ACSM Position Stand 2009, [PubMed 19204579](https://pubmed.ncbi.nlm.nih.gov/19204579/)                                                                                                          | Bilateral **and unilateral**, single- **and** multi-joint exercises; large before small. Novice 8–12 RM; hypertrophy 6–12 RM with 1–2 min rest; strength 1–6 RM with 3–5 min rest; endurance > 15 reps.                                                                                 |
| ACSM Position Stand 2026 (Currier … Phillips), MSSE 58(4):851–872, [summary](https://acsm.org/science-spotlight-acsm-releases-new-position-stand-on-resistance-training/)                       | All major muscle groups ≥ 2×/week; hypertrophy ≥ 10 sets/muscle/week; 2–3 reps in reserve is enough; machine vs free weight makes no consistent difference; bands, bodyweight and home training all work; unilateral work transfers (cross-education).                                  |
| 2024 Adult Compendium of Physical Activities, [pacompendium.com](https://pacompendium.com/)                                                                                                     | Cardio MET values. Free for commercial use; cite it and do not change the values.                                                                                                                                                                                                       |

**Coverage gaps in the current 80 strength rows** (measured against the above):
no adductor exercise; no anti-lateral-flexion or rotation core work; no
SMITH / KETTLEBELL / BAND rows although the enum supports them; abductors and
floor ab work only on machines; no machine shoulder press, pec deck or Smith
machine; little balance work (only lunges and single-leg RDL). Many common
machine and cable variants are only aliases of another exercise ("Pec Deck",
"Cable Crossover", "T-Bar Row", "Rope Pushdown", "Hanging Leg Raise").

Default reps and rest used for the proposals follow ACSM 2009 / NSCA and the
existing catalog: heavy barbell compounds 4–10 reps, 150–180 s; machine,
dumbbell and cable compounds 8–12, 90–120 s; isolation 10–15, 60–90 s; small
muscles 12–20, 60–90 s; timed holds 20–60 s.

## 2. Open datasets and licences (checked at the primary source)

| Dataset                                                         | Size                           | Licence                                                                                       | Use in Chefer                                                                                 |
| --------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 876 rows, 2 JPGs each          | Repo: The Unlicense. **Images: provenance unknown — see §3.**                                 | Names/muscles/equipment are facts; we write our own cues. Ids are a useful cross-reference.   |
| [wger](https://wger.de/api/v2/exerciseinfo/)                    | 916 rows; 378 images (276 ex.) | Per row: CC-BY-SA 4.0 (763), CC-BY-SA 3.0 (132), CC0 (21). Per image licence + author fields. | Usable with attribution; derived data must stay CC-BY-SA. 42 images are flagged AI-generated. |
| [Everkinetic](https://github.com/everkinetic/data)              | 293 rows, 254 line drawings    | CC-BY-SA 4.0                                                                                  | Usable with attribution; one consistent illustration style.                                   |
| ExerciseDB                                                      | 1.5k free / 11k paid           | Free tier non-commercial; paid tier no redistribution                                         | Paid only.                                                                                    |
| MuscleWiki                                                      | ~2k                            | No offline storage, short cache limits                                                        | Not usable.                                                                                   |

## 3. ⚠️ Photo provenance (owner decision needed)

The photos under `apps/api/static/exercises/` come from free-exercise-db, which
was rebuilt from [wrkout/exercises.json](https://github.com/wrkout/exercises.json).
That project's own
[CONTRIBUTING.md](https://github.com/wrkout/exercises.json/blob/master/CONTRIBUTING.md)
says the images "have been scrapped off the internet",
the author does not own the copyright, and advises against commercial use.
Contributors trace them to bodybuilding.com / ExRx
([free-exercise-db#13](https://github.com/yuhonas/free-exercise-db/issues/13)).
The Unlicense on the repo therefore does not reliably cover the images, although
the static README, `ensure.ts` and the App Store notes call them public domain.

This is recorded as decision **L-D1** in the plan. Nothing in the plan's other
phases depends on its outcome.

## 4. Problems found in the current catalog

| Slug                  | Issue                                                           | Suggested fix (applies only if free-exercise-db photos are kept) |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| preacher-curl         | EZ-bar exercise shows a **cable** preacher curl                 | `Preacher_Curl`                                                  |
| hip-abduction-machine | No photo; README wrongly says no match                          | `Thigh_Abductor`                                                 |
| bulgarian-split-squat | No photo                                                        | `Split_Squat_with_Dumbbells` (rear foot elevated)                |
| hanging-knee-raise    | Shows a straight-leg raise; alias "Hanging Leg Raise"           | Move both to the new `hanging-leg-raise`                         |
| ab-wheel-rollout      | Shows a barbell rollout                                         | `Ab_Roller`                                                      |
| walking-lunge         | Dumbbell exercise, barbell photo                                | flag                                                             |
| assisted-pull-up      | Counterweight machine, band-assisted photo                      | flag                                                             |
| goblet-squat          | Dumbbell exercise, kettlebell photo                             | alias or separate kettlebell slug                                |
| cable-fly             | Aliases "Pec Deck" / "Cable Crossover" name different exercises | move the aliases to their new slugs                              |
