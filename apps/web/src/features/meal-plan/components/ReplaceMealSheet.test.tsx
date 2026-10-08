// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplaceMealSheet } from './ReplaceMealSheet';

// UX-X-12: a failed recipe load is not "No recipes match your search."

const m = vi.hoisted(() => ({ refetch: vi.fn() }));

vi.mock('@/features/ai-consent/AiConsentProvider', () => ({ useAiConsent: () => vi.fn() }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));
vi.mock('@/features/safety/components/CheckedForChip', () => ({ CheckedForChip: () => null }));
vi.mock('@/features/safety/components/FilteredForLine', () => ({ FilteredForLine: () => null }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    recipe: {
      list: {
        useQuery: () => ({
          data: undefined,
          isLoading: false,
          isError: true,
          refetch: m.refetch,
        }),
      },
      listHiddenCount: { useQuery: () => ({ data: undefined }) },
      addToWeek: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    mealPlan: {
      replaceRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      swapRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

afterEach(cleanup);

describe('ReplaceMealSheet failed load (UX-X-12)', () => {
  it('shows an error with Try again, not "No recipes match your search."', () => {
    render(
      <ReplaceMealSheet
        target={{
          planId: 'p1',
          dayOfWeek: 0,
          mealType: 'dinner',
          mealName: 'Dinner',
          recipeId: 'r0',
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('replace-load-error')).toBeTruthy();
    expect(screen.queryByText('No recipes match your search.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(m.refetch).toHaveBeenCalled();
  });
});
