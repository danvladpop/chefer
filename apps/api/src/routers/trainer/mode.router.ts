import { saveCheckInConfigInputSchema, trainerDashboardInputSchema } from '@chefer/types';
import { coachingCheckInService } from '../../application/coaching/coaching-check-in.service.js';
import { trainerDashboardService } from '../../application/coaching/trainer-dashboard.service.js';
import { trainerProcedure } from '../../lib/coaching-middleware.js';
import { router } from '../../lib/trpc.js';

// ─── Trainer mode (docs/prd-2026-10/trainer-mode.md §9) ───────────────────────
// trainer.badges and trainer.dashboard.*: the second app shell's counts. Thin.

export const trainerModeRouter = router({
  /** One count source for every trainer badge, polled every 60 s in the foreground (§7.1). */
  badges: trainerProcedure.query(({ ctx }) => trainerDashboardService.badges(ctx.user.id)),
  /** Lane K3: the trainer's weekly check-in (one config for every client). */
  checkIns: router({
    config: trainerProcedure.query(({ ctx }) => coachingCheckInService.config(ctx.user.id)),
    saveConfig: trainerProcedure
      .input(saveCheckInConfigInputSchema)
      .mutation(({ ctx, input }) => coachingCheckInService.saveConfig(ctx.user.id, input)),
  }),
  dashboard: router({
    /** Trainer Today's numbers (§6.1). Booking fields stay null until bookings exist (M3). */
    summary: trainerProcedure
      .input(trainerDashboardInputSchema)
      .query(({ ctx, input }) => trainerDashboardService.summary(ctx.user.id, input.today)),
  }),
});
