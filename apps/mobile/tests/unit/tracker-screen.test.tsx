import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
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
const mockUpdateRecipeEntry = jest.fn();
const mockRecordRebalance = jest.fn();
const mockSnackbarShow = jest.fn();
// Audit P2-4 follow-up: per-test training-day fields on the getDay payload.
let mockDayExtras: Record<string, unknown> = {};
let mockCopiedIds: string[] = ['c1', 'c2'];

// ─── A tiny stand-in for the server and react-query's cache ────────────────────
// `mockServer` is the database; `mockCache` is what `tracker.getDay` returns.
// Optimistic edits (`setData`) change only the cache; `invalidate` re-reads the
// server — exactly the shape the screen relies on (UX-FOOD-01/06).
type MockEntry = Record<string, unknown> & { entryId?: string; recipeId?: string };
type MockDay = Record<string, unknown> & {
  plannedMeals: Record<string, unknown>[];
  offPlanLogged: Record<string, unknown>[];
  log: { loggedMeals: MockEntry[] } | null;
};
let mockServer: MockDay;
let mockCache: MockDay;
let mockFailWrites = false;
let mockCopyDayError: Error | null = null;
const mockListeners = new Set<() => void>();
const mockSetCache = (next: MockDay) => {
  mockCache = next;
  mockListeners.forEach((l) => l());
};
const mockSubscribe = (l: () => void) => {
  mockListeners.add(l);
  return () => {
    mockListeners.delete(l);
  };
};
let mockEntrySeq = 0;
const mockStore = (loggedMeals: MockEntry[]) => {
  const sum = (k: string) => loggedMeals.reduce((t, m) => t + Number(m[k] ?? 0), 0);
  mockServer = {
    ...mockServer,
    log: loggedMeals.length
      ? {
          loggedMeals,
          totalKcal: sum('kcal'),
          totalProtein: sum('protein'),
          totalCarbs: sum('carbs'),
          totalFat: sum('fat'),
        }
      : null,
  } as MockDay;
};
/** A mutation hook that behaves like react-query's: onMutate → server → onSuccess/onError → onSettled. */
function mockMutation(serverWrite: (vars: never) => unknown) {
  return (opts: Record<string, ((...args: unknown[]) => unknown) | undefined> = {}) => ({
    isPending: false,
    isError: false,
    error: null,
    reset: jest.fn(),
    mutate: (
      vars: never,
      callbacks: Record<string, ((...args: unknown[]) => unknown) | undefined> = {},
    ) => {
      void (async () => {
        const context = await opts.onMutate?.(vars);
        try {
          if (mockFailWrites) throw new Error('Network request failed');
          const result = serverWrite(vars);
          await opts.onSuccess?.(result, vars, context);
          callbacks.onSuccess?.(result, vars, context);
        } catch (error) {
          opts.onError?.(error, vars, context);
          callbacks.onError?.(error, vars, context);
        } finally {
          opts.onSettled?.(undefined, null, vars, context);
        }
      })();
    },
  });
}

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

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  const { useSyncExternalStore } = require('react') as typeof import('react');
  return {
    trpc: {
      useUtils: () => ({
        tracker: {
          getDay: {
            cancel: () => Promise.resolve(),
            getData: () => mockCache,
            setData: (_input: unknown, next: MockDay | ((prev: MockDay) => MockDay)) =>
              mockSetCache(typeof next === 'function' ? next(mockCache) : next),
            // A refetch: the cache catches up with the server.
            invalidate: () => {
              mockSetCache(mockServer);
              return Promise.resolve();
            },
          },
          weeklySummary: { invalidate: jest.fn() },
          monthlySummary: { invalidate: jest.fn() },
          recents: { invalidate: jest.fn() },
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
            data: useSyncExternalStore(mockSubscribe, () => mockCache),
            isLoading: false,
            isError: false,
            refetch: jest.fn(),
          }),
        },
        recents: { useQuery: () => ({ data: [] }) },
        logRecipe: {
          useMutation: mockMutation((vars: Record<string, unknown>) => {
            mockLogRecipe(vars);
            const planned = mockServer.plannedMeals.find((m) => m.recipeId === vars.recipeId);
            const p = Number(vars.portionMultiplier ?? 1);
            const rest = (mockServer.log?.loggedMeals ?? []).filter(
              (m) => !(m.recipeId === vars.recipeId && m.mealType === vars.mealType),
            );
            mockStore([
              ...rest,
              {
                entryId: `srv-${(mockEntrySeq += 1)}`,
                recipeId: vars.recipeId as string,
                mealType: vars.mealType,
                ...(vars.slotIndex !== undefined && { slotIndex: vars.slotIndex }),
                portionMultiplier: p,
                kcal: Math.round(Number(planned?.kcal ?? 0) * p),
                protein: Number(planned?.protein ?? 0) * p,
                carbs: Number(planned?.carbs ?? 0) * p,
                fat: Number(planned?.fat ?? 0) * p,
              },
            ]);
            return { log: {}, rebalance };
          }),
        },
        unlogRecipe: {
          useMutation: mockMutation((vars: Record<string, unknown>) => {
            mockUnlogRecipe(vars);
            mockStore(
              (mockServer.log?.loggedMeals ?? []).filter(
                (m) => !(m.recipeId === vars.recipeId && m.mealType === vars.mealType),
              ),
            );
            return {};
          }),
        },
        copyDay: {
          useMutation: () => ({
            mutate: (vars: unknown, callbacks?: { onSuccess?: (data: unknown) => void }) => {
              mockCopyDay(vars);
              callbacks?.onSuccess?.({ log: {}, copiedEntryIds: mockCopiedIds, rebalance });
            },
            reset: jest.fn(),
            isPending: false,
            isError: mockCopyDayError !== null,
            error: mockCopyDayError,
          }),
        },
        deleteEntries: {
          useMutation: mockMutation((vars: { entryIds: string[] }) => {
            mockDeleteEntries(vars);
            mockStore(
              (mockServer.log?.loggedMeals ?? []).filter(
                (m) => !m.entryId || !vars.entryIds.includes(m.entryId),
              ),
            );
            mockServer = {
              ...mockServer,
              offPlanLogged: mockServer.offPlanLogged.filter(
                (o) => !vars.entryIds.includes(o.entryId as string),
              ),
            };
            return {};
          }),
        },
        deleteCustomMeal: {
          useMutation: mockMutation((vars: { entryId?: string; entryIndex?: number }) => {
            mockDeleteCustom(vars);
            mockStore(
              (mockServer.log?.loggedMeals ?? []).filter((m, i) =>
                vars.entryId ? m.entryId !== vars.entryId : i !== vars.entryIndex,
              ),
            );
            return {};
          }),
        },
        restoreCustomMeal: {
          useMutation: mockMutation((vars: { entry: MockEntry }) => {
            mockRestoreCustom(vars);
            mockStore([...(mockServer.log?.loggedMeals ?? []), vars.entry]);
            return {};
          }),
        },
        updateRecipeEntry: {
          useMutation: mockMutation((vars: Record<string, unknown>) => {
            mockUpdateRecipeEntry(vars);
            return {};
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
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const baseDay = (): MockDay => ({
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
});

async function renderTracker() {
  mockServer = baseDay();
  mockCache = mockServer;
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <TrackerScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDayExtras = {};
  mockCopiedIds = ['c1', 'c2'];
  mockFailWrites = false;
  mockCopyDayError = null;
  mockListeners.clear();
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
    await waitFor(() =>
      expect(mockLogRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
          date: expect.any(String),
          recipeId: 'r1',
          mealType: 'breakfast',
          portionMultiplier: 1,
        }),
      ),
    );
    await waitFor(() =>
      expect(mockSnackbarShow).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Logged breakfast', actionLabel: 'Undo' }),
      ),
    );
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
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
    await waitFor(() =>
      expect(mockUnlogRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'r1', mealType: 'breakfast' }),
      ),
    );
  });

  it('logs a planned meal at its plan portion by default (P1-1)', async () => {
    const user = userEvent.setup();
    await renderTracker();
    expect(screen.getByText(/750 kcal · plan 1¼×/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('tracker-meal-lunch'));
    await waitFor(() =>
      expect(mockLogRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'r2', portionMultiplier: 1.25 }),
      ),
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
  // UX-FOOD-25: "Copied 1 entries" / "Copied 0 entries".
  it('UX-FOOD-25: pluralises the confirmation and never says "Copied 0 entries"', async () => {
    const user = userEvent.setup();
    mockCopiedIds = ['c1'];
    await renderTracker();
    await user.press(screen.getByTestId('tracker-copy-day'));
    await user.press(screen.getByTestId('tracker-copy-day-confirm-confirm'));
    expect(mockSnackbarShow).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Copied 1 entry' }),
    );

    mockCopiedIds = [];
    await user.press(screen.getByTestId('tracker-copy-day'));
    await user.press(screen.getByTestId('tracker-copy-day-confirm-confirm'));
    const [last] = mockSnackbarShow.mock.calls.at(-1) as [
      { message: string; actionLabel?: string },
    ];
    expect(last.message).toMatch(/^Nothing to copy from/);
    expect(last.actionLabel).toBeUndefined();
  });

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
    await act(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- jest matchers/mocks are typed any
      mockSnackbarShow.mock.calls[0]?.[0]?.onAction?.();
    });
    await waitFor(() =>
      expect(mockDeleteEntries).toHaveBeenCalledWith(
        expect.objectContaining({ entryIds: ['c1', 'c2'] }),
      ),
    );
  });
});

describe('TrackerScreen — copy a day failing (UX-X-13)', () => {
  it('keeps the confirm sheet open with the reason instead of closing silently', async () => {
    mockCopyDayError = new Error('Something went wrong. Please try again.');
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-copy-day'));
    expect(screen.getByTestId('tracker-copy-day-confirm-error')).toHaveTextContent(
      "Couldn't copy the day. Something went wrong. Please try again.",
    );
    expect(screen.getByTestId('tracker-copy-day-confirm-confirm')).toBeOnTheScreen();
  });
});

// UX-FOOD-25: off-plan recipes and custom entries were two stacked "Also eaten"
// sections that lost the meal slot (and the custom rows sat under the Snap card).
describe('TrackerScreen — one "Also eaten" list grouped by meal (UX-FOOD-25)', () => {
  const offPlan = {
    entryId: 'o1',
    recipeId: 'pad-thai',
    mealType: 'dinner',
    portionMultiplier: 1,
    kcal: 603,
    protein: 20,
    carbs: 80,
    fat: 20,
  };
  const shake = {
    entryId: 'e1',
    custom: { name: 'Protein shake', estimatedBy: 'manual' },
    mealType: 'snack',
    portionMultiplier: 1,
    kcal: 180,
    protein: 30,
    carbs: 5,
    fat: 2,
  };
  const toast = {
    entryId: 'e2',
    custom: { name: 'Toast', estimatedBy: 'manual' },
    mealType: 'breakfast',
    portionMultiplier: 1,
    kcal: 150,
    protein: 5,
    carbs: 25,
    fat: 3,
  };

  it('renders a single header with a group per meal, in day order, above the log buttons', async () => {
    mockDayExtras = {
      plannedMeals: [],
      hasActivePlan: true,
      offPlanLogged: [{ ...offPlan, recipeName: 'Tofu Pad Thai' }],
      log: {
        loggedMeals: [offPlan, shake, toast],
        totalKcal: 933,
        totalProtein: 55,
        totalCarbs: 110,
        totalFat: 25,
      },
    };
    await renderTracker();
    expect(screen.getAllByText('Also eaten')).toHaveLength(1);
    expect(screen.getByTestId('tracker-also-eaten-breakfast')).toBeOnTheScreen();
    expect(screen.getByTestId('tracker-also-eaten-dinner')).toBeOnTheScreen();
    expect(screen.getByTestId('tracker-also-eaten-snack')).toBeOnTheScreen();
    // the custom rows are inside their meal's group, not in a second section
    expect(screen.getByTestId('tracker-also-eaten-breakfast')).toContainElement(
      screen.getByTestId('tracker-custom-2'),
    );
    expect(screen.getByTestId('tracker-also-eaten-dinner')).toContainElement(
      screen.getByTestId('tracker-off-plan-o1'),
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

  it('the bin deletes immediately by entryId and offers Undo that restores it exactly (AC2)', async () => {
    mockDayExtras = withCustomEntry;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByLabelText('Delete Protein shake'));
    // UX-FOOD-17: the stable id is sent, with the index only as the old fallback.
    await waitFor(() =>
      expect(mockDeleteCustom).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
        date: expect.any(String),
        entryId: 'e1',
        entryIndex: 0,
      }),
    );
    await waitFor(() =>
      expect(mockSnackbarShow).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Deleted Protein shake', actionLabel: 'Undo' }),
      ),
    );
    expect(screen.queryByTestId('tracker-custom-0')).not.toBeOnTheScreen();
    await act(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- jest matchers/mocks are typed any
      mockSnackbarShow.mock.calls[0]?.[0]?.onAction?.();
    });
    await waitFor(() =>
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
      }),
    );
    // The restored row is back on screen.
    await waitFor(() => expect(screen.getByTestId('tracker-custom-0')).toBeOnTheScreen());
  });

  it('a failed delete puts the entry back and says why (UX-FOOD-06)', async () => {
    mockDayExtras = withCustomEntry;
    mockFailWrites = true;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByLabelText('Delete Protein shake'));
    await waitFor(() =>
      expect(mockSnackbarShow).toHaveBeenCalledWith(errorSnackbar("Couldn't delete that entry.")),
    );
    expect(screen.getByTestId('tracker-custom-0')).toBeOnTheScreen();
    // Not the green "Deleted … · Undo" success.
    expect(mockSnackbarShow).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Deleted Protein shake' }),
    );
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
    await waitFor(() => expect(ticks()).toEqual([false, true]));
    await waitFor(() =>
      expect(mockLogRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'yog', slotIndex: 3 }),
      ),
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

// ─── UX-FOOD-01 / UX-FOOD-06: ticks follow the server, failures revert ─────────

/** A snackbar error: exactly `{ message }`, the message starting with `start`. */
const errorSnackbar = (start: string) => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers are typed any
  message: expect.stringContaining(start),
});
const tickOf = (testID: string): boolean | undefined =>
  (screen.getByTestId(testID).props as { accessibilityState?: { checked?: boolean } })
    .accessibilityState?.checked;
const snackbarCall = (message: string) =>
  (mockSnackbarShow.mock.calls as [{ message: string; onAction?: () => void }][])
    .map((c) => c[0])
    .find((c) => c.message === message);

describe('TrackerScreen — ticks follow the server (UX-FOOD-01)', () => {
  it('Undo unticks the row and takes the meal out of the totals', async () => {
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    await waitFor(() => expect(snackbarCall('Logged breakfast')).toBeDefined());
    expect(tickOf('tracker-meal-breakfast')).toBe(true);
    expect(screen.getByText('400 / 2000')).toBeOnTheScreen();

    await act(() => {
      snackbarCall('Logged breakfast')?.onAction?.();
    });
    await waitFor(() => expect(tickOf('tracker-meal-breakfast')).toBe(false));
    expect(screen.getByText('0 / 2000')).toBeOnTheScreen();
    expect(mockUnlogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1', mealType: 'breakfast' }),
    );
  });

  it('"Removed … Undo" ticks the row again', async () => {
    mockDayExtras = {
      log: {
        loggedMeals: [
          {
            entryId: 'e1',
            recipeId: 'r1',
            mealType: 'breakfast',
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
    expect(tickOf('tracker-meal-breakfast')).toBe(true);
    mockServer = { ...mockServer, log: mockCache.log }; // the fake server holds the same log
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    await waitFor(() => expect(snackbarCall('Removed breakfast')).toBeDefined());
    expect(tickOf('tracker-meal-breakfast')).toBe(false);

    await act(() => {
      snackbarCall('Removed breakfast')?.onAction?.();
    });
    await waitFor(() => expect(tickOf('tracker-meal-breakfast')).toBe(true));
  });

  it('a meal logged elsewhere (Today, the Log sheet) shows ticked without a remount', async () => {
    await renderTracker();
    expect(tickOf('tracker-meal-lunch')).toBe(false);
    // Another surface logs lunch; the day query refetches.
    await act(() => {
      mockSetCache({
        ...mockCache,
        log: {
          loggedMeals: [
            {
              entryId: 'other',
              recipeId: 'r2',
              mealType: 'lunch',
              portionMultiplier: 1.25,
              kcal: 750,
              protein: 50,
              carbs: 75,
              fat: 25,
            },
          ],
        },
      });
    });
    expect(tickOf('tracker-meal-lunch')).toBe(true);
    expect(screen.getByText('750 / 2000')).toBeOnTheScreen();
  });
});

describe('TrackerScreen — failed writes revert and say so (UX-FOOD-06)', () => {
  it('a failed tick unticks the row, shows the reason, and never shows "Logged"', async () => {
    mockFailWrites = true;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    await waitFor(() =>
      expect(mockSnackbarShow).toHaveBeenCalledWith(errorSnackbar("Couldn't log breakfast.")),
    );
    // The friendly network line, not the raw transport error.
    expect(
      snackbarCall(
        "Couldn't log breakfast. Can't reach Chefer right now. Check your connection and try again.",
      ),
    ).toBeDefined();
    expect(tickOf('tracker-meal-breakfast')).toBe(false);
    expect(screen.getByText('0 / 2000')).toBeOnTheScreen();
    expect(snackbarCall('Logged breakfast')).toBeUndefined();
  });

  it('a failed untick keeps the row ticked', async () => {
    mockDayExtras = {
      log: {
        loggedMeals: [
          {
            entryId: 'e1',
            recipeId: 'r1',
            mealType: 'breakfast',
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
    mockFailWrites = true;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-meal-breakfast'));
    await waitFor(() =>
      expect(mockSnackbarShow).toHaveBeenCalledWith(errorSnackbar("Couldn't remove breakfast.")),
    );
    expect(tickOf('tracker-meal-breakfast')).toBe(true);
    expect(snackbarCall('Removed breakfast')).toBeUndefined();
  });
});

// ─── UX-FOOD-03: off-plan rows are editable and removable ──────────────────────

describe('TrackerScreen — "Also eaten" recipe rows (UX-FOOD-03)', () => {
  const offPlanEntry = {
    entryId: 'o1',
    recipeId: 'pad-thai',
    mealType: 'dinner',
    portionMultiplier: 1,
    kcal: 603,
    protein: 20,
    carbs: 80,
    fat: 20,
  };
  const withOffPlan = {
    plannedMeals: [],
    hasActivePlan: true,
    offPlanLogged: [{ ...offPlanEntry, recipeName: 'Tofu Pad Thai' }],
    log: {
      loggedMeals: [offPlanEntry],
      totalKcal: 603,
      totalProtein: 20,
      totalCarbs: 80,
      totalFat: 20,
    },
  };

  it('tapping the row opens an editor, and Save sends the new portion by entryId', async () => {
    mockDayExtras = withOffPlan;
    const user = userEvent.setup();
    await renderTracker();
    await user.press(screen.getByTestId('tracker-off-plan-o1'));
    expect(screen.getByTestId('edit-recipe-entry-sheet-title')).toHaveTextContent('Edit meal');
    await user.press(screen.getByTestId('edit-recipe-entry-portion-2'));
    await user.press(screen.getByTestId('edit-recipe-entry-save'));
    await waitFor(() =>
      expect(mockUpdateRecipeEntry).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
        date: expect.any(String),
        entryId: 'o1',
        portionMultiplier: 2,
        mealType: 'dinner',
      }),
    );
  });

  it('the bin removes it with Undo, and the totals follow', async () => {
    mockDayExtras = withOffPlan;
    const user = userEvent.setup();
    await renderTracker();
    expect(screen.getByText('603 / 2000')).toBeOnTheScreen();
    await user.press(screen.getByLabelText('Delete Tofu Pad Thai'));
    await waitFor(() =>
      expect(mockDeleteEntries).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest matchers/mocks are typed any
        date: expect.any(String),
        entryIds: ['o1'],
      }),
    );
    await waitFor(() => expect(snackbarCall('Deleted Tofu Pad Thai')).toBeDefined());
    expect(screen.queryByTestId('tracker-off-plan-o1')).not.toBeOnTheScreen();
    expect(screen.getByText('0 / 2000')).toBeOnTheScreen();

    await act(() => {
      snackbarCall('Deleted Tofu Pad Thai')?.onAction?.();
    });
    // Undo re-logs the same recipe, meal and portion.
    await waitFor(() =>
      expect(mockLogRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
          recipeId: 'pad-thai',
          mealType: 'dinner',
          portionMultiplier: 1,
        }),
      ),
    );
  });
});
