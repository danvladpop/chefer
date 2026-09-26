import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { RebalanceSwapLike } from '@chefer/utils';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import {
  recordRebalance,
  resetRebalanceStoreForTests,
} from '../../src/features/tracker/rebalance-store';

// P1-7 / audit TRK-3: the rebalance banner shows where the log happened,
// persists across restarts, MERGES a second rebalance (F-TRK-3-2) and undo
// replays every slot's previous recipe.

const mockReplace = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { getForWeek: { invalidate: mockInvalidate } },
      dashboard: { summary: { invalidate: mockInvalidate } },
      tracker: { invalidate: mockInvalidate },
      shoppingList: { invalidate: mockInvalidate },
    }),
    mealPlan: {
      replaceRecipe: { useMutation: () => ({ mutateAsync: mockReplace }) },
    },
  },
}));

const STORAGE_KEY = 'chefer.rebalance.pending';

const swap = (over: Partial<RebalanceSwapLike> = {}): RebalanceSwapLike => ({
  dayOfWeek: 3,
  mealType: 'dinner',
  previousRecipeId: 'prev-thu',
  newRecipeId: 'new-thu',
  ...over,
});

const result = (swaps: RebalanceSwapLike[], planId = 'plan-1') => ({
  rebalanced: true,
  swaps,
  projectedDeviation: 0.2,
  planId,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockReplace.mockResolvedValue({});
  setKvBackendForTests(createMemoryKvBackend());
  resetRebalanceStoreForTests();
});

describe('RebalanceBanner', () => {
  it('renders nothing without a pending rebalance', async () => {
    await render(<RebalanceBanner />);
    expect(screen.queryByTestId('rebalance-banner')).not.toBeOnTheScreen();
  });

  it('appears as soon as a log records a rebalance, and persists it', async () => {
    await render(<RebalanceBanner />);
    await act(() => {
      recordRebalance(result([swap()]));
    });
    expect(screen.getByTestId('rebalance-banner-text')).toHaveTextContent(
      'I adjusted Thursday dinner to keep your week on track.',
    );
    expect(kv.getJSON(STORAGE_KEY)).toMatchObject({ planId: 'plan-1', swaps: [swap()] });
  });

  it('ignores a log that did not rebalance', async () => {
    recordRebalance(null);
    recordRebalance({ rebalanced: false, swaps: [], projectedDeviation: 0.02 });
    await render(<RebalanceBanner />);
    expect(screen.queryByTestId('rebalance-banner')).not.toBeOnTheScreen();
  });

  it('a second rebalance keeps the first one undoable (F-TRK-3-2)', async () => {
    recordRebalance(result([swap()]));
    recordRebalance(
      result([swap({ dayOfWeek: 4, mealType: 'lunch', previousRecipeId: 'prev-fri' })]),
    );
    const user = userEvent.setup();
    await render(<RebalanceBanner />);
    expect(screen.getByTestId('rebalance-banner-text')).toHaveTextContent(
      'I adjusted Thursday dinner and Friday lunch to keep your week on track.',
    );
    await user.press(screen.getByTestId('rebalance-undo'));
    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 3,
      mealType: 'dinner',
      recipeId: 'prev-thu',
    });
    expect(mockReplace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 4,
      mealType: 'lunch',
      recipeId: 'prev-fri',
    });
    expect(screen.queryByTestId('rebalance-banner')).not.toBeOnTheScreen();
    expect(kv.getJSON(STORAGE_KEY)).toBeNull();
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('undo restores each snack of a two-snack day by its slot index', async () => {
    recordRebalance(
      result([
        swap({ mealType: 'snack', slotIndex: 3, previousRecipeId: 'snack-1' }),
        swap({ mealType: 'snack', slotIndex: 4, previousRecipeId: 'snack-2' }),
      ]),
    );
    const user = userEvent.setup();
    await render(<RebalanceBanner />);
    await user.press(screen.getByTestId('rebalance-undo'));
    expect(mockReplace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 3,
      mealType: 'snack',
      slotIndex: 3,
      recipeId: 'snack-1',
    });
    expect(mockReplace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 3,
      mealType: 'snack',
      slotIndex: 4,
      recipeId: 'snack-2',
    });
  });

  it('survives a restart (reads the persisted hand-off)', async () => {
    recordRebalance(result([swap()]));
    resetRebalanceStoreForTests(); // drop the in-memory copy, keep storage
    await render(<RebalanceBanner />);
    expect(screen.getByTestId('rebalance-banner')).toBeOnTheScreen();
  });

  it('keeps the banner and says so when undo fails', async () => {
    mockReplace.mockRejectedValueOnce(new Error('network'));
    recordRebalance(result([swap()]));
    const user = userEvent.setup();
    await render(<RebalanceBanner />);
    await user.press(screen.getByTestId('rebalance-undo'));
    expect(screen.getByTestId('rebalance-undo-error')).toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-banner')).toBeOnTheScreen();
  });

  it('dismiss clears it everywhere', async () => {
    recordRebalance(result([swap()]));
    const user = userEvent.setup();
    await render(<RebalanceBanner />);
    await user.press(screen.getByTestId('rebalance-dismiss'));
    expect(screen.queryByTestId('rebalance-banner')).not.toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('on the Plan tab only shows swaps for the displayed plan', async () => {
    recordRebalance(result([swap()], 'plan-1'));
    await render(<RebalanceBanner planId="plan-2" />);
    expect(screen.queryByTestId('rebalance-banner')).not.toBeOnTheScreen();
  });
});
