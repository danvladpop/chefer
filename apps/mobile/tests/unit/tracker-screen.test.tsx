import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import TrackerScreen from '../../app/tracker';

// T-19.1–T-19.4 (UX-19): the search-first Log sheet, edit/undo and the
// one-save model. The rebalance banner shows on the logging surface, and
// every log hands its rebalance result to the store.

const mockLogRecipe = jest.fn();
const mockUnlogRecipe = jest.fn();
const mockCopyDay = jest.fn();
const mockDeleteEntries = jest.fn();
const mockDeleteCustom = jest.fn();
const mockRestoreCustom = jest.fn();
const mockRecordRebalance = jest.fn();
const mockSnackbarShow = jest.fn();
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

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return {
    ...actual,
    useSnackbar: () => ({ show: mockSnackbarShow }),
  };
});

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: jest.fn() },
        weeklySummary: { invalidate: jest.fn() },
        monthlySummary: { invalidate: jest.fn() },
      },
      dashboard: { summary: { invalidate: jest.fn() } },
      targets: { changes: { invalidate: jest.fn() }, get: { invalidate: jest.fn() } },
    }),
    // §2.11 — ChangeNoticeCard/TargetExplainSheet's queries, not under test here.
    targets: {
      changes: { useQuery: () => ({ data: [] }) },
      get: { useQuery: () => ({ data: undefined }) },
      acknowledgeChange: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    recipe: { list: { useQuery: () => ({ data: [] }) } },
    ingredients: { search: { useQuery: () => ({ data: [] }) } },
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
            // Last, so a test can replace plannedMeals / log too.
            ...mockDayExtras,
          },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        }),
      },
      recents: { useQuery: () => ({ data: [] }) },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            mockLogRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
          isPending: false,
        }),
      },
      unlogRecipe: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockUnlogRecipe(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      copyDay: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: (data: unknown) => void }) => {
            mockCopyDay(vars);
            callbacks?.onSuccess?.({ log: {}, copiedEntryIds: ['c1', 'c2'], rebalance });
          },
          isPending: false,
        }),
      },
      deleteEntries: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockDeleteEntries(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      deleteCustomMeal: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: () => void }) => {
            mockDeleteCustom(vars);
            callbacks?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      restoreCustomMeal: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockRestoreCustom(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      updateCustomMeal: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
      },
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

describe('TrackerScreen — one-save model (bug B-23, T-19.4)', () => {
  it('opens the Log sheet from the tracker', async () => {
    const user = userEvent.setup();
    await renderTracker();
    expect(screen.queryByTestId('log-sheet-title')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('tracker-quick-add'));
    expect(screen.getByTestId('log-sheet-title')).toHaveTextContent('Log something');
  });

  it('shows the rebalance banner where the log happens', async () => {
    await renderTracker();
    expect(screen.getByTestId('rebalance-banner-stub')).toBeOnTheScreen();
  });

  it('there is no Save Day button', async () => {
    await renderTracker();
    expect(screen.queryByTestId('tracker-save')).not.toBeOnTheScreen();
  });

  it('bug B-23: ticking a planned meal saves it immediately, with an Undo snackbar', async () => {
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    expect(mockLogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
        date: expect.any(String),
        recipeId: 'r1',
        mealType: 'breakfast',
        portionMultiplier: 1,
      }),
    );
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Logged breakfast', actionLabel: 'Undo' }),
    );
  });

  it('bug B-23: unticking a logged planned meal removes it immediately, no separate save', async () => {
    mockDayExtras = {
      log: {
        loggedMeals: [
          {
            recipeId: 'r1',
            mealType: 'breakfast',
            slotIndex: 0,
            portionMultiplier: 1,
            kcal: 400,
            protein: 20,
            carbs: 50,
            fat: 10,
          },
        ],
        totalKcal: 400,
        totalProtein: 20,
        totalCarbs: 50,
        totalFat: 10,
      },
    };
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    expect(mockUnlogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1', mealType: 'breakfast' }),
    );
  });

  it('logs a planned meal at its plan portion by default (P1-1)', async () => {
    const user = userEvent.setup();
    await renderTracker();
    expect(screen.getByText(/750 kcal · plan 1¼×/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('tracker-meal-lunch'));
    expect(mockLogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r2', portionMultiplier: 1.25 }),
    );
  });

  // T-19.6: a Track-only user may never generate a plan — the empty state
  // reads as an invitation to log, not a missing-plan error.
  it('bug/T-19.6: no active plan reads as an invitation to log', async () => {
    mockDayExtras = { plannedMeals: [], hasActivePlan: false };
    await renderTracker();
    expect(screen.getByTestId('tracker-empty-plan-text')).toHaveTextContent(
      'No plan today — log from Recent or search below.',
    );
  });

  it('T-19.6: an active plan with nothing scheduled today keeps the old copy', async () => {
    mockDayExtras = { plannedMeals: [], hasActivePlan: true };
    await renderTracker();
    expect(screen.getByTestId('tracker-empty-plan-text')).toHaveTextContent(
      'No planned meals for this day.',
    );
  });
});

describe('TrackerScreen — copy a day (T-19.3)', () => {
  it('confirms, then copies the previous day onto this one, with an Undo', async () => {
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-copy-day'));
    await user.press(screen.getByTestId('tracker-copy-day-confirm-confirm'));
    expect(mockCopyDay).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
      expect.objectContaining({ toDate: expect.any(String) }),
    );
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Copied 2 entries', actionLabel: 'Undo' }),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- jest matchers/mocks are typed any
    mockSnackbarShow.mock.calls[0]?.[0]?.onAction?.();
    expect(mockDeleteEntries).toHaveBeenCalledWith(
      expect.objectContaining({ entryIds: ['c1', 'c2'] }),
    );
  });
});

describe('TrackerScreen — edit/undo a custom entry (bug B-34, T-19.2)', () => {
  const withCustomEntry = {
    plannedMeals: [],
    hasActivePlan: true,
    log: {
      loggedMeals: [
        {
          entryId: 'e1',
          custom: { name: 'Protein shake', estimatedBy: 'manual' },
          mealType: 'snack',
          portionMultiplier: 1,
          kcal: 180,
          protein: 30,
          carbs: 5,
          fat: 2,
        },
      ],
      totalKcal: 180,
      totalProtein: 30,
      totalCarbs: 5,
      totalFat: 2,
    },
  };

  it('tapping a custom entry opens Edit entry', async () => {
    mockDayExtras = withCustomEntry;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-custom-0'));
    expect(screen.getByTestId('edit-entry-sheet-title')).toHaveTextContent('Edit entry');
    expect(screen.getByTestId('edit-entry-name')).toHaveProp('value', 'Protein shake');
  });

  it('the bin deletes immediately and offers Undo that restores it exactly (AC2)', async () => {
    mockDayExtras = withCustomEntry;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByLabelText('Delete Protein shake'));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
    expect(mockDeleteCustom).toHaveBeenCalledWith({ date: expect.any(String), entryIndex: 0 });
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Deleted Protein shake', actionLabel: 'Undo' }),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- jest matchers/mocks are typed any
    mockSnackbarShow.mock.calls[0]?.[0]?.onAction?.();
    expect(mockRestoreCustom).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
      date: expect.any(String),
      entry: {
        entryId: 'e1',
        custom: { name: 'Protein shake', estimatedBy: 'manual' },
        mealType: 'snack',
        portionMultiplier: 1,
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
      },
    });
  });
});

describe('TrackerScreen — two identical snacks', () => {
  const snack = (slotIndex: number) => ({
    recipeId: 'yog',
    recipeName: 'Greek Yogurt',
    mealType: 'snack',
    imageUrl: null,
    kcal: 150,
    protein: 15,
    carbs: 10,
    fat: 5,
    slotIndex,
  });
  const logged = (slotIndex?: number) => ({
    recipeId: 'yog',
    mealType: 'snack',
    ...(slotIndex !== undefined && { slotIndex }),
    portionMultiplier: 1,
    kcal: 150,
    protein: 15,
    carbs: 10,
    fat: 5,
  });
  const ticks = () =>
    screen
      .getAllByTestId('tracker-meal-snack')
      .map(
        (row) =>
          (row.props as { accessibilityState?: { checked?: boolean } }).accessibilityState?.checked,
      );

  it('ticking one snack leaves the other unticked and saves only its slot', async () => {
    mockDayExtras = { plannedMeals: [snack(1), snack(3)] };
    const user = userEvent.setup();
    await renderTracker();
    const [, secondSnack] = screen.getAllByTestId('tracker-meal-snack');
    if (!secondSnack) throw new Error('expected two snack rows');
    await user.press(secondSnack);
    expect(ticks()).toEqual([false, true]);
    expect(mockLogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'yog', slotIndex: 3 }),
    );
  });

  it('a logged entry with a slotIndex ticks only its own slot', async () => {
    mockDayExtras = {
      plannedMeals: [snack(1), snack(3)],
      log: {
        loggedMeals: [logged(3)],
        totalKcal: 150,
        totalProtein: 15,
        totalCarbs: 10,
        totalFat: 5,
      },
    };
    await renderTracker();
    expect(ticks()).toEqual([false, true]);
  });

  it('a legacy entry without a slotIndex ticks the first snack only', async () => {
    mockDayExtras = {
      plannedMeals: [snack(1), snack(3)],
      log: {
        loggedMeals: [logged()],
        totalKcal: 150,
        totalProtein: 15,
        totalCarbs: 10,
        totalFat: 5,
      },
    };
    await renderTracker();
    expect(ticks()).toEqual([true, false]);
  });
});
