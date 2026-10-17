import { Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import FoodTabsLayout from '../../app/(food)/_layout';
import GymTabsLayout from '../../app/(gym)/_layout';
import MainTabsLayout from '../../app/(main)/_layout';
import { TabIcon } from '../../src/features/shell/tab-icon';
import { tabAccessibilityLabel } from '../../src/lib/tab-bar-options';

// TalkBack read the icon font's glyph in every tab ("<glyph>, Today"): with no
// tabBarAccessibilityLabel, React Navigation only builds a label on iOS and
// Android reads the tab button's children, icon glyph included. Every tab of
// all three tab bars (new shell, old Food, old Gym) now names itself.

type CapturedScreen = { name: string; options: Record<string, unknown> };
const mockTabScreens: CapturedScreen[] = [];
const mockTabsProps: Record<string, unknown>[] = [];
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { View } = require('react-native') as typeof import('react-native');
  function TabsScreen(props: CapturedScreen) {
    mockTabScreens.push(props);
    return null;
  }
  function Tabs({ children, ...props }: { children: React.ReactNode }) {
    mockTabsProps.push(props);
    return <View>{children}</View>;
  }
  Tabs.Screen = TabsScreen;
  return {
    Tabs,
    Redirect: () => null,
    usePathname: () => '/home',
    router: { push: jest.fn() },
  };
});
jest.mock('../../src/components/snackbar-tab-bar', () => ({ SnackbarAwareTabBar: () => null }));
let mockBadge = 0;
jest.mock('../../src/features/friends/api/use-friends-me', () => ({
  useFriendsMe: () => ({ available: true, badgeCount: mockBadge }),
}));
let mockShellV2 = false;
jest.mock('../../src/features/shell/shell-store', () => ({
  useShellV2: () => mockShellV2,
}));
jest.mock('../../src/features/auth/pending-onboarding', () => ({
  usePendingOnboarding: () => false,
}));
jest.mock('../../src/features/onboarding/use-onboarding-gate', () => ({
  useOnboardingGate: () => false,
}));
jest.mock('../../src/features/navigation/use-landing', () => ({
  landingSurfaceSync: () => 'food',
  useSyncLandingCache: () => undefined,
}));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token' }));

const LAYOUTS = [
  {
    shell: 'new shell',
    shellV2: true,
    Layout: MainTabsLayout,
    titles: ['Shop', 'Meals', 'Today', 'Train', 'You'],
  },
  {
    shell: 'old Food shell',
    shellV2: false,
    Layout: FoodTabsLayout,
    titles: ['Today', 'Plan', 'Shop', 'Cookbook', 'More'],
  },
  {
    shell: 'old Gym shell',
    shellV2: false,
    Layout: GymTabsLayout,
    titles: ['Today', 'Routine', 'Exercises', 'Stats', 'More'],
  },
] as const;

/** Letters, digits, spaces and plain punctuation only — no icon-font glyphs. */
const CLEAN = /^[A-Za-z0-9 ,]+$/;

async function labelsFor(layout: (typeof LAYOUTS)[number]): Promise<unknown[]> {
  mockTabScreens.length = 0;
  mockShellV2 = layout.shellV2;
  const { Layout } = layout;
  await render(<Layout />);
  return mockTabScreens.map((s) => s.options.tabBarAccessibilityLabel);
}

beforeEach(() => {
  mockBadge = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(['android', 'ios'] as const)('tab accessibility labels on %s', (os) => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', os);
  });

  it.each(LAYOUTS)('every $shell tab has a clean, explicit label', async (layout) => {
    const labels = await labelsFor(layout);
    expect(labels).toEqual(
      layout.titles.map((title, index) =>
        os === 'ios' ? `${title}, tab, ${index + 1} of ${layout.titles.length}` : title,
      ),
    );
    for (const label of labels) expect(label).toMatch(CLEAN);
  });

  it.each(LAYOUTS)('the $shell badge is spoken as "N new"', async (layout) => {
    mockBadge = 3;
    const labels = await labelsFor(layout);
    const last = layout.titles[layout.titles.length - 1];
    expect(labels[labels.length - 1]).toBe(
      os === 'ios' ? `${last}, 3 new, tab, 5 of 5` : `${last}, 3 new`,
    );
    for (const label of labels) expect(label).toMatch(CLEAN);
  });
});

// Owner feedback 2026-10-17 (F4): Today is the core of the app, so it sits in
// the middle of the new shell's bar (a literal swap with Shop) and is still
// where the bar starts and where Android Back returns to.
describe('new shell tab order', () => {
  beforeEach(() => {
    mockShellV2 = true;
    mockTabScreens.length = 0;
    mockTabsProps.length = 0;
  });

  it('reads Shop · Meals · Today · Train · You', async () => {
    await render(<MainTabsLayout />);
    expect(mockTabScreens.map((s) => [s.name, s.options.title])).toEqual([
      ['shop', 'Shop'],
      ['plan', 'Meals'],
      ['home', 'Today'],
      ['train', 'Train'],
      ['you', 'You'],
    ]);
  });

  it('starts on Today and sends Back to Today, not to the first tab', async () => {
    await render(<MainTabsLayout />);
    expect(mockTabsProps[0]).toMatchObject({
      initialRouteName: 'home',
      backBehavior: 'initialRoute',
    });
  });
});

describe('tabAccessibilityLabel', () => {
  it('is the plain title on Android and React Navigation’s wording on iOS', () => {
    expect(tabAccessibilityLabel('Today', 0, 5, 0, 'android')).toBe('Today');
    expect(tabAccessibilityLabel('Today', 0, 5, 0, 'ios')).toBe('Today, tab, 1 of 5');
    expect(tabAccessibilityLabel('You', 4, 5, 2, 'android')).toBe('You, 2 new');
  });
});

describe('TabIcon', () => {
  it('hides the icon glyph from screen readers on both platforms', async () => {
    await render(
      <TabIcon focused={false}>
        <Text testID="glyph">{'\uf3a1'}</Text>
      </TabIcon>,
    );
    // Hidden subtrees are excluded from the accessible tree that queries see.
    expect(screen.queryByTestId('glyph')).toBeNull();
    const all = screen.getByTestId('glyph', { includeHiddenElements: true });
    expect(all).toBeTruthy();
  });
});
