import { QueryClient } from '@tanstack/react-query';
import {
  applyGymQueryDefaults,
  clearGymQueries,
  dropExpiredFoodQueries,
  FOOD_CACHE_MAX_AGE_MS,
  isOfflineFoodQueryKey,
  shouldPersistQuery,
} from '../../src/features/gym/offline/query-persistence';

// UX-SHOP-06 (audit PO-07): the Shop tab, its plan, a recipe (cook mode) and
// the user's units are written to disk with a 7-day maxAge, so a cold start in
// a supermarket basement still shows the list.

const key = (router: string, procedure: string, input: unknown = {}) => [
  [router, procedure],
  { input, type: 'query' },
];

describe('which food reads are persisted', () => {
  it.each([
    ['shoppingList', 'getForWeek'],
    ['mealPlan', 'getForWeek'],
    ['recipe', 'get'],
    ['preferences', 'get'],
  ])('%s.%s', (router, procedure) => {
    expect(isOfflineFoodQueryKey(key(router, procedure))).toBe(true);
    expect(
      shouldPersistQuery({ queryKey: key(router, procedure), state: { status: 'success' } }),
    ).toBe(true);
  });

  it('only successful reads are written', () => {
    expect(
      shouldPersistQuery({
        queryKey: key('shoppingList', 'getForWeek'),
        state: { status: 'error' },
      }),
    ).toBe(false);
  });

  it('everything else in food stays memory-only', () => {
    for (const [router, procedure] of [
      ['dashboard', 'summary'],
      ['tracker', 'getDay'],
      ['recipe', 'list'],
      ['pantry', 'list'],
      ['shoppingList', 'toggleItems'],
      ['auth', 'me'],
    ] as const) {
      expect(isOfflineFoodQueryKey(key(router, procedure))).toBe(false);
      expect(
        shouldPersistQuery({ queryKey: key(router, procedure), state: { status: 'success' } }),
      ).toBe(false);
    }
  });

  it('the gym cache is still persisted', () => {
    expect(
      shouldPersistQuery({ queryKey: key('gym', 'bootstrap'), state: { status: 'success' } }),
    ).toBe(true);
  });
});

describe('7-day maxAge for food reads on restore', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 3);
  const entry = (queryKey: unknown[], ageMs: number) => ({
    queryKey,
    queryHash: JSON.stringify(queryKey),
    state: { dataUpdatedAt: now - ageMs },
  });

  it('drops a food read older than a week and keeps a fresher one', () => {
    const restored = dropExpiredFoodQueries(
      {
        timestamp: now,
        buster: 'b',
        clientState: {
          mutations: [],
          queries: [
            entry(key('shoppingList', 'getForWeek', { weekOffset: 0 }), 6 * DAY),
            entry(key('shoppingList', 'getForWeek', { weekOffset: -1 }), 8 * DAY),
            entry(key('recipe', 'get', { id: 'r1' }), FOOD_CACHE_MAX_AGE_MS + 1),
          ],
        },
      },
      now,
    );
    expect(restored.clientState.queries.map((q) => q.queryKey)).toEqual([
      key('shoppingList', 'getForWeek', { weekOffset: 0 }),
    ]);
  });

  it('leaves gym reads to the 30-day maxAge (never drops them here)', () => {
    const restored = dropExpiredFoodQueries(
      {
        timestamp: now,
        buster: 'b',
        clientState: { mutations: [], queries: [entry(key('gym', 'bootstrap'), 20 * DAY)] },
      },
      now,
    );
    expect(restored.clientState.queries).toHaveLength(1);
  });
});

describe('cache behaviour', () => {
  it('the persisted food reads serve the cache first and are never garbage-collected early', () => {
    const client = new QueryClient();
    applyGymQueryDefaults(client);
    const defaults = client.getQueryDefaults(key('shoppingList', 'getForWeek'));
    expect(defaults.networkMode).toBe('offlineFirst');
    expect(defaults.gcTime).toBe(Number.POSITIVE_INFINITY);
    expect(client.getQueryDefaults(key('dashboard', 'summary')).networkMode).toBeUndefined();
  });

  it('sign-out / account switch clears the persisted food reads too', () => {
    const client = new QueryClient();
    client.setQueryData(key('shoppingList', 'getForWeek'), { items: [] });
    client.setQueryData(key('dashboard', 'summary'), { kcal: 1 });
    clearGymQueries(client);
    expect(client.getQueryData(key('shoppingList', 'getForWeek'))).toBeUndefined();
    expect(client.getQueryData(key('dashboard', 'summary'))).toEqual({ kcal: 1 });
  });
});
