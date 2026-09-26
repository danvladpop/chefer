import posthog from 'posthog-js';

// ─── PostHog product analytics ────────────────────────────────────────────────
// The project token is write-only ("Safe to use in public apps" — PostHog's
// own wording), so like the Sentry DSNs it lives here as a constant rather
// than in the env plumbing.
const POSTHOG_KEY = 'phc_BkbSvqWmXXBPYTPH38kHvK7X6cr7tiWaUiGRUPqvBRsw';
const POSTHOG_HOST = 'https://eu.i.posthog.com'; // EU Cloud — data stays in the EU

// Production-only so dev sessions never pollute the funnels; set
// NEXT_PUBLIC_POSTHOG_DEV=1 in .env.local to verify events locally.
const enabled =
  process.env.NODE_ENV === 'production' || process.env['NEXT_PUBLIC_POSTHOG_DEV'] === '1';

// ─── Consent model (backlog P0-6, 2026-09-26) ─────────────────────────────────
// 1. Nobody gets PostHog cookies, localStorage or sessionStorage:
//    `persistence: 'memory'` keeps the anonymous ID in the page's memory only
//    (a full reload starts a new anonymous ID). Nothing is stored on the
//    device for analytics, so no cookie banner is needed (ePrivacy Art. 5(3)).
//    analytics.test.ts checks this against the real SDK.
// 2. Anonymous usage counts (signed out, or signed in without consent) rely on
//    legitimate interest: no identify(), no person profile, no account ID.
// 3. Linking events to the account (identify with user ID + plan tier) needs
//    opt-in consent, because events such as weight_logged or workout_finished
//    tied to a person can be health-related data. Default OFF. The choice is
//    made in Profile → "Usage analytics" (AnalyticsConsentCard) and stored per
//    account on this device under CONSENT_KEY_PREFIX + userId. That key only
//    remembers the user's own choice: strictly necessary storage.
// Session replay, surveys and feature flags stay off: none is used, and each
// would read or write browser storage.
// The mobile app sends no analytics at all (no PostHog SDK in apps/mobile).

const CONSENT_KEY_PREFIX = 'chefer.analytics-consent:';

export type AnalyticsConsent = 'granted' | 'denied';

type SignedInUser = { id: string; planTier: string | undefined };

let signedInUser: SignedInUser | null = null;
let identified = false;

/** The PostHog options, exported so the test can assert the storage-free setup. */
export const POSTHOG_OPTIONS = {
  api_host: POSTHOG_HOST,
  defaults: '2026-05-30', // includes SPA pageview capture on history changes
  // Anonymous visitors stay anonymous (and cheaper); person profiles are
  // created only by identify(), which needs the user's consent.
  person_profiles: 'identified_only',
  persistence: 'memory',
  disable_session_recording: true,
  disable_surveys: true,
  advanced_disable_flags: true,
  respect_dnt: true,
} as const;

/** Called once from instrumentation-client.ts. */
export function initAnalytics(): void {
  if (!enabled || typeof window === 'undefined') return;
  posthog.init(POSTHOG_KEY, POSTHOG_OPTIONS);
  posthog.register({ environment: process.env.NODE_ENV });
}

/** The account's analytics choice on this device. Default: denied. */
export function getAnalyticsConsent(userId: string): AnalyticsConsent {
  try {
    return window.localStorage.getItem(CONSENT_KEY_PREFIX + userId) === 'granted'
      ? 'granted'
      : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Records the choice and applies it at once. Granted: events are linked to the
 * account from now on. Denied: the identity is dropped (a fresh anonymous ID),
 * and later events are anonymous counts only.
 */
export function setAnalyticsConsent(userId: string, consent: AnalyticsConsent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY_PREFIX + userId, consent);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  if (signedInUser?.id !== userId) return;
  if (consent === 'granted') {
    identifyIfConsented();
  } else if (identified) {
    identified = false;
    if (enabled) posthog.reset();
  }
}

function identifyIfConsented(): void {
  if (!signedInUser || getAnalyticsConsent(signedInUser.id) !== 'granted') return;
  identified = true;
  // User ID + plan tier only — no email or name (PII stays out). The tier
  // person-property lets every insight segment premium vs free (PW-3).
  if (enabled) {
    posthog.identify(
      signedInUser.id,
      signedInUser.planTier ? { planTier: signedInUser.planTier } : undefined,
    );
  }
}

/** Called when the session resolves. Links events to the account only with consent. */
export function identifyUser(userId: string, planTier?: string): void {
  signedInUser = { id: userId, planTier };
  identifyIfConsented();
}

/** Called on logout so the next session isn't attributed to the old account. */
export function resetAnalytics(): void {
  signedInUser = null;
  identified = false;
  if (enabled) posthog.reset();
}

/** Funnel events (upgrade prompts etc. — see launch plan PW-3). */
export function capture(event: string, properties?: Record<string, unknown>): void {
  if (enabled) posthog.capture(event, properties);
}
