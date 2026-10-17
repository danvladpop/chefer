import { AccessibilityInfo, type TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Input } from '@chefer/ui-mobile';
import ImportRecipeScreen from '../../app/import-recipe';

// plan-ingredient-catalog §6.2/§10 (P9) + UX-REC-14/15/07: the link/text
// import review is the SAME editable form as video. Lines the resolver couldn't
// match are listed with candidates; the save sends the catalog ids and
// `acceptPartial` — false when every line computes, true only after "Save with
// incomplete nutrition?". Two real versions get a picker; otherwise
// "Cheferized for you" is a note. Save replaces this screen with the recipe.

const mockPreviewMutate = jest.fn();
const mockSaveMutate = jest.fn();
let mockPreviewData: unknown = null;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  // The unsaved-work guard (UX-REC-06) reads navigation state.
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/premium/premium-host', () => ({ PremiumHost: () => null }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => true }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/lib/trpc', () => {
  const detail = (id: string, kcal: number, portions: { unit: string; grams: number }[] = []) => ({
    id,
    name: id,
    category: 'OTHER',
    owner: 'global',
    portions,
    hasDensity: false,
    nutritionSource: 'USDA_FDC',
    status: 'ACTIVE',
    per100g: {
      calories: kcal,
      protein: 10,
      carbs: 10,
      fat: 10,
      fiber: 0,
      sugar: null,
      satFat: null,
      sodiumMg: null,
    },
    densityGPerMl: null,
    edibleFraction: 1,
    sourceRef: 'fdc:1',
  });
  const catalog = jest
    .requireActual<typeof import('./catalog-trpc-mock')>('./catalog-trpc-mock')
    .catalogTrpc({ details: [detail('rice-id', 360), detail('spice-id', 300)] });
  const idle = {
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
  return {
    trpc: {
      ...catalog,
      recipe: {
        importPreview: {
          useMutation: (opts: { onSuccess: (data: unknown) => void }) => ({
            ...idle,
            mutate: (input: unknown) => {
              mockPreviewMutate(input);
              opts.onSuccess(mockPreviewData);
            },
          }),
        },
        importVideoPreview: { useMutation: () => idle },
        importSave: {
          useMutation: (opts: { onSuccess?: (data: unknown) => void }) => ({
            ...idle,
            mutate: (input: unknown) => {
              mockSaveMutate(input);
              opts.onSuccess?.({ id: 'saved-1' });
            },
          }),
        },
      },
    },
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const ref = (id: string, slug: string, name: string) => ({
  id,
  slug,
  name,
  category: 'OTHER' as const,
  owner: 'global' as const,
  portions: [],
  hasDensity: false,
  nutritionSource: 'USDA_FDC' as const,
});

const recipe = {
  name: 'Spiced rice',
  description: 'Rice with spice.',
  ingredients: [
    { name: 'rice', quantity: 200, unit: 'g' },
    { name: 'grandma spice', quantity: 5, unit: 'g' },
  ],
  instructions: ['Cook.'],
  nutritionInfo: { calories: 720, protein: 20, carbs: 20, fat: 20, fiber: 0 },
  cuisineType: 'Romanian',
  dietaryTags: [],
  prepTimeMins: 5,
  cookTimeMins: 20,
  servings: 1,
};
const resolution = [
  {
    rawName: 'rice',
    unit: 'g',
    note: null,
    confidence: 'ALIAS' as const,
    match: ref('rice-id', 'rice-white-dry', 'Rice, white, dry'),
    candidates: [],
    grams: 200,
  },
  {
    rawName: 'grandma spice',
    unit: 'g',
    note: null,
    confidence: 'CANDIDATES' as const,
    match: null,
    candidates: [ref('spice-id', 'four-spice-mix', 'Four-spice mix')],
    grams: null,
    problem: 'NO_INGREDIENT' as const,
  },
];

beforeEach(() => {
  mockPreviewMutate.mockClear();
  mockSaveMutate.mockClear();
  mockPreviewData = {
    via: 'url',
    original: recipe,
    adapted: recipe,
    changes: [],
    safety: { ok: true, issues: [] },
    macroCheck: {
      status: 'uncertain',
      computedCaloriesPerServing: 1,
      statedCaloriesPerServing: 999,
      matchedLines: 1,
      totalLines: 2,
    },
    sourceUrl: 'https://example.com/rice',
    ogImageUrl: null,
    resolution: { original: resolution, adapted: resolution },
    nutritionStatus: { original: 'PARTIAL', adapted: 'PARTIAL' },
  };
});

async function textInputPrototype(): Promise<object> {
  const holder: { node: TextInput | null } = { node: null };
  await render(
    <Input
      ref={(n) => {
        holder.node = n;
      }}
    />,
  );
  if (!holder.node) throw new Error('no TextInput ref');
  return Object.getPrototypeOf(holder.node) as object;
}

async function openPreview() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ImportRecipeScreen />
    </SafeAreaProvider>,
  );
  await fireEvent.changeText(screen.getByTestId('import-url'), 'https://example.com/rice');
  await fireEvent.press(screen.getByTestId('import-preview'));
}

describe('Import review — catalog lines (editable form)', () => {
  it('lists only the unmatched line with its candidates, and no AI macro warning', async () => {
    await openPreview();
    expect(screen.getByTestId('video-draft-form')).toBeOnTheScreen();
    expect(screen.getByTestId('video-draft-match-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('video-draft-match-0')).toBeNull();
    expect(screen.getByTestId('video-draft-candidate-1-four-spice-mix')).toBeOnTheScreen();
    expect(screen.queryByText(/The source claims/)).toBeNull();
    expect(screen.getByTestId('video-draft-nutrition-status')).toHaveTextContent(
      'Incomplete — 1 ingredient needs data',
    );
  });

  it('saving while incomplete asks first, then sends acceptPartial: true with the known ids', async () => {
    await openPreview();
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect(mockSaveMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Save with incomplete nutrition?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Save anyway'));
    const [input] = mockSaveMutate.mock.calls[0] as [
      {
        acceptPartial: boolean;
        variant: string;
        sourceUrl: string;
        recipe: { ingredients: { ingredientId?: string }[] };
      },
    ];
    expect(input.acceptPartial).toBe(true);
    expect(input.variant).toBe('original');
    expect(input.sourceUrl).toBe('https://example.com/rice');
    expect(input.recipe.ingredients.map((i) => i.ingredientId)).toEqual(['rice-id', undefined]);
  });

  it('picking the candidate completes it: the save refuses partial and sends every id', async () => {
    await openPreview();
    await fireEvent.press(screen.getByTestId('video-draft-candidate-1-four-spice-mix'));
    expect(screen.getByTestId('video-draft-nutrition-status')).toHaveTextContent(
      /^Computed from 2 ingredients/,
    );

    await fireEvent.press(screen.getByTestId('video-draft-save'));
    const [input] = mockSaveMutate.mock.calls[0] as [
      { acceptPartial: boolean; recipe: { ingredients: { ingredientId?: string }[] } },
    ];
    expect(input.acceptPartial).toBe(false);
    expect(input.recipe.ingredients.map((i) => i.ingredientId)).toEqual(['rice-id', 'spice-id']);
  });
});

describe('Import review — which ingredient needs data (F2, feedback 2026-10-17)', () => {
  const linked = (rawName: string, unit: string, id: string, slug: string) => ({
    rawName,
    unit,
    note: null,
    confidence: 'ALIAS' as const,
    match: ref(id, slug, rawName),
    candidates: [],
    grams: null,
  });
  /** A preview whose every line is linked: only the live problems remain. */
  function withLines(
    ingredients: { name: string; quantity: number; unit: string }[],
    lineResolution: ReturnType<typeof linked>[],
  ) {
    const draft = { ...recipe, ingredients };
    mockPreviewData = {
      ...(mockPreviewData as object),
      original: draft,
      adapted: draft,
      resolution: { original: lineResolution, adapted: lineResolution },
    };
  }

  it('marks a linked row whose unit can’t be weighed, on that row — not on the row before it', async () => {
    // Row 0 is blank, so live line 0 is form row 1: the hint must follow the row.
    withLines(
      [
        { name: '', quantity: 0, unit: '' },
        { name: 'rice', quantity: 1, unit: 'cup' },
        { name: 'grandma spice', quantity: 5, unit: 'g' },
      ],
      [
        linked('', '', 'rice-id', 'rice-white-dry'),
        linked('rice', 'cup', 'rice-id', 'rice-white-dry'),
        linked('grandma spice', 'g', 'spice-id', 'four-spice-mix'),
      ],
    );
    await openPreview();
    expect(screen.getByTestId('video-draft-nutrition-status')).toHaveTextContent(
      'Incomplete — 1 ingredient needs data',
    );
    expect(screen.getByTestId('video-draft-problem-1')).toHaveTextContent(
      'Can’t be measured by volume — use grams',
    );
    expect(screen.queryByTestId('video-draft-problem-0')).toBeNull();
    expect(screen.queryByTestId('video-draft-problem-2')).toBeNull();
    // Announced with its row, so a screen reader knows which ingredient.
    expect(
      screen.getByLabelText('Ingredient 2, rice: Can’t be measured by volume — use grams'),
    ).toBeOnTheScreen();
  });

  it('marks a linked row with no amount, counts it, and points the amount field at the fix', async () => {
    withLines(
      [
        { name: 'rice', quantity: 200, unit: 'g' },
        { name: 'grandma spice', quantity: 0, unit: 'g' },
      ],
      [
        linked('rice', 'g', 'rice-id', 'rice-white-dry'),
        linked('grandma spice', 'g', 'spice-id', 'four-spice-mix'),
      ],
    );
    await openPreview();
    expect(screen.getByTestId('video-draft-nutrition-status')).toHaveTextContent(
      'Incomplete — 1 ingredient needs data',
    );
    expect(screen.getByTestId('video-draft-problem-1')).toHaveTextContent('Enter an amount');
    expect(screen.queryByTestId('video-draft-problem-0')).toBeNull();
    expect(screen.getByTestId('video-draft-qty-1').props.accessibilityHint).toBe('Enter an amount');
    expect(screen.getByTestId('video-draft-qty-0').props.accessibilityHint).toBeUndefined();
  });

  it('the hint clears once the row is fixed', async () => {
    withLines(
      [
        { name: 'rice', quantity: 200, unit: 'g' },
        { name: 'grandma spice', quantity: 0, unit: 'g' },
      ],
      [
        linked('rice', 'g', 'rice-id', 'rice-white-dry'),
        linked('grandma spice', 'g', 'spice-id', 'four-spice-mix'),
      ],
    );
    await openPreview();
    await fireEvent.changeText(screen.getByTestId('video-draft-qty-1'), '5');
    expect(screen.queryByTestId('video-draft-problem-1')).toBeNull();
    expect(screen.getByTestId('video-draft-nutrition-status')).toHaveTextContent(
      /^Computed from 2 ingredients/,
    );
  });

  it('tapping "Incomplete …" focuses the first problem row’s amount when that is what is missing', async () => {
    withLines(
      [
        { name: 'rice', quantity: 200, unit: 'g' },
        { name: 'grandma spice', quantity: 0, unit: 'g' },
      ],
      [
        linked('rice', 'g', 'rice-id', 'rice-white-dry'),
        linked('grandma spice', 'g', 'spice-id', 'four-spice-mix'),
      ],
    );
    // The mock TextInput is a class: spying on its prototype sees every field's focus().
    const focused: (string | undefined)[] = [];
    const focus = jest
      .spyOn((await textInputPrototype()) as { focus: () => void }, 'focus')
      .mockImplementation(function (this: { props: { testID?: string } }) {
        focused.push(this.props.testID);
      });
    await openPreview();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Incomplete — 1 ingredient needs data' }),
    );
    expect(focused).toEqual(['video-draft-qty-1']);
    focus.mockRestore();
  });

  it('tapping "Incomplete …" moves screen-reader focus to the first problem row’s hint', async () => {
    withLines(
      [
        { name: 'rice', quantity: 200, unit: 'g' },
        { name: 'rice', quantity: 1, unit: 'cup' },
      ],
      [
        linked('rice', 'g', 'rice-id', 'rice-white-dry'),
        linked('rice', 'cup', 'rice-id', 'rice-white-dry'),
      ],
    );
    await openPreview();
    const announce = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await fireEvent.press(screen.getByTestId('video-draft-nutrition-status'));
    expect(announce).toHaveBeenCalledWith(expect.anything(), 'focus');
    announce.mockRestore();
  });
});

describe('Import review — editable everywhere (UX-REC-15)', () => {
  it('what the user edits is what gets saved', async () => {
    await openPreview();
    await fireEvent.press(screen.getByTestId('video-draft-candidate-1-four-spice-mix'));
    await fireEvent.changeText(screen.getByTestId('video-draft-name'), 'Grandma rice');
    await fireEvent.changeText(screen.getByTestId('video-draft-step-0'), 'Cook it slowly.');
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    const [input] = mockSaveMutate.mock.calls[0] as [
      { recipe: { name: string; instructions: string[] } },
    ];
    expect(input.recipe.name).toBe('Grandma rice');
    expect(input.recipe.instructions).toEqual(['Cook it slowly.']);
  });

  it('blocks a save the shared validator rejects (e.g. no steps) instead of sending it', async () => {
    await openPreview();
    await fireEvent.press(screen.getByTestId('video-draft-candidate-1-four-spice-mix'));
    await fireEvent.changeText(screen.getByTestId('video-draft-step-0'), '');
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect(mockSaveMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('video-draft-problems')).toBeOnTheScreen();
  });
});

describe('Import review — versions (UX-REC-14)', () => {
  const adapted = {
    ...recipe,
    name: 'Spiced rice (dairy-free)',
    ingredients: [
      { name: 'rice', quantity: 200, unit: 'g' },
      { name: 'grandma spice', quantity: 5, unit: 'g' },
    ],
  };

  it('with nothing to adapt, "Cheferized for you" is a note, not a selectable card', async () => {
    await openPreview();
    expect(screen.getByTestId('import-no-changes')).toBeOnTheScreen();
    expect(screen.queryByTestId('import-variant-adapted')).toBeNull();
    expect(screen.queryByTestId('import-variants')).toBeNull();
  });

  it('with a real adaptation both versions are selectable, and the adapted one starts selected', async () => {
    mockPreviewData = {
      ...(mockPreviewData as object),
      adapted,
      changes: [{ type: 'swap', description: 'Swapped butter for olive oil' }],
    };
    await openPreview();
    expect(screen.getByTestId('import-variants')).toBeOnTheScreen();
    expect(screen.queryByTestId('import-no-changes')).toBeNull();
    expect(screen.getByTestId('video-draft-name').props.value).toBe('Spiced rice (dairy-free)');
    expect(screen.getByTestId('import-variant-adapted').props.accessibilityState).toMatchObject({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('import-variant-original'));
    expect(screen.getByTestId('video-draft-name').props.value).toBe('Spiced rice');
    await fireEvent.press(screen.getByTestId('video-draft-candidate-1-four-spice-mix'));
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect((mockSaveMutate.mock.calls[0] as [{ variant: string }])[0].variant).toBe('original');
  });
});

describe('Import save lands on the recipe (UX-REC-07)', () => {
  it('replaces the import screen with the new recipe instead of going back', async () => {
    await openPreview();
    await fireEvent.press(screen.getByTestId('video-draft-candidate-1-four-spice-mix'));
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'saved-1' },
    });
    expect(router.back).not.toHaveBeenCalled();
  });
});
