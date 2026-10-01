import { TRPCError, type TRPCMiddlewareFunction } from '@trpc/server';
import type { SocialProfile } from '@chefer/database';
import { targetUserInputSchema, type UserProfile } from '@chefer/types';
import {
  SocialAccessMemo,
  socialAccessService,
  type SocialAccess,
  type SocialScope,
} from '../application/friends/social-access.service.js';
import { env } from './env.js';
import { isFlagEnabled } from './flags.js';
import { friendsNotActivatedError, friendsUnavailableError } from './friends-errors.js';
import { protectedProcedure, type Context } from './trpc.js';

// ─── Following: middleware and base procedures (implementation-plan.md §4.1) ──
// Every friends.* procedure except `friends.availability` is built on one of:
//
//   friendsProcedure                         flag (or allowlist) on
//   activeFriendsProcedure                   + the caller turned Following on
//   activeFriendsProcedure
//     .use(requireSocialAccess(scope))       + the target (`input.userId`) is
//                                              visible, and so is `scope`
//
// `requireSocialAccess` reads `userId` from the raw input, so it works before
// or after `.input(targetUserInputSchema)`; keep the `.input()` anyway for the
// client's types. Context gained along the way:
//   ctx.socialProfile  the caller's SocialProfile      (activeFriendsProcedure)
//   ctx.socialMemo     the per-request access memo     (activeFriendsProcedure)
//   ctx.socialAccess   the resolved SocialAccess       (requireSocialAccess)

/**
 * Whether Following is on for `userId` — the `friends` flag, or the user is on
 * the FRIENDS_ALLOWLIST (PRD §17 dark launch). Code outside friends.* that has
 * a social branch (recipe.list, findRecipeVisibleTo) gates on this too, so the
 * kill switch stops everything at once (plan §8).
 */
export function isFriendsEnabledFor(userId: string): boolean {
  return isFlagEnabled('friends') || isAllowlisted(env.FRIENDS_ALLOWLIST, userId);
}

/**
 * Takes the set as possibly undefined on purpose: a test that mocks
 * lib/env.js with a partial object must not crash here (the lib/flags.ts
 * precedent) — a missing allowlist is an empty one.
 */
function isAllowlisted(allowlist: ReadonlySet<string> | undefined, userId: string): boolean {
  return allowlist ? allowlist.has(userId) : false;
}

/** Context after `protectedProcedure`'s auth middleware. */
type AuthedOverrides = { user: UserProfile };
/** Context after `activeFriendsProcedure`. */
type ActiveFriendsOverrides = AuthedOverrides & {
  socialProfile: SocialProfile;
  socialMemo: SocialAccessMemo;
};

/** `FORBIDDEN` + `data.friendsUnavailable: true` unless `isFriendsEnabledFor(user)`. */
export const requireFriendsEnabled: TRPCMiddlewareFunction<
  Context,
  object,
  AuthedOverrides,
  AuthedOverrides,
  unknown
> = ({ ctx, next }) => {
  if (!isFriendsEnabledFor(ctx.user.id)) throw friendsUnavailableError();
  return next();
};

/**
 * `PRECONDITION_FAILED` + `data.friendsNotActivated: true` unless the caller
 * has a SocialProfile. Starts the request's SocialAccessMemo with that row.
 */
export const requireActivated: TRPCMiddlewareFunction<
  Context,
  object,
  AuthedOverrides,
  { socialProfile: SocialProfile; socialMemo: SocialAccessMemo },
  unknown
> = async ({ ctx, next }) => {
  const socialMemo = new SocialAccessMemo();
  const socialProfile = await socialAccessService.profile(ctx.user.id, socialMemo);
  if (!socialProfile) throw friendsNotActivatedError();
  return next({ ctx: { socialProfile, socialMemo } });
};

/**
 * Resolves `SocialAccessService.assert(ctx.user.id, input.userId, scope)` into
 * `ctx.socialAccess`. Not visible → NOT_FOUND `Profile not available` (blocked,
 * not activated, nonexistent and malformed-but-valid ids alike, INV-3); scope
 * not visible → FORBIDDEN + `data.friendsLocked`. A missing or malformed
 * `userId` is a BAD_REQUEST, same as the input parser would give.
 */
export function requireSocialAccess(
  scope: SocialScope,
): TRPCMiddlewareFunction<
  Context,
  object,
  ActiveFriendsOverrides,
  { socialAccess: SocialAccess },
  unknown
> {
  return async ({ ctx, next, getRawInput }) => {
    const parsed = targetUserInputSchema.safeParse(await getRawInput());
    if (!parsed.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid user.', cause: parsed.error });
    }
    const socialAccess = await socialAccessService.assert(
      ctx.user.id,
      parsed.data.userId,
      scope,
      ctx.socialMemo,
    );
    return next({ ctx: { socialAccess } });
  };
}

/** Flag (or allowlist) on. `friends.me` and `friends.activate` use this. */
export const friendsProcedure = protectedProcedure.use(requireFriendsEnabled);

/** Flag on and the caller turned Following on. Everything else in friends.*. */
export const activeFriendsProcedure = friendsProcedure.use(requireActivated);
