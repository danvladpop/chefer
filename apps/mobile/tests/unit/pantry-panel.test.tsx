import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { PantryPanel } from '../../src/features/pantry/pantry-panel';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// WP-11 Pantry (UX-SHOP-05/07): every tier can remove, edit and Undo; the
// amount box refuses "abc"/"-5"; quantities and unit chips follow the units.

let mockPremium = false;
jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ enabled: mockPremium, isPremium: mockPremium, limit: null }),
}));
jest.mock('../../src/features/pantry/pantry-check-banner', () => ({
  PantryCheckBanner: () => null,
}));
jest.mock('../../src/features/pantry/pantry-ghost-banner', () => ({
  PantryGhostBanner: () => null,
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-rice',
  ingredientName: 'rice',
  quantity: 500,
  unit: 'g',
  source: 'PURCHASE',
  updatedAt: new Date().toISOString(),
  ...over,
});

const base = (more: Handlers = {}, units: 'METRIC' | 'IMPERIAL' = 'METRIC'): Handlers => ({
  'pantry.list': () => ({ items: [row()], count: 1 }),
  'preferences.get': () => ({ chefProfile: { preferredUnits: units } }),
  'shoppingList.getForWeek': () => null,
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  mockPremium = false;
});

describe('Pantry: remove and Undo for every tier (UX-SHOP-05)', () => {
  it('a FREE user can remove a row, and Undo puts it back', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <PantryPanel />,
      base({
        'pantry.removeItem': () => ({ ok: true, removed: row() }),
        'pantry.restoreItem': () => row(),
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByLabelText('Remove rice from your kitchen'));
    expect(await screen.findByText('Removed rice')).toBeOnTheScreen();
    await user.press(screen.getByText('Undo'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'pantry.restoreItem')?.input).toEqual({
        ingredientName: 'rice',
        quantity: 500,
        unit: 'g',
        source: 'PURCHASE',
      }),
    );
  });
});

describe('Pantry: edit a row (UX-SHOP-05)', () => {
  it('tapping a row opens the edit sheet, and Save sends the new amount and unit', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <PantryPanel />,
      base({ 'pantry.updateItem': () => row({ quantity: 250 }) }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('pantry-row-p-rice'));
    const qty = await screen.findByTestId('pantry-edit-qty');
    expect(qty.props.value).toBe('500');
    await user.clear(qty);
    await user.type(qty, '250');
    await user.press(screen.getByTestId('pantry-edit-save'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'pantry.updateItem')?.input).toEqual({
        id: 'p-rice',
        quantity: 250,
        unit: 'g',
      }),
    );
  });

  it('an empty amount is "some", and nonsense is refused with a message', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <PantryPanel />,
      base({ 'pantry.updateItem': () => row({ quantity: null }) }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('pantry-row-p-rice'));
    const qty = await screen.findByTestId('pantry-edit-qty');
    await user.clear(qty);
    await user.type(qty, '-5');
    await user.press(screen.getByTestId('pantry-edit-save'));
    expect(await screen.findByTestId('pantry-edit-error')).toBeOnTheScreen();
    expect(calls.some((c) => c.path === 'pantry.updateItem')).toBe(false);

    await user.clear(qty);
    await user.press(screen.getByTestId('pantry-edit-save'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'pantry.updateItem')?.input).toMatchObject({
        quantity: null,
      }),
    );
  });
});

describe('Pantry: add form (UX-SHOP-05/07)', () => {
  it('"abc" is refused with a message instead of being saved as "some left"', async () => {
    mockPremium = true;
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<PantryPanel />, base(), testQueryClient());
    await user.type(await screen.findByTestId('pantry-add-name'), 'flour');
    await user.type(screen.getByTestId('pantry-add-qty'), 'abc');
    await user.press(screen.getByTestId('pantry-add-submit'));
    expect(await screen.findByTestId('pantry-add-error')).toHaveTextContent(/above zero/);
    expect(calls.some((c) => c.path === 'pantry.addItem')).toBe(false);
  });

  it('a valid amount is sent as a number with the chosen unit', async () => {
    mockPremium = true;
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <PantryPanel />,
      base({ 'pantry.addItem': () => row() }),
      testQueryClient(),
    );
    await user.type(await screen.findByTestId('pantry-add-name'), 'flour');
    await user.type(screen.getByTestId('pantry-add-qty'), '2,5');
    await user.press(screen.getByTestId('pantry-unit-kg'));
    await user.press(screen.getByTestId('pantry-add-submit'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'pantry.addItem')?.input).toEqual({
        name: 'flour',
        quantity: 2.5,
        unit: 'kg',
      }),
    );
  });

  it('unit chips are 44 pt, say which one is selected, and are not colour-only', async () => {
    mockPremium = true;
    await renderWithTrpc(<PantryPanel />, base(), testQueryClient());
    const pcs = await screen.findByTestId('pantry-unit-pcs');
    expect(pcs.props.accessibilityState).toMatchObject({ selected: true });
    expect(pcs.props.className ?? '').toContain('min-h-11');
    expect(screen.getByTestId('pantry-unit-g').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('an imperial user gets lb/oz chips, not grams', async () => {
    mockPremium = true;
    await renderWithTrpc(<PantryPanel />, base({}, 'IMPERIAL'), testQueryClient());
    await waitFor(() => expect(screen.getByTestId('pantry-unit-lb')).toBeOnTheScreen());
    expect(screen.queryByTestId('pantry-unit-kg')).toBeNull();
  });
});

describe('Pantry: quantities in the user’s units (UX-SHOP-05)', () => {
  it('an imperial user sees pounds, not 500 g', async () => {
    await renderWithTrpc(<PantryPanel />, base({}, 'IMPERIAL'), testQueryClient());
    await waitFor(() => expect(screen.getByText(/1[.,]1 lb/)).toBeOnTheScreen());
  });

  it('the "some" state still reads "some left"', async () => {
    await renderWithTrpc(
      <PantryPanel />,
      base({ 'pantry.list': () => ({ items: [row({ quantity: null })], count: 1 }) }),
      testQueryClient(),
    );
    expect(await screen.findByText(/some left/)).toBeOnTheScreen();
  });
});
