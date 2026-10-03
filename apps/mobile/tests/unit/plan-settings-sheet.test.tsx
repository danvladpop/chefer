import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PlanSettingsSheet } from '../../src/features/meal-plan/plan-settings-sheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

// UX-07 §1/§2 (T-07.5): opens with the server's current shape, saves via
// `mealPlan.setShape`, and never regenerates itself — the caller decides
// whether to follow up with a regenerate confirm (`onSaved`).

jest.mock('expo-router', () => ({ Link: 'Link' }));

const shape = {
  slots: ['dinner'] as const,
  days: [0, 1, 2, 3],
  timeCapMins: 30 as const,
  weekendNoLimit: false,
  cookingFor: 2 as const,
  leftovers: false,
};

let mockMutate: jest.Mock;

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    household: { list: { useQuery: () => ({ data: [] }) } },
    mealPlan: {
      getShape: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) =>
          opts?.enabled === false
            ? { data: undefined, isLoading: false }
            : {
                data: mockShapeData,
                isLoading: false,
                isError: mockShapeFailed && !mockShapeData,
                refetch: mockShapeRefetch,
              },
      },
      setShape: {
        useMutation: () => ({
          mutate: mockMutate,
          isPending: false,
          isError: false,
          reset: jest.fn(),
        }),
      },
    },
  },
}));

let mockShapeData: typeof shape | undefined;
let mockShapeFailed = false;
const mockShapeRefetch = jest.fn();

beforeEach(() => {
  mockShapeData = shape;
  mockShapeFailed = false;
  mockShapeRefetch.mockClear();
  mockMutate = jest.fn((_input, opts?: { onSuccess?: (data: typeof shape) => void }) =>
    opts?.onSuccess?.(shape),
  );
});

describe('PlanSettingsSheet', () => {
  it('does not query while closed', async () => {
    await renderSheet(
      <PlanSettingsSheet
        visible={false}
        onClose={jest.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('plan-settings-title')).toBeNull();
  });

  it('loads the current shape into the form and shows "Save" with no plan', async () => {
    await renderSheet(
      <PlanSettingsSheet
        visible
        onClose={jest.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('how-you-cook-summary')).toHaveTextContent(
      'Dinner · Mon, Tue, Wed, Thu · 30 min or less · cooking for 2',
    );
    expect(screen.getByTestId('plan-settings-save')).toHaveTextContent('Save');
  });

  it('footer names the week to re-plan when a plan already exists', async () => {
    await renderSheet(
      <PlanSettingsSheet
        visible
        onClose={jest.fn()}
        hasPlan
        weekLabel="next week"
        isPremium={false}
        onSaved={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('plan-settings-save')).toHaveTextContent(
      'Save and re-plan next week',
    );
  });

  it('saves the edited shape and calls onSaved', async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    await renderSheet(
      <PlanSettingsSheet
        visible
        onClose={onClose}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={onSaved}
      />,
    );
    await screen.findByTestId('plan-settings-save');
    await fireEvent.press(screen.getByTestId('plan-settings-save'));
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    expect(mockMutate).toHaveBeenCalledWith(shape, expect.anything());
    expect(onSaved).toHaveBeenCalledWith(shape);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the leftovers switch only for premium', async () => {
    await renderSheet(
      <PlanSettingsSheet
        visible
        onClose={jest.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium
        onSaved={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('plan-settings-leftovers')).toBeOnTheScreen();
  });
});

// UX-X-12: a failed load is not a spinner forever.
describe('PlanSettingsSheet — failed load', () => {
  it('shows an error with Try again instead of a spinner', async () => {
    mockShapeData = undefined;
    mockShapeFailed = true;
    await renderSheet(
      <PlanSettingsSheet
        visible
        onClose={jest.fn()}
        hasPlan={false}
        weekLabel="this week"
        isPremium={false}
        onSaved={jest.fn()}
      />,
    );
    expect(screen.getByTestId('plan-settings-load-error')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('plan-settings-load-error-retry'));
    expect(mockShapeRefetch).toHaveBeenCalled();
  });
});
