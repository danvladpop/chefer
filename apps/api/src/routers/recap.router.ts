import { recapWeekInputSchema } from '@chefer/types';
import { recapService } from '../application/recap/recap.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Weekly recap (market review 2026-10, lane E2) ───────────────────────────
// "Your week in review": factual counts for one Monday–Sunday week. Every tier.

export const recapRouter = router({
  week: protectedProcedure.input(recapWeekInputSchema).query(({ ctx, input }) => {
    return recapService.week(ctx.user.id, input ?? {});
  }),
});
