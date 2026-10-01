import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { FriendRecipeGrid } from '../../src/features/friends/profile/food/friend-recipe-grid';
import { FriendWeekView } from '../../src/features/friends/profile/food/friend-week-view';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { CAROL_ID, recipeCard, testQueryClient, weekDto } from './friends-profile-fixtures';

// Food tab (UX §9.2, §9.3, PRD FR-15, FR-16): another person's week, read-only,
// with `Hidden recipe` placeholders that are never pressable, and their
// recipes grid with source domains and an optimistic heart.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function renderWeek(h: Handlers, showTargets = true) {
  return renderWithTrpc(
    <FriendWeekView userId={CAROL_ID} firstName="Carol" showTargets={showTargets} />,
    h,
    testQueryClient(),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
});

describe('FriendWeekView', () => {
  it('shows the week line, today’s meals with portion and macros, and the day total', async () => {
    await renderWeek({ 'friends.week': () => weekDto() });
    expect(await screen.findByText('Week of 28 Sep')).toBeTruthy();
    expect(screen.getByText('avg 1,030 kcal/day')).toBeTruthy();
    expect(screen.getByText('Greek yogurt bowl')).toBeTruthy();
    expect(screen.getAllByText('1 portion')).toHaveLength(2);
    expect(screen.getByText('420 kcal · P 30 g · C 40 g · F 12 g')).toBeTruthy();
    expect(screen.getByText('Day total 1,030 kcal')).toBeTruthy();
    expect(screen.getByText('P 60 g · C 80 g · F 24 g')).toBeTruthy();
    // Today (owner's Tuesday) is selected by default.
    expect(screen.getByTestId('friends-week-day-1').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('a meal opens the recipe with the owner; a `Hidden recipe` is not a button', async () => {
    await renderWeek({ 'friends.week': () => weekDto() });
    const user = userEvent.setup();
    await user.press(await screen.findByText('Greek yogurt bowl'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'rcp-yogurt', owner: CAROL_ID },
    });

    router.push.mockClear();
    const hidden = screen.getByTestId('friends-week-meal-1-1');
    expect(hidden.props.accessibilityRole).toBeUndefined();
    expect(hidden.props.accessibilityLabel).toBe('Hidden recipe, 610 kcal');
    expect(hidden.props.onPress).toBeUndefined();
    expect(screen.getByTestId('friends-week-meal-1-1-placeholder')).toBeTruthy();
    await user.press(screen.getByText('Hidden recipe'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('an empty day says so; days without meals stay selectable', async () => {
    await renderWeek({ 'friends.week': () => weekDto() });
    await userEvent.setup().press(await screen.findByTestId('friends-week-day-2'));
    expect(await screen.findByText('Nothing planned for Wednesday.')).toBeTruthy();
  });

  it('no plan → `{first} hasn’t planned this week yet.`', async () => {
    await renderWeek({ 'friends.week': () => null });
    expect(await screen.findByText('Carol hasn’t planned this week yet.')).toBeTruthy();
  });

  const targets = { kcal: 2200, protein: 150, carbs: 220, fat: 70 };

  it('shows shared targets as one muted line, with no judgement', async () => {
    await renderWeek({ 'friends.week': () => weekDto({ targets }) });
    expect(await screen.findByText('Target 2,200 kcal · P 150 g')).toBeTruthy();
  });

  it('hides targets on my preview when I don’t share them', async () => {
    await renderWeek({ 'friends.week': () => weekDto({ targets }) }, false);
    expect(await screen.findByText('Day total 1,030 kcal')).toBeTruthy();
    expect(screen.queryByText('Target 2,200 kcal · P 150 g')).toBeNull();
  });
});

describe('FriendRecipeGrid', () => {
  const imported = recipeCard({
    id: 'rcp-soup',
    name: 'Lentil Tomato Soup',
    sourceDomain: 'seed-recipes.example.com',
    sourceUrl: 'https://www.seed-recipes.example.com/lentil-tomato-soup',
  });

  function renderGrid(h: Handlers, recipeCount = 2) {
    return renderWithTrpc(
      <FriendRecipeGrid userId={CAROL_ID} firstName="Carol" recipeCount={recipeCount} />,
      h,
      testQueryClient(),
    );
  }

  it('shows kcal · min per card and the source domain only on imported recipes', async () => {
    await renderGrid({
      'friends.recipes': () => ({ items: [recipeCard(), imported], nextCursor: null }),
    });
    expect(await screen.findByText('Lentil Tomato Soup')).toBeTruthy();
    expect(screen.getByText('seed-recipes.example.com')).toBeTruthy();
    expect(screen.queryByTestId('friends-recipes-card-rcp-shakshuka-domain')).toBeNull();
    expect(screen.getAllByText('420 kcal · 30 min')).toHaveLength(2);
    expect(screen.queryByTestId('friends-recipes-search')).toBeNull();
  });

  it('search appears above 12 recipes and is sent to the server', async () => {
    const recipes = jest.fn((input: unknown) => {
      void input;
      return { items: [recipeCard()], nextCursor: null };
    });
    await renderGrid({ 'friends.recipes': recipes }, 13);
    const field = await screen.findByTestId('friends-recipes-search');
    expect(field.props.accessibilityLabel).toBe('Search Carol’s recipes');
    await userEvent.setup().type(field, 'soup');
    await waitFor(() =>
      expect(recipes).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'soup' })),
    );
  });

  it('empty → `{first} hasn’t shared any recipes yet.`', async () => {
    await renderGrid({ 'friends.recipes': () => ({ items: [], nextCursor: null }) });
    expect(await screen.findByText('Carol hasn’t shared any recipes yet.')).toBeTruthy();
  });

  it('the heart is optimistic, labelled, and offers Undo', async () => {
    const toggle = jest.fn(() => ({ isSaved: true }));
    await renderGrid({
      'friends.recipes': () => ({ items: [recipeCard()], nextCursor: null }),
      'recipe.toggleFavourite': toggle,
    });
    const heart = await screen.findByLabelText('Save Shakshuka');
    expect(heart.props.accessibilityState).toMatchObject({ selected: false });
    await userEvent.setup().press(heart);
    expect(await screen.findByLabelText('Remove Shakshuka from saved')).toBeTruthy();
    expect(toggle).toHaveBeenCalledWith({ recipeId: 'rcp-shakshuka' });
    expect(await screen.findByText('Saved to your cookbook')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('a failed heart rolls back', async () => {
    const toggle = jest.fn(() => {
      throw new Error('boom');
    });
    await renderGrid({
      'friends.recipes': () => ({ items: [recipeCard()], nextCursor: null }),
      'recipe.toggleFavourite': toggle,
    });
    await userEvent.setup().press(await screen.findByLabelText('Save Shakshuka'));
    expect(await screen.findByText('Couldn’t update. Try again.')).toBeTruthy();
    expect(screen.getByLabelText('Save Shakshuka')).toBeTruthy();
  });

  it('a card opens the recipe with the owner', async () => {
    await renderGrid({ 'friends.recipes': () => ({ items: [imported], nextCursor: null }) });
    await userEvent.setup().press(await screen.findByTestId('friends-recipes-card-rcp-soup'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'rcp-soup', owner: CAROL_ID },
    });
  });
});
