import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import TrackerScreen from '../../app/tracker';

// P1-7: the tracker opens Quick add, shows the rebalance banner on the
// logging surface, and hands every log's rebalance result to the store.

const mockUpsert = jest.fn();
const mockRecordRebalance = jest.fn();
const mockUpsertOpts: { onSuccess?: (data: unknown) => void } = {};
// Audit P2-4 follow-up: per-test training-day fields on the getDay payload.
let mockDayExtras: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('../../src/features/tracker/scan-meal-card', () => ({ ScanMealCard: () => null }));
jest.mock('../../src/features/tracker/rebalance-banner', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  const { Text } = require('react-native') as typeof import('react-native');
  return { RebalanceBanner: () => <Text testID="rebalance-banner-stub">banner</Text> };
});
jest.mock('../../src/features/tracker/rebalance-store', () => ({
  recordRebalance: (result: unknown) => {
    mockRecordRebalance(result);
  },
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { getDay: { invalidate: jest.fn() }, weeklySummary: { invalidate: jest.fn() } },
      dashboard: { summary: { invalidate: jest.fn() } },
    }),
    tracker: {
      getDay: {
        useQuery: () => ({
          data: {
            log: null,
            offPlanLogged: [],
            targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 65 },
            ...mockDayExtras,
            plannedMeals: [
              {
                recipeId: 'r1',
                recipeName: 'Overnight Oats',
                mealType: 'breakfast',
                imageUrl: null,
                kcal: 400,
                protein: 20,
                carbs: 50,
                fat: 10,
              },
              {
                // P1-1: a curated slot sized to 1¼× of the recipe
                recipeId: 'r2',
                recipeName: 'Chicken Rice Bowl',
                mealType: 'lunch',
                imageUrl: null,
                kcal: 600,
                protein: 40,
                carbs: 60,
                fat: 20,
                portion: 1.25,
              },
            ],
          },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        }),
      },
      upsertDay: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => {
          mockUpsertOpts.onSuccess = opts.onSuccess;
          return { mutate: mockUpsert, isPending: false };
        },
      },
      deleteCustomMeal: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      logCustomMeal: {
        useMutation: () => ({
          mutate: jest.fn(),
          reset: jest.fn(),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderTracker() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <TrackerScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDayExtras = {};
});

const trainingDay = (applied: boolean) => ({
  isTrainingDay: true,
  reason: 'SCHEDULED',
  workoutName: 'Full Body A',
  kcalBonus: 200,
  proteinBonus: 32,
  applied,
  basis: { bodyweightKg: 80, proteinGPerKg: 1.8, trainingDayProteinGPerKg: 2.2 },
});

describe('TrackerScreen — training-day targets (audit P2-4)', () => {
  it('premium: the line shows and the bars use the bumped targets, like Today', async () => {
    mockDayExtras = {
      trainingDay: trainingDay(true),
      adjustedTargets: { dailyCalorieTarget: 2200, proteinG: 157, carbsG: 267, fatG: 65 },
    };
    await renderTracker();
    expect(screen.getByTestId('training-day-line')).toHaveTextContent(
      'Training day · +200 kcal, +32 g protein',
    );
    expect(screen.getByText('0 / 2200')).toBeOnTheScreen();
    expect(screen.getByText('0 / 157')).toBeOnTheScreen();
    expect(screen.queryByTestId('training-day-upgrade')).not.toBeOnTheScreen();
  });

  it('free: the same line locked, base targets kept', async () => {
    mockDayExtras = { trainingDay: trainingDay(false) };
    await renderTracker();
    expect(screen.getByTestId('training-day-line')).toHaveTextContent(
      'Training day · +200 kcal, +32 g protein',
    );
    expect(screen.getByTestId('training-day-upgrade')).toBeOnTheScreen();
    expect(screen.getByText('0 / 2000')).toBeOnTheScreen();
    expect(screen.getByText('0 / 125')).toBeOnTheScreen();
  });

  it('non-lifters: no line', async () => {
    await renderTracker();
    expect(screen.queryByTestId('training-day')).not.toBeOnTheScreen();
  });
});

describe('TrackerScreen', () => {
  it('opens Quick add from the tracker', async () => {
    const user = userEvent.setup();
    await renderTracker();
    expect(screen.queryByTestId('quick-add-sheet-title')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('tracker-quick-add'));
    expect(screen.getByTestId('quick-add-sheet-title')).toHaveTextContent('Quick add');
  });

  it('shows the rebalance banner where the log happens', async () => {
    await renderTracker();
    expect(screen.getByTestId('rebalance-banner-stub')).toBeOnTheScreen();
  });

  it('hands the Save Day rebalance result to the undo store', async () => {
    // Fake timers: the "Saved ✓" flash resets on a 3s timeout.
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderTracker();
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    await user.press(screen.getByTestId('tracker-save'));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        loggedMeals: [expect.objectContaining({ recipeId: 'r1', mealType: 'breakfast' })],
      }),
    );
    const rebalance = { rebalanced: true, swaps: [], projectedDeviation: 0.2, planId: 'p' };
    await act(() => {
      mockUpsertOpts.onSuccess?.({ log: {}, rebalance });
    });
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('logs a planned meal at its plan portion by default (P1-1)', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderTracker();
    expect(screen.getByText(/750 kcal · plan 1¼×/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('tracker-meal-lunch'));
    await user.press(screen.getByTestId('tracker-save'));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        loggedMeals: [
          expect.objectContaining({
            recipeId: 'r2',
            portionMultiplier: 1.25,
            kcal: 750,
            protein: 50,
          }),
        ],
      }),
    );
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });
});
