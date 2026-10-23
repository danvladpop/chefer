import { Keyboard, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { NumbersModeProvider } from '../../src/features/numbers-mode/numbers-mode';
import { QuickAddSheet } from '../../src/features/tracker/quick-add-sheet';
import { focusedFields, resetFocusedFields } from './keyboard-test-utils';

// T-19.1 (UX-19): the search-first Log sheet — Recent, This week's plan,
// Your recipes, Ingredients (per 100 g), and "Enter calories yourself" as the
// calories-only fallback (the old sheet). T-19.5/B-39: the macro sanity line.

const mockLogRecipe = jest.fn();
const mockLogCustom = jest.fn();
const mockInvalidate = jest.fn();
const mockRecordRebalance = jest.fn();
const mockSnackbarShow = jest.fn<undefined, [unknown]>();
let mockRecents: unknown[] = [];
let mockRecipes: unknown[] = [];
let mockIngredients: unknown[] = [];
let mockProducts: unknown[] = [];
let mockSavedMeals: unknown[] = [];
const mockParseFoodText = jest.fn<undefined, [unknown]>();
const mockLogItems = jest.fn<undefined, [unknown]>();
let mockParsedItems: unknown[] = [];
const mockLogSaved = jest.fn();
const mockUndoEntries = jest.fn();
const mockLookupBarcode = jest.fn();
const mockLogProduct = jest.fn();
const mockCreateProduct = jest.fn<undefined, [unknown]>();
const mockTrack = jest.fn<undefined, unknown[]>();
const mockOpenPremium = jest.fn();
let mockCanScanLabel = false;
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

const OAT_DRINK = {
  id: 'p1',
  barcode: '7394376616037',
  name: 'Oat Drink',
  brand: 'Oatly',
  per100g: {
    kcal: 46,
    protein: 1,
    carbs: 6.7,
    fat: 1.5,
    fiber: null,
    sugar: 4,
    saturatedFat: 0.2,
    salt: 0.1,
  },
  servingSizeG: 250,
  allergens: { status: 'listed', contains: [{ id: 'gluten', label: 'Gluten' }], mayContain: [] },
  source: 'OFF',
  isOwn: false,
  imageUrl: null,
};
const GLUTEN_WARNING = { allergenId: 'gluten', label: 'Gluten', kind: 'contains', who: ['you'] };

jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));
jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ enabled: mockCanScanLabel, limit: 0, isPremium: mockCanScanLabel }),
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
jest.mock('../../src/features/premium/open-premium', () => ({
  openPremium: (source: string) => {
    mockOpenPremium(source);
  },
}));

/** A tRPC mutation stub whose mutate(vars, { onSuccess }) answers with `respond(vars)`. */
function mockMutation(spy: (vars: unknown) => void, respond: (vars: unknown) => unknown) {
  return {
    useMutation: () => ({
      isPending: false,
      mutate: (
        vars: unknown,
        cb?: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void },
      ) => {
        spy(vars);
        cb?.onSuccess?.(respond(vars));
      },
      mutateAsync: (vars: unknown) => {
        spy(vars);
        return Promise.resolve(respond(vars));
      },
    }),
  };
}

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      products: { lookupBarcode: { fetch: mockLookupBarcode } },
      savedMeals: { list: { invalidate: jest.fn() } },
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
    products: {
      search: { useQuery: () => ({ data: mockProducts, ...mockSearchState }) },
      lookupBarcodePhoto: mockMutation(
        () => undefined,
        () => ({ status: 'unreadable' }),
      ),
      scanLabel: mockMutation(
        () => undefined,
        () => ({}),
      ),
      create: mockMutation(
        (v) => {
          mockCreateProduct(v);
        },
        (vars) => ({
          product: {
            ...OAT_DRINK,
            name: (vars as { name: string }).name,
            id: 'own1',
            isOwn: true,
            source: 'USER',
          },
          warnings: [],
        }),
      ),
    },
    savedMeals: { list: { useQuery: () => ({ data: mockSavedMeals }) } },
    tracker: {
      parseFoodText: mockMutation(
        (v) => {
          mockParseFoodText(v);
        },
        () => ({ items: mockParsedItems }),
      ),
      logItems: mockMutation(
        (v) => {
          mockLogItems(v);
        },
        () => ({ log: {}, entryIds: ['t1', 't2'], rebalance }),
      ),
      logSavedMeal: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
          isPending: false,
          isError: false,
          mutate: (vars: unknown) => {
            mockLogSaved(vars);
            opts.onSuccess?.({ log: {}, entryIds: ['n1', 'n2'], rebalance }, vars);
          },
        }),
      },
      deleteEntries: {
        useMutation: () => ({
          mutate: (vars: unknown) => {
            mockUndoEntries(vars);
          },
          isPending: false,
        }),
      },
      logProduct: mockMutation(
        (v) => {
          mockLogProduct(v);
        },
        () => ({ log: {}, entryId: 'e9', rebalance }),
      ),
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
  mockProducts = [];
  mockSavedMeals = [];
  mockCanScanLabel = false;
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
      rebalanceMode: 'preview',
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
      rebalanceMode: 'preview',
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

  it('ADR 0002 (replaces B-29): offers "Scan barcode" next to the other ways to log', async () => {
    await renderSheet();
    expect(screen.getByTestId('log-sheet-scan-barcode')).toHaveTextContent(/Scan barcode/);
  });
});

describe('QuickAddSheet — packaged products (ADR 0002)', () => {
  // Several typed fields per test: userEvent typing is slow on a busy runner.
  jest.setTimeout(30_000);
  it('typed barcode → product card with the allergen warning and OFF attribution → logs servings', async () => {
    const user = userEvent.setup();
    mockLookupBarcode.mockResolvedValue({
      status: 'found',
      product: OAT_DRINK,
      origin: 'off',
      warnings: [GLUTEN_WARNING],
      stale: false,
    });
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-scan-barcode'));
    await user.type(screen.getByTestId('product-barcode-input'), '7394 3766 16037');
    await user.press(screen.getByTestId('product-barcode-find'));

    expect(mockLookupBarcode).toHaveBeenCalledWith({ barcode: '7394376616037' });
    expect(await screen.findByTestId('product-name')).toHaveTextContent('Oatly Oat Drink');
    expect(screen.getByTestId('product-allergen-warnings')).toHaveTextContent(
      /Contains gluten: you avoid it\./,
    );
    expect(screen.getByTestId('product-off-attribution')).toHaveTextContent(/Open Food Facts/);
    expect(mockTrack).toHaveBeenCalledWith('barcode_found', {
      source: 'off',
      allergenWarning: true,
    });

    // Defaults to 1 serving (250 g); 2 servings logs 500 g worth.
    await user.press(screen.getByTestId('product-amount-2'));
    expect(screen.getByTestId('product-live-nutrition')).toHaveTextContent(/230 kcal/);
    await user.press(screen.getByTestId('product-log'));
    expect(mockLogProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-09-26',
        productId: 'p1',
        amount: { unit: 'serving', servings: 2 },
        rebalanceMode: 'preview',
      }),
    );
    expect(mockTrack).toHaveBeenCalledWith('packaged_product_logged', {
      unit: 'serving',
      allergenWarning: true,
    });
    expect(onLogged).toHaveBeenCalled();
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Logged Oat Drink' }),
    );
  });

  it('a wrong check digit is explained without calling the API', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-scan-barcode'));
    await user.type(screen.getByTestId('product-barcode-input'), '7394376616038');
    await user.press(screen.getByTestId('product-barcode-find'));
    expect(mockLookupBarcode).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-flow-error')).toHaveTextContent(/doesn’t look right/);
  });

  it('not found (free): the label scan points to Premium; "Enter it yourself" saves a USER product', async () => {
    const user = userEvent.setup();
    mockLookupBarcode.mockResolvedValue({ status: 'not_found', barcode: '96385074' });
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-scan-barcode'));
    await user.type(screen.getByTestId('product-barcode-input'), '96385074');
    await user.press(screen.getByTestId('product-barcode-find'));

    expect(await screen.findByTestId('product-not-found')).toBeOnTheScreen();
    expect(mockTrack).toHaveBeenCalledWith('barcode_not_found', { via: 'typed' });
    expect(screen.getByTestId('product-photograph-label')).toHaveTextContent(/Premium/);
    await user.press(screen.getByTestId('product-photograph-label'));
    expect(mockOpenPremium).toHaveBeenCalledWith('snap-scan');

    await user.press(screen.getByTestId('product-enter-manually'));
    await user.type(screen.getByTestId('product-form-name'), 'Rye crackers');
    await user.press(screen.getByTestId('product-form-save'));
    expect(screen.getByTestId('product-form-error')).toHaveTextContent(/calories per 100 g/);
    expect(mockCreateProduct).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('product-form-kcal'), '380');
    await user.press(screen.getByTestId('product-form-allergen-gluten'));
    await user.press(screen.getByTestId('product-form-save'));
    expect(mockCreateProduct.mock.calls[0]?.[0]).toMatchObject({
      source: 'USER',
      barcode: '96385074',
      name: 'Rye crackers',
      per100g: { kcal: 380, protein: null },
      allergens: { known: true, contains: ['gluten'] },
    });
    expect(mockTrack).toHaveBeenCalledWith('packaged_product_created', { source: 'manual' });
    // The saved product opens on its card, ready to log — with no OFF attribution.
    expect(await screen.findByTestId('product-name')).toHaveTextContent(/Rye crackers/);
    expect(screen.queryByTestId('product-off-attribution')).not.toBeOnTheScreen();
  });

  it('a "Packaged products" search row opens that product', async () => {
    const user = userEvent.setup();
    mockProducts = [{ product: OAT_DRINK, warnings: [] }];
    await renderSheet();
    await user.type(screen.getByTestId('log-sheet-search'), 'oat');
    await user.press(await screen.findByTestId('log-sheet-product-p1'));
    expect(screen.getByTestId('product-name')).toHaveTextContent('Oatly Oat Drink');
    expect(screen.getByTestId('product-allergen-line')).toHaveTextContent('Contains: Gluten.');
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

  // UX-FOOD-10: an error goes as soon as its own field is edited — not before,
  // and not for the other fields.
  it('clears a field error as soon as that field is edited', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-protein'), '900');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(screen.getByTestId('quick-add-name-error')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-add-kcal-error')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-add-protein-error')).toBeOnTheScreen();

    await user.type(screen.getByTestId('quick-add-name'), 'P');
    expect(screen.queryByTestId('quick-add-name-error')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quick-add-kcal-error')).toBeOnTheScreen();

    await user.type(screen.getByTestId('quick-add-kcal'), '3');
    expect(screen.queryByTestId('quick-add-kcal-error')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quick-add-protein-error')).toBeOnTheScreen();

    await user.type(screen.getByTestId('quick-add-protein'), '0');
    expect(screen.queryByTestId('quick-add-protein-error')).not.toBeOnTheScreen();
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
      rebalanceMode: 'preview',
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

// Tester feedback 2026-10-04: the keyboard walks name -> kcal -> protein ->
// carbs -> fat on Return / Next, closes after the last field and after Log.
describe('QuickAddSheet — keyboard (tester feedback 2026-10-04)', () => {
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    resetFocusedFields();
  });
  afterEach(() => dismiss.mockRestore());

  it('Return walks the manual form field by field, then closes the keyboard', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);

    const name = screen.getByTestId('quick-add-name');
    expect(name.props.returnKeyType).toBe('next');
    for (const id of ['quick-add-kcal', 'quick-add-protein', 'quick-add-carbs']) {
      expect(screen.getByTestId(id).props.returnKeyType).toBe('next');
    }
    expect(screen.getByTestId('quick-add-fat').props.returnKeyType).toBe('done');

    resetFocusedFields();
    for (const id of ['quick-add-name', 'quick-add-kcal', 'quick-add-protein', 'quick-add-carbs']) {
      await fireEvent(screen.getByTestId(id), 'submitEditing');
    }
    expect(focusedFields()).toEqual([
      'quick-add-kcal',
      'quick-add-protein',
      'quick-add-carbs',
      'quick-add-fat',
    ]);
    expect(dismiss).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId('quick-add-fat'), 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('Log closes the keyboard when the entry is accepted', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    await user.type(screen.getByTestId('quick-add-name'), 'Pizza');
    await user.type(screen.getByTestId('quick-add-kcal'), '300');
    await user.press(screen.getByTestId('quick-add-submit'));
    expect(mockLogCustom).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  });

  it('the search field reads "search" and closes the keyboard on submit', async () => {
    await renderSheet();
    const search = screen.getByTestId('log-sheet-search');
    expect(search.props.returnKeyType).toBe('search');
    await fireEvent(search, 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('every numeric field is a number/decimal pad (so iOS shows the Done / Next bar)', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await goToManual(user);
    expect(screen.getByTestId('quick-add-kcal').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('quick-add-protein').props.keyboardType).toBe('decimal-pad');
    expect(screen.getByTestId('quick-add-kcal').props.inputAccessoryViewID).toBeTruthy();
    expect(screen.getByTestId('quick-add-fat').props.inputAccessoryViewID).toBeTruthy();
  });

  it('protein-only: name hands focus to protein, which is the last field and closes the keyboard', async () => {
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <NumbersModeProvider mode="PROTEIN_ONLY">
          <QuickAddSheet visible date="2026-09-26" onClose={onClose} onLogged={onLogged} />
        </NumbersModeProvider>
      </SafeAreaProvider>,
    );
    await goToManual(user);
    expect(screen.queryByTestId('quick-add-kcal')).not.toBeOnTheScreen();
    expect(screen.getByTestId('quick-add-protein').props.returnKeyType).toBe('done');
    expect(screen.getByTestId('quick-add-protein').props.inputAccessoryViewID).toBeTruthy();

    resetFocusedFields();
    await fireEvent(screen.getByTestId('quick-add-name'), 'submitEditing');
    expect(focusedFields()).toEqual(['quick-add-protein']);
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('quick-add-protein'), 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe('QuickAddSheet — saved meals (lane A2)', () => {
  const MEAL = {
    id: 's1',
    name: 'Weekday breakfast',
    items: [
      { name: 'Porridge', portionMultiplier: 1, kcal: 400, protein: 20, carbs: 50, fat: 10 },
      { name: 'Coffee', portionMultiplier: 1, kcal: 40, protein: 2, carbs: 4, fat: 1.5 },
    ],
    totals: { kcal: 440, protein: 22, carbs: 54, fat: 11.5 },
    lastLoggedAt: null,
  };

  it('logs a saved meal in one tap, with an Undo that deletes exactly its entries', async () => {
    const user = userEvent.setup();
    mockSavedMeals = [MEAL];
    await renderSheet();
    expect(screen.getByText('2 items · 440 kcal')).toBeOnTheScreen();
    await user.press(screen.getByTestId('log-sheet-saved-add-s1'));
    expect(mockLogSaved).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-09-26', savedMealId: 's1', rebalanceMode: 'preview' }),
    );
    expect(mockTrack).toHaveBeenCalledWith('saved_meal_logged', { itemCount: 2 });
    const snack = mockSnackbarShow.mock.calls.at(-1)?.[0] as {
      message: string;
      onAction: () => void;
    };
    expect(snack.message).toBe('Logged Weekday breakfast');
    snack.onAction();
    expect(mockUndoEntries).toHaveBeenCalledWith({ date: '2026-09-26', entryIds: ['n1', 'n2'] });
  });

  it('is not offered when the sheet replaces a plan slot', async () => {
    mockSavedMeals = [MEAL];
    await renderSheet({ targetSlot: { mealType: 'lunch', slotIndex: 1 } });
    expect(screen.queryByTestId('log-sheet-saved-add-s1')).not.toBeOnTheScreen();
  });
});

describe('QuickAddSheet — type what you ate (lane A4)', () => {
  jest.setTimeout(30_000);

  it('parses the sentence, lets the user fix amounts and drop items, then logs them all with Undo', async () => {
    const user = userEvent.setup();
    mockParsedItems = [
      {
        key: '0',
        text: '2 eggs',
        name: 'Egg',
        source: 'ingredient',
        unit: 'g',
        grams: 100,
        per100g: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
      },
      {
        key: '1',
        text: 'mystery stew',
        name: 'Mystery stew',
        source: 'estimate',
        unit: 'g',
        grams: 300,
        per100g: { kcal: 120, protein: null, carbs: 10, fat: 5 },
      },
      {
        key: '2',
        text: 'coffee',
        name: 'Coffee',
        source: 'estimate',
        unit: 'g',
        grams: 240,
        per100g: { kcal: 1, protein: 0.1, carbs: 0, fat: 0 },
      },
    ];
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-type-it'));
    await user.type(screen.getByTestId('food-text-input'), '2 eggs, mystery stew, coffee');
    await user.press(screen.getByTestId('food-text-read'));
    expect(mockParseFoodText).toHaveBeenCalledWith({ text: '2 eggs, mystery stew, coffee' });
    expect(mockTrack).toHaveBeenCalledWith('food_text_parsed', { itemCount: 3, estimated: 2 });
    expect(screen.getByTestId('food-text-item-1')).toHaveTextContent(/Estimate/);

    await user.press(screen.getByTestId('food-text-remove-2'));
    await user.clear(screen.getByTestId('food-text-amount-0'));
    await user.type(screen.getByTestId('food-text-amount-0'), '150');
    expect(screen.getByTestId('food-text-log')).toHaveTextContent('Log 2 items · 575 kcal');
    await user.press(screen.getByTestId('food-text-log'));

    expect(mockLogItems).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-09-26',
        rebalanceMode: 'preview',
        items: [
          expect.objectContaining({ name: 'Egg, 150 g', estimatedBy: 'manual', kcal: 215 }),
          expect.objectContaining({
            name: 'Mystery stew, 300 g',
            estimatedBy: 'vision',
            unknownMacros: ['protein'],
          }),
        ],
      }),
    );
    expect(mockTrack).toHaveBeenCalledWith('food_text_logged', { itemCount: 2, edited: true });
    const snack = mockSnackbarShow.mock.calls.at(-1)?.[0] as {
      message: string;
      onAction: () => void;
    };
    expect(snack.message).toBe('Logged 2 items');
    snack.onAction();
    expect(mockUndoEntries).toHaveBeenCalledWith({ date: '2026-09-26', entryIds: ['t1', 't2'] });
  });

  it('says so when nothing in the sentence is food', async () => {
    const user = userEvent.setup();
    mockParsedItems = [];
    await renderSheet();
    await user.press(screen.getByTestId('log-sheet-type-it'));
    await user.type(screen.getByTestId('food-text-input'), 'hello there');
    await user.press(screen.getByTestId('food-text-read'));
    expect(screen.getByTestId('food-text-error')).toHaveTextContent(/couldn’t find any food/);
  });

  it('is not offered when the sheet replaces a plan slot', async () => {
    await renderSheet({ targetSlot: { mealType: 'lunch', slotIndex: 1 } });
    expect(screen.queryByTestId('log-sheet-type-it')).not.toBeOnTheScreen();
  });
});
