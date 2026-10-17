import { TRPCError } from '@trpc/server';
import {
  cancelCoachingRequestInputSchema,
  COACHING_COPY,
  COACHING_LIMITS,
  dismissCoachingNoticeInputSchema,
  findTrainersInputSchema,
  joinInputSchema,
  leaveInputSchema,
  previewInviteInputSchema,
  requestCoachingInputSchema,
  trainerIdInputSchema,
  type CoachingAvailabilityDto,
} from '@chefer/types';
import { coachingInviteService } from '../application/coaching/coaching-invite.service.js';
import { coachingLinkService } from '../application/coaching/coaching-link.service.js';
import { coachingNoticeService } from '../application/coaching/coaching-notice.service.js';
import { coachingRequestService } from '../application/coaching/coaching-request.service.js';
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
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60 * 1000;

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
    return coachingLinkService.join(ctx.user.id, input.code, sourceOf(ctx), input.localDate);
  }),
  status: coachingProcedure.query(({ ctx }) => coachingLinkService.status(ctx.user.id)),
  leave: coachingProcedure
    .input(leaveInputSchema)
    .mutation(({ ctx }) => coachingLinkService.leave(ctx.user.id, sourceOf(ctx))),

  // ─── Find a trainer + coaching requests (PRD 2026-10 §4.1) ───────────────────
  /** Trainers only, by NAME only; needs no Following. The query is never logged. */
  findTrainers: coachingProcedure.input(findTrainersInputSchema).query(({ ctx, input }) => {
    assertWithinRateLimit(
      'coaching.findTrainers',
      ctx.user.id,
      COACHING_LIMITS.findTrainersPerMinute,
      MINUTE_MS,
    );
    return coachingRequestService.findTrainers(ctx.user.id, input);
  }),
  /** The trainer profile screen; NOT_FOUND "This trainer isn't available" for anyone not findable. */
  trainerCard: coachingProcedure
    .input(trainerIdInputSchema)
    .query(({ ctx, input }) => coachingRequestService.trainerCard(ctx.user.id, input.trainerId)),
  /** "Ask to coach me", sent from the consent screen. One pending request per client. */
  requestCoaching: coachingProcedure
    .input(requestCoachingInputSchema)
    .mutation(({ ctx, input }) => {
      assertWithinRateLimit(
        'coaching.requestCoaching',
        ctx.user.id,
        COACHING_LIMITS.requestsPerDay,
        DAY_MS,
      );
      return coachingRequestService.request(
        ctx.user.id,
        input.trainerId,
        sourceOf(ctx),
        input.localDate,
      );
    }),
  cancelRequest: coachingProcedure
    .input(cancelCoachingRequestInputSchema)
    .mutation(({ ctx }) => coachingRequestService.cancel(ctx.user.id, sourceOf(ctx))),

  // ─── Notices (PRD 2026-10 §4.2, §4.3) — both sides read the same list ────────
  notices: coachingProcedure.query(({ ctx }) => coachingNoticeService.list(ctx.user.id)),
  dismissNotice: coachingProcedure
    .input(dismissCoachingNoticeInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await coachingNoticeService.dismiss(ctx.user.id, input.id))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.notFound });
      }
      return { ok: true as const };
    }),
});
