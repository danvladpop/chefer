// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Runs the REAL posthog-js SDK (network stubbed) to prove the consent model in
// analytics.ts: no cookies or web storage for analytics, and events are linked
// to the account only after the user opts in (backlog P0-6).

type AnalyticsModule = typeof import('./analytics');
type PosthogModule = typeof import('posthog-js');

let analytics: AnalyticsModule;
let posthog: PosthogModule['default'];
const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));

function storageKeys(): string[] {
  return [...Object.keys(window.localStorage), ...Object.keys(window.sessionStorage)];
}

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_DEV', '1');
  vi.resetModules();
  analytics = await import('./analytics');
  posthog = (await import('posthog-js')).default;
  analytics.initAnalytics();
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  analytics.resetAnalytics();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('analytics consent model', () => {
  it('configures PostHog with in-memory persistence and no replay, surveys or flags', () => {
    expect(analytics.POSTHOG_OPTIONS).toMatchObject({
      persistence: 'memory',
      person_profiles: 'identified_only',
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
    });
  });

  it('an anonymous visitor gets no cookies or web storage, yet events are still sent', async () => {
    fetchMock.mockClear();
    analytics.capture('landing_viewed');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 3000 });
    expect(storageKeys()).toEqual([]);
    expect(document.cookie).toBe('');
  });

  it('a signed-in user without consent stays anonymous (not linked to the account)', () => {
    analytics.identifyUser('user-1', 'FREE');
    analytics.capture('plan_generated');
    expect(posthog.get_distinct_id()).not.toBe('user-1');
    expect(storageKeys()).toEqual([]);
  });

  it('defaults to denied, per account', () => {
    expect(analytics.getAnalyticsConsent('user-1')).toBe('denied');
    analytics.setAnalyticsConsent('user-1', 'granted');
    expect(analytics.getAnalyticsConsent('user-1')).toBe('granted');
    expect(analytics.getAnalyticsConsent('user-2')).toBe('denied');
  });

  it('granting consent links events to the account; only the choice itself is stored', () => {
    analytics.identifyUser('user-1', 'FREE');
    analytics.setAnalyticsConsent('user-1', 'granted');
    expect(posthog.get_distinct_id()).toBe('user-1');
    expect(storageKeys()).toEqual(['chefer.analytics-consent:user-1']);
    expect(document.cookie).toBe('');
  });

  it('a stored grant is applied when the session resolves', () => {
    analytics.setAnalyticsConsent('user-1', 'granted');
    analytics.identifyUser('user-1', 'PREMIUM');
    expect(posthog.get_distinct_id()).toBe('user-1');
  });

  it('withdrawing consent drops the identity at once', () => {
    analytics.identifyUser('user-1', 'FREE');
    analytics.setAnalyticsConsent('user-1', 'granted');
    analytics.setAnalyticsConsent('user-1', 'denied');
    expect(posthog.get_distinct_id()).not.toBe('user-1');
  });

  it('logout drops the identity so the next person is not attributed to the account', () => {
    analytics.setAnalyticsConsent('user-1', 'granted');
    analytics.identifyUser('user-1', 'FREE');
    analytics.resetAnalytics();
    expect(posthog.get_distinct_id()).not.toBe('user-1');
  });
});
