import { z } from 'zod';
import { HEALTH_CONSENT_VERSION, HEALTH_WITHDRAW_CONFIRM } from '@chefer/types';
import { privacyService } from '../application/privacy/privacy.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Privacy router (§2.8, §2.13, T-39.2) ──────────────────────────────────────
// Consent log (T-39.2), analytics switches (T-12.3), and the health-information
// consent (T-26.1): `grantHealthConsent` / `withdrawHealthData`. Health consent
// is SEPARATE from the AI consent (`user.grantAiDataConsent`).

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
    privacyService.listMyConsentEvents(ctx.user.id, ctx.clientApiLevel),
  ),

  /** Profile → Privacy & data → "Consent history". */
  getConsentHistory: protectedProcedure.query(({ ctx }) =>
    privacyService.getConsentHistory(ctx.user.id, ctx.clientApiLevel),
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

  /**
   * "Allow and save" on the HealthDataConsentSheet (T-26.1). Idempotent;
   * records a HEALTH consent event and `user.me.healthDataConsentAt`.
   */
  grantHealthConsent: protectedProcedure
    .input(
      z.object({ version: z.string().min(1).max(64).default(HEALTH_CONSENT_VERSION) }).default({}),
    )
    .mutation(({ ctx, input }) =>
      privacyService.grantHealthConsent({
        userId: ctx.user.id,
        source: sourceOf(ctx),
        version: input.version,
      }),
    ),

  /**
   * Profile → Privacy & data → "Withdraw and delete" (T-26.1, UX-26 AC3):
   * deletes allergies/diets/dislikes (owner + household), goal, body metrics,
   * own targets and weigh-ins, and records the withdrawal. Keeps the account.
   */
  withdrawHealthData: protectedProcedure
    .input(z.object({ confirm: z.literal(HEALTH_WITHDRAW_CONFIRM) }))
    .mutation(({ ctx }) =>
      privacyService.withdrawHealthData({ userId: ctx.user.id, source: sourceOf(ctx) }),
    ),

  /** Re-accept sheet after a Terms/Privacy document version bump. */
  acceptTerms: protectedProcedure
    .input(z.object({ documentVersion: z.string().min(1), ageConfirmed: z.boolean().optional() }))
    .mutation(({ ctx, input }) =>
      privacyService.acceptTerms({ userId: ctx.user.id, source: sourceOf(ctx), ...input }),
    ),
});
