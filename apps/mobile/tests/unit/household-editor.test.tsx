import { render, screen, userEvent } from '@testing-library/react-native';
import { HouseholdEditor } from '../../src/features/household/household-editor';

// Backlog P2-3: members (and their allergies + restrictions) are free on
// every tier; removing one asks first (F-ONB-3-2); scaling is the premium
// upsell.

const mockAdd = jest.fn();
const mockRemove = jest.fn();
let mockMembers: Record<string, unknown>[] = [];
let mockIsPremium: boolean | undefined = false;

jest.mock('../../src/hooks/use-is-premium', () => ({
  useIsPremium: () => mockIsPremium,
}));

jest.mock('../../src/lib/trpc', () => {
  const invalidate = () => Promise.resolve();
  return {
    trpc: {
      useUtils: () => ({
        household: { list: { invalidate } },
        preferences: { get: { invalidate } },
        mealPlan: { invalidate },
        shoppingList: { getForWeek: { invalidate } },
      }),
      household: {
        list: { useQuery: () => ({ data: mockMembers, isLoading: false }) },
        add: {
          useMutation: () => ({ mutate: mockAdd, isPending: false, isError: false, error: null }),
        },
        remove: { useMutation: () => ({ mutate: mockRemove, isPending: false }) },
      },
    },
  };
});

const sam = {
  id: 'm1',
  name: 'Sam',
  portionFactor: 0.5,
  isKid: true,
  allergies: ['peanuts'],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMembers = [];
  mockIsPremium = false;
});

describe('HouseholdEditor', () => {
  it('a FREE user adds a kid with allergies and restrictions', async () => {
    const user = userEvent.setup();
    await render(<HouseholdEditor />);

    await user.press(screen.getByTestId('household-preset-kid'));
    await user.type(screen.getByTestId('household-name'), 'Sam');
    await user.type(screen.getByTestId('household-allergies'), 'peanuts, sesame');
    await user.type(screen.getByTestId('household-restrictions'), 'Vegetarian');
    await user.press(screen.getByTestId('household-add'));

    expect(mockAdd).toHaveBeenCalledWith({
      name: 'Sam',
      portionFactor: 0.5,
      isKid: true,
      allergies: ['peanuts', 'sesame'],
      dietaryRestrictions: ['Vegetarian'],
      dislikedIngredients: [],
    });
  });

  it('removing a member asks for confirmation first', async () => {
    mockMembers = [sam];
    const user = userEvent.setup();
    await render(<HouseholdEditor />);

    await user.press(screen.getByTestId('household-remove-m1'));
    expect(mockRemove).not.toHaveBeenCalled();
    expect(screen.getByText(/stop applying to your plans/)).toBeOnTheScreen();

    await user.press(screen.getByTestId('household-confirm-remove-m1'));
    expect(mockRemove).toHaveBeenCalledWith({ id: 'm1' });
  });

  it('free tables see that scaling is premium; premium does not', async () => {
    mockMembers = [sam];
    await render(<HouseholdEditor />);
    expect(screen.getByTestId('household-upsell')).toBeOnTheScreen();
    expect(screen.getByText(/sized for one portion/)).toBeOnTheScreen();

    mockIsPremium = true;
    await render(<HouseholdEditor />);
    expect(screen.queryByTestId('household-upsell')).toBeNull();
  });

  it('the onboarding variant skips the empty card and the upsell', async () => {
    await render(<HouseholdEditor variant="onboarding" />);
    expect(screen.queryByTestId('household-empty')).toBeNull();
    expect(screen.queryByTestId('household-upsell')).toBeNull();
    expect(screen.getByTestId('household-add')).toBeOnTheScreen();
  });
});
