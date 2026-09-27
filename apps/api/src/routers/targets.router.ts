import { targetsService } from '../application/targets/targets.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Targets router (§2.11, T-00.10 stub) ──────────────────────────────────────
// STUB — wave 1 (T-35.1, T-11.1) adds `get`, `setOwn`, `acknowledgeChange`,
// etc. Registered now so no lane needs to touch `routers/index.ts` later.

export const targetsRouter = router({
  /** This user's unresolved target changes — a read-only passthrough. */
  myUnresolvedChanges: protectedProcedure.query(({ ctx }) =>
    targetsService.listMyUnresolvedChanges(ctx.user.id),
  ),
});
