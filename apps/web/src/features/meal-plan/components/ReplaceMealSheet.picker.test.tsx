// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplaceMealSheet } from './ReplaceMealSheet';

// UX-PLAN-04: Undo of a swap restores the slot's previous pin state.
// UX-PLAN-05: the picker asks for the slot, states the safety check once and
// shows kcal · protein · minutes on each row.

const m = vi.hoisted(() => ({
  listCalls: [] as unknown[],
  replaceResult: { name: 'Chicken Salad', previousRecipeId: 'r0', previousPinned: true },
}));

const row = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  cuisineType: 'any',
  imageUrl: null,
  isFavourite: false,
  nutritionInfo: { calories: 420, protein: 31, carbs: 40, fat: 10 },
  prepTimeMins: 10,
  cookTimeMins: 15,
  safetyChecks: { checked: [{ label: 'peanuts', who: 'you' }], taggedOnly: [] },
  ...over,
});

vi.mock('@/features/ai-consent/AiConsentProvider', () => ({ useAiConsent: () => vi.fn() }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));
vi.mock('@/features/safety/components/FilteredForLine', () => ({ FilteredForLine: () => null }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { getForWeek: { invalidate: vi.fn() } },
      dashboard: { invalidate: vi.fn() },
      tracker: { invalidate: vi.fn() },
      shoppingList: { invalidate: vi.fn() },
    }),
    recipe: {
      list: {
        useQuery: (input: unknown) => {
          m.listCalls.push(input);
          const mine = (input as { myRecipesOnly?: boolean }).myRecipesOnly;
          return {
            data: mine ? [] : [row('r1', 'A very long recipe name that needs a second line')],
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
          };
        },
      },
      listHiddenCount: { useQuery: () => ({ data: undefined }) },
    },
    mealPlan: {
      replaceRecipe: {
        useMutation: (opts: { onSuccess?: (d: unknown) => void }) => ({
          mutate: () => opts.onSuccess?.(m.replaceResult),
          isPending: false,
        }),
      },
      swapRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

afterEach(() => {
  cleanup();
  m.listCalls.length = 0;
});

const target = {
  planId: 'p1',
  dayOfWeek: 0,
  mealType: 'lunch',
  mealName: 'Lunch',
  recipeId: 'r0',
  slotIndex: 0,
};

describe('ReplaceMealSheet picker (UX-PLAN-04/05)', () => {
  it('asks the server for the slot, states the check once and shows protein and time', () => {
    render(<ReplaceMealSheet target={target} onClose={vi.fn()} />);
    expect(m.listCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ slotType: 'lunch', forTable: true })]),
    );
    expect(screen.getByTestId('picker-checked-header').textContent).toMatch(
      /Suggestions checked for peanuts/,
    );
    expect(screen.getByTestId('picker-recipe-r1-meta').textContent).toBe(
      '420 kcal · 31 g protein · 25 min',
    );
    // No per-row "Checked for 1" pill any more.
    expect(screen.queryByText(/check(s)? passed|Checked for 1/)).toBeNull();
  });

  it('reports the replaced slot was pinned so Undo can restore that', () => {
    const onChanged = vi.fn();
    render(<ReplaceMealSheet target={target} onClose={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(screen.getByTestId('picker-recipe-r1'));
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ previousRecipeId: 'r0', previousPinned: true }),
    );
  });
});
