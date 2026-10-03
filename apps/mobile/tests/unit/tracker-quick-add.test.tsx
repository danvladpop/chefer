import { TextInput } from 'react-native';
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
const mockSearchState = { isFetching: false, isError: false };
const mockRefetch = jest.fn();
const mockLogRecipeState: { isError: boolean; error: { message: string } | null } = {
  isError: false,
  error: null,
};

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
    recipe: {
      list: { useQuery: () => ({ data: mockRecipes, refetch: mockRefetch, ...mockSearchState }) },
    },
    ingredients: {
      search: {
        useQuery: () => ({ data: mockIngredients, refetch: mockRefetch, ...mockSearchState }),
      },
    },
    tracker: {
      recents: { useQuery: () => ({ data: mockRecents }) },
      logRecipe: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            mockLogRecipe(vars);
            opts.onSuccess?.({ log: {}, rebalance }, vars);
          },
          ...mockLogRecipeState,
          isPending: false,
          reset: jest.fn(),
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
  mockSearchState.isFetching = false;
  mockSearchState.isError = false;
  mockLogRecipeState.isError = false;
  mockLogRecipeState.error = null;
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

  // UX-FOOD-09
  it('clamps absurd grams instead of previewing 88,999 kcal', async () => {
    mockIngredients = [
      {
        name: 'banana',
        displayName: 'Banana',
        imageUrl: null,
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
      },
    ];
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'banana');
    await user.press(screen.getByText('Banana'));
    await user.clear(screen.getByTestId('log-sheet-grams-input-banana'));
    await user.type(screen.getByTestId('log-sheet-grams-input-banana'), '99999');
    expect(screen.getByTestId('log-sheet-grams-input-banana')).toHaveDisplayValue('4347');
    expect(screen.getByTestId('log-sheet-grams-max-banana')).toBeOnTheScreen();
    expect(screen.getByTestId('log-sheet-grams-live-kcal-banana')).toHaveTextContent(/^3869 kcal/);
    await user.press(screen.getByTestId('log-sheet-grams-log-banana'));
    expect(mockLogCustom).toHaveBeenCalledWith(expect.objectContaining({ kcal: 3869 }));
  });

  it('shows "Searching…" while a first search loads', async () => {
    mockSearchState.isFetching = true;
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'zzz');
    expect(screen.getByTestId('log-sheet-searching')).toBeOnTheScreen();
  });

  it('offers "enter calories yourself" when nothing matches', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'zzz');
    // The debounce has to settle before "no matches" is claimed.
    expect(await screen.findByTestId('log-sheet-no-matches')).toBeOnTheScreen();
    expect(screen.getByText(/No matches/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('log-sheet-no-matches'));
    expect(screen.getByTestId('quick-add-name')).toHaveDisplayValue('zzz');
  });

  it('shows a Retry when the search fails instead of an empty list', async () => {
    mockSearchState.isError = true;
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'rice');
    expect(screen.getByTestId('log-sheet-search-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('log-sheet-no-matches')).toBeNull();
    await user.press(screen.getByTestId('log-sheet-search-retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows a failed log in the search view (not only in the manual form)', async () => {
    mockLogRecipeState.isError = true;
    mockLogRecipeState.error = { message: 'Recipe not found.' };
    await renderSheet();
    expect(screen.getByTestId('log-sheet-api-error')).toHaveTextContent(/Recipe not found/);
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

  // UX-FOOD-10: with the keyboard up an error can sit off-screen and Log looks
  // dead — a failed submit focuses (and so scrolls to) the first invalid field.
  it('focuses the first invalid field when Log is refused', async () => {
    const focused: (string | undefined)[] = [];
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    const proto = TextInput.prototype as unknown as { focus: () => void };
    jest.spyOn(proto, 'focus').mockImplementation(function (this: unknown) {
      focused.push((this as { props?: { testID?: string } }).props?.testID);
    });
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(focused).toEqual(['quick-add-name']);

    await user.type(screen.getByTestId('quick-add-name'), 'Pizza');
    focused.length = 0;
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(focused).toEqual(['quick-add-kcal']);
    jest.restoreAllMocks();
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
      // UX-FOOD-11: the blank protein is unknown, not a typed 0 g
      unknownMacros: ['protein'],
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
    await user.type(screen.getByTestId('quick-add-carbs'), '0');
    await user.type(screen.getByTestId('quick-add-fat'), '0');
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
    await user.type(screen.getByTestId('quick-add-carbs'), '0');
    await user.type(screen.getByTestId('quick-add-fat'), '0');
    await user.press(screen.getByTestId('quick-add-sanity-log-anyway'));
    expect(screen.queryByTestId('quick-add-sanity')).not.toBeOnTheScreen();
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({ kcal: 100, protein: 500 }),
    );
  });

  // UX-FOOD-11: calories + protein only used to count the blanks as 0 g and flag
  // "don't add up", greying out Log.
  it('UX-FOOD-11: partial macros skip the sanity check, keep Log enabled and flag the blanks', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Soup');
    await user.type(screen.getByTestId('quick-add-kcal'), '400');
    await user.type(screen.getByTestId('quick-add-protein'), '20');
    expect(screen.queryByTestId('quick-add-sanity')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quick-add-submit')).toBeEnabled();
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({
        protein: 20,
        carbs: 0,
        fat: 0,
        unknownMacros: ['carbs', 'fat'],
      }),
    );
  });

  it('UX-FOOD-25: every macro field has a visible label with its unit', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    expect(screen.getByText('Protein (g)')).toBeOnTheScreen();
    expect(screen.getByText('Carbs (g)')).toBeOnTheScreen();
    expect(screen.getByText('Fat (g)')).toBeOnTheScreen();
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
