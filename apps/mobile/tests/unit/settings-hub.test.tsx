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
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

// Whether the gym profile exists (UX-ACC-04: food-only users get a CTA, not dead rows).
let mockGymBootstrap: { isSuccess: boolean; data?: { profile: object | null } } = {
  isSuccess: true,
  data: { profile: {} },
};
jest.mock('../../src/features/gym/use-gym-bootstrap', () => ({
  useGymBootstrap: () => mockGymBootstrap,
}));

jest.mock('../../src/lib/auth-store', () => ({
  clearToken: jest.fn().mockResolvedValue(undefined),
}));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
}>('expo-router');

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
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReturnValue(true);
  mockGymBootstrap = { isSuccess: true, data: { profile: {} } };
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
    expect(router.push).toHaveBeenCalledWith('/gym/settings?section=reminders');

    await user.press(screen.getByTestId('settings-workout-history'));
    expect(router.push).toHaveBeenCalledWith('/stats?tab=history');
  });

  it('UX-ACC-04: rows land on the card they name, via ?section= anchors', async () => {
    const user = userEvent.setup();
    await renderSettings(makeClient());
    const expected: Record<string, string> = {
      'settings-goal-body': '/preferences?section=goal-body',
      'settings-targets': '/preferences?section=targets',
      'settings-safety': '/preferences?section=safety',
      'settings-money-units': '/preferences?section=display',
      'settings-budget': '/preferences?section=budget',
      'settings-auto-plan': '/preferences?section=auto-plan',
      'settings-pause': '/gym/settings?section=pause',
      'settings-gym-units': '/gym/settings?section=units',
      'settings-export': '/gym/settings?section=export',
      'settings-plan-premium': '/profile?section=plan',
      // Emails used to open Profile, which has no email controls.
      'settings-emails': '/preferences?section=weekly-updates',
      'settings-notifications': '/preferences?section=weekly-updates',
      'settings-privacy': '/profile?section=privacy',
      'settings-account-data': '/profile?section=account',
    };
    for (const [testID, href] of Object.entries(expected)) {
      router.push.mockClear();
      await user.press(screen.getByTestId(testID));
      expect(router.push).toHaveBeenCalledWith(href);
    }
  });

  it('UX-ACC-04: has a back control (Settings was the only stack screen without one)', async () => {
    const user = userEvent.setup();
    await renderSettings(makeClient());
    await user.press(screen.getByTestId('settings-back'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('back falls back to Today when there is nothing to go back to', async () => {
    router.canGoBack.mockReturnValue(false);
    const user = userEvent.setup();
    await renderSettings(makeClient());
    await user.press(screen.getByTestId('settings-back'));
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('UX-ACC-04: a food-only user gets "Set up training", not five dead rows', async () => {
    mockGymBootstrap = { isSuccess: true, data: { profile: null } };
    const user = userEvent.setup();
    await renderSettings(makeClient());
    expect(screen.queryByTestId('settings-training-days')).toBeNull();
    expect(screen.queryByTestId('settings-pause')).toBeNull();
    await user.press(screen.getByTestId('settings-set-up-training'));
    expect(router.push).toHaveBeenCalledWith('/gym/setup');
  });

  it('keeps the Training rows while the gym profile has not loaded', async () => {
    mockGymBootstrap = { isSuccess: false };
    await renderSettings(makeClient());
    expect(screen.getByTestId('settings-training-days')).toBeTruthy();
    expect(screen.queryByTestId('settings-set-up-training')).toBeNull();
  });

  it('UX-ACC-04 / UX-ACC-19: Legal rows open the in-app pages; the version is shown', async () => {
    const user = userEvent.setup();
    await renderSettings(makeClient());
    await user.press(screen.getByTestId('settings-terms'));
    expect(router.push).toHaveBeenCalledWith('/legal/terms');
    await user.press(screen.getByTestId('settings-privacy-policy'));
    expect(router.push).toHaveBeenCalledWith('/legal/privacy');
    expect(screen.getByTestId('settings-version')).toHaveTextContent(/^Version/);
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
