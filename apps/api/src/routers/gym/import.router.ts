// gym.import.* (G2, market review 2026-10): workouts from a Strong or Hevy
// CSV export. Thin wrapper — parsing, matching and writing live in
// workout-import.service.ts. Additive: new procedures only.
import { workoutImportCommitInputSchema, workoutImportPreviewInputSchema } from '@chefer/types';
import { workoutImportService } from '../../application/gym/workout-import.service.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

const TEN_MINUTES = 10 * 60 * 1000;

export const gymImportRouter = router({
  /** Parse the file and match its exercise names; writes nothing. A mutation: the file is the body. */
  preview: protectedProcedure.input(workoutImportPreviewInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('gym.import.preview', ctx.user.id, 30, TEN_MINUTES);
    return workoutImportService.preview(ctx.user.id, input);
  }),

  /** Write the workouts with the user's exercise choices. Re-importing the same file adds nothing. */
  commit: protectedProcedure.input(workoutImportCommitInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('gym.import.commit', ctx.user.id, 5, TEN_MINUTES);
    return workoutImportService.commit(ctx.user.id, input);
  }),
});
