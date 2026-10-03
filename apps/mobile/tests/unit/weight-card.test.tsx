import { Keyboard } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { WeightCard } from '../../src/features/coach/weight-card';

// Audit F-DASH-3-1: weigh-ins are validated with the shared parser and can be
// corrected or deleted from the dashboard card.

const mockLogMutate = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockInvalidate = jest.fn();
const mockDeleteClient = jest.fn((_input: { id: string }) => Promise.resolve({ success: true }));
let mockUnits: 'METRIC' | 'IMPERIAL' = 'METRIC';
let mockLogOptions: {
  onSuccess?: (entry: { id: string }, variables: { weightKg: number }) => void;
} = {};
// The newest weigh-in on record: "today" unless a test says otherwise.
let mockLatestAt = new Date('2026-09-21T08:00:00Z');
let mockLatestKg = 1000;

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: {
      get: {
        useQuery: () => ({ data: { chefProfile: { preferredUnits: mockUnits } } }),
      },
    },
    useUtils: () => ({
      client: { tracker: { deleteWeight: { mutate: mockDeleteClient } } },
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
            { id: 'w2', weightKg: mockLatestKg, recordedAt: mockLatestAt },
          ],
          refetch: jest.fn(),
        }),
      },
      logWeight: {
        useMutation: (options: typeof mockLogOptions) => {
          mockLogOptions = options;
          return { mutate: mockLogMutate, isPending: false, error: null };
        },
      },
      updateWeight: { useMutation: () => ({ mutate: mockUpdateMutate, isPending: false }) },
      deleteWeight: { useMutation: () => ({ mutate: mockDeleteMutate, isPending: false }) },
    },
  },
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  mockUnits = 'METRIC';
  mockLatestAt = new Date('2026-09-21T08:00:00Z');
  mockLatestKg = 1000;
});

describe('WeightCard', () => {
  it('shows why 1000 kg is refused instead of dropping it silently', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    await user.type(screen.getByTestId('weight-input'), '1000');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('weight-error')).toHaveTextContent(/between 20 and 400 kg/);
  });

  it('logs a comma-decimal weight', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    await user.type(screen.getByTestId('weight-input'), '79,4');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 79.4 });
  });

  it('corrects a typo entry in place', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w2-edit'));
    await user.clear(screen.getByTestId('weight-entry-w2-input'));
    await user.type(screen.getByTestId('weight-entry-w2-input'), '80.2');
    await user.press(screen.getByTestId('weight-entry-w2-save'));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'w2', weightKg: 80.2 });
  });

  it('deletes an entry after confirmation', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w2-delete'));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('weight-entry-w2-delete-confirm-confirm'));
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 'w2' });
  });

  // R-21: iOS's decimal-pad has no Done key — the shared accessory bar adds one.
  it('gives the weight field a Log key and the entry editor a Done key', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    const input = screen.getByTestId('weight-input');
    const barId = input.props.inputAccessoryViewID as string;
    expect(barId).toBeTruthy();
    // UX-FOOD-08: the weight field's accessory saves ("Log") and closes the
    // keyboard; an empty field shows the error and keeps the keyboard up.
    const bar = screen.getByTestId('weight-numeric-bar');
    expect(bar).toHaveTextContent('Log');
    await user.press(bar);
    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('weight-error')).toHaveTextContent(/Enter your weight/);
    await user.type(input, '79.4');
    await user.press(bar);
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 79.4 });
    expect(dismiss).toHaveBeenCalled();

    dismiss.mockClear();
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w2-edit'));
    expect(screen.getByTestId('weight-entry-w2-input').props.inputAccessoryViewID).toBeTruthy();
    await user.press(screen.getByTestId('weight-entry-w2-numeric-bar'));
    expect(dismiss).toHaveBeenCalled();
  });

  // UX-FOOD-08: a logged weight leaves the field, with an Undo for 10 s.
  it('clears the field after a log and offers Logged · Undo', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
        <Snackbar />
      </SafeAreaProvider>,
    );
    await user.type(screen.getByTestId('weight-input'), '79.4');
    await user.press(screen.getByTestId('weight-save'));
    await act(() => {
      mockLogOptions.onSuccess?.({ id: 'new1' }, { weightKg: 79.4 });
    });
    expect(screen.getByTestId('weight-input')).toHaveDisplayValue('');
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Logged 79.4 kg');
    await user.press(screen.getByTestId('snackbar-action'));
    expect(mockDeleteClient).toHaveBeenCalledWith({ id: 'new1' });
  });

  it('ignores the same weight logged again on the same day, but not on another day', async () => {
    mockLatestAt = new Date();
    mockLatestKg = 79.4;
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
        <Snackbar />
      </SafeAreaProvider>,
    );
    await user.type(screen.getByTestId('weight-input'), '79,4');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent(
      'Already logged 79.4 kg today',
    );
    expect(screen.getByTestId('weight-input')).toHaveDisplayValue('');
    // A different value on the same day is a real second weigh-in.
    await user.type(screen.getByTestId('weight-input'), '79.9');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 79.9 });
  });

  it('logs the same weight again when the last entry is from another day', async () => {
    mockLatestAt = new Date('2026-09-01T08:00:00Z');
    mockLatestKg = 79.4;
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    await user.type(screen.getByTestId('weight-input'), '79.4');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 79.4 });
  });

  it('links to the Progress screen', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
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
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('2204.6 lb')).toBeOnTheScreen();
  });

  it('logs pounds as kg and explains the range in lb', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
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
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeightCard />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('weight-entries-toggle'));
    await user.press(screen.getByTestId('weight-entry-w1-edit'));
    expect(screen.getByTestId('weight-entry-w1-input')).toHaveDisplayValue('176.4');
    await user.press(screen.getByTestId('weight-entry-w1-save'));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 'w1', weightKg: 80 });
  });
});
