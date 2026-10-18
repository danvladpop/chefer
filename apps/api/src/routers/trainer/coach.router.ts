import { coachStartInputSchema, coachSyncInputSchema } from '@chefer/types';
import { coachedWorkoutService } from '../../application/coaching/coached-workout.service.js';
import { requireCoachingAccess, trainerProcedure } from '../../lib/coaching-middleware.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { router } from '../../lib/trpc.js';

// ─── trainer.coach.* — coached workouts (docs/prd-2026-10/trainer-mode.md §6.7, §8.3; M3) ──
// The trainer logs a workout on an ACTIVE client's behalf. `loggedById` is the
// caller (ctx.user), never anything the client sent. Thin: handlers delegate.

const writeProcedure = trainerProcedure.use(requireCoachingAccess('write'));

export const trainerCoachRouter = router({
  /** The client's prescription (their progression, units, routine) for the booking's day or their next one. */
  start: writeProcedure
    .input(coachStartInputSchema)
    .mutation(({ ctx, input }) =>
      coachedWorkoutService.start(ctx.coachingAccess, input.bookingId ?? null, input.today),
    ),
  /** The client's normal session sync, stamped `loggedById = ctx.user.id`. */
  sync: writeProcedure.input(coachSyncInputSchema).mutation(({ ctx, input }) => {
    // Same per-user bucket as gym.upsertMany: an outbox flushes every 30 s at most.
    assertWithinRateLimit('trainer.coach.sync', ctx.user.id, 60, 60 * 1000);
    return coachedWorkoutService.sync(ctx.coachingAccess, ctx.user.id, input.docs);
  }),
});
