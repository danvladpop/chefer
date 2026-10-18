import { Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import FoodTabsLayout from '../../app/(food)/_layout';
import GymTabsLayout from '../../app/(gym)/_layout';
import MainTabsLayout from '../../app/(main)/_layout';
import TrainerTabsLayout from '../../app/(trainer)/_layout';
import { TabIcon } from '../../src/features/shell/tab-icon';
import { tabAccessibilityLabel } from '../../src/lib/tab-bar-options';

// TalkBack read the icon font's glyph in every tab ("<glyph>, Today"): with no
// tabBarAccessibilityLabel, React Navigation only builds a label on iOS and
// Android reads the tab button's children, icon glyph included. Every tab of
// all three tab bars (new shell, old Food, old Gym) now names itself.

type CapturedScreen = { name: string; options: Record<string, unknown> };
const mockTabScreens: CapturedScreen[] = [];
const mockTabsProps: Record<string, unknown>[] = [];
const mockRedirects: unknown[] = [];
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
    Redirect: ({ href }: { href: unknown }) => {
      mockRedirects.push(href);
      return null;
    },
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
  isShellV2: () => mockShellV2,
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
// Trainer mode (trainer-mode.md §5.2, §7.1): off unless a test turns it on.
let mockTrainerMode = false;
let mockTrainerBadges = { requests: 0, total: 0 };
jest.mock('../../src/features/trainer-mode/use-trainer-mode', () => ({
  useTrainerModeAvailability: () => mockTrainerMode,
  useTrainerBadges: () => ({ ...mockTrainerBadges, loaded: true, refetch: jest.fn() }),
}));
jest.mock('../../src/features/trainer-mode/use-mark-shell-mode', () => ({
  useMarkShellMode: () => undefined,
}));

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
  mockTrainerMode = false;
  mockTrainerBadges = { requests: 0, total: 0 };
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

// Trainer mode (trainer-mode.md §5.2, owner Q2): Schedule · Clients · Today ·
// Workouts · You, Today in the middle as the start and Back target.
describe('trainer mode tab bar', () => {
  beforeEach(() => {
    mockShellV2 = true;
    mockTrainerMode = true;
    mockTabScreens.length = 0;
    mockTabsProps.length = 0;
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('reads Schedule · Clients · Today · Workouts · You and starts on Today', async () => {
    await render(<TrainerTabsLayout />);
    expect(mockTabScreens.map((s) => [s.name, s.options.title])).toEqual([
      ['schedule', 'Schedule'],
      ['clients', 'Clients'],
      ['today', 'Today'],
      ['workouts', 'Workouts'],
      ['you', 'You'],
    ]);
    expect(mockTabsProps[0]).toMatchObject({
      initialRouteName: 'today',
      backBehavior: 'initialRoute',
    });
    expect(mockTabScreens.map((s) => s.options.tabBarButtonTestID)).toEqual([
      'trainer-tab-schedule',
      'trainer-tab-clients',
      'trainer-tab-today',
      'trainer-tab-workouts',
      'trainer-tab-you',
    ]);
  });

  it('Clients counts requests, You counts what waits in personal mode — both spoken', async () => {
    mockTrainerBadges = { requests: 2, total: 2 };
    mockBadge = 4;
    await render(<TrainerTabsLayout />);
    const byName = Object.fromEntries(mockTabScreens.map((s) => [s.name, s.options]));
    expect(byName.clients).toMatchObject({
      tabBarBadge: '2',
      tabBarAccessibilityLabel: 'Clients, 2 new',
    });
    expect(byName.you).toMatchObject({ tabBarBadge: '4', tabBarAccessibilityLabel: 'You, 4 new' });
    expect(byName.today?.tabBarBadge).toBeUndefined();
  });

  it('without trainer mode, the group renders no tabs (it redirects to personal mode)', async () => {
    mockTrainerMode = false;
    mockRedirects.length = 0;
    await render(<TrainerTabsLayout />);
    expect(mockTabScreens).toHaveLength(0);
    expect(mockRedirects).toEqual(['/home']);
  });

  it('personal mode’s You badge adds what waits in trainer mode', async () => {
    mockBadge = 1;
    mockTrainerBadges = { requests: 2, total: 2 };
    await render(<MainTabsLayout />);
    const you = mockTabScreens.find((s) => s.name === 'you');
    expect(you?.options).toMatchObject({
      tabBarBadge: '3',
      tabBarAccessibilityLabel: 'You, 3 new',
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
