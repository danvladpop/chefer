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
- **No photo:** ten exercises have no faithful free-exercise-db match and so
  have no photos here — `bulgarian-split-squat`, `hip-abduction-machine`,
  and the home variants `dumbbell-hip-thrust`, `reverse-lunge`,
  `bodyweight-bulgarian-split-squat`, `single-leg-romanian-deadlift`,
  `single-leg-calf-raise` and `pike-push-up` (audit F-GYM-2-1), plus the two
  T-05.10 additions carry real photos so this list is unchanged by them.
  Their detail screens rely on the cues and the video; `ExerciseImage`/
  `PhotoCrossfade` show the icon placeholder.
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
- **Content gaps:** `incline-barbell-bench-press`, `back-extension`
  (T-05.10) and `cable-biceps-curl` (added 2026-10-02) have no `videoId` yet — no pick has been oEmbed-verified. Handoff
  for whoever owns exercise-library-research.md next.
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
