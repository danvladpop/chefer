import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { QuickAddSheet } from '../../src/features/tracker/quick-add-sheet';

// WP-06: the Log sheet aimed at a plan slot ("Ate something else" → Describe it).
// Everything it logs REPLACES that slot (`replacesSlot`, the slot's meal type),
// a recipe is logged as a custom entry with the recipe's numbers, the meal
// picker and the day's planned meals are gone, and the caller hears about the
// entry (to offer Undo) instead of the generic snackbar.

const mockLogRecipe = jest.fn();
const mockLogCustom = jest.fn();
const mockSnackbarShow = jest.fn();
let mockRecents: unknown[] = [];
let mockRecipes: unknown[] = [];
let mockIngredients: unknown[] = [];

jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return { ...actual, useSnackbar: () => ({ show: mockSnackbarShow }) };
});
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: jest.fn() },
        weeklySummary: { invalidate: jest.fn() },
        monthlySummary: { invalidate: jest.fn() },
        recents: { invalidate: jest.fn() },
      },
      dashboard: { summary: { invalidate: jest.fn() } },
    }),
    recipe: {
      list: {
        useQuery: () => ({
          data: mockRecipes,
          refetch: jest.fn(),
          isFetching: false,
          isError: false,
        }),
      },
    },
    ingredients: {
      search: {
        useQuery: () => ({
          data: mockIngredients,
          refetch: jest.fn(),
          isFetching: false,
          isError: false,
        }),
      },
    },
    tracker: {
      recents: { useQuery: () => ({ data: mockRecents }) },
      logRecipe: {
        useMutation: () => ({
          mutate: (vars: unknown) => {
            mockLogRecipe(vars);
          },
          isPending: false,
          isError: false,
          reset: jest.fn(),
        }),
      },
      logCustomMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            mockLogCustom(vars);
            opts.onSuccess?.({ log: {}, rebalance: null, entryId: 'e-7' }, vars);
          },
          isPending: false,
          isError: false,
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
const onSlotLogged = jest.fn();
const SLOT = { mealType: 'dinner', slotIndex: 2 };
const AT_SLOT = { replacesSlot: SLOT, mealType: 'dinner' };

async function renderSheet(props: Partial<React.ComponentProps<typeof QuickAddSheet>> = {}) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QuickAddSheet
        visible
        date="2026-09-26"
        onClose={onClose}
        onLogged={jest.fn()}
        targetSlot={SLOT}
        onSlotLogged={onSlotLogged}
        {...props}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecents = [];
  mockRecipes = [];
  mockIngredients = [];
});

describe('QuickAddSheet aimed at a slot (WP-06)', () => {
  it('is titled for the swap, names the meal, and has no meal picker or planned meals', async () => {
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
    expect(screen.getByTestId('log-sheet-title')).toHaveTextContent('Ate something else');
    expect(screen.getByText('Dinner')).toBeOnTheScreen();
    expect(screen.queryByTestId('log-sheet-meal')).toBeNull();
    // "This week's plan" is not an option when you did NOT eat the planned meal.
    expect(screen.queryByText('Lentil curry')).toBeNull();
  });

  it('manual entry: replaces the slot, takes the slot\'s meal, and says nothing about "off-plan" or "honestly"', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-manual'));
    expect(screen.getByText('Name and calories are enough.')).toBeOnTheScreen();
    expect(screen.queryByText(/off-plan|honest/i)).toBeNull();
    expect(screen.queryByTestId('quick-add-meal')).toBeNull();
    await user.type(screen.getByTestId('quick-add-name'), 'Lasagne');
    await user.type(screen.getByTestId('quick-add-kcal'), '640');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Lasagne', kcal: 640, ...AT_SLOT }),
    );
    // The caller offers the Undo (it knows the entry); no generic snackbar here.
    expect(onSlotLogged).toHaveBeenCalledWith({ name: 'Lasagne', entryId: 'e-7' });
    expect(mockSnackbarShow).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("a recipe from Recent replaces the slot as a custom entry with the recipe's numbers", async () => {
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
    await user.press(screen.getByTestId('log-sheet-recent-add-recipe:r1'));
    expect(mockLogRecipe).not.toHaveBeenCalled();
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Protein shake',
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
        ...AT_SLOT,
      }),
    );
  });

  it('one of Your recipes replaces the slot at the chosen portion', async () => {
    mockRecipes = [
      {
        id: 'r9',
        name: 'Chili',
        imageUrl: null,
        nutritionStatus: 'COMPUTED',
        nutritionInfo: { calories: 400, protein: 30, carbs: 40, fat: 10 },
      },
    ];
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'chili');
    await user.press(screen.getByText('Chili'));
    await user.press(screen.getByTestId('log-sheet-recipe-portion-recipe:r9-1.5'));
    await user.press(screen.getByTestId('log-sheet-recipe-log-recipe:r9'));
    expect(mockLogRecipe).not.toHaveBeenCalled();
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Chili',
        kcal: 600,
        protein: 45,
        carbs: 60,
        fat: 15,
        ...AT_SLOT,
      }),
    );
  });

  it('an ingredient by weight replaces the slot', async () => {
    mockIngredients = [
      {
        name: 'banana',
        displayName: 'Banana',
        imageUrl: null,
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 89, protein: 1, carbs: 23, fat: 0.3 },
      },
    ];
    const user = userEvent.setup();
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'banana');
    await user.press(screen.getByText('Banana'));
    await user.press(screen.getByTestId('log-sheet-grams-log-banana'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Banana, 100 g', kcal: 89, ...AT_SLOT }),
    );
  });

  it('without a target slot nothing changes: no replacesSlot, the generic snackbar', async () => {
    const user = userEvent.setup();
    await renderSheet({ targetSlot: undefined, onSlotLogged: undefined });
    expect(screen.getByTestId('log-sheet-title')).toHaveTextContent('Log something');
    expect(screen.getByTestId('log-sheet-meal')).toBeOnTheScreen();
    await user.press(screen.getByTestId('log-sheet-manual'));
    await user.type(screen.getByTestId('quick-add-name'), 'Cake');
    await user.type(screen.getByTestId('quick-add-kcal'), '300');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalledWith(
      expect.not.objectContaining({ replacesSlot: expect.anything() as unknown }),
    );
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Logged Cake' }),
    );
  });
});
