import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { CalorieGauge, MacroTiles } from '@chefer/ui-mobile';
import FoodTabsLayout from '../../app/(food)/_layout';
import GymTabsLayout from '../../app/(gym)/_layout';
import MainTabsLayout from '../../app/(main)/_layout';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { AskChefAction } from '../../src/features/shell/add-action';
import { NutritionCard } from '../../src/features/shell/today/nutrition-card';
import { calorieGaugeLabels, macroLabels } from '../../src/features/shell/today/nutrition-labels';
import { getTranslator, resetLocaleForTests } from '../../src/lib/i18n';

// Lane J phase 4: the shell's chrome follows the UI language — the tab bars
// (`nav.items.*`, spoken through `nav.tab.*`), the Ask Chef pill, and the UI
// kit's calorie gauge and macro rows, which take their words as props
// (`today.shell.gauge.*`, `today.shell.macros.*`).

type CapturedScreen = { name: string; options: Record<string, unknown> };
const mockTabScreens: CapturedScreen[] = [];
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { View } = require('react-native') as typeof import('react-native');
  function TabsScreen(props: CapturedScreen) {
    mockTabScreens.push(props);
    return null;
  }
  function Tabs({ children }: { children: React.ReactNode }) {
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
jest.mock('../../src/features/trainer-mode/use-trainer-mode', () => ({
  useTrainerModeAvailability: () => false,
  useTrainerBadges: () => ({ requests: 0, total: 0, loaded: true, refetch: jest.fn() }),
}));
jest.mock('../../src/features/trainer-mode/use-mark-shell-mode', () => ({
  useMarkShellMode: () => undefined,
}));

async function tabsOf(Layout: () => React.ReactNode, shellV2: boolean) {
  mockTabScreens.length = 0;
  mockShellV2 = shellV2;
  await render(<Layout />);
  return mockTabScreens.map((s) => ({
    title: s.options.title,
    spoken: s.options.tabBarAccessibilityLabel,
  }));
}

describe('shell chrome in Romanian', () => {
  beforeEach(() => {
    mockBadge = 0;
    resetLocaleForTests(['ro-RO']);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => resetLocaleForTests(['en-US']));

  it('names the new shell’s tabs in Romanian', async () => {
    const tabs = await tabsOf(MainTabsLayout, true);
    expect(tabs.map((tab) => tab.title)).toEqual([
      'Cumpărături',
      'Mese',
      'Azi',
      'Antrenament',
      'Tu',
    ]);
  });

  it('names the old Food and Gym tabs in Romanian', async () => {
    expect((await tabsOf(FoodTabsLayout, false)).map((tab) => tab.title)).toEqual([
      'Azi',
      'Plan',
      'Cumpărături',
      'Rețete',
      'Mai mult',
    ]);
    expect((await tabsOf(GymTabsLayout, false)).map((tab) => tab.title)).toEqual([
      'Azi',
      'Rutină',
      'Exerciții',
      'Statistici',
      'Mai mult',
    ]);
  });

  it('speaks a tab’s position and badge in Romanian, with the plural', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockBadge = 3;
    const tabs = await tabsOf(MainTabsLayout, true);
    expect(tabs[2]?.spoken).toBe('Azi, filă, 3 din 5');
    expect(tabs[4]?.spoken).toBe('Tu, 3 noutăți, filă, 5 din 5');
    jest.replaceProperty(Platform, 'OS', 'android');
    mockBadge = 1;
    expect((await tabsOf(MainTabsLayout, true))[4]?.spoken).toBe('Tu, 1 noutate');
  });

  it('labels the Ask Chef pill in Romanian', async () => {
    await render(<AskChefAction />);
    expect(screen.getByText('Întreabă bucătarul')).toBeOnTheScreen();
    expect(screen.getByLabelText('Întreabă bucătarul')).toBeOnTheScreen();
  });

  it('writes the Today card’s gauge captions and macro names in Romanian', async () => {
    await render(
      <NumbersModeProvider mode="FULL">
        <NutritionCard
          eatenKcal={900}
          targetKcal={2000}
          protein={{ value: 72, target: 120 }}
          carbs={{ value: 100, target: 220 }}
          fat={{ value: 80, target: 70 }}
          proteinOnly={false}
        />
      </NumbersModeProvider>,
    );
    expect(screen.getByText('kcal mâncate')).toBeOnTheScreen();
    expect(screen.getByText('rămase')).toBeOnTheScreen();
    expect(screen.getByText('obiectiv')).toBeOnTheScreen();
    expect(screen.getByLabelText('900 din 2.000 kcal mâncate, 1.100 rămase')).toBeOnTheScreen();
    expect(screen.getByText('Proteine')).toBeOnTheScreen();
    expect(screen.getByText('Carbohidrați')).toBeOnTheScreen();
    expect(screen.getByText('10 g în plus')).toBeOnTheScreen();
    expect(screen.getByLabelText('Proteine, 72 din 120 de grame')).toBeOnTheScreen();
    expect(screen.getByLabelText('Grăsimi, 80 din 70 de grame, 10 în plus')).toBeOnTheScreen();
  });

  it('says „în plus” over target, and uses the few-form for small amounts', async () => {
    const { t } = getTranslator();
    const { caption, labels } = calorieGaugeLabels(t);
    await render(
      <CalorieGauge testID="g" value={2300} target={2100} caption={caption} labels={labels} />,
    );
    expect(screen.getByText('în plus')).toBeOnTheScreen();
    expect(screen.getByTestId('g').props.accessibilityLabel).toBe(
      '2.300 din 2.100 kcal mâncate, 200 în plus',
    );
    await render(<MacroTiles protein={12} carbs={230} fat={1} labels={macroLabels(t)} />);
    expect(screen.getByLabelText('Proteine, 12 grame')).toBeOnTheScreen();
    expect(screen.getByLabelText('Carbohidrați, 230 de grame')).toBeOnTheScreen();
    expect(screen.getByLabelText('Grăsimi, 1 gram')).toBeOnTheScreen();
  });
});

describe('shell chrome in English', () => {
  beforeEach(() => resetLocaleForTests(['en-US']));

  it('keeps the English tab names and gauge words', async () => {
    const tabs = await tabsOf(MainTabsLayout, true);
    expect(tabs.map((tab) => tab.title)).toEqual(['Shop', 'Meals', 'Today', 'Train', 'You']);
    const { t } = getTranslator();
    const { caption, labels } = calorieGaugeLabels(t);
    await render(
      <CalorieGauge testID="g" value={560} target={2100} caption={caption} labels={labels} />,
    );
    expect(screen.getByTestId('g').props.accessibilityLabel).toBe(
      '560 of 2,100 kcal eaten, 1,540 left',
    );
  });
});
