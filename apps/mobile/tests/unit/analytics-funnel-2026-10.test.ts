// ─── Funnel coverage for PostHog on mobile (market review 2026-10, lane B) ─────
// The events the owner's funnel needs and the 2026-10-22 audit found missing:
// how an off-plan meal was entered (`meal_logged.method`), a shopping tick,
// a saved recipe import, coaching joins and requests, and `app_opened` on
// launch AND on a foreground return, which D1/D7/D30 retention depends on.
// It runs the REAL analytics module and transport against a mocked `fetch`
// (the same harness as analytics-beta-funnel.test.ts). A source scan then
// proves each event has its call site.
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'session-test' }));

type AnalyticsModule = typeof import('../../src/lib/analytics');
type TransportModule = typeof import('../../src/lib/analytics-transport');
type EventsModule = typeof import('../../src/lib/analytics-events');
type OpensModule = typeof import('../../src/lib/app-open-tracking');
type KvModule = typeof import('../../src/features/gym/offline/kv');
type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit]>;
type Loaded = AnalyticsModule & TransportModule & EventsModule & OpensModule;

const ORIGINAL_ENV = { ...process.env };

function load(fetchMock: FetchMock): Loaded {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const kv = require('../../src/features/gym/offline/kv') as KvModule;
  kv.setKvBackendForTests(kv.createMemoryKvBackend());
  const analytics = require('../../src/lib/analytics') as AnalyticsModule;
  const transport = require('../../src/lib/analytics-transport') as TransportModule;
  const events = require('../../src/lib/analytics-events') as EventsModule;
  const opens = require('../../src/lib/app-open-tracking') as OpensModule;
  /* eslint-enable @typescript-eslint/no-require-imports */
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { ...analytics, ...transport, ...events, ...opens };
}

interface Sent {
  event: string;
  properties: Record<string, unknown>;
}

function sent(fetchMock: FetchMock): [string, Record<string, unknown>][] {
  return fetchMock.mock.calls
    .map((call) => JSON.parse(call[1].body as string) as { batch: Sent[] })
    .flatMap((body) => body.batch)
    .map(({ event, properties: { $process_person_profile: _flag, ...properties } }) => [
      event,
      properties,
    ]);
}

const MINUTE = 60_000;

describe('funnel events (market review 2026-10)', () => {
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

  it('meal_logged carries how an off-plan meal was entered; a planned tick has no method', async () => {
    const a = load(fetchMock);
    a.trackMealLogged('planned', 'dinner');
    a.trackMealLogged('replaced', 'lunch', 'search');
    a.trackMealLogged('quick', 'snack', 'quick_add');
    a.trackMealLogged('quick', 'breakfast', 'recent');
    a.trackMealLogged('snap', 'lunch', 'photo');
    a.trackMealLogged('quick', 'brunch', 'cook');
    await a.flush();

    expect(sent(fetchMock)).toEqual([
      ['meal_logged', { source: 'planned', mealType: 'dinner' }],
      ['meal_logged', { source: 'replaced', mealType: 'lunch', method: 'search' }],
      ['meal_logged', { source: 'quick', mealType: 'snack', method: 'quick_add' }],
      ['meal_logged', { source: 'quick', mealType: 'breakfast', method: 'recent' }],
      ['meal_logged', { source: 'snap', mealType: 'lunch', method: 'photo' }],
      ['meal_logged', { source: 'quick', method: 'cook' }],
    ]);
  });

  it('a shopping tick counts the items ticked; un-ticking sends nothing', async () => {
    const a = load(fetchMock);
    a.trackListToggled({ keys: ['milk'], checked: true });
    a.trackListToggled({ keys: ['a', 'b', 'c'], checked: true });
    a.trackListToggled({ keys: ['milk'], checked: false });
    a.trackListToggled({ keys: [], checked: true });
    await a.flush();

    expect(sent(fetchMock)).toEqual([
      ['list_item_checked', { items: 1 }],
      ['list_item_checked', { items: 3 }],
    ]);
  });

  describe('app_opened (retention)', () => {
    it('the launch open fires once per cold start, however often it is asked', async () => {
      const a = load(fetchMock);
      a.trackLaunchOpen();
      a.trackLaunchOpen();
      await a.flush();

      expect(sent(fetchMock)).toEqual([['app_opened', { from: 'launch' }]]);
    });

    it('a return after 30+ minutes in the background is a resume open', async () => {
      const a = load(fetchMock);
      a.trackLaunchOpen();
      a.noteAppStateForOpens('background', 0);
      a.noteAppStateForOpens('active', 30 * MINUTE);
      await a.flush();

      expect(sent(fetchMock)).toEqual([
        ['app_opened', { from: 'launch' }],
        ['app_opened', { from: 'resume' }],
      ]);
    });

    it('a quick switch away and back, or an iOS "inactive" blip, is not a new open', async () => {
      const a = load(fetchMock);
      a.trackLaunchOpen();
      a.noteAppStateForOpens('background', 0);
      a.noteAppStateForOpens('active', 29 * MINUTE);
      a.noteAppStateForOpens('inactive', 30 * MINUTE);
      a.noteAppStateForOpens('active', 120 * MINUTE);
      await a.flush();

      expect(sent(fetchMock)).toEqual([['app_opened', { from: 'launch' }]]);
    });

    it('the away time counts from the first background, not a later one', async () => {
      const a = load(fetchMock);
      a.trackLaunchOpen();
      a.noteAppStateForOpens('background', 0);
      a.noteAppStateForOpens('background', 20 * MINUTE);
      a.noteAppStateForOpens('active', 31 * MINUTE);
      await a.flush();

      expect(sent(fetchMock).map(([, p]) => p)).toEqual([{ from: 'launch' }, { from: 'resume' }]);
    });

    it('no resume open before the launch open has gone out', async () => {
      const a = load(fetchMock);
      a.noteAppStateForOpens('background', 0);
      a.noteAppStateForOpens('active', 60 * MINUTE);
      await a.flush();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('nothing is sent without a PostHog key', async () => {
    process.env = { ...ORIGINAL_ENV, EXPO_PUBLIC_POSTHOG_KEY: undefined };
    const a = load(fetchMock);
    a.trackLaunchOpen();
    a.trackMealLogged('quick', 'snack', 'search');
    a.trackListToggled({ keys: ['milk'], checked: true });
    a.track('recipe_imported', { via: 'link' });
    await a.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('funnel call sites (market review 2026-10)', () => {
  const root = join(__dirname, '..', '..');
  const read = (path: string): string => readFileSync(join(root, path), 'utf8');

  it.each([
    ['app_opened launch', 'src/components/session-user-host.tsx', 'trackLaunchOpen()'],
    ['app_opened resume', 'src/components/session-user-host.tsx', 'noteAppStateForOpens('],
    ['method: recent (quick add)', 'src/features/tracker/quick-add-sheet.tsx', "= 'recent'"],
    ['method: search (quick add)', 'src/features/tracker/quick-add-sheet.tsx', "= 'search'"],
    ['method: quick_add (typed)', 'src/features/tracker/quick-add-sheet.tsx', "= 'quick_add'"],
    [
      'method: recent (ate else)',
      'src/features/tracker/ate-something-else.tsx',
      "method: 'recent'",
    ],
    [
      'method: quick_add (eat-out estimate)',
      'src/features/tracker/ate-something-else.tsx',
      "method: 'quick_add'",
    ],
    ['method: photo', 'src/features/tracker/scan-meal-card.tsx', "'photo')"],
    ['method: cook', 'app/cook/[id].tsx', "'cook'"],
    ['list_item_checked (shell)', 'src/features/shell/shop/shop-screen.tsx', 'trackListToggled('],
    ['list_item_checked (legacy)', 'app/(food)/shopping-list.tsx', 'trackListToggled('],
    ['recipe_imported', 'app/import-recipe.tsx', "track('recipe_imported'"],
    ['coaching_joined', 'src/features/coaching/join/join-screen.tsx', "track('coaching_joined'"],
    [
      'coaching_requested',
      'src/features/coaching/find/trainer-card-screen.tsx',
      "track('coaching_requested'",
    ],
  ])('%s is wired', (_name, file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it('app_opened is no longer fired at module load, before the account is known', () => {
    expect(read('app/_layout.tsx')).not.toContain("track('app_opened'");
  });
});
