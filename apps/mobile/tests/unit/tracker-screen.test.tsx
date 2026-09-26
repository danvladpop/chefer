import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import TrackerScreen from '../../app/tracker';

// P1-7: the tracker opens Quick add, shows the rebalance banner on the
// logging surface, and hands every log's rebalance result to the store.

const mockUpsert = jest.fn();
const mockRecordRebalance = jest.fn();
const mockUpsertOpts: { onSuccess?: (data: unknown) => void } = {};

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

beforeEach(() => jest.clearAllMocks());

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
});
