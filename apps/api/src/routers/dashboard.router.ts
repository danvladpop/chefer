import { z } from 'zod';
import { dashboardService } from '../application/dashboard/dashboard.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const dashboardRouter = router({
  /**
   * Returns everything the Dashboard page needs in a single query:
   * user info, today's meals, week plan, favourites, and nutrition totals.
   */
  summary: protectedProcedure
    .input(
      z
        .object({
          // The client's own calendar day and hour, so "today" and "next meal"
          // follow the user's time zone, not the server's (audit F-DASH-1-1).
          // Optional: older clients fall back to server time.
          localDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          localHour: z.number().int().min(0).max(23).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return dashboardService.getSummary(ctx.user.id, ctx.user.firstName ?? null, input);
    }),
});
