import { safetyService } from '../application/safety/safety.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Safety router (§2.1, T-00.10 stub) ────────────────────────────────────────
// STUB — wave 1 (T-01.1-T-01.9, T-01.5) adds `check`, `filter`, `report`, etc.
// Registered now so no lane needs to touch `routers/index.ts` later.

export const safetyRouter = router({
  /** This user's reported recipes (UX-01 d) — a read-only passthrough. */
  myReports: protectedProcedure.query(({ ctx }) => safetyService.listMyReports(ctx.user.id)),
});
