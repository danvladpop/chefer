import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import FriendsHomeRoute from '../../app/friends/index';
import { resetRememberedSegment } from '../../src/features/friends/home/home-screen';
import { meDto, renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { homeHandlers, page, personId, settle, who } from './friends-home-fixtures';

// F2.1 · the Following home (UX §5, PRD FR-06–FR-09): the sections, their
// empty and error states, accepting from the home, the You follow | Followers
// lists with infinite scroll and the Followers `…`, the badge in the header,
// the remembered segment, offline.

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Redirect: () => null,
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const ME = meDto({
  counts: { followers: 9, following: 12, pendingRequests: 4, unreadActivity: 2, blocked: 0 },
  badgeCount: 6,
});

async function renderHome(overrides: Handlers = {}, me = ME) {
  const r = await renderWithTrpc(<FriendsHomeRoute />, homeHandlers(overrides, me));
  await settle();
  return r;
}

const REQUESTERS = [1, 2, 3, 4].map((n) => who(n, { requestedYou: true }));

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  resetRememberedSegment();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('layout and content', () => {
  it('shows the skeleton while the first load is pending', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await renderWithTrpc(
      <FriendsHomeRoute />,
      homeHandlers({ 'friends.me': async () => (await gate, ME) }),
    );
    await settle(2);
    expect(screen.getByTestId('friends-home-loading')).toBeTruthy();
    release?.();
    await settle();
    expect(screen.getByTestId('friends-home')).toBeTruthy();
  });

  it('shows the header with the unread count, the search field and the sections', async () => {
    await renderHome({
      'friends.requests': () => page(REQUESTERS, { total: 4 }),
      'friends.following': () =>
        page(
          [who(5, { relation: 'following', followsYou: true }), who(6, { relation: 'requested' })],
          {
            total: 12,
          },
        ),
      'friends.suggestions': () => [
        { ...who(0, { relation: 'none' }), reason: 'popular', mutualCount: 0 },
      ],
    });

    expect(screen.getByTestId('friends-header-title')).toHaveTextContent('Following');
    expect(
      screen.getByTestId('friends-header-activity-count', { includeHiddenElements: true }),
    ).toHaveTextContent('6');
    expect(screen.getByLabelText(FRIENDS_COPY.home.activityLabel(6))).toBeTruthy();
    const search = screen.getByTestId('friends-search');
    expect(search.props.accessibilityLabel).toBe('Search people by name');
    expect(search.props.placeholder).toBe('Search by name');

    // Requests: 4 pending, 3 previewed + See all.
    expect(screen.getByText('Requests · 4')).toBeTruthy();
    expect(screen.getByTestId(`friends-request-${personId(1)}`)).toBeTruthy();
    expect(screen.getByTestId(`friends-request-${personId(3)}`)).toBeTruthy();
    expect(screen.queryByTestId(`friends-request-${personId(4)}`)).toBeNull();
    expect(screen.getByText('See all 4')).toBeTruthy();

    // You follow | Followers with the counts.
    expect(screen.getByRole('tab', { name: 'You follow 12' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Followers 9' })).toBeTruthy();
    expect(screen.getByTestId(`friends-following-${personId(5)}`)).toBeTruthy();
    expect(screen.getByText('Follows you')).toBeTruthy();

    // Suggested for you + See all.
    expect(screen.getByText('Suggested for you')).toBeTruthy();
    expect(screen.getByText('Popular on Chefer')).toBeTruthy();
    expect(screen.getByLabelText('Hide suggestion Andrei Ionescu')).toBeTruthy();
  });

  it('opens Activity, Settings, requests and suggestions from their controls', async () => {
    await renderHome({
      'friends.requests': () => page(REQUESTERS, { total: 4 }),
      'friends.suggestions': () => [{ ...who(0), reason: 'follows_you', mutualCount: 0 }],
    });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-header-activity'));
    expect(router.push).toHaveBeenCalledWith('/friends/activity');
    await user.press(screen.getByTestId('friends-header-settings'));
    expect(router.push).toHaveBeenCalledWith('/friends/settings');
    await user.press(screen.getByTestId('friends-requests-see-all'));
    expect(router.push).toHaveBeenCalledWith('/friends/requests');
    await user.press(screen.getByTestId('friends-suggestions-see-all'));
    expect(router.push).toHaveBeenCalledWith('/friends/suggestions');
  });

  it('renders no Requests section when there are none', async () => {
    await renderHome();
    expect(screen.queryByText(/^Requests/)).toBeNull();
    expect(screen.queryByTestId('friends-requests-section-error')).toBeNull();
  });

  it('has no email field or email copy anywhere on the home', async () => {
    await renderHome({ 'friends.requests': () => page(REQUESTERS, { total: 4 }) });
    expect(screen.queryByLabelText(/e-?mail/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/e-?mail/i)).toBeNull();
    expect(screen.queryByText(/e-?mail/i)).toBeNull();
    // The one text input is the name search.
    expect(screen.getAllByPlaceholderText(/./)).toHaveLength(1);
  });
});

describe('empty states', () => {
  it('You follow empty, then Followers empty with an Invite action; suggestions empty shows the invite card', async () => {
    await renderHome();
    expect(screen.getByText(FRIENDS_COPY.empty.youFollow.title)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.empty.youFollow.body)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.invite.card.title)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.invite.card.body)).toBeTruthy();

    await userEvent.setup().press(screen.getByTestId('friends-segment-followers'));
    await settle();
    expect(await screen.findByText(FRIENDS_COPY.empty.followers.title)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.empty.followers.body)).toBeTruthy();
    expect(screen.getByTestId('friends-empty-followers-invite')).toHaveTextContent(
      'Invite someone',
    );
  });
});

describe('section errors: a failed load never looks empty', () => {
  it('shows a compact error for requests and still renders the other sections', async () => {
    let calls = 0;
    await renderHome({
      'friends.requests': () => {
        calls += 1;
        if (calls === 1) throw trpcError('INTERNAL_SERVER_ERROR', 500);
        return page(REQUESTERS, { total: 4 });
      },
      'friends.following': () => page([who(5, { relation: 'following' })], { total: 1 }),
    });
    expect(screen.getByText('Couldn’t load your requests.')).toBeTruthy();
    expect(screen.getByTestId(`friends-following-${personId(5)}`)).toBeTruthy();
    await userEvent.setup().press(screen.getByTestId('friends-requests-section-error-retry'));
    await settle();
    expect(await screen.findByText('Requests · 4')).toBeTruthy();
  });

  it('shows the list and suggestions errors with Try again, never the empty state', async () => {
    await renderHome({
      'friends.following': () => {
        throw trpcError('INTERNAL_SERVER_ERROR', 500);
      },
      'friends.suggestions': () => {
        throw trpcError('INTERNAL_SERVER_ERROR', 500);
      },
    });
    expect(screen.getByText('Couldn’t load this list.')).toBeTruthy();
    expect(screen.getByText('Couldn’t load suggestions.')).toBeTruthy();
    expect(screen.queryByText(FRIENDS_COPY.empty.youFollow.title)).toBeNull();
    expect(screen.queryByText(FRIENDS_COPY.invite.card.title)).toBeNull();
    expect(screen.getAllByText('Try again')).toHaveLength(2);
  });

  it('switches to the unavailable screen when a query says Following was switched off', async () => {
    await renderHome({
      'friends.following': () => {
        throw trpcError('FORBIDDEN', 403, { friendsUnavailable: true });
      },
    });
    expect(await screen.findByText(FRIENDS_COPY.unavailable)).toBeTruthy();
  });
});

describe('accepting from the home', () => {
  it('accept removes the row at once, calls acceptRequest and shows the snackbar with Follow back', async () => {
    const accept = jest.fn(() => ({ ok: true }));
    await renderHome(
      {
        'friends.requests': () => page(REQUESTERS.slice(0, 2), { total: 2 }),
        'friends.acceptRequest': accept,
      },
      meDto({ counts: { ...ME.counts, pendingRequests: 2 }, badgeCount: 4 }),
    );
    expect(screen.getByText('Requests · 2')).toBeTruthy();
    await userEvent.setup().press(screen.getByTestId(`friends-request-${personId(1)}-accept`));
    await waitFor(() => expect(accept).toHaveBeenCalledWith({ userId: personId(1) }));
    expect(screen.queryByTestId(`friends-request-${personId(1)}`)).toBeNull();
    expect(screen.getByTestId(`friends-request-${personId(2)}`)).toBeTruthy();
    expect(await screen.findByText('Elena can now see your meals and workouts.')).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.accepted.action)).toBeTruthy();
  });

  it('decline removes the row and calls declineRequest', async () => {
    const decline = jest.fn(() => ({ ok: true }));
    await renderHome({
      'friends.requests': () => page(REQUESTERS.slice(0, 1), { total: 1 }),
      'friends.declineRequest': decline,
    });
    await userEvent.setup().press(screen.getByTestId(`friends-request-${personId(1)}-decline`));
    await waitFor(() => expect(decline).toHaveBeenCalledWith({ userId: personId(1) }));
    expect(screen.queryByTestId(`friends-request-${personId(1)}`)).toBeNull();
  });
});

describe('You follow | Followers lists', () => {
  it('remembers the segment for the session', async () => {
    const { unmount } = await renderHome({
      'friends.followers': () => page([who(5, { relation: 'following' })], { total: 1 }),
    });
    await userEvent.setup().press(screen.getByTestId('friends-segment-followers'));
    expect(await screen.findByTestId(`friends-followers-${personId(5)}`)).toBeTruthy();
    await unmount();
    await renderHome({
      'friends.followers': () => page([who(5, { relation: 'following' })], { total: 1 }),
    });
    expect(screen.getByTestId('friends-segment-followers').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(await screen.findByTestId(`friends-followers-${personId(5)}`)).toBeTruthy();
  });

  it('loads the next page of 20 at the end of the list (infinite scroll)', async () => {
    const following = jest.fn((input: unknown) => {
      const { cursor } = input as { cursor?: string; limit: number };
      return cursor
        ? page([who(6, { relation: 'following' })], { total: 2 })
        : page([who(5, { relation: 'following' })], { total: 2 }, 'cursor-2');
    });
    const r = await renderHome({ 'friends.following': following });
    expect(following).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(screen.queryByTestId(`friends-following-${personId(6)}`)).toBeNull();
    await fireEvent(screen.getByTestId('friends-home-list'), 'endReached');
    await settle();
    expect(await screen.findByTestId(`friends-following-${personId(6)}`)).toBeTruthy();
    expect(following).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', limit: 20 }),
    );
    expect(r.paths().filter((p) => p === 'friends.following')).toHaveLength(2);
  });

  it('a Followers row has `…` with Remove and Block; Remove confirms, calls removeFollower and exits the row', async () => {
    const removeFollower = jest.fn(() => ({ ok: true }));
    await renderHome({
      'friends.followers': () =>
        page([who(5, { relation: 'none', followsYou: true }), who(6, { relation: 'none' })], {
          total: 2,
        }),
      'friends.removeFollower': removeFollower,
    });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-segment-followers'));
    const more = await screen.findByTestId(`friends-followers-${personId(5)}-more`);
    expect(more.props.accessibilityLabel).toBe('More options for Victor Dumitru');
    await user.press(more);
    expect(await screen.findByTestId('friends-follower-menu-remove')).toBeTruthy();
    expect(screen.getByTestId('friends-follower-menu-block')).toBeTruthy();
    await user.press(screen.getByTestId('friends-follower-menu-remove'));
    expect(await screen.findByText('Remove Victor as a follower?')).toBeTruthy();
    expect(removeFollower).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('friends-remove-confirm-confirm'));
    await waitFor(() => expect(removeFollower).toHaveBeenCalledWith({ userId: personId(5) }));
    await waitFor(() =>
      expect(screen.queryByTestId(`friends-followers-${personId(5)}`)).toBeNull(),
    );
    expect(screen.getByTestId(`friends-followers-${personId(6)}`)).toBeTruthy();
  });

  it('Block from the Followers `…` confirms, then calls block', async () => {
    const block = jest.fn(() => ({ ok: true }));
    await renderHome({
      'friends.followers': () => page([who(5, { followsYou: true })], { total: 1 }),
      'friends.block': block,
    });
    const user = userEvent.setup();
    await user.press(screen.getByTestId('friends-segment-followers'));
    await user.press(await screen.findByTestId(`friends-followers-${personId(5)}-more`));
    await user.press(await screen.findByTestId('friends-follower-menu-block'));
    expect(await screen.findByText('Block Victor?')).toBeTruthy();
    await user.press(screen.getByTestId('friends-block-confirm-confirm'));
    await waitFor(() => expect(block).toHaveBeenCalledWith({ userId: personId(5) }));
  });

  it('a following row stays in place after Follow back changes its state', async () => {
    const follow = jest.fn(() => ({ relation: 'requested' }));
    await renderHome({
      'friends.following': () =>
        page([who(5, { relation: 'none', followsYou: true })], { total: 1 }),
      'friends.follow': follow,
    });
    const row = screen.getByTestId(`friends-following-${personId(5)}`);
    await userEvent
      .setup()
      .press(within(row).getByTestId(`friends-following-${personId(5)}-relation`));
    await waitFor(() => expect(follow).toHaveBeenCalledWith({ userId: personId(5) }));
    expect(screen.getByTestId(`friends-following-${personId(5)}`)).toBeTruthy();
    expect(screen.getByTestId(`friends-following-${personId(5)}-relation`)).toHaveTextContent(
      'Requested',
    );
  });
});

describe('pull to refresh and offline', () => {
  it('pull to refresh refetches me, requests, the list and suggestions', async () => {
    const r = await renderHome();
    const before = r.paths().length;
    const { refreshControl } = screen.getByTestId('friends-home-list').props as {
      refreshControl: { props: { onRefresh: () => void } };
    };
    await act(() => {
      refreshControl.props.onRefresh();
    });
    await settle();
    const after = r.paths().slice(before);
    expect(after).toEqual(
      expect.arrayContaining([
        'friends.me',
        'friends.requests',
        'friends.following',
        'friends.suggestions',
      ]),
    );
  });

  it('offline: the muted line, the search field disabled with its own placeholder', async () => {
    await renderHome();
    await act(() => {
      onlineManager.setOnline(false);
    });
    expect(screen.getByTestId('friends-offline-line').props.children).toMatch(
      /^Offline · showing what was saved \d\d:\d\d$/,
    );
    const search = screen.getByTestId('friends-search');
    expect(search.props.editable).toBe(false);
    expect(search.props.placeholder).toBe('Search needs a connection');
  });
});
