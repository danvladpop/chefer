import { createShareCardInputSchema, getShareCardInputSchema } from '@chefer/types';
import { shareService } from '../application/share/share.service.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { protectedProcedure, publicProcedure, router } from '../lib/trpc.js';

// ─── Share cards (market review 2026-10, lane E2) ────────────────────────────
// `create` snapshots what the card shows and returns its public link; `get`
// is public on purpose (the person chose to share it) and backs the web
// image route and landing page at /s/<id>.

export const shareRouter = router({
  create: protectedProcedure.input(createShareCardInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('share.create', ctx.user.id, 30, 60 * 60 * 1000);
    return shareService.create(ctx.user.id, input);
  }),

  get: publicProcedure.input(getShareCardInputSchema).query(({ ctx, input }) => {
    assertWithinRateLimit('share.get', ctx.ipAddress, 240, 15 * 60 * 1000);
    return shareService.get(input.id);
  }),
});
