import type { TRPCRouterRecord } from '@trpc/server';
import { friendRecipesInputSchema, targetUserInputSchema } from '@chefer/types';
import { friendContentService } from '../../application/friends/friend-content.service.js';
import type { SocialScope } from '../../application/friends/social-access.service.js';
import { effectiveLevel } from '../../application/gym/client-level.js';
import { activeFriendsProcedure, requireSocialAccess } from '../../lib/friends-middleware.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';

// friends.* — another user's content (L-CONTENT): profile, week, recipes,
// routine, workouts.
// Procedure map: docs/friends/implementation-plan.md §4.2.
// A plain procedure RECORD, not a router(): routers/friends/index.ts spreads
// the four records into one friends router, so parallel lanes never share a
// file. Keys must be unique across the four records (index.test.ts checks).
// Build on the bases in lib/friends-middleware.ts (friendsProcedure,
// activeFriendsProcedure, .use(requireSocialAccess(scope))); keep handlers
// thin — the logic lives in application/friends/*.
//
// INV-7: these stay under `friends.*`, never `gym.*` — the mobile app
// persists gym query keys to disk, and another user's data must not be.

const HOUR_MS = 60 * 60 * 1000;
/** Per caller, per procedure (plan §4.2: 300/h for every content read). */
const CONTENT_READS_PER_HOUR = 300;

/**
 * `activeFriendsProcedure` → rate limit → `requireSocialAccess(scope)`. The
 * limit runs BEFORE the access check, so probing profiles that aren't
 * visible counts the same as reading visible ones.
 */
function contentProcedure(name: string, scope: SocialScope) {
  return activeFriendsProcedure
    .use(({ ctx, next }) => {
      assertWithinRateLimit(`friends.${name}`, ctx.user.id, CONTENT_READS_PER_HOUR, HOUR_MS);
      return next();
    })
    .use(requireSocialAccess(scope));
}

export const contentProcedures = {
  profile: contentProcedure('profile', 'header')
    .input(targetUserInputSchema)
    .query(({ ctx, input }) => friendContentService.profile(input.userId, ctx.socialAccess)),

  week: contentProcedure('week', 'plan')
    .input(targetUserInputSchema)
    .query(({ ctx, input }) =>
      friendContentService.week(ctx.user.id, input.userId, ctx.socialAccess),
    ),

  recipes: contentProcedure('recipes', 'recipes')
    .input(friendRecipesInputSchema)
    .query(({ ctx, input }) =>
      friendContentService.recipes(ctx.user.id, input.userId, {
        search: input.search,
        cursor: input.cursor,
        limit: input.limit,
      }),
    ),

  // Tracking types gated like the gym.* reads: the client's level, capped
  // while the cardioLogging flag is off (application/gym/client-level.ts).
  routine: contentProcedure('routine', 'workouts')
    .input(targetUserInputSchema)
    .query(({ ctx, input }) =>
      friendContentService.routine(input.userId, effectiveLevel(ctx.clientApiLevel)),
    ),

  workouts: contentProcedure('workouts', 'workouts')
    .input(targetUserInputSchema)
    .query(({ ctx, input }) =>
      friendContentService.workouts(input.userId, effectiveLevel(ctx.clientApiLevel)),
    ),
} satisfies TRPCRouterRecord;
