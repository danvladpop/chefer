import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import ShoppingListScreen from '../../app/(food)/shopping-list';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-SHOP-02 (errors + undo): removing a custom item says "Removed · Undo" and
// Undo puts it back; a failed Undo says so.

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn() },
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/pantry/pantry-check-banner', () => ({
  PantryCheckBanner: () => null,
}));
jest.mock('../../src/features/pantry/pantry-ghost-banner', () => ({
  PantryGhostBanner: () => null,
}));
jest.mock('../../src/features/pantry/pantry-panel', () => ({ PantryPanel: () => null }));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));

const list = () => ({
  planId: 'p1',
  hasPlan: true,
  weekStartDate: new Date().toISOString(),
  items: [
    {
      key: 'custom:flour',
      ingredientName: 'Flour',
      category: 'other',
      quantity: '2',
      unit: 'kg',
      isCustom: true,
    },
  ],
  checkedKeys: [],
  estimatedTotalEur: 0,
  pantry: { entitled: false, savedEur: 0 },
});

const base = (more: Handlers = {}): Handlers => ({
  'shoppingList.getForWeek': list,
  'mealPlan.getForWeek': () => null,
  'shoppingList.removeCustomItem': () => ({ ok: true }),
  ...more,
});

const serverDown = () => {
  throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
});

async function removeFlour(handlers: Handlers) {
  const user = userEvent.setup();
  const view = await renderWithTrpc(<ShoppingListScreen />, handlers, testQueryClient());
  // Aisles are open by default (UX-SHOP-02), so the row is already there.
  await user.press(await screen.findByLabelText('Remove Flour'));
  return { user, ...view };
}

describe('Shop: removing a custom item (UX-SHOP-02)', () => {
  it('says "Removed" with Undo, and Undo re-adds the item', async () => {
    const { user, calls } = await removeFlour(
      base({ 'shoppingList.addCustomItems': () => ({ ok: true }) }),
    );
    expect(await screen.findByText('Removed Flour')).toBeOnTheScreen();
    await user.press(screen.getByText('Undo'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'shoppingList.addCustomItems')?.input).toEqual({
        planId: 'p1',
        items: [{ name: 'Flour', quantity: 2, unit: 'kg' }],
      }),
    );
  });

  it('a failed Undo says so', async () => {
    const { user } = await removeFlour(base({ 'shoppingList.addCustomItems': serverDown }));
    await user.press(await screen.findByText('Undo'));
    expect(await screen.findByText(/Couldn't put it back/)).toBeOnTheScreen();
  });
});
