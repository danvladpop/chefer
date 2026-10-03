// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TonightCard } from './tonight-card';

// T-04.7 delta: Swap opens the existing ReplaceMealSheet inline (via the
// onSwap callback) when the caller wires one up; falls back to a plain link
// to /meal-plan when it doesn't (e.g. rendered standalone here).

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/features/safety/components/CheckedForChip', () => ({
  CheckedForChip: () => null,
}));
let mockExisting: { rating: number; notes: string | null } | null = null;
vi.mock('@/features/recipe/components/StarRatingWidget', () => ({
  StarRatingWidget: ({ recipeId }: { recipeId: string }) => (
    <div data-testid="star-rating-widget" data-recipe={recipeId} />
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    recipe: {
      getMyRating: { useQuery: () => ({ data: mockExisting, isLoading: false }) },
    },
    useUtils: () => ({
      dashboard: { summary: { invalidate: vi.fn() } },
      tracker: { getDay: { invalidate: vi.fn() }, weeklySummary: { invalidate: vi.fn() } },
    }),
    tracker: {
      logRecipe: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  mockExisting = null;
});

const meal = {
  planId: 'plan-1',
  dayOfWeek: 2,
  slotIndex: 0,
  mealType: 'dinner',
  done: false,
  recipe: {
    id: 'recipe-1',
    name: 'Sheet-Pan Salmon',
    description: '',
    imageUrl: null,
    kcal: 520,
    servings: 2,
    prepTimeMins: 10,
    cookTimeMins: 20,
  },
};

describe('TonightCard — Swap (T-04.7 delta)', () => {
  it('without onSwap, Swap is a plain link to /meal-plan', () => {
    render(<TonightCard meal={meal} showNutrition={false} onLogged={vi.fn()} />);
    const swap = screen.getByTestId('tonight-swap');
    expect(swap.tagName).toBe('A');
    expect(swap.getAttribute('href')).toBe('/meal-plan');
  });

  it('with onSwap, Swap is a button that fires it instead of navigating', () => {
    const onSwap = vi.fn();
    render(<TonightCard meal={meal} showNutrition={false} onLogged={vi.fn()} onSwap={onSwap} />);
    const swap = screen.getByTestId('tonight-swap');
    expect(swap.tagName).toBe('BUTTON');

    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });
});

describe('TonightCard — Rate it (UX-FOOD-04)', () => {
  const done = { ...meal, done: true };

  it('opens the rating widget inline and drops the link', () => {
    render(<TonightCard meal={done} showNutrition={false} onLogged={vi.fn()} />);
    expect(screen.queryByTestId('star-rating-widget')).toBeNull();
    fireEvent.click(screen.getByTestId('tonight-rate-it'));
    expect(screen.getByTestId('star-rating-widget').getAttribute('data-recipe')).toBe('recipe-1');
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
  });

  it('shows no link once the dinner has a rating', () => {
    mockExisting = { rating: 4, notes: null };
    render(<TonightCard meal={done} showNutrition={false} onLogged={vi.fn()} />);
    expect(screen.getByTestId('tonight-card-done')).toBeTruthy();
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
  });
});
