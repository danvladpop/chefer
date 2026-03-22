import { dashboardService } from '../application/dashboard/dashboard.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const dashboardRouter = router({
  /**
   * Returns everything the Dashboard page needs in a single query:
   * user info, today's meals, week plan, favourites, and nutrition totals.
   */
  summary: protectedProcedure.query(async ({ ctx }) => {
    return dashboardService.getSummary(ctx.user.id, ctx.user.firstName ?? null);
  }),
});
