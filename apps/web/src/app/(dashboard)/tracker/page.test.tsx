// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackerPage from './page';

// Two identical snacks used to share one row key (recipeId:mealType), so
// ticking one ticked both. Rows are keyed by plan slot now.

const m = vi.hoisted(() => {
  const state: { day: unknown } = { day: undefined };
  return { upsert: vi.fn(), state };
});

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
      upsertDay: { useMutation: () => ({ mutate: m.upsert, isPending: false }) },
      deleteCustomMeal: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
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

function day(loggedMeals: unknown[] | null) {
  m.state.day = {
    date: '2026-09-26',
    plannedMeals: [snack(1), snack(3)],
    offPlanLogged: [],
    log: loggedMeals
      ? { loggedMeals, totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
      : null,
    targets: { dailyCalorieTarget: 2000, proteinG: 125, carbsG: 225, fatG: 67 },
  };
}

const checks = () => screen.getAllByRole('button', { name: /check Greek Yogurt/i });

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tracker — two identical snacks', () => {
  it('ticking one snack leaves the other unticked and saves its slot', () => {
    day(null);
    render(<TrackerPage />);
    const [, secondSnack] = checks();
    if (!secondSnack) throw new Error('expected two snack rows');
    fireEvent.click(secondSnack);
    expect(checks().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);

    fireEvent.click(screen.getByRole('button', { name: /Log 1 meal/ }));
    expect(m.upsert).toHaveBeenCalledWith({
      date: expect.any(String) as string,
      loggedMeals: [expect.objectContaining({ recipeId: 'yogurt', slotIndex: 3 })],
    });
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
      'No plan today — log what you eat with Snap to log or Quick add above.',
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
