import { SafeAreaProvider } from 'react-native-safe-area-context';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import RecipeFormScreen from '../../app/recipe-form';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

interface RecipePayload {
  recipeId?: string;
  name: string;
  description: string;
  cuisineType: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: string[];
  dietaryTags: string[];
  nutritionInfo: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
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

let mockParams: { id?: string } = {};
let mockExisting: unknown = null;
let mockExistingLoading = false;
let mockExistingError = false;
let mockSearchResults: unknown[] = [];
let mockComputedNutrition: unknown;
let mockPremiumUser: { planTier: string; role: string } = { planTier: 'PREMIUM', role: 'USER' };
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockCreateCustomIngredient = jest.fn();
const mockInvalidate = { list: jest.fn(), getMyRecipe: jest.fn(), mealPlanGetRecipe: jest.fn() };
const mockAddListener = jest.fn((_event: string, _cb: (e: unknown) => void) => () => undefined);
const mockDispatch = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: () => {
      mockBack();
    },
  },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: mockAddListener, dispatch: mockDispatch }),
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
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
    // T-40.7–T-40.9 (UX-40 slice 2): the ingredient picker sheet, the custom
    // ingredient sheet and the computed-nutrition card all live behind this
    // namespace now — the search/compute results are empty/undefined by
    // default so the form behaves exactly like slice 1 (free text, manual
    // numbers) unless a test seeds them.
    ingredients: {
      search: { useQuery: () => ({ data: mockSearchResults, isFetching: false }) },
      computeNutrition: { useQuery: () => ({ data: mockComputedNutrition, isFetching: false }) },
      createCustom: {
        useMutation: (opts: { onSuccess?: (data: { displayName: string }) => void }) => ({
          mutate: (input: { name: string }) => {
            mockCreateCustomIngredient(input);
            opts.onSuccess?.({ displayName: input.name });
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

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  mockParams = {};
  mockExisting = null;
  mockExistingLoading = false;
  mockExistingError = false;
  mockSearchResults = [];
  mockComputedNutrition = undefined;
  mockPremiumUser = { planTier: 'PREMIUM', role: 'USER' };
  onlineManager.setOnline(true);
});

/** Opens the ingredient picker sheet and commits `text` via "Use as typed" — T-40.7. */
async function typeIngredientAsFreeText(index: number, text: string) {
  await fireEvent.press(screen.getByTestId(`rf-ingredient-name-${index}`));
  await fireEvent.changeText(
    screen.getByTestId(`rf-ingredient-name-${index}-search-sheet-input`),
    text,
  );
  await fireEvent.press(
    screen.getByTestId(`rf-ingredient-name-${index}-search-sheet-use-as-typed`),
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
    await typeIngredientAsFreeText(0, 'flour');
    await user.type(screen.getByTestId('rf-ingredient-qty-0'), '200');

    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = (mockCreate.mock.calls[0] as [RecipePayload])[0];
    expect(payload.name).toBe("Grandma's lasagna");
    expect(payload.ingredients).toEqual([{ name: 'flour', quantity: 200, unit: 'g' }]);
    expect(payload.description).toBe('');
    expect(payload.instructions).toEqual([]);
    expect(payload.nutritionInfo).not.toHaveProperty('fiber', undefined);
    expect(payload.nutritionInfo.fiber).toBe(0); // D-18: sent, never shown
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
    await typeIngredientAsFreeText(0, 'flour');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '200');

    expect(screen.getByTestId('rf-missing')).toHaveTextContent('Add a name to save.');
    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('rf-name-error-text')).toHaveTextContent('Add a name.');
  });

  it('a named line with no amount blocks saving with "Finish the ingredient on line {n}."', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Bread');
    await typeIngredientAsFreeText(0, 'flour');
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
    await typeIngredientAsFreeText(0, 'flour');
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
    ingredients: [{ name: 'flour', quantity: 500, unit: 'g' }],
    instructions: ['Mix', 'Bake'],
    dietaryTags: ['vegetarian'],
    imageUrl: 'https://example.com/bread.jpg',
  };

  beforeEach(() => {
    mockParams = { id: 'r1' };
    mockExisting = existingRecipe;
  });

  it('saving without changes leaves every field — including fiber and tags — unchanged', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('rf-save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const payload = (mockUpdate.mock.calls[0] as [RecipePayload])[0];
    expect(payload.recipeId).toBe('r1');
    expect(payload.name).toBe('Bread');
    expect(payload.dietaryTags).toEqual(['vegetarian']);
    // C6: fiber isn't shown anywhere but round-trips on edit.
    expect(payload.nutritionInfo.fiber).toBe(3);
    expect(payload.ingredients).toEqual([{ name: 'flour', quantity: 500, unit: 'g' }]);
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

    expect(mockAddListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));
    const listener = mockAddListener.mock.calls.at(-1)?.[1] as (e: unknown) => void;
    const fakeEvent = {
      preventDefault: jest.fn(),
      data: { action: { type: 'GO_BACK' } },
    };
    await act(() => {
      listener(fakeEvent);
    });

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Discard your changes?')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Discard'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });
});

// UX-40 slice 2 (T-40.7/T-40.9, AC12): picking a catalogue ingredient links
// the line, and the nutrition section defaults to the computed card with an
// Edit numbers ↔ Use calculated numbers round trip.
describe('RecipeFormScreen — ingredient search & computed nutrition (AC12)', () => {
  it('picking a catalogue result links the line ("nutrition known")', async () => {
    mockSearchResults = [
      {
        name: 'rolled oats',
        displayName: 'Rolled Oats',
        imageUrl: 'https://img.example/oats.png',
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 379, protein: 13, carbs: 67, fat: 7 },
      },
    ];
    await renderScreen();
    await fireEvent.press(screen.getByTestId('rf-ingredient-name-0'));
    await fireEvent.changeText(
      screen.getByTestId('rf-ingredient-name-0-search-sheet-input'),
      'oat',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await fireEvent.press(
      screen.getByTestId('rf-ingredient-name-0-search-sheet-result-rolled oats'),
    );

    expect(
      screen.getByLabelText('Name for ingredient 1, Rolled Oats, nutrition known'),
    ).toBeOnTheScreen();
  });

  it('"Use as typed" free text is never marked as linked nutrition', async () => {
    await renderScreen();
    await typeIngredientAsFreeText(0, 'a very unusual thing');
    expect(screen.queryByLabelText(/nutrition known/)).toBeNull();
  });

  it('defaults to the computed nutrition card and sends its numbers on save', async () => {
    mockComputedNutrition = {
      perServing: { calories: 300, protein: 10, carbs: 40, fat: 5, fiber: 2 },
      unmatched: [],
      matchedCount: 1,
      totalCount: 1,
    };
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Bread');
    await typeIngredientAsFreeText(0, 'flour');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '200');

    expect(screen.getByTestId('rf-nutrition-computed')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('rf-save'));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = (mockCreate.mock.calls[0] as [RecipePayload])[0];
    expect(payload.nutritionInfo).toMatchObject({
      calories: 300,
      protein: 10,
      carbs: 40,
      fat: 5,
      fiber: 2,
      source: 'computed',
    });
  });

  it('Edit numbers switches to manual, prefilled with the computed values', async () => {
    mockComputedNutrition = {
      perServing: { calories: 300, protein: 10, carbs: 40, fat: 5, fiber: 2 },
      unmatched: ['cinnamon'],
      matchedCount: 1,
      totalCount: 2,
    };
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('rf-name-input'), 'Bread');
    await typeIngredientAsFreeText(0, 'flour');
    await fireEvent.changeText(screen.getByTestId('rf-ingredient-qty-0'), '200');
    // use-computed-nutrition.ts debounces the ingredient list by 600ms
    // before it counts as "has ingredients" and starts computing.
    await act(() => new Promise((resolve) => setTimeout(resolve, 700)));

    expect(screen.getByTestId('rf-nutrition-computed-coverage')).toHaveTextContent(
      'From 1 of 2 ingredients · no data for: cinnamon',
    );

    await fireEvent.press(screen.getByTestId('rf-nutrition-computed-edit'));

    expect(screen.getByTestId('rf-kcal').props.value).toBe('300');
    expect(screen.getByTestId('rf-nutrition-use-calculated')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('rf-nutrition-use-calculated'));
    expect(screen.getByTestId('rf-nutrition-computed')).toBeOnTheScreen();
  });
});
