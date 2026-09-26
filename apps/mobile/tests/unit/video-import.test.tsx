import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ImportRecipeScreen from '../../app/import-recipe';
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

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => mockIsPremium() }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
jest.mock('../../src/lib/trpc', () => {
  const idle = {
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
  return {
    trpc: {
      useUtils: () => ({ recipe: { list: { invalidate: jest.fn() } } }),
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
    ...overrides,
  };
}

beforeEach(() => {
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
    mockVideoPreview = preview();
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
      { variant: string; sourceUrl: string; recipe: { name: string } },
    ];
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

  it('free users get a locked card, not the form (per-user AI is premium)', async () => {
    mockIsPremium.mockReturnValue(false);
    await renderScreen();
    expect(screen.getByTestId('import-locked')).toBeTruthy();
    expect(screen.queryByTestId('import-tab-video')).toBeNull();
  });
});

describe('VideoDraftForm (mobile)', () => {
  async function renderForm(data: VideoImportPreview) {
    const onSave = jest.fn();
    await render(
      <VideoDraftForm
        preview={data}
        saving={false}
        saveError={null}
        onBack={jest.fn()}
        onSave={onSave}
      />,
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
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Noodles',
        instructions: ['Boil them.'],
        servings: 4,
        nutritionInfo: { calories: 300, protein: 10, carbs: 45, fat: 9, fiber: 2 },
      }),
    );
  });

  it('flags unheard amounts until edited, and parses fractions', async () => {
    const onSave = await renderForm(preview({ unverifiedQuantities: [1] }));
    expect(screen.getByText('Amount not heard — please check')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('video-draft-qty-1'), '1/2');
    expect(screen.queryByText('Amount not heard — please check')).toBeNull();
    await fireEvent.press(screen.getByTestId('video-draft-save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [
          { name: 'noodles', quantity: 200, unit: 'g' },
          { name: 'olive oil', quantity: 0.5, unit: 'tbsp' },
        ],
      }),
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
