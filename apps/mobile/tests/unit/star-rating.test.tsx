import { render, screen, userEvent } from '@testing-library/react-native';
import { StarRating } from '../../src/features/recipes/star-rating';

// P1-7: star rating on recipe detail + cook-mode finish — 44pt stars with
// "Rate N stars" labels, household "who liked it" chips stored in the notes.

const mockRate = jest.fn();
const mockInvalidate = jest.fn();
let mockExisting: { rating: number; notes: string | null } | null = null;
let mockMembers: { id: string; name: string }[] = [];
let mockIsPremium: boolean | undefined = false;
const mockRateState: {
  isError: boolean;
  error: { message: string } | null;
  onSuccess?: (data: { rating: number; notes: string | null }) => void;
} = { isError: false, error: null };

jest.mock('../../src/hooks/use-is-premium', () => ({
  useIsPremium: () => mockIsPremium,
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ recipe: { getMyRating: { invalidate: mockInvalidate } } }),
    recipe: {
      getMyRating: { useQuery: () => ({ data: mockExisting, isSuccess: true }) },
      rate: {
        useMutation: (opts: {
          onSuccess?: (data: { rating: number; notes: string | null }) => void;
        }) => {
          mockRateState.onSuccess = opts.onSuccess;
          return { ...mockRateState, mutate: mockRate, isPending: false };
        },
      },
    },
    household: { list: { useQuery: () => ({ data: mockMembers }) } },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockExisting = null;
  mockMembers = [];
  mockIsPremium = false;
  mockRateState.isError = false;
  mockRateState.error = null;
});

describe('StarRating', () => {
  it('labels every star for screen readers', async () => {
    await render(<StarRating recipeId="r1" />);
    expect(screen.getByLabelText('Rate 1 star')).toBeOnTheScreen();
    for (const n of [2, 3, 4, 5]) {
      expect(screen.getByLabelText(`Rate ${n} stars`)).toBeOnTheScreen();
    }
  });

  it('cannot save before a star is picked, then saves the rating', async () => {
    const user = userEvent.setup();
    await render(<StarRating recipeId="r1" />);
    expect(screen.getByTestId('star-rating-save')).toBeDisabled();
    await user.press(screen.getByTestId('star-rating-4'));
    expect(screen.getByTestId('star-rating-label')).toHaveTextContent('Great');
    expect(screen.getByTestId('star-rating-4')).toBeSelected();
    await user.press(screen.getByTestId('star-rating-save'));
    expect(mockRate).toHaveBeenCalledWith({ recipeId: 'r1', rating: 4, notes: '' });
  });

  it('stores household "who liked it" chips inside the notes', async () => {
    mockMembers = [{ id: 'm1', name: 'Maria' }];
    const user = userEvent.setup();
    await render(<StarRating recipeId="r1" />);
    await user.press(screen.getByTestId('star-rating-5'));
    await user.press(screen.getByTestId('star-rating-liked-Maria'));
    await user.type(screen.getByTestId('star-rating-notes'), 'Crispy!');
    await user.press(screen.getByTestId('star-rating-save'));
    expect(mockRate).toHaveBeenCalledWith({
      recipeId: 'r1',
      rating: 5,
      notes: 'Crispy!\nLiked by: Maria',
    });
  });

  it('seeds an existing rating as saved', async () => {
    mockExisting = { rating: 3, notes: 'Bit bland\nLiked by: Me' };
    mockMembers = [{ id: 'm1', name: 'Maria' }];
    await render(<StarRating recipeId="r1" />);
    expect(screen.getByTestId('star-rating-3')).toBeSelected();
    expect(screen.getByTestId('star-rating-notes')).toHaveDisplayValue('Bit bland');
    expect(screen.getByTestId('star-rating-save')).toHaveTextContent('✓ Saved');
    expect(screen.getByTestId('star-rating-save')).toBeDisabled();
  });

  it('shows the API error', async () => {
    mockRateState.isError = true;
    mockRateState.error = { message: 'Recipe not found.' };
    await render(<StarRating recipeId="r1" />);
    expect(screen.getByTestId('star-rating-error')).toHaveTextContent('Recipe not found.');
  });
});
