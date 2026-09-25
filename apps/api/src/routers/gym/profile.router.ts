import {
  completeSetupInputSchema,
  recommendInputSchema,
  saveGymProfileInputSchema,
} from '@chefer/types';
import { gymProfileService } from '../../application/gym/gym-profile.service.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

export const gymProfileRouter = router({
  get: protectedProcedure.query(({ ctx }) => gymProfileService.get(ctx.user.id)),
  save: protectedProcedure
    .input(saveGymProfileInputSchema)
    .mutation(({ ctx, input }) => gymProfileService.save(ctx.user.id, input)),
  /** Pure engine call — no DB; powers the setup preview. */
  recommend: protectedProcedure
    .input(recommendInputSchema)
    .query(({ input }) => gymProfileService.recommend(input)),
  /** Creates profile + active routine + initial progressions; returns a fresh bootstrap. */
  completeSetup: protectedProcedure.input(completeSetupInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('gym.completeSetup', ctx.user.id, 20, 60 * 60 * 1000);
    return gymProfileService.completeSetup(ctx.user.id, input);
  }),
});
