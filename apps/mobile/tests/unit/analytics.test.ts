// ─── Mobile analytics wrapper + transport (T-12.2) ─────────────────────────
// AC1: an anonymous session id that changes per cold start and carries no
// account id by default. AC2: linking on/off controls the account id at
// once. AC3: with anonymous counting off, the transport's `fetch` is never
// called. All three run against the REAL transport with a mocked global
// `fetch`, the same style as web's analytics.test.ts against the real SDK.

// `jest.resetModules()` (used below to simulate a cold start) re-invokes this
// factory, so the counter must live on `globalThis` (survives a module
// reset) rather than in the factory's own closure (would reset to 0 every
// time, defeating the "changes per cold start" assertion).
jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    const g = globalThis as { __mockUuidCounter?: number };
    g.__mockUuidCounter = (g.__mockUuidCounter ?? 0) + 1;
    return `session-${g.__mockUuidCounter}`;
  },
}));

type AnalyticsModule = typeof import('../../src/lib/analytics');
type TransportModule = typeof import('../../src/lib/analytics-transport');
type KvModule = typeof import('../../src/features/gym/offline/kv');
type Loaded = AnalyticsModule & TransportModule;
type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;

const ORIGINAL_ENV = { ...process.env };

function withEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

/**
 * Fresh module graph so `sessionId` (assigned at module load) is re-rolled —
 * simulates a cold start. The KV backend is swapped to an in-memory one on
 * the FRESH `kv` module instance (resetModules also reloads it), and the
 * `fetch` mock is installed only AFTER every module is loaded — requiring
 * `analytics.ts` pulls in `expo-sqlite` transitively, which can reinstall
 * React Native's own fetch polyfill and silently undo an earlier mock.
 */
let kvBackend: ReturnType<KvModule['createMemoryKvBackend']> | null = null;

/** `keepDeviceStore`: the next cold start of the same phone (the KV survives). */
function loadAnalytics(fetchMock: FetchMock, { keepDeviceStore = false } = {}): Loaded {
  jest.resetModules();
  // Dynamic reload after resetModules() needs require(), not a static
  // top-level import — the same pattern used elsewhere in this test suite
  // (e.g. tests/unit/gym-today.test.tsx).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const kv = require('../../src/features/gym/offline/kv') as KvModule;
  if (!keepDeviceStore || kvBackend === null) kvBackend = kv.createMemoryKvBackend();
  kv.setKvBackendForTests(kvBackend);

  const analytics = require('../../src/lib/analytics') as AnalyticsModule;
  const transport = require('../../src/lib/analytics-transport') as TransportModule;
  /* eslint-enable @typescript-eslint/no-require-imports */

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { ...analytics, ...transport };
}

interface SentEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
}
interface SentBatch {
  batch: SentEvent[];
}

function eventsSent(fetchMock: FetchMock): SentEvent[] {
  return fetchMock.mock.calls
    .map((call) => JSON.parse(call[1].body as string) as SentBatch)
    .flatMap((body) => body.batch);
}

function distinctIdsSent(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls
    .map((call) => JSON.parse(call[1].body as string) as SentBatch)
    .flatMap((body) => body.batch)
    .map((e) => e.distinct_id);
}

describe('mobile analytics (T-12.2)', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    (globalThis as { __mockUuidCounter?: number }).__mockUuidCounter = 0;
    withEnv({
      EXPO_PUBLIC_POSTHOG_KEY: 'test-key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    });
    fetchMock = jest.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true } as Response),
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to anonymous on, linked off, with no account id', () => {
    const analytics = loadAnalytics(fetchMock);
    expect(analytics.getAnalyticsConsent()).toEqual({ anonymous: true, linked: false });
  });

  it('AC1: the anonymous session id changes on every cold start', () => {
    const first = loadAnalytics(fetchMock);
    const second = loadAnalytics(fetchMock); // a fresh module graph = a new cold start

    expect(first.getSessionIdForTests()).toBeTruthy();
    expect(second.getSessionIdForTests()).toBeTruthy();
    expect(first.getSessionIdForTests()).not.toBe(second.getSessionIdForTests());
  });

  it('AC1: an unlinked event carries the session id, never an account id', async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setCurrentUserId('user-1'); // signed in, but not linked
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    const [distinctId] = distinctIdsSent(fetchMock);
    expect(distinctId).toBe(analytics.getSessionIdForTests());
    expect(distinctId).not.toBe('user-1');
  });

  it('AC2: linking to the account changes the distinct_id on the very next event', async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setCurrentUserId('user-1');
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    analytics.setAnalyticsConsent({ linked: true });
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    const [beforeLink, afterLink] = distinctIdsSent(fetchMock);
    expect(beforeLink).not.toBe('user-1');
    expect(afterLink).toBe('user-1');
  });

  it('AC3: turning anonymous counting off means fetch is never called', async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setAnalyticsConsent({ anonymous: false });
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turning anonymous off also turns linking off', () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setAnalyticsConsent({ linked: true });
    expect(analytics.getAnalyticsConsent().linked).toBe(true);

    analytics.setAnalyticsConsent({ anonymous: false });
    expect(analytics.getAnalyticsConsent()).toEqual({ anonymous: false, linked: false });
  });

  it('sign-out resets "linked" to off', () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setCurrentUserId('user-1');
    analytics.setAnalyticsConsent({ linked: true });

    analytics.resetAnalyticsOnSignOut();

    expect(analytics.getAnalyticsConsent().linked).toBe(false);
  });

  // ─── Account linking (market review 2026-10, lane B) ─────────────────────
  // SessionUserHost calls setCurrentUserId on sign-in (user.me resolved),
  // sign-out (null) and account switch (another id).

  it('linking switches the distinct id to the account, and sign-out switches it back', async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setAnalyticsConsent({ linked: true });
    analytics.track('app_opened', { from: 'launch' }); // user.me not resolved yet
    analytics.setCurrentUserId('user-1'); // user.me resolved
    analytics.track('app_opened', { from: 'resume' });
    analytics.setCurrentUserId(null); // signed out
    analytics.track('app_opened', { from: 'resume' });
    await analytics.flush();

    expect(distinctIdsSent(fetchMock)).toEqual([
      analytics.getSessionIdForTests(),
      'user-1',
      analytics.getSessionIdForTests(),
    ]);
  });

  it('a linked event makes a PostHog person; an unlinked one never does', async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setCurrentUserId('user-1');
    analytics.track('app_opened', { from: 'launch' });
    analytics.setAnalyticsConsent({ linked: true });
    analytics.track('app_opened', { from: 'resume' });
    await analytics.flush();

    expect(eventsSent(fetchMock).map((e) => e.properties)).toEqual([
      { from: 'launch', $process_person_profile: false },
      { from: 'resume', $process_person_profile: true },
    ]);
  });

  it("switching accounts turns linking off: account B never inherits account A's choice", async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.setCurrentUserId('user-a');
    analytics.setAnalyticsConsent({ linked: true });
    analytics.setCurrentUserId('user-b');
    analytics.track('app_opened', { from: 'resume' });
    await analytics.flush();

    expect(analytics.getAnalyticsConsent()).toEqual({ anonymous: true, linked: false });
    expect(distinctIdsSent(fetchMock)).toEqual([analytics.getSessionIdForTests()]);
  });

  it('a cold start with linking on links as soon as the account is known again', async () => {
    const first = loadAnalytics(fetchMock);
    first.setAnalyticsConsent({ linked: true }); // persisted on the device
    const analytics = loadAnalytics(fetchMock, { keepDeviceStore: true }); // next launch, same KV
    analytics.setCurrentUserId('user-1');
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    expect(distinctIdsSent(fetchMock)).toEqual(['user-1']);
  });

  it('posts the batch to the EU endpoint with the project key', async () => {
    const analytics = loadAnalytics(fetchMock);
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://eu.i.posthog.com/batch/');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toMatchObject({ api_key: 'test-key' });
  });

  it('a trailing slash on the host still posts to /batch/', async () => {
    withEnv({
      EXPO_PUBLIC_POSTHOG_KEY: 'test-key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com/',
    });
    const analytics = loadAnalytics(fetchMock);
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://eu.i.posthog.com/batch/');
  });

  it.each([
    ['a non-EU host', 'https://us.i.posthog.com'],
    ['plain http', 'http://eu.i.posthog.com'],
    ['an empty value', ''],
    ['a malformed value', 'eu.i.posthog.com'],
  ])('%s turns analytics off instead of crashing the app at startup', async (_name, host) => {
    withEnv({ EXPO_PUBLIC_POSTHOG_KEY: 'test-key', EXPO_PUBLIC_POSTHOG_HOST: host });
    const analytics = loadAnalytics(fetchMock);

    expect(analytics.isTransportEnabled()).toBe(false);
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a key without a host (or a host without a key) sends nothing', async () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_KEY: 'test-key', EXPO_PUBLIC_POSTHOG_HOST: undefined });
    const keyOnly = loadAnalytics(fetchMock);
    keyOnly.track('app_opened', { from: 'launch' });
    await keyOnly.flush();

    withEnv({
      EXPO_PUBLIC_POSTHOG_KEY: undefined,
      EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    });
    const hostOnly = loadAnalytics(fetchMock);
    hostOnly.track('app_opened', { from: 'launch' });
    await hostOnly.flush();

    expect(keyOnly.isTransportEnabled()).toBe(false);
    expect(hostOnly.isTransportEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no key configured = the transport is disabled and never queues or fetches', async () => {
    withEnv({ EXPO_PUBLIC_POSTHOG_KEY: undefined, EXPO_PUBLIC_POSTHOG_HOST: undefined });
    const analytics = loadAnalytics(fetchMock);

    expect(analytics.isTransportEnabled()).toBe(false);
    analytics.track('app_opened', { from: 'launch' });
    await analytics.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
