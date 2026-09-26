import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import CookModeScreen from '../../app/cook/[id]';

// Backlog P2-3 / P1-1: cook mode starts at a premium household's table
// portions, multiplied by the plan slot's portion when opened from the plan —
// same as web's cook mode (`useHousehold().portionSum` × `?portion=`).

let mockParams: Record<string, string> = { id: 'r1' };
let mockPortionSum: number | null = null;

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: mockPortionSum }),
}));
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
  mockPortionSum = null;
});

describe('Cook mode servings', () => {
  it('starts at the recipe servings without a premium household', async () => {
    await openIngredients();
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('2');
    expect(screen.getByText(/200 g lentils/)).toBeOnTheScreen();
  });

  it('starts at the table portions for a premium household', async () => {
    mockPortionSum = 4;
    await openIngredients();
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('4');
    expect(screen.getByText(/400 g lentils/)).toBeOnTheScreen();
    expect(screen.getByTestId('cook-table-portions')).toHaveTextContent(/table of 4 portions/);
  });

  it('multiplies the table by the plan slot portion when opened from the plan', async () => {
    mockPortionSum = 4;
    mockParams = { id: 'r1', portion: '1.5' };
    await openIngredients();
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('6');
    expect(screen.getByText(/600 g lentils/)).toBeOnTheScreen();
  });

  it('the stepper rescales the ingredients', async () => {
    const user = await openIngredients();
    await user.press(screen.getByTestId('cook-servings-inc'));
    expect(screen.getByTestId('cook-servings')).toHaveTextContent('3');
    expect(screen.getByText(/300 g lentils/)).toBeOnTheScreen();
  });
});
