// friends.* tRPC namespace — Following (docs/friends/implementation-plan.md
// §4.1–4.2). User-facing name "Following"; code name `friends`.
//
// One router built from four plain procedure records, one per lane file, so
// parallel lanes never edit the same file. A tRPC v11 `router()` object
// can't be spread (it carries `_def`/`createCaller`), hence the records.
//
// Every procedure except `availability` sits behind `requireFriendsEnabled`
// (FORBIDDEN + data.friendsUnavailable while the flag is off, plan §8).
import type { FriendsAvailabilityDto } from '@chefer/types';
import { isFriendsEnabledFor } from '../../lib/friends-middleware.js';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { contentProcedures } from './content.router.js';
import { graphProcedures } from './graph.router.js';
import { recipesProcedures } from './recipes.router.js';
import { safetyProcedures } from './safety.router.js';

/** The mobile app gates every entry point on this; a failure means "off". */
const availability = protectedProcedure.query(
  ({ ctx }): FriendsAvailabilityDto => ({ enabled: isFriendsEnabledFor(ctx.user.id) }),
);

/** The four lane records, exported for the key-collision test. */
export const friendsProcedureRecords = {
  graph: graphProcedures,
  content: contentProcedures,
  recipes: recipesProcedures,
  safety: safetyProcedures,
} as const;

export const friendsRouter = router({
  availability,
  ...graphProcedures,
  ...contentProcedures,
  ...recipesProcedures,
  ...safetyProcedures,
});
