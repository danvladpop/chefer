import { TRPCError } from '@trpc/server';
import {
  bookingIdInputSchema,
  cancelCoachingRequestInputSchema,
  COACHING_COPY,
  COACHING_LIMITS,
  currentCheckInInputSchema,
  dismissCoachingNoticeInputSchema,
  findTrainersInputSchema,
  joinInputSchema,
  leaveInputSchema,
  previewInviteInputSchema,
  requestCoachingInputSchema,
  setCoachingSharingInputSchema,
  submitCheckInInputSchema,
  trainerIdInputSchema,
  type CoachingAvailabilityDto,
} from '@chefer/types';
import { bookingService } from '../application/coaching/booking.service.js';
import { coachingCheckInService } from '../application/coaching/coaching-check-in.service.js';
import { coachingInviteService } from '../application/coaching/coaching-invite.service.js';
import { coachingLinkService } from '../application/coaching/coaching-link.service.js';
import { coachingNoticeService } from '../application/coaching/coaching-notice.service.js';
import { coachingRequestService } from '../application/coaching/coaching-request.service.js';
import { contractLevelOf } from '../lib/client-contract-level.js';
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
    return coachingLinkService.join(
      ctx.user.id,
      input.code,
      sourceOf(ctx),
      input.localDate,
      contractLevelOf(ctx),
      input.share,
    );
  }),
  status: coachingProcedure.query(({ ctx }) =>
    coachingLinkService.status(ctx.user.id, contractLevelOf(ctx)),
  ),
  /** Trainer mode M3 (§10): the client read the v2 consent copy ("bookings and logged workouts"). */
  acknowledgeConsentUpdate: coachingProcedure.mutation(({ ctx }) =>
    coachingLinkService.acknowledgeConsentUpdate(ctx.user.id, sourceOf(ctx)),
  ),
  /**
   * Lane K1: the client's "Share my food log" / "Share my weight" switches for
   * their active coaching. Each change is a consent event; a revoke hides the
   * data from the trainer's next request on.
   */
  setSharing: coachingProcedure
    .input(setCoachingSharingInputSchema)
    .mutation(({ ctx, input }) =>
      coachingLinkService.setSharing(ctx.user.id, input, sourceOf(ctx)),
    ),
  leave: coachingProcedure
    .input(leaveInputSchema)
    .mutation(({ ctx }) =>
      coachingLinkService.leave(ctx.user.id, sourceOf(ctx), contractLevelOf(ctx)),
    ),

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
        input.share,
      );
    }),
  cancelRequest: coachingProcedure
    .input(cancelCoachingRequestInputSchema)
    .mutation(({ ctx }) => coachingRequestService.cancel(ctx.user.id, sourceOf(ctx))),

  // ─── Notices (PRD 2026-10 §4.2, §4.3) — both sides read the same list ────────
  notices: coachingProcedure.query(({ ctx }) =>
    coachingNoticeService.list(ctx.user.id, contractLevelOf(ctx)),
  ),
  dismissNotice: coachingProcedure
    .input(dismissCoachingNoticeInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await coachingNoticeService.dismiss(ctx.user.id, input.id))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.notFound });
      }
      return { ok: true as const };
    }),

  // ─── Weekly check-ins, the client's side (lane K3) ───────────────────────────
  checkIn: router({
    /** The open check-in (null: no trainer, check-ins off, or not open yet). `today` = device-local. */
    current: coachingProcedure
      .input(currentCheckInInputSchema)
      .query(({ ctx, input }) => coachingCheckInService.current(ctx.user.id, input.today)),
    /** Answers the open check-in; answering again changes the answers until the next one opens. */
    submit: coachingProcedure.input(submitCheckInInputSchema).mutation(async ({ ctx, input }) => {
      assertWithinRateLimit('coaching.checkIn.submit', ctx.user.id, 20, HOUR_MS);
      return (await coachingCheckInService.submit(ctx.user.id, input)).checkIn;
    }),
  }),

  // ─── Bookings, the client's side (trainer mode M3, §6.9) ────────────────────
  bookings: router({
    /** Not ended yet (cancelled ones until they start), soonest first, the next 14 days. */
    upcoming: coachingProcedure.query(({ ctx }) => bookingService.upcomingForClient(ctx.user.id)),
    /** NOT_FOUND "This booking isn't available" unless it is the caller's own. */
    get: coachingProcedure
      .input(bookingIdInputSchema)
      .query(({ ctx, input }) => bookingService.getForClient(ctx.user.id, input.bookingId)),
  }),
});
