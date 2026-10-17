// Photo file naming for the gym exercise catalog (WP-25 lane x).
//
// Every catalog exercise can ship a start (frame 0) and an end (frame 1) photo,
// exactly 600×400 WebP, under apps/api/static/exercises/. The file name is the
// image key the API stores in `exercises.imageKeys` and serves at
// /static/exercises/<key>, so it doubles as the cache key on installed clients.
//
// Two ways to change what a client shows for the same slug:
//   - add/remove the files          -> imageKeys change -> contentVersion + 1
//   - re-vendor a different photo   -> bump the slug's revision below, so the
//     new files get a new name (`<slug>-0.r2.3x2.webp`) and the stale cached
//     URL is never reused (WP-23 re-vendored two photos in place and left
//     installed clients on the old image).

/**
 * Slugs whose photo was replaced after first shipping. A slug missing here is
 * revision 1 (`<slug>-<frame>.3x2.webp`). Only ever increase a value, and rename
 * the files in the same change.
 */
export const EXERCISE_PHOTO_REVISIONS: Readonly<Record<string, number>> = {
  // WP-23 swapped these to the right dataset movement under the old names.
  'preacher-curl': 2,
  'ab-wheel-rollout': 2,
  // The free-exercise-db "Plank" photo showed a kneeling lunge stretch.
  plank: 2,
};

/** File name (= image key) of one frame: 0 = start position, 1 = end position. */
export function exercisePhotoFile(id: string, frame: 0 | 1): string {
  const revision = EXERCISE_PHOTO_REVISIONS[id] ?? 1;
  return revision > 1 ? `${id}-${frame}.r${revision}.3x2.webp` : `${id}-${frame}.3x2.webp`;
}

/** Both frame file names, start first. */
export function exercisePhotoFiles(id: string): [string, string] {
  return [exercisePhotoFile(id, 0), exercisePhotoFile(id, 1)];
}
