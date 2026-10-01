import { Platform } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { FRIENDS_SCREEN_TITLES } from '../../src/features/friends/components/screen-titles';
import { FriendsBlockedScreen } from '../../src/features/friends/settings/blocked-screen';
import {
  availableHandlers,
  person,
  renderWithTrpc,
  trpcError,
  type Handlers,
} from './friends-core-harness';

// F2.3 M-SETTINGS — Blocked people (UX §11.6, FR-13.3): a plain list, Unblock
// → confirm → the row leaves; empty state; paged.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const ANA = person({
  id: 'cana00000000000000000001',
  displayName: 'Ana Ionescu',
  firstName: 'Ana',
});
const BOGDAN = person({
  id: 'cbogdan0000000000000001',
  displayName: 'Bogdan Pop',
  firstName: 'Bogdan',
});

function blockedHandlers(extra: Handlers = {}): Handlers {
  return {
    ...availableHandlers(),
    'friends.blocked': () => ({ items: [ANA, BOGDAN], nextCursor: null }),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Blocked people', () => {
  it('titles the screen from the copy deck', () => {
    expect(FRIENDS_SCREEN_TITLES.blocked).toBe(FRIENDS_COPY.blocked.title);
  });

  it('lists people as plain rows with an Unblock button each', async () => {
    await renderWithTrpc(<FriendsBlockedScreen />, blockedHandlers());
    expect(await screen.findByText('Ana Ionescu')).toBeTruthy();
    expect(screen.getByText('Bogdan Pop')).toBeTruthy();
    expect(screen.getByText('Blocked people')).toBeTruthy();
    expect(screen.getByTestId(`friends-blocked-unblock-${ANA.id}`)).toBeTruthy();
    expect(screen.getByTestId(`friends-blocked-unblock-${BOGDAN.id}`)).toBeTruthy();
    // A blocked profile is unreachable: the identity part is not a button.
    expect(screen.queryByRole('button', { name: 'Ana Ionescu' })).toBeNull();
  });

  it('Unblock → confirm → the row leaves and the server is asked once', async () => {
    const unblock = jest.fn(() => ({ ok: true }));
    let blocked = [ANA, BOGDAN];
    await renderWithTrpc(
      <FriendsBlockedScreen />,
      blockedHandlers({
        'friends.blocked': () => ({ items: blocked, nextCursor: null }),
        'friends.unblock': (input) => {
          blocked = blocked.filter((p) => p.id !== (input as { userId: string }).userId);
          return unblock();
        },
      }),
    );
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(`friends-blocked-unblock-${ANA.id}`));
    expect(screen.getByText('Unblock Ana?')).toBeTruthy();
    expect(
      screen.getByText('They’ll be able to find you again. Follows aren’t restored.'),
    ).toBeTruthy();
    expect(unblock).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('friends-unblock-confirm-confirm'));
    await waitFor(() => expect(unblock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Ana Ionescu')).toBeNull());
    expect(screen.getByText('Bogdan Pop')).toBeTruthy();
  });

  it('a failed unblock keeps the row and the sheet, with the error', async () => {
    await renderWithTrpc(
      <FriendsBlockedScreen />,
      blockedHandlers({
        'friends.unblock': () => {
          throw trpcError('INTERNAL_SERVER_ERROR', 500);
        },
      }),
    );
    const user = userEvent.setup();
    await user.press(await screen.findByTestId(`friends-blocked-unblock-${ANA.id}`));
    await user.press(screen.getByTestId('friends-unblock-confirm-confirm'));
    expect(await screen.findByTestId('friends-unblock-confirm-error')).toBeTruthy();
    expect(screen.getByText('Ana Ionescu')).toBeTruthy();
  });

  it('shows the empty state when nobody is blocked', async () => {
    await renderWithTrpc(
      <FriendsBlockedScreen />,
      blockedHandlers({ 'friends.blocked': () => ({ items: [], nextCursor: null }) }),
    );
    expect(await screen.findByText('You haven’t blocked anyone.')).toBeTruthy();
  });

  it('shows a retry when the list cannot load', async () => {
    const r = await renderWithTrpc(
      <FriendsBlockedScreen />,
      blockedHandlers({
        'friends.blocked': () => {
          throw trpcError('INTERNAL_SERVER_ERROR', 500);
        },
      }),
    );
    expect(await screen.findByTestId('friends-blocked-error')).toBeTruthy();
    expect(r.paths()).toContain('friends.blocked');
  });

  it('pages: the next page is requested with the cursor', async () => {
    const calls: unknown[] = [];
    await renderWithTrpc(
      <FriendsBlockedScreen />,
      blockedHandlers({
        'friends.blocked': (input) => {
          calls.push(input);
          const cursor = (input as { cursor?: string } | undefined)?.cursor;
          return cursor
            ? { items: [BOGDAN], nextCursor: null }
            : { items: [ANA], nextCursor: 'page-2' };
        },
      }),
    );
    expect(await screen.findByText('Ana Ionescu')).toBeTruthy();
    const list = screen.getByTestId('friends-blocked-list');
    // The list is short, so it asks for the end immediately; drive it as a scroll would.
    const { fireEvent } = jest.requireActual<typeof import('@testing-library/react-native')>(
      '@testing-library/react-native',
    );
    await fireEvent(list, 'endReached');
    expect(await screen.findByText('Bogdan Pop')).toBeTruthy();
    expect(calls).toContainEqual(expect.objectContaining({ cursor: 'page-2' }));
  });
});
