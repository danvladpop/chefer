import {
  isGymQueryKey,
  shouldPersistQuery,
} from '../../src/features/gym/offline/query-persistence';

// WP-18 lane C (spec §11): `trainer.*` and `coaching.*` queries are not `gym.*`, so a client's data never
// lands in a trainer's persisted (offline) cache. Namespacing them under `gym` would break this.

const successful = (queryKey: unknown[]) => ({ queryKey, state: { status: 'success' } });

describe('trainer data is never persisted on the device', () => {
  it.each([
    ['trainer', 'clients', 'list'],
    ['trainer', 'client', 'routine'],
    ['trainer', 'client', 'workouts'],
    ['trainer', 'client', 'note'],
    ['coaching', 'status'],
  ])('%s queries are neither gym keys nor dehydrated', (...path) => {
    const key = [path, { input: { clientId: 'x' }, type: 'query' }];
    expect(isGymQueryKey(key)).toBe(false);
    expect(shouldPersistQuery(successful(key))).toBe(false);
  });

  it('the gym read model still persists (control)', () => {
    expect(shouldPersistQuery(successful([['gym', 'bootstrap'], { type: 'query' }]))).toBe(true);
  });
});
