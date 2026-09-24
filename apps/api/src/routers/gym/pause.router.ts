import { z } from 'zod';
import { pauseInputSchema } from '@chefer/types';
import { trainingPauseService } from '../../application/gym/training-pause.service.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

export const gymPauseRouter = router({
  create: protectedProcedure
    .input(pauseInputSchema)
    .mutation(({ ctx, input }) => trainingPauseService.create(ctx.user.id, input)),
  /** Ends an active pause early (endDate = today). */
  end: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .mutation(({ ctx, input }) => trainingPauseService.end(ctx.user.id, input.id)),
});
