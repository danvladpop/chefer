import { z } from 'zod';
import { offerKindSchema, setOverrideInputSchema, type ProgressionDto } from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

export const gymProgressionRouter = router({
  forExercises: protectedProcedure
    .input(z.object({ exerciseIds: z.array(z.string().min(1).max(100)).max(60) }))
    .query(() => notImplemented<ProgressionDto[]>('progression.forExercises')),
  /** Target-level edit (D5c): override the next session's weight/reps. */
  setOverride: protectedProcedure
    .input(setOverrideInputSchema)
    .mutation(() => notImplemented<ProgressionDto>('progression.setOverride')),
  clearOverride: protectedProcedure
    .input(
      z.object({ exerciseId: z.string().min(1).max(100), repBucket: z.string().min(1).max(20) }),
    )
    .mutation(() => notImplemented<ProgressionDto>('progression.clearOverride')),
  startDeload: protectedProcedure.mutation(() =>
    notImplemented<{ ok: true }>('progression.startDeload'),
  ),
  dismissOffer: protectedProcedure
    .input(z.object({ kind: offerKindSchema, key: z.string().min(1).max(100) }))
    .mutation(() => notImplemented<{ ok: true }>('progression.dismissOffer')),
});
