import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { QuickAddSheet } from '../../src/features/tracker/quick-add-sheet';

// T-19.1 (UX-19): the search-first Log sheet — Recent, This week's plan,
// Your recipes, Ingredients (per 100 g), and "Enter calories yourself" as the
// calories-only fallback (the old sheet). T-19.5/B-39: the macro sanity line.

const mockLogRecipe = jest.fn();
const mockLogCustom = jest.fn();
const mockInvalidate = jest.fn();
const mockRecordRebalance = jest.fn();
const mockSnackbarShow = jest.fn();
let mockRecents: unknown[] = [];
let mockRecipes: unknown[] = [];
let mockIngredients: unknown[] = [];

const mockLogCustomState: {
  isPending: boolean;
  isError: boolean;
  error: { message: string } | null;
} = { isPending: false, isError: false, error: null };

jest.mock('../../src/features/tracker/rebalance-store', () => ({
  recordRebalance: (result: unknown) => {
    mockRecordRebalance(result);
  },
}));

jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return { ...actual, useSnackbar: () => ({ show: mockSnackbarShow }) };
});

const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: mockInvalidate },
        weeklySummary: { invalidate: mockInvalidate },
        monthlySummary: { invalidate: mockInvalidate },
        recents: { invalidate: mockInvalidate },
      },
      dashboard: { summary: { invalidate: jest.fn() } },
    }),
    recipe: { list: { useQuery: () => ({ data: mockRecipes }) } },
    ingredients: { search: { useQuery: () => ({ data: mockIngredients }) } },
    tracker: {
      recents: { useQuery: () => ({ data: mockRecents }) },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            mockLogRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
          isPending: false,
        }),
      },
      logCustomMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          ...mockLogCustomState,
          mutate: (vars: unknown) => {
            mockLogCustom(vars);
            if (!mockLogCustomState.isError) {
              opts.onSuccess?.({ log: {}, rebalance }, vars);
            }
          },
          reset: jest.fn(),
        }),
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const onClose = jest.fn();
const onLogged = jest.fn();

async function renderSheet(props: Partial<React.ComponentProps<typeof QuickAddSheet>> = {}) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QuickAddSheet visible date="2026-09-26" onClose={onClose} onLogged={onLogged} {...props} />
    </SafeAreaProvider>,
  );
}

async function goToManual(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByTestId('log-sheet-manual'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLogCustomState.isPending = false;
  mockLogCustomState.isError = false;
  mockLogCustomState.error = null;
  mockRecents = [];
  mockRecipes = [];
  mockIngredients = [];
});

describe('QuickAddSheet — search-first (T-19.1)', () => {
  it('opens with the search field focused and no manual fields visible', async () => {
    await renderSheet();
    expect(screen.getByTestId('log-sheet-search')).toBeOnTheScreen();
    expect(screen.queryByTestId('quick-add-name')).not.toBeOnTheScreen();
  });

  it('AC1: logging from Recent takes one tap once the sheet is open', async () => {
    mockRecents = [
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
    const user = userEvent.setup();
    await renderSheet();
    expect(screen.getByText('Protein shake')).toBeOnTheScreen();
    await user.press(screen.getByTestId('log-sheet-recent-add-recipe:r1'));
    expect(mockLogRecipe).toHaveBeenCalledWith({
      date: '2026-09-26',
      recipeId: 'r1',
      mealType: 'snack',
      portionMultiplier: 1,
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Logged snack' }),
    );
  });

  it('logs a custom Recent entry through logCustomMeal, not logRecipe', async () => {
    mockRecents = [
      {
        key: 'custom:toast',
        name: 'Toast',
        imageUrl: null,
        mealType: 'breakfast',
        kcal: 220,
        protein: 8,
        carbs: 30,
        fat: 6,
        estimatedBy: 'manual',
        count: 2,
        lastLoggedAt: '2026-09-24',
      },
    ];
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-recent-add-custom:toast'));
    expect(mockLogCustom).toHaveBeenCalledWith({
      date: '2026-09-26',
      name: 'Toast',
      estimatedBy: 'manual',
      mealType: 'breakfast',
      kcal: 220,
      protein: 8,
      carbs: 30,
      fat: 6,
    });
    expect(mockLogRecipe).not.toHaveBeenCalled();
  });

  it("This week's plan: expanding a row and logging sends its slotIndex", async () => {
    const user = userEvent.setup();
    await renderSheet({
      plannedMeals: [
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
      ],
    });
    expect(screen.getByText('Lentil curry')).toBeOnTheScreen();
    await user.press(screen.getByText('Lentil curry'));
    await user.press(screen.getByTestId('log-sheet-plan-log-plan:2'));
    expect(mockLogRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r2', mealType: 'dinner', slotIndex: 2 }),
    );
  });

  it('Ingredients: grams row shows a live kcal and logs the scaled macros', async () => {
    mockIngredients = [
      {
        name: 'chicken-breast-raw',
        displayName: 'Chicken breast, raw',
        imageUrl: 'https://example.com/chicken.png',
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 120, protein: 22, carbs: 0, fat: 3 },
      },
    ];
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'chicken');
    await user.press(screen.getByText('Chicken breast, raw'));
    await user.press(screen.getByTestId('log-sheet-grams-chicken-breast-raw-150'));
    expect(screen.getByTestId('log-sheet-grams-live-kcal-chicken-breast-raw')).toHaveTextContent(
      '180 kcal · 33g P',
    );
    await user.press(screen.getByTestId('log-sheet-grams-log-chicken-breast-raw'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Chicken breast, raw, 150 g',
        kcal: 180,
        protein: 33,
        carbs: 0,
        fat: 4.5,
      }),
    );
  });

  it('B-29/AC6: never shows a barcode or branded-product affordance', async () => {
    await renderSheet();
    expect(screen.queryByText(/barcode/i)).not.toBeOnTheScreen();
  });
});

describe('QuickAddSheet — Enter calories yourself (fallback, T-19.1)', () => {
  it('explains a missing name and calories instead of sending', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).not.toHaveBeenCalled();
    expect(screen.getByTestId('quick-add-name-error')).toHaveTextContent('Name what you ate.');
    expect(screen.getByTestId('quick-add-kcal-error')).toHaveTextContent('Enter the calories.');
  });

  it('refuses out-of-range numbers inline', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Pizza');
    await user.type(screen.getByTestId('quick-add-kcal'), '6000');
    await user.type(screen.getByTestId('quick-add-protein'), '900');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).not.toHaveBeenCalled();
    expect(screen.getByTestId('quick-add-kcal-error')).toHaveTextContent('Max 5000 kcal.');
    expect(screen.getByTestId('quick-add-protein-error')).toHaveTextContent('Max 500 g.');
  });

  it('logs name, chosen meal, kcal and macros that pass the sanity check', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), ' Birthday cake ');
    await user.press(screen.getByTestId('quick-add-meal-dinner'));
    await user.type(screen.getByTestId('quick-add-kcal'), '420');
    await user.type(screen.getByTestId('quick-add-carbs'), '50');
    await user.type(screen.getByTestId('quick-add-fat'), '18,5');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalledWith({
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
  it('bug B-39: 100 kcal logged with 500 g protein shows the sanity line and blocks the submit', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Mystery shake');
    await user.type(screen.getByTestId('quick-add-kcal'), '100');
    await user.type(screen.getByTestId('quick-add-protein'), '500');
    expect(
      screen.getByText("These don't add up: 100 kcal logged, but the macros add up to 2,000 kcal."),
    ).toBeOnTheScreen();
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).not.toHaveBeenCalled();
  });

  it('bug B-39: Log anyway still logs it (advisory, never a hard block)', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Mystery shake');
    await user.type(screen.getByTestId('quick-add-kcal'), '100');
    await user.type(screen.getByTestId('quick-add-protein'), '500');
    await user.press(screen.getByTestId('quick-add-sanity-log-anyway'));
    expect(screen.queryByTestId('quick-add-sanity')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({ kcal: 100, protein: 500 }),
    );
  });

  it('a real meal (macros roughly matching kcal) never shows the sanity line', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Chicken and rice');
    await user.type(screen.getByTestId('quick-add-kcal'), '500');
    await user.type(screen.getByTestId('quick-add-protein'), '40');
    await user.type(screen.getByTestId('quick-add-carbs'), '50');
    await user.type(screen.getByTestId('quick-add-fat'), '10');
    expect(screen.queryByTestId('quick-add-sanity')).not.toBeOnTheScreen();
  });

  it('on success hands the rebalance to the store, refreshes the day and closes', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Birthday cake');
    await user.type(screen.getByTestId('quick-add-kcal'), '420');
    await act(async () => {
      await user.press(screen.getByTestId('quick-add-submit'));
    });
    expect(mockRecordRebalance).toHaveBeenCalledWith(rebalance);
    expect(onLogged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the API error', async () => {
    mockLogCustomState.isError = true;
    mockLogCustomState.error = { message: "You can't log a future day" };
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    expect(screen.getByTestId('quick-add-api-error')).toHaveTextContent(
      "You can't log a future day",
    );
  });
});
