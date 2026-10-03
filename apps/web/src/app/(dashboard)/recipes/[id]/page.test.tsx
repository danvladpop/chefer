// @vitest-environment jsdom
import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecipeDetailPage from './page';

// UX-REC-03 (web parity): a recipe that failed to LOAD is not "Recipe not
// found". Only a real NOT_FOUND says that; anything else offers Try again.

const m = vi.hoisted(() => ({
  recipe: { data: undefined, isLoading: false, isError: false, error: null } as {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
  },
  refetch: vi.fn(),
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
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ scaledMembers: null }) }));
vi.mock('@/hooks/useCookingFor', () => ({ useCookingFor: () => null }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'metric' }));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({ useAiConsent: () => vi.fn() }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/recipes/components/RecipeDetailImage', () => ({
  RecipeDetailImage: () => null,
}));

// Every query answers "nothing yet" except the recipe itself; every mutation is inert.
vi.mock('@/lib/trpc', () => {
  const node = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_target, prop: string) => {
        if (prop === 'useQuery') {
          return () =>
            path.join('.') === 'mealPlan.getRecipe'
              ? { ...m.recipe, refetch: m.refetch, isRefetching: false }
              : { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
        }
        if (prop === 'useMutation') {
          return () => ({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() });
        }
        return node([...path, prop]);
      },
      apply: () => node(path),
    });
  return { trpc: node([]) };
});

beforeEach(() => {
  vi.clearAllMocks();
  m.recipe = { data: undefined, isLoading: false, isError: false, error: null };
});
afterEach(cleanup);

async function renderPage() {
  // `use(params)` suspends until the promise settles — flush it inside act.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <RecipeDetailPage params={Promise.resolve({ id: 'r1' })} />
      </Suspense>,
    );
  });
}

describe('Recipe detail: failed load (UX-REC-03)', () => {
  it('a server failure shows an error with Try again, not "Recipe not found"', async () => {
    m.recipe = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { httpStatus: 500 } },
    };
    await renderPage();
    expect(await screen.findByTestId('recipe-load-error')).toBeTruthy();
    expect(screen.queryByText('Recipe not found.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(m.refetch).toHaveBeenCalled();
  });

  it('a real NOT_FOUND keeps its copy', async () => {
    m.recipe = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { data: { code: 'NOT_FOUND', httpStatus: 404 } },
    };
    await renderPage();
    expect(await screen.findByTestId('recipe-not-found')).toBeTruthy();
    expect(screen.queryByTestId('recipe-load-error')).toBeNull();
  });
});
