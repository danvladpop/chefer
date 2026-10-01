// ─── Following: reading the structured error `data` (plan §4.1) ───────────────
// The API's errorFormatter copies each Following cause to `error.data.*`
// (apps/api/src/lib/friends-errors.ts): `friendsUnavailable`,
// `friendsNotActivated`, `friendsLocked`, `textRejected`, `unsafeForTable`.
// Every other error carries false/null there, and an old API none of them, so
// these readers take `unknown` and never throw.

/** Which text the word filter rejected (PRD §9.4). */
export type TextRejectedField = 'name' | 'recipe';

type FriendsErrorData = {
  code?: string;
  httpStatus?: number;
  friendsUnavailable?: boolean;
  friendsNotActivated?: boolean;
  friendsLocked?: 'locked' | 'not_shared' | null;
  textRejected?: TextRejectedField | null;
  unsafeForTable?: { issues: string[] } | null;
};

/** The error's `data`, or an empty object for anything that isn't a tRPC error. */
export function friendsErrorData(error: unknown): FriendsErrorData {
  if (typeof error !== 'object' || error === null || !('data' in error)) return {};
  const { data } = error;
  return typeof data === 'object' && data !== null ? data : {};
}

/** FORBIDDEN + `data.friendsUnavailable`: the feature was switched off for this user. */
export function isFriendsUnavailableError(error: unknown): boolean {
  return friendsErrorData(error).friendsUnavailable === true;
}

/** PRECONDITION_FAILED + `data.friendsNotActivated`: the viewer hasn't turned on Following. */
export function isFriendsNotActivatedError(error: unknown): boolean {
  return friendsErrorData(error).friendsNotActivated === true;
}

/** Which text the word filter rejected (`'name'` on activate/settings, `'recipe'` on recipe writes). */
export function textRejectedOf(error: unknown): TextRejectedField | null {
  const field = friendsErrorData(error).textRejected;
  return field === 'name' || field === 'recipe' ? field : null;
}

/** NOT_FOUND `Profile not available` (blocked, not activated, missing — INV-3, no hint why). */
export function isProfileNotAvailableError(error: unknown): boolean {
  const data = friendsErrorData(error);
  return data.code === 'NOT_FOUND' || data.httpStatus === 404;
}
