import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import FriendsActivityRoute from '../../app/friends/activity';
import FriendsRequestsRoute from '../../app/friends/requests';
import {
  activityRows,
  activitySentenceRest,
} from '../../src/features/friends/home/activity-screen';
import { formatActivityAge } from '../../src/features/friends/home/activity-time';
import { meDto, renderWithTrpc, type Handlers } from './friends-core-harness';
import { activityItem, homeHandlers, page, personId, settle, who } from './friends-home-fixtures';

// F2.1 · requests and Activity (UX §7, PRD FR-06, FR-11, E10): the requests list
// with accept/decline and its empty state, Activity's New/Earlier sections, the
// per-kind controls, the `You accepted` / `You declined` state of answered
// requests, and mark-read on open (+ the badge refetch).

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    Redirect: ({ href }: { href: string }) => {
      (globalThis as { __redirect?: string }).__redirect = href;
      return null;
    },
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  (globalThis as { __redirect?: string }).__redirect = undefined;
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

// ─── Requests ────────────────────────────────────────────────────────────────

const REQUESTERS = [1, 2, 3].map((n) => who(n, { requestedYou: true }));

async function renderRequests(overrides: Handlers = {}) {
  const r = await renderWithTrpc(<FriendsRequestsRoute />, homeHandlers(overrides));
  await settle();
  return r;
}

describe('Follow requests', () => {
  it('lists every request with the subtitle, Accept and Decline labelled with the name', async () => {
    await renderRequests({ 'friends.requests': () => page(REQUESTERS, { total: 3 }) });
    expect(screen.getByTestId('friends-requests-header-title')).toHaveTextContent(
      'Follow requests',
    );
    expect(screen.getByText('Only you can see this list.')).toBeTruthy();
    for (const p of REQUESTERS) {
      expect(screen.getByTestId(`friends-request-${p.id}`)).toBeTruthy();
    }
    expect(screen.getByLabelText('Accept Elena Radu')).toBeTruthy();
    expect(screen.getByLabelText('Decline Elena Radu')).toBeTruthy();
  });

  it('accepting removes the row, calls acceptRequest, and the last answer fades in the empty state', async () => {
    const accept = jest.fn(() => ({ ok: true }));
    const decline = jest.fn(() => ({ ok: true }));
    await renderRequests({
      'friends.requests': () => page(REQUESTERS.slice(0, 2), { total: 2 }),
      'friends.acceptRequest': accept,
      'friends.declineRequest': decline,
    });
    const user = userEvent.setup();
    await user.press(screen.getByTestId(`friends-request-${personId(1)}-accept`));
    await waitFor(() => expect(accept).toHaveBeenCalledWith({ userId: personId(1) }));
    expect(screen.queryByTestId(`friends-request-${personId(1)}`)).toBeNull();
    expect(await screen.findByText('Elena can now see your meals and workouts.')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('friend_request_answered', {
      action: 'accept',
      via: 'requests',
    });

    await user.press(screen.getByTestId(`friends-request-${personId(2)}-decline`));
    await waitFor(() => expect(decline).toHaveBeenCalledWith({ userId: personId(2) }));
    expect(await screen.findByText(FRIENDS_COPY.requests.empty.title)).toBeTruthy();
    expect(screen.getByText(FRIENDS_COPY.requests.empty.body)).toBeTruthy();
  });

  it('shows the empty state when there are none', async () => {
    await renderRequests();
    expect(screen.getByText('No requests')).toBeTruthy();
    expect(screen.getByText('When someone asks to follow you, it shows up here.')).toBeTruthy();
  });

  it('pages 20 at a time on infinite scroll', async () => {
    const requests = jest.fn((input: unknown) => {
      const { cursor } = input as { cursor?: string };
      return cursor
        ? page([REQUESTERS[1]], { total: 2 })
        : page([REQUESTERS[0]], { total: 2 }, 'cursor-2');
    });
    await renderRequests({ 'friends.requests': requests });
    await fireEvent(screen.getByTestId('friends-requests-list'), 'endReached');
    expect(await screen.findByTestId(`friends-request-${personId(2)}`)).toBeTruthy();
    expect(requests).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', limit: 20 }),
    );
  });

  it('shows a compact error, never the empty state, when the load fails', async () => {
    await renderRequests({
      'friends.requests': () => {
        throw new Error('boom');
      },
    });
    expect(screen.getByText('Couldn’t load your requests.')).toBeTruthy();
    expect(screen.queryByText(FRIENDS_COPY.requests.empty.title)).toBeNull();
  });

  it('sends a person who has not turned Following on back to the intro', async () => {
    await renderWithTrpc(
      <FriendsRequestsRoute />,
      homeHandlers({}, meDto({ activated: false, settings: null })),
    );
    await settle();
    expect((globalThis as { __redirect?: string }).__redirect).toBe('/friends');
  });
});

// ─── Activity ────────────────────────────────────────────────────────────────

const ME_WITH_UNREAD = meDto({
  counts: { followers: 2, following: 3, pendingRequests: 1, unreadActivity: 2, blocked: 0 },
  badgeCount: 3,
});

async function renderActivity(items: ReturnType<typeof activityItem>[], overrides: Handlers = {}) {
  const r = await renderWithTrpc(
    <FriendsActivityRoute />,
    homeHandlers({ 'friends.activity': () => page(items), ...overrides }, ME_WITH_UNREAD),
  );
  await settle();
  return r;
}

describe('Activity', () => {
  const REQUEST = activityItem(1, 'FOLLOW_REQUEST');
  const NEW_FOLLOWER = activityItem(2, 'NEW_FOLLOWER', {}, { relation: 'none', followsYou: true });
  const ACCEPTED = activityItem(3, 'REQUEST_ACCEPTED', { readAt: new Date() });

  it('shows New (unread) then Earlier, one sentence per row with its relative time, and the retention line', async () => {
    await renderActivity([REQUEST, NEW_FOLLOWER, ACCEPTED]);
    expect(screen.getByTestId('friends-activity-header-title')).toHaveTextContent('Activity');
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText('wants to follow you · 1h')).toBeTruthy();
    expect(screen.getByText('started following you · 2h')).toBeTruthy();
    expect(screen.getByText('accepted your request · 3h')).toBeTruthy();
    expect(screen.getByText('Activity is kept for 90 days.')).toBeTruthy();
    // The row's accessible name is `{name}, {sentence} · {time}`.
    expect(screen.getByLabelText('Dana Moldovan, accepted your request · 3h')).toBeTruthy();
  });

  it('shows the right control per kind: Accept/Decline, a relation button, or nothing', async () => {
    await renderActivity([REQUEST, NEW_FOLLOWER, ACCEPTED]);
    expect(screen.getByTestId(`friends-activity-request-${REQUEST.actor.id}-accept`)).toBeTruthy();
    expect(screen.getByTestId(`friends-activity-request-${REQUEST.actor.id}-decline`)).toBeTruthy();
    expect(screen.getByTestId(`friends-activity-${NEW_FOLLOWER.id}-relation`)).toHaveTextContent(
      'Follow back',
    );
    expect(screen.queryByTestId(`friends-activity-${ACCEPTED.id}-relation`)).toBeNull();
    expect(screen.queryByTestId(`friends-activity-request-${ACCEPTED.actor.id}-accept`)).toBeNull();
  });

  it('renders answered requests as `You accepted` / `You declined`, muted, with no buttons', async () => {
    const accepted = activityItem(1, 'FOLLOW_REQUEST', { requestState: 'accepted' });
    const declined = activityItem(2, 'FOLLOW_REQUEST', { requestState: 'declined' });
    await renderActivity([accepted, declined]);
    expect(screen.getByTestId(`friends-activity-${accepted.id}-answered`)).toHaveTextContent(
      'You accepted',
    );
    expect(screen.getByTestId(`friends-activity-${declined.id}-answered`)).toHaveTextContent(
      'You declined',
    );
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });

  it('accepting a pending request flips the row to `You accepted` and calls acceptRequest', async () => {
    const accept = jest.fn(() => ({ ok: true }));
    await renderActivity([REQUEST], { 'friends.acceptRequest': accept });
    await userEvent
      .setup()
      .press(screen.getByTestId(`friends-activity-request-${REQUEST.actor.id}-accept`));
    await waitFor(() => expect(accept).toHaveBeenCalledWith({ userId: REQUEST.actor.id }));
    expect(await screen.findByTestId(`friends-activity-${REQUEST.id}-answered`)).toHaveTextContent(
      'You accepted',
    );
    expect(track).toHaveBeenCalledWith('friend_request_answered', {
      action: 'accept',
      via: 'activity',
    });
  });

  it('declining a pending request flips the row to `You declined`', async () => {
    const decline = jest.fn(() => ({ ok: true }));
    await renderActivity([REQUEST], { 'friends.declineRequest': decline });
    await userEvent
      .setup()
      .press(screen.getByTestId(`friends-activity-request-${REQUEST.actor.id}-decline`));
    await waitFor(() => expect(decline).toHaveBeenCalledWith({ userId: REQUEST.actor.id }));
    expect(await screen.findByTestId(`friends-activity-${REQUEST.id}-answered`)).toHaveTextContent(
      'You declined',
    );
  });

  it('marks everything shown as read on open (upTo = the newest item) and refetches the badge', async () => {
    const markRead = jest.fn(() => ({ unreadActivity: 0 }));
    const r = await renderActivity([REQUEST, NEW_FOLLOWER, ACCEPTED], {
      'friends.markActivityRead': markRead,
    });
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));
    expect(markRead).toHaveBeenCalledWith({ upTo: REQUEST.createdAt });
    // `friends.me` is refetched once the mark-read succeeded (the badge).
    const meBefore = r.paths().filter((p) => p === 'friends.me').length;
    await settle();
    await waitFor(() =>
      expect(r.paths().filter((p) => p === 'friends.me').length).toBeGreaterThan(1),
    );
    expect(meBefore).toBeGreaterThanOrEqual(1);
    // `New` keeps listing what was unread when the screen opened.
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('does not call markActivityRead when nothing is unread', async () => {
    const markRead = jest.fn(() => ({ unreadActivity: 0 }));
    await renderActivity([activityItem(3, 'REQUEST_ACCEPTED', { readAt: new Date() })], {
      'friends.markActivityRead': markRead,
    });
    await settle();
    expect(markRead).not.toHaveBeenCalled();
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.getByText('Earlier')).toBeTruthy();
  });

  it('shows the empty state', async () => {
    await renderActivity([]);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    expect(screen.getByText('Follow requests and new followers show up here.')).toBeTruthy();
  });

  it('shows an error state, not the empty state, when the load fails', async () => {
    await renderActivity([], {
      'friends.activity': () => {
        throw new Error('boom');
      },
    });
    expect(screen.getByText('Couldn’t load this list.')).toBeTruthy();
    expect(screen.queryByText('Nothing yet')).toBeNull();
  });
});

describe('activity helpers', () => {
  it('splits the sentence after the name', () => {
    expect(activitySentenceRest(activityItem(1, 'FOLLOW_REQUEST'))).toBe('wants to follow you');
    expect(activitySentenceRest(activityItem(1, 'NEW_FOLLOWER'))).toBe('started following you');
    expect(activitySentenceRest(activityItem(1, 'REQUEST_ACCEPTED'))).toBe('accepted your request');
  });

  it('groups items into New and Earlier, omitting an empty section', () => {
    const a = activityItem(1, 'NEW_FOLLOWER');
    const b = activityItem(2, 'NEW_FOLLOWER');
    expect(activityRows([a, b], new Set([a.id])).map((r) => r.key)).toEqual([
      'h-new',
      a.id,
      'h-earlier',
      b.id,
    ]);
    expect(activityRows([a], new Set()).map((r) => r.key)).toEqual(['h-earlier', a.id]);
  });

  it('formats relative times: minutes, hours, Yesterday, days, then the date', () => {
    const now = new Date(2026, 8, 30, 12, 0, 0);
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    expect(formatActivityAge(ago(10 * 1000), now)).toBe('1m');
    expect(formatActivityAge(ago(5 * MIN), now)).toBe('5m');
    expect(formatActivityAge(ago(2 * HOUR), now)).toBe('2h');
    expect(formatActivityAge(ago(30 * HOUR), now)).toBe('Yesterday');
    expect(formatActivityAge(ago(3 * 24 * HOUR), now)).toBe('3 days');
    expect(formatActivityAge(new Date(2026, 8, 21), now)).toBe('21 Sep');
  });
});
