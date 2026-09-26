// ─── "Who liked it" rating chips (F2, v1 — no schema) ─────────────────────────
// Moved to @chefer/utils (rating.ts) so mobile's StarRating shares the exact
// notes format; re-exported here for the existing web imports and tests.
export { composeNotesWithLikedBy, parseLikedBy, stripLikedBy } from '@chefer/utils';
