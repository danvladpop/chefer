import { act, render, screen, userEvent } from '@testing-library/react-native';
import { TonightCard } from '../../src/features/dashboard/components/tonight-card';
import { setKvBackendForTests } from '../../src/features/gym/offline/kv';

// UX-FOOD-04: "Rate it" on the Dinner-done row used to hide itself and save
// nothing. It now opens the real StarRating inline and disappears once a
// rating exists.

const mockRate = jest.fn();
let mockExisting: { rating: number; notes: string | null } | null = null;
let mockRatingLoading = false;
let mockRateSuccess: ((data: { rating: number; notes: string | null }) => void) | undefined;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => true }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/features/safety/checked-for-chip', () => ({ CheckedForChip: () => null }));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { summary: { invalidate: jest.fn() } },
      tracker: { getDay: { invalidate: jest.fn() }, weeklySummary: { invalidate: jest.fn() } },
      recipe: { getMyRating: { invalidate: jest.fn() } },
    }),
    tracker: {
      logRecipe: { useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false }) },
    },
    recipe: {
      getMyRating: {
        useQuery: () => ({
          data: mockExisting,
          isLoading: mockRatingLoading,
          isSuccess: !mockRatingLoading,
        }),
      },
      rate: {
        useMutation: (opts: {
          onSuccess?: (data: { rating: number; notes: string | null }) => void;
        }) => {
          mockRateSuccess = opts.onSuccess;
          return { mutate: mockRate, isPending: false, isError: false, error: null };
        },
      },
    },
    household: { list: { useQuery: () => ({ data: [] }) } },
  },
}));

const meal = (done: boolean) => ({
  planId: 'p1',
  dayOfWeek: 2,
  slotIndex: 0,
  mealType: 'dinner',
  done,
  recipe: {
    id: 'r1',
    name: 'Sheet-Pan Salmon',
    description: '',
    imageUrl: null,
    kcal: 520,
    servings: 2,
    prepTimeMins: 10,
    cookTimeMins: 20,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(undefined);
  mockExisting = null;
  mockRatingLoading = false;
  mockRateSuccess = undefined;
});

describe('TonightCard "Rate it" (UX-FOOD-04)', () => {
  it('opens the star rating, saves it, and the link does not come back', async () => {
    const user = userEvent.setup();
    const view = await render(
      <TonightCard meal={meal(true) as never} showNutrition onLogged={jest.fn()} />,
    );
    await user.press(screen.getByTestId('tonight-rate-it'));
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
    expect(screen.getByTestId('star-rating')).toBeOnTheScreen();

    await user.press(screen.getByLabelText('Rate 4 stars'));
    await user.press(screen.getByTestId('star-rating-save'));
    expect(mockRate).toHaveBeenCalledWith({ recipeId: 'r1', rating: 4, notes: '' });

    // The save lands, getMyRating now returns the rating: still no link, and
    // the stars stay on screen showing "Saved".
    await act(() => {
      mockExisting = { rating: 4, notes: null };
      mockRateSuccess?.({ rating: 4, notes: null });
    });
    await view.rerender(<TonightCard meal={meal(true)} showNutrition onLogged={jest.fn()} />);
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
    expect(screen.getByTestId('star-rating-save')).toHaveTextContent('✓ Saved');
  });

  it('shows no link when the dinner is already rated', async () => {
    mockExisting = { rating: 5, notes: null };
    await render(<TonightCard meal={meal(true) as never} showNutrition onLogged={jest.fn()} />);
    expect(screen.getByTestId('tonight-card-done')).toBeOnTheScreen();
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
    expect(screen.queryByTestId('star-rating')).toBeNull();
  });

  it('waits for the rating lookup before offering the link', async () => {
    mockRatingLoading = true;
    await render(<TonightCard meal={meal(true) as never} showNutrition onLogged={jest.fn()} />);
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
  });
});

// UX-FOOD-18: on Friday and Saturday evenings Plan opens on NEXT week, so a
// bare push to Plan never showed tonight's dinner. Swap now names this week,
// today's weekday and the dinner slot.
describe('TonightCard "Swap" (UX-FOOD-18)', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    // Friday 19:00 (Plan's default week is next week from Friday 15:00).
    ['Friday evening', new Date(2026, 8, 4, 19, 0), '4'],
    ['Saturday evening', new Date(2026, 8, 5, 19, 0), '5'],
    // Sunday must map to Plan's Monday-first index 6.
    ['Sunday evening', new Date(2026, 8, 6, 19, 0), '6'],
    ['Wednesday evening', new Date(2026, 8, 2, 19, 0), '2'],
  ])('%s: opens THIS week, today, with the dinner swap requested', async (_name, now, day) => {
    jest.useFakeTimers({
      now,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(<TonightCard meal={meal(false) as never} showNutrition onLogged={jest.fn()} />);
    await user.press(screen.getByTestId('tonight-swap'));
    const [target] = router.push.mock.calls.at(-1) as [{ pathname: string; params: object }];
    expect(target).toMatchObject({
      pathname: '/(food)/meal-plan',
      params: { week: '0', day, swap: 'dinner' },
    });
  });

  it('every press is a fresh link, so a repeat swap reopens the picker', async () => {
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
    const user = userEvent.setup();
    await render(<TonightCard meal={meal(false) as never} showNutrition onLogged={jest.fn()} />);
    await user.press(screen.getByTestId('tonight-swap'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await user.press(screen.getByTestId('tonight-swap'));
    const [first, second] = router.push.mock.calls.map(
      (c: [{ params: { at: string } }]) => c[0].params.at,
    );
    expect(first).not.toBe(second);
  });
});
