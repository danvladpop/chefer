// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { NextMealCard } from '@/features/dashboard/components/next-meal-card';
import { TodaySlotNotes } from '@/features/dashboard/components/today-slot-notes';
import { TonightCard } from '@/features/dashboard/components/tonight-card';
import { TrainingDayNote } from '@/features/dashboard/components/training-day-note';
import { PlanHistoryCard } from '@/features/history/components/PlanHistoryCard';
import { ChangeNoticeCard } from '@/features/nutrition/components/ChangeNoticeCard';
import { TargetExplainSheet } from '@/features/nutrition/components/TargetExplainSheet';
import { fakeSlotFlow } from '@/features/tracker/lib/slot-flow.fixture';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProteinWhy, TargetsView, TrainingDayNutrition } from '@chefer/types';
import { NumbersModeProvider } from './numbers-mode';

// WP-08: the smaller Today / history / targets surfaces, protein-only vs full.

const m = vi.hoisted(() => ({ changes: [] as unknown[] }));

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
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/analytics-events', () => ({ trackMealLogged: vi.fn() }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({
  handleRebalanceOutcome: vi.fn(),
  REBALANCE_PREVIEW: { rebalanceMode: 'preview' },
}));
vi.mock('@/features/safety/components/CheckedForChip', () => ({ CheckedForChip: () => null }));
vi.mock('@/features/history/components/UseWeekAgainSheet', () => ({
  UseWeekAgainSheet: () => null,
}));
vi.mock('@/features/recipe/components/StarRatingWidget', () => ({
  StarRatingWidget: () => null,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { summary: { invalidate: vi.fn() } },
      tracker: { getDay: { invalidate: vi.fn() }, weeklySummary: { invalidate: vi.fn() } },
      targets: { changes: { invalidate: vi.fn() }, get: { invalidate: vi.fn() } },
    }),
    tracker: {
      logRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      unlogRecipe: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    recipe: { getMyRating: { useQuery: () => ({ data: null, isLoading: false }) } },
    targets: {
      changes: { useQuery: () => ({ data: m.changes }) },
      acknowledgeChange: { useMutation: () => ({ mutate: vi.fn() }) },
      get: {
        useQuery: () => ({
          data: { effective: { dailyCalorieTarget: 2240, proteinG: 150, carbsG: 250, fatG: 70 } },
        }),
      },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  m.changes = [];
});

const inMode = (mode: string | null, ui: ReactNode) => (
  <NumbersModeProvider mode={mode}>{ui}</NumbersModeProvider>
);
const text = () => document.body.textContent ?? '';

const recipe = {
  id: 'curry',
  name: 'Lentil Curry',
  description: '',
  imageUrl: null,
  kcal: 700,
  servings: 2,
  prepTimeMins: 10,
  cookTimeMins: 20,
};
const tonight = {
  planId: 'p1',
  dayOfWeek: 0,
  slotIndex: 0,
  mealType: 'dinner',
  done: false,
  recipe,
};

describe('Today cards — protein-only mode (WP-08)', () => {
  it('the hero meal card shows no kcal, and keeps a portion note', () => {
    const card = (mode: string | null, portion?: number) =>
      inMode(
        mode,
        <NextMealCard
          meal={{ mealType: 'dinner', recipe, ...(portion !== undefined && { portion }) }}
          isTomorrow={false}
        />,
      );
    const { rerender } = render(card('PROTEIN_ONLY'));
    expect(text()).not.toMatch(/kcal/i);
    rerender(card('PROTEIN_ONLY', 1.5));
    expect(text()).toContain('1½');
    expect(text()).not.toMatch(/kcal/i);
    rerender(card('FULL', 1.5));
    expect(text()).toMatch(/700 kcal/);
  });

  it('Tonight shows no kcal, and a replaced dinner names its protein', () => {
    const replaced = {
      mealType: 'dinner',
      slotIndex: 0,
      status: 'replaced' as const,
      replacedBy: { entryId: 'e1', name: 'Shawarma', kcal: 775, protein: 40 },
    };
    const card = (mode: string | null, over: { done?: boolean; withSlot?: boolean } = {}) =>
      inMode(
        mode,
        <TonightCard
          meal={{ ...tonight, done: over.done ?? false }}
          showNutrition
          onLogged={vi.fn()}
          flow={fakeSlotFlow()}
          {...(over.withSlot && { slot: replaced })}
        />,
      );
    const { rerender } = render(card('PROTEIN_ONLY'));
    expect(text()).toContain('Lentil Curry');
    expect(text()).not.toMatch(/kcal/i);
    rerender(card('PROTEIN_ONLY', { done: true, withSlot: true }));
    expect(text()).toContain('You had: Shawarma (≈ 40 g protein)');
    expect(text()).not.toMatch(/kcal/i);
    rerender(card('FULL', { done: true, withSlot: true }));
    expect(text()).toContain('You had: Shawarma (≈ 775 kcal)');
    rerender(card('FULL'));
    expect(text()).toMatch(/700 kcal/);
  });

  it('replaced-slot notes say protein, never kcal', () => {
    const slots = [
      {
        mealType: 'lunch',
        slotIndex: 1,
        status: 'replaced' as const,
        replacedBy: { entryId: 'e2', name: 'Pizza', kcal: 900, protein: 35 },
      },
    ];
    const { rerender } = render(
      inMode('PROTEIN_ONLY', <TodaySlotNotes slots={slots} flow={fakeSlotFlow()} />),
    );
    expect(text()).toContain('You had: Pizza (≈ 35 g protein)');
    expect(text()).not.toMatch(/kcal/i);
    rerender(inMode('FULL', <TodaySlotNotes slots={slots} flow={fakeSlotFlow()} />));
    expect(text()).toContain('You had: Pizza (≈ 900 kcal)');
  });

  it('the training-day note is just the protein bump; a run day has nothing to say', () => {
    const lift: TrainingDayNutrition = {
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: 'Full Body B',
      kcalBonus: 280,
      proteinBonus: 32,
      applied: true,
      basis: { bodyweightKg: 80, proteinGPerKg: 1.8, trainingDayProteinGPerKg: 2.2 },
    };
    const { rerender } = render(inMode('PROTEIN_ONLY', <TrainingDayNote t={lift} />));
    expect(screen.getByTestId('training-day-line').textContent).toBe(
      'Training day · +32 g protein',
    );
    expect(text()).not.toMatch(/kcal|Why\?/);
    rerender(inMode('PROTEIN_ONLY', <TrainingDayNote t={{ ...lift, kind: 'long_run' }} />));
    expect(screen.queryByTestId('training-day')).toBeNull();
    rerender(inMode('FULL', <TrainingDayNote t={lift} />));
    expect(text()).toContain('Training day · +280 kcal, +32 g protein');
  });
});

describe('Past weeks and targets — protein-only mode (WP-08)', () => {
  const plan = {
    id: 'w1',
    weekStartDate: '2026-09-21',
    weekEndDate: '2026-09-27',
    status: 'ARCHIVED',
    createdAt: '2026-09-20',
    recipePreview: ['Lentil Curry'],
    macroSummary: { avgKcal: 2100, avgProtein: 112, avgCarbs: 230, avgFat: 70 },
  };

  it('a past week shows its protein average, not kcal or macros', () => {
    const { rerender } = render(inMode('PROTEIN_ONLY', <PlanHistoryCard plan={plan} />));
    expect(text()).toContain('112 g protein avg');
    expect(text()).not.toMatch(/kcal|\bC\b|\bF\b/);
    rerender(inMode('FULL', <PlanHistoryCard plan={plan} />));
    expect(text()).toContain('2100 kcal avg');
  });

  it('a target-change notice lists the protein change only, and never offers a kcal number', () => {
    m.changes = [
      {
        id: 'c1',
        kind: 'CHANGED',
        reason: 'GYM_SETUP',
        fields: [
          { field: 'dailyCalorieTarget', before: 2100, after: 2400 },
          { field: 'proteinG', before: 130, after: 150 },
        ],
      },
    ];
    const { rerender } = render(inMode('PROTEIN_ONLY', <ChangeNoticeCard />));
    expect(text()).toContain('Protein: 130 g → 150 g');
    expect(screen.getByTestId('change-notice-keep').textContent).toBe('Keep mine');
    expect(screen.getByTestId('change-notice-use-new').textContent).toBe('Use new');
    expect(text()).not.toMatch(/kcal|Calories/);
    rerender(inMode('FULL', <ChangeNoticeCard />));
    expect(text()).toContain('Calories: 2100 kcal → 2400 kcal');
    expect(screen.getByTestId('change-notice-keep').textContent).toBe('Keep 2100');
  });

  it('"Why this number" becomes "Why this protein number?" from the API sentence', () => {
    const view: TargetsView & { proteinWhy: ProteinWhy } = {
      effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
      suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
      source: 'suggested',
      inputs: {
        weightKg: 94,
        heightCm: 180,
        age: 30,
        activity: 'MODERATELY_ACTIVE',
        goal: 'MAINTAIN',
        isLifter: false,
        proteinGPerKg: null,
        usedAdjustedWeight: false,
        rate: 'Maintenance calories',
      },
      proteinWhy: {
        effectiveG: 150,
        gPerKg: 1.6,
        referenceGPerKg: 1.6,
        referenceG: 150,
        differs: false,
        reason: 'GOAL_SPLIT',
        sentence: 'Your protein target is 150 g a day, about 1.6 g per kg of your body weight.',
      },
    };
    render(inMode('PROTEIN_ONLY', <TargetExplainSheet open onClose={vi.fn()} view={view} />));
    expect(screen.getByText('Why this protein number?')).toBeTruthy();
    expect(text()).toContain('about 1.6 g per kg of your body weight');
    expect(text()).not.toMatch(/kcal|Carbs|Fat/);
    cleanup();
    render(inMode('FULL', <TargetExplainSheet open onClose={vi.fn()} view={view} />));
    expect(screen.getByText('Why this number')).toBeTruthy();
    expect(text()).toMatch(/2,200 kcal/);
  });
});
