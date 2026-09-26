import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import HistoryPlanScreen from '../../app/history/[planId]';
import HistoryScreen from '../../app/history/index';

// History on mobile (audit F-M-PAR-1, F-M-PREM-1-1): each past week opens a
// read-only detail, and Restore asks first and spins only its own row.

const mockGetById = jest.fn<unknown, []>();
const mockList = jest.fn<unknown, []>();
const mockRestore = jest.fn<unknown, [{ onSuccess?: () => void }]>();
const mockRestoreMutate = jest.fn();
const mockParams = jest.fn<unknown, []>();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: jest.fn() },
      dashboard: { summary: { invalidate: jest.fn() } },
      tracker: { invalidate: jest.fn() },
      shoppingList: { invalidate: jest.fn() },
    }),
    mealPlan: {
      getById: { useQuery: () => mockGetById() },
      list: { useQuery: () => mockList() },
      restore: {
        useMutation: (opts: { onSuccess?: () => void }) => mockRestore(opts),
      },
    },
  },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams(),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock; back: jest.Mock } }>(
  'expo-router',
);

const query = (overrides: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  ...overrides,
});

const mutation = (overrides: Record<string, unknown> = {}) => ({
  mutate: mockRestoreMutate,
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
  variables: undefined,
  ...overrides,
});

const recipe = (id: string, name: string, calories: number) => ({
  id,
  name,
  imageUrl: null,
  prepTimeMins: 10,
  cookTimeMins: 15,
  nutritionInfo: { calories },
  allergenWarnings: [],
});

const plan = {
  planId: 'p1',
  weekStartDate: new Date('2026-09-07T00:00:00'),
  days: [
    {
      dayOfWeek: 0,
      meals: [
        { type: 'dinner', recipe: recipe('r2', 'Lentil Curry', 600) },
        { type: 'breakfast', recipe: recipe('r1', 'Overnight Oats', 400) },
      ],
    },
    { dayOfWeek: 2, meals: [{ type: 'lunch', recipe: recipe('r3', 'Greek Salad', 450) }] },
  ],
};

const listPlan = (id: string, status: string) => ({
  id,
  weekStartDate: new Date('2026-09-07T00:00:00'),
  weekEndDate: new Date('2026-09-13T00:00:00'),
  status,
  createdAt: new Date('2026-09-06T00:00:00'),
  recipePreview: ['Overnight Oats'],
  macroSummary: { avgKcal: 1900, avgProtein: 120, avgCarbs: 200, avgFat: 60 },
});

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const renderWithSafeArea = (ui: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ planId: 'p1', status: 'ARCHIVED' });
  mockGetById.mockReturnValue(query({ data: plan }));
  mockList.mockReturnValue(
    query({ data: [listPlan('p1', 'ARCHIVED'), listPlan('p2', 'ARCHIVED')] }),
  );
  mockRestore.mockReturnValue(mutation());
});

describe('HistoryPlanScreen (detail)', () => {
  it('shows the week and the selected day’s meals in meal order', async () => {
    await renderWithSafeArea(<HistoryPlanScreen />);
    expect(screen.getByTestId('history-plan-title')).toHaveTextContent(/Week of 7 Sept? 2026/);
    const names = screen
      .getAllByText(/Overnight Oats|Lentil Curry/)
      .map((n) => (n.props as { children: unknown }).children);
    expect(names).toEqual(['Overnight Oats', 'Lentil Curry']);
    expect(screen.getByTestId('history-day-kcal')).toHaveTextContent(/1,000 kcal/);
  });

  it('switches days and opens a meal’s recipe', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<HistoryPlanScreen />);
    await user.press(screen.getByTestId('history-day-2'));
    expect(screen.queryByText('Overnight Oats')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('history-meal-lunch'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'r3' },
    });

    await user.press(screen.getByTestId('history-day-4'));
    expect(screen.getByText('No meals planned for this day.')).toBeOnTheScreen();
  });

  it('restores only after confirming', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<HistoryPlanScreen />);
    await user.press(screen.getByTestId('history-plan-restore'));
    expect(mockRestoreMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('restore-confirm-body')).toHaveTextContent(/week of 7 Sept?/);

    await user.press(screen.getByTestId('restore-confirm-cancel'));
    expect(mockRestoreMutate).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('history-plan-restore'));
    await user.press(screen.getByTestId('restore-confirm-confirm'));
    expect(mockRestoreMutate).toHaveBeenCalledWith({ planId: 'p1' });
  });

  it('goes back to History once the restore lands', async () => {
    await renderWithSafeArea(<HistoryPlanScreen />);
    mockRestore.mock.calls[0]?.[0].onSuccess?.();
    expect(router.back).toHaveBeenCalled();
  });

  it('hides Restore for the active week', async () => {
    mockParams.mockReturnValue({ planId: 'p1', status: 'ACTIVE' });
    await renderWithSafeArea(<HistoryPlanScreen />);
    expect(screen.queryByTestId('history-plan-restore')).not.toBeOnTheScreen();
  });

  it('says "not found" for a missing plan but offers a retry for a failed load', async () => {
    mockGetById.mockReturnValue(query({ isError: true, error: { data: { code: 'NOT_FOUND' } } }));
    const { unmount } = await renderWithSafeArea(<HistoryPlanScreen />);
    expect(screen.getByTestId('history-plan-not-found')).toBeOnTheScreen();
    await unmount();

    const refetch = jest.fn();
    mockGetById.mockReturnValue(
      query({ isError: true, error: { data: { code: 'INTERNAL_SERVER_ERROR' } }, refetch }),
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<HistoryPlanScreen />);
    expect(screen.queryByTestId('history-plan-not-found')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('history-plan-error-retry'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('HistoryScreen (list)', () => {
  it('opens a week’s detail', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<HistoryScreen />);
    await user.press(screen.getByTestId('history-view-p2'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/history/[planId]',
      params: { planId: 'p2', status: 'ARCHIVED' },
    });
  });

  it('asks before restoring', async () => {
    const user = userEvent.setup();
    await renderWithSafeArea(<HistoryScreen />);
    await user.press(screen.getByTestId('history-restore-p2'));
    expect(mockRestoreMutate).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('restore-confirm-confirm'));
    expect(mockRestoreMutate).toHaveBeenCalledWith({ planId: 'p2' });
  });

  it('spins only the row being restored', async () => {
    mockRestore.mockReturnValue(mutation({ isPending: true, variables: { planId: 'p1' } }));
    await renderWithSafeArea(<HistoryScreen />);
    expect(screen.getByTestId('history-restore-p1')).toBeBusy();
    expect(screen.getByTestId('history-restore-p2')).not.toBeBusy();
    // One restore at a time: the other row waits rather than racing it.
    expect(screen.getByTestId('history-restore-p2')).toBeDisabled();
  });

  it('shows a failed restore on its own row', async () => {
    mockRestore.mockReturnValue(
      mutation({
        isError: true,
        error: { message: 'Plan not found.' },
        variables: { planId: 'p2' },
      }),
    );
    await renderWithSafeArea(<HistoryScreen />);
    expect(screen.getAllByText('Plan not found.')).toHaveLength(1);
  });
});
