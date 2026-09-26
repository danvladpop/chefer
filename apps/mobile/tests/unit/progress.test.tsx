import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import ProgressScreen from '../../app/progress';

// Progress screen (audit TRK-4 on mobile): 28-day calories + macros, 90-day
// weight with log form and entries, and a goal-aware weight change
// (F-TRK-4-1). A failed load is an error, never an empty history (F-X-3-1).

const mockMonthly = jest.fn<unknown, []>();
const mockWeights = jest.fn<unknown, []>();
const mockPreferences = jest.fn<unknown, []>();
const mockLogMutate = jest.fn();
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
      monthlySummary: { useQuery: () => mockMonthly() },
      weightHistory: { useQuery: () => mockWeights() },
      logWeight: { useMutation: () => ({ mutate: mockLogMutate, isPending: false, error: null }) },
      updateWeight: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
      deleteWeight: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
    preferences: { get: { useQuery: () => mockPreferences() } },
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const query = (overrides: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...overrides,
});

const day = (date: string, kcal: number | null) => ({
  date,
  totalKcal: kcal ?? 0,
  totalProtein: kcal ? 100 : 0,
  totalCarbs: kcal ? 200 : 0,
  totalFat: kcal ? 60 : 0,
  hasLog: kcal !== null,
});

const monthWith = (kcals: (number | null)[]) => ({
  dailyCalorieTarget: 2000,
  days: kcals.map((kcal, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, kcal)),
});

const weighIns = (...kgs: number[]) =>
  kgs.map((weightKg, i) => ({
    id: `w${i}`,
    weightKg,
    recordedAt: new Date(`2026-07-${String(i + 1).padStart(2, '0')}T08:00:00Z`),
  }));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ProgressScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockMonthly.mockReturnValue(query({ data: monthWith([1800, null, 2200]) }));
  mockWeights.mockReturnValue(query({ data: weighIns(80, 81.5) }));
  mockPreferences.mockReturnValue(query({ data: { chefProfile: { goal: 'GAIN_MUSCLE' } } }));
});

describe('ProgressScreen', () => {
  it('summarises logged days against the target and draws both charts', async () => {
    await renderScreen();
    expect(screen.getByTestId('progress-stat-days')).toHaveTextContent('2');
    expect(screen.getByTestId('progress-stat-avg')).toHaveTextContent('2,000');
    expect(screen.getByTestId('progress-stat-vs-target')).toHaveTextContent('0%');
    expect(screen.getByTestId('progress-calories-chart')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-macros-chart')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-weight-chart')).toBeOnTheScreen();
  });

  it('points to the Tracker when nothing is logged yet', async () => {
    mockMonthly.mockReturnValue(query({ data: monthWith([null, null]) }));
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.queryByTestId('progress-calories-chart')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('progress-open-tracker'));
    expect(router.push).toHaveBeenCalledWith('/tracker');
  });

  it('shows a retryable error, not an empty history, when the summary fails', async () => {
    const refetch = jest.fn();
    mockMonthly.mockReturnValue(query({ isError: true, refetch }));
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.queryByTestId('progress-open-tracker')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('progress-error-retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('reads a gain as good news for a muscle-gain goal', async () => {
    await renderScreen();
    expect(screen.getByTestId('progress-weight-current')).toHaveTextContent('81.5 kg');
    expect(screen.getByTestId('progress-weight-change')).toHaveTextContent('+1.5 kg');
    expect(screen.getByLabelText('+1.5 kg, in line with your goal')).toBeOnTheScreen();
  });

  it('reads the same gain as off-goal for a weight-loss goal', async () => {
    mockPreferences.mockReturnValue(query({ data: { chefProfile: { goal: 'LOSE_WEIGHT' } } }));
    await renderScreen();
    expect(screen.getByLabelText('+1.5 kg, away from your goal')).toBeOnTheScreen();
  });

  it('logs a weigh-in through the shared parser and lists entries for editing', async () => {
    const user = userEvent.setup();
    await renderScreen();
    expect(screen.getByTestId('weight-entry-w0')).toBeOnTheScreen();
    await user.type(screen.getByTestId('weight-input'), '1000');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('weight-error')).toHaveTextContent(/between 20 and 400 kg/);

    await user.clear(screen.getByTestId('weight-input'));
    await user.type(screen.getByTestId('weight-input'), '81,2');
    await user.press(screen.getByTestId('weight-save'));
    expect(mockLogMutate).toHaveBeenCalledWith({ weightKg: 81.2 });
  });

  it('shows a weigh-in load failure instead of "no entries yet"', async () => {
    mockWeights.mockReturnValue(query({ isError: true }));
    await renderScreen();
    expect(screen.getByTestId('progress-weight-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-weight-empty')).not.toBeOnTheScreen();
  });
});
