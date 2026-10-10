import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { localDateStr } from '@chefer/utils';
import TrackerScreen from '../../app/tracker';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// 10 Oct redesign — the tracker in the new shell is "Your day" (board
// Tracker): Back + title in the top bar, the day navigator, the gauge and
// macro rows instead of the "Logged today" bars and no weekly-average line.
// The day model and writes are the old tracker's (useTrackerDay).

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/features/shell/shell-store', () => ({ useShellV2: () => true }));
jest.mock('../../src/features/tracker/scan-meal-card', () => ({ ScanMealCard: () => null }));
jest.mock('../../src/features/tracker/rebalance-offer', () => ({ RebalanceOffer: () => null }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/features/nutrition/change-notice-card', () => ({
  ChangeNoticeCard: () => null,
}));
jest.mock('../../src/features/tracker/quick-add-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    QuickAddSheet: ({ visible }: { visible: boolean }) =>
      visible ? <Text testID="quick-add-open">Log</Text> : null,
  };
});

const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');

const TODAY = localDateStr();

const planned = (
  mealType: string,
  recipeId: string,
  recipeName: string,
  kcal: number,
  i: number,
) => ({
  recipeId,
  recipeName,
  mealType,
  imageUrl: null,
  kcal,
  protein: 20,
  carbs: 40,
  fat: 10,
  slotIndex: i,
});

const day = {
  plannedMeals: [
    planned('breakfast', 'oats', 'Overnight Oats with Berries', 420, 0),
    planned('lunch', 'bowl', 'Chicken & Chickpea Bowl', 640, 1),
  ],
  log: {
    loggedMeals: [
      {
        entryId: 'e-oats',
        recipeId: 'oats',
        mealType: 'breakfast',
        slotIndex: 0,
        portionMultiplier: 1,
        kcal: 420,
        protein: 20,
        carbs: 40,
        fat: 10,
      },
      {
        entryId: 'e-flat',
        custom: { name: 'Flat white', estimatedBy: 'manual' },
        mealType: 'breakfast',
        portionMultiplier: 1,
        kcal: 140,
        protein: 8,
        carbs: 12,
        fat: 7,
      },
    ],
    totalKcal: 560,
    totalProtein: 28,
    totalCarbs: 52,
    totalFat: 17,
  },
  offPlanLogged: [],
  skippedSlots: [],
  targets: { dailyCalorieTarget: 2100, proteinG: 140, carbsG: 230, fatG: 70 },
  numbersMode: 'FULL',
  hasActivePlan: true,
};

function api() {
  const calls: Record<string, unknown[]> = {};
  const rec =
    (path: string, answer: unknown) =>
    (input: unknown): unknown => {
      (calls[path] ??= []).push(input);
      return answer;
    };
  const handlers: Handlers = {
    'tracker.getDay': () => day,
    'tracker.weeklySummary': rec('weeklySummary', { days: [] }),
    'tracker.logRecipe': rec('logRecipe', { rebalance: null }),
    'tracker.unlogRecipe': rec('unlogRecipe', {}),
  };
  return { handlers, calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

async function renderYourDay() {
  const server = api();
  const utils = await renderWithTrpc(<TrackerScreen />, server.handlers, testQueryClient());
  await screen.findByTestId('tracker-totals');
  return { ...utils, calls: server.calls };
}

describe('Your day (tracker, new shell)', () => {
  it('titles the screen "Your day" with Back, and shows today in the day navigator', async () => {
    const user = userEvent.setup();
    await renderYourDay();
    expect(screen.getByText('Your day')).toBeOnTheScreen();
    expect(screen.queryByText('Tracker')).toBeNull();
    expect(screen.getByTestId('tracker-date')).toHaveTextContent(/^Today, /);
    expect(screen.getByTestId('tracker-next-day')).toBeDisabled();
    await user.press(screen.getByTestId('shell-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows the gauge and macro rows for what was logged, not the old bars or the week line', async () => {
    const { paths } = await renderYourDay();
    expect(screen.getByTestId('tracker-totals-gauge')).toHaveProp(
      'accessibilityLabel',
      '560 of 2,100 kcal eaten, 1,540 left',
    );
    expect(screen.getByTestId('tracker-totals-protein')).toHaveProp(
      'accessibilityLabel',
      'Protein, 28 of 140 grams',
    );
    expect(screen.queryByTestId('tracker-weekly-average')).toBeNull();
    expect(screen.queryByText(/Logged today/i)).toBeNull();
    expect(paths()).not.toContain('tracker.weeklySummary');
  });

  it('lists the planned meals with their state; ticking one logs its slot', async () => {
    const user = userEvent.setup();
    const { calls } = await renderYourDay();
    expect(screen.getByTestId('tracker-tick-breakfast')).toHaveProp('accessibilityState', {
      checked: true,
    });
    expect(screen.getByTestId('tracker-tick-lunch')).toHaveProp('accessibilityState', {
      checked: false,
    });
    await user.press(screen.getByTestId('tracker-tick-lunch'));
    await waitFor(() => expect(calls.logRecipe).toHaveLength(1));
    expect(calls.logRecipe?.[0]).toMatchObject({
      date: TODAY,
      recipeId: 'bowl',
      mealType: 'lunch',
      slotIndex: 1,
      rebalanceMode: 'preview',
    });
  });

  it('keeps "Also eaten", "Log something" and the copy-day action', async () => {
    const user = userEvent.setup();
    await renderYourDay();
    expect(screen.getByTestId('tracker-also-eaten')).toHaveTextContent(/Flat white/);
    await user.press(screen.getByTestId('tracker-quick-add'));
    expect(screen.getByTestId('quick-add-open')).toBeOnTheScreen();
    await user.press(screen.getByTestId('tracker-copy-day'));
    expect(await screen.findByTestId('tracker-copy-day-confirm')).toBeOnTheScreen();
  });

  it('opens the copy-day confirm from the Add sheet deep link (copy=1)', async () => {
    mockParams = { copy: '1' };
    await renderYourDay();
    expect(await screen.findByTestId('tracker-copy-day-confirm')).toBeOnTheScreen();
  });
});
