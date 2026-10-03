import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ImportRecipeScreen from '../../app/import-recipe';
import { openPremium } from '../../src/features/premium/open-premium';
import {
  VideoDraftForm,
  type VideoImportPreview,
} from '../../src/features/recipes/video-draft-form';

// Video-link import on mobile (parity with web's VideoDraftForm + the
// "Video" source in ImportRecipeSheet): link validation, the premium lock,
// and the editable review form with its "not found" gaps.

const mockVideoMutate = jest.fn();
const mockSaveMutate = jest.fn();
const mockIsPremium = jest.fn<boolean | undefined, []>(() => true);
let mockVideoPreview: VideoImportPreview | null = null;

// The unsaved-work guard (UX-REC-06) reads navigation state: the mock records
// the latest (prevent, callback) pair — `prevent === true` is what also
// disables the iOS swipe-back.
type PreventCallback = (options: { data: { action: unknown } }) => void;
const mockPrevent: { value: boolean; callback: PreventCallback | null } = {
  value: false,
  callback: null,
};
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ dispatch: mockDispatch, goBack: mockGoBack }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (prevent: boolean, callback: PreventCallback) => {
    mockPrevent.value = prevent;
    mockPrevent.callback = callback;
  },
}));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => mockIsPremium() }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/features/premium/premium-host', () => ({ PremiumHost: () => null }));
jest.mock('../../src/lib/trpc', () => {
  const detail = (id: string, kcal: number) => ({
    id,
    name: id,
    category: 'OTHER',
    owner: 'global',
    portions: [],
    hasDensity: true,
    nutritionSource: 'USDA_FDC',
    status: 'ACTIVE',
    per100g: {
      calories: kcal,
      protein: 1,
      carbs: 1,
      fat: 1,
      fiber: 0,
      sugar: null,
      satFat: null,
      sodiumMg: null,
    },
    densityGPerMl: 0.9,
    edibleFraction: 1,
    sourceRef: 'fdc:1',
  });
  const catalog = jest
    .requireActual<typeof import('./catalog-trpc-mock')>('./catalog-trpc-mock')
    .catalogTrpc({ details: [detail('noodles-id', 350), detail('oil-id', 884)] });
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
        importPreview: { useMutation: () => idle },
        importVideoPreview: {
          useMutation: (opts: { onSuccess: (data: unknown) => void }) => ({
            ...idle,
            mutate: (input: unknown) => {
              mockVideoMutate(input);
              if (mockVideoPreview) opts.onSuccess(mockVideoPreview);
            },
          }),
        },
        importSave: { useMutation: () => ({ ...idle, mutate: mockSaveMutate }) },
      },
    },
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function preview(overrides: Partial<VideoImportPreview> = {}): VideoImportPreview {
  return {
    via: 'video',
    draft: {
      name: 'Garlic Noodles',
      description: 'Buttery garlic noodles.',
      ingredients: [
        { name: 'noodles', quantity: 200, unit: 'g' },
        { name: 'olive oil', quantity: 3, unit: 'tbsp' },
      ],
      instructions: ['Boil the noodles.'],
      nutritionInfo: { calories: 600, protein: 20, carbs: 90, fat: 18, fiber: 4 },
      cuisineType: 'Asian',
      dietaryTags: [],
      prepTimeMins: 5,
      cookTimeMins: 10,
      servings: 2,
    },
    notFound: [],
    unverifiedQuantities: [],
    assumptions: [],
    transcriptSource: 'subtitles',
    safety: { ok: true, issues: [] },
    platform: 'youtube',
    sourceUrl: 'https://www.youtube.com/watch?v=abcdef123',
    ogImageUrl: null,
    videoTitle: 'Garlic noodles',
    creator: 'chef',
    // Additive catalog fields (plan-ingredient-catalog §6.2).
    resolution: [],
    nutritionStatus: 'COMPUTED' as const,
    ...overrides,
  };
}

beforeEach(() => {
  mockPrevent.value = false;
  mockPrevent.callback = null;
  mockDispatch.mockClear();
  mockGoBack.mockClear();
  mockVideoMutate.mockClear();
  mockSaveMutate.mockClear();
  mockIsPremium.mockReturnValue(true);
  mockVideoPreview = null;
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ImportRecipeScreen />
    </SafeAreaProvider>,
  );
}

describe('Import screen — video source', () => {
  it('sends a supported link for a draft, then opens the review form and saves it', async () => {
    const ref = (id: string, name: string) => ({
      id,
      slug: id,
      name,
      category: 'OTHER' as const,
      owner: 'global' as const,
      portions: [],
      hasDensity: true,
      nutritionSource: 'USDA_FDC' as const,
    });
    const resolved = (rawName: string, unit: string, match: ReturnType<typeof ref>) => ({
      rawName,
      unit,
      note: null,
      confidence: 'ALIAS' as const,
      match,
      candidates: [],
      grams: 1,
    });
    mockVideoPreview = preview({
      resolution: [
        resolved('noodles', 'g', ref('noodles-id', 'Noodles, dry')),
        resolved('olive oil', 'tbsp', ref('oil-id', 'Olive oil')),
      ],
    });
    await renderScreen();
    await fireEvent.press(screen.getByTestId('import-tab-video'));
    await fireEvent.changeText(
      screen.getByTestId('import-video-url'),
      'https://youtu.be/abcdef123',
    );
    await fireEvent.press(screen.getByTestId('import-preview'));

    expect(mockVideoMutate).toHaveBeenCalledWith({ url: 'https://youtu.be/abcdef123' });
    expect(screen.getByTestId('video-draft-form')).toBeTruthy();
    expect(screen.getByText(/from the video's captions/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect(mockSaveMutate).toHaveBeenCalledTimes(1);
    const [input] = mockSaveMutate.mock.calls[0] as [
      {
        variant: string;
        sourceUrl: string;
        acceptPartial: boolean;
        recipe: { name: string; ingredients: { ingredientId?: string }[] };
      },
    ];
    // Every line resolved: the catalog ids go along and an incomplete save is refused.
    expect(input.acceptPartial).toBe(false);
    expect(input.recipe.ingredients.map((i) => i.ingredientId)).toEqual(['noodles-id', 'oil-id']);
    expect(input.variant).toBe('original');
    expect(input.sourceUrl).toBe('https://www.youtube.com/watch?v=abcdef123');
    expect(input.recipe.name).toBe('Garlic Noodles');
  });

  it('refuses other links before any request', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('import-tab-video'));
    await fireEvent.changeText(screen.getByTestId('import-video-url'), 'https://example.com/v.mp4');
    expect(screen.getByTestId('import-video-invalid')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('import-preview'));
    expect(mockVideoMutate).not.toHaveBeenCalled();
  });

  it('free users keep the form; Import opens the premium sheet and what was pasted survives (T-10.4)', async () => {
    mockIsPremium.mockReturnValue(false);
    await renderScreen();
    // A lock card sits above the form — it never replaces it.
    expect(screen.getByTestId('import-locked')).toBeTruthy();
    expect(screen.getByText('Turn your saved links and videos into recipes')).toBeTruthy();
    expect(screen.getByTestId('import-tab-video')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('import-tab-video'));
    await fireEvent.changeText(
      screen.getByTestId('import-video-url'),
      'https://youtu.be/abcdef123',
    );
    await fireEvent.press(screen.getByTestId('import-preview'));

    // No request is made on a free plan: the sheet opens instead.
    expect(mockVideoMutate).not.toHaveBeenCalled();
    expect(openPremium).toHaveBeenCalledWith('recipe-import');
    // The pasted link is still there after the sheet.
    expect(screen.getByTestId('import-video-url').props.value).toBe('https://youtu.be/abcdef123');
  });

  it('free users have "Or type it in yourself" — the manual recipe form', async () => {
    mockIsPremium.mockReturnValue(false);
    await renderScreen();
    await fireEvent.press(screen.getByTestId('import-locked-free-action'));
    expect(router.push).toHaveBeenCalledWith('/recipe-form');
    expect(screen.getByText('Or type it in yourself')).toBeTruthy();
  });

  it('premium users see no lock card', async () => {
    mockIsPremium.mockReturnValue(true);
    await renderScreen();
    expect(screen.queryByTestId('import-locked')).toBeNull();
  });
});

// UX-REC-06 (WP-03): a finished preview is not thrown away by BACK / swipe.
describe('Import screen — unsaved-preview guard (UX-REC-06)', () => {
  async function openPreview() {
    mockVideoPreview = preview();
    await renderScreen();
    await fireEvent.press(screen.getByTestId('import-tab-video'));
    await fireEvent.changeText(
      screen.getByTestId('import-video-url'),
      'https://youtu.be/abcdef123',
    );
    await fireEvent.press(screen.getByTestId('import-preview'));
    expect(screen.getByTestId('video-draft-form')).toBeTruthy();
  }

  const pressBack = async () => {
    await act(() => {
      mockPrevent.callback?.({ data: { action: { type: 'GO_BACK' } } });
    });
  };

  it('does not prevent leaving while no preview exists', async () => {
    await renderScreen();
    expect(mockPrevent.value).toBe(false);
  });

  it('prevents removal (and the iOS swipe) while a preview exists, and BACK asks first', async () => {
    await openPreview();
    expect(mockPrevent.value).toBe(true);
    expect(screen.queryByText('Discard this import?')).toBeNull();

    await pressBack();
    expect(screen.getByText('Discard this import?')).toBeTruthy();
    // "Keep reviewing" keeps the preview on screen and leaves nothing replayed.
    await fireEvent.press(screen.getByTestId('import-discard-cancel'));
    expect(screen.getByTestId('video-draft-form')).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('"Discard" lets the blocked navigation through', async () => {
    await openPreview();
    await pressBack();
    await fireEvent.press(screen.getByTestId('import-discard-confirm'));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
  });

  it('"Start over" clears the preview and lifts the guard', async () => {
    await openPreview();
    await fireEvent.press(screen.getByText('Start over'));
    expect(mockPrevent.value).toBe(false);
  });
});

describe('VideoDraftForm (mobile)', () => {
  async function renderForm(data: VideoImportPreview) {
    const onSave = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <VideoDraftForm
          preview={data}
          saving={false}
          saveError={null}
          onBack={jest.fn()}
          onSave={onSave}
        />
      </SafeAreaProvider>,
    );
    return onSave;
  }

  it('marks what the video did not say and blocks saving until it is filled', async () => {
    const onSave = await renderForm(
      preview({
        draft: { ...preview().draft, name: '', instructions: [] },
        notFound: ['name', 'instructions', 'servings'],
      }),
    );
    expect(screen.getAllByText('Not found — please add')).toHaveLength(2);
    expect(screen.getByText(/Servings: not stated in the video/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Add a recipe name.')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('video-draft-name'), 'Noodles');
    await fireEvent.changeText(screen.getByTestId('video-draft-step-0'), 'Boil them.');
    await fireEvent.changeText(screen.getByTestId('video-draft-servings'), '4');
    expect(screen.queryByText('Not found — please add')).toBeNull();

    await fireEvent.press(screen.getByTestId('video-draft-save'));
    // No line is linked to the catalog in this fixture, so the live result is
    // PARTIAL: the save asks first, then sends acceptPartial.
    await fireEvent.press(screen.getByText('Save anyway'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Noodles',
        instructions: ['Boil them.'],
        servings: 4,
      }),
      true,
    );
  });

  it('flags unheard amounts until edited, and parses fractions', async () => {
    const onSave = await renderForm(preview({ unverifiedQuantities: [1] }));
    expect(screen.getByText('Amount not heard — please check')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('video-draft-qty-1'), '1/2');
    expect(screen.queryByText('Amount not heard — please check')).toBeNull();
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    await fireEvent.press(screen.getByText('Save anyway'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [
          { name: 'noodles', quantity: 200, unit: 'g' },
          { name: 'olive oil', quantity: 0.5, unit: 'tbsp' },
        ],
      }),
      true,
    );
  });

  it('adds and removes rows', async () => {
    await renderForm(preview());
    await fireEvent.press(screen.getByTestId('video-draft-add-ingredient'));
    expect(screen.getByTestId('video-draft-ingredient-2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove ingredient 1'));
    expect(screen.queryByTestId('video-draft-ingredient-2')).toBeNull();
  });
});
