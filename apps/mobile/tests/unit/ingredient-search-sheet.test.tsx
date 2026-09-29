import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { IngredientSearchSheet } from '../../src/features/ingredients/ingredient-search-sheet';

// T-40.7 (UX-40 slice 2): the ingredient combobox's search sheet, tested in
// isolation from the recipe form (recipe-form.test.tsx covers the wiring —
// AC12). Private rows first under "YOUR INGREDIENTS", then "CHEFER
// CATALOGUE"; "Use as typed" and "Add as my ingredient" always sit below.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let mockResults: unknown[] = [];

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    ingredients: {
      search: { useQuery: () => ({ data: mockResults, isFetching: false }) },
    },
  },
}));

const onPick = jest.fn();
const onUseAsTyped = jest.fn();
const onCreateCustom = jest.fn();
const onClose = jest.fn();

async function renderSheet(visible = true) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <IngredientSearchSheet
        visible={visible}
        onClose={onClose}
        onPick={onPick}
        onUseAsTyped={onUseAsTyped}
        onCreateCustom={onCreateCustom}
        testID="search-sheet"
      />
    </SafeAreaProvider>,
  );
}

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByTestId('search-sheet-input'), text);
  // 250ms debounce (T-40.7) before results/groups are shown.
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResults = [];
});

describe('IngredientSearchSheet', () => {
  it('groups private rows under "YOUR INGREDIENTS" and catalogue rows separately', async () => {
    mockResults = [
      {
        name: 'my oat bread',
        displayName: 'My Oat Bread',
        imageUrl: 'https://img/mine.png',
        hasMacros: true,
        isCustom: true,
        per100g: { calories: 250, protein: 8, carbs: 40, fat: 5 },
      },
      {
        name: 'oats, rolled',
        displayName: 'Oats, Rolled',
        imageUrl: 'https://img/oats.png',
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 379, protein: 13, carbs: 67, fat: 7 },
      },
    ];
    await renderSheet();
    await typeQuery('oat');

    expect(screen.getByText('YOUR INGREDIENTS')).toBeOnTheScreen();
    expect(screen.getByText('CHEFER CATALOGUE')).toBeOnTheScreen();
    expect(screen.getByTestId('search-sheet-result-my oat bread')).toBeOnTheScreen();
    expect(screen.getByTestId('search-sheet-result-oats, rolled')).toBeOnTheScreen();
  });

  it('picking a row calls onPick with its display name and natural unit', async () => {
    mockResults = [
      {
        name: 'milk',
        displayName: 'Milk',
        imageUrl: 'https://img/milk.png',
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 42, protein: 3.4, carbs: 5, fat: 1 },
      },
    ];
    await renderSheet();
    await typeQuery('mil');
    await fireEvent.press(screen.getByTestId('search-sheet-result-milk'));

    expect(onPick).toHaveBeenCalledWith({ name: 'Milk', naturalUnit: 'ml' });
  });

  it('a row with no macros shows the "no macros yet" badge instead of kcal', async () => {
    mockResults = [
      {
        name: 'dragon fruit',
        displayName: 'Dragon Fruit',
        imageUrl: 'https://img/df.png',
        hasMacros: false,
        isCustom: false,
        per100g: null,
      },
    ];
    await renderSheet();
    await typeQuery('drag');
    expect(screen.getByText('no macros yet')).toBeOnTheScreen();
  });

  it('"Use as typed" commits the free-typed text with no catalogue link', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'a rare spice');
    await fireEvent.press(screen.getByTestId('search-sheet-use-as-typed'));
    expect(onUseAsTyped).toHaveBeenCalledWith('a rare spice');
  });

  it('"Add as my ingredient" opens the custom-ingredient flow with the typed text', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('search-sheet-input'), 'grandma’s spice mix');
    await fireEvent.press(screen.getByTestId('search-sheet-add-custom'));
    expect(onCreateCustom).toHaveBeenCalledWith('grandma’s spice mix');
  });

  it('shows "No matches in the catalogue." once search settles empty', async () => {
    mockResults = [];
    await renderSheet();
    await typeQuery('zzzznomatch');
    expect(screen.getByTestId('search-sheet-empty')).toHaveTextContent(
      'No matches in the catalogue.',
    );
  });

  // Regression guard (orchestrator review, Maestro on the iOS simulator):
  // the sheet used to render as just its header, blank below the title —
  // the kit Sheet's own ScrollView collapsed, and `autoFocus` on the input
  // raced the sheet's entrance animation. RNTL doesn't run real Yoga
  // layout, so it can't assert an actual pixel height; this locks in the
  // two structural choices the fix depends on instead: exactly ONE
  // ScrollView in the tree (ours, around the results — never a second one
  // from the kit Sheet defaulting back to `scrollable: true` and wrapping
  // everything, which is what collapsed on device), and no `autoFocus`.
  it("renders only its own results ScrollView (not the kit Sheet's), and never autoFocuses the input", async () => {
    mockResults = [
      {
        name: 'rolled oats',
        displayName: 'Rolled Oats',
        imageUrl: 'https://img/oats.png',
        hasMacros: true,
        isCustom: false,
        per100g: { calories: 379, protein: 13, carbs: 67, fat: 7 },
      },
    ];
    await renderSheet();
    await typeQuery('oat');

    expect(countScrollViews(screen.toJSON())).toBe(1);
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
