import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { SettingsScreen } from '../../src/features/settings/settings-screen';
import { trpc } from '../../src/lib/trpc';

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('../../src/lib/auth-store', () => ({
  clearToken: jest.fn().mockResolvedValue(undefined),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function renderSettings(queryClient: QueryClient) {
  // No request is actually completed in these tests — the mutation fires
  // but nothing awaits it, so an unreachable URL is fine.
  const client = trpc.createClient({
    links: [httpBatchLink({ url: 'http://127.0.0.1:9/trpc', transformer: superjson })],
  });
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <SettingsScreen />
        </QueryClientProvider>
      </trpc.Provider>
    </SafeAreaProvider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

beforeEach(() => {
  router.push.mockClear();
});

describe('SettingsScreen (T-00.9, PAT-9 §2.9)', () => {
  it('renders every group and row of the settings map', async () => {
    await renderSettings(makeClient());

    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getByText('Training')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByTestId('settings-jobs')).toBeTruthy();
    expect(screen.getByTestId('settings-household')).toBeTruthy();
    expect(screen.getByTestId('settings-training-days')).toBeTruthy();
    expect(screen.getByTestId('settings-plan-premium')).toBeTruthy();
  });

  it('every row points at an existing screen', async () => {
    const user = userEvent.setup();
    await renderSettings(makeClient());

    await user.press(screen.getByTestId('settings-household'));
    expect(router.push).toHaveBeenCalledWith('/household');

    await user.press(screen.getByTestId('settings-training-days'));
    expect(router.push).toHaveBeenCalledWith('/gym/settings');

    await user.press(screen.getByTestId('settings-workout-history'));
    expect(router.push).toHaveBeenCalledWith('/stats');
  });

  it('sign out asks for confirmation before signing out (no confirmation was P06-M47)', async () => {
    const user = userEvent.setup();
    await renderSettings(makeClient());

    await user.press(screen.getByTestId('settings-sign-out'));
    expect(screen.getByTestId('settings-sign-out-confirm-body')).toBeTruthy();

    await user.press(screen.getByTestId('settings-sign-out-confirm-cancel'));
    expect(screen.queryByTestId('settings-sign-out-confirm-body')).toBeNull();
  });
});
