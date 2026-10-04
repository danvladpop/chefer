import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { ProteinGuide, TrainingDayNutrition } from '@chefer/types';
import type { RebalancePreviewLike } from '@chefer/utils';
import { ChefReviewBanner } from '../../src/features/coach/chef-review-banner';
import { LaterTodayCard } from '../../src/features/dashboard/components/later-today-card';
import { NutritionSummary } from '../../src/features/dashboard/components/nutrition-summary';
import { TodaySlotNotes } from '../../src/features/dashboard/components/today-slot-notes';
import { TrainingDayNote } from '../../src/features/dashboard/components/training-day-note';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { CompareWeeksSheet } from '../../src/features/meal-plan/compare-weeks-sheet';
import { PlanDayTotals } from '../../src/features/meal-plan/plan-day-totals';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import { PremiumChangesCard } from '../../src/features/meal-plan/premium-changes-card';
import {
  TrainingDayHeader,
  TrainingExplainSheet,
} from '../../src/features/meal-plan/training-day-header';
import { WeekSummarySheet } from '../../src/features/meal-plan/week-summary-sheet';
import { NumbersModeProvider, useNumbersMode } from '../../src/features/numbers-mode/numbers-mode';
import { PlanMissSheet } from '../../src/features/nutrition/plan-miss-sheet';
import { RebalanceOffer } from '../../src/features/tracker/rebalance-offer';
import {
  resetRebalanceOfferForTests,
  setRebalanceOffer,
} from '../../src/features/tracker/rebalance-offer-store';
import { resetRebalanceStoreForTests } from '../../src/features/tracker/rebalance-store';

// WP-08 protein-only mode on the Today, Plan and weekly-review surfaces. Every
// block renders a surface in PROTEIN_ONLY and proves no kcal / calorie text is
// on it, then (where the surface has a full-mode twin) that FULL restores it.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

let mockProteinWeekDays: Record<string, unknown>[] = [];
let mockReview: unknown;
let mockPreviousPlan: unknown;
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { getForWeek: { invalidate: jest.fn() } },
      dashboard: { summary: { invalidate: jest.fn() } },
      tracker: { invalidate: jest.fn() },
      shoppingList: { invalidate: jest.fn() },
    }),
    coach: { currentReview: { useQuery: () => ({ data: mockReview }) } },
    preferences: { get: { useQuery: () => ({ data: undefined }) } },
    tracker: { weeklySummary: { useQuery: () => ({ data: { days: mockProteinWeekDays } }) } },
    mealPlan: {
      applyRebalance: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      scaleDay: {
        useMutation: (opts: { onSuccess?: (d: unknown) => void }) => ({
          mutate: () => opts.onSuccess?.({ kcal: 2100, protein: 128 }),
          isPending: false,
          isError: false,
        }),
      },
      getById: { useQuery: () => ({ data: mockPreviousPlan, isLoading: false, isError: false }) },
    },
  },
}));

const SAFE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const inProteinOnly = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE}>
    <NumbersModeProvider mode="PROTEIN_ONLY">{ui}</NumbersModeProvider>
  </SafeAreaProvider>
);
const noKcal = () => expect(screen.queryByText(/kcal|calori/i)).toBeNull();

beforeEach(() => {
  jest.clearAllMocks();
  mockProteinWeekDays = [];
  mockPreviousPlan = undefined;
});

// ─── the one predicate ──────────────────────────────────────────────────────────
describe('useNumbersMode', () => {
  function Probe({ payload }: { payload?: string | null }) {
    const { mode, proteinOnly } = useNumbersMode(payload);
    return <Text testID="probe">{`${mode}/${String(proteinOnly)}`}</Text>;
  }
  const text = () => screen.getByTestId('probe').props.children as string;

  it('is FULL with no provider, and for null, NONE (reserved) and unknown values', async () => {
    await render(<Probe />);
    expect(text()).toBe('FULL/false');
    for (const raw of [null, 'NONE', 'SOMETHING_NEW']) {
      await render(
        <NumbersModeProvider mode={raw}>
          <Probe />
        </NumbersModeProvider>,
      );
      expect(text()).toBe('FULL/false');
    }
  });

  it('reads PROTEIN_ONLY from the provider; a payload value wins; undefined inherits', async () => {
    await render(
      <NumbersModeProvider mode="PROTEIN_ONLY">
        <Probe />
      </NumbersModeProvider>,
    );
    expect(text()).toBe('PROTEIN_ONLY/true');
    await render(
      <NumbersModeProvider mode="PROTEIN_ONLY">
        <Probe payload="FULL" />
      </NumbersModeProvider>,
    );
    expect(text()).toBe('FULL/false');
    await render(
      <NumbersModeProvider mode="PROTEIN_ONLY">
        <NumbersModeProvider mode={undefined}>
          <Probe />
        </NumbersModeProvider>
      </NumbersModeProvider>,
    );
    expect(text()).toBe('PROTEIN_ONLY/true');
  });
});

// ─── Today ──────────────────────────────────────────────────────────────────────
const nutrition = {
  dailyCalorieTarget: 2000,
  plannedKcal: 1900,
  eatenKcal: 1200,
  protein: { planned: 110, targetG: 120, eaten: 72 },
  carbs: { planned: 180, targetG: 220, eaten: 90 },
  fat: { planned: 50, targetG: 70, eaten: 20 },
};
const guide: ProteinGuide = {
  proteinG: 120,
  meals: 3,
  perMealG: 40,
  lowG: 35,
  highG: 45,
  label: '35–45 g per meal',
};

describe('Today ring (protein-only)', () => {
  it('is a protein ring: "72 of 120 g protein" and the per-meal guide, no kcal, no macro bars', async () => {
    await render(inProteinOnly(<NutritionSummary nutrition={nutrition} proteinGuide={guide} />));
    expect(screen.getByTestId('protein-ring')).toHaveProp(
      'accessibilityLabel',
      '72 of 120 g protein eaten today',
    );
    // CountUp tweens; its accessible label is the final value.
    expect(screen.getByTestId('protein-count')).toHaveProp('accessibilityLabel', '72');
    expect(screen.getByTestId('protein-ring-caption')).toHaveTextContent('of 120 g protein');
    expect(screen.getByTestId('protein-guide')).toHaveTextContent('35–45 g per meal');
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent('48 g to go');
    expect(screen.queryByTestId('calorie-ring')).toBeNull();
    expect(screen.queryByTestId('calorie-remaining')).toBeNull();
    expect(screen.queryByTestId('macro-carbs')).toBeNull();
    expect(screen.queryByTestId('macro-fat')).toBeNull();
    noKcal();
  });

  it('says so when the goal is reached', async () => {
    await render(
      inProteinOnly(
        <NutritionSummary
          nutrition={{ ...nutrition, protein: { planned: 110, targetG: 120, eaten: 125 } }}
        />,
      ),
    );
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent('Protein goal reached');
    expect(screen.queryByTestId('protein-guide')).toBeNull();
  });

  it('a training day shows the protein bump only (training-day targets, protein-only)', async () => {
    const trainingDay: TrainingDayNutrition = {
      isTrainingDay: true,
      reason: 'SCHEDULED',
      workoutName: 'Full Body A',
      kcalBonus: 200,
      proteinBonus: 32,
      applied: true,
      basis: { bodyweightKg: 80, proteinGPerKg: 1.8, trainingDayProteinGPerKg: 2.2 },
    };
    await render(
      inProteinOnly(
        <NutritionSummary
          nutrition={{
            ...nutrition,
            trainingDay,
            adjustedTargets: { dailyCalorieTarget: 2200, proteinG: 152, carbsG: 267, fatG: 70 },
          }}
        />,
      ),
    );
    expect(screen.getByTestId('protein-ring-caption')).toHaveTextContent('of 152 g protein');
    expect(screen.getByTestId('training-day-line')).toHaveTextContent(
      'Training day · +32 g protein',
    );
    expect(screen.queryByTestId('training-day-why')).toBeNull();
    noKcal();
  });

  it('a run day has no protein number, so no note', async () => {
    await render(
      inProteinOnly(
        <TrainingDayNote
          t={{
            isTrainingDay: true,
            reason: 'SCHEDULED',
            kind: 'run',
            workoutName: null,
            kcalBonus: 250,
            proteinBonus: 0,
            applied: true,
            basis: { bodyweightKg: 70, proteinGPerKg: 1.6, trainingDayProteinGPerKg: 1.6 },
          }}
        />,
      ),
    );
    expect(screen.queryByTestId('training-day')).toBeNull();
  });

  it('switching back to the full numbers restores the calorie ring and the macro bars', async () => {
    await render(
      <NumbersModeProvider mode="FULL">
        <NutritionSummary nutrition={nutrition} proteinGuide={guide} />
      </NumbersModeProvider>,
    );
    expect(screen.getByTestId('calorie-ring')).toBeOnTheScreen();
    expect(screen.getByTestId('macro-carbs')).toBeOnTheScreen();
    expect(screen.queryByTestId('protein-ring')).toBeNull();
    expect(screen.getByText(/kcal/)).toBeOnTheScreen();
  });
});

describe('Today lists (protein-only)', () => {
  it('"Later today" lists meals without kcal; full mode still shows it', async () => {
    const meals = [
      {
        mealType: 'dinner',
        scheduledLabel: '7:00 PM',
        recipeName: 'Chicken bowl',
        recipeId: 'r1',
        kcal: 610,
      },
    ];
    await render(inProteinOnly(<LaterTodayCard meals={meals} />));
    expect(screen.getByText('Chicken bowl')).toBeOnTheScreen();
    noKcal();
    await render(<LaterTodayCard meals={meals} />);
    expect(screen.getByText('610 kcal')).toBeOnTheScreen();
  });

  it('the week outlook lists the day\u2019s meals without kcal', async () => {
    const user = userEvent.setup();
    const jsDay = new Date().getDay();
    const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const weekPlan = [
      {
        dayOfWeek: todayIdx,
        meals: [
          {
            mealType: 'dinner',
            recipeId: 'r1',
            recipeName: 'Chicken bowl',
            imageUrl: null,
            kcal: 610,
          },
        ],
      },
    ];
    await render(inProteinOnly(<WeekOutlook weekPlan={weekPlan} />));
    await user.press(screen.getByTestId(`day-chip-${todayIdx}`));
    expect(screen.getByText('Chicken bowl')).toBeOnTheScreen();
    noKcal();
    await render(<WeekOutlook weekPlan={weekPlan} />);
    await user.press(screen.getByTestId(`day-chip-${todayIdx}`));
    expect(screen.getByText('610 kcal')).toBeOnTheScreen();
  });

  it('a replaced meal reads "You had: … (≈ 40 g protein)"', async () => {
    await render(
      inProteinOnly(
        <TodaySlotNotes
          slots={[
            {
              slotIndex: 0,
              mealType: 'lunch',
              status: 'replaced',
              replacedBy: { name: 'Shawarma', kcal: 780, protein: 40 },
            },
          ]}
          onRemoveReplacement={jest.fn()}
          onUndoSkip={jest.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('today-slot-lunch-0-text')).toHaveTextContent(
      'You had: Shawarma (≈ 40 g protein)',
    );
    noKcal();
  });
});

// ─── Plan ───────────────────────────────────────────────────────────────────────
const recipe = {
  id: 'r1',
  name: 'Chicken Rice Bowl',
  description: '',
  ingredients: [],
  instructions: [],
  nutritionInfo: { calories: 500, protein: 40, carbs: 50, fat: 20, fiber: 5 },
  cuisineType: 'asian',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 1,
  imageUrl: null,
  imageStatus: 'DONE' as const,
};

describe('Plan (protein-only)', () => {
  it('a plan card shows protein per meal at its portion instead of kcal', async () => {
    await render(
      inProteinOnly(
        <PlanMealCard
          testID="plan-meal-dinner"
          day={1}
          meal={{ type: 'dinner', recipe, portion: 1.5 }}
        />,
      ),
    );
    expect(screen.getByTestId('plan-meal-dinner-nutrition')).toHaveTextContent('60 g protein');
    noKcal();
    await render(
      <PlanMealCard testID="plan-meal-dinner" day={1} meal={{ type: 'dinner', recipe }} />,
    );
    expect(screen.getByTestId('plan-meal-dinner-nutrition')).toHaveTextContent('500 kcal');
  });

  it('the day total is protein only, and only a protein shortfall is a status', async () => {
    const meals = [{ recipe: { nutritionInfo: recipe.nutritionInfo } }];
    // A day far under its calorie target is not mentioned…
    await render(
      inProteinOnly(<PlanDayTotals meals={meals} calorieTarget={2400} onOpenStatus={jest.fn()} />),
    );
    expect(screen.getByTestId('plan-day-totals-protein')).toHaveTextContent('40 g protein');
    expect(screen.queryByTestId('plan-day-totals-status')).toBeNull();
    noKcal();
    // …a protein shortfall is.
    await render(
      inProteinOnly(<PlanDayTotals meals={meals} calorieTarget={2400} proteinGapG={30} />),
    );
    expect(screen.getByTestId('plan-day-totals-status')).toHaveTextContent(
      'About 30 g short on protein',
    );
    noKcal();
  });

  it('the miss sheet judges the day by protein and previews protein only', async () => {
    await render(
      inProteinOnly(
        <PlanMissSheet
          visible
          onClose={jest.fn()}
          planId="p1"
          dayOfWeek={1}
          dayName="Tuesday"
          kcal={1000}
          protein={60}
          calorieTarget={2000}
          proteinGapG={30}
          goal="BUILD_MUSCLE"
          onApplied={jest.fn()}
          onAddSnack={jest.fn()}
        />,
      ),
    );
    expect(screen.getByText(/Tuesday is about 30 g short on protein/)).toBeOnTheScreen();
    expect(screen.getByTestId('plan-miss-preview')).toHaveTextContent('Would be 128 g protein');
    noKcal();
  });

  it('the week summary lists protein per day', async () => {
    await render(
      inProteinOnly(
        <WeekSummarySheet
          visible
          weekLabel="Mon 6 Oct"
          badge="This week"
          days={[
            {
              label: 'Mon',
              dayIndex: 0,
              mealsCount: 3,
              totalKcal: 2000,
              totalProtein: 120,
              isToday: true,
            },
            {
              label: 'Tue',
              dayIndex: 1,
              mealsCount: 3,
              totalKcal: 1800,
              totalProtein: 100,
              isToday: false,
            },
          ]}
          weekCostEur={null}
          isPast={false}
          isPremium={false}
          leftovers={false}
          onToggleLeftovers={jest.fn()}
          regenerating={false}
          onRegenerate={jest.fn()}
          onMyWeeks={jest.fn()}
          onSelectDay={jest.fn()}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(screen.getByText('~110 g protein/day')).toBeOnTheScreen();
    expect(screen.getByText('120 g protein')).toBeOnTheScreen();
    noKcal();
  });

  it('what Premium changed drops calorie lines and the calorie miss', async () => {
    await render(
      inProteinOnly(
        <PremiumChangesCard
          changes={{
            lines: ['Hit your calorie target on 6 of 7 days', 'Added 2 high-protein dinners'],
            targetHits: 6,
            missDays: 1,
            misses: [{ dayOfWeek: 1, deltaKcal: -320 }],
          }}
          hasPrevious={false}
          onFixIt={jest.fn()}
          onCompare={jest.fn()}
          onDismiss={jest.fn()}
        />,
      ),
    );
    expect(screen.getByText('Added 2 high-protein dinners')).toBeOnTheScreen();
    expect(screen.queryByTestId('premium-changes-miss')).toBeNull();
    expect(screen.queryByTestId('premium-changes-fix')).toBeNull();
    noKcal();
  });

  it('a training day header and its Explain sheet name protein, never kcal', async () => {
    const day = {
      dayOfWeek: 2,
      dayName: 'Wednesday',
      kind: 'lift' as const,
      workoutName: 'Upper A',
      kcalBonus: 250,
      proteinBonus: 25,
      carbsBonus: 0,
      done: false,
      applied: true,
      targetKcal: 2450,
      targetProteinG: 155,
    };
    await render(
      inProteinOnly(
        <>
          <TrainingDayHeader day={day} isToday onPress={jest.fn()} />
          <TrainingExplainSheet
            visible
            onClose={jest.fn()}
            days={[day]}
            basis={{ restKcal: 2200, restProteinG: 130, proteinGPerKg: 1.8, bodyweightKg: 72 }}
          />
        </>,
      ),
    );
    expect(screen.getByTestId('plan-training-header-title')).toHaveTextContent(
      'Training day · Upper A',
    );
    expect(screen.getByTestId('plan-training-header-target')).toHaveTextContent(
      'Target 155 g protein',
    );
    expect(screen.getByTestId('plan-training-header-bonus')).toHaveTextContent(
      '(+25 g protein for training)',
    );
    expect(screen.getByTestId('training-explain-sheet-sentence')).toHaveTextContent(
      /your protein goes up by about 25 g/,
    );
    noKcal();
  });

  it('compare weeks shows protein only, and kcal again in full mode', async () => {
    const week = (calories: number, protein: number) => ({
      days: [
        {
          dayOfWeek: 0,
          meals: [{ recipe: { nutritionInfo: { calories, protein, carbs: 0, fat: 0 } } }],
        },
      ],
    });
    mockPreviousPlan = week(1800, 90);
    const sheet = (
      <CompareWeeksSheet
        visible
        onClose={jest.fn()}
        previousPlanId="old"
        current={week(2100, 130)}
      />
    );
    await render(inProteinOnly(sheet));
    expect(screen.getByText('90 g protein')).toBeOnTheScreen();
    expect(screen.getByText('130 g protein')).toBeOnTheScreen();
    noKcal();
    await render(<SafeAreaProvider initialMetrics={SAFE}>{sheet}</SafeAreaProvider>);
    expect(screen.getByText('1,800 kcal · 90 g')).toBeOnTheScreen();
  });
});

// ─── Rebalance offer ────────────────────────────────────────────────────────────
describe('Rebalance offer (protein-only)', () => {
  const offer = (): RebalancePreviewLike => ({
    planId: 'plan-1',
    headline: "You're about 600 kcal over for the week and 36 g short on protein this week.",
    swaps: [
      {
        dayOfWeek: 6,
        mealType: 'dinner',
        previousRecipeId: 'old',
        newRecipeId: 'new',
        previousRecipeName: 'Lentil soup',
        newRecipeName: 'Chicken bowl',
        previousKcal: 520,
        newKcal: 460,
        previousProteinG: 14,
        newProteinG: 42,
        reason: 'both',
        explanation: 'Sunday dinner → Chicken bowl (+28 g protein, −60 kcal)',
      },
    ],
    snacks: [{ id: 's1', name: 'Greek yogurt', proteinG: 17, kcal: 150 }],
  });

  beforeEach(() => {
    setKvBackendForTests(createMemoryKvBackend());
    resetRebalanceStoreForTests();
    resetRebalanceOfferForTests();
  });

  it('explains the swap and the snack by protein, with no kcal anywhere', async () => {
    const user = userEvent.setup();
    await render(inProteinOnly(<RebalanceOffer />));
    await act(() => {
      setRebalanceOffer(offer());
    });
    expect(screen.getByTestId('rebalance-offer-headline')).toHaveTextContent(
      "You're 36 g short on protein this week.",
    );
    expect(screen.getByTestId('rebalance-offer-text')).toHaveTextContent(
      'I can rebalance the rest of your week: Sunday dinner → Chicken bowl (+28 g protein).',
    );
    await user.press(screen.getByTestId('rebalance-offer-preview'));
    expect(screen.getByTestId('rebalance-offer-detail-0')).toHaveTextContent(
      'Replaces Lentil soup (14 g protein) with Chicken bowl (42 g protein)',
    );
    expect(screen.getByText(/Greek yogurt \(\+17 g protein\)/)).toBeOnTheScreen();
    noKcal();
  });

  it('full mode keeps the calorie detail', async () => {
    const user = userEvent.setup();
    await render(<RebalanceOffer />);
    await act(() => {
      setRebalanceOffer(offer());
    });
    await user.press(screen.getByTestId('rebalance-offer-preview'));
    expect(screen.getByTestId('rebalance-offer-detail-0')).toHaveTextContent(/520 kcal/);
    expect(screen.getByText(/150 kcal/)).toBeOnTheScreen();
  });
});

// ─── Weekly review ──────────────────────────────────────────────────────────────
describe('Weekly review (protein-only)', () => {
  const review = {
    status: 'full',
    review: {
      reviewText:
        'A steady week.\nYour logged days averaged 2,100 kcal, about 100 over target.\nTry one more protein-rich lunch.',
      adherencePct: 71,
      avgDailyKcal: 2100,
      weightTrendKg: null,
      adjustmentKcal: -100,
    },
  };

  it('shows the protein average, drops every calorie line and the budget change', async () => {
    const user = userEvent.setup();
    mockReview = review;
    mockProteinWeekDays = [
      { date: '2000-01-01', totalKcal: 1600, totalProtein: 110, hasLog: true },
      { date: '2000-01-02', totalKcal: 1680, totalProtein: 114, hasLog: true },
    ];
    await render(inProteinOnly(<ChefReviewBanner />));
    expect(screen.getByTestId('coach-review-protein-average')).toHaveTextContent(
      'This week you averaged 112 g protein a day',
    );
    await user.press(screen.getByTestId('coach-review-toggle'));
    expect(screen.getByText(/Try one more protein-rich lunch/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('coach-review-why'));
    expect(await screen.findByText('Where these numbers come from')).toBeOnTheScreen();
    expect(screen.getByText('112 g a day')).toBeOnTheScreen();
    noKcal();
  });

  it('a free teaser never quotes the calorie first line', async () => {
    mockReview = { status: 'teaser', firstLine: 'Your logged days averaged 2,100 kcal.' };
    await render(inProteinOnly(<ChefReviewBanner />));
    expect(screen.getByTestId('coach-teaser')).toBeOnTheScreen();
    noKcal();
  });

  it('full mode keeps the calorie average', async () => {
    mockReview = review;
    await render(<ChefReviewBanner />);
    expect(screen.getByText('2100')).toBeOnTheScreen();
    expect(screen.getByText(/kcal\/day/)).toBeOnTheScreen();
  });
});

// keep fireEvent import used for future presses in this file
void fireEvent;
