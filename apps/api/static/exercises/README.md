# Exercise photos

Start/end position photos for the gym exercise catalog (`packages/types/src/gym/exercise-catalog.ts`),
vendored from **free-exercise-db** and served offline-safe from this API
instead of hot-linked from `raw.githubusercontent.com` at runtime.

- **Source:** https://github.com/yuhonas/free-exercise-db
- **License:** [The Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md) —
  a public-domain dedication. No attribution is required to use these images
  commercially; this note is credit given anyway, as good practice.
- **Naming:** `<catalog-slug>-0.webp` (start position) and `<catalog-slug>-1.webp`
  (end position), one pair per exercise that has a `freeExerciseDbId` in the
  catalog. Eight exercises have no faithful free-exercise-db match and so have
  no photos here: `bulgarian-split-squat`, `hip-abduction-machine`, and the
  home variants `dumbbell-hip-thrust`, `reverse-lunge`,
  `bodyweight-bulgarian-split-squat`, `single-leg-romanian-deadlift`,
  `single-leg-calf-raise` and `pike-push-up` (audit F-GYM-2-1). Their detail
  screens rely on the cues and the video.
- **Format:** WebP, resized to max 600px wide, quality 78 (`cwebp -q 78 -resize 600 0`).
- **Regenerating:** `scripts/gym/vendor-exercise-photos.ts` downloads and
  converts these from the upstream JPGs. It's idempotent — safe to re-run;
  pass `--force` to re-download and re-convert everything. See that file's
  header comment for the exact command.

This directory is served by the API at `/static/exercises/*` (see
`gym_plan.md` §5.5).
