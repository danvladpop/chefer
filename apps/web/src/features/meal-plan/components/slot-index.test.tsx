// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DayView } from './day-view';
import { ReplaceMealSheet, type ReplaceTarget } from './ReplaceMealSheet';

// A curated free day can hold two snacks. Every per-slot action must name the
// slot by its index in `day.meals`, or the second snack can never be replaced
// (mealType alone always hit the first one).
const m = vi.hoisted(() => ({
  isPremium: true,
  replace: vi.fn(),
  swap: vi.fn(),
}));
vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => m.isPremium }));
vi.mock('@chefer/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/ui')>()),
  Sheet: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children: unknown;
    footer?: unknown;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children as never}
        {footer as never}
      </div>
    ) : null,
}));
vi.mock('@/lib/trpc', () => {
  const invalidate = () => Promise.resolve();
  const mutation = (fn: (...args: unknown[]) => unknown) => () => ({
    mutate: fn,
    reset: () => undefined,
    isPending: false,
    error: null,
  });
  const picked = {
    id: 'yoghurt',
    name: 'Greek Yoghurt Bowl',
    nutritionInfo: { calories: 220 },
    cuisineType: 'generic',
    isFavourite: false,
  };
  return {
    trpc: {
      useUtils: () => ({
        mealPlan: { getForWeek: { invalidate } },
        dashboard: { invalidate },
        tracker: { invalidate },
        shoppingList: { invalidate },
      }),
      recipe: {
        list: { useQuery: () => ({ data: [picked], isLoading: false }) },
      },
      mealPlan: {
        replaceRecipe: { useMutation: mutation(m.replace) },
        swapRecipe: { useMutation: mutation(m.swap) },
      },
    },
  };
});

afterEach(cleanup);
beforeEach(() => {
  m.replace.mockClear();
  m.swap.mockClear();
});

const recipe = (id: string, name: string) => ({
  id,
  name,
  description: '',
  cuisineType: 'generic',
  prepTimeMins: 5,
  cookTimeMins: 0,
  nutritionInfo: { calories: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 },
});

const TWO_SNACK_DAY = {
  dayOfWeek: 2,
  meals: [
    { type: 'breakfast', recipe: recipe('b1', 'Oats') },
    { type: 'lunch', recipe: recipe('l1', 'Wrap') },
    { type: 'dinner', recipe: recipe('d1', 'Stew') },
    { type: 'snack', recipe: recipe('s1', 'Apple & Peanut Butter') },
    { type: 'snack', recipe: recipe('s2', 'Hummus & Carrots') },
  ],
};

function Planner() {
  const [target, setTarget] = useState<ReplaceTarget | null>(null);
  return (
    <>
      <DayView
        days={[TWO_SNACK_DAY]}
        planId="plan1"
        selectedDay={2}
        onSelectDay={() => undefined}
        onReplaceMeal={(mealType, mealName, slotIndex) =>
          setTarget({ planId: 'plan1', dayOfWeek: 2, mealType, slotIndex, mealName })
        }
      />
      <ReplaceMealSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}

describe('two-snack day: the second snack is its own slot', () => {
  it('replacing the second snack sends slotIndex 4', () => {
    render(<Planner />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace Hummus & Carrots' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Greek Yoghurt Bowl' }));

    expect(m.replace).toHaveBeenCalledWith({
      planId: 'plan1',
      dayOfWeek: 2,
      mealType: 'snack',
      slotIndex: 4,
      recipeId: 'yoghurt',
    });
  });

  it('the AI regenerate footer sends the slot index too', () => {
    render(<Planner />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace Apple & Peanut Butter' }));
    fireEvent.click(screen.getByTestId('picker-ai-swap'));

    expect(m.swap).toHaveBeenCalledWith({
      planId: 'plan1',
      dayOfWeek: 2,
      mealType: 'snack',
      slotIndex: 3,
    });
  });

  it("each card's recipe link carries its slot, for the recipe page's swap", () => {
    render(<Planner />);
    const links = screen.getAllByRole('link');
    const snack2 = links.find((a) => a.getAttribute('href')?.startsWith('/recipes/s2'));
    expect(snack2?.getAttribute('href')).toBe('/recipes/s2?planId=plan1&day=2&meal=snack&slot=4');
  });
});
