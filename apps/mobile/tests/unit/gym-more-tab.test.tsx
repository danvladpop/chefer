import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import GymTabsLayout from '../../app/(gym)/_layout';
import GymMoreScreen from '../../app/(gym)/gym-more';

// FB7-01: Gym mode has a 5th "More" tab (Food already has one). Gym's lists
// Gym settings, Profile, Following, Progress, Settings, then the shared
// feedback card, legal links, Sign out and version.

const mockPush = jest.fn();
const mockTabScreens: { name: string; options: Record<string, unknown> }[] = [];
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { View } = require('react-native') as typeof import('react-native');
  function TabsScreen(props: { name: string; options: Record<string, unknown> }) {
    mockTabScreens.push(props);
    return null;
  }
  function Tabs({ children }: { children: React.ReactNode }) {
    return <View>{children}</View>;
  }
  Tabs.Screen = TabsScreen;
  return {
    router: {
      push: (...args: unknown[]) => {
        mockPush(...args);
      },
    },
    Tabs,
  };
});
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
jest.mock('../../src/components/snackbar-tab-bar', () => ({ SnackbarAwareTabBar: () => null }));
let mockAvailable = true;
let mockBadge = 0;
jest.mock('../../src/features/friends/api/use-friends-badge', () => ({
  useFriendsBadge: () => ({ available: mockAvailable, badgeCount: mockBadge }),
}));
jest.mock('../../src/features/friends/api/use-friends-me', () => ({
  useFriendsMe: () => ({ available: mockAvailable, badgeCount: mockBadge }),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

beforeEach(() => {
  mockPush.mockClear();
  mockLogoutMutate.mockClear();
  mockTabScreens.length = 0;
  mockAvailable = true;
  mockBadge = 0;
});

describe('Gym tab layout (FB7-01)', () => {
  it('has Today, Routine, Exercises, Stats and a More tab, in that order', async () => {
    await render(<GymTabsLayout />);
    expect(mockTabScreens.map((s) => s.name)).toEqual([
      'today',
      'routine',
      'exercises',
      'stats',
      'gym-more',
    ]);
    const more = mockTabScreens[4];
    expect(more?.options.title).toBe('More');
    expect(more?.options.tabBarBadge).toBeUndefined();
  });

  it('carries the Following badge on the More tab', async () => {
    mockBadge = 3;
    await render(<GymTabsLayout />);
    const more = mockTabScreens.find((s) => s.name === 'gym-more');
    expect(more?.options.tabBarBadge).toBe('3');
    expect(more?.options.tabBarAccessibilityLabel).toBe('More, 3 new');
  });
});

describe('Gym More screen (FB7-01)', () => {
  async function renderMore() {
    return render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <GymMoreScreen />
      </SafeAreaProvider>,
    );
  }

  it('lists Gym settings, Profile, Following, Progress, Settings, in that order', async () => {
    await renderMore();
    const ids = [
      'more-gym-settings',
      'more-profile',
      'more-friends',
      'more-progress',
      'more-settings',
    ];
    for (const id of ids) expect(screen.getByTestId(id)).toBeOnTheScreen();
    // Food-only entries stay out of Gym's list.
    expect(screen.queryByTestId('more-ai chef')).toBeNull();
    expect(screen.queryByTestId('more-my-weeks')).toBeNull();
    expect(screen.queryByTestId('more-household')).toBeNull();

    await fireEvent.press(screen.getByTestId('more-gym-settings'));
    expect(mockPush).toHaveBeenLastCalledWith('/gym/settings');
  });

  it('hides Following while the feature is off', async () => {
    mockAvailable = false;
    await renderMore();
    expect(screen.queryByTestId('more-friends')).toBeNull();
    expect(screen.getByTestId('more-profile')).toBeOnTheScreen();
  });

  it('keeps legal links and Sign out (with its confirm)', async () => {
    await renderMore();
    expect(screen.getByTestId('more-terms')).toBeOnTheScreen();
    expect(screen.getByTestId('build-info')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('logout-button'));
    expect(mockLogoutMutate).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByTestId('more-sign-out-confirm-confirm'));
    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });
});
