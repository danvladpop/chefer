import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReportSafetySheet } from '../../src/features/safety/report-sheet';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

// T-01.5 — report a safety problem (UX-01 (d), AC10): sending a report calls
// `safety.report`, which hides the recipe from this user's plans and swaps.

const mockReport = jest.fn();
const mockInvalidate = jest.fn();
const mockReportState: { isError: boolean; error: { message: string } | null } = {
  isError: false,
  error: null,
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      recipe: { list: { invalidate: mockInvalidate } },
      mealPlan: { invalidate: mockInvalidate },
    }),
    safety: {
      report: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          ...mockReportState,
          mutate: (input: unknown) => {
            mockReport(input);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockReportState.isError = false;
  mockReportState.error = null;
});

describe('ReportSafetySheet (T-01.5)', () => {
  it('Send report is disabled until a reason is picked', async () => {
    await renderSheet(
      <ReportSafetySheet
        visible
        onClose={jest.fn()}
        recipeId="r1"
        recipeName="Greek Yogurt Parfait"
        surface="recipe_detail"
      />,
    );
    const send = screen.getByTestId('report-safety-send').props as {
      accessibilityState?: { disabled?: boolean };
    };
    expect(send.accessibilityState?.disabled).toBe(true);
  });

  it('sends the picked reason, the optional note, and hides the recipe (AC10)', async () => {
    const onClose = jest.fn();
    await renderSheet(
      <ReportSafetySheet
        visible
        onClose={onClose}
        recipeId="r1"
        recipeName="Greek Yogurt Parfait"
        surface="recipe_detail"
      />,
    );
    await fireEvent.press(screen.getByText('It contains something we can’t eat'));
    await fireEvent.changeText(screen.getByTestId('report-safety-note'), 'Had almonds in it');
    await fireEvent.press(screen.getByTestId('report-safety-send'));

    expect(mockReport).toHaveBeenCalledWith({
      recipeId: 'r1',
      surface: 'recipe_detail',
      reason: 'It contains something we can’t eat',
      note: 'Had almonds in it',
    });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the server error message when the report fails', async () => {
    mockReportState.isError = true;
    mockReportState.error = { message: 'Something went wrong.' };
    await renderSheet(
      <ReportSafetySheet
        visible
        onClose={jest.fn()}
        recipeId="r1"
        recipeName="Greek Yogurt Parfait"
        surface="recipe_detail"
      />,
    );
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
  });
});
