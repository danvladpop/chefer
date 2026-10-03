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
