# Exercise photos

Start/end position photos for the gym exercise catalog (`packages/types/src/gym/exercise-catalog.ts`),
vendored from **free-exercise-db** and served offline-safe from this API
instead of hot-linked from `raw.githubusercontent.com` at runtime.

- **Source:** https://github.com/yuhonas/free-exercise-db
- **License:** [The Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md) —
  a public-domain dedication. No attribution is required to use these images
  commercially; this note is credit given anyway, as good practice.
- **Naming:** `<catalog-slug>-0.3x2.webp` (start position) and
  `<catalog-slug>-1.3x2.webp` (end position), one pair per exercise that has a
  `freeExerciseDbId` in the catalog. The `.3x2` suffix was added by T-05.11
  (UX-05 A6) when photos were re-vendored to an exact 600×400 cover crop —
  every earlier `<slug>-N.webp` file (a raw, un-cropped resize the client used
  to square-crop, cutting off a third of the frame) was deleted, not kept
  alongside the new name. Renaming (not overwriting) also forces
  `imageKeysFor`'s returned keys to change, which bumps `contentVersion` in
  the sync pass (`exercise-library/ensure.ts`) so installed clients'
  `librarySince` fetch, and any disk/CDN cache keyed by URL, picks up the new
  crop instead of serving a stale one under the old key.
- **Size:** exactly 600×400 — `ensure.test.ts` ("is exactly 600×400 (3:2,
  T-05.11 AC30)") reads every vendored file's WebP header
  (`exercise-library/webp-dimensions.ts`) and fails the suite if one drifts.
- **No photo:** 40 of 191 rows (39 plus the hidden `plank`, below) have no photo
  because free-exercise-db has no entry for the same movement and equipment (a
  visibly different variant is not accepted). Their detail screens rely on the cues
  and the video; `ExerciseImage`/`PhotoCrossfade` show the icon placeholder. The
  list is the commented allow-list in
  `packages/types/src/gym/exercise-media.test.ts`: `pendlay-row` (dataset has only
  the bent-over row), `landmine-press`, `kettlebell-press` and `kettlebell-swing`
  (only alternating / one-arm variants), `machine-lateral-raise`, `assisted-dip`,
  `pendulum-squat`, `belt-squat`, `kettlebell-deadlift`, `glute-kickback-machine`,
  `hollow-body-hold`, `bird-dog`, `suitcase-carry`, `dumbbell-hip-thrust`,
  `pistol-squat` (only a kettlebell version), `wall-sit`, `bulgarian-split-squat`
  and `bodyweight-bulgarian-split-squat` (the dataset split squat does not show the
  raised rear foot), `reverse-lunge`, `lateral-lunge`, `step-up`,
  `single-leg-romanian-deadlift`, `clamshell`, `single-leg-calf-raise`,
  `kneeling-push-up`, `pike-push-up`, and the cardio/activity presets
  `outdoor-walk`, `outdoor-run`, `outdoor-cycle` (the dataset "Bicycling" photo is a
  helmet close-up), `stationary-bike-recumbent`, `spin-class`, `pilates-class`,
  `yoga-class`, `hiit-class`, `dance-class`, `swimming`, `running`, `walking`,
  `other-activity`.
- **2026-10-07 (WP-23 lane v, FB7-06) — photos filled.** The owner decided to use
  free-exercise-db photos for every exercise that lacked one (superseding L-D1/L-D5
  of `docs/gym/library-expansion/plan-library-supersets.md` for the new rows). 80
  exercises gained a photo pair (3.6 MB of WebP), each pair checked on a contact
  sheet. Close variants: `treadmill-incline-walk` uses the flat
  `Walking_Treadmill` photo (the incline is not visible); `glute-ham-raise` uses the
  machine photos (its two frames are shot from different angles); `close-grip-lat-pulldown`
  uses the V-bar pulldown, `kettlebell-goblet-squat` the kettlebell goblet squat,
  `triceps-dip` the parallel-bar dip. The research §4 near-misses `preacher-curl`
  (was a cable photo, now `Preacher_Curl`, EZ bar) and `ab-wheel-rollout` (was a
  barbell rollout, now `Ab_Roller`) were re-vendored under the same file keys, so a
  client with the old image cached keeps it until its image cache expires. Still
  open from §4 (no better dataset match): `hanging-knee-raise` (straight-leg photo),
  `walking-lunge` (barbell), `assisted-pull-up` (band-assisted), `goblet-squat`
  (kettlebell), `cable-fly`.
- **Hidden photos** (file exists, but shows the wrong exercise — a
  free-exercise-db id near-miss): `plank` — both frames actually show a
  kneeling lunge stretch, not a plank. Found 2026-09-27 by a T-05.11 sample
  audit (16 of 71 photographed exercises spot-checked via
  `scripts/gym/exercise-photo-contact-sheet.ts`'s image list, not
  exhaustive — the contact sheet script lets a future pass sweep the rest).
  Listed in `HIDDEN_EXERCISE_IMAGE_IDS`
  (`packages/types/src/gym/exercise-catalog.ts`); `ExerciseImage` (mobile)
  and its web twin (`apps/web/src/features/gym/library/ExerciseImage.tsx`)
  show the icon placeholder for any slug in that set even though the file is
  still served. Add a slug here and to that set when an audit finds another.
- **Videos:** every exercise has an oEmbed-verified `videoId` except the six
  class-style activity presets (`spin-class`, `pilates-class`, `yoga-class`,
  `hiit-class`, `dance-class`, `other-activity`: no single movement to demonstrate).
  The 108 videos added 2026-10-07 prefer the channels the catalog already used
  (Renaissance Periodization exercise clips, ScottHermanFitness, PureGym, Colossus
  Fitness, ...); `videoChannel` is the oEmbed `author_name` and `videoStartSec` is 0.
  `scripts/gym/check-exercise-videos.ts` (weekly CI) keeps the links honest.
- **Guard:** `packages/types/src/gym/exercise-media.test.ts` fails when any exercise
  lacks a photo or video and is not on its commented allow-list, and when an
  allow-listed slug has gained media. `scripts/gym/exercise-media-gap-report.ts`
  prints the per-exercise status.
- **Format:** WebP, a "cover" crop (scaled up preserving aspect, then
  center-cropped to 600×400 — never stretched) at quality 78.
- **Regenerating:** `scripts/gym/vendor-exercise-photos.ts` downloads,
  crops and converts these from the upstream JPGs. It's idempotent — safe to
  re-run; pass `--force` to re-download and re-convert everything. See that
  file's header comment for the exact command.
- **Auditing:** `scripts/gym/exercise-photo-contact-sheet.ts` writes
  `contact-sheet.html` (gitignored) into this directory — every vendored
  photo, labelled by slug and name, for a visual sweep.

This directory is served by the API at `/static/exercises/*` (see
`gym_plan.md` §5.5).
