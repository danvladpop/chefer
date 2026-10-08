// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MealPlanPage from './page';

// FB7-11 / FB7-04 on the Plan page: no price line, no pantry banner, ONE "Week
// options" button (new plan · rebalance, the latter only when asked), and same-
// type slots rendered as one meal group with a total.

const m = vi.hoisted(() => ({
  plan: undefined as object | undefined,
  preview: null as object | null,
  previewCalls: 0,
  previewFails: false,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('week=0&day=2'),
}));
vi.mock('./loading', () => ({ default: () => null }));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (_f: string, run: () => void) => run(),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ memberCount: 0 }) }));
vi.mock('@/hooks/useRecipeImageStream', () => ({ useRecipeImageStream: () => undefined }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));
vi.mock('@/features/tracker/components/SlotActionsHost', () => ({ SlotActionsHost: () => null }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
vi.mock('@/features/premium/components/UpgradeNudge', () => ({ UpgradeNudge: () => null }));
vi.mock('@/features/meal-plan/components/PlanSettingsSheet', () => ({
  PlanSettingsSheet: () => null,
}));
vi.mock('@/features/meal-plan/components/TailoringBanner', () => ({ TailoringBanner: () => null }));
vi.mock('@/features/meal-plan/components/RebalanceBanner', () => ({
  RebalanceBanner: () => <div data-testid="rebalance-banner" />,
}));

// A generic tRPC double: queries return `data`, mutations record their calls.
vi.mock('@/lib/trpc', () => {
  const result = (data: unknown) => ({
    data,
    isLoading: false,
    isError: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(),
  });
  const make = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get(_t, key: string) {
        const name = path.join('.');
        if (key === 'then') return undefined;
        if (key === 'useQuery')
          return () => result(name === 'mealPlan.getForWeek' ? m.plan : undefined);
        if (key === 'useMutation')
          return () => ({
            mutate: (...args: unknown[]) => (m.mutations[name] ??= vi.fn())(...args),
            mutateAsync: vi.fn(),
            reset: vi.fn(),
            isPending: false,
            error: null,
          });
        if (key === 'fetch' && name === 'utils.mealPlan.previewRebalance')
          return () => {
            m.previewCalls += 1;
            return m.previewFails ? Promise.reject(new Error('x')) : Promise.resolve(m.preview);
          };
        if (key === 'useUtils') return () => make(['utils']);
        return make([...path, key]);
      },
      apply: () => Promise.resolve(undefined),
    });
  return { trpc: make([]) };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

const recipe = (id: string, name: string, calories: number) => ({
  id,
  name,
  description: '',
  cuisineType: 'any',
  prepTimeMins: 10,
  cookTimeMins: 20,
  nutritionInfo: { calories, protein: 30, carbs: 50, fat: 15, fiber: 5 },
});

function planWith(meals: { type: string; recipe: ReturnType<typeof recipe> }[]) {
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return {
    planId: 'plan-1',
    weekStartDate: start.toISOString(),
    calorieTarget: 2000,
    days: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, meals })),
    // The price line this page no longer shows.
    estimatedCost: { totalEur: 61, portions: 1 },
    usedPantryItems: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.mutations = {};
  m.previewCalls = 0;
  m.previewFails = false;
  m.preview = null;
  m.plan = planWith([
    { type: 'lunch', recipe: recipe('wrap', 'Chicken Wrap', 500) },
    { type: 'lunch', recipe: recipe('soup', 'Lentil Soup', 250) },
    { type: 'dinner', recipe: recipe('curry', 'Chicken Curry', 700) },
  ]);
  window.localStorage.clear();
});
afterEach(cleanup);

describe('Plan page — week options (FB7-11)', () => {
  it('shows no price line and no Regenerate / Rebalance buttons, just Week options', () => {
    render(<MealPlanPage />);
    expect(document.body.textContent).not.toMatch(/≈|RON|\/portion/);
    expect(screen.queryByTestId('rebalance-my-week')).toBeNull();
    expect(screen.queryByTestId('plan-regenerate')).toBeNull();
    const button = screen.getByTestId('plan-week-options');
    expect(button.textContent).toContain('Week options');
    expect(button.className).toContain('min-h-11');
  });

  it('never previews the rebalance on open', () => {
    render(<MealPlanPage />);
    expect(m.previewCalls).toBe(0);
  });

  it('the sheet holds both described actions; the new plan opens the usual confirm', () => {
    render(<MealPlanPage />);
    fireEvent.click(screen.getByTestId('plan-week-options'));
    expect(screen.getByTestId('plan-week-options-regenerate-description').textContent).toBe(
      'Keeps the meals you pinned.',
    );
    expect(screen.getByTestId('plan-week-options-rebalance-description').textContent).toMatch(
      /Swaps up to 2 upcoming meals/,
    );
    fireEvent.click(screen.getByTestId('plan-week-options-regenerate'));
    expect(screen.getByRole('heading', { name: /^Regenerate (this|next) week\?$/ })).toBeTruthy();
  });

  it('Rebalance runs the preview only when pressed: nothing to fix → a toast, and the row says why', async () => {
    render(<MealPlanPage />);
    fireEvent.click(screen.getByTestId('plan-week-options'));
    fireEvent.click(screen.getByTestId('plan-week-options-rebalance'));
    expect(m.previewCalls).toBe(1);
    expect(
      await screen.findByText('Your week is already on target, so there is nothing to swap.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId('plan-week-options'));
    const row = screen.getByTestId('plan-week-options-rebalance');
    expect(row).toHaveProperty('disabled', true);
    expect(screen.getByTestId('plan-week-options-rebalance-description').textContent).toMatch(
      /already on target/,
    );
  });

  it('a preview with swaps parks the offer for the existing banner (Preview · Apply · Not now)', async () => {
    m.preview = {
      planId: 'plan-1',
      headline: 'Over',
      snacks: [],
      swaps: [
        {
          dayOfWeek: 4,
          mealType: 'dinner',
          previousRecipeId: 'a',
          newRecipeId: 'b',
          newRecipeName: 'Bowl',
        },
      ],
    };
    render(<MealPlanPage />);
    fireEvent.click(screen.getByTestId('plan-week-options'));
    fireEvent.click(screen.getByTestId('plan-week-options-rebalance'));
    await waitFor(() =>
      expect(window.localStorage.getItem('chefer.rebalance.offer')).toContain('"planId":"plan-1"'),
    );
  });

  it('a failed check says so in a toast', async () => {
    m.previewFails = true;
    render(<MealPlanPage />);
    fireEvent.click(screen.getByTestId('plan-week-options'));
    fireEvent.click(screen.getByTestId('plan-week-options-rebalance'));
    expect(await screen.findByText(/Couldn.t check your week just now/)).toBeTruthy();
  });
});

describe('Plan page — side dishes (FB7-04)', () => {
  it('two lunches read as ONE meal: a header with the count, main, a +side card and a total', () => {
    render(<MealPlanPage />);
    // The phone day view comes first in the DOM (the desktop grid repeats it).
    const first = (id: string) => screen.getAllByTestId(id)[0];
    expect(first('plan-meal-group-lunch')?.textContent).toContain('2 dishes');
    expect(first('plan-meal-lunch-1-side')?.textContent).toBe('+ side');
    // 500 + 250 kcal; 30 + 30 g protein, 100 g carbs, 30 g fat.
    expect(first('plan-meal-group-lunch-total')?.textContent).toContain(
      '750 kcal · P 60 g · C 100 g · F 30 g',
    );
    // A single dish has no group chrome.
    expect(screen.queryAllByTestId('plan-meal-group-dinner')).toHaveLength(0);
  });
});
