import { render, screen, userEvent } from '@testing-library/react-native';
import { TargetsCard } from '../../src/features/preferences/targets-card';

// §2.11, T-35.3 — Suggested / My own, AC1 (an own target flows through) and
// AC4 (floor/macro validation) at the client layer, before the round trip.

const mockSet = jest.fn();
const mockInvalidate = jest.fn();
let mockGetData:
  | {
      targetMode: 'SUGGESTED' | 'OWN';
      effective: { dailyCalorieTarget: number; proteinG: number; carbsG: number; fatG: number };
      suggested: { dailyCalorieTarget: number; proteinG: number; carbsG: number; fatG: number };
      custom: {
        kcal: number | null;
        proteinG: number | null;
        carbsG: number | null;
        fatG: number | null;
      };
    }
  | undefined;
const mockSetMutationState: { isPending: boolean; isSuccess: boolean; error: null } = {
  isPending: false,
  isSuccess: false,
  error: null,
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      targets: { get: { invalidate: mockInvalidate }, changes: { invalidate: mockInvalidate } },
      tracker: { getDay: { invalidate: mockInvalidate } },
      dashboard: { summary: { invalidate: mockInvalidate } },
    }),
    targets: {
      get: { useQuery: () => ({ data: mockGetData, isLoading: !mockGetData }) },
      set: {
        useMutation: (opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
          mutate: (input: unknown) => {
            mockSet(input);
            opts?.onSuccess?.();
          },
          ...mockSetMutationState,
        }),
      },
    },
  },
}));

const SUGGESTED_DATA = {
  targetMode: 'SUGGESTED' as const,
  effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  custom: { kcal: null, proteinG: null, carbsG: null, fatG: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetData = SUGGESTED_DATA;
  mockSetMutationState.isPending = false;
  mockSetMutationState.isSuccess = false;
});

describe('TargetsCard', () => {
  it('shows the suggested numbers by default', async () => {
    await render(<TargetsCard />);
    expect(screen.getByText('2,200 kcal')).toBeTruthy();
  });

  it('switching to My own reveals editable fields prefilled from suggested', async () => {
    const user = userEvent.setup();
    await render(<TargetsCard />);

    await user.press(screen.getByTestId('targets-mode-own'));

    expect(screen.getByTestId('targets-kcal')).toHaveDisplayValue('2200');
    expect(screen.getByTestId('targets-protein')).toHaveDisplayValue('150');
  });

  it('rejects calories below the 1,200 floor before sending (AC4)', async () => {
    const user = userEvent.setup();
    await render(<TargetsCard />);
    await user.press(screen.getByTestId('targets-mode-own'));
    await user.clear(screen.getByTestId('targets-kcal'));
    await user.type(screen.getByTestId('targets-kcal'), '900');

    await user.press(screen.getByTestId('targets-save'));

    expect(mockSet).not.toHaveBeenCalled();
    expect(screen.getByTestId('targets-error')).toHaveTextContent(/1,200 and 5,000/);
  });

  it('saves an own target with all four numbers (AC1)', async () => {
    const user = userEvent.setup();
    await render(<TargetsCard />);
    await user.press(screen.getByTestId('targets-mode-own'));
    await user.clear(screen.getByTestId('targets-kcal'));
    await user.type(screen.getByTestId('targets-kcal'), '2500');

    await user.press(screen.getByTestId('targets-save'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ targetMode: 'OWN', kcal: 2500, proteinG: 150 }),
    );
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('bug B-38 pattern: "Saved ✓" reverts once the field is edited again', async () => {
    mockSetMutationState.isSuccess = true;
    const user = userEvent.setup();
    await render(<TargetsCard />);

    await user.press(screen.getByTestId('targets-save'));
    expect(screen.getByTestId('targets-save')).toHaveTextContent('Saved ✓');

    await user.press(screen.getByTestId('targets-mode-own'));
    await user.type(screen.getByTestId('targets-kcal'), '5');

    expect(screen.getByTestId('targets-save')).toHaveTextContent('Save targets');
  });
});
