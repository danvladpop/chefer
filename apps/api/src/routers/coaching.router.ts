import {
  COACHING_LIMITS,
  joinInputSchema,
  leaveInputSchema,
  previewInviteInputSchema,
  type CoachingAvailabilityDto,
} from '@chefer/types';
import { coachingInviteService } from '../application/coaching/coaching-invite.service.js';
import { coachingLinkService } from '../application/coaching/coaching-link.service.js';
import { canBeTrainer, isCoachingEnabledFor } from '../lib/coaching-flags.js';
import { coachingProcedure } from '../lib/coaching-middleware.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── coaching.* — the client side of trainer coaching (spec §7.3) ─────────────
// A client joins with an invite link and an explicit consent screen, sees who
// coaches them and can leave at any time. Dark behind the `coaching` flag /
// COACHING_ALLOWLIST: while it is off every procedure but `availability`
// answers NOT_FOUND.

const HOUR_MS = 60 * 60 * 1000;

/** `ctx.isMobileClient` (the `x-chefer-client` header) picks the source — never trust a client-supplied one. */
const sourceOf = (ctx: { isMobileClient: boolean }) => (ctx.isMobileClient ? 'mobile' : 'web');

export const coachingRouter = router({
  /** Never gated: whether any coaching entry point may render for this user. */
  availability: protectedProcedure.query(
    ({ ctx }): CoachingAvailabilityDto => ({
      enabled: isCoachingEnabledFor(ctx.user),
      canBeTrainer: canBeTrainer(ctx.user),
    }),
  ),
  previewInvite: coachingProcedure.input(previewInviteInputSchema).query(({ ctx, input }) => {
    assertWithinRateLimit(
      'coaching.previewInvite',
      ctx.user.id,
      COACHING_LIMITS.previewPerHour,
      HOUR_MS,
    );
    return coachingInviteService.preview(ctx.user.id, input.code);
  }),
  join: coachingProcedure.input(joinInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('coaching.join', ctx.user.id, COACHING_LIMITS.joinPerHour, HOUR_MS);
    return coachingLinkService.join(ctx.user.id, input.code, sourceOf(ctx));
  }),
  status: coachingProcedure.query(({ ctx }) => coachingLinkService.status(ctx.user.id)),
  leave: coachingProcedure
    .input(leaveInputSchema)
    .mutation(({ ctx }) => coachingLinkService.leave(ctx.user.id, sourceOf(ctx))),
});
