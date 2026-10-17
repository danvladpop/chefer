# Exercise photos

Start/end position photos for the gym exercise catalog (`packages/types/src/gym/exercise-catalog.ts`),
served offline-safe from this API at `/static/exercises/*` (see `gym_plan.md` §5.5) instead of being
hot-linked at runtime. Since WP-25 (2026-10-08, "complete media") they come from **three sources**;
`scripts/gym/exercise-media-gap-report.ts` prints the per-exercise source.

| Source            | Exercises                                  | Licence                                                       | Provenance                               |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| free-exercise-db  | 151                                        | The Unlicense (public domain)                                 | `freeExerciseDbId` in the catalog        |
| Wikimedia Commons | 7 (CC0 / public domain / CC BY / CC BY-SA) | per file, credits below                                       | `docs/gym/exercise-photo-sources.json`   |
| AI render         | 34                                         | see "AI renders" below; no licence restriction on the renders | same JSON: prompt, seed, model per frame |

## Naming and cache busting

- `<slug>-0.3x2.webp` is the start position, `<slug>-1.3x2.webp` the end position, exactly **600x400**
  (3:2 "cover" crop, WebP q78-80). `exercise-library/ensure.test.ts` reads every file's WebP header and
  fails if one drifts; the same test fails on orphan files no exercise references.
- The file name is the image key stored in `exercises.imageKeys` and the URL clients cache. Adding or
  removing a pair changes `imageKeys`, so the sync pass bumps `contentVersion` and installed apps refetch.
- **Re-vendoring a photo under the same name leaves clients on the stale image** (WP-23 did that for
  `preacher-curl` and `ab-wheel-rollout`). Instead bump the slug in `EXERCISE_PHOTO_REVISIONS`
  (`packages/types/src/gym/exercise-photos.ts`) and rename the files to `<slug>-0.r2.3x2.webp`; the
  helper `exercisePhotoFile()` is used by the API, the guard test and every script. `preacher-curl`,
  `ab-wheel-rollout` and `plank` are at revision 2.
- `imageKeysFor` (API) serves whichever of the two files exist, whatever the source (it no longer
  needs a `freeExerciseDbId`); the DTO `images` field is unchanged.

## Credits: Wikimedia Commons photos

CC BY / CC BY-SA require attribution; public-domain files are listed too. Only CC0, public domain,
CC BY and CC BY-SA are accepted (never NC/ND); `scripts/gym/vendor-commons-photos.ts` enforces that.
Cropped to 600x400, otherwise unmodified.

| Exercise        | Frame | Commons file                                                                                                                                                                                                               | Author                                                | Licence       |
| --------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- |
| `bird-dog`      | start | [Girl doing bird dog yoga pose.jpg](https://commons.wikimedia.org/wiki/File:Girl_doing_bird_dog_yoga_pose.jpg)                                                                                                             | PTPioneer                                             | CC BY 2.0     |
| `bird-dog`      | end   | [Girl doing bird dog yoga pose 2.jpg](https://commons.wikimedia.org/wiki/File:Girl_doing_bird_dog_yoga_pose_2.jpg)                                                                                                         | PTPioneer                                             | CC BY 2.0     |
| `dance-class`   | start | [Buckley Zumba session.JPG](https://commons.wikimedia.org/wiki/File:Buckley_Zumba_session.JPG)                                                                                                                             | U.S. Air Force photo by Airman 1st Class Phillip Houk | Public domain |
| `dance-class`   | end   | [US Army 52862 Zumba adds Latin dance to fitness routine.jpg](https://commons.wikimedia.org/wiki/File:US_Army_52862_Zumba_adds_Latin_dance_to_fitness_routine.jpg)                                                         | Brittany Carlson (USAG Stuttgart)                     | Public domain |
| `outdoor-run`   | start | [120915-F-KX404-139 (7996341270).jpg](<https://commons.wikimedia.org/wiki/File:120915-F-KX404-139_(7996341270).jpg>)                                                                                                       | U.S. Department of Defense Current Photos             | Public domain |
| `outdoor-run`   | end   | [Evening jogger (4488221416).jpg](<https://commons.wikimedia.org/wiki/File:Evening_jogger_(4488221416).jpg>)                                                                                                               | Ernst Vikne from Skien, Norway                        | CC BY-SA 2.0  |
| `pilates-class` | start | [Pilates Cabane 14.jpg](https://commons.wikimedia.org/wiki/File:Pilates_Cabane_14.jpg)                                                                                                                                     | NikStryker                                            | CC BY-SA 4.0  |
| `pilates-class` | end   | [Pilates reformer pic.jpg](https://commons.wikimedia.org/wiki/File:Pilates_reformer_pic.jpg)                                                                                                                               | Payam.nazeri96                                        | CC BY-SA 4.0  |
| `running`       | start | [120915-F-KX404-139 (7996341270).jpg](<https://commons.wikimedia.org/wiki/File:120915-F-KX404-139_(7996341270).jpg>)                                                                                                       | U.S. Department of Defense Current Photos             | Public domain |
| `running`       | end   | [Evening jogger (4488221416).jpg](<https://commons.wikimedia.org/wiki/File:Evening_jogger_(4488221416).jpg>)                                                                                                               | Ernst Vikne from Skien, Norway                        | CC BY-SA 2.0  |
| `spin-class`    | start | [Indoor Cycle Class at a Gym.JPG](https://commons.wikimedia.org/wiki/File:Indoor_Cycle_Class_at_a_Gym.JPG)                                                                                                                 | www.localfitness.com.au                               | CC BY-SA 3.0  |
| `spin-class`    | end   | [Indoor Cycling Group ICG Shop und Showroom N%C3%BCrnberg 7.jpg](https://commons.wikimedia.org/wiki/File:Indoor_Cycling_Group_ICG_Shop_und_Showroom_N%C3%BCrnberg_7.jpg)                                                   | Triplec85                                             | CC BY-SA 4.0  |
| `swimming`      | start | [Nacc Meet 2013 (42757488).jpeg](<https://commons.wikimedia.org/wiki/File:Nacc_Meet_2013_(42757488).jpeg>)                                                                                                                 | Cindy Lou Holland                                     | CC BY 3.0     |
| `swimming`      | end   | [40. Schwimmzonen- und Mastersmeeting Enns 2017 200M FREISTIL HERREN (MASTERS)-0745.jpg](<https://commons.wikimedia.org/wiki/File:40._Schwimmzonen-_und_Mastersmeeting_Enns_2017_200M_FREISTIL_HERREN_(MASTERS)-0745.jpg>) | Isiwal                                                | CC BY-SA 4.0  |

The same two scenes serve `running` and `outdoor-run` (one activity, two presets).

## AI renders

34 exercises have AI-rendered photos, all through the AI Horde (stablehorde.net, anonymous, free).
25 use **FLUX.1-schnell** (Apache-2.0): `belt-squat`, `bulgarian-split-squat`, `glute-kickback-machine`, `hiit-class`, `kettlebell-deadlift`, `kettlebell-press`, `kettlebell-swing`, `kneeling-push-up`, `lateral-lunge`, `machine-lateral-raise`, `other-activity`, `outdoor-cycle`, `outdoor-walk`, `pendlay-row`, `pendulum-squat`, `pistol-squat`, `plank`, `reverse-lunge`, `single-leg-calf-raise`, `single-leg-romanian-deadlift`, `stationary-bike-recumbent`, `step-up`, `suitcase-carry`, `walking`, `yoga-class`.
9 use **Krea 2 Turbo** (`Krea2-Turbo_fp8`, Krea 2 Community License; Krea claims no rights over
generated images), added 2026-10-16 because it follows body positions that every Flux schnell render
got wrong: `assisted-dip`, `bodyweight-bulgarian-split-squat`, `clamshell`, `dumbbell-hip-thrust`,
`face-away-cable-curl`, `hollow-body-hold`, `landmine-press`, `pike-push-up`, `wall-sit`. Run it with
`--model Krea2-Turbo_fp8`; the script turns Karras sigmas off for it (with them, Krea 2, Z-Image and
Qwen-Image all come back smeared like a motion blur).
They share one house style (same gym, lighting, framing; `scripts/gym/exercise-photo-prompts.ts`),
with the prompt and seed of every frame recorded in `docs/gym/exercise-photo-sources.json`. Each frame
was picked by eye from 3-4 candidates (contact sheets reviewed; wrong movements, wrong equipment and
extra limbs rejected). Pollinations (the first choice) answers 402 to every new prompt since 2026-10
and its default model is a low-quality fallback; the Hugging Face FLUX Space ran out of anonymous GPU
quota after three renders.

Honest quality notes: AI renders show the right equipment and a plausible pose, not always a
coaching-perfect position. The weaker ones (a better source would be welcome): `kettlebell-swing`
(end frame shows the bell at the waist, not the top of the swing), `pendulum-squat` (end frame),
`plank` (high plank on straight arms). Orchestrator review 2026-10-08: `pendlay-row`, `pendulum-squat`,
`suitcase-carry` and `kettlebell-swing` reuse their start frame as the end frame (the end renders showed the
wrong position or equipment). Krea 2 review 2026-10-16: `assisted-dip` shows the dip on parallel bars, the
assistance pad is out of frame; `landmine-press` has the far end of the bar resting on a plate, not in a
landmine base; `pike-push-up` end frame lowers the head only part of the way; `hollow-body-hold` is the
arms-forward variant.
Regenerate one with `cd apps/api && pnpm exec tsx ../../scripts/gym/generate-exercise-photos.ts --only
<slug> --force --reseed 3 --candidates 3`, look at the candidates cached in
`~/Library/Caches/chefer-exercise-photos`, then install one with `--use <slug>:<frame>:s<seed>-<n>`.

## No photo (allow-listed)

None since 2026-10-16. The commented `NO_PHOTO_ALLOWED` set in
`packages/types/src/gym/exercise-media.test.ts` is empty; add a slug there (with the reason) only when
no correct photo can be found, so its detail screen shows the muscle-group placeholder instead of a
photo of the wrong movement.

## Videos

Every exercise has an oEmbed-verified `videoId`. The six class presets that had none got one on
2026-10-08 (all verified with `https://www.youtube.com/oembed`, `videoChannel` = `author_name`):
`spin-class` (SpinFriends, "15-Minute Beginner Spin Class"), `pilates-class` (Trifecta Pilates, "15 min
Beginner Pilates"), `yoga-class` (Yoga With Adriene, "20-Minute Yoga For Beginners"), `hiit-class` (The
Body Coach TV by Joe Wicks, "Beginners HIIT Workout"), `dance-class` (Zumba, "30-Minute Beginners Latin
Dance Mini-Workout"), `other-activity` (Emma Mattison, "How Hard Should You Train? Talk Test Method &
RPE Explained": a free-form preset has no movement to show, so it explains how to judge effort for any
activity). `scripts/gym/check-exercise-videos.ts` (weekly CI) keeps the links honest.

## Hidden photos

`HIDDEN_EXERCISE_IMAGE_IDS` (`packages/types/src/gym/exercise-catalog.ts`) is empty since WP-25. Its
only member was `plank` (free-exercise-db's "Plank" photo showed a kneeling lunge stretch); it now has an
AI render under a new revision name. The set stays exported because shipped app builds (1.0.1) import
it and keep hiding the `plank` photo until they receive an OTA update. Add a slug to the set (and
mention it here) only as a last resort for a wrong photo you cannot replace.

## Guard, regenerating, auditing

- **Guard:** `packages/types/src/gym/exercise-media.test.ts` fails when an exercise lacks a photo pair
  or a video and is not on the commented allow-list, when an allow-listed slug gained media, and when a
  non-dataset photo lacks its provenance entry or a Commons entry lacks URL/author/licence.
- `scripts/gym/vendor-exercise-photos.ts` re-downloads the free-exercise-db photos (`--force`).
- `scripts/gym/vendor-commons-photos.ts` vendors the Commons picks (list inside the script).
- `scripts/gym/generate-exercise-photos.ts` renders the AI photos (see its header for flags).
- `scripts/gym/exercise-photo-contact-sheet.ts` writes `contact-sheet.html` (gitignored) here for a
  visual sweep; run it after any batch.
- `scripts/gym/exercise-media-gap-report.ts` prints per-exercise photo/video status and source.

## History

- **T-05.11 (UX-05 A6):** photos re-vendored as exact 600x400 cover crops under the `.3x2` names (the old
  `<slug>-N.webp` squares were deleted).
- **2026-10-07 (WP-23, FB7-06):** 80 exercises gained a free-exercise-db pair. Close variants:
  `treadmill-incline-walk` uses the flat `Walking_Treadmill` photo, `glute-ham-raise` the machine photos,
  `close-grip-lat-pulldown` the V-bar pulldown, `kettlebell-goblet-squat` the kettlebell goblet squat,
  `triceps-dip` the parallel-bar dip. Still open near-misses from the research §4 (no better dataset
  match): `hanging-knee-raise` (straight-leg photo), `walking-lunge` (barbell), `assisted-pull-up`
  (band-assisted), `goblet-squat` (kettlebell), `cable-fly`.
- **2026-10-08 (WP-25 lane x):** 35 more exercises (6 licensed Commons scenes for cardio/class presets, 29
  AI renders), `plank` fixed, 6 class-preset videos added, revision suffix mechanism, guard tightened to a
  5-slug allow-list. wger.de was checked too: its exercise images are line illustrations or a weighted
  variant, not photos in this set's style, so none were used.
- **2026-10-16:** the last 9 photo-less exercises got photos (8 Krea 2 Turbo renders, `bird-dog` from
  Commons) and the new `face-away-cable-curl` shipped with one, so the no-photo allow-list is empty.
  Z-Image-Turbo and Qwen-Image on the Horde, and the FLUX.1-Krea-dev / Z-Image Hugging Face Spaces, were
  tried too: the Spaces' anonymous ZeroGPU quota ran out after one or two renders.
