import { z } from 'zod';
import { customExerciseInputSchema } from '@chefer/types';
import { exerciseLibraryService } from '../../application/gym/exercise-library.service.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

const HOUR_MS = 60 * 60 * 1000;

export const gymLibraryRouter = router({
  list: protectedProcedure
    .input(z.object({ updatedSince: z.string().datetime({ offset: true }).optional() }).optional())
    .query(({ ctx, input }) => exerciseLibraryService.list(ctx.user.id, input?.updatedSince)),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(({ ctx, input }) => exerciseLibraryService.get(ctx.user.id, input.id)),
  createCustom: protectedProcedure.input(customExerciseInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('gym.createCustom', ctx.user.id, 30, HOUR_MS);
    return exerciseLibraryService.createCustom(ctx.user.id, input);
  }),
  updateCustom: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100), exercise: customExerciseInputSchema }))
    .mutation(({ ctx, input }) =>
      exerciseLibraryService.updateCustom(ctx.user.id, input.id, input.exercise),
    ),
  archiveCustom: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .mutation(({ ctx, input }) => exerciseLibraryService.archiveCustom(ctx.user.id, input.id)),
});
