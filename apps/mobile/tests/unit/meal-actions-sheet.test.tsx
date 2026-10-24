import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { MealActionsSheet } from '../../src/features/tracker/meal-actions-sheet';

// Lane A2: save one meal of the day under a name, or copy it to another day
// and/or meal with an Undo that deletes exactly the copies.

const mockCreate = jest.fn();
const mockCopy = jest.fn();
const mockUndo = jest.fn();
const mockSnackbarShow = jest.fn<undefined, [unknown]>();
const mockTrack = jest.fn<undefined, unknown[]>();

jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return { ...actual, useSnackbar: () => ({ show: mockSnackbarShow }) };
});
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));
jest.mock('../../src/features/tracker/rebalance-offer-store', () => ({
  REBALANCE_PREVIEW: { rebalanceMode: 'preview' },
  recordRebalanceOutcome: jest.fn(),
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      savedMeals: { list: { invalidate: jest.fn() } },
      tracker: {
        getDay: { invalidate: jest.fn() },
        weeklySummary: { invalidate: jest.fn() },
        monthlySummary: { invalidate: jest.fn() },
        recents: { invalidate: jest.fn() },
      },
      dashboard: { summary: { invalidate: jest.fn() } },
    }),
    savedMeals: {
      list: { useQuery: () => ({ data: [] }) },
      createFromDay: {
        useMutation: () => ({
          isPending: false,
          error: null,
          reset: jest.fn(),
          mutate: (vars: { name: string }, cb?: { onSuccess?: (d: unknown) => void }) => {
            mockCreate(vars);
            cb?.onSuccess?.({ id: 's1', name: vars.name, items: [{}, {}], totals: {} });
          },
        }),
      },
      delete: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    tracker: {
      copyMeal: {
        useMutation: () => ({
          isPending: false,
          isError: false,
          mutate: (vars: unknown, cb?: { onSuccess?: (d: unknown) => void }) => {
            mockCopy(vars);
            cb?.onSuccess?.({ log: {}, copiedEntryIds: ['c1', 'c2'], rebalance: null });
          },
        }),
      },
      deleteEntries: {
        useMutation: () => ({
          mutate: (v: unknown) => {
            mockUndo(v);
          },
        }),
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const onClose = jest.fn();

async function renderSheet(loggedMealTypes: string[]) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MealActionsSheet
        visible
        onClose={onClose}
        date="2026-10-22"
        loggedMealTypes={loggedMealTypes}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('MealActionsSheet (lane A2)', () => {
  it('opens on the first meal with entries and saves it under a name', async () => {
    const user = userEvent.setup();
    await renderSheet(['lunch', 'lunch', 'dinner']);
    expect(screen.getByTestId('meal-actions-count')).toHaveTextContent('2 entries logged');
    await user.type(screen.getByTestId('meal-actions-name'), 'Office lunch');
    await user.press(screen.getByTestId('meal-actions-save'));
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'Office lunch',
      date: '2026-10-22',
      mealType: 'lunch',
    });
    expect(mockTrack).toHaveBeenCalledWith('saved_meal_created', { itemCount: 2 });
  });

  it('copies the meal to another meal and offers an Undo of exactly the copies', async () => {
    const user = userEvent.setup();
    await renderSheet(['lunch']);
    await user.press(screen.getByTestId('meal-actions-to-meal-dinner'));
    await user.press(screen.getByTestId('meal-actions-copy'));
    expect(mockCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: '2026-10-22',
        fromMealType: 'lunch',
        toMealType: 'dinner',
      }),
    );
    const snack = mockSnackbarShow.mock.calls.at(-1)?.[0] as {
      message: string;
      onAction: () => void;
    };
    expect(snack.message).toMatch(/^Copied 2 entries to dinner/);
    snack.onAction();
    expect(mockUndo).toHaveBeenCalledWith(expect.objectContaining({ entryIds: ['c1', 'c2'] }));
  });

  it('with nothing logged for the meal, both actions are disabled', async () => {
    await renderSheet([]);
    expect(screen.getByTestId('meal-actions-count')).toHaveTextContent(/Nothing logged/);
    expect(screen.getByTestId('meal-actions-save')).toBeDisabled();
    expect(screen.getByTestId('meal-actions-copy')).toBeDisabled();
  });
});
