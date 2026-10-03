// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet } from './QuickAddSheet';

// T-19.1 (UX-19): the search-first Log sheet — Recent, This week's plan,
// Your recipes, Ingredients (per 100 g), and "Enter calories yourself" as the
// calories-only fallback. T-19.5/B-39: the macro sanity line.

const m = vi.hoisted(() => ({
  logRecipe: vi.fn(),
  logCustom: vi.fn(),
  recents: [] as unknown[],
  recipes: [] as unknown[],
  ingredients: [] as unknown[],
  search: { isFetching: false, isError: false },
  refetch: vi.fn(),
  logRecipeState: { isError: false, error: null as { message: string } | null },
  logCustomState: { isPending: false, isError: false, error: null as { message: string } | null },
  invalidate: {
    getDay: vi.fn(),
    weeklySummary: vi.fn(),
    monthlySummary: vi.fn(),
    recents: vi.fn(),
    dashboardSummary: vi.fn(),
  },
}));

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

vi.mock('../lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: m.invalidate.getDay },
        weeklySummary: { invalidate: m.invalidate.weeklySummary },
        monthlySummary: { invalidate: m.invalidate.monthlySummary },
        recents: { invalidate: m.invalidate.recents },
      },
      dashboard: { summary: { invalidate: m.invalidate.dashboardSummary } },
    }),
    recipe: {
      list: { useQuery: () => ({ data: m.recipes, refetch: m.refetch, ...m.search }) },
    },
    ingredients: {
      search: { useQuery: () => ({ data: m.ingredients, refetch: m.refetch, ...m.search }) },
    },
    tracker: {
      recents: { useQuery: () => ({ data: m.recents }) },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            m.logRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
          ...m.logRecipeState,
          isPending: false,
        }),
      },
      logCustomMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          ...m.logCustomState,
          mutate: (vars: unknown) => {
            m.logCustom(vars);
            if (!m.logCustomState.isError) opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
        }),
      },
    },
  },
}));

const onLogged = vi.fn();

function renderSheet(
  plannedMeals: React.ComponentProps<typeof QuickAddSheet>['plannedMeals'] = [],
) {
  render(<QuickAddSheet date="2026-09-26" onLogged={onLogged} plannedMeals={plannedMeals} />);
  fireEvent.click(screen.getByTestId('tracker-quick-add'));
}

function goToManual() {
  fireEvent.click(screen.getByTestId('log-sheet-manual'));
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.recents = [];
  m.recipes = [];
  m.ingredients = [];
  m.search.isFetching = false;
  m.search.isError = false;
  m.logRecipeState.isError = false;
  m.logRecipeState.error = null;
  m.logCustomState.isPending = false;
  m.logCustomState.isError = false;
  m.logCustomState.error = null;
});

describe('QuickAddSheet — search-first (T-19.1)', () => {
  it('opens with the search field visible and no manual fields', () => {
    renderSheet();
    expect(screen.getByTestId('log-sheet-search')).toBeTruthy();
    expect(screen.queryByTestId('quick-add-name')).toBeNull();
  });

  it('AC1: logging from Recent takes one tap once the sheet is open', () => {
    m.recents = [
      {
        key: 'recipe:r1',
        recipeId: 'r1',
        name: 'Protein shake',
        imageUrl: null,
        mealType: 'snack',
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
        portionMultiplier: 1,
        count: 4,
        lastLoggedAt: '2026-09-25',
      },
    ];
    renderSheet();
    fireEvent.click(screen.getByTestId('log-sheet-recent-add-recipe:r1'));
    expect(m.logRecipe).toHaveBeenCalledWith({
      date: '2026-09-26',
      recipeId: 'r1',
      mealType: 'snack',
      portionMultiplier: 1,
    });
    expect(onLogged).toHaveBeenCalled();
  });

  it("This week's plan: expanding a row and logging sends its slotIndex", () => {
    renderSheet([
      {
        recipeId: 'r2',
        recipeName: 'Lentil curry',
        mealType: 'dinner',
        imageUrl: null,
        kcal: 540,
        protein: 25,
        carbs: 60,
        fat: 15,
        slotIndex: 2,
      },
    ]);
    fireEvent.click(screen.getByText('Lentil curry'));
    fireEvent.click(screen.getByTestId('log-sheet-plan-log-plan:2'));
    expect(m.logRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r2', mealType: 'dinner', slotIndex: 2 }),
    );
  });

  it('Ingredients: grams row shows a live kcal and logs the scaled macros', () => {
    m.ingredients = [
      {
        name: 'chicken-breast-raw',
        displayName: 'Chicken breast, raw',
        imageUrl: 'https://example.com/chicken.png',
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 120, protein: 22, carbs: 0, fat: 3 },
      },
    ];
    renderSheet();
    fireEvent.change(screen.getByTestId('log-sheet-search'), { target: { value: 'chicken' } });
    fireEvent.click(screen.getByText('Chicken breast, raw'));
    fireEvent.click(screen.getByTestId('log-sheet-grams-chicken-breast-raw-150'));
    expect(screen.getByTestId('log-sheet-grams-live-kcal-chicken-breast-raw').textContent).toBe(
      '180 kcal · 33g P',
    );
    fireEvent.click(screen.getByTestId('log-sheet-grams-log-chicken-breast-raw'));
    expect(m.logCustom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chicken breast, raw, 150 g', kcal: 180, protein: 33 }),
    );
  });

  // UX-FOOD-09
  it('clamps absurd grams instead of previewing 88,999 kcal', () => {
    m.ingredients = [
      {
        name: 'banana',
        displayName: 'Banana',
        imageUrl: null,
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
      },
    ];
    renderSheet();
    fireEvent.change(screen.getByTestId('log-sheet-search'), { target: { value: 'banana' } });
    fireEvent.click(screen.getByText('Banana'));
    const input = screen.getByTestId('log-sheet-grams-input-banana') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99999' } });
    expect(input.value).toBe('4347');
    expect(screen.getByTestId('log-sheet-grams-max-banana')).toBeTruthy();
    expect(screen.getByTestId('log-sheet-grams-live-kcal-banana').textContent).toMatch(
      /^3869 kcal/,
    );
    fireEvent.click(screen.getByTestId('log-sheet-grams-log-banana'));
    expect(m.logCustom).toHaveBeenCalledWith(expect.objectContaining({ kcal: 3869 }));
  });

  it('shows "Searching…" while a first search loads', () => {
    m.search.isFetching = true;
    renderSheet();
    fireEvent.change(screen.getByTestId('log-sheet-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('log-sheet-searching')).toBeTruthy();
  });

  it('offers "enter calories yourself" when nothing matches, once the debounce settles', async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId('log-sheet-search'), { target: { value: 'zzz' } });
    expect(screen.queryByTestId('log-sheet-no-matches')).toBeNull();
    fireEvent.click(await screen.findByTestId('log-sheet-no-matches'));
    expect((screen.getByTestId('quick-add-name') as HTMLInputElement).value).toBe('zzz');
  });

  it('shows a Retry when the search fails instead of an empty list', () => {
    m.search.isError = true;
    renderSheet();
    fireEvent.change(screen.getByTestId('log-sheet-search'), { target: { value: 'rice' } });
    expect(screen.getByTestId('log-sheet-search-error')).toBeTruthy();
    expect(screen.queryByTestId('log-sheet-no-matches')).toBeNull();
    fireEvent.click(screen.getByTestId('log-sheet-search-retry'));
    expect(m.refetch).toHaveBeenCalled();
  });

  it('shows a failed log in the search view', () => {
    m.logRecipeState.isError = true;
    m.logRecipeState.error = { message: 'Recipe not found.' };
    renderSheet();
    expect(screen.getByTestId('log-sheet-api-error').textContent).toMatch(/Recipe not found/);
  });

  it('B-29/AC6: never shows a barcode or branded-product affordance', () => {
    renderSheet();
    expect(screen.queryByText(/barcode/i)).toBeNull();
  });

  // AC1 follow-up: a custom entry logged via the manual fallback must show up
  // under Recent the next time the sheet opens, not after tracker.recents'
  // own 60s staleTime. Logging invalidates it eagerly.
  it('AC1: logging invalidates tracker.recents so Recent is fresh on reopen', () => {
    renderSheet();
    goToManual();
    fireEvent.change(screen.getByTestId('quick-add-name'), { target: { value: 'Snack bar' } });
    fireEvent.change(screen.getByTestId('quick-add-kcal'), { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(m.invalidate.recents).toHaveBeenCalled();
  });
});

describe('QuickAddSheet — Enter calories yourself (fallback, T-19.1)', () => {
  it('explains a missing name and calories instead of sending', () => {
    renderSheet();
    goToManual();
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(m.logCustom).not.toHaveBeenCalled();
    expect(screen.getByTestId('quick-add-name-error').textContent).toBe('Name what you ate.');
    expect(screen.getByTestId('quick-add-kcal-error').textContent).toBe('Enter the calories.');
  });

  it('logs name, chosen meal, kcal and macros that pass the sanity check', () => {
    renderSheet();
    goToManual();
    fireEvent.change(screen.getByTestId('quick-add-name'), {
      target: { value: 'Birthday cake' },
    });
    fireEvent.click(screen.getByTestId('quick-add-meal-dinner'));
    fireEvent.change(screen.getByTestId('quick-add-kcal'), { target: { value: '420' } });
    fireEvent.change(screen.getByTestId('quick-add-carbs'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('quick-add-fat'), { target: { value: '18.5' } });
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(m.logCustom).toHaveBeenCalledWith({
      date: '2026-09-26',
      estimatedBy: 'manual',
      name: 'Birthday cake',
      mealType: 'dinner',
      kcal: 420,
      protein: 0,
      carbs: 50,
      fat: 18.5,
    });
  });

  // Bug B-39, T-19.5: the 4/4/9 rule ± 25%.
  it('bug B-39: 100 kcal logged with 500 g protein shows the sanity line and blocks the submit', () => {
    renderSheet();
    goToManual();
    fireEvent.change(screen.getByTestId('quick-add-name'), { target: { value: 'Mystery shake' } });
    fireEvent.change(screen.getByTestId('quick-add-kcal'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('quick-add-protein'), { target: { value: '500' } });
    expect(screen.getByTestId('quick-add-sanity').textContent).toContain(
      "These don't add up: 100 kcal logged, but the macros add up to 2,000 kcal.",
    );
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(m.logCustom).not.toHaveBeenCalled();
  });

  it('bug B-39: Log anyway still logs it (advisory, never a hard block)', () => {
    renderSheet();
    goToManual();
    fireEvent.change(screen.getByTestId('quick-add-name'), { target: { value: 'Mystery shake' } });
    fireEvent.change(screen.getByTestId('quick-add-kcal'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('quick-add-protein'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('quick-add-sanity-log-anyway'));
    expect(screen.queryByTestId('quick-add-sanity')).toBeNull();
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(m.logCustom).toHaveBeenCalledWith(expect.objectContaining({ kcal: 100, protein: 500 }));
  });

  it('shows the API error', () => {
    m.logCustomState.isError = true;
    m.logCustomState.error = { message: "You can't log a future day" };
    renderSheet();
    goToManual();
    expect(screen.getByTestId('quick-add-api-error').textContent).toBe(
      "You can't log a future day",
    );
  });
});
