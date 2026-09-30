// ─── Opt-out with events already queued (T-12 AC3, release-1 checklist §C) ─────
// AC3 says: with anonymous counting off, no network call is made. The existing
// analytics.test.ts covers "off before the event is tracked". This file covers
// the other order: an event is tracked while counting is on, then the user
// turns it off before the 30 s flush. `flush()` only checks `enabled` and the
// queue length, not consent, so `setAnalyticsConsent({ anonymous: false })`
// clears the transport queue (`clearQueue()`) — without that, the
// already-queued batch was still sent (fixed in wave 4).

jest.mock('expo-crypto', () => ({ randomUUID: () => 'session-1' }));

type AnalyticsModule = typeof import('../../src/lib/analytics');
type TransportModule = typeof import('../../src/lib/analytics-transport');
type KvModule = typeof import('../../src/features/gym/offline/kv');
type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

const ORIGINAL_ENV = { ...process.env };

function load(fetchMock: FetchMock): AnalyticsModule & TransportModule {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const kv = require('../../src/features/gym/offline/kv') as KvModule;
  kv.setKvBackendForTests(kv.createMemoryKvBackend());
  const analytics = require('../../src/lib/analytics') as AnalyticsModule;
  const transport = require('../../src/lib/analytics-transport') as TransportModule;
  /* eslint-enable @typescript-eslint/no-require-imports */
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { ...analytics, ...transport };
}

describe('analytics opt-out with a non-empty queue', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('drops events queued before the user turned counting off', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_POSTHOG_KEY: 'test-key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    };
    const fetchMock: FetchMock = jest.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true } as Response),
    );
    const analytics = load(fetchMock);

    analytics.track('app_opened', {}); // counting is on (default), so this is queued
    analytics.setAnalyticsConsent({ anonymous: false }); // user opts out before the flush
    await analytics.flush(); // the 30 s timer or the background listener

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
