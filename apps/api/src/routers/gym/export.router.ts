// gym.export.* (gym_plan.md §4.2). G4-C, additive: a query only, nothing to
// sync back. Thin wrapper — the CSV assembly lives in gym-export.service.ts.
import { gymExportService } from '../../application/gym/gym-export.service.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { protectedProcedure, router } from '../../lib/trpc.js';

export const gymExportRouter = router({
  /** Full COMPLETED-session history as CSV, one row per set (research §5.2 #5). */
  csv: protectedProcedure.query(({ ctx }) => {
    // An occasional, deliberate action (a settings-screen button), not a
    // sync loop — a tight bucket still allows retries after a dropped
    // connection without inviting a scrape of the whole history.
    assertWithinRateLimit('gym.export.csv', ctx.user.id, 5, 60 * 1000);
    return gymExportService.exportCsv(ctx.user.id);
  }),
});
