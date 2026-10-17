// ─── Cover image for a routine day or a past workout (pure) ──────────────────
// Routines and sessions have no image of their own (10 Oct redesign follow-up):
// their tile shows the photo of the first exercise that has one, in the
// day's/session's order, and the caller keeps its illustration when none does.
// Skipped exercises are the caller's to leave out (a session row passes only
// what was done). Returns the exercise's image path as stored (API-relative
// or absolute) — each app resolves it to a URL.

/** Per-exercise photos, e.g. `ExerciseDto.images` from the cached library. */
export type ExerciseImagesOf = (exerciseId: string) => readonly string[] | undefined;

export function coverImagePath(
  exerciseIds: readonly string[],
  imagesOf: ExerciseImagesOf,
): string | null {
  for (const id of exerciseIds) {
    const first = imagesOf(id)?.find((path) => path.trim() !== '');
    if (first) return first;
  }
  return null;
}
