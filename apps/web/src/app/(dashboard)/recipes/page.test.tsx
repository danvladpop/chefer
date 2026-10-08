// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipesPage from './page';

// UX-REC-05 / UX-REC-09 / UX-REC-04 (web parity): the cookbook pages with a
// "Load more" button, says what each tab holds, explains an empty Discover
// that the diet filters emptied, and offers Undo for a recipe deleted on the
// recipe page.

const m = vi.hoisted(() => ({
  pages: [] as unknown[][],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  discover: [] as unknown[],
  hidden: { hiddenCount: 0, filteredFor: [] as string[] },
  restore: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => m.search,
}));
vi.mock('@/features/recipes/components/ImportRecipeSheet', () => ({
  ImportRecipeSheet: () => null,
}));
vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));
vi.mock('@/features/safety/components/WhatWeCheckSheet', () => ({ WhatWeCheckSheet: () => null }));

vi.mock('@/lib/trpc', () => {
  const node = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_target, prop: string) => {
        const name = path.join('.');
        if (prop === 'useInfiniteQuery') {
          return () => ({
            data: { pages: m.pages },
            isLoading: false,
            isError: false,
            isRefetching: false,
            refetch: vi.fn(),
            hasNextPage: m.hasNextPage,
            isFetchingNextPage: false,
            fetchNextPage: m.fetchNextPage,
          });
        }
        if (prop === 'useQuery') {
          return () => {
            if (name === 'recipe.discover') {
              return { data: m.discover, isLoading: false, isError: false, refetch: vi.fn() };
            }
            if (name === 'recipe.discoverHiddenCount') return { data: m.hidden };
            return { data: undefined, isLoading: false, isError: false };
          };
        }
        if (prop === 'useMutation') {
          return () =>
            name === 'recipe.restoreMine'
              ? { mutate: m.restore, isPending: false }
              : { mutate: vi.fn(), isPending: false };
        }
        if (prop === 'useUtils') return () => node(['utils']);
        return node([...path, prop]);
      },
      apply: () => node(path),
    });
  return { trpc: node([]) };
});

const row = (id: string) => ({
  id,
  name: `Recipe ${id}`,
  imageUrl: null,
  cuisineType: 'Italian',
  prepTimeMins: 5,
  cookTimeMins: 10,
  nutritionInfo: { calories: 300, protein: 10, carbs: 30, fat: 10 },
  isFavourite: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  m.pages = [[row('a'), row('b')]];
  m.hasNextPage = false;
  m.discover = [];
  m.hidden = { hiddenCount: 0, filteredFor: [] };
  m.search = new URLSearchParams();
});
afterEach(cleanup);

describe('Cookbook paging (UX-REC-05)', () => {
  it('offers Load more only while the API has another page, and asks for it', () => {
    render(<RecipesPage />);
    expect(screen.queryByTestId('recipes-load-more')).toBeNull();
    cleanup();

    m.hasNextPage = true;
    render(<RecipesPage />);
    fireEvent.click(screen.getByTestId('recipes-load-more'));
    expect(m.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('flattens every loaded page into the grid', () => {
    m.pages = [[row('a')], [row('b')]];
    render(<RecipesPage />);
    expect(screen.getByText('Recipe a')).toBeTruthy();
    expect(screen.getByText('Recipe b')).toBeTruthy();
  });

  it('says what each tab holds', () => {
    render(<RecipesPage />);
    expect(screen.getByTestId('recipes-tab-caption').textContent).toMatch(/your plans/);
    fireEvent.click(screen.getByRole('button', { name: /My Recipes/ }));
    expect(screen.getByTestId('recipes-tab-caption').textContent).toBe(
      'Recipes you wrote or imported. Dishes from your plans are under All.',
    );
  });
});

describe('Discover empty state (UX-REC-09)', () => {
  it('says the diet filters hid everything and links to the settings', () => {
    m.search = new URLSearchParams('tab=discover');
    m.hidden = { hiddenCount: 42, filteredFor: ['vegetarian', 'paleo'] };
    render(<RecipesPage />);
    expect(screen.getByText('Your diet settings hide every dish')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Review your diet settings' }).getAttribute('href'),
    ).toBe('/preferences');
    expect(screen.queryByText(/clear the filters/)).toBeNull();
  });
});

describe('Undo a deleted recipe (UX-REC-04)', () => {
  it('shows the Undo toast the recipe page handed over, and restores on Undo', () => {
    sessionStorage.setItem(
      'chefer.last-recipe-delete',
      JSON.stringify({ recipeId: 'r9', name: 'Soup', ts: Date.now() }),
    );
    render(<RecipesPage />);
    expect(screen.getByText('Deleted “Soup”')).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(m.restore).toHaveBeenCalledWith({ recipeId: 'r9' });
  });

  it('shows nothing when no delete is pending', () => {
    render(<RecipesPage />);
    expect(screen.queryByText(/^Deleted/)).toBeNull();
  });
});
