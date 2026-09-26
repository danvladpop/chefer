// ─── Recipe rating helpers (P1-1 signal, F2 "who liked it") ───────────────────
// Shared by web's StarRatingWidget and mobile's StarRating.
//
// "Who liked it" chips (F2, v1 — no schema): the selection is stored as one
// structured line INSIDE MealRating.notes ("Liked by: Maria, Tom"), so it
// survives round-trips without a schema change and stays out of the P1-1
// signal reader's way (it only uses stars).

/** Word shown next to the stars, indexed by rating (0 = none). */
export const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'] as const;

const LIKED_BY_RE = /^Liked by: (.*)$/m;

/** Member names recorded in a notes blob, [] when the line is absent. */
export function parseLikedBy(notes: string | null | undefined): string[] {
  const match = notes?.match(LIKED_BY_RE);
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

/** The user's free-text notes without the structured "Liked by" line. */
export function stripLikedBy(notes: string | null | undefined): string {
  return (notes ?? '')
    .replace(LIKED_BY_RE, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Recombines free text + selected names into the stored notes value.
 * No names → the line is omitted entirely (not an empty "Liked by:").
 */
export function composeNotesWithLikedBy(freeText: string, names: string[]): string {
  const text = freeText.trim();
  if (names.length === 0) return text;
  const line = `Liked by: ${names.join(', ')}`;
  return text ? `${text}\n${line}` : line;
}
