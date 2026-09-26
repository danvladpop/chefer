import { render, screen, userEvent } from '@testing-library/react-native';
import { pantryConfirmWeekKey } from '@chefer/utils';
import { kv } from '../../src/features/gym/offline/kv';
import {
  PANTRY_CHECK_KV_KEY,
  PantryCheckBanner,
} from '../../src/features/pantry/pantry-check-banner';

// F-PM-13: the weekly "Still have these?" check is an inline banner that
// skips items checked less than 3 days ago and asks at most once a week.

const DAY = 24 * 60 * 60 * 1000;
const mockConfirm = jest.fn();
let mockItems: { id: string; ingredientName: string; updatedAt: Date }[] = [];
let mockEnabled = true;

jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ enabled: mockEnabled, isPremium: mockEnabled, limit: null }),
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      pantry: { list: { invalidate: jest.fn() } },
      shoppingList: { getForWeek: { invalidate: jest.fn() } },
    }),
    pantry: {
      list: {
        useQuery: () => ({ data: { items: mockItems, count: mockItems.length } }),
      },
      confirmWeekly: {
        useMutation: () => ({ mutate: mockConfirm, isPending: false, isError: false }),
      },
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  kv.remove(PANTRY_CHECK_KV_KEY);
  mockEnabled = true;
  mockItems = [
    { id: 'rice', ingredientName: 'rice', updatedAt: new Date(Date.now() - 6 * DAY) },
    { id: 'eggs', ingredientName: 'eggs', updatedAt: new Date(Date.now() - 4 * DAY) },
    { id: 'milk', ingredientName: 'milk', updatedAt: new Date(Date.now() - 60 * 1000) },
  ];
});

describe('PantryCheckBanner', () => {
  it('asks only about items 3+ days old', async () => {
    const user = userEvent.setup();
    await render(<PantryCheckBanner />);
    expect(screen.getByText('2 items have been in your kitchen for a few days.')).toBeOnTheScreen();
    await user.press(screen.getByTestId('pantry-check-review'));
    expect(screen.getByTestId('pantry-check-item-rice')).toBeOnTheScreen();
    expect(screen.getByTestId('pantry-check-item-eggs')).toBeOnTheScreen();
    expect(screen.queryByTestId('pantry-check-item-milk')).toBeNull();
  });

  it('clears only the items tapped as used up', async () => {
    const user = userEvent.setup();
    await render(<PantryCheckBanner />);
    await user.press(screen.getByTestId('pantry-check-review'));
    await user.press(screen.getByTestId('pantry-check-item-rice'));
    await user.press(screen.getByTestId('pantry-check-done'));
    expect(mockConfirm).toHaveBeenCalledWith({ clearIds: ['rice'] });
  });

  it('stays hidden when everything was bought in the last 3 days', async () => {
    mockItems = [{ id: 'milk', ingredientName: 'milk', updatedAt: new Date() }];
    await render(<PantryCheckBanner />);
    expect(screen.queryByTestId('pantry-check-banner')).toBeNull();
  });

  it('"Not now" counts as answered for the week', async () => {
    const user = userEvent.setup();
    await render(<PantryCheckBanner />);
    await user.press(screen.getByTestId('pantry-check-dismiss'));
    expect(screen.queryByTestId('pantry-check-banner')).toBeNull();
    expect(kv.getString(PANTRY_CHECK_KV_KEY)).toBe(pantryConfirmWeekKey());
  });

  it('does not re-ask in a week already answered', async () => {
    kv.setString(PANTRY_CHECK_KV_KEY, pantryConfirmWeekKey());
    await render(<PantryCheckBanner />);
    expect(screen.queryByTestId('pantry-check-banner')).toBeNull();
  });

  it('never shows for accounts without pantry planning', async () => {
    mockEnabled = false;
    await render(<PantryCheckBanner />);
    expect(screen.queryByTestId('pantry-check-banner')).toBeNull();
  });
});
