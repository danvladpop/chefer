import { screen, waitFor } from '@testing-library/react-native';
import { getQueryKey } from '@trpc/react-query';
import MoreScreen from '../../app/(food)/more';
import {
  FRIENDS_QUERY_KEY_PREFIX,
  FRIENDS_QUERY_PROCEDURES,
  friendsProcedureOf,
  friendsQueryKey,
  isFriendsQueryKey,
} from '../../src/features/friends/api/query-keys';
import {
  isGymQueryKey,
  shouldPersistQuery,
} from '../../src/features/gym/offline/query-persistence';
import { trpc } from '../../src/lib/trpc';
import { availableHandlers, renderWithTrpc } from './friends-core-harness';

// INV-7 (implementation-plan §1, §15): other people's data is never persisted.
// `query-persistence.ts` writes every query whose key starts with `gym` to
// disk for 30 days, so no friends key may ever match `isGymQueryKey`.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: () => undefined,
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/lib/auth-store', () => ({ clearToken: jest.fn() }));
jest.mock('../../src/features/feedback/feedback-card', () => ({ FeedbackCard: () => null }));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));

type AnyProcedure = Parameters<typeof getQueryKey>[0];

describe('INV-7: friend data lives under friends.*, never gym.*', () => {
  it.each(FRIENDS_QUERY_PROCEDURES)('friends.%s keys are friends keys, never gym keys', (proc) => {
    const raw = friendsQueryKey(proc);
    const procedure = (trpc.friends as unknown as Record<string, AnyProcedure | undefined>)[proc];
    if (!procedure) throw new Error(`friends.${proc} is not on the router`);
    const real = getQueryKey(procedure);
    for (const key of [raw, real]) {
      expect(isFriendsQueryKey(key)).toBe(true);
      expect(isGymQueryKey(key)).toBe(false);
      expect(friendsProcedureOf(key)).toBe(proc);
    }
    // The tRPC key this app really builds is the one the walker matches.
    expect(real[0]).toEqual(['friends', proc]);
  });

  it('the namespace prefix is not a gym prefix', () => {
    expect(isGymQueryKey(FRIENDS_QUERY_KEY_PREFIX)).toBe(false);
  });

  it('nothing a mounted entry point caches is persisted', async () => {
    const r = await renderWithTrpc(<MoreScreen />, availableHandlers());
    await waitFor(() => expect(screen.getByTestId('more-friends')).toBeTruthy());
    const queries = r.queryClient.getQueryCache().getAll();
    const friendQueries = queries.filter((q) => isFriendsQueryKey(q.queryKey));
    expect(friendQueries.map((q) => friendsProcedureOf(q.queryKey)).sort()).toEqual([
      'availability',
      'me',
    ]);
    for (const q of friendQueries) {
      expect(isGymQueryKey(q.queryKey)).toBe(false);
      expect(shouldPersistQuery(q)).toBe(false);
    }
  });
});
