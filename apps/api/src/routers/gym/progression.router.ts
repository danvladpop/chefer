import { z } from 'zod';
import { offerKindSchema, setOverrideInputSchema } from '@chefer/types';
import { progressionService } from '../../application/gym/progression.service.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

export const gymProgressionRouter = router({
  forExercises: protectedProcedure
    .input(z.object({ exerciseIds: z.array(z.string().min(1).max(100)).max(60) }))
    .query(({ ctx, input }) =>
      progressionService.forExercises(
        ctx.user.id,
        input.exerciseIds,
        undefined,
        ctx.clientApiLevel,
      ),
    ),
  /** Target-level edit (D5c): override the next session's weight/reps. */
  setOverride: protectedProcedure.input(setOverrideInputSchema).mutation(({ ctx, input }) =>
    // Stamps `setById` = the caller (trainer coaching §9.2: last write wins, attributed).
    progressionService.setOverride(ctx.user.id, input, {
      setById: ctx.user.id,
      level: ctx.clientApiLevel,
    }),
  ),
  clearOverride: protectedProcedure
    .input(
      z.object({ exerciseId: z.string().min(1).max(100), repBucket: z.string().min(1).max(20) }),
    )
    .mutation(({ ctx, input }) =>
      progressionService.clearOverride(ctx.user.id, input, ctx.clientApiLevel),
    ),
  startDeload: protectedProcedure.mutation(({ ctx }) =>
    progressionService.startDeload(ctx.user.id),
  ),
  dismissOffer: protectedProcedure
    .input(z.object({ kind: offerKindSchema, key: z.string().min(1).max(100) }))
    .mutation(({ ctx, input }) =>
      progressionService.dismissOffer(ctx.user.id, input.kind, input.key),
    ),
});
