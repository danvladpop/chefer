import { z } from 'zod';
import { privacyService } from '../application/privacy/privacy.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Privacy router (§2.8, §2.13, T-39.2) ──────────────────────────────────────
// `grantHealthConsent` / `withdrawHealthData` / `exportData` (§2.8, T-26.1)
// stay wave 3 (L-CONSENT) stubs; this wave wires the consent-log surface.

/** `ctx.isMobileClient` (set from the `x-chefer-client` header) picks the source — never trust a client-supplied source string. */
function sourceOf(ctx: { isMobileClient: boolean }): 'web' | 'mobile' {
  return ctx.isMobileClient ? 'mobile' : 'web';
}

export const privacyRouter = router({
  /**
   * This user's consent log — a read-only passthrough. Kept for any caller
   * that already shipped against the wave-0 stub name; `getConsentHistory`
   * is the name used going forward (T-39.2, `src/features/privacy/consent-history.tsx`).
   */
  consentLog: protectedProcedure.query(({ ctx }) =>
    privacyService.listMyConsentEvents(ctx.user.id),
  ),

  /** Profile → Privacy & data → "Consent history". */
  getConsentHistory: protectedProcedure.query(({ ctx }) =>
    privacyService.getConsentHistory(ctx.user.id),
  ),

  /**
   * Logs the analytics consent switches (T-12.3). Analytics consent itself
   * lives on the device (no server-side enforcement this wave) — this call
   * is only what makes the choice provable in the consent log.
   */
  recordAnalyticsConsent: protectedProcedure
    .input(z.object({ anonymous: z.boolean().optional(), linked: z.boolean().optional() }))
    .mutation(({ ctx, input }) =>
      privacyService.recordAnalyticsConsent({
        userId: ctx.user.id,
        source: sourceOf(ctx),
        ...input,
      }),
    ),

  /** Re-accept sheet after a Terms/Privacy document version bump. */
  acceptTerms: protectedProcedure
    .input(z.object({ documentVersion: z.string().min(1), ageConfirmed: z.boolean().optional() }))
    .mutation(({ ctx, input }) =>
      privacyService.acceptTerms({ userId: ctx.user.id, source: sourceOf(ctx), ...input }),
    ),
});
