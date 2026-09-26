import { AI_CONSENT_COPY, AI_CONSENT_FEATURE_DATA, type AiConsentFeature } from '@chefer/types';

// ─── AI data consent gate (App Store 5.1.2(i)) ───────────────────────────────
// Pure decision logic shared by the web and mobile consent guards, so both
// platforms ask in exactly the same situations.

/** The slice of `user.me` the gate reads (a Date, or an ISO string off the wire). */
export interface AiConsentSubject {
  aiDataConsentAt?: Date | string | null;
}

/**
 * Whether `feature` sends data to the AI provider for this tier. Free plan
 * generation and free swaps draw from the curated recipe pool (no AI call),
 * so only premium users are asked there. Unknown tier (still loading) asks —
 * the safe side. Every other feature always calls the AI.
 */
export function aiConsentRequiredFor(
  feature: AiConsentFeature,
  isPremium: boolean | undefined,
): boolean {
  if (feature === 'meal-plan' || feature === 'meal-swap') return isPremium !== false;
  return true;
}

/**
 * True when the action must show the consent sheet first: it uses AI and the
 * user has not consented (or revoked it). A user that is not loaded yet asks.
 */
export function needsAiDataConsent(
  user: AiConsentSubject | null | undefined,
  usesAi = true,
): boolean {
  if (!usesAi) return false;
  return !user?.aiDataConsentAt;
}

/** The sheet's opening sentence for one feature. */
export function aiConsentIntro(feature: AiConsentFeature): string {
  return AI_CONSENT_COPY.intro.replace('{action}', AI_CONSENT_FEATURE_DATA[feature].action);
}
