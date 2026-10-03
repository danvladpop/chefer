import { TRPCError } from '@trpc/server';
import { FRIENDS_COPY, type SectionAccess } from '@chefer/types';

// ─── Following: structured error causes (implementation-plan.md §4.1) ─────────
// A TRPCError's `cause` never reaches the client, so the machine-readable part
// of a Following error travels in a typed cause class that the tRPC
// errorFormatter (lib/trpc.ts) copies to `error.data.*` — the ConflictCause
// pattern (lib/conflict.ts). Every field is additive: other errors carry
// `false`/`null`, and old clients ignore the new keys.
//
// INV-3 (no existence oracle): "blocked", "not activated" and "doesn't exist"
// all throw `profileNotAvailableError()` — the same code, message and data.
// `friendsLocked` is only ever thrown once the header is visible.

/** Why a visible profile's section is closed to the viewer. */
export type FriendsLockedReason = Exclude<SectionAccess, 'visible'>;

/** Which text the word filter rejected (PRD §9.4). */
export type TextRejectedField = 'name' | 'recipe';

/** `data.friendsUnavailable: true` — the `friends` flag is off for this user. */
export class FriendsUnavailableCause extends Error {
  constructor() {
    super('friends unavailable');
    this.name = 'FriendsUnavailableCause';
  }
}

/** `data.friendsNotActivated: true` — the caller hasn't turned on Following. */
export class FriendsNotActivatedCause extends Error {
  constructor() {
    super('friends not activated');
    this.name = 'FriendsNotActivatedCause';
  }
}

/** `data.friendsLocked: 'locked' | 'not_shared'` — the header is visible, the section isn't. */
export class FriendsLockedCause extends Error {
  constructor(readonly reason: FriendsLockedReason) {
    super(`friends section ${reason}`);
    this.name = 'FriendsLockedCause';
  }
}

/** `data.textRejected: 'name' | 'recipe'` — the word filter rejected a write. */
export class TextRejectedCause extends Error {
  constructor(readonly field: TextRejectedField) {
    super(`text rejected: ${field}`);
    this.name = 'TextRejectedCause';
  }
}

/**
 * `data.unsafeForTable: { issues }` — another user's recipe conflicts with an
 * allergy or restriction at the viewer's table (friends.addRecipeToWeek). The
 * issues are the `findSafetyIssues` strings; the message stays readable.
 */
export class UnsafeForTableCause extends Error {
  constructor(readonly issues: readonly string[]) {
    super('unsafe for table');
    this.name = 'UnsafeForTableCause';
  }
}

// ─── Error factories (one place for code + message + cause) ───────────────────

/** The server message for every not-visible profile (INV-3). */
export const PROFILE_NOT_AVAILABLE_MESSAGE = FRIENDS_COPY.notAvailable.title;

/** NOT_FOUND `Profile not available`: blocked, not activated, missing and random ids alike. */
export function profileNotAvailableError(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: PROFILE_NOT_AVAILABLE_MESSAGE });
}

export function friendsUnavailableError(): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message: FRIENDS_COPY.unavailable,
    cause: new FriendsUnavailableCause(),
  });
}

export function friendsNotActivatedError(): TRPCError {
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: FRIENDS_COPY.server.notActivated,
    cause: new FriendsNotActivatedCause(),
  });
}

export function friendsLockedError(reason: FriendsLockedReason): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message: reason === 'locked' ? FRIENDS_COPY.server.locked : FRIENDS_COPY.server.notShared,
    cause: new FriendsLockedCause(reason),
  });
}

/** BAD_REQUEST with the plain-language copy as the message, so old clients show it as is. */
export function textRejectedError(field: TextRejectedField): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: field === 'name' ? FRIENDS_COPY.intro.nameRejected : FRIENDS_COPY.recipe.textRejected,
    cause: new TextRejectedCause(field),
  });
}

/**
 * What the table-safety rejection says (UX-PLAN-06): an allergen "contains"
 * something, a diet is something the dish IS NOT. `diets` are the issue labels
 * that are dietary restrictions; `ingredients` name what broke each one when
 * known. The "UNSAFE_FOR_TABLE:" prefix is the contract clients match on.
 */
export interface UnsafeForTableContext {
  diets?: readonly string[];
  ingredients?: Readonly<Record<string, readonly string[]>>;
}

export function unsafeForTableMessage(
  issues: readonly string[],
  context: UnsafeForTableContext = {},
): string {
  const first = issues[0] ?? 'an ingredient';
  if (context.diets?.includes(first)) {
    const named = (context.ingredients?.[first] ?? []).slice(0, 3).join(', ');
    return `UNSAFE_FOR_TABLE: this recipe isn't ${first.toLowerCase()}${named ? ` (it contains ${named})` : ''}, which conflicts with a diet set for your table.`;
  }
  return `UNSAFE_FOR_TABLE: this recipe contains ${first}, which conflicts with an allergy or dietary restriction set for your table.`;
}

/** FORBIDDEN, worded like `mealPlan.replaceRecipe`'s UNSAFE_FOR_TABLE rejection. */
export function unsafeForTableError(
  issues: readonly string[],
  context: UnsafeForTableContext = {},
): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message: unsafeForTableMessage(issues, context),
    cause: new UnsafeForTableCause(issues),
  });
}
