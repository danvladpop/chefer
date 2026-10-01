import { TRPCError, type TRPCRouterRecord } from '@trpc/server';
import { FRIENDS_COPY, reportInputSchema } from '@chefer/types';
import { moderationService } from '../../application/friends/moderation.service.js';
import { activeFriendsProcedure } from '../../lib/friends-middleware.js';
import { consume } from '../../lib/rate-limit.js';

// friends.* — safety (L-MODERATION): report (always also blocks).
// Procedure map: docs/friends/implementation-plan.md §4.2.
// A plain procedure RECORD, not a router(): routers/friends/index.ts spreads
// the four records into one friends router, so parallel lanes never share a
// file. Keys must be unique across the four records (index.test.ts checks).
// Thin handler: input schema + rate limit + one service call. Visibility is
// checked in the service (plan §4.6 step 1: header-visible OR a follow /
// Activity tie), not by requireSocialAccess, which would refuse the tie case.
//
// There is deliberately nothing else here: no report list, no review queue,
// no appeal and no email (PRD §5.1, Q-F-13). Moderation is automatic.

const DAY = 24 * 60 * 60 * 1000;
const REPORTS_PER_DAY = 20;

export const safetyProcedures = {
  report: activeFriendsProcedure.input(reportInputSchema).mutation(({ ctx, input }) => {
    if (!consume(`friends.report:${ctx.user.id}`, REPORTS_PER_DAY, DAY)) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: FRIENDS_COPY.server.reportCap,
      });
    }
    return moderationService.reportAndBlock(ctx.user.id, input);
  }),
} satisfies TRPCRouterRecord;
