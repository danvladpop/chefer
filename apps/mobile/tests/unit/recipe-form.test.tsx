import { Keyboard } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import RecipeFormScreen from '../../app/recipe-form';
import { focusedFields, resetFocusedFields } from './keyboard-test-utils';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

interface RecipePayload {
  recipeId?: string;
  name: string;
  description: string;
  cuisineType: string;
  ingredients: { name: string; quantity: number; unit: string; ingredientId?: string }[];
  instructions: string[];
  dietaryTags: string[];
  nutritionInfo?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    source?: string;
  };
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string;
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <RecipeFormScreen />
    </SafeAreaProvider>,
  );
}

// UX-40 slice 1 (T-40.4): the recipe form rebuilt as sections. AC1-4, 7, 9, 11.

// ─── Catalog fixtures (getMany detail shape; search rows derive from them) ──
const mockFlour = {
  id: 'flour-id',
  slug: 'wheat-flour',
  name: 'Wheat flour, white',
  category: 'FLOUR_BAKING',
  portions: [] as { unit: string; grams: number }[],
  densityGPerMl: 0.53,
  per100g: { calories: 364, protein: 10, carbs: 73, fat: 1, fiber: 3 },
};
const mockEgg = {
  id: 'egg-id',
  slug: 'egg-whole-raw',
  name: 'Egg, whole, raw',
  category: 'EGG',
  portions: [{ unit: 'piece', grams: 50 }],
  densityGPerMl: 1.03,
  per100g: { calories: 148, protein: 12.4, carbs: 1, fat: 10, fiber: 0 },
};
const mockSpiceMix = {
  id: 'spice-id',
  slug: 'four-spice-mix',
  name: 'Four-spice mix',
  category: 'SPICE_DRIED',
  portions: [] as { unit: string; grams: number }[],
  densityGPerMl: null,
  per100g: { calories: 300, protein: 10, carbs: 40, fat: 10, fiber: 20 },
};
const mockMine = {
  id: 'mine-id',
  slug: 'protein-bar',
  name: 'Protein bar',
  category: 'SNACK_PREPARED',
  portions: [{ unit: 'bar', grams: 45 }],
  densityGPerMl: null,
  per100g: { calories: 380, protein: 30, carbs: 35, fat: 12, fiber: 5 },
};
type MockRow = typeof mockFlour | typeof mockEgg | typeof mockSpiceMix | typeof mockMine;
const mockCatalog = [mockFlour, mockEgg, mockSpiceMix].map((r) => ({
  ...r,
  owner: 'global',
  hasDensity: r.densityGPerMl != null,
  nutritionSource: 'USDA_FDC',
  status: 'ACTIVE',
  edibleFraction: 1,
  sourceRef: 'fdc:1',
}));
function mockRef(r: MockRow) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    owner: r === mockMine ? 'mine' : 'global',
    portions: r.portions,
    hasDensity: r.densityGPerMl != null,
    nutritionSource: r === mockMine ? 'USER' : 'USDA_FDC',
  };
}
function mockSearchRow(r: MockRow) {
  return {
    ...mockRef(r),
    name: r.name.toLowerCase(),
    displayName: r.name,
    imageUrl: '',
    hasMacros: true,
    isCustom: r === mockMine,
    per100g: r.per100g,
  };
}

let mockParams: { id?: string; duplicateOf?: string } = {};
let mockExisting: unknown = null;
let mockExistingLoading = false;
let mockExistingError = false;
let mockSearchResults: unknown[] = [];
let mockResolveResults: unknown[] | undefined;
const mockResolveArgs: unknown[] = [];
let mockPremiumUser: { planTier: string; role: string } = { planTier: 'PREMIUM', role: 'USER' };
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockCreateCustomIngredient = jest.fn();
const mockInvalidate = { list: jest.fn(), getMyRecipe: jest.fn(), mealPlanGetRecipe: jest.fn() };
// UX-X-01: the form guards leaving through React Navigation's usePreventRemove
// (it also disables the iOS swipe). The mock records the latest (prevent,
// callback) pair, so a test can assert the swipe is blocked while dirty and
// then fire the blocked removal.
type PreventRemoveCallback = (options: { data: { action: unknown } }) => void;
const mockPreventRemove: { prevent: boolean; callback: PreventRemoveCallback | null } = {
  prevent: false,
  callback: null,
};
const mockDispatch = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

// R-10: the custom-ingredient sheet inside the form asks for AI consent before
// "Fill in for me"; the guard is a pass-through here.
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));

jest.mock('expo-router', () => ({
  router: {
    back: () => {
      mockBack();
    },
    replace: (...args: unknown[]) => {
      mockReplace(...args);
    },
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
  useIsFocused: () => true,
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, callback: PreventRemoveCallback) => {
    mockPreventRemove.prevent = prevent;
    mockPreventRemove.callback = callback;
  },
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      ingredients: { resolve: { fetch: () => Promise.resolve([]) } },
      recipe: {
        list: {
          invalidate: () => {
            mockInvalidate.list();
          },
        },
        getMyRecipe: {
          invalidate: () => {
            mockInvalidate.getMyRecipe();
          },
        },
      },
      mealPlan: {
        getRecipe: {
          invalidate: () => {
            mockInvalidate.mealPlanGetRecipe();
          },
        },
      },
    }),
    recipe: {
      getMyRecipe: {
        useQuery: () => ({
          data: mockExisting,
          isLoading: mockExistingLoading,
          isError: mockExistingError,
          isFetchedAfterMount: true,
          isFetching: false,
          refetch: jest.fn(),
        }),
      },
      create: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockCreate(input);
            opts.onSuccess?.({ id: 'new-recipe' });
          },
          isPending: false,
          isError: false,
        }),
      },
      update: {
        useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
          mutate: (input: unknown) => {
            mockUpdate(input);
            opts.onSuccess?.({ id: 'r1' });
          },
          isPending: false,
          isError: false,
        }),
      },
    },
    // plan-ingredient-catalog §10 (P9): the catalog picker, the private-
    // ingredient sheet, the live preview (getMany + the shared engine) and
    // legacy-line resolution all live behind this namespace.
    ingredients: {
      search: { useQuery: () => ({ data: mockSearchResults, isFetching: false }) },
      resolve: {
        useQuery: (args: unknown, opts: { enabled: boolean }) => {
          if (opts.enabled) mockResolveArgs.push(args);
          return { data: opts.enabled ? mockResolveResults : undefined, isError: false };
        },
      },
      getMany: {
        useQuery: (args: { ids: string[] }, opts: { enabled: boolean }) => ({
          data: opts.enabled ? mockCatalog.filter((r) => args.ids.includes(r.id)) : undefined,
          isFetching: false,
        }),
      },
      createCustom: {
        useMutation: (opts: { onSuccess?: (row: Record<string, unknown>) => void }) => ({
          mutate: (input: { name: string }) => {
            mockCreateCustomIngredient(input);
            opts.onSuccess?.({
              ...mockSearchRow(mockMine),
              name: input.name,
              displayName: input.name,
            });
          },
          isPending: false,
          isError: false,
        }),
      },
      estimateNutrition: {
        useMutation: () => ({
          mutate: jest.fn(),
          isPending: false,
          isError: false,
          data: undefined,
        }),
      },
    },
    auth: {
      me: { useQuery: () => ({ data: mockPremiumUser }) },
    },
  },
}));

// userEvent typing plus the picker's real 250 ms debounce wait: about 1 s
// locally, but the first test also absorbs module warm-up and ran past the
// default 5 s on the shared CI runner (the file took 96 s there).
jest.setTimeout(20_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveResults = undefined;
  mockResolveArgs.length = 0;
  resetSnackbarForTests();
  mockParams = {};
  mockExisting = null;
  mockExistingLoading = false;
  mockExistingError = false;
  mockSearchResults = mockCatalog.map(mockSearchRow);
  mockPremiumUser = { planTier: 'PREMIUM', role: 'USER' };
  onlineManager.setOnline(true);
});

/** Opens the catalog picker on line `index`, searches and picks the row with `slug`. */
async function pickIngredient(index: number, query: string, slug: string) {
  await fireEvent.press(screen.getByTestId(`rf-ingredient-name-${index}`));
  await fireEvent.changeText(
    screen.getByTestId(`rf-ingredient-name-${index}-search-sheet-input`),
    query,
  );
  // 250 ms search debounce.
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  await fireEvent.press(
    screen.getByTestId(`rf-ingredient-name-${index}-search-sheet-result-${slug}`),
  );
}

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('RecipeFormScreen — create (AC1, AC2)', () => {
  it('saves with only a name and one ingredient line — everything else optional', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.type(screen.getByTestId('rf-name-input'), "Grandma's lasagna");
    await pickIngredient(0, 'flour', 'wheat-flour');
    await user.type(screen.getByTestId('rf-ingredient-qty-0'), '200');

    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = (mockCreate.mock.calls[0] as [RecipePayload])[0];
    expect(payload.name).toBe("Grandma's lasagna");
    expect(payload.ingredients).toEqual([
      { name: 'Wheat flour, white', quantity: 200, unit: 'g', ingredientId: 'flour-id' },
    ]);
    expect(payload.description).toBe('');
    expect(payload.instructions).toEqual([]);
    // The live engine's numbers, marked computed (the server recomputes anyway).
    expect(payload.nutritionInfo).toEqual({
      calories: 728,
      protein: 20,
      carbs: 146,
      fat: 2,
      fiber: 6,
      source: 'computed',
    });
  });

  it('shows "* Required" once and the Name field reads "Name, required" to a screen reader', async () => {
    await renderScreen();
    expect(screen.getByText('* Required')).toBeOnTheScreen();
    expect(screen.getByLabelText('Name, required')).toBeOnTheScreen();
  });
});

describe('RecipeFormScreen — PAT-17 blocked tap (AC3, AC4)', () => {
  it('with no name, the footer names it and a blocked tap never submits', async () => {
    await renderScreen();
    await pickIngredient(0, 'flour', 'wheat-flour');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '200');

    expect(screen.getByTestId('rf-missing')).toHaveTextContent('Add a name to save.');
    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('rf-name-error-text')).toHaveTextContent('Add a name.');
  });

  it('a named line with no amount blocks saving with "Finish the ingredient on line {n}."', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Bread');
    await pickIngredient(0, 'flour', 'wheat-flour');
    // No amount typed — this line has a name but quantity is empty (0).

    expect(screen.getByTestId('rf-missing')).toHaveTextContent('Finish the ingredient on line 1.');
    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('rf-ingredient-error-0')).toHaveTextContent(
      'Add an amount, or remove this line.',
    );
  });

  it('a fully blank second line does not block saving', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Bread');
    await pickIngredient(0, 'flour', 'wheat-flour');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '200');
    await fireEvent.press(screen.getByTestId('rf-add-ingredient'));

    await fireEvent.press(screen.getByTestId('rf-save'));
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('RecipeFormScreen — fraction chips (AC6)', () => {
  it('a fraction chip sets the quantity while the field is focused', async () => {
    await renderScreen();
    await fireEvent(screen.getByTestId('rf-ingredient-qty-0'), 'focus');
    await fireEvent.press(screen.getByTestId('rf-fraction-0-½'));
    expect(screen.getByTestId('rf-ingredient-qty-0').props.value).toBe('0.5');
  });
});

describe('RecipeFormScreen — no fiber input (AC7)', () => {
  it('never renders a fiber field', async () => {
    await renderScreen();
    expect(screen.queryByText(/fiber/i)).toBeNull();
  });
});

describe('RecipeFormScreen — offline (PAT-17 exception)', () => {
  it('the footer reads "Needs a connection" and is disabled', async () => {
    onlineManager.setOnline(false);
    await renderScreen();
    expect(screen.getByTestId('rf-save')).toHaveTextContent('Needs a connection');
    expect(screen.getByTestId('rf-save')).toBeDisabled();
  });
});

describe('RecipeFormScreen — edit round trip (AC9, T-BUG-O3 C1/C2/C6)', () => {
  const existingRecipe = {
    id: 'r1',
    name: 'Bread',
    description: 'Crusty white bread',
    cuisineType: 'French',
    prepTimeMins: 15,
    cookTimeMins: 30,
    servings: 4,
    nutritionInfo: { calories: 200, protein: 8, carbs: 30, fat: 4, fiber: 3 },
    nutritionStatus: 'COMPUTED',
    ingredients: [{ name: 'flour', quantity: 500, unit: 'g' }],
    lines: [
      {
        position: 0,
        ingredientId: 'flour-id',
        rawName: 'flour',
        quantity: 500,
        unit: 'g',
        grams: 500,
        note: null,
        optional: false,
      },
    ],
    instructions: ['Mix', 'Bake'],
    dietaryTags: ['vegetarian'],
    imageUrl: 'https://example.com/bread.jpg',
  };

  beforeEach(() => {
    mockParams = { id: 'r1' };
    mockExisting = existingRecipe;
  });

  it('saving without changes leaves every field — and the stored catalog link — unchanged', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const payload = (mockUpdate.mock.calls[0] as [RecipePayload])[0];
    expect(payload.recipeId).toBe('r1');
    expect(payload.name).toBe('Bread');
    expect(payload.dietaryTags).toEqual(['vegetarian']);
    // Stored lines come back linked: no resolve call, the id is sent back.
    expect(mockResolveArgs).toEqual([]);
    expect(payload.ingredients).toEqual([
      { name: 'flour', quantity: 500, unit: 'g', ingredientId: 'flour-id' },
    ]);
    expect(screen.getByTestId('rf-nutrition-computed-coverage')).toHaveTextContent(
      'Computed from 1 ingredient',
    );
  });

  it('invalidates getMyRecipe and mealPlan.getRecipe on save, not just recipe.list (C1)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('rf-save'));
    expect(mockInvalidate.list).toHaveBeenCalled();
    expect(mockInvalidate.getMyRecipe).toHaveBeenCalled();
    expect(mockInvalidate.mealPlanGetRecipe).toHaveBeenCalled();
  });

  it('the title reads "Edit recipe" (sentence case)', async () => {
    await renderScreen();
    expect(screen.getByTestId('recipe-form-title')).toHaveTextContent('Edit recipe');
  });
});

describe('RecipeFormScreen — load error (C5)', () => {
  it('shows an explicit error state instead of a blank form', async () => {
    mockParams = { id: 'r1' };
    mockExistingError = true;
    await renderScreen();
    expect(screen.getByText("Couldn't load your recipe")).toBeOnTheScreen();
    expect(screen.queryByTestId('rf-name-input')).toBeNull();
  });
});

describe('RecipeFormScreen — discard changes (AC9)', () => {
  it('a dirty form intercepts back navigation and shows the discard confirm', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Something typed');

    // The guard is armed (this is what disables the iOS swipe-back).
    expect(mockPreventRemove.prevent).toBe(true);
    await act(() => {
      mockPreventRemove.callback?.({ data: { action: { type: 'GO_BACK' } } });
    });

    await waitFor(() => expect(screen.getByText('Discard your changes?')).toBeOnTheScreen());
    expect(mockDispatch).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Discard'));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' }));
  });

  it('"Keep editing" leaves the screen and its edits where they are (UX-X-01)', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Something typed');
    await act(() => {
      mockPreventRemove.callback?.({ data: { action: { type: 'GO_BACK' } } });
    });
    await waitFor(() => expect(screen.getByText('Discard your changes?')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Keep editing'));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('rf-name-input')).toHaveProp('value', 'Something typed');
    expect(mockPreventRemove.prevent).toBe(true);
  });

  it('a pristine form never arms the guard (nothing to lose, swipe stays enabled)', async () => {
    await renderScreen();
    expect(mockPreventRemove.prevent).toBe(false);
  });
});

// plan-ingredient-catalog §10 (P9): every line is picked from the catalog,
// the unit list narrows to what the row can weigh, nutrition is computed
// live, and a legacy recipe's lines are resolved with "Pick a match".
describe('RecipeFormScreen — catalog lines and computed nutrition (P9)', () => {
  it('picking a catalog row links the line ("nutrition known") and starts it on its natural unit', async () => {
    await renderScreen();
    await pickIngredient(0, 'egg', 'egg-whole-raw');

    expect(
      screen.getByLabelText('Name for ingredient 1, Egg, whole, raw, nutrition known'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('rf-ingredient-unit-0')).toHaveProp(
      'accessibilityLabel',
      'Unit, piece',
    );
  });

  it('the unit list only offers what the row can weigh: no volume without a density', async () => {
    await renderScreen();
    await pickIngredient(0, 'spice', 'four-spice-mix');
    await fireEvent.press(screen.getByTestId('rf-ingredient-unit-0'));

    expect(screen.getByTestId('rf-ingredient-unit-0-sheet-option-g')).toBeOnTheScreen();
    expect(screen.getByTestId('rf-ingredient-unit-0-sheet-option-pinch')).toBeOnTheScreen();
    expect(screen.queryByTestId('rf-ingredient-unit-0-sheet-option-tbsp')).toBeNull();
    expect(screen.queryByTestId('rf-ingredient-unit-0-sheet-option-piece')).toBeNull();
  });

  it('there is no free-text "Use as typed" and no manual nutrition fields any more', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('rf-ingredient-name-0'));
    expect(screen.queryByTestId('rf-ingredient-name-0-search-sheet-use-as-typed')).toBeNull();
    expect(screen.queryByTestId('rf-kcal')).toBeNull();
    expect(screen.queryByTestId('rf-nutrition-computed-edit')).toBeNull();
  });

  it('the live card computes with the shared engine and says what it is computed from', async () => {
    await renderScreen();
    await pickIngredient(0, 'egg', 'egg-whole-raw');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '2');

    expect(screen.getByTestId('rf-nutrition-computed-coverage')).toHaveTextContent(
      'Computed from 1 ingredient',
    );
    expect(screen.getByTestId('rf-nutrition-computed-status')).toHaveTextContent('Calculated');
  });

  it('a stored line whose unit its row cannot weigh asks for a unit before saving', async () => {
    mockParams = { id: 'r3' };
    mockExisting = {
      id: 'r3',
      name: 'Spiced rice',
      description: '',
      cuisineType: 'International',
      prepTimeMins: 0,
      cookTimeMins: 0,
      servings: 1,
      nutritionInfo: { calories: 10, protein: 0, carbs: 1, fat: 0, fiber: 0 },
      nutritionStatus: 'PARTIAL',
      ingredients: [{ name: 'spice mix', quantity: 1, unit: 'tsp' }],
      lines: [
        {
          position: 0,
          ingredientId: 'spice-id',
          rawName: 'spice mix',
          quantity: 1,
          unit: 'tsp',
          grams: null,
          note: null,
          optional: false,
        },
      ],
      instructions: [],
      dietaryTags: [],
      imageUrl: null,
    };
    await renderScreen();
    expect(screen.getByTestId('rf-ingredient-unit-error-0')).toHaveTextContent(
      '"tsp" has no weight for Four-spice mix. Pick another unit.',
    );
    expect(screen.getByTestId('rf-missing')).toHaveTextContent(
      'Pick a unit for the ingredient on line 1.',
    );
    expect(screen.getByTestId('rf-nutrition-computed-coverage')).toHaveTextContent(
      'Incomplete — 1 ingredient needs data',
    );
    await fireEvent.press(screen.getByTestId('rf-save'));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  describe('editing a recipe from before the catalog', () => {
    const legacy = {
      id: 'r2',
      name: 'Old soup',
      description: '',
      cuisineType: 'International',
      prepTimeMins: 0,
      cookTimeMins: 0,
      servings: 2,
      nutritionInfo: { calories: 300, protein: 10, carbs: 40, fat: 5, fiber: 0 },
      nutritionStatus: 'USER_ENTERED',
      ingredients: [
        { name: 'eggs', quantity: 2, unit: 'pieces' },
        { name: 'mystery spice blend', quantity: 1, unit: 'tsp' },
      ],
      lines: [],
      instructions: [],
      dietaryTags: [],
      imageUrl: null,
    };

    beforeEach(() => {
      mockParams = { id: 'r2' };
      mockExisting = legacy;
      mockResolveResults = [
        {
          rawName: 'eggs',
          unit: 'piece',
          note: null,
          confidence: 'ALIAS',
          match: mockRef(mockEgg),
          candidates: [],
        },
        {
          rawName: 'mystery spice blend',
          unit: 'tsp',
          note: null,
          confidence: 'CANDIDATES',
          match: null,
          candidates: [mockRef(mockSpiceMix)],
        },
      ];
    });

    it('resolves the lines: ALIAS links, CANDIDATES shows "Pick a match" and blocks saving', async () => {
      await renderScreen();
      expect(mockResolveArgs[0]).toEqual({
        lines: [
          { rawName: 'eggs', unit: 'pieces' },
          { rawName: 'mystery spice blend', unit: 'tsp' },
        ],
      });
      expect(
        screen.getByLabelText('Name for ingredient 1, eggs, nutrition known'),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('rf-ingredient-match-1')).toHaveTextContent(
        /"mystery spice blend" isn't linked to an ingredient yet\./,
      );
      expect(screen.getByTestId('rf-missing')).toHaveTextContent(
        'Pick a match for the ingredient on line 2.',
      );
      expect(screen.getByTestId('rf-nutrition-computed-was-user-entered')).toBeOnTheScreen();

      await fireEvent.press(screen.getByTestId('rf-save'));
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(screen.getByTestId('rf-ingredient-error-1')).toHaveTextContent(
        'Pick this ingredient from the list, or remove the line.',
      );
    });

    it('linking lines on open is not an edit: leaving untouched never asks to discard', async () => {
      await renderScreen();
      expect(mockPreventRemove.prevent).toBe(false);
    });

    it('a suggestion chip links the line, and the save sends every catalog id', async () => {
      await renderScreen();
      await fireEvent.press(screen.getByTestId('rf-ingredient-candidate-1-four-spice-mix'));
      // tsp can't be weighed for a row with no density: the pick falls back to g
      // (the amount is never converted) and the cook can choose another unit.
      expect(screen.getByTestId('rf-ingredient-unit-1')).toHaveProp(
        'accessibilityLabel',
        'Unit, g',
      );
      await fireEvent.press(screen.getByTestId('rf-ingredient-unit-1'));
      await fireEvent.press(screen.getByTestId('rf-ingredient-unit-1-sheet-option-pinch'));

      await fireEvent.press(screen.getByTestId('rf-save'));
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      const payload = (mockUpdate.mock.calls[0] as [RecipePayload])[0];
      expect(payload.ingredients).toEqual([
        { name: 'eggs', quantity: 2, unit: 'piece', ingredientId: 'egg-id' },
        { name: 'Four-spice mix', quantity: 1, unit: 'pinch', ingredientId: 'spice-id' },
      ]);
    });
  });
});

describe('RecipeFormScreen — quantity input (UX-REC-11)', () => {
  it('drops letters from the amount box instead of keeping "60rolled oats"', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '60rolled oats');
    expect(String(screen.getByTestId('rf-ingredient-qty-0').props.value).trim()).toBe('60');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '1/2');
    expect(screen.getByTestId('rf-ingredient-qty-0').props.value).toBe('1/2');
  });

  it('opens the decimal pad', async () => {
    await renderScreen();
    expect(screen.getByTestId('rf-ingredient-qty-0').props.keyboardType).toBe('decimal-pad');
  });
});

describe('RecipeFormScreen — duplicate (UX-REC-04)', () => {
  const original = {
    id: 'r1',
    name: 'Bread',
    description: 'Crusty white bread',
    cuisineType: 'French',
    prepTimeMins: 15,
    cookTimeMins: 30,
    servings: 4,
    nutritionInfo: { calories: 200, protein: 8, carbs: 30, fat: 4, fiber: 3 },
    nutritionStatus: 'COMPUTED',
    ingredients: [{ name: 'flour', quantity: 500, unit: 'g' }],
    lines: [
      {
        position: 0,
        ingredientId: 'flour-id',
        rawName: 'flour',
        quantity: 500,
        unit: 'g',
        grams: 500,
        note: null,
        optional: false,
      },
    ],
    instructions: ['Mix', 'Bake'],
    dietaryTags: ['vegetarian'],
    imageUrl: null,
  };

  beforeEach(() => {
    mockParams = { duplicateOf: 'r1' };
    mockExisting = original;
  });

  it('opens prefilled as "Copy of …" under the duplicate title', async () => {
    await renderScreen();
    expect(screen.getByTestId('recipe-form-title')).toHaveTextContent('Duplicate recipe');
    expect(screen.getByTestId('rf-name-input').props.value).toBe('Copy of Bread');
    expect(screen.getByTestId('rf-ingredient-qty-0').props.value).toBe('500');
  });

  it('saves as a NEW recipe (create, not update) and lands on it', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('rf-save'));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = (mockCreate.mock.calls[0] as [RecipePayload])[0];
    expect(payload.name).toBe('Copy of Bread');
    expect(payload.recipeId).toBeUndefined();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'new-recipe' },
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('an untouched duplicate never asks to discard', async () => {
    await renderScreen();
    expect(mockPreventRemove.prevent).toBe(false);
  });
});

// Tester feedback 2026-10-04: the form's keyboard behaviour.
describe('RecipeFormScreen — keyboard (tester feedback 2026-10-04)', () => {
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    resetFocusedFields();
  });
  afterEach(() => dismiss.mockRestore());

  it('the name field reads Done and closes the keyboard on Return', async () => {
    await renderScreen();
    const name = screen.getByTestId('rf-name-input');
    expect(name.props.returnKeyType).toBe('done');
    await fireEvent(name, 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('the description is multiline (Return = newline) and the scroll closes the keyboard on drag', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('rf-more-details-toggle'));
    const description = screen.getByTestId('rf-description');
    expect(description.props.multiline).toBe(true);
    // iOS: its own Done accessory.
    expect(description.props.inputAccessoryViewID).toBeTruthy();
    expect(screen.getByTestId('rf-scroll').props.keyboardDismissMode).toBeDefined();
    expect(screen.getByTestId('rf-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('prep time hands focus to cook time; cook time is the last field and closes the keyboard', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.press(screen.getByTestId('rf-more-details-toggle'));
    expect(screen.getByTestId('rf-prep').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('rf-prep').props.returnKeyType).toBe('next');
    expect(screen.getByTestId('rf-cook').props.returnKeyType).toBe('done');
    // number pads have no Return key on iOS — each field owns a Next / Done bar.
    expect(screen.getByTestId('rf-prep').props.inputAccessoryViewID).toBeTruthy();
    expect(screen.getByTestId('rf-cook').props.inputAccessoryViewID).toBeTruthy();

    resetFocusedFields();
    await fireEvent(screen.getByTestId('rf-prep'), 'submitEditing');
    expect(focusedFields()).toEqual(['rf-cook']);
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('rf-cook'), 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('saving closes the keyboard', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.type(screen.getByTestId('rf-name-input'), 'Bread');
    await pickIngredient(0, 'flour', 'wheat-flour');
    await user.type(screen.getByTestId('rf-ingredient-qty-0'), '200');
    dismiss.mockClear();
    await fireEvent.press(screen.getByTestId('rf-save'));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalled();
  });
});
