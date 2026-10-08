// @vitest-environment jsdom
import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipeDetailPage from './page';

// UX-REC-04 / UX-REC-07 / UX-REC-11 (web parity with the mobile recipe page):
// owner Delete with confirm + an Undo handoff to the cookbook, Share, the
// source link on every import, spoon units kept in a metric display, and the
// servings note.

interface Shared {
  recipe: Record<string, unknown>;
  canEdit: boolean;
  push: ReturnType<typeof vi.fn>;
  deleteMutate: ReturnType<typeof vi.fn>;
  deleteOptions: { onSuccess?: () => void };
  fetchWeek: ReturnType<typeof vi.fn>;
  addItems: ReturnType<typeof vi.fn>;
}
const m = vi.hoisted(
  (): Shared => ({
    recipe: {},
    canEdit: true,
    push: vi.fn(),
    deleteMutate: vi.fn(),
    deleteOptions: {},
    fetchWeek: vi.fn(),
    addItems: vi.fn(),
  }),
);

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    'data-testid'?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ scaledMembers: null }) }));
vi.mock('@/hooks/useCookingFor', () => ({ useCookingFor: () => null }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'METRIC' }));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({ useAiConsent: () => vi.fn() }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/recipes/components/RecipeDetailImage', () => ({
  RecipeDetailImage: () => null,
}));
vi.mock('@/features/recipes/components/RecipeNutritionPanel', () => ({
  RecipeNutritionPanel: () => null,
}));

vi.mock('@/lib/trpc', () => {
  const node = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_target, prop: string) => {
        const name = path.join('.');
        if (prop === 'useQuery') {
          return () => {
            if (name === 'mealPlan.getRecipe') {
              return {
                data: m.recipe,
                isLoading: false,
                isError: false,
                refetch: vi.fn(),
                isRefetching: false,
              };
            }
            if (name === 'recipe.isSaved') {
              return {
                data: { isSaved: false, useInNextPlan: false, canEdit: m.canEdit },
                isLoading: false,
                isError: false,
              };
            }
            return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
          };
        }
        if (prop === 'fetch' && name === 'utils.mealPlan.getForWeek') return m.fetchWeek;
        if (prop === 'useMutation') {
          return (options: { onSuccess?: () => void } = {}) => {
            if (name === 'shoppingList.addCustomItems') {
              return { mutateAsync: m.addItems, isPending: false };
            }
            if (name === 'recipe.deleteMine') {
              m.deleteOptions = options;
              return { mutate: m.deleteMutate, isPending: false, isError: false, reset: vi.fn() };
            }
            return { mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() };
          };
        }
        if (prop === 'useUtils') return () => node(['utils']);
        return node([...path, prop]);
      },
      apply: () => node(path),
    });
  return { trpc: node([]) };
});

function recipe(more: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: 'Lentil soup',
    description: 'A thick soup.',
    imageUrl: null,
    cuisineType: 'Mediterranean',
    dietaryTags: [],
    prepTimeMins: 10,
    cookTimeMins: 20,
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

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  m.canEdit = true;
  m.recipe = recipe();
});
afterEach(cleanup);

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <RecipeDetailPage params={Promise.resolve({ id: 'r1' })} />
      </Suspense>,
    );
    await Promise.resolve();
  });
}

describe('Recipe detail: delete (UX-REC-04)', () => {
  it('only the owner sees Delete', async () => {
    m.canEdit = false;
    await renderPage();
    expect(await screen.findByTestId('recipe-share')).toBeTruthy();
    expect(screen.queryByTestId('recipe-delete')).toBeNull();
  });

  it('confirms first, then deletes, hands the Undo to the cookbook and leaves', async () => {
    await renderPage();
    fireEvent.click(await screen.findByTestId('recipe-delete'));
    expect(m.deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('recipe-delete-confirm'));
    expect(m.deleteMutate).toHaveBeenCalledWith({ recipeId: 'r1' });

    act(() => m.deleteOptions.onSuccess?.());
    expect(JSON.parse(sessionStorage.getItem('chefer.last-recipe-delete') ?? '{}')).toMatchObject({
      recipeId: 'r1',
      name: 'Lentil soup',
    });
    expect(m.push).toHaveBeenCalledWith('/recipes');
  });
});

describe('Recipe detail: add to week and shopping list (UX-REC-08)', () => {
  it('offers Add to my week on every recipe, not only your own', async () => {
    m.canEdit = false;
    await renderPage();
    fireEvent.click(await screen.findByTestId('recipe-add-to-week'));
    expect(await screen.findByTestId('add-to-week-sheet')).toBeTruthy();
  });

  it('adds the ingredients, scaled to the servings shown, to this week’s list', async () => {
    m.fetchWeek.mockResolvedValue({ planId: 'plan-1' });
    m.addItems.mockResolvedValue(undefined);
    await renderPage();
    fireEvent.click(await screen.findByLabelText('Increase servings'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('recipe-add-to-list'));
      await Promise.resolve();
    });
    expect(m.fetchWeek).toHaveBeenCalledWith({ weekOffset: 0 });
    expect(m.addItems).toHaveBeenCalledWith({
      planId: 'plan-1',
      items: [
        { name: 'Red lentils', quantity: 300, unit: 'g' },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      ],
    });
    expect(await screen.findByText('Added 2 ingredients to your shopping list')).toBeTruthy();
  });

  it('says "Make a plan first" when there is no plan and adds nothing', async () => {
    m.fetchWeek.mockResolvedValue(null);
    await renderPage();
    await act(async () => {
      fireEvent.click(await screen.findByTestId('recipe-add-to-list'));
      await Promise.resolve();
    });
    expect(m.addItems).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Make a plan first, then add ingredients to its list.'),
    ).toBeTruthy();
  });

  it('a failed add says so and keeps the button usable', async () => {
    m.fetchWeek.mockResolvedValue({ planId: 'plan-1' });
    m.addItems.mockRejectedValue(new Error(''));
    await renderPage();
    await act(async () => {
      fireEvent.click(await screen.findByTestId('recipe-add-to-list'));
      await Promise.resolve();
    });
    expect(await screen.findByText(/Couldn.t add them to the list/)).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>('recipe-add-to-list').disabled).toBe(false);
  });
});

describe('Recipe detail: duplicate (UX-REC-04)', () => {
  it('the owner gets Duplicate, which opens the create form for this recipe', async () => {
    await renderPage();
    const link = await screen.findByTestId('recipe-duplicate');
    expect(link.getAttribute('href')).toBe('/recipes/new?duplicateOf=r1');
  });

  it("someone else's recipe has no Duplicate", async () => {
    m.canEdit = false;
    await renderPage();
    expect(await screen.findByTestId('recipe-share')).toBeTruthy();
    expect(screen.queryByTestId('recipe-duplicate')).toBeNull();
  });
});

describe('Recipe detail: share, source, units (UX-REC-04/07/11)', () => {
  it('copies the recipe text when there is no native share sheet', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    await renderPage();
    await act(async () => {
      fireEvent.click(await screen.findByTestId('recipe-share'));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect((writeText.mock.calls[0] as unknown as [string])[0]).toContain('- 150 g Red lentils');
    expect(await screen.findByText('Recipe copied to the clipboard.')).toBeTruthy();
  });

  it('links back to the source of an imported recipe', async () => {
    m.recipe = recipe({ sourceUrl: 'https://www.youtube.com/watch?v=abc' });
    await renderPage();
    const link = await screen.findByTestId('recipe-source');
    expect(link.textContent).toBe('Source: youtube.com');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('keeps tbsp as tbsp in a metric display, and says what scaling changed', async () => {
    await renderPage();
    expect(await screen.findByText('1 tbsp')).toBeTruthy();
    expect(screen.queryByTestId('recipe-servings-note')).toBeNull();
    fireEvent.click(screen.getByLabelText('Increase servings'));
    expect(screen.getByText('2 tbsp')).toBeTruthy();
    expect(screen.queryByText(/ml/)).toBeNull();
    expect(screen.getByTestId('recipe-servings-note').textContent).toMatch(
      /Cooking for 2 \(recipe makes 1\)/,
    );
    expect(screen.getByTestId('recipe-servings-note').textContent).toMatch(/600 kcal/);
  });

  it('UX-COOK-05: Cook carries the servings chosen here, up to the shared cap of 20', async () => {
    await renderPage();
    const cook = () => screen.getByText('Cook').closest('a');
    await screen.findByText('1 tbsp');
    expect(cook()?.getAttribute('href')).toBe('/recipes/r1/cook');

    fireEvent.click(screen.getByLabelText('Increase servings'));
    fireEvent.click(screen.getByLabelText('Increase servings'));
    expect(cook()?.getAttribute('href')).toBe('/recipes/r1/cook?servings=3');

    for (let i = 0; i < 25; i++) fireEvent.click(screen.getByLabelText('Increase servings'));
    expect(cook()?.getAttribute('href')).toBe('/recipes/r1/cook?servings=20');
    expect(screen.getByLabelText('Increase servings').className).toMatch(/\bh-11\b/);
  });
});
