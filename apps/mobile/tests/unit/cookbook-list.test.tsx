import { Platform } from 'react-native';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import RecipesScreen from '../../app/(food)/recipes';
import { recipeCardMeta } from '../../src/features/recipes/recipe-actions';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-REC-05 (paging + tab definitions), UX-REC-09 (Discover's empty state),
// UX-REC-10 (failed thumbnail) and UX-REC-13 (compact rows with source/date).

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    Link: ({ children }: { children: unknown }) => <Text>{children as string}</Text>,
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function row(id: string, more: Record<string, unknown> = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    imageUrl: null,
    cuisineType: 'Italian',
    prepTimeMins: 10,
    cookTimeMins: 20,
    nutritionInfo: { calories: 400, protein: 20, carbs: 40, fat: 10 },
    isFavourite: false,
    createdAt: new Date(2026, 8, 3),
    sourceUrl: null,
    ...more,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('cookbook paging (UX-REC-05)', () => {
  it('asks for the next page with the last row’s id when the list ends, and stops on a short page', async () => {
    const page1 = Array.from({ length: 30 }, (_, i) => row(`a${i}`));
    const page2 = [row('b0'), row('b1')];
    const calls: unknown[] = [];
    const h: Handlers = {
      'recipe.list': (input) => {
        calls.push(input);
        return (input as { cursor?: string }).cursor ? page2 : page1;
      },
    };
    await renderWithTrpc(<RecipesScreen />, h, testQueryClient());
    await screen.findByText('Recipe a0');
    expect(calls[0]).toMatchObject({ limit: 30, savedOnly: false, myRecipesOnly: false });

    await fireEvent(screen.getByTestId('recipes-list'), 'endReached');
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ cursor: 'a29' });
    // The list virtualises, so check the data the list holds rather than rendered rows.
    await waitFor(() => expect(screen.getByTestId('recipes-list').props.data).toHaveLength(32));

    // The second page was short: nothing more to ask for.
    await fireEvent(screen.getByTestId('recipes-list'), 'endReached');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(2);
  });

  it('a short first page never pages', async () => {
    const calls: unknown[] = [];
    await renderWithTrpc(
      <RecipesScreen />,
      { 'recipe.list': (i) => (calls.push(i), [row('a'), row('b')]) },
      testQueryClient(),
    );
    await screen.findByText('Recipe a');
    await fireEvent(screen.getByTestId('recipes-list'), 'endReached');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(1);
  });

  it('each tab says what it holds, and Mine points AI dishes to All', async () => {
    await renderWithTrpc(<RecipesScreen />, { 'recipe.list': () => [row('a')] }, testQueryClient());
    await screen.findByText('Recipe a');
    expect(screen.getByTestId('recipes-tab-caption')).toHaveTextContent(/your plans/);
    await userEvent.setup().press(screen.getByTestId('recipes-tab-my'));
    expect(screen.getByTestId('recipes-tab-caption')).toHaveTextContent(
      'Recipes you wrote or imported. Dishes from your plans are under All.',
    );
  });
});

describe('cookbook rows (UX-REC-13, UX-REC-10)', () => {
  it('shows the source domain or the added date so duplicates can be told apart', async () => {
    await renderWithTrpc(
      <RecipesScreen />,
      {
        'recipe.list': () => [
          row('a', { sourceUrl: 'https://www.example.com/lasagna' }),
          row('b', { sourceUrl: null }),
        ],
      },
      testQueryClient(),
    );
    await screen.findByText('Recipe a');
    expect(screen.getByTestId('recipe-card-a-meta')).toHaveTextContent(/^From example\.com/);
    expect(screen.getByTestId('recipe-card-b-meta')).toHaveTextContent(/^Added 3 Sep/);
  });

  it('a thumbnail that fails to load becomes a placeholder', async () => {
    await renderWithTrpc(<RecipesScreen />, { 'recipe.list': () => [row('a')] }, testQueryClient());
    await screen.findByText('Recipe a');
    await fireEvent(screen.getByTestId('recipe-card-a-image'), 'error');
    expect(await screen.findByTestId('recipe-card-a-image-placeholder')).toBeTruthy();
  });

  it('opens the recipe on tap', async () => {
    await renderWithTrpc(<RecipesScreen />, { 'recipe.list': () => [row('a')] }, testQueryClient());
    await userEvent.setup().press(await screen.findByTestId('recipe-card-a'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'a' } });
  });
});

describe('recipeCardMeta', () => {
  const now = new Date(2026, 9, 3);
  it('adds the year only when it is not this one', () => {
    expect(recipeCardMeta({ createdAt: new Date(2025, 11, 24) }, now)).toBe('Added 24 Dec 2025');
    expect(recipeCardMeta({ createdAt: new Date(2026, 0, 2) }, now)).toBe('Added 2 Jan');
  });
  it('combines source and date, and is null with neither', () => {
    expect(
      recipeCardMeta({ sourceUrl: 'https://a.com/x', createdAt: new Date(2026, 0, 2) }, now),
    ).toBe('From a.com · 2 Jan');
    expect(recipeCardMeta({}, now)).toBeNull();
  });
});

describe('Discover empty state (UX-REC-09)', () => {
  it('with no filter set, says the diet filters hid everything and links to the settings', async () => {
    await renderWithTrpc(
      <RecipesScreen />,
      {
        'recipe.list': () => [],
        'recipe.discover': () => [],
        'recipe.discoverHiddenCount': () => ({
          hiddenCount: 42,
          filteredFor: ['vegetarian', 'paleo'],
        }),
        'safety.getTable': () => null,
      },
      testQueryClient(),
    );
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('recipes-tab-discover'));
    expect(await screen.findByText('Your diet settings hide every dish')).toBeTruthy();
    expect(screen.getByTestId('discover-empty-filtered-for')).toHaveProp(
      'accessibilityLabel',
      'Filtered for vegetarian + paleo · 42 hidden',
    );
    expect(screen.queryByText('Try clearing the filters.')).toBeNull();
    await user.press(screen.getByTestId('discover-empty-diets'));
    expect(router.push).toHaveBeenCalledWith('/preferences');
  });

  it('with a filter on, it still says to clear the filters', async () => {
    await renderWithTrpc(
      <RecipesScreen />,
      {
        'recipe.list': () => [],
        'recipe.discover': () => [],
        'recipe.discoverHiddenCount': () => ({ hiddenCount: 0, filteredFor: [] }),
        'safety.getTable': () => null,
      },
      testQueryClient(),
    );
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('recipes-tab-discover'));
    await user.press(await screen.findByTestId('discover-quick'));
    expect(await screen.findByText('Try clearing the filters.')).toBeTruthy();
  });
});
