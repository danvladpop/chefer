import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import { TonightCard } from '../../src/features/dashboard/components/tonight-card';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { ChangeNoticeCard } from '../../src/features/nutrition/change-notice-card';
import { TargetExplainSheet } from '../../src/features/nutrition/target-explain-sheet';
import { EditEntrySheet } from '../../src/features/tracker/edit-entry-sheet';
import { EditRecipeEntrySheet } from '../../src/features/tracker/edit-recipe-entry-sheet';

// WP-08: the remaining Today / tracker cards and sheets in protein-only mode.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));

let mockChanges: unknown[] = [];
jest.mock('../../src/lib/trpc', () => {
  const noopMutation = () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  });
  return {
    trpc: {
      useUtils: () => ({
        tracker: { getDay: { invalidate: jest.fn() }, weeklySummary: { invalidate: jest.fn() } },
        dashboard: { summary: { invalidate: jest.fn() } },
        targets: { changes: { invalidate: jest.fn() }, get: { invalidate: jest.fn() } },
      }),
      recipe: { getMyRating: { useQuery: () => ({ data: undefined, isLoading: false }) } },
      targets: {
        changes: { useQuery: () => ({ data: mockChanges }) },
        acknowledgeChange: { useMutation: noopMutation },
      },
      tracker: {
        logRecipe: { useMutation: noopMutation },
        unlogRecipe: { useMutation: noopMutation },
        updateCustomMeal: { useMutation: noopMutation },
        deleteCustomMeal: { useMutation: noopMutation },
        restoreCustomMeal: { useMutation: noopMutation },
      },
    },
  };
});

const SAFE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (mode: string | null, ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE}>
    <NumbersModeProvider mode={mode}>{ui}</NumbersModeProvider>
  </SafeAreaProvider>
);
const noKcal = () => expect(screen.queryByText(/kcal|calori/i)).toBeNull();

const hero = {
  mealType: 'dinner',
  recipe: {
    id: 'r1',
    name: 'Chicken Rice Bowl',
    description: '',
    imageUrl: null,
    kcal: 750,
    servings: 1,
    prepTimeMins: 10,
  },
};

describe('Today meal cards (protein-only)', () => {
  it('the "next up" card shows no kcal, but keeps the portion; full mode shows both', async () => {
    await render(
      wrap('PROTEIN_ONLY', <HeroMealCard meal={{ ...hero, portion: 1.5 }} isTomorrow={false} />),
    );
    expect(screen.getByText('1½× portion')).toBeOnTheScreen();
    noKcal();
    await render(
      wrap('FULL', <HeroMealCard meal={{ ...hero, portion: 1.5 }} isTomorrow={false} />),
    );
    expect(screen.getByText(/750 kcal · 1½× portion/)).toBeOnTheScreen();
  });

  it('the "next up" card without a portion has no nutrition line at all', async () => {
    await render(wrap('PROTEIN_ONLY', <HeroMealCard meal={hero} isTomorrow={false} />));
    noKcal();
    expect(screen.queryByText(/portion/)).toBeNull();
  });

  const tonight = {
    planId: 'p1',
    dayOfWeek: 2,
    slotIndex: 0,
    mealType: 'dinner',
    done: false,
    recipe: { ...hero.recipe, kcal: 640, cookTimeMins: 20 },
  };

  it('the Tonight card drops its kcal', async () => {
    await render(
      wrap('PROTEIN_ONLY', <TonightCard meal={tonight} showNutrition onLogged={jest.fn()} />),
    );
    expect(screen.getByText(/30 min · for 1/)).toBeOnTheScreen();
    noKcal();
    await render(wrap('FULL', <TonightCard meal={tonight} showNutrition onLogged={jest.fn()} />));
    expect(screen.getByText(/640 kcal/)).toBeOnTheScreen();
  });

  it('a replaced dinner says what you had with its protein', async () => {
    await render(
      wrap(
        'PROTEIN_ONLY',
        <TonightCard
          meal={{ ...tonight, done: true }}
          showNutrition
          onLogged={jest.fn()}
          slot={{ status: 'replaced', name: 'Pizza', kcal: 900, protein: 35 }}
        />,
      ),
    );
    expect(screen.getByTestId('tonight-replaced-text')).toHaveTextContent(
      'Dinner done · You had: Pizza (≈ 35 g protein)',
    );
    noKcal();
  });
});

describe('Target change notice and "Why this number" (protein-only)', () => {
  it('lists the protein change only and never offers a kcal number', async () => {
    mockChanges = [
      {
        id: 'c1',
        kind: 'CHANGED',
        reason: 'WEIGHT',
        fields: [
          { field: 'dailyCalorieTarget', before: 2000, after: 2150 },
          { field: 'proteinG', before: 120, after: 128 },
        ],
      },
    ];
    await render(wrap('PROTEIN_ONLY', <ChangeNoticeCard />));
    expect(screen.getByText('Protein: 120 g → 128 g')).toBeOnTheScreen();
    expect(screen.getByTestId('change-notice-keep')).toHaveTextContent('Keep mine');
    expect(screen.getByTestId('change-notice-use-new')).toHaveTextContent('Use new');
    noKcal();
    await render(wrap('FULL', <ChangeNoticeCard />));
    expect(screen.getByText('Calories: 2000 kcal → 2150 kcal')).toBeOnTheScreen();
    expect(screen.getByTestId('change-notice-use-new')).toHaveTextContent('Use 2150');
  });

  const view = {
    source: 'suggested',
    effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
    inputs: {},
    proteinWhy: {
      effectiveG: 150,
      gPerKg: 1.9,
      referenceGPerKg: 1.6,
      referenceG: 128,
      differs: true,
      reason: 'LIFTER_GOAL',
      sentence: 'Your protein is 150 g a day because you train to build muscle.',
    },
  } as unknown as Parameters<typeof TargetExplainSheet>[0]['view'];

  it('explains the protein number (from targets.get proteinWhy) and nothing else', async () => {
    await render(
      wrap('PROTEIN_ONLY', <TargetExplainSheet visible onClose={jest.fn()} view={view} />),
    );
    expect(screen.getByText('Why this protein number?')).toBeOnTheScreen();
    expect(
      screen.getByText('Your protein is 150 g a day because you train to build muscle.'),
    ).toBeOnTheScreen();
    noKcal();
  });

  it('the full numbers still explain the calorie target', async () => {
    await render(wrap('FULL', <TargetExplainSheet visible onClose={jest.fn()} view={view} />));
    expect(screen.getByText('Why this number')).toBeOnTheScreen();
    expect(screen.getByText('2,200 kcal')).toBeOnTheScreen();
  });
});

describe('Edit sheets (protein-only)', () => {
  it('editing a custom entry shows the protein field and no calories, carbs or fat', async () => {
    const entry = {
      entryIndex: 0,
      entryId: 'e1',
      name: 'Protein shake',
      mealType: 'snack' as const,
      estimatedBy: 'manual' as const,
      kcal: 300,
      protein: 30,
      carbs: 20,
      fat: 5,
      unknownMacros: [],
    };
    await render(
      wrap(
        'PROTEIN_ONLY',
        <EditEntrySheet
          visible
          onClose={jest.fn()}
          date="2026-10-04"
          entry={entry}
          onSaved={jest.fn()}
          onDeleted={jest.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('edit-entry-protein')).toHaveProp('value', '30');
    expect(screen.queryByTestId('edit-entry-kcal')).toBeNull();
    expect(screen.queryByTestId('edit-entry-carbs')).toBeNull();
    expect(screen.queryByTestId('edit-entry-fat')).toBeNull();
    expect(screen.getByTestId('edit-entry-save')).toBeEnabled();
    noKcal();
  });

  it('editing a logged recipe says what protein it was logged as', async () => {
    await render(
      wrap(
        'PROTEIN_ONLY',
        <EditRecipeEntrySheet
          visible
          onClose={jest.fn()}
          entry={{
            entryId: 'e2',
            recipeName: 'Chicken bowl',
            mealType: 'dinner',
            kcal: 640,
            protein: 44,
            portionMultiplier: 1,
          }}
          onSave={jest.fn()}
          onDelete={jest.fn()}
        />,
      ),
    );
    expect(screen.getByText('Logged as 44 g protein')).toBeOnTheScreen();
    noKcal();
  });
});

// keep userEvent import used if more presses are added
void userEvent;
