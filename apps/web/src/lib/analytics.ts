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

/** Called once from instrumentation-client.ts. */
export function initAnalytics(): void {
  if (!enabled || typeof window === 'undefined') return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: '2026-05-30', // includes SPA pageview capture on history changes
    // Anonymous visitors stay anonymous (and cheaper); profiles are created
    // on identify() after login.
    person_profiles: 'identified_only',
  });
  posthog.register({ environment: process.env.NODE_ENV });
}

/** Ties events to the account. User ID only — no email or name (PII stays out). */
export function identifyUser(userId: string): void {
  if (enabled) posthog.identify(userId);
}

/** Called on logout so the next session isn't attributed to the old account. */
export function resetAnalytics(): void {
  if (enabled) posthog.reset();
}

/** Funnel events (upgrade prompts etc. — see launch plan PW-3). */
export function capture(event: string, properties?: Record<string, unknown>): void {
  if (enabled) posthog.capture(event, properties);
}
