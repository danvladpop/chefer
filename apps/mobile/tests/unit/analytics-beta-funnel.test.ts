// ─── WP-13 beta funnel events (UX-PO-02) ────────────────────────────────────
// Runs the REAL analytics module + transport + the call-site helpers against a
// mocked global `fetch` (same harness as analytics.test.ts): every funnel event
// carries the right properties, nothing is sent without consent, and nothing
// is sent without a PostHog key. A source scan then proves every event has a
// call site (or, for `class_checked_in`, deliberately none until WP-05).
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'session-test' }));

type AnalyticsModule = typeof import('../../src/lib/analytics');
type TransportModule = typeof import('../../src/lib/analytics-transport');
type EventsModule = typeof import('../../src/lib/analytics-events');
type KvModule = typeof import('../../src/features/gym/offline/kv');
type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;
type Loaded = AnalyticsModule & TransportModule & EventsModule;

const ORIGINAL_ENV = { ...process.env };

function load(fetchMock: FetchMock): Loaded {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const kv = require('../../src/features/gym/offline/kv') as KvModule;
  kv.setKvBackendForTests(kv.createMemoryKvBackend());
  const analytics = require('../../src/lib/analytics') as AnalyticsModule;
  const transport = require('../../src/lib/analytics-transport') as TransportModule;
  const events = require('../../src/lib/analytics-events') as EventsModule;
  /* eslint-enable @typescript-eslint/no-require-imports */
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { ...analytics, ...transport, ...events };
}

interface Sent {
  event: string;
  properties: Record<string, unknown>;
}

function sent(fetchMock: FetchMock): Sent[] {
  return fetchMock.mock.calls
    .map((call) => JSON.parse(call[1].body as string) as { batch: Sent[] })
    .flatMap((body) => body.batch);
}

describe('WP-13 beta funnel events', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_POSTHOG_KEY: 'test-key',
      EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
    };
    fetchMock = jest.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true } as Response),
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  /** Fires every funnel event once, the way the call sites do. */
  function fireAll(a: Loaded) {
    a.track('signup_completed', {});
    a.trackOnboardingCompleted(['PLAN_MEALS', 'TRAIN'], ['run', 'run', 'swim']);
    a.trackPlanGenerated({ days: [{ meals: [{}, {}, {}] }, { meals: [{}, {}] }] }, 2);
    a.trackMealLogged('planned', 'dinner');
    a.trackMealLogged('replaced', 'breakfast');
    a.trackMealLogged('quick', 'snack');
    a.trackMealLogged('snap', 'lunch');
    a.track('list_opened', { itemCount: 12 });
    a.track('list_shared', { scope: 'whatsLeft' });
    a.track('cook_finished', {});
    a.track('workout_finished', { durationMin: 41, sets: 18, kind: 'planned' });
  }

  it('sends each funnel event with the right properties when consent is on', async () => {
    const a = load(fetchMock);
    fireAll(a);
    await a.flush();

    expect(sent(fetchMock).map((e) => [e.event, e.properties])).toEqual([
      ['signup_completed', {}],
      [
        'onboarding_completed',
        { jobs: ['PLAN_MEALS', 'TRAIN'], trainingStyles: ['run', 'run', 'swim'] },
      ],
      ['plan_generated', { slotsCount: 5, keptPicks: 2 }],
      ['meal_logged', { source: 'planned', mealType: 'dinner' }],
      ['meal_logged', { source: 'replaced', mealType: 'breakfast' }],
      ['meal_logged', { source: 'quick', mealType: 'snack' }],
      ['meal_logged', { source: 'snap', mealType: 'lunch' }],
      ['list_opened', { itemCount: 12 }],
      ['list_shared', { scope: 'whatsLeft' }],
      ['cook_finished', {}],
      ['workout_finished', { durationMin: 41, sets: 18, kind: 'planned' }],
    ]);
  });

  it('omits unknown props: no trainingStyles without any, no mealType for an unknown slot', async () => {
    const a = load(fetchMock);
    a.trackOnboardingCompleted(['PLAN_MEALS'], []);
    a.trackMealLogged('quick', 'brunch');
    a.trackMealLogged('quick', undefined);
    await a.flush();

    expect(sent(fetchMock).map((e) => e.properties)).toEqual([
      { jobs: ['PLAN_MEALS'] },
      { source: 'quick' },
      { source: 'quick' },
    ]);
  });

  it('sends nothing at all when "Send anonymous usage counts" is off', async () => {
    const a = load(fetchMock);
    a.setAnalyticsConsent({ anonymous: false });
    fireAll(a);
    await a.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('events queued before an opt-out never leave the device', async () => {
    const a = load(fetchMock);
    fireAll(a);
    a.setAnalyticsConsent({ anonymous: false });
    await a.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing without a PostHog key', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_POSTHOG_KEY: undefined,
      EXPO_PUBLIC_POSTHOG_HOST: undefined,
    };
    const a = load(fetchMock);
    expect(a.isTransportEnabled()).toBe(false);
    fireAll(a);
    await a.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WP-13 call sites', () => {
  const root = join(__dirname, '..', '..');
  const read = (path: string): string => readFileSync(join(root, path), 'utf8');

  it.each([
    ['signup_completed', 'app/(auth)/register.tsx', "track('signup_completed'"],
    [
      'onboarding_completed',
      'src/features/onboarding/onboarding-wizard.tsx',
      'trackOnboardingCompleted(',
    ],
    ['plan_generated (plan)', 'app/(food)/meal-plan.tsx', 'trackPlanGenerated('],
    [
      'plan_generated (onboarding)',
      'src/features/onboarding/onboarding-wizard.tsx',
      'trackPlanGenerated(',
    ],
    ['plan_generated (premium)', 'src/features/premium/premium-host.tsx', 'trackPlanGenerated('],
    [
      'meal_logged planned (tracker)',
      'src/features/tracker/use-tracker-writes.ts',
      "trackMealLogged('planned'",
    ],
    [
      'meal_logged planned (hero)',
      'src/features/dashboard/components/hero-meal-card.tsx',
      "trackMealLogged('planned'",
    ],
    [
      'meal_logged planned (tonight)',
      'src/features/dashboard/components/tonight-card.tsx',
      "trackMealLogged('planned'",
    ],
    ['meal_logged snap', 'src/features/tracker/scan-meal-card.tsx', "trackMealLogged('snap'"],
    ['meal_logged quick/replaced', 'src/features/tracker/quick-add-sheet.tsx', 'quickAddSource('],
    ['meal_logged (cook)', 'app/cook/[id].tsx', 'trackMealLogged('],
    ['list_opened', 'app/(food)/shopping-list.tsx', "track('list_opened'"],
    ['list_shared', 'src/features/shopping-list/share-list-sheet.tsx', "track('list_shared'"],
    ['cook_finished', 'app/cook/[id].tsx', "track('cook_finished'"],
    [
      'workout_finished',
      'src/features/gym/workout/workout-screen.tsx',
      "captureGymEvent('workout_finished'",
    ],
  ])('%s is wired', (_name, file, needle) => {
    expect(read(file)).toContain(needle);
  });
});
