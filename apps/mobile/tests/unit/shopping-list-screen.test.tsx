import { Keyboard } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import ShoppingListScreen from '../../app/(food)/shopping-list';
import { openPremium } from '../../src/features/premium/open-premium';

// T-13.2 (share button) and T-10.4 (household week-1 line / week-2 lock) on
// the Shop screen.

const mockList = jest.fn<unknown, []>();
const mockPlan = jest.fn<unknown, []>();
const mockPremium = jest.fn<boolean | undefined, []>();
const mockHousehold = jest.fn<unknown, []>();

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn() },
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => jest.fn(),
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
jest.mock('../../src/hooks/use-household', () => ({ useHousehold: () => mockHousehold() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => mockPremium() }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));

const mockMutation = { mutate: jest.fn(), isPending: false, isError: false };
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      shoppingList: {
        getForWeek: {
          cancel: jest.fn(),
          getData: jest.fn(),
          setData: jest.fn(),
          invalidate: jest.fn(),
        },
      },
      pantry: { list: { invalidate: jest.fn() } },
    }),
    shoppingList: {
      getForWeek: { useQuery: () => mockList() },
      toggleItems: { useMutation: () => mockMutation },
      addCustomItems: { useMutation: () => mockMutation },
      removeCustomItem: { useMutation: () => mockMutation },
      regenerate: { useMutation: () => mockMutation },
    },
    pantry: { markOutOfStock: { useMutation: () => mockMutation } },
    mealPlan: { getForWeek: { useQuery: () => mockPlan() } },
    preferences: { get: { useQuery: () => ({ data: undefined }) } },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const list = (over: Record<string, unknown> = {}) => ({
  data: {
    planId: 'p1',
    hasPlan: true,
    weekStartDate: new Date().toISOString(),
    items: [{ key: 'a', ingredientName: 'Spinach', category: 'produce', quantity: 200, unit: 'g' }],
    checkedKeys: [],
    estimatedTotalEur: 40,
    pantry: { entitled: true, savedEur: 0 },
    ...over,
  },
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
});

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ShoppingListScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockPremium.mockReturnValue(false);
  mockHousehold.mockReturnValue({ memberCount: 0, tablePortions: null, portionSum: null });
  mockPlan.mockReturnValue({ data: undefined });
});

describe('Shop screen — share button (T-13.2)', () => {
  it('is enabled with items and opens the sheet', async () => {
    const user = userEvent.setup();
    mockList.mockReturnValue(list());
    await renderScreen();
    const share = screen.getByTestId('share-list');
    expect(share).toHaveAccessibleName('Share the list');
    expect(share).toBeEnabled();
    await user.press(share);
    expect(await screen.findByText('Send the list')).toBeOnTheScreen();
  });

  it('is disabled (and says so) when the list has no items', async () => {
    mockList.mockReturnValue(list({ items: [] }));
    await renderScreen();
    const share = screen.getByTestId('share-list');
    expect(share).toBeDisabled();
    expect(share.props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('Shop screen — household portions (T-10.4)', () => {
  it('week 1 (free, sized for the table): the free-first-week line', async () => {
    mockList.mockReturnValue(list({ portions: 4 }));
    mockPlan.mockReturnValue({ data: { firstScaledWeek: true, days: [] } });
    mockHousehold.mockReturnValue({ memberCount: 3, tablePortions: 4, portionSum: null });
    await renderScreen();
    expect(screen.getByTestId('shopping-first-week')).toHaveTextContent(
      'Sized for your table of 4 — free for your first week',
    );
    expect(screen.queryByTestId('shopping-household-locked')).toBeNull();
  });

  it('week 2 (free, household, not sized): 1-portion chip plus the lock card', async () => {
    const user = userEvent.setup();
    mockList.mockReturnValue(list());
    mockHousehold.mockReturnValue({ memberCount: 3, tablePortions: 4, portionSum: null });
    await renderScreen();
    expect(screen.getByTestId('shopping-one-portion')).toHaveTextContent('Sized for 1 portion');
    expect(screen.getByText('Keep portions for your table of 4')).toBeOnTheScreen();
    await user.press(screen.getByTestId('shopping-household-locked-see-what-premium-adds'));
    expect(openPremium).toHaveBeenCalledWith('household');
  });

  it('premium never sees the first-week line or the lock', async () => {
    mockPremium.mockReturnValue(true);
    mockList.mockReturnValue(list({ portions: 4 }));
    mockHousehold.mockReturnValue({ memberCount: 3, tablePortions: 4, portionSum: 4 });
    await renderScreen();
    expect(screen.queryByTestId('shopping-first-week')).toBeNull();
    expect(screen.queryByTestId('shopping-household-locked')).toBeNull();
  });
});

// Tester feedback 2026-10-04: adding an item closes the keyboard, from the
// keyboard's own Done key and from the + button alike.
describe('Shop screen — add an item (keyboard)', () => {
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    mockMutation.mutate.mockClear();
  });
  afterEach(() => dismiss.mockRestore());

  it('Done on the keyboard adds the item and closes the keyboard', async () => {
    const user = userEvent.setup();
    mockList.mockReturnValue(list());
    await renderScreen();
    const input = screen.getByTestId('add-item-input');
    expect(input.props.returnKeyType).toBe('done');
    await user.type(input, 'Oat milk');
    await fireEvent(input, 'submitEditing');
    expect(mockMutation.mutate).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('the + button adds the item and closes the keyboard', async () => {
    const user = userEvent.setup();
    mockList.mockReturnValue(list());
    await renderScreen();
    await user.type(screen.getByTestId('add-item-input'), 'Oat milk');
    await user.press(screen.getByTestId('add-item-submit'));
    expect(mockMutation.mutate).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('an empty name does nothing (the keyboard stays for the next try)', async () => {
    mockList.mockReturnValue(list());
    await renderScreen();
    await fireEvent(screen.getByTestId('add-item-input'), 'submitEditing');
    expect(mockMutation.mutate).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
