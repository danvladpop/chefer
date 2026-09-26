import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { QuickAddSheet } from '../../src/features/tracker/quick-add-sheet';

// P1-7: quick add (F4, all tiers) — inline validation mirroring the API's
// logCustomMeal bounds, API errors surfaced, rebalance handed to the store.

const mockMutate = jest.fn();
const mockInvalidate = jest.fn();
const mockRecordRebalance = jest.fn();
const mockMutation: {
  isPending: boolean;
  isError: boolean;
  error: { message: string } | null;
  onSuccess?: (data: unknown) => void;
} = { isPending: false, isError: false, error: null };

jest.mock('../../src/features/tracker/rebalance-store', () => ({
  recordRebalance: (result: unknown) => {
    mockRecordRebalance(result);
  },
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: mockInvalidate },
        weeklySummary: { invalidate: mockInvalidate },
      },
      dashboard: { summary: { invalidate: mockInvalidate } },
    }),
    tracker: {
      logCustomMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => {
          mockMutation.onSuccess = opts.onSuccess;
          return { ...mockMutation, mutate: mockMutate, reset: jest.fn() };
        },
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const onClose = jest.fn();
const onLogged = jest.fn();

async function renderSheet() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QuickAddSheet visible date="2026-09-26" onClose={onClose} onLogged={onLogged} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMutation.isError = false;
  mockMutation.error = null;
});

describe('QuickAddSheet', () => {
  it('explains a missing name and calories instead of sending', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('quick-add-name-error')).toHaveTextContent('Name what you ate.');
    expect(screen.getByTestId('quick-add-kcal-error')).toHaveTextContent('Enter the calories.');
  });

  it('refuses out-of-range numbers inline', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('quick-add-name'), 'Pizza');
    await user.type(screen.getByTestId('quick-add-kcal'), '6000');
    await user.type(screen.getByTestId('quick-add-protein'), '900');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('quick-add-kcal-error')).toHaveTextContent('Max 5000 kcal.');
    expect(screen.getByTestId('quick-add-protein-error')).toHaveTextContent('Max 500 g.');
  });

  it('logs name, chosen meal, kcal and macros to the local day', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('quick-add-name'), ' Birthday cake ');
    await user.press(screen.getByTestId('quick-add-meal-dinner'));
    await user.type(screen.getByTestId('quick-add-kcal'), '420');
    await user.type(screen.getByTestId('quick-add-fat'), '18,5');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockMutate).toHaveBeenCalledWith({
      date: '2026-09-26',
      estimatedBy: 'manual',
      name: 'Birthday cake',
      mealType: 'dinner',
      kcal: 420,
      protein: 0,
      carbs: 0,
      fat: 18.5,
    });
  });

  it('on success hands the rebalance to the store, refreshes the day and closes', async () => {
    await renderSheet();
    const rebalance = { rebalanced: true, swaps: [], projectedDeviation: 0.2, planId: 'p' };
    await act(() => {
      mockMutation.onSuccess?.({ log: {}, rebalance });
    });
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
    expect(mockInvalidate).toHaveBeenCalledWith({ date: '2026-09-26' });
    expect(onLogged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the API error', async () => {
    mockMutation.isError = true;
    mockMutation.error = { message: "You can't log a future day" };
    await renderSheet();
    expect(screen.getByTestId('quick-add-api-error')).toHaveTextContent(
      "You can't log a future day",
    );
  });
});
