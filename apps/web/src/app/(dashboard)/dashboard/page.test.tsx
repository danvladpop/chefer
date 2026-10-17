// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './page';

// WP-08: Today in protein-only mode. The ring is a protein ring with the
// per-meal guide, the macro bars and every kcal caption are gone, and the
// meal lists, notes and the week's chart speak in protein. Switching back to
// the full numbers restores everything.

const m = vi.hoisted<{ summary: unknown; week: unknown }>(() => ({
  summary: undefined,
  week: undefined,
}));

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
// The chart libraries draw nothing useful in jsdom.
vi.mock('recharts', () => ({
  Line: () => null,
  LineChart: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
}));
vi.mock('@/features/coach/components/ChefReviewBanner', () => ({ ChefReviewBanner: () => null }));
vi.mock('@/features/coach/components/WeightCard', () => ({ WeightCard: () => null }));
vi.mock('@/features/gym/shared/todays-workout-card', () => ({ TodaysWorkoutCard: () => null }));
vi.mock('@/features/meal-plan/components/RebalanceBanner', () => ({ RebalanceBanner: () => null }));
vi.mock('@/features/meal-plan/components/ReplaceMealSheet', () => ({
  ReplaceMealSheet: () => null,
}));
vi.mock('@/features/privacy/components/HealthConsentNudges', () => ({
  HealthConsentLaunchPrompt: () => null,
  HealthConsentTodayNotice: () => null,
}));
vi.mock('@/features/safety/components/CheckedForChip', () => ({ CheckedForChip: () => null }));
vi.mock('@/features/tracker/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
vi.mock('@/features/tracker/components/ScanMealButton', () => ({ ScanMealButton: () => null }));
vi.mock('@/features/tracker/components/SlotActionsHost', () => ({ SlotActionsHost: () => null }));
vi.mock('@/features/tracker/components/SlotActionsMenu', () => ({ SlotActionsMenu: () => null }));
vi.mock('@/features/tracker/lib/use-slot-actions', () => ({
  useSlotActions: () => ({}),
  slotTargetOf: (mealType: string, slotIndex: number) => ({ mealType, slotIndex, label: mealType }),
  mealLabel: (t: string) => t,
}));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({
  handleRebalanceOutcome: vi.fn(),
  REBALANCE_PREVIEW: { rebalanceMode: 'preview' },
}));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/analytics-events', () => ({ trackMealLogged: vi.fn() }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { summary: { invalidate: vi.fn() } },
      tracker: { getDay: { invalidate: vi.fn() }, weeklySummary: { invalidate: vi.fn() } },
    }),
    dashboard: {
      summary: {
        useQuery: () => ({
          data: m.summary,
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: vi.fn(),
        }),
      },
    },
    tracker: {
      weeklySummary: { useQuery: () => ({ data: m.week }) },
      logRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      unlogRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    targets: { get: { useQuery: () => ({ data: { targetMode: 'SUGGESTED' } }) } },
    preferences: { hasProfile: { useQuery: () => ({ data: true }) } },
    recipe: { getMyRating: { useQuery: () => ({ data: null, isLoading: false }) } },
  },
}));

const recipe = (id: string, name: string, kcal: number) => ({
  id,
  name,
  description: 'Fresh',
  imageUrl: null,
  kcal,
  servings: 2,
  prepTimeMins: 10,
  cookTimeMins: 20,
});

const summary = (numbersMode: string | null) => ({
  numbersMode,
  proteinGuide: {
    proteinG: 120,
    meals: 3,
    perMealG: 40,
    lowG: 35,
    highG: 45,
    label: '35–45 g per meal',
  },
  showNutrition: true,
  today: {
    date: 'Monday 5 October',
    dayOfWeek: 0,
    slots: [
      {
        mealType: 'breakfast',
        slotIndex: 0,
        status: 'replaced',
        replacedBy: { entryId: 'e1', name: 'Shawarma', kcal: 775, protein: 40 },
      },
    ],
  },
  weekReady: null,
  shopDue: null,
  tonight: null,
  tomorrow: null,
  nextMeal: {
    planId: 'p1',
    dayOfWeek: 0,
    slotIndex: 1,
    mealType: 'lunch',
    recipe: recipe('salad', 'Greek Salad', 450),
  },
  tomorrowFirstMeal: null,
  restOfToday: [
    {
      mealType: 'dinner',
      recipeId: 'curry',
      recipeName: 'Lentil Curry',
      scheduledLabel: '19:00',
      kcal: 700,
    },
  ],
  weekPlan: [
    {
      dayOfWeek: 0,
      meals: [
        {
          mealType: 'dinner',
          recipeId: 'curry',
          recipeName: 'Lentil Curry',
          imageUrl: null,
          kcal: 700,
        },
      ],
    },
  ],
  recentFavourites: [],
  nutrition: {
    dailyCalorieTarget: 2200,
    plannedKcal: 1500,
    eatenKcal: 800,
    protein: { planned: 90, targetG: 120, eaten: 72 },
    carbs: { planned: 150, targetG: 250, eaten: 80 },
    fat: { planned: 50, targetG: 70, eaten: 20 },
  },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5, 12, 0)); // a Monday midday
  m.summary = summary('PROTEIN_ONLY');
  m.week = {
    dailyCalorieTarget: 2200,
    days: [
      {
        date: '2026-10-02',
        hasLog: true,
        totalKcal: 2000,
        totalProtein: 110,
        totalCarbs: 0,
        totalFat: 0,
      },
      {
        date: '2026-10-03',
        hasLog: true,
        totalKcal: 2100,
        totalProtein: 114,
        totalCarbs: 0,
        totalFat: 0,
      },
      {
        date: '2026-10-04',
        hasLog: true,
        totalKcal: 1900,
        totalProtein: 112,
        totalCarbs: 0,
        totalFat: 0,
      },
    ],
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Today — protein-only mode (WP-08)', () => {
  it('shows a protein ring with the per-meal guide, and no kcal anywhere', () => {
    render(<DashboardPage />);
    expect(screen.getAllByTestId('protein-ring').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('calorie-ring')).toBeNull();
    expect(screen.getAllByTestId('protein-ring')[0]?.getAttribute('aria-label')).toBe(
      '72 of 120 g protein eaten today',
    );
    expect(screen.getAllByText('of 120 g protein').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('protein-guide')[0]?.textContent).toBe('35–45 g per meal');
    // The hero meal, "Later today", the replaced note and the week's chart.
    expect(screen.getByText(/You had: Shawarma \(≈ 40 g protein\)/)).toBeTruthy();
    expect(screen.getByText('This Week — Protein')).toBeTruthy();
    expect(screen.getByTestId('week-average').textContent).toBe(
      'This week you averaged 112 g protein a day',
    );
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i);
    // Macro bars and the status pill's calorie words are gone.
    expect(screen.queryByText('Carbs')).toBeNull();
    expect(screen.queryByText('Fat')).toBeNull();
  });

  it('opens a day of the week outlook without kcal', () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: /MON/i }));
    expect(screen.getByText('Lentil Curry', { selector: 'p' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/kcal/i);
  });

  it('switching back to the full numbers restores the calorie ring, macros and every kcal figure', () => {
    const { rerender } = render(<DashboardPage />);
    expect(document.body.textContent).not.toMatch(/kcal/i);
    m.summary = summary('FULL');
    act(() => rerender(<DashboardPage />));
    expect(screen.getAllByTestId('calorie-ring').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('protein-ring')).toBeNull();
    expect(screen.getAllByText('Carbs').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/450 kcal/);
    expect(document.body.textContent).toMatch(/700 kcal/);
    expect(screen.getByText(/You had: Shawarma \(≈ 775 kcal\)/)).toBeTruthy();
    expect(screen.getByText('This Week — Calories')).toBeTruthy();
  });

  it('an unknown or reserved mode (NONE, WP-16) reads as the full numbers', () => {
    m.summary = summary('NONE');
    render(<DashboardPage />);
    expect(screen.getAllByTestId('calorie-ring').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/kcal/);
  });
});
