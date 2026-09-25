import { z } from 'zod';
import { localDateSchema, statsRangeSchema } from '@chefer/types';
import { gymStatsService } from '../../application/gym/gym-stats.service.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

const exerciseId = z.string().min(1).max(100);

export const gymStatsRouter = router({
  e1rm: protectedProcedure
    .input(z.object({ exerciseId, range: statsRangeSchema.default('3m') }))
    .query(({ ctx, input }) => gymStatsService.e1rm(ctx.user.id, input.exerciseId, input.range)),
  repPrs: protectedProcedure
    .input(z.object({ exerciseId }))
    .query(({ ctx, input }) => gymStatsService.repPrs(ctx.user.id, input.exerciseId)),
  muscleVolume: protectedProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(52).default(12) }))
    .query(({ ctx, input }) => gymStatsService.muscleVolume(ctx.user.id, input.weeks)),
  consistency: protectedProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(104).default(52) }))
    .query(({ ctx, input }) => gymStatsService.consistency(ctx.user.id, input.weeks)),
  prs: protectedProcedure
    .input(
      z.object({
        exerciseId: exerciseId.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(({ ctx, input }) => gymStatsService.prs(ctx.user.id, input.exerciseId, input.limit)),
  monthlyRecap: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(({ ctx, input }) => gymStatsService.monthlyRecap(ctx.user.id, input.month)),
  bodyweight: protectedProcedure
    .input(z.object({ range: statsRangeSchema.default('3m'), today: localDateSchema.optional() }))
    .query(({ ctx, input }) => gymStatsService.bodyweight(ctx.user.id, input.range, input.today)),
});
