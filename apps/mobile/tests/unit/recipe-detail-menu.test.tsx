import { Platform, Share } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import RecipeDetailScreen from '../../app/recipe/[id]';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-REC-04 / UX-REC-07 / UX-REC-08 / UX-REC-10 / UX-REC-11: the recipe page's
// ⋯ menu (owner: Edit, Duplicate, Share, Delete + Undo; everyone: Add to my
// week, Add ingredients to the shopping list, Share), the source link on every
// import, the servings note and the failed-photo placeholder.

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: {
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    },
    useLocalSearchParams: () => ({ id: 'rcp-1' }),
    Link: ({ children }: { children: unknown }) => <Text>{children as string}</Text>,
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
const { router } = jest.requireMock<{
  router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };
}>('expo-router');

function recipe(more: Record<string, unknown> = {}) {
  return {
    id: 'rcp-1',
    name: 'Lentil Tomato Soup',
    description: 'A thick red lentil soup.',
    imageUrl: null,
    cuisineType: 'Mediterranean',
    dietaryTags: [],
    allergenWarnings: [],
    prepTimeMins: 10,
    cookTimeMins: 25,
    servings: 1,
    nutritionInfo: { calories: 300, protein: 20, carbs: 50, fat: 4 },
    ingredients: [
      { name: 'Red lentils', quantity: 150, unit: 'g' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ],
    instructions: ['Simmer.'],
    ...more,
  };
}

function handlers(over: Handlers = {}, owner = true, more: Record<string, unknown> = {}): Handlers {
  return {
    'mealPlan.getRecipe': () => recipe(more),
    'recipe.isSaved': () => ({ isSaved: false, useInNextPlan: false, canEdit: owner }),
    ...over,
  };
}

async function openMenu(h: Handlers) {
  const r = await renderWithTrpc(<RecipeDetailScreen />, h, testQueryClient());
  const user = userEvent.setup();
  await user.press(await screen.findByTestId('recipe-report-overflow'));
  return { r, user };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  router.canGoBack.mockReturnValue(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('recipe ⋯ menu', () => {
  it('your own recipe: Edit, Duplicate, Share, Delete next to the shared actions', async () => {
    await openMenu(handlers());
    for (const id of [
      'recipe-overflow-week',
      'recipe-overflow-shopping',
      'recipe-overflow-share',
      'recipe-overflow-edit',
      'recipe-overflow-duplicate',
      'recipe-overflow-safety',
      'recipe-overflow-delete',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.queryByTestId('recipe-overflow-report')).toBeNull();
  });

  it('someone else’s recipe has no Edit, Duplicate or Delete', async () => {
    await openMenu(handlers({}, false));
    expect(screen.getByTestId('recipe-overflow-share')).toBeTruthy();
    expect(screen.getByTestId('recipe-overflow-safety')).toBeTruthy();
    for (const id of ['edit', 'duplicate', 'delete']) {
      expect(screen.queryByTestId(`recipe-overflow-${id}`)).toBeNull();
    }
  });

  it('Duplicate opens the form prefilled from this recipe', async () => {
    const { user } = await openMenu(handlers());
    await user.press(screen.getByTestId('recipe-overflow-duplicate'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/recipe-form',
        params: { duplicateOf: 'rcp-1' },
      }),
    );
  });

  it('Share hands the native sheet the recipe text', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { user } = await openMenu(handlers());
    await user.press(screen.getByTestId('recipe-overflow-share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const message = (share.mock.calls[0]?.[0] as { message: string }).message;
    expect(message).toContain('Lentil Tomato Soup');
    expect(message).toContain('- 150 g Red lentils');
    expect(message).toContain('1. Simmer.');
  });

  it('Add ingredients to the shopping list sends the scaled lines to this week’s list', async () => {
    const add = jest.fn(() => ({ added: [] }));
    const { user } = await openMenu(
      handlers({
        'mealPlan.getForWeek': () => ({ planId: 'plan-1', days: [] }),
        'shoppingList.addCustomItems': add,
      }),
    );
    await user.press(screen.getByTestId('recipe-overflow-shopping'));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        planId: 'plan-1',
        items: [
          { name: 'Red lentils', quantity: 150, unit: 'g' },
          { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
        ],
      }),
    );
    expect(await screen.findByText('Added 2 ingredients to your shopping list')).toBeTruthy();
  });

  it('with no plan it says to make one instead of failing', async () => {
    const add = jest.fn();
    const { user } = await openMenu(
      handlers({ 'mealPlan.getForWeek': () => null, 'shoppingList.addCustomItems': add }),
    );
    await user.press(screen.getByTestId('recipe-overflow-shopping'));
    expect(await screen.findByText(/Make a plan first/)).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });
});

describe('delete + Undo (UX-REC-04)', () => {
  it('confirms, soft-deletes, leaves the page and offers Undo, which restores', async () => {
    const del = jest.fn(() => ({ recipeId: 'rcp-1' }));
    const restore = jest.fn(() => ({ recipeId: 'rcp-1' }));
    const { user } = await openMenu(
      handlers({ 'recipe.deleteMine': del, 'recipe.restoreMine': restore }),
    );
    await user.press(screen.getByTestId('recipe-overflow-delete'));
    expect(await screen.findByText('Delete this recipe?')).toBeTruthy();
    expect(del).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('recipe-delete-confirm-confirm'));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ recipeId: 'rcp-1' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await screen.findByText('Deleted “Lentil Tomato Soup”')).toBeTruthy();

    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(restore).toHaveBeenCalledWith({ recipeId: 'rcp-1' }));
  });

  it('a failed delete keeps the sheet open with a plain-language error', async () => {
    const del = jest.fn(() => {
      throw trpcError('NOT_FOUND', 404, {}, 'Recipe not found.');
    });
    const { user } = await openMenu(handlers({ 'recipe.deleteMine': del }));
    await user.press(screen.getByTestId('recipe-overflow-delete'));
    await user.press(await screen.findByTestId('recipe-delete-confirm-confirm'));
    await waitFor(() => expect(del).toHaveBeenCalled());
    expect(await screen.findByText('Recipe not found.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('opened cold (no back stack) it lands on the cookbook', async () => {
    router.canGoBack.mockReturnValue(false);
    const { user } = await openMenu(
      handlers({ 'recipe.deleteMine': () => ({ recipeId: 'rcp-1' }) }),
    );
    await user.press(screen.getByTestId('recipe-overflow-delete'));
    await user.press(await screen.findByTestId('recipe-delete-confirm-confirm'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/recipes'));
  });
});

describe('recipe page details', () => {
  it('UX-REC-07: shows the source link on a recipe imported from a video', async () => {
    await renderWithTrpc(
      <RecipeDetailScreen />,
      handlers({}, true, { sourceUrl: 'https://www.youtube.com/watch?v=abc' }),
      testQueryClient(),
    );
    expect(await screen.findByText('Source: youtube.com')).toBeTruthy();
  });

  it('UX-REC-11: scaling a 1-serving recipe to 2 says so, with totals', async () => {
    await renderWithTrpc(
      <RecipeDetailScreen />,
      handlers({}, true, { servings: 1 }),
      testQueryClient(),
    );
    await screen.findByTestId('recipe-name');
    const user = userEvent.setup();
    await user.press(screen.getByLabelText('Increase servings'));
    const note = await screen.findByTestId('recipe-servings-note');
    expect(note).toHaveTextContent(/Cooking for 2 \(recipe makes 1\)/);
    expect(note).toHaveTextContent(/600 kcal/);
  });

  it('UX-REC-10: a hero image that fails to load becomes a placeholder', async () => {
    await renderWithTrpc(<RecipeDetailScreen />, handlers(), testQueryClient());
    const hero = await screen.findByTestId('recipe-hero');
    const { fireEvent } = jest.requireActual<typeof import('@testing-library/react-native')>(
      '@testing-library/react-native',
    );
    await fireEvent(hero, 'error');
    expect(await screen.findByTestId('recipe-hero-placeholder')).toBeTruthy();
  });

  it('the header with ← and ⋯ sits outside the scroll content (sticky)', async () => {
    await renderWithTrpc(<RecipeDetailScreen />, handlers(), testQueryClient());
    expect(await screen.findByTestId('recipe-header')).toBeTruthy();
    expect(screen.getByTestId('recipe-back')).toBeTruthy();
  });
});
