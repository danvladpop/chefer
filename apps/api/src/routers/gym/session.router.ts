import { z } from 'zod';
import { clientIdSchema, upsertSessionsInputSchema } from '@chefer/types';
import { workoutSessionService } from '../../application/gym/workout-session.service.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

export const gymSessionRouter = router({
  /** Idempotent offline sync (gym_plan.md §4.1). Safe to retry. */
  upsertMany: protectedProcedure.input(upsertSessionsInputSchema).mutation(({ ctx, input }) => {
    // Per-user bucket on top of the global per-IP /trpc limiter: an outbox
    // flushes at most every 30 s, so 60/min only ever trips on a runaway loop.
    assertWithinRateLimit('gym.upsertMany', ctx.user.id, 60, 60 * 1000);
    return workoutSessionService.upsertMany(ctx.user.id, input.docs);
  }),
  get: protectedProcedure
    .input(z.object({ id: clientIdSchema }))
    .query(({ ctx, input }) => workoutSessionService.get(ctx.user.id, input.id)),
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(({ ctx, input }) => workoutSessionService.list(ctx.user.id, input)),
  discard: protectedProcedure
    .input(z.object({ id: clientIdSchema }))
    .mutation(({ ctx, input }) => workoutSessionService.discard(ctx.user.id, input.id)),
  /** Deletes a completed session and recomputes affected progressions. */
  delete: protectedProcedure
    .input(z.object({ id: clientIdSchema }))
    .mutation(({ ctx, input }) => workoutSessionService.delete(ctx.user.id, input.id)),
});
