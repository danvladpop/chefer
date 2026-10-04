// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { NumbersModeProvider } from '@/features/numbers-mode/numbers-mode';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanTrainingDay } from '@chefer/types';
import { DayView } from './day-view';
import { MealCard } from './MealCard';
import { PlanMissSheet } from './PlanMissSheet';
import { PremiumChangesCard } from './PremiumChangesCard';
import { RebalanceOfferView } from './RebalanceOffer';
import { TrainingExplainSheet } from './TrainingExplainSheet';

// WP-08: the plan keeps balancing kcal underneath, but in protein-only mode
// its cards, day totals, offers and sheets show protein and never kcal. The
// full numbers come straight back.

vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: vi.fn() },
      shoppingList: { invalidate: vi.fn() },
      dashboard: { invalidate: vi.fn() },
    }),
    mealPlan: {
      scaleDay: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: () => opts.onSuccess?.({ kcal: 2010, protein: 120 }),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      getById: {
        useQuery: () => ({
          data: {
            planId: 'old',
            days: [
              {
                dayOfWeek: 0,
                meals: [
                  {
                    type: 'dinner',
                    recipe: {
                      nutritionInfo: { calories: 1500, protein: 60, carbs: 1, fat: 1, fiber: 1 },
                    },
                  },
                ],
              },
            ],
          },
          isLoading: false,
          isError: false,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const inMode = (mode: string | null, ui: ReactNode) => (
  <NumbersModeProvider mode={mode}>{ui}</NumbersModeProvider>
);
const text = () => document.body.textContent ?? '';

const recipe = {
  id: 'r1',
  name: 'Chicken Rice Bowl',
  description: '',
  cuisineType: 'asian',
  prepTimeMins: 10,
  cookTimeMins: 20,
  nutritionInfo: { calories: 700, protein: 40, carbs: 60, fat: 20, fiber: 5 },
};
const meal = { type: 'dinner', recipe };
const days = [0, 1, 2].map((dayOfWeek) => ({
  dayOfWeek,
  meals: [meal],
  ...(dayOfWeek === 1 && { proteinGapG: 25 }),
}));
const lift: PlanTrainingDay = {
  dayOfWeek: 0,
  dayName: 'Monday',
  kind: 'lift',
  workoutName: 'Upper A',
  kcalBonus: 300,
  proteinBonus: 31,
  carbsBonus: 0,
  done: false,
  applied: true,
  targetKcal: 2540,
  targetProteinG: 165,
};

const dayView = (selectedDay: number) => (
  <DayView
    days={days}
    planId="p1"
    selectedDay={selectedDay}
    onSelectDay={vi.fn()}
    calorieTarget={2240}
    trainingDays={[lift]}
    onOpenTrainingExplain={vi.fn()}
    onOpenMiss={vi.fn()}
  />
);

describe('Plan — protein-only mode (WP-08)', () => {
  it('plan cards show protein per meal instead of kcal (row and grid cards)', () => {
    const { rerender } = render(
      inMode(
        'PROTEIN_ONLY',
        <>
          <MealCard mealType="dinner" recipe={recipe} planId="p" dayOfWeek={0} variant="row" />
          <MealCard mealType="lunch" recipe={recipe} planId="p" dayOfWeek={0} variant="grid" />
        </>,
      ),
    );
    expect(screen.getByTestId('plan-meal-dinner-protein').textContent).toBe('40 g protein');
    expect(text()).not.toMatch(/kcal/i);
    expect(screen.queryByText(/C 60g/)).toBeNull();
    // Back to the full numbers.
    rerender(
      inMode(
        'FULL',
        <>
          <MealCard mealType="dinner" recipe={recipe} planId="p" dayOfWeek={0} variant="row" />
          <MealCard mealType="lunch" recipe={recipe} planId="p" dayOfWeek={0} variant="grid" />
        </>,
      ),
    );
    expect(text()).toMatch(/700 kcal/);
    expect(text()).toMatch(/C 60g/);
  });

  it('a portion-sized card shows the portion-sized protein', () => {
    render(
      inMode(
        'PROTEIN_ONLY',
        <MealCard
          mealType="dinner"
          recipe={recipe}
          planId="p"
          dayOfWeek={0}
          variant="row"
          portion={1.5}
        />,
      ),
    );
    expect(screen.getByTestId('plan-meal-dinner-protein').textContent).toBe('60 g protein');
  });

  it('the day total shows protein and only a protein shortfall, never a calorie miss', () => {
    // Day 1 is calories-under (700 vs 2,240) and 25 g short on protein.
    const { rerender } = render(inMode('PROTEIN_ONLY', dayView(1)));
    expect(screen.getByTestId('day-total-protein').textContent).toBe('40 g protein');
    expect(screen.queryByTestId('day-target-status')).toBeNull();
    expect(screen.getByTestId('day-protein-gap').textContent).toContain(
      'About 25 g short on protein',
    );
    expect(text()).not.toMatch(/kcal/i);
    rerender(inMode('FULL', dayView(1)));
    expect(screen.getByTestId('day-target-status').textContent).toMatch(/kcal under/);
    expect(text()).toMatch(/700 kcal/);
  });

  it('the training header and its explain sheet name the protein bump only', () => {
    render(inMode('PROTEIN_ONLY', dayView(0)));
    const header = screen.getByTestId('training-day-header');
    expect(header.textContent).toContain('Training day · Upper A');
    expect(header.textContent).toContain('Target 165 g protein');
    expect(header.textContent).toContain('(+31 g protein for training)');
    expect(header.textContent).not.toMatch(/kcal/i);
    cleanup();
    render(
      inMode(
        'PROTEIN_ONLY',
        <TrainingExplainSheet
          open
          onClose={vi.fn()}
          days={[lift]}
          basis={{ restKcal: 2240, restProteinG: 134, proteinGPerKg: 1.8, bodyweightKg: 75 }}
        />,
      ),
    );
    expect(screen.getByTestId('training-explain').textContent).toContain('goes up by about 31 g');
    expect(document.body.textContent).not.toMatch(/kcal|calor/i);
  });

  it('the rebalance offer shows the protein gap and the protein change, never the server kcal text', () => {
    const preview = {
      planId: 'p1',
      headline: "You're about 600 kcal over for the week and 36 g short on protein this week.",
      swaps: [
        {
          dayOfWeek: 6,
          mealType: 'dinner',
          previousRecipeId: 'a',
          newRecipeId: 'b',
          newRecipeName: 'Chicken bowl',
          previousKcal: 520,
          newKcal: 700,
          previousProteinG: 14,
          newProteinG: 42,
          reason: 'calories' as const,
          explanation: 'Sunday dinner → Chicken bowl (+180 kcal, +28 g protein)',
        },
      ],
      snacks: [{ id: 'yog', name: 'Greek yogurt with honey', proteinG: 17, kcal: 150 }],
    };
    const view = (mode: string | null) =>
      inMode(
        mode,
        <RebalanceOfferView
          preview={preview}
          onApply={vi.fn()}
          onNotNow={vi.fn()}
          defaultExpanded
        />,
      );
    const { rerender } = render(view('PROTEIN_ONLY'));
    expect(text()).toContain("You're 36 g short on protein this week.");
    expect(text()).toContain('Sunday dinner → Chicken bowl (+28 g protein)');
    expect(text()).toContain('Greek yogurt with honey (+17 g protein)');
    expect(text()).not.toMatch(/kcal/i);
    rerender(view('FULL'));
    expect(text()).toMatch(/600 kcal over/);
    expect(text()).toMatch(/\+180 kcal/);
    expect(text()).toMatch(/150 kcal/);
  });

  it('a calorie-only offer headline leaves nothing to show but the generic ask', () => {
    render(
      inMode(
        'PROTEIN_ONLY',
        <RebalanceOfferView
          preview={{
            planId: 'p',
            headline: "You're about 600 kcal over for the week.",
            swaps: [],
            snacks: [],
          }}
          onApply={vi.fn()}
          onNotNow={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('I can rebalance the rest of your week.')).toBeTruthy();
    expect(text()).not.toMatch(/kcal/i);
  });

  it('What Premium changed drops the calorie lines, the calorie miss and its Fix it', () => {
    const changes = {
      lines: [
        'Built around your lift days (Mon and Wed)',
        'Meets your 2,100 kcal target on 5 of 7 days',
      ],
      targetHits: 5,
      missDays: 1,
      misses: [{ dayOfWeek: 3, deltaKcal: -300 }],
    };
    const card = (mode: string | null) =>
      inMode(
        mode,
        <PremiumChangesCard
          planId="p1"
          previousPlanId="old"
          changes={changes}
          currentDays={[
            {
              dayOfWeek: 0,
              meals: [
                {
                  type: 'dinner',
                  recipe: {
                    nutritionInfo: { calories: 2000, protein: 120, carbs: 1, fat: 1, fiber: 1 },
                  },
                },
              ],
            },
          ]}
          onFix={vi.fn()}
        />,
      );
    const { rerender } = render(card('PROTEIN_ONLY'));
    expect(text()).toContain('Built around your lift days');
    expect(screen.queryByTestId('premium-changes-fix')).toBeNull();
    fireEvent.click(screen.getByTestId('premium-changes-compare'));
    expect(screen.getByTestId('premium-compare').textContent).toContain('60 g protein');
    expect(text()).not.toMatch(/kcal|calorie/i);
    rerender(card('FULL'));
    expect(text()).toMatch(/2,100 kcal target/);
    expect(screen.getByTestId('premium-changes-fix')).toBeTruthy();
    expect(screen.getByTestId('premium-compare').textContent).toMatch(/1,500 kcal/);
  });

  it('the plan-miss sheet is about protein and states no calorie figure', () => {
    const sheet = (mode: string | null) =>
      inMode(
        mode,
        <PlanMissSheet
          open
          onClose={vi.fn()}
          planId="p1"
          dayOfWeek={1}
          dayName="Tuesday"
          kcal={1600}
          target={2000}
          proteinGapG={25}
          goal="MAINTAIN"
          onApplied={vi.fn()}
        />,
      );
    const { rerender } = render(sheet('PROTEIN_ONLY'));
    expect(text()).toContain('Short on protein');
    expect(text()).toContain('Tuesday: about 25 g short on protein');
    expect(text()).toContain('Brings the day to about 120 g protein');
    expect(text()).not.toMatch(/kcal|calorie/i);
    rerender(sheet('FULL'));
    expect(text()).toMatch(/kcal/);
  });
});
