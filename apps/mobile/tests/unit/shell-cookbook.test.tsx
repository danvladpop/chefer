import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import {
  CookbookScreen,
  cookbookTileMeta,
} from '../../src/features/shell/cookbook/cookbook-screen';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// 10 Oct redesign, board "Cookbook" → the new shell's Cookbook: New recipe /
// Import, one search, All · Saved · Mine · Discover, and photo tiles whose one
// action is the heart (the old optimistic `recipe.toggleFavourite`).

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const recipe = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  imageUrl: null,
  cuisineType: 'Greek',
  prepTimeMins: 10,
  cookTimeMins: 20,
  nutritionInfo: { calories: 520, protein: 30, carbs: 50, fat: 10 },
  isFavourite: false,
  ...over,
});

const base = (more: Handlers = {}): Handlers => ({
  'recipe.list': (input) =>
    (input as { savedOnly?: boolean }).savedOnly
      ? [recipe('r2', 'Thai Basil Beef', { isFavourite: true, creator: { firstName: 'Ana' } })]
      : [
          recipe('r1', 'Lemon Herb Salmon'),
          recipe('r2', 'Thai Basil Beef', { isFavourite: true, creator: { firstName: 'Ana' } }),
          recipe('r3', 'Overnight Oats'),
        ],
  'recipe.discover': () => [recipe('d1', 'Shawarma Bowls')],
  'recipe.discoverHiddenCount': () => ({ hiddenCount: 0, filteredFor: [] }),
  'safety.getTable': () => null,
  'recipe.toggleFavourite': () => ({ isFavourite: true }),
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Cookbook (new shell)', () => {
  it('shows recipes as tiles with "30 min · 520 kcal" and the From badge', async () => {
    await renderWithTrpc(<CookbookScreen />, base(), testQueryClient());
    expect(await screen.findByText('Lemon Herb Salmon')).toBeOnTheScreen();
    expect(screen.getAllByText('30 min · 520 kcal').length).toBe(3);
    expect(screen.getByLabelText('Thai Basil Beef, 30 min · 520 kcal, From Ana')).toBeOnTheScreen();
  });

  it('the heart toggles the favourite with the old mutation', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<CookbookScreen />, base(), testQueryClient());
    await screen.findAllByLabelText('Save to favourites');
    expect(screen.getByLabelText('Remove from favourites')).toBeOnTheScreen();
    await user.press(screen.getByTestId('cookbook-heart-r1'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'recipe.toggleFavourite')?.input).toEqual({
        recipeId: 'r1',
      }),
    );
  });

  it('Saved asks for saved recipes only; Discover uses the curated list', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<CookbookScreen />, base(), testQueryClient());
    await screen.findByText('Lemon Herb Salmon');
    await user.press(screen.getByTestId('cookbook-tab-saved'));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path === 'recipe.list' && (c.input as { savedOnly?: boolean }).savedOnly === true,
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('Lemon Herb Salmon')).toBeNull());
    await user.press(screen.getByTestId('cookbook-tab-discover'));
    expect(await screen.findByText('Shawarma Bowls')).toBeOnTheScreen();
    expect(screen.getByTestId('cookbook-discover-filters')).toBeOnTheScreen();
  });

  it('a tile opens the recipe; New recipe and Import push their screens', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CookbookScreen />, base(), testQueryClient());
    await user.press(await screen.findByLabelText(/^Lemon Herb Salmon/));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'r1' } });
    await user.press(screen.getByTestId('cookbook-new'));
    expect(router.push).toHaveBeenCalledWith('/recipe-form');
    await user.press(screen.getByTestId('cookbook-import'));
    expect(router.push).toHaveBeenCalledWith('/import-recipe');
  });

  it('Mine with nothing yet offers to create a recipe', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <CookbookScreen />,
      base({
        'recipe.list': (input) =>
          (input as { myRecipesOnly?: boolean }).myRecipesOnly ? [] : [recipe('r1', 'Soup')],
      }),
      testQueryClient(),
    );
    await screen.findByText('Soup');
    await user.press(screen.getByTestId('cookbook-tab-my'));
    expect(await screen.findByTestId('cookbook-empty-create')).toBeOnTheScreen();
  });

  it('a failed load offers a retry, not an empty cookbook', async () => {
    await renderWithTrpc(
      <CookbookScreen />,
      base({
        'recipe.list': () => {
          throw new Error('boom');
        },
      }),
      testQueryClient(),
    );
    expect(await screen.findByText("Couldn't load your recipes")).toBeOnTheScreen();
    expect(screen.queryByTestId('cookbook-empty')).toBeNull();
  });

  it('a full page loads the next one at the end of the list', async () => {
    const page = Array.from({ length: 30 }, (_, i) => recipe(`p${i}`, `Dish ${i}`));
    const list = jest.fn((input: unknown) =>
      (input as { cursor?: string }).cursor ? [recipe('last', 'Last Dish')] : page,
    );
    await renderWithTrpc(<CookbookScreen />, base({ 'recipe.list': list }), testQueryClient());
    const flat = await screen.findByTestId('cookbook-list');
    (flat.props as { onEndReached: () => void }).onEndReached();
    await waitFor(() =>
      expect(
        list.mock.calls.some(([input]) => (input as { cursor?: string }).cursor === 'p29'),
      ).toBe(true),
    );
  });
});

describe('cookbookTileMeta', () => {
  it('adds the nutrition caveat when the data is partial', () => {
    expect(cookbookTileMeta({ ...recipe('x', 'X'), nutritionStatus: 'PARTIAL' })).toMatch(
      /^30 min · 520 kcal · /,
    );
  });
});
