import { act, render, screen, userEvent } from '@testing-library/react-native';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';

// P2-2: Today's next meal logs in one tap through tracker.logRecipe, then
// refreshes the summary so the spotlight advances (F-PM-10).

const mockMutate = jest.fn();
const mockInvalidate = jest.fn();
const mockPush = jest.fn();
const mockRecordRebalance = jest.fn();
const mockMutation: { onSuccess?: (data: { rebalance: null }) => void } = {};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => {
      mockPush(...args);
    },
  },
}));
jest.mock('../../src/features/tracker/rebalance-store', () => ({
  recordRebalance: (result: unknown) => {
    mockRecordRebalance(result);
  },
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { summary: { invalidate: mockInvalidate } },
      tracker: {
        getDay: { invalidate: jest.fn() },
        weeklySummary: { invalidate: jest.fn() },
      },
    }),
    tracker: {
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: { rebalance: null }) => void }) => {
          mockMutation.onSuccess = opts.onSuccess;
          return { mutate: mockMutate, isPending: false, isError: false, error: null };
        },
      },
    },
  },
}));

const MEAL = {
  mealType: 'dinner',
  recipe: {
    id: 'curry',
    name: 'Lentil Curry',
    description: 'Warm and filling',
    imageUrl: null,
    kcal: 700,
    servings: 1,
    prepTimeMins: 10,
    cookTimeMins: 30,
  },
};

beforeEach(() => jest.clearAllMocks());

describe('HeroMealCard (Today)', () => {
  it('"I ate this" logs the planned recipe for the local day, one portion', async () => {
    const user = userEvent.setup();
    await render(<HeroMealCard meal={MEAL} isTomorrow={false} />);
    await user.press(screen.getByTestId('today-ate-this'));
    const [args] = mockMutate.mock.calls[0] as [Record<string, unknown>];
    expect(args).toMatchObject({ recipeId: 'curry', mealType: 'dinner', portionMultiplier: 1 });
    expect(String(args.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refreshes Today, hands off any rebalance and confirms the log', async () => {
    await render(<HeroMealCard meal={MEAL} isTomorrow={false} />);
    await act(() => {
      mockMutation.onSuccess?.({ rebalance: null });
      return Promise.resolve();
    });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockRecordRebalance).toHaveBeenCalledWith(null);
    expect(screen.getByText('Logged Lentil Curry.')).toBeOnTheScreen();
  });

  it('"Cook it" opens cook mode for this meal slot', async () => {
    const user = userEvent.setup();
    await render(<HeroMealCard meal={MEAL} isTomorrow={false} />);
    await user.press(screen.getByTestId('today-cook-it'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/cook/[id]',
      params: { id: 'curry', meal: 'dinner' },
    });
  });

  it("logs and cooks at the plan slot's portion (P1-1)", async () => {
    const user = userEvent.setup();
    await render(<HeroMealCard meal={{ ...MEAL, portion: 1.5 }} isTomorrow={false} />);
    expect(screen.getByText(/1½× portion/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('today-ate-this'));
    const [args] = mockMutate.mock.calls[0] as [Record<string, unknown>];
    expect(args.portionMultiplier).toBe(1.5);
    await user.press(screen.getByTestId('today-cook-it'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/cook/[id]',
      params: { id: 'curry', meal: 'dinner', portion: '1.5' },
    });
  });

  it('shows prep + cook time, not prep alone (F-PM-10)', async () => {
    await render(<HeroMealCard meal={MEAL} isTomorrow={false} />);
    expect(screen.getByTestId('hero-meal-time')).toHaveTextContent('40 min');
  });

  it("tomorrow's meal can be opened but not logged", async () => {
    await render(<HeroMealCard meal={MEAL} isTomorrow />);
    expect(screen.queryByTestId('today-ate-this')).toBeNull();
    expect(screen.getByText('Tomorrow')).toBeOnTheScreen();
  });
});
