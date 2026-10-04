// @vitest-environment jsdom
import { fakeSlotFlow } from '@/features/tracker/lib/slot-flow.fixture';
import { capture } from '@/lib/analytics';
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
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/features/safety/components/CheckedForChip', () => ({
  CheckedForChip: () => null,
}));
let mockLogOptions: {
  onSuccess?: (data: { rebalance: null }, vars: { mealType: string }) => void;
} = {};
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
        useMutation: (opts: {
          onSuccess?: (data: { rebalance: null }, vars: { mealType: string }) => void;
        }) => {
          mockLogOptions = opts;
          return { mutate: vi.fn(), isPending: false, isError: false, error: null };
        },
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

describe('TonightCard analytics (UX-PO-02)', () => {
  it('a logged dinner fires meal_logged as planned', () => {
    render(<TonightCard meal={meal} showNutrition={false} onLogged={vi.fn()} />);
    mockLogOptions.onSuccess?.({ rebalance: null }, { mealType: 'dinner' });
    expect(capture).toHaveBeenCalledWith('meal_logged', { source: 'planned', mealType: 'dinner' });
  });
});

describe('TonightCard — Swap (T-04.7 delta)', () => {
  // UX-FOOD-18: on Friday/Saturday evenings Plan defaults to NEXT week, so the
  // link names this week and today's weekday (Monday = 0).
  it.each([
    ['Friday evening', new Date(2026, 8, 4, 19, 0), 4],
    ['Sunday evening', new Date(2026, 8, 6, 19, 0), 6],
  ])('without onSwap, Swap links to THIS week and today (%s)', (_name, now, day) => {
    vi.useFakeTimers({ now });
    try {
      render(<TonightCard meal={meal} showNutrition={false} onLogged={vi.fn()} />);
      const swap = screen.getByTestId('tonight-swap');
      expect(swap.tagName).toBe('A');
      expect(swap.getAttribute('href')).toBe(`/meal-plan?week=0&day=${day}`);
    } finally {
      vi.useRealTimers();
    }
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

// WP-06: tonight's slot can be replaced or skipped; neither is a failure.
describe('TonightCard — flexible eating (WP-06)', () => {
  it('has an overflow next to "I ate this" that acts on the dinner slot', () => {
    const flow = fakeSlotFlow();
    render(<TonightCard meal={meal} showNutrition onLogged={vi.fn()} flow={flow} />);
    expect(screen.getByTestId('tonight-ate-this')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dinner' }));
    fireEvent.click(screen.getByText('Ate something else'));
    expect(flow.openAteElse).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 0 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dinner' }));
    fireEvent.click(screen.getByText('Skipped it'));
    expect(flow.skip).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 0 }),
    );
  });

  it('has no overflow when nutrition is hidden or there is no flow', () => {
    render(
      <TonightCard meal={meal} showNutrition={false} onLogged={vi.fn()} flow={fakeSlotFlow()} />,
    );
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    cleanup();
    render(<TonightCard meal={meal} showNutrition onLogged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });

  it('a replaced dinner reads "You had: …" with an Undo, and cannot be rated or ticked', () => {
    const flow = fakeSlotFlow();
    render(
      <TonightCard
        meal={{ ...meal, done: true }}
        showNutrition
        onLogged={vi.fn()}
        flow={flow}
        slot={{
          slotIndex: 0,
          mealType: 'dinner',
          status: 'replaced',
          replacedBy: { entryId: 'r1', name: 'Shawarma · normal', kcal: 775, protein: 40 },
        }}
      />,
    );
    expect(screen.getByTestId('tonight-card-replaced').textContent).toContain(
      'You had: Shawarma · normal (≈ 775 kcal)',
    );
    expect(screen.queryByTestId('tonight-ate-this')).toBeNull();
    expect(screen.queryByTestId('tonight-rate-it')).toBeNull();
    fireEvent.click(screen.getByTestId('tonight-undo-replaced'));
    expect(flow.undoReplacement).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ mealType: 'dinner', slotIndex: 0 }),
    );
  });

  it('a skipped dinner reads "Skipped" (muted, no judgement) with an Undo', () => {
    const flow = fakeSlotFlow();
    render(
      <TonightCard
        meal={meal}
        showNutrition
        onLogged={vi.fn()}
        flow={flow}
        slot={{ slotIndex: 0, mealType: 'dinner', status: 'skipped' }}
      />,
    );
    expect(screen.getByTestId('tonight-card-skipped').textContent).toContain('Skipped');
    expect(screen.queryByTestId('tonight-ate-this')).toBeNull();
    fireEvent.click(screen.getByTestId('tonight-undo-skip'));
    expect(flow.unskip).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 0 }),
    );
  });
});
