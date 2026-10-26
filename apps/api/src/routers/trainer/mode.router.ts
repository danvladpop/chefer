import {
  saveCheckInConfigInputSchema,
  saveTrainerAlertsInputSchema,
  trainerBadgesInputSchema,
  trainerDashboardInputSchema,
} from '@chefer/types';
import { coachingCheckInService } from '../../application/coaching/coaching-check-in.service.js';
import { trainerAlertsService } from '../../application/coaching/trainer-alerts.service.js';
import { trainerDashboardService } from '../../application/coaching/trainer-dashboard.service.js';
import { trainerProcedure } from '../../lib/coaching-middleware.js';
import { router } from '../../lib/trpc.js';

// ─── Trainer mode (docs/prd-2026-10/trainer-mode.md §9) ───────────────────────
// trainer.badges and trainer.dashboard.*: the second app shell's counts. Thin.

export const trainerModeRouter = router({
  /** One count source for every trainer badge, polled every 60 s in the foreground (§7.1). */
  badges: trainerProcedure
    .input(trainerBadgesInputSchema)
    .query(({ ctx, input }) => trainerDashboardService.badges(ctx.user.id, input?.today)),
  /** Lane K4: when a client "goes quiet" (N days with nothing logged) and the daily digest. */
  alerts: router({
    config: trainerProcedure.query(({ ctx }) => trainerAlertsService.config(ctx.user.id)),
    saveConfig: trainerProcedure
      .input(saveTrainerAlertsInputSchema)
      .mutation(({ ctx, input }) => trainerAlertsService.saveConfig(ctx.user.id, input)),
  }),
  /** Lane K4: the trainer looked at Today; the quiet badge (`trainer.badges.quietClients`) starts over. */
  quiet: router({
    markSeen: trainerProcedure.mutation(({ ctx }) => trainerAlertsService.markSeen(ctx.user.id)),
  }),
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
