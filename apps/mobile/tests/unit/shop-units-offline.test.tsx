import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import ShoppingListScreen from '../../app/(food)/shopping-list';
import { kv } from '../../src/features/gym/offline/kv';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// WP-11 Shop: the add box understands the user's own units (UX-SHOP-01), aisles
// are open and remembered (UX-SHOP-02), a new row appears at once with a
// pending marker (UX-SHOP-02), and quantities/prices read as shop-sized numbers
// (UX-SHOP-03).

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn() },
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

const list = () => ({
  planId: 'p1',
  hasPlan: true,
  weekStartDate: new Date().toISOString(),
  items: [
    {
      key: 'p1-avocado',
      ingredientName: 'Avocado',
      category: 'produce',
      quantity: '1',
      unit: 'pcs',
      estimatedPriceEur: 6.56,
      recipeNames: [],
      imageUrl: '',
    },
    {
      key: 'p1-flour',
      ingredientName: 'Flour',
      category: 'grains',
      quantity: '500',
      unit: 'g',
      estimatedPriceEur: 0.4,
      recipeNames: [],
      imageUrl: '',
    },
  ],
  checkedKeys: [],
  estimatedTotalEur: 20,
  pantry: { entitled: false, savedEur: 0, itemCount: 0 },
});

const imperial = { chefProfile: { preferredUnits: 'IMPERIAL' } };
const metric = { chefProfile: { preferredUnits: 'METRIC' } };

const base = (more: Handlers = {}): Handlers => ({
  'shoppingList.getForWeek': list,
  'mealPlan.getForWeek': () => null,
  'preferences.get': () => metric,
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  kv.remove('shop.aisles-expanded.v1');
});

describe('Shop: add item in the user’s units (UX-SHOP-01)', () => {
  it('teaches kg to a metric user', async () => {
    await renderWithTrpc(<ShoppingListScreen />, base(), testQueryClient());
    expect((await screen.findByTestId('add-item-input')).props.placeholder).toContain('kg');
  });

  it('teaches lb to an imperial user', async () => {
    await renderWithTrpc(
      <ShoppingListScreen />,
      base({ 'preferences.get': () => imperial }),
      testQueryClient(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('add-item-input').props.placeholder).toContain('lb'),
    );
  });

  it('"2 lb chicken thighs" keeps its unit and the rest of the name', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <ShoppingListScreen />,
      base({ 'shoppingList.addCustomItems': () => ({ added: ['Chicken thighs'] }) }),
      testQueryClient(),
    );
    await user.type(await screen.findByTestId('add-item-input'), '2 lb chicken thighs');
    await user.press(screen.getByTestId('add-item-submit'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'shoppingList.addCustomItems')?.input).toEqual({
        planId: 'p1',
        items: [{ name: 'chicken thighs', quantity: 2, unit: 'lb' }],
      }),
    );
  });
});

describe('Shop: a new item shows at once (UX-SHOP-02)', () => {
  it('appears with a "Saving…" marker while the server has not answered, and the box clears', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShoppingListScreen />,
      base({ 'shoppingList.addCustomItems': () => new Promise(() => undefined) }),
      testQueryClient(),
    );
    await user.type(await screen.findByTestId('add-item-input'), '3 eggs');
    await user.press(screen.getByTestId('add-item-submit'));
    expect(await screen.findByText('Eggs')).toBeOnTheScreen();
    expect(screen.getByText(/Saving…/)).toBeOnTheScreen();
    expect(screen.getByTestId('add-item-input').props.value).toBe('');
  });

  it('a failed add rolls the row back and gives the text back', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShoppingListScreen />,
      base({
        'shoppingList.addCustomItems': () => {
          throw new Error('boom');
        },
      }),
      testQueryClient(),
    );
    await user.type(await screen.findByTestId('add-item-input'), 'saffron');
    await user.press(screen.getByTestId('add-item-submit'));
    await waitFor(() => expect(screen.getByTestId('add-item-input').props.value).toBe('saffron'));
    expect(screen.queryByText('Saffron')).toBeNull();
  });
});

describe('Shop: aisles open and remembered (UX-SHOP-02)', () => {
  it('starts open, and closing an aisle is written to the device', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ShoppingListScreen />, base(), testQueryClient());
    expect(await screen.findByText('Avocado')).toBeOnTheScreen();
    await user.press(screen.getByTestId('category-produce'));
    expect(screen.queryByText('Avocado')).toBeNull();
    expect(screen.getByText('Flour')).toBeOnTheScreen();
    expect(kv.getJSON('shop.aisles-expanded.v1')).toEqual({ produce: false });
  });

  it('an aisle closed last time is still closed', async () => {
    kv.setJSON('shop.aisles-expanded.v1', { produce: false });
    await renderWithTrpc(<ShoppingListScreen />, base(), testQueryClient());
    expect(await screen.findByText('Flour')).toBeOnTheScreen();
    expect(screen.queryByText('Avocado')).toBeNull();
  });
});

describe('Shop: numbers you can shop for (UX-SHOP-03)', () => {
  it('prices are whole units, never to the cent, and under one unit says so', async () => {
    await renderWithTrpc(<ShoppingListScreen />, base(), testQueryClient());
    // Whole units in whatever format the device uses ("€7", "7 €").
    expect(await screen.findByText(/~€?7(\D|$)/)).toBeOnTheScreen();
    expect(screen.queryByText(/6[.,]56/)).toBeNull();
    expect(screen.getByText(/(^|[^~])<€?1(\D|$)/)).toBeOnTheScreen();
    expect(screen.queryByText(/~</)).toBeNull();
  });

  it('shows quantities in the user’s units', async () => {
    await renderWithTrpc(
      <ShoppingListScreen />,
      base({ 'preferences.get': () => imperial }),
      testQueryClient(),
    );
    // 500 g of flour is 1.1 lb for an imperial user
    expect(await screen.findByText(/1[.,]1 lb/)).toBeOnTheScreen();
  });
});
