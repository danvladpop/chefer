import { trainingService } from '../application/training/training.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Training router (§2.6, T-00.10 stub) ──────────────────────────────────────
// STUB — wave 1 (T-06.1) adds `setDayKinds` and the kind-led bump math.
// Registered now so no lane needs to touch `routers/index.ts` later.

export const trainingRouter = router({
  /** This user's stored weekday kinds — a read-only passthrough. */
  myDayKinds: protectedProcedure.query(({ ctx }) => trainingService.getDayKinds(ctx.user.id)),
});
