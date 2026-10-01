import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import FriendsHomeRoute from '../../app/friends/index';
import { resetRememberedSegment } from '../../src/features/friends/home/home-screen';
import { searchBucket } from '../../src/features/friends/home/search-results';
import { meDto, renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { homeHandlers, page, personId, settle, who } from './friends-home-fixtures';

// F2.1 · search by NAME (UX §6, PRD FR-07, E3): nothing is requested below 2
// characters, results carry `Follows you` / `Followed by {name}`, no results
// says so with an Invite action, rate limits and failures are shown inline, and
// there is no email field, hint or matching anywhere.

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Redirect: () => null,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

async function renderHome(overrides: Handlers = {}) {
  const r = await renderWithTrpc(<FriendsHomeRoute />, homeHandlers(overrides, meDto()));
  await settle();
  return r;
}

/** Type into the search field and wait out the 250 ms debounce. */
async function typeQuery(text: string) {
  const field = screen.getByTestId('friends-search');
  await userEvent.setup().type(field, text);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  resetRememberedSegment();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('search by name', () => {
  it('asks nothing for 1 character: `Keep typing…`', async () => {
    const search = jest.fn(() => page([]));
    const r = await renderHome({ 'friends.search': search });
    await typeQuery('a');
    expect(await screen.findByText(FRIENDS_COPY.search.keepTyping)).toBeTruthy();
    await settle();
    expect(search).not.toHaveBeenCalled();
    expect(r.paths()).not.toContain('friends.search');
  });

  it('from 2 characters searches by name only, with the page size, and lists the results', async () => {
    const search = jest.fn(() =>
      page([who(4, { followsYou: true }), { ...who(5), mutualName: 'Andrei Ionescu' }, who(6)]),
    );
    await renderHome({ 'friends.search': search });
    await typeQuery('Ma');
    await waitFor(() => expect(search).toHaveBeenCalled());
    // Name only: the query and the page size (tRPC adds `direction`) — no email key.
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Ma', limit: 20 }));
    expect(Object.keys((search.mock.calls as unknown[][])[0]?.[0] ?? {}).sort()).toEqual([
      'direction',
      'limit',
      'query',
    ]);

    const row = await screen.findByTestId(`friends-search-result-${personId(4)}`);
    expect(row).toBeTruthy();
    expect(screen.getByText('Follows you')).toBeTruthy();
    expect(screen.getByText('Followed by Andrei Ionescu')).toBeTruthy();
    expect(screen.getByTestId(`friends-search-result-${personId(6)}`)).toBeTruthy();
    // The home sections are hidden while results show.
    expect(screen.getByTestId(`friends-search-result-${personId(5)}-relation`)).toHaveTextContent(
      'Follow',
    );
    // One analytics event per settled search: a bucket, never the text.
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('friends_search', { resultBucket: '2-5' }),
    );
    expect(JSON.stringify(track.mock.calls)).not.toContain('Ma"');
  });

  it('has no email field, hint or copy while searching', async () => {
    await renderHome({ 'friends.search': () => page([who(4)]) });
    await typeQuery('Ma');
    await screen.findByTestId(`friends-search-result-${personId(4)}`);
    expect(screen.queryByLabelText(/e-?mail/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/e-?mail/i)).toBeNull();
    expect(screen.queryByText(/e-?mail/i)).toBeNull();
    expect(screen.getAllByPlaceholderText(/./)).toHaveLength(1);
    expect(screen.getByTestId('friends-search').props.placeholder).toBe('Search by name');
  });

  it('shows the no-results state with an Invite action', async () => {
    await renderHome({ 'friends.search': () => page([]) });
    await typeQuery('zzz');
    expect(await screen.findByText('No one found for “zzz”')).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.search.noResults.body)).toBeTruthy();
    expect(screen.getByTestId('friends-search-invite')).toHaveTextContent('Invite someone');
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('friends_search', { resultBucket: '0' }),
    );
  });

  it('shows the rate-limit message inline', async () => {
    await renderHome({
      'friends.search': () => {
        throw trpcError('TOO_MANY_REQUESTS', 429, {}, FRIENDS_COPY.search.rateLimited);
      },
    });
    await typeQuery('Ma');
    expect(await screen.findByText(FRIENDS_COPY.search.rateLimited)).toBeTruthy();
  });

  it('shows a compact error with Try again for any other failure', async () => {
    let calls = 0;
    await renderHome({
      'friends.search': () => {
        calls += 1;
        if (calls === 1) throw trpcError('INTERNAL_SERVER_ERROR', 500);
        return page([who(4)]);
      },
    });
    await typeQuery('Ma');
    expect(await screen.findByText(FRIENDS_COPY.search.error)).toBeTruthy();
    await userEvent.setup().press(screen.getByTestId('friends-search-error-retry'));
    expect(await screen.findByTestId(`friends-search-result-${personId(4)}`)).toBeTruthy();
  });

  it('clearing the field restores the home sections', async () => {
    await renderHome({
      'friends.search': () => page([who(4)]),
      'friends.following': () => page([who(5, { relation: 'following' })], { total: 1 }),
    });
    await typeQuery('Ma');
    await screen.findByTestId(`friends-search-result-${personId(4)}`);
    await userEvent.setup().press(screen.getByTestId('friends-search-clear'));
    await waitFor(() =>
      expect(screen.queryByTestId(`friends-search-result-${personId(4)}`)).toBeNull(),
    );
    expect(screen.getByTestId(`friends-following-${personId(5)}`)).toBeTruthy();
    expect(screen.queryByText(FRIENDS_COPY.search.keepTyping)).toBeNull();
  });

  it('Follow in a result flips it in place', async () => {
    const follow = jest.fn(() => ({ relation: 'requested' }));
    await renderHome({
      'friends.search': () => page([who(4)]),
      'friends.follow': follow,
    });
    await typeQuery('Ma');
    const button = await screen.findByTestId(`friends-search-result-${personId(4)}-relation`);
    await userEvent.setup().press(button);
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ userId: personId(4) }));
    expect(screen.getByTestId(`friends-search-result-${personId(4)}-relation`)).toHaveTextContent(
      'Requested',
    );
  });

  it('disables the relation buttons offline', async () => {
    await renderHome({ 'friends.search': () => page([who(4)]) });
    await typeQuery('Ma');
    await screen.findByTestId(`friends-search-result-${personId(4)}`);
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(
      screen.getByTestId(`friends-search-result-${personId(4)}-relation`).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });
});

describe('searchBucket', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [2, '2-5'],
    [5, '2-5'],
    [6, '6+'],
    [40, '6+'],
  ] as const)('%i results → %s', (count, bucket) => {
    expect(searchBucket(count)).toBe(bucket);
  });
});
