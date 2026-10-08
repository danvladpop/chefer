import { Text } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { FriendsGate } from '../../src/features/friends/components/friends-gate';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-X-12: when the availability check itself cannot be made (offline, 5xx)
// the route gate offers Retry — it does not claim Following "isn't available".
// A real answer (off, or a 4xx from an old API) still gets the unavailable screen.

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

const child = <Text testID="gate-child">inside</Text>;

describe('FriendsGate: unreachable availability', () => {
  it('a 500 shows an error with Try again, and the route opens once the server is back', async () => {
    let up = false;
    const user = userEvent.setup();
    await renderWithTrpc(
      <FriendsGate>{child}</FriendsGate>,
      {
        'friends.availability': () => {
          if (!up) throw trpcError('INTERNAL_SERVER_ERROR', 500);
          return { enabled: true };
        },
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('friends-gate-error')).toBeOnTheScreen());
    expect(screen.queryByTestId('friends-unavailable')).toBeNull();
    up = true;
    await user.press(screen.getByTestId('friends-gate-error-retry'));
    expect(await screen.findByTestId('gate-child')).toBeOnTheScreen();
  });

  it('an old API (404) is an answer: off, so the unavailable screen', async () => {
    await renderWithTrpc(<FriendsGate>{child}</FriendsGate>, {}, testQueryClient());
    await waitFor(() => expect(screen.getByTestId('friends-unavailable')).toBeOnTheScreen());
    expect(screen.queryByTestId('friends-gate-error')).toBeNull();
  });

  it('the kill switch (enabled: false) is an answer too', async () => {
    await renderWithTrpc(
      <FriendsGate>{child}</FriendsGate>,
      { 'friends.availability': () => ({ enabled: false }) },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('friends-unavailable')).toBeOnTheScreen());
  });
});
