import {
  AI_CONSENT_COPY,
  AI_CONSENT_FEATURE_DATA,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_DISCLOSURE,
  type AiConsentFeature,
  type AiProviderDisclosure,
  type AiProviderId,
} from '@chefer/types';

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

/** "Groq", "Groq and Cloudflare Workers AI", "A, B and C". */
export function formatAiProviderNames(ids: readonly AiProviderId[]): string {
  const names = ids.map((id) => AI_PROVIDERS[id].name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Every provider in a disclosure, primary first, without repeats. */
export function aiDisclosureProviders(
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): AiProviderId[] {
  return [...new Set([disclosure.primary, ...disclosure.backups])];
}

/** The sheet's opening sentence for one feature. */
export function aiConsentIntro(
  feature: AiConsentFeature,
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): string {
  return AI_CONSENT_COPY.intro
    .replace('{action}', AI_CONSENT_FEATURE_DATA[feature].action)
    .replace('{primary}', AI_PROVIDERS[disclosure.primary].name);
}

/** The sheet's backup-provider line, or null when there is no backup. */
export function aiConsentBackupLine(
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): string | null {
  const backups = disclosure.backups.filter((id) => id !== disclosure.primary);
  if (backups.length === 0) return null;
  return AI_CONSENT_COPY.backupProvider
    .replace('{primaryShort}', AI_PROVIDERS[disclosure.primary].shortName)
    .replace('{backups}', formatAiProviderNames(backups));
}

/** The profile toggle's "on" description, naming every active provider. */
export function aiConsentToggleOn(
  disclosure: AiProviderDisclosure = DEFAULT_AI_PROVIDER_DISCLOSURE,
): string {
  return AI_CONSENT_COPY.toggleOn.replace(
    '{providers}',
    formatAiProviderNames(aiDisclosureProviders(disclosure)),
  );
}

/**
 * A server answer (profile.aiProviders) checked against the known provider
 * ids — an unknown id from a newer server falls back to the default rather
 * than rendering "undefined".
 */
export function toAiProviderDisclosure(value: unknown): AiProviderDisclosure {
  const v = value as { primary?: unknown; backups?: unknown } | null | undefined;
  const known = (id: unknown): id is AiProviderId =>
    typeof id === 'string' && Object.prototype.hasOwnProperty.call(AI_PROVIDERS, id);
  if (!v || !known(v.primary) || !Array.isArray(v.backups) || !v.backups.every(known)) {
    return DEFAULT_AI_PROVIDER_DISCLOSURE;
  }
  return { primary: v.primary, backups: v.backups };
}
