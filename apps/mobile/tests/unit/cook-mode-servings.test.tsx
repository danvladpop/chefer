import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import CookModeScreen from '../../app/cook/[id]';

// Backlog P2-3 / P1-1 / UX-REC-02: cook mode starts at the whole table's
// servings — the user's own plan portion PLUS each household member's portion
// (owner 2× + Mia ½ + Noah 1 = 3½), never the owner's portion multiplied
// across the table. Same as web's cook mode (`useHousehold().scaledMembers`).

let mockParams: Record<string, string> = { id: 'r1' };
let mockMembers: { name: string; portionFactor: number }[] | null = null;
let mockCookingFor: number | null = null;

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  // The unsaved-work guard (UX-COOK-02) reads navigation state.
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({
    memberCount: mockMembers?.length ?? 0,
    tablePortions: null,
    portionSum: null,
    scaledMembers: mockMembers,
  }),
}));
jest.mock('../../src/hooks/use-cooking-for', () => ({ useCookingFor: () => mockCookingFor }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/features/recipes/star-rating', () => ({ StarRating: () => null }));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    mealPlan: {
      getRecipe: {
        useQuery: () => ({
          isLoading: false,
          data: {
            id: 'r1',
            name: 'Lentil Curry',
            servings: 2,
            allergenWarnings: [],
            instructions: ['Simmer the lentils.'],
            ingredients: [{ name: 'lentils', quantity: 200, unit: 'g' }],
          },
        }),
      },
    },
    // T-02.3: the additive Checked-line query — no rules for this fixture.
    recipe: {
      getSafetyChecks: { useQuery: () => ({ data: { safetyChecks: null } }) },
    },
    tracker: {
      logRecipe: { useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false }) },
    },
  },
}));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

async function openIngredients() {
  const user = userEvent.setup();
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <CookModeScreen />
    </SafeAreaProvider>,
  );
  await user.press(screen.getByTestId('cook-ingredients-toggle'));
  return user;
}

beforeEach(() => {
  mockParams = { id: 'r1' };
  mockMembers = null;
  mockCookingFor = null;
});

describe('Cook mode servings', () => {
  it('starts at the recipe servings without a premium household', async () => {
    await openIngredients();
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('2');
    expect(screen.getByText(/200 g lentils/)).toBeOnTheScreen();
  });

  it('starts at the table: the user plus every member, for a premium household', async () => {
    mockMembers = [
      { name: 'Mia', portionFactor: 1 },
      { name: 'Sam', portionFactor: 1 },
      { name: 'Noah', portionFactor: 1 },
    ];
    await openIngredients();
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('4');
    expect(screen.getByText(/400 g lentils/)).toBeOnTheScreen();
    expect(screen.getByTestId('cook-table-portions')).toHaveTextContent(
      /You 1 · Mia 1 · Sam 1 · Noah 1 = 4/,
    );
  });

  it('adds the plan portion to the members instead of multiplying them (owner 2x + Mia 1/2 + Noah 1 = 3.5)', async () => {
    mockMembers = [
      { name: 'Mia', portionFactor: 0.5 },
      { name: 'Noah', portionFactor: 1 },
    ];
    mockParams = { id: 'r1', portion: '2' };
    await openIngredients();
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('3½');
    expect(screen.getByText(/350 g lentils/)).toBeOnTheScreen();
    expect(screen.getByTestId('cook-table-portions')).toHaveTextContent(
      /You 2 · Mia ½ · Noah 1 = 3½/,
    );
  });

  it('"two of us" without members cooks for two while the plan portion stays the eater\'s', async () => {
    mockCookingFor = 2;
    mockParams = { id: 'r1', portion: '1.5' };
    await openIngredients();
    // the 2-serving recipe at 1.5x = 3 servings, never fewer than 1.5 + 1
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('3');
  });

  it('the stepper rescales the ingredients', async () => {
    const user = await openIngredients();
    await user.press(screen.getByTestId('cook-servings-inc'));
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('3');
    expect(screen.getByText(/300 g lentils/)).toBeOnTheScreen();
  });
});
