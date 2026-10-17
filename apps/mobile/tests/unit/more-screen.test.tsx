import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import MoreScreen from '../../app/(food)/more';

// UX-ACC-19: More signs out only after a confirm, opens Terms/Privacy in the
// app (not the browser), and gives Household and Following different icons.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));
jest.mock('@expo/vector-icons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text } = require('react-native') as typeof import('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});

const mockLogoutMutate = jest.fn();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    auth: { logout: { useMutation: () => ({ mutate: mockLogoutMutate, isPending: false }) } },
  },
}));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/features/feedback/feedback-card', () => ({ FeedbackCard: () => null }));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/friends/api/use-friends-badge', () => ({
  useFriendsBadge: () => ({ available: true, badgeCount: 0 }),
}));
// WP-18: the "Your trainer" / "Trainer tools" rows follow `coaching.availability` (off by default here).
let mockCoaching = { enabled: false, canBeTrainer: false };
jest.mock('../../src/features/trainer/api/use-coaching-availability', () => ({
  useCoachingAvailability: () => mockCoaching,
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderMore() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <MoreScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockCoaching = { enabled: false, canBeTrainer: false };
  mockPush.mockClear();
  mockLogoutMutate.mockClear();
});

describe('More (UX-ACC-19)', () => {
  it('Sign out asks first and signs out only on the confirm', async () => {
    await renderMore();
    await fireEvent.press(screen.getByTestId('logout-button'));
    expect(mockLogoutMutate).not.toHaveBeenCalled();
    expect(await screen.findByTestId('more-sign-out-confirm-body')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('more-sign-out-confirm-cancel'));
    expect(mockLogoutMutate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('logout-button'));
    await fireEvent.press(await screen.findByTestId('more-sign-out-confirm-confirm'));
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('Terms and Privacy open the in-app legal pages, not the browser', async () => {
    await renderMore();
    await fireEvent.press(screen.getByTestId('more-terms'));
    expect(mockPush).toHaveBeenLastCalledWith('/legal/terms');
    await fireEvent.press(screen.getByTestId('more-privacy'));
    expect(mockPush).toHaveBeenLastCalledWith('/legal/privacy');
  });

  it('Household and Following have different icons', async () => {
    await renderMore();
    const household = within(screen.getByTestId('more-household'));
    const following = within(screen.getByTestId('more-friends'));
    expect(household.getByTestId('icon-home-outline')).toBeOnTheScreen();
    expect(following.getByTestId('icon-people-outline')).toBeOnTheScreen();
    expect(household.queryByTestId('icon-people-outline')).toBeNull();
  });
});

describe('More: trainer coaching rows (WP-18)', () => {
  it('flag off: neither "Your trainer" nor "Trainer tools" exists', async () => {
    await renderMore();
    expect(screen.queryByTestId('more-your-trainer')).toBeNull();
    expect(screen.queryByTestId('more-trainer-tools')).toBeNull();
  });

  it('coaching on: "Your trainer" for everyone, below Following; "Trainer tools" only for trainers', async () => {
    mockCoaching = { enabled: true, canBeTrainer: false };
    await renderMore();
    expect(screen.getByTestId('more-your-trainer')).toBeOnTheScreen();
    expect(screen.queryByTestId('more-trainer-tools')).toBeNull();
    await fireEvent.press(screen.getByTestId('more-your-trainer'));
    expect(mockPush).toHaveBeenLastCalledWith('/coaching');
  });

  it('a user who may coach gets "Trainer tools" → /trainer', async () => {
    mockCoaching = { enabled: true, canBeTrainer: true };
    await renderMore();
    const labels = screen.getAllByRole('button').map((b) => b.props.testID as string | undefined);
    expect(labels.indexOf('more-friends')).toBeLessThan(labels.indexOf('more-your-trainer'));
    expect(labels.indexOf('more-your-trainer')).toBeLessThan(labels.indexOf('more-trainer-tools'));
    await fireEvent.press(screen.getByTestId('more-trainer-tools'));
    expect(mockPush).toHaveBeenLastCalledWith('/trainer');
  });
});
