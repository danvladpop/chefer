// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackerPage from './page';

// T-19.1–T-19.4 (UX-19): the search-first Log sheet, edit/undo and the
// one-save model. Two identical snacks used to share one row key
// (recipeId:mealType), so ticking one ticked both — rows are keyed by plan
// slot now.

const m = vi.hoisted(() => {
  const state: { day: unknown } = { day: undefined };
  return {
    logRecipe: vi.fn(),
    unlogRecipe: vi.fn(),
    copyDay: vi.fn(),
    deleteEntries: vi.fn(),
    deleteCustom: vi.fn(),
    restoreCustom: vi.fn(),
    state,
  };
});

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('@/features/dashboard/components/training-day-note', () => ({
  TrainingDayNote: () => null,
}));
vi.mock('@/features/meal-plan/components/RebalanceBanner', () => ({ RebalanceBanner: () => null }));
vi.mock('@/features/nutrition/components/ChangeNoticeCard', () => ({
  ChangeNoticeCard: () => null,
}));
vi.mock('@/features/nutrition/components/TargetExplainSheet', () => ({
  TargetExplainSheet: () => null,
}));
vi.mock('@/features/tracker/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
vi.mock('@/features/tracker/components/ScanMealButton', () => ({ ScanMealButton: () => null }));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ mealPlan: { invalidate: vi.fn() } }),
    tracker: {
      getDay: {
        useQuery: () => ({
          data: m.state.day,
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: vi.fn(),
        }),
      },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            m.logRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
          isPending: false,
        }),
      },
      unlogRecipe: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            m.unlogRecipe(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      copyDay: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: (data: unknown) => void }) => {
            m.copyDay(vars);
            callbacks?.onSuccess?.({ log: {}, copiedEntryIds: ['c1', 'c2'], rebalance });
          },
          isPending: false,
        }),
      },
      deleteEntries: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            m.deleteEntries(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      deleteCustomMeal: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: () => void }) => {
            m.deleteCustom(vars);
            callbacks?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      restoreCustomMeal: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            m.restoreCustom(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
      updateCustomMeal: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
      },
    },
    // §2.11 — TargetExplainSheet's query (mocked away above; still called by
    // the page directly).
    targets: {
      get: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

const snack = (slotIndex: number) => ({
  recipeId: 'yogurt',
  mealType: 'snack',
  recipeName: 'Greek Yogurt',
  imageUrl: null,
  kcal: 150,
  protein: 15,
  carbs: 10,
  fat: 5,
  slotIndex,
});

const logged = (slotIndex?: number) => ({
  recipeId: 'yogurt',
  mealType: 'snack',
  ...(slotIndex !== undefined && { slotIndex }),
  portionMultiplier: 1,
  kcal: 150,
  protein: 15,
  carbs: 10,
  fat: 5,
});

function day(loggedMeals: unknown[] | null, extra: Record<string, unknown> = {}) {
  m.state.day = {
    date: '2026-09-26',
    plannedMeals: [snack(1), snack(3)],
    offPlanLogged: [],
    log: loggedMeals
      ? { loggedMeals, totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
      : null,
    targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
    ...extra,
  };
}

const checks = () => screen.getAllByRole('button', { name: /check Greek Yogurt/i });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tracker — one-save model (bug B-23, T-19.4)', () => {
  it('there is no Save Day / Log meals button', () => {
    day(null);
    render(<TrackerPage />);
    expect(screen.queryByText(/Log \d+ meals?/)).toBeNull();
    expect(screen.queryByText('Clear logged meals')).toBeNull();
  });

  it('bug B-23: ticking a planned meal saves it immediately, through logRecipe', () => {
    day(null);
    render(<TrackerPage />);
    const [firstSnack] = checks();
    if (!firstSnack) throw new Error('expected a snack row');
    fireEvent.click(firstSnack);
    expect(m.logRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'yogurt', mealType: 'snack', slotIndex: 1 }),
    );
  });

  it('bug B-23: unticking a logged meal removes it immediately, through unlogRecipe', () => {
    day([logged(1)]);
    render(<TrackerPage />);
    const [firstSnack] = checks();
    if (!firstSnack) throw new Error('expected a snack row');
    fireEvent.click(firstSnack);
    expect(m.unlogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'yogurt', mealType: 'snack', slotIndex: 1 }),
    );
  });
});

describe('Tracker — copy a day (T-19.3)', () => {
  it('confirms, then copies the previous day onto this one', () => {
    day(null);
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-copy-day'));
    fireEvent.click(screen.getByTestId('tracker-copy-day-confirm'));
    expect(m.copyDay).toHaveBeenCalledWith(
      expect.objectContaining({ toDate: expect.any(String) as string }),
    );
    expect(screen.getByText('Copied 2 entries')).toBeTruthy();
    fireEvent.click(screen.getByText('Undo'));
    expect(m.deleteEntries).toHaveBeenCalledWith(
      expect.objectContaining({ entryIds: ['c1', 'c2'] }),
    );
  });
});

describe('Tracker — edit/undo a custom entry (bug B-34, T-19.2)', () => {
  const customEntry = {
    entryId: 'e1',
    custom: { name: 'Protein shake', estimatedBy: 'manual' },
    mealType: 'snack',
    portionMultiplier: 1,
    kcal: 180,
    protein: 30,
    carbs: 5,
    fat: 2,
  };

  it('tapping a custom entry opens Edit entry', () => {
    day([customEntry], { plannedMeals: [], hasActivePlan: true });
    render(<TrackerPage />);
    fireEvent.click(screen.getByTestId('tracker-custom-0'));
    expect(screen.getByTestId('edit-entry-name')).toHaveProperty('value', 'Protein shake');
  });

  it('the bin deletes immediately and offers Undo that restores it exactly (AC2)', () => {
    day([customEntry], { plannedMeals: [], hasActivePlan: true });
    render(<TrackerPage />);
    fireEvent.click(screen.getByLabelText('Delete Protein shake'));
    expect(m.deleteCustom).toHaveBeenCalledWith({
      date: expect.any(String) as string,
      entryIndex: 0,
    });
    expect(screen.getByText('Deleted Protein shake')).toBeTruthy();
    fireEvent.click(screen.getByText('Undo'));
    expect(m.restoreCustom).toHaveBeenCalledWith({
      date: expect.any(String) as string,
      entry: {
        entryId: 'e1',
        custom: { name: 'Protein shake', estimatedBy: 'manual' },
        mealType: 'snack',
        portionMultiplier: 1,
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
      },
    });
  });
});

describe('Tracker — two identical snacks', () => {
  it('ticking one snack leaves the other unticked and saves only its slot', () => {
    day(null);
    render(<TrackerPage />);
    const [, secondSnack] = checks();
    if (!secondSnack) throw new Error('expected two snack rows');
    fireEvent.click(secondSnack);
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(m.logRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'yogurt', slotIndex: 3 }),
    );
  });

  it('a logged entry with a slotIndex ticks only its own row', () => {
    day([logged(3)]);
    render(<TrackerPage />);
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('a legacy entry without a slotIndex ticks the first matching row only', () => {
    day([logged()]);
    render(<TrackerPage />);
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });
});

// T-19.6: a Track-only user may never generate a plan — the empty state
// reads as an invitation to log, not a missing-plan error.
describe('Tracker — no-plan empty state (T-19.6)', () => {
  it('reads as an invitation to log when there is no active plan', () => {
    m.state.day = {
      date: '2026-09-26',
      plannedMeals: [],
      hasActivePlan: false,
      offPlanLogged: [],
      log: null,
      targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
    };
    render(<TrackerPage />);
    expect(screen.getByTestId('tracker-empty-plan').textContent).toContain(
      'No plan today — log from Recent or search below.',
    );
    expect(screen.queryByText('Go to Meal Planner →')).toBeNull();
  });

  it('keeps the "Go to Meal Planner" copy when a plan exists but today is empty', () => {
    m.state.day = {
      date: '2026-09-26',
      plannedMeals: [],
      hasActivePlan: true,
      offPlanLogged: [],
      log: null,
      targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
    };
    render(<TrackerPage />);
    expect(screen.getByText('Go to Meal Planner →')).toBeTruthy();
  });
});
