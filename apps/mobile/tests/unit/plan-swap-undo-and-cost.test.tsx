import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import MealPlanScreen from '../../app/(food)/meal-plan';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-PLAN-04: undoing a swap must not leave the slot pinned.
// UX-PLAN-05: the swap picker asks for the slot, states the check once, and
//   rows show kcal · protein · minutes.
// FB7-11: the Plan page no longer shows the price (Shop does).

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

const meal = {
  type: 'lunch',
  pinned: false,
  recipe: {
    id: 'r1',
    name: 'Lentil Curry',
    imageUrl: null,
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    nutritionInfo: { calories: 540, protein: 25, carbs: 60, fat: 12 },
    allergenWarnings: [],
  },
};

const basePlan = {
  planId: 'p1',
  weekStartDate: new Date().toISOString(),
  calorieTarget: 2000,
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, meals: [meal] })),
  trainingDays: [],
  tailoring: null,
  estimatedCost: { totalEur: 40, pricedLines: 5, totalLines: 5 },
};

const checks = { checked: [{ label: 'peanuts', who: 'you' }], taggedOnly: [] };
const pickRow = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  imageUrl: null,
  isFavourite: false,
  nutritionInfo: { calories: 420, protein: 31, carbs: 40, fat: 10 },
  prepTimeMins: 10,
  cookTimeMins: 15,
  safetyChecks: checks,
  ...over,
});

const base = (more: Handlers = {}, plan: object = basePlan): Handlers => ({
  'mealPlan.getForWeek': () => plan,
  'mealPlan.getShape': () => null,
  'targets.get': () => {
    throw trpcError('NOT_FOUND', 404);
  },
  'recipe.list': () => [pickRow('r2', 'A very long recipe name that needs a second line to read')],
  'recipe.listHiddenCount': () => ({ hiddenCount: 0, filteredFor: [] }),
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
});

describe('Plan swap: Undo and picker (UX-PLAN-04/05)', () => {
  it('Undo restores the previous pin state instead of pinning the slot', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <MealPlanScreen />,
      base({
        'mealPlan.replaceRecipe': () => ({
          id: 'r2',
          name: 'Chicken Salad',
          previousRecipeId: 'r1',
        }),
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-meal-swap-lunch'));
    await user.press(await screen.findByTestId('picker-recipe-r2'));
    await user.press(await screen.findByText('Undo'));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'mealPlan.replaceRecipe')).toHaveLength(2),
    );
    const [, undo] = calls.filter((c) => c.path === 'mealPlan.replaceRecipe');
    expect(undo?.input).toMatchObject({ recipeId: 'r1', pinned: false });
  });

  it('Undo of a swap over a pinned slot puts the pin back', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <MealPlanScreen />,
      base({
        'mealPlan.replaceRecipe': () => ({
          id: 'r2',
          name: 'Chicken Salad',
          previousRecipeId: 'r1',
          previousPinned: true,
        }),
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-meal-swap-lunch'));
    await user.press(await screen.findByTestId('picker-recipe-r2'));
    await user.press(await screen.findByText('Undo'));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'mealPlan.replaceRecipe')).toHaveLength(2),
    );
    const [, undo] = calls.filter((c) => c.path === 'mealPlan.replaceRecipe');
    expect(undo?.input).toMatchObject({ pinned: true });
  });

  it('asks the server for the slot, states the check once and shows protein and time', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<MealPlanScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('plan-meal-swap-lunch'));
    expect(await screen.findByTestId('picker-recipe-r2')).toBeOnTheScreen();
    expect(calls.filter((c) => c.path === 'recipe.list').map((c) => c.input)).toEqual(
      expect.arrayContaining([expect.objectContaining({ slotType: 'lunch', forTable: true })]),
    );
    expect(screen.getByTestId('picker-checked-header')).toHaveTextContent(
      /Suggestions checked for peanuts/,
    );
    // The same pill no longer repeats on every row.
    expect(screen.queryByTestId('picker-recipe-r2-checked')).toBeNull();
    expect(screen.getByTestId('picker-recipe-r2-meta')).toHaveTextContent(
      /420 kcal · 31 g protein · 25 min/,
    );
  });
});

describe('Plan page shows no price (FB7-11)', () => {
  it('has no cost line, whatever the plan carries', async () => {
    await renderWithTrpc(<MealPlanScreen />, base(), testQueryClient());
    await screen.findByTestId('plan-meal-lunch');
    expect(screen.queryByTestId('plan-week-cost')).toBeNull();
    expect(screen.queryByText(/≈/)).toBeNull();
    expect(screen.queryByText(/Cost estimate unavailable/)).toBeNull();
  });
});
