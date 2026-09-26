import { Alert } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { WeightCard } from '../../src/features/coach/weight-card';

// Audit F-DASH-3-1: weigh-ins are validated with the shared parser and can be
// corrected or deleted from the dashboard card.

const mockLogMutate = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: { weightHistory: { invalidate: mockInvalidate } },
      gym: {
        stats: { bodyweight: { invalidate: mockInvalidate } },
        bootstrap: { invalidate: mockInvalidate },
      },
    }),
    tracker: {
      weightHistory: {
        useQuery: () => ({
          data: [
            { id: 'w1', weightKg: 80, recordedAt: new Date('2026-09-20T08:00:00Z') },
            { id: 'w2', weightKg: 1000, recordedAt: new Date('2026-09-21T08:00:00Z') },
          ],
          refetch: jest.fn(),
        }),
      },
      logWeight: { useMutation: () => ({ mutate: mockLogMutate, isPending: false, error: null }) },
      updateWeight: { useMutation: () => ({ mutate: mockUpdateMutate, isPending: false }) },
      deleteWeight: { useMutation: () => ({ mutate: mockDeleteMutate, isPending: false }) },
    },
  },
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

beforeEach(() => jest.clearAllMocks());

describe('WeightCard', () => {
  it('shows why 1000 kg is refused instead of dropping it silently', async () => {
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.type(screen.getByTestId('weight-input'), '1000');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('weight-error')).toHaveTextContent(/between 20 and 400 kg/);
  });

  it('logs a comma-decimal weight', async () => {
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.type(screen.getByTestId('weight-input'), '79,4');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 79.4 });
  });

  it('corrects a typo entry in place', async () => {
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w2-edit'));
    await user.clear(screen.getByTestId('weight-entry-w2-input'));
    await user.type(screen.getByTestId('weight-entry-w2-input'), '80.2');
    await user.press(screen.getByTestId('weight-entry-w2-save'));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'w2', weightKg: 80.2 });
  });

  it('deletes an entry after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w2-delete'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.text === 'Delete')?.onPress?.();
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'w2' });
  });

  it('links to the Progress screen', async () => {
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.press(screen.getByTestId('weight-see-progress'));
    expect(router.push).toHaveBeenCalledWith('/progress');
  });
});
