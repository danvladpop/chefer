import { z } from 'zod';
import {
  localDateSchema,
  statsRangeSchema,
  type BodyweightPointDto,
  type E1rmSeriesDto,
  type MonthlyRecapDto,
  type MuscleVolumeWeekDto,
  type PrDto,
  type RepPrRowDto,
  type StreakInfo,
  type WeekSummary,
} from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

const exerciseId = z.string().min(1).max(100);

export const gymStatsRouter = router({
  e1rm: protectedProcedure
    .input(z.object({ exerciseId, range: statsRangeSchema.default('3m') }))
    .query(() => notImplemented<E1rmSeriesDto>('stats.e1rm')),
  repPrs: protectedProcedure
    .input(z.object({ exerciseId }))
    .query(() => notImplemented<RepPrRowDto[]>('stats.repPrs')),
  muscleVolume: protectedProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(52).default(12) }))
    .query(() => notImplemented<MuscleVolumeWeekDto[]>('stats.muscleVolume')),
  consistency: protectedProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(104).default(52) }))
    .query(() => notImplemented<{ weeks: WeekSummary[]; streak: StreakInfo }>('stats.consistency')),
  prs: protectedProcedure
    .input(
      z.object({
        exerciseId: exerciseId.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(() => notImplemented<PrDto[]>('stats.prs')),
  monthlyRecap: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(() => notImplemented<MonthlyRecapDto>('stats.monthlyRecap')),
  bodyweight: protectedProcedure
    .input(z.object({ range: statsRangeSchema.default('3m'), today: localDateSchema.optional() }))
    .query(() => notImplemented<BodyweightPointDto[]>('stats.bodyweight')),
});
