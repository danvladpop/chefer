import { screen, userEvent, waitFor } from '@testing-library/react-native';
import CookModeScreen from '../../app/cook/[id]';
import RecipeDetailScreen from '../../app/recipe/[id]';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-REC-03 / UX-COOK-03: a recipe that failed to LOAD is not "Recipe not
// found" (recipe detail) and not an endless spinner (cook mode). A failed load
// shows ErrorState with Retry; only a real NOT_FOUND says "not found". A recipe
// with no steps opens on its ingredients, not "Step 0 of 0".

jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'r1' }),
  Link: () => null,
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/features/recipes/star-rating', () => ({ StarRating: () => null }));
const { router } = jest.requireMock<{ router: { back: jest.Mock } }>('expo-router');

function recipe(more: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: 'Lentil Curry',
    description: 'A curry.',
    imageUrl: null,
    cuisineType: 'Indian',
    dietaryTags: [],
    allergenWarnings: [],
    prepTimeMins: 10,
    cookTimeMins: 25,
    servings: 2,
    nutritionInfo: { calories: 340, protein: 20, carbs: 56, fat: 4 },
    ingredients: [{ name: 'lentils', quantity: 200, unit: 'g' }],
    instructions: ['Simmer the lentils.'],
    ...more,
  };
}

const serverDown = () => {
  throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
};
const notFound = () => {
  throw trpcError('NOT_FOUND', 404, {}, 'Recipe not found.');
};

beforeEach(() => jest.clearAllMocks());

describe('Recipe detail: failed load (REC-03)', () => {
  const render = (handlers: Handlers) =>
    renderWithTrpc(<RecipeDetailScreen />, handlers, testQueryClient());

  it('a server failure shows ErrorState with Retry, not "Recipe not found"', async () => {
    await render({ 'mealPlan.getRecipe': serverDown });
    await waitFor(() => expect(screen.getByTestId('recipe-load-error')).toBeOnTheScreen());
    expect(screen.queryByText('Recipe not found.')).toBeNull();
  });

  it('Retry loads the recipe once the server is back', async () => {
    let up = false;
    const user = userEvent.setup();
    await render({
      'mealPlan.getRecipe': () => (up ? recipe() : serverDown()),
      'recipe.isSaved': () => ({ isSaved: false, useInNextPlan: false, canEdit: false }),
    });
    await waitFor(() => expect(screen.getByTestId('recipe-load-error')).toBeOnTheScreen());
    up = true;
    await user.press(screen.getByTestId('recipe-load-error-retry'));
    await waitFor(() => expect(screen.queryByTestId('recipe-load-error')).toBeNull());
    expect(await screen.findByText('Lentil Curry')).toBeOnTheScreen();
  });

  it('a real NOT_FOUND keeps its copy', async () => {
    await render({ 'mealPlan.getRecipe': notFound });
    await waitFor(() => expect(screen.getByTestId('recipe-not-found')).toBeOnTheScreen());
    expect(screen.queryByTestId('recipe-load-error')).toBeNull();
  });
});

describe('Cook mode: failed load (COOK-03)', () => {
  const render = (handlers: Handlers) =>
    renderWithTrpc(<CookModeScreen />, handlers, testQueryClient());

  it('a failed load shows ErrorState with Retry and a Close button, not a spinner', async () => {
    const user = userEvent.setup();
    await render({ 'mealPlan.getRecipe': serverDown });
    await waitFor(() => expect(screen.getByTestId('cook-load-error')).toBeOnTheScreen());
    await user.press(screen.getByTestId('cook-error-close'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('Retry opens the cook screen once the server is back', async () => {
    let up = false;
    const user = userEvent.setup();
    await render({ 'mealPlan.getRecipe': () => (up ? recipe() : serverDown()) });
    await waitFor(() => expect(screen.getByTestId('cook-load-error')).toBeOnTheScreen());
    up = true;
    await user.press(screen.getByTestId('cook-load-error-retry'));
    expect(await screen.findByTestId('cook-step-text')).toHaveTextContent('Simmer the lentils.');
  });

  it('a real NOT_FOUND says so, with Close', async () => {
    await render({ 'mealPlan.getRecipe': notFound });
    await waitFor(() => expect(screen.getByTestId('cook-not-found')).toBeOnTheScreen());
    expect(screen.getByTestId('cook-error-close')).toBeOnTheScreen();
  });

  it('a recipe with no steps opens on the ingredients: no "Step 0 of 0"', async () => {
    await render({ 'mealPlan.getRecipe': () => recipe({ instructions: [] }) });
    expect(await screen.findByText('Ingredients')).toBeOnTheScreen();
    expect(screen.queryByText(/Step 0 of 0/)).toBeNull();
    expect(screen.getByTestId('cook-no-steps-done')).toBeOnTheScreen();
  });
});
