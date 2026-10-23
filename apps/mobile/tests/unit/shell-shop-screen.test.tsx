import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { HOUSEHOLD_SHARING_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { kv } from '../../src/features/gym/offline/kv';
import { ShopScreen } from '../../src/features/shell/shop/shop-screen';
import { shopOutbox } from '../../src/features/shopping-list/shop-outbox';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// 10 Oct redesign, board "Shop" → the new shell's Shop tab: aisle cards with
// plain names, ticked items at the bottom of their aisle, one field that
// searches as you type and adds with +, one price chip and a done count.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

const row = (key: string, category: string, ingredientName: string, more: object = {}) => ({
  key,
  ingredientName,
  category,
  quantity: '1',
  unit: 'pcs',
  recipeNames: ['Something'],
  imageUrl: '',
  estimatedPriceEur: 2,
  ...more,
});

const list = (checkedKeys: string[] = ['spinach']) => ({
  planId: 'p1',
  hasPlan: true,
  weekStartDate: new Date().toISOString(),
  items: [
    row('spinach', 'produce', 'Spinach', { quantity: '300', unit: 'g' }),
    row('lemons', 'produce', 'Lemons', { quantity: '4' }),
    row('salmon', 'proteins', 'Salmon fillets', { quantity: '600', unit: 'g' }),
    row('milk', 'dairy', 'Milk'),
    row('custom:foil', 'other', 'Foil', { isCustom: true }),
  ],
  checkedKeys,
  estimatedTotalEur: 95,
});

const base = (more: Handlers = {}): Handlers => ({
  'shoppingList.getForWeek': () => list(),
  'mealPlan.getForWeek': () => null,
  'preferences.get': () => ({ chefProfile: { preferredUnits: 'METRIC' } }),
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  kv.remove('shop.aisles-expanded.v1');
  // ADR 0003: every test starts with an empty Shop outbox.
  kv.remove(KV_KEYS.shopOutbox);
  shopOutbox.reload();
  onlineManager.setOnline(true);
});

const rowOrder = (category: string) =>
  within(screen.getByTestId(`shop-group-${category}`))
    .getAllByRole('checkbox')
    .map((el) => (el.props as { testID: string }).testID);

describe('Shop tab (new shell)', () => {
  it('groups the list under the new aisle names with a status per aisle', async () => {
    await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    expect(await screen.findByText('Fruit & veg')).toBeOnTheScreen();
    expect(screen.getByText('Meat & fish')).toBeOnTheScreen();
    expect(screen.getByText('Dairy & eggs')).toBeOnTheScreen();
    expect(screen.getByText('Other')).toBeOnTheScreen();
    expect(screen.getByTestId('shop-group-produce-status')).toHaveTextContent('1 of 2 left');
    // Owner-approved minimal text: no recipe names, no per-item prices.
    expect(screen.queryByText(/Something/)).toBeNull();
  });

  it('shows one price range chip and the done count', async () => {
    await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    expect(await screen.findByTestId('shop-total')).toHaveTextContent(/^≈ €\d+–€?\d+$/);
    expect(screen.getByTestId('shop-done-count')).toHaveTextContent('1 of 5 done');
  });

  it('rows are checkboxes; ticked items sit at the bottom of their aisle', async () => {
    await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    await screen.findByText('Fruit & veg');
    expect(rowOrder('produce')).toEqual(['shop-item-lemons', 'shop-item-spinach']);
    expect(screen.getByTestId('shop-item-spinach')).toBeChecked();
    expect(screen.getByTestId('shop-item-spinach-qty')).toHaveTextContent('300 g');
  });

  it('ticking an item sends toggleItems and moves it down', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.getForWeek': () => list([]),
        'shoppingList.toggleItems': () => ({ ok: true }),
      }),
      testQueryClient(),
    );
    await screen.findByText('Fruit & veg');
    expect(rowOrder('produce')).toEqual(['shop-item-spinach', 'shop-item-lemons']);
    await user.press(screen.getByTestId('shop-item-spinach'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'shoppingList.toggleItems')?.input).toEqual({
        planId: 'p1',
        keys: ['spinach'],
        checked: true,
        // ADR 0003: the device time of the tick (last write per item wins on the server).
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      }),
    );
    await waitFor(() =>
      expect(rowOrder('produce')).toEqual(['shop-item-lemons', 'shop-item-spinach']),
    );
  });

  it('typing filters the list by name', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    await user.type(await screen.findByLabelText('Search or add an item'), 'sal');
    expect(await screen.findByText('Salmon fillets')).toBeOnTheScreen();
    expect(screen.queryByText('Lemons')).toBeNull();
    expect(screen.queryByText('Fruit & veg')).toBeNull();
  });

  it('+ adds the typed text as a custom item (the shared parser)', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <ShopScreen />,
      base({ 'shoppingList.addCustomItems': () => ({ ok: true }) }),
      testQueryClient(),
    );
    await user.type(await screen.findByLabelText('Search or add an item'), '2 kg flour');
    expect(screen.getByTestId('shop-no-match')).toBeOnTheScreen();
    await user.press(screen.getByLabelText('Add item'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'shoppingList.addCustomItems')?.input).toEqual({
        planId: 'p1',
        items: [{ name: 'flour', quantity: 2, unit: 'kg' }],
      }),
    );
  });

  it('+ with nothing typed says what it does and adds nothing', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    await screen.findByLabelText('Search or add an item');
    expect(screen.getByLabelText('Add item')).toHaveProp(
      'accessibilityHint',
      'Type an item to add',
    );
    await user.press(screen.getByLabelText('Add item'));
    expect(calls.find((c) => c.path === 'shoppingList.addCustomItems')).toBeUndefined();
  });

  it('a new item shows at once as "Saving…" and the field clears', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShopScreen />,
      base({ 'shoppingList.addCustomItems': () => new Promise(() => undefined) }),
      testQueryClient(),
    );
    const field = await screen.findByLabelText('Search or add an item');
    await user.type(field, '3 eggs');
    await user.press(screen.getByLabelText('Add item'));
    expect(await screen.findByText('Eggs')).toBeOnTheScreen();
    expect(screen.getByText('Saving…')).toBeOnTheScreen();
    expect(screen.getByLabelText('Search or add an item').props.value).toBe('');
  });

  it('a failed add rolls the row back and gives the text back', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.addCustomItems': () => {
          throw new Error('boom');
        },
      }),
      testQueryClient(),
    );
    await user.type(await screen.findByLabelText('Search or add an item'), 'saffron');
    await user.press(screen.getByLabelText('Add item'));
    await waitFor(() =>
      expect(screen.getByLabelText('Search or add an item').props.value).toBe('saffron'),
    );
    expect(screen.queryByText('Saffron')).toBeNull();
  });

  it('a tick the server refuses for good (the plan is gone) flips back', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.getForWeek': () => list([]),
        'shoppingList.toggleItems': () => {
          throw trpcError('NOT_FOUND', 404);
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('shop-item-lemons'));
    await waitFor(() => expect(screen.getByTestId('shop-item-lemons')).not.toBeChecked());
    expect(shopOutbox.entries()).toEqual([]);
  });

  it('ADR 0003: a tick that cannot reach the server stays ticked and waits in the outbox', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.getForWeek': () => list([]),
        'shoppingList.toggleItems': () => {
          throw new TypeError('Network request failed');
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('shop-item-lemons'));
    await waitFor(() =>
      expect(shopOutbox.entries()).toEqual([
        expect.objectContaining({ planId: 'p1', keys: ['lemons'], checked: true }),
      ]),
    );
    expect(screen.getByTestId('shop-item-lemons')).toBeChecked();
    // On disk, so a killed app still sends it later.
    expect(kv.getJSON(KV_KEYS.shopOutbox)).toEqual([
      expect.objectContaining({ keys: ['lemons'], checked: true }),
    ]);
  });

  it('your own items keep their remove button, with Undo', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.removeCustomItem': () => ({ ok: true }),
        'shoppingList.addCustomItems': () => ({ ok: true }),
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByLabelText('Remove Foil'));
    expect(await screen.findByText('Removed Foil')).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
  });

  it('an aisle header collapses and opens its rows', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('shop-group-produce-header'));
    expect(screen.queryByText('Lemons')).toBeNull();
    await user.press(screen.getByTestId('shop-group-produce-header'));
    expect(screen.getByText('Lemons')).toBeOnTheScreen();
  });

  it('Share in the top bar opens the share sheet', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    await screen.findByText('Fruit & veg');
    await user.press(screen.getByLabelText('Share the list'));
    expect(await screen.findByTestId('share-list-sheet-title')).toBeOnTheScreen();
  });

  it('no plan: says so and points to Meals', async () => {
    await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.getForWeek': () => ({
          hasPlan: false,
          items: [],
          checkedKeys: [],
          weekStartDate: new Date().toISOString(),
        }),
      }),
      testQueryClient(),
    );
    expect(await screen.findByTestId('shop-empty')).toBeOnTheScreen();
  });
});

describe('Shop tab: a shared household list (ADR 0003)', () => {
  const sharing = (role: 'OWNER' | 'PARTNER') => ({
    enabled: true,
    role,
    canInvite: false,
    ...(role === 'PARTNER' ? { owner: { name: 'Dan' } } : {}),
    partners: [],
    invites: [],
  });

  it('merges the partner’s ticks from shoppingList.sync and says who ticked', async () => {
    const { calls } = await renderWithTrpc(
      <ShopScreen />,
      base({
        'shoppingList.getForWeek': () => list([]),
        'household.sharing': () => sharing('OWNER'),
        'shoppingList.sync': () => ({
          planId: 'p1',
          revision: 'r1',
          checkedKeys: ['milk'],
          checkedBy: { milk: { name: 'Maria', isYou: false } },
        }),
      }),
      testQueryClient(),
    );
    await waitFor(() => expect(screen.getByTestId('shop-item-milk')).toBeChecked());
    expect(screen.getByTestId('shop-item-milk-who')).toHaveTextContent(
      HOUSEHOLD_SHARING_COPY.checkedBy({ name: 'Maria', isYou: false }),
    );
    expect(calls.find((c) => c.path === 'shoppingList.sync')?.input).toEqual({ weekOffset: 0 });
  });

  it('a partner sees whose list it is', async () => {
    await renderWithTrpc(
      <ShopScreen />,
      base({
        'household.sharing': () => sharing('PARTNER'),
        'shoppingList.sync': () => ({
          planId: 'p1',
          revision: 'r1',
          checkedKeys: ['spinach'],
          checkedBy: {},
        }),
      }),
      testQueryClient(),
    );
    expect(await screen.findByText(HOUSEHOLD_SHARING_COPY.partnerBanner('Dan'))).toBeOnTheScreen();
  });

  it('a solo household never polls', async () => {
    const { paths } = await renderWithTrpc(<ShopScreen />, base(), testQueryClient());
    await screen.findByText('Fruit & veg');
    expect(paths()).not.toContain('shoppingList.sync');
    expect(screen.queryByTestId('shop-partner-banner')).toBeNull();
  });
});
