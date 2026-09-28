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
  logCustomState: { isPending: false, isError: false, error: null as { message: string } | null },
}));

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

vi.mock('../lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    recipe: { list: { useQuery: () => ({ data: m.recipes }) } },
    ingredients: { search: { useQuery: () => ({ data: m.ingredients }) } },
    tracker: {
      recents: { useQuery: () => ({ data: m.recents }) },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            m.logRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
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

  it('B-29/AC6: never shows a barcode or branded-product affordance', () => {
    renderSheet();
    expect(screen.queryByText(/barcode/i)).toBeNull();
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
