import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/features/settings/settings-screen';
import { ACCOUNT_DISCLAIMER } from '../../src/features/shell/you/account-screen';

// 10 Oct redesign, board "Settings" → "Account": in the new shell `/settings`
// keeps only You, Account and Legal; Food, Training, Notifications,
// Following, Preview and Sign out moved to You (and Meal/Training settings).
// The old shell's Settings hub is unchanged.

let mockShellV2 = true;
jest.mock('../../src/features/shell/shell-store', () => ({
  ...jest.requireActual<object>('../../src/features/shell/shell-store'),
  useShellV2: () => mockShellV2,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

let mockPremium: boolean | undefined = true;
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => mockPremium }));

let mockFriends = true;
jest.mock('../../src/features/friends/api/use-friends-availability', () => ({
  useFriendsAvailability: () => ({ enabled: mockFriends }),
}));

jest.mock('../../src/features/gym/use-gym-bootstrap', () => ({
  useGymBootstrap: () => ({ isSuccess: true, data: { profile: {} } }),
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: { role: 'USER', planTier: 'FREE' } }) },
      logout: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
}>('expo-router');

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderSettings() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SettingsScreen />
    </SafeAreaProvider>,
  );
}

// Every row of the old hub that left this screen in the new shell.
const MOVED = [
  'settings-safety',
  'settings-household',
  'settings-money-units',
  'settings-budget',
  'settings-auto-plan',
  'settings-training-days',
  'settings-pause',
  'settings-gym-units',
  'settings-workout-history',
  'settings-export',
  'settings-set-up-training',
  'settings-notifications',
  'settings-friends',
  'settings-sign-out',
  'shell-preview-section',
  'settings-version',
];

beforeEach(() => {
  jest.clearAllMocks();
  router.canGoBack.mockReturnValue(true);
  mockShellV2 = true;
  mockPremium = true;
  mockFriends = true;
});

describe('Account (new shell /settings)', () => {
  it('is titled Account, with the You, Account and Legal groups', async () => {
    await renderSettings();
    expect(screen.getByTestId('account-header')).toHaveTextContent(/Account/);
    // The title and the "Account" group header.
    expect(screen.getAllByRole('header', { name: 'Account' })).toHaveLength(2);
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Legal')).toBeTruthy();
    expect(screen.queryByText('Food')).toBeNull();
    expect(screen.queryByText('Training')).toBeNull();
  });

  it('drops the rows that moved to You, Meal settings and Training settings', async () => {
    await renderSettings();
    for (const testID of MOVED) expect(screen.queryByTestId(testID)).toBeNull();
  });

  it('kept rows still open the same screens and sections', async () => {
    await renderSettings();
    const expected: Record<string, string> = {
      'settings-jobs': '/settings/jobs',
      'settings-goal-body': '/preferences?section=goal-body',
      'settings-targets': '/preferences?section=targets',
      'settings-plan-premium': '/profile?section=plan',
      'settings-emails': '/preferences?section=weekly-updates',
      'settings-privacy': '/profile?section=privacy',
      'settings-account-data': '/profile?section=account',
      'settings-sharing': '/friends/settings',
      'settings-terms': '/legal/terms',
      'settings-privacy-policy': '/legal/privacy',
    };
    for (const [testID, href] of Object.entries(expected)) {
      router.push.mockClear();
      await fireEvent.press(screen.getByTestId(testID));
      expect(router.push).toHaveBeenCalledWith(href);
    }
  });

  it('Plan & Premium shows the plan', async () => {
    const { unmount } = await renderSettings();
    expect(screen.getByTestId('settings-plan-premium')).toHaveTextContent(/Premium.*Premium/);
    await unmount();

    mockPremium = false;
    await renderSettings();
    expect(screen.getByTestId('settings-plan-premium')).toHaveTextContent(/Free/);
  });

  it('Sharing & privacy only while Following is available', async () => {
    mockFriends = false;
    await renderSettings();
    expect(screen.queryByTestId('settings-sharing')).toBeNull();
  });

  it('keeps the (shortened) medical disclaimer', async () => {
    await renderSettings();
    expect(screen.getByTestId('settings-about-disclaimer')).toHaveTextContent(ACCOUNT_DISCLAIMER);
  });

  it('Back falls back to You without history', async () => {
    router.canGoBack.mockReturnValue(false);
    await renderSettings();
    await fireEvent.press(screen.getByTestId('shell-back'));
    expect(router.replace).toHaveBeenCalledWith('/you');
  });
});

describe('Settings (old shell) is unchanged', () => {
  it('still renders the full hub', async () => {
    mockShellV2 = false;
    await renderSettings();
    expect(screen.getByTestId('settings-title')).toHaveTextContent('Settings');
    for (const testID of [
      'settings-safety',
      'settings-training-days',
      'settings-notifications',
      'settings-friends',
      'settings-sign-out',
      'settings-version',
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    expect(screen.queryByTestId('settings-sharing')).toBeNull();
  });
});
