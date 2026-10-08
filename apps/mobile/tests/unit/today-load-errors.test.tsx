import { screen, userEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../../app/(food)/index';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// WP-02 acceptance: with the API down, Today (and the kitchen) show an error
// with Try again — not an endless spinner and not an empty state.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    Link: ({ children }: { children: React.ReactNode }) => children,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ enabled: true, isPremium: true }),
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

const serverDown = () => {
  throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
};

describe('Today: API down', () => {
  it('shows an error with Try again, and Try again retries the summary', async () => {
    let calls = 0;
    const user = userEvent.setup();
    await renderWithTrpc(
      <HomeScreen />,
      {
        'dashboard.summary': () => {
          calls += 1;
          return serverDown();
        },
      },
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('today-load-error')).toBeOnTheScreen());
    const before = calls;
    await user.press(screen.getByTestId('today-load-error-retry'));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });
});
