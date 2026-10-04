// @vitest-environment jsdom
import { NumbersModeProvider } from '@/features/numbers-mode/numbers-mode';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet } from './QuickAddSheet';

// WP-08: quick add in protein-only mode asks protein first and never shows a
// calorie figure. The week still balances on calories underneath, so the entry
// carries a rough kcal estimated from the protein (about 16 kcal per gram).

const m = vi.hoisted(() => ({
  logRecipe: vi.fn(),
  logCustom: vi.fn(),
  recents: [] as unknown[],
  ingredients: [] as unknown[],
}));

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('../lib/rebalance-storage', () => ({
  handleRebalanceOutcome: vi.fn(),
  REBALANCE_PREVIEW: { rebalanceMode: 'preview' },
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: vi.fn() },
        weeklySummary: { invalidate: vi.fn() },
        monthlySummary: { invalidate: vi.fn() },
        recents: { invalidate: vi.fn() },
      },
      dashboard: { summary: { invalidate: vi.fn() } },
    }),
    recipe: { list: { useQuery: () => ({ data: [], isFetching: false, isError: false }) } },
    ingredients: {
      search: {
        useQuery: () => ({ data: m.ingredients, isFetching: false, isError: false }),
      },
    },
    tracker: {
      recents: { useQuery: () => ({ data: m.recents }) },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            m.logRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      logCustomMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          isPending: false,
          isError: false,
          error: null,
          mutate: (vars: unknown) => {
            m.logCustom(vars);
            opts.onSuccess?.({ log: {}, rebalance, entryId: 'e-1' }, vars);
          },
        }),
      },
    },
  },
}));

const open = (mode: string | null) =>
  render(
    <NumbersModeProvider mode={mode}>
      <QuickAddSheet
        date="2026-09-26"
        onLogged={vi.fn()}
        plannedMeals={[
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
        ]}
      />
    </NumbersModeProvider>,
  );

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
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
  m.ingredients = [
    {
      name: 'chicken-breast-raw',
      displayName: 'Chicken breast, raw',
      imageUrl: null,
      hasMacros: true,
      isCustom: false,
      per100g: { calories: 120, protein: 22, carbs: 0, fat: 3 },
    },
  ];
});

describe('QuickAddSheet — protein-only mode (WP-08)', () => {
  it('lists recents, the plan and ingredients by protein, with no kcal on the sheet', () => {
    open('PROTEIN_ONLY');
    fireEvent.click(screen.getByTestId('tracker-quick-add'));
    expect(screen.getByText('30 g protein')).toBeTruthy();
    expect(screen.getByLabelText('Log Protein shake again, 30 g protein')).toBeTruthy();
    fireEvent.click(screen.getByText('Lentil curry'));
    expect(screen.getByText('Log 25 g protein')).toBeTruthy();
    fireEvent.change(screen.getByTestId('log-sheet-search'), { target: { value: 'chicken' } });
    expect(screen.getByText('22 g protein / 100 g')).toBeTruthy();
    expect(screen.getByTestId('log-sheet-manual').textContent).toBe('Enter protein yourself');
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i);
  });

  it('the manual form asks for protein only and logs it with an estimated kcal', () => {
    open('PROTEIN_ONLY');
    fireEvent.click(screen.getByTestId('tracker-quick-add'));
    fireEvent.click(screen.getByTestId('log-sheet-manual'));
    expect(screen.queryByTestId('quick-add-kcal')).toBeNull();
    expect(screen.queryByTestId('quick-add-carbs')).toBeNull();
    expect(screen.queryByTestId('quick-add-fat')).toBeNull();
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i);
    fireEvent.change(screen.getByTestId('quick-add-name'), { target: { value: 'Protein bar' } });
    fireEvent.change(screen.getByTestId('quick-add-protein'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(m.logCustom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Protein bar', protein: 30, kcal: 480 }),
    );
  });

  it('asks for the protein when it is missing, without mentioning calories', () => {
    open('PROTEIN_ONLY');
    fireEvent.click(screen.getByTestId('tracker-quick-add'));
    fireEvent.click(screen.getByTestId('log-sheet-manual'));
    fireEvent.change(screen.getByTestId('quick-add-name'), { target: { value: 'Mystery bowl' } });
    fireEvent.click(screen.getByTestId('quick-add-submit'));
    expect(screen.getByTestId('quick-add-protein-error').textContent).toBe(
      'Enter the protein in grams.',
    );
    expect(m.logCustom).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i);
  });

  it('switching back to the full numbers restores calories and the macro fields', () => {
    const { unmount } = open('PROTEIN_ONLY');
    unmount();
    open(null);
    fireEvent.click(screen.getByTestId('tracker-quick-add'));
    expect(screen.getByText('180 kcal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('log-sheet-manual'));
    expect(screen.getByTestId('quick-add-kcal')).toBeTruthy();
    expect(screen.getByTestId('quick-add-carbs')).toBeTruthy();
  });
});
