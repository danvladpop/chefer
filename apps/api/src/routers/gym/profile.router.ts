import {
  completeSetupInputSchema,
  recommendInputSchema,
  saveGymProfileInputSchema,
  type GymBootstrap,
  type GymProfileDto,
  type RecommendResultDto,
} from '@chefer/types';
import { protectedProcedure, router } from '../../lib/trpc.js';
import { notImplemented } from './_stub.js';

export const gymProfileRouter = router({
  get: protectedProcedure.query(() => notImplemented<GymProfileDto | null>('profile.get')),
  save: protectedProcedure
    .input(saveGymProfileInputSchema)
    .mutation(() => notImplemented<GymProfileDto>('profile.save')),
  /** Pure engine call — no DB; powers the setup preview. */
  recommend: protectedProcedure
    .input(recommendInputSchema)
    .query(() => notImplemented<RecommendResultDto>('profile.recommend')),
  /** Creates profile + active routine + initial progressions; returns a fresh bootstrap. */
  completeSetup: protectedProcedure
    .input(completeSetupInputSchema)
    .mutation(() => notImplemented<GymBootstrap>('profile.completeSetup')),
});
