import type { TRPCRouterRecord } from '@trpc/server';

// friends.* — safety (L-MODERATION): report (always also blocks).
// Procedure map: docs/friends/implementation-plan.md §4.2.
// A plain procedure RECORD, not a router(): routers/friends/index.ts spreads
// the four records into one friends router, so parallel lanes never share a
// file. Keys must be unique across the four records (index.test.ts checks).
// Build on the bases in lib/friends-middleware.ts (friendsProcedure,
// activeFriendsProcedure, .use(requireSocialAccess(scope))); keep handlers
// thin — the logic lives in application/friends/*.
export const safetyProcedures = {} satisfies TRPCRouterRecord;
