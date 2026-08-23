import { coachService } from '../application/coach/coach.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Adaptive Chef router (F1) ────────────────────────────────────────────────
// Thin wrapper per CLAUDE.md. Protected (not premium): every tier may ask —
// CoachService shapes the answer by entitlement (full review for
// adaptiveCoaching, first-line teaser for free; the full text never leaves
// the server for free users). Weight logging stays on the existing
// tracker.logWeight / tracker.weightHistory procedures.

export const coachRouter = router({
  /** Latest weekly review while fresh — full, teaser, or eligibility hint. */
  currentReview: protectedProcedure.query(async ({ ctx }) => {
    return coachService.getCurrentReview(ctx.user);
  }),
});
