import { privacyService } from '../application/privacy/privacy.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Privacy router (§2.8, §2.13, T-00.10 stub) ────────────────────────────────
// STUB — wave 1 (T-26.1, T-39.1-39.5) adds `grantHealthConsent`,
// `withdrawHealthData`, `exportData`, `recordAnalyticsConsent`, etc.
// Registered now so no lane needs to touch `routers/index.ts` later.

export const privacyRouter = router({
  /** This user's consent log — a read-only passthrough. */
  consentLog: protectedProcedure.query(({ ctx }) =>
    privacyService.listMyConsentEvents(ctx.user.id),
  ),
});
