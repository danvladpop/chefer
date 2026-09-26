import { Alert } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { WeightCard } from '../../src/features/coach/weight-card';

// Audit F-DASH-3-1: weigh-ins are validated with the shared parser and can be
// corrected or deleted from the dashboard card.

const mockLogMutate = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockInvalidate = jest.fn();
let mockUnits: 'METRIC' | 'IMPERIAL' = 'METRIC';

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: {
      get: {
        useQuery: () => ({ data: { chefProfile: { preferredUnits: mockUnits } } }),
      },
    },
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUnits = 'METRIC';
});

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

// Backlog P2-6: stored in kg, shown and typed in the user's unit.
describe('WeightCard in pounds', () => {
  beforeEach(() => {
    mockUnits = 'IMPERIAL';
  });

  it('shows the latest weigh-in in lb', async () => {
    await render(<WeightCard />);
    expect(screen.getByText('2204.6 lb')).toBeOnTheScreen();
  });

  it('logs pounds as kg and explains the range in lb', async () => {
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.type(screen.getByTestId('weight-input'), '900');
    await user.press(screen.getByTestId('weight-save'));
    expect(screen.getByTestId('weight-error')).toHaveTextContent(/between 44 and 881 lb/);

    await user.clear(screen.getByTestId('weight-input'));
    await user.type(screen.getByTestId('weight-input'), '176.4');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 80 });
  });

  it('edits an entry in lb and saves the same kg when untouched', async () => {
    const user = userEvent.setup();
    await render(<WeightCard />);
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w1-edit'));
    expect(screen.getByTestId('weight-entry-w1-input')).toHaveDisplayValue('176.4');
    await user.press(screen.getByTestId('weight-entry-w1-save'));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'w1', weightKg: 80 });
  });
});
