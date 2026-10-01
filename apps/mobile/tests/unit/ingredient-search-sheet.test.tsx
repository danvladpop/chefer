import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { IngredientSearchSheet } from '../../src/features/ingredients/ingredient-search-sheet';

// plan-ingredient-catalog §10 (P9; T-40.7 originally): the catalog picker,
// tested in isolation from the recipe form. Private rows first under
// "YOUR INGREDIENTS", then "CHEFER CATALOG"; category chips narrow the
// search; "Create … as my ingredient" is the only way out — no free text.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let mockResults: unknown[] = [];
const mockSearchArgs: unknown[] = [];

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    ingredients: {
      search: {
        useQuery: (args: unknown) => {
          mockSearchArgs.push(args);
          return { data: mockResults, isFetching: false };
        },
      },
    },
  },
}));

const onPick = jest.fn();
const onCreateCustom = jest.fn();
const onClose = jest.fn();

function row(over: Record<string, unknown>) {
  return {
    name: 'oats',
    displayName: 'Oats, rolled',
    imageUrl: 'https://img/oats.png',
    hasMacros: true,
    isCustom: false,
    per100g: { calories: 379, protein: 13, carbs: 67, fat: 7 },
    id: 'oats-id',
    slug: 'oats-rolled',
    category: 'GRAIN_CEREAL',
    owner: 'global',
    portions: [],
    hasDensity: true,
    nutritionSource: 'USDA_FDC',
    ...over,
  };
}

async function renderSheet(props: Partial<Parameters<typeof IngredientSearchSheet>[0]> = {}) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <IngredientSearchSheet
        visible
        onClose={onClose}
        onPick={onPick}
        onCreateCustom={onCreateCustom}
        testID="search-sheet"
        {...props}
      />
    </SafeAreaProvider>,
  );
}

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByTestId('search-sheet-input'), text);
  // 250ms debounce before results/groups are shown.
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResults = [];
  mockSearchArgs.length = 0;
});

describe('IngredientSearchSheet', () => {
  it('groups private rows under "YOUR INGREDIENTS" and catalog rows separately', async () => {
    mockResults = [
      row({
        name: 'my oat bread',
        displayName: 'My oat bread',
        isCustom: true,
        owner: 'mine',
        id: 'mine-id',
        slug: 'my-oat-bread',
        nutritionSource: 'USER',
      }),
      row({}),
    ];
    await renderSheet();
    await typeQuery('oat');

    expect(screen.getByText('YOUR INGREDIENTS')).toBeOnTheScreen();
    expect(screen.getByText('CHEFER CATALOG')).toBeOnTheScreen();
    expect(screen.getByTestId('search-sheet-result-my-oat-bread')).toBeOnTheScreen();
    expect(screen.getByTestId('search-sheet-result-oats-rolled')).toBeOnTheScreen();
  });

  it('picking a row hands back its catalog id, portions and density', async () => {
    mockResults = [
      row({
        name: 'egg',
        displayName: 'Egg, whole, raw',
        id: 'egg-id',
        slug: 'egg-whole-raw',
        category: 'EGG',
        portions: [{ unit: 'piece', grams: 50 }],
      }),
    ];
    await renderSheet();
    await typeQuery('egg');
    await fireEvent.press(screen.getByTestId('search-sheet-result-egg-whole-raw'));

    expect(onPick).toHaveBeenCalledWith({
      id: 'egg-id',
      name: 'Egg, whole, raw',
      category: 'EGG',
      owner: 'global',
      portions: [{ unit: 'piece', grams: 50 }],
      hasDensity: true,
    });
  });

  it('a legacy row without a catalog id is not offered (it cannot be computed)', async () => {
    mockResults = [row({ id: undefined, slug: undefined, name: 'old custom' })];
    await renderSheet();
    await typeQuery('old');
    expect(screen.getByTestId('search-sheet-empty')).toBeOnTheScreen();
  });

  it('a category chip narrows the search', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('search-sheet-category-POULTRY'));
    await typeQuery('breast');
    expect(mockSearchArgs.at(-1)).toEqual({ query: 'breast', category: 'POULTRY' });
  });

  it('shows the resolver suggestions before any search, and picking one links it', async () => {
    await renderSheet({
      initialQuery: '',
      suggestions: [
        {
          id: 'mix-id',
          slug: 'four-spice-mix',
          name: 'Four-spice mix',
          category: 'SPICE_DRIED',
          owner: 'global',
          portions: [],
          hasDensity: false,
          nutritionSource: 'CIQUAL',
        },
      ],
    });
    await fireEvent.press(screen.getByTestId('search-sheet-suggestion-four-spice-mix'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'mix-id' }));
  });

  it('never offers free text — "Create … as my ingredient" opens the private-ingredient flow', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'grandma’s spice mix');
    expect(screen.queryByTestId('search-sheet-use-as-typed')).toBeNull();
    expect(screen.getByText('Create "grandma’s spice mix" as my ingredient')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('search-sheet-add-custom'));
    expect(onCreateCustom).toHaveBeenCalledWith('grandma’s spice mix');
  });

  it('shows "No matches in the catalog." once search settles empty', async () => {
    await renderSheet();
    await typeQuery('zzzznomatch');
    expect(screen.getByTestId('search-sheet-empty')).toHaveTextContent(
      'No matches in the catalog.',
    );
  });

  // Regression guard (orchestrator review, Maestro on the iOS simulator):
  // the kit Sheet's own ScrollView collapsed around a dynamic list, and
  // `autoFocus` raced the entrance animation. RNTL runs no real layout, so
  // this locks in the structure instead: only OUR two ScrollViews (the
  // horizontal category row and the results) — never a third from the kit
  // Sheet defaulting back to `scrollable` — and no `autoFocus`.
  it("renders only its own ScrollViews (not the kit Sheet's), and never autoFocuses the input", async () => {
    mockResults = [row({})];
    await renderSheet();
    await typeQuery('oat');

    expect(countScrollViews(screen.toJSON())).toBe(2);
    expect(screen.getByTestId('search-sheet-input').props.autoFocus).not.toBe(true);
  });
});

/** Counts `RCTScrollView` host nodes in an RNTL `toJSON()` tree. */
function countScrollViews(node: unknown): number {
  if (!node) return 0;
  if (Array.isArray(node)) return node.reduce((sum: number, n) => sum + countScrollViews(n), 0);
  const el = node as { type?: string; children?: unknown };
  const here = el.type === 'RCTScrollView' ? 1 : 0;
  return here + countScrollViews(el.children ?? null);
}
