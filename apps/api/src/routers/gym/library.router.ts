import { z } from 'zod';
import { customExerciseInputSchema, type ExerciseDto } from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

export const gymLibraryRouter = router({
  list: protectedProcedure
    .input(z.object({ updatedSince: z.string().datetime({ offset: true }).optional() }).optional())
    .query(() => notImplemented<ExerciseDto[]>('library.list')),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(() => notImplemented<ExerciseDto>('library.get')),
  createCustom: protectedProcedure
    .input(customExerciseInputSchema)
    .mutation(() => notImplemented<ExerciseDto>('library.createCustom')),
  updateCustom: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100), exercise: customExerciseInputSchema }))
    .mutation(() => notImplemented<ExerciseDto>('library.updateCustom')),
  archiveCustom: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .mutation(() => notImplemented<{ ok: true }>('library.archiveCustom')),
});
