import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotatedExtraction, ExtractedRecipe, IAIService } from '../../lib/ai/types.js';
import {
  DERIVED_SERVINGS_NOTE,
  VideoImportError,
  type IVideoTranscriber,
  type VideoTranscript,
} from '../../lib/video-import/index.js';
import { NO_RECIPE_IN_VIDEO_MESSAGE, VideoRecipeService } from './video-recipe.service.js';

// The AI module validates env at import time — mock it; every test injects
// its own stub IAIService and transcriber through the constructor anyway.
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAPTION = `Garlic butter noodles
• 200 g noodles
• 3 garlic cloves
• 2 tbsp butter`;

function recipe(overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe {
  return {
    name: 'Garlic Butter Noodles',
    description: 'Buttery noodles with plenty of garlic.',
    ingredients: [
      { name: 'noodles', quantity: 200, unit: 'g' },
      { name: 'garlic', quantity: 3, unit: 'clove' },
    ],
    instructions: ['Boil the noodles.', 'Fry the garlic in butter and toss.'],
    nutritionInfo: { calories: 520, protein: 14, carbs: 70, fat: 20, fiber: 3 },
    cuisineType: 'Asian',
    dietaryTags: ['vegetarian'],
    prepTimeMins: 5,
    cookTimeMins: 10,
    servings: 2,
    ...overrides,
  };
}

function annotated(overrides: Partial<AnnotatedExtraction> = {}): AnnotatedExtraction {
  return { recipe: recipe(), confidence: 'high', assumptions: [], ...overrides };
}

function transcript(overrides: Partial<VideoTranscript> = {}): VideoTranscript {
  return {
    platform: 'youtube',
    sourceUrl: 'https://www.youtube.com/shorts/abcdef123',
    title: 'Garlic noodles in 10 minutes',
    creator: 'noodle_chef',
    caption: CAPTION,
    transcript: 'boil the noodles for five minutes, then fry the garlic in the butter',
    source: 'subtitles',
    durationSecs: 45,
    thumbnailUrl: 'https://i.ytimg.com/vi/abcdef123/hq.jpg',
    ...overrides,
  };
}

function makeTranscriber(result: VideoTranscript | Error = transcript()): IVideoTranscriber {
  return {
    transcribe:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  };
}

function makeAi(response: AnnotatedExtraction | Error = annotated()): IAIService {
  const extractRecipeAnnotated =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  return { extractRecipeAnnotated } as unknown as IAIService;
}

const URL = 'https://youtu.be/abcdef123';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VideoRecipeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('extracts from the words only — one TEXT source, never video', async () => {
    const ai = makeAi();
    const result = await new VideoRecipeService(ai, makeTranscriber()).extract(URL);

    expect(ai.extractRecipeAnnotated).toHaveBeenCalledOnce();
    const [source] = vi.mocked(ai.extractRecipeAnnotated).mock.calls[0]!;
    expect(Object.keys(source)).toEqual(['text']);
    expect(source.text).toContain('VIDEO TITLE: Garlic noodles in 10 minutes');
    expect(source.text).toContain(CAPTION);
    expect(source.text).toContain('fry the garlic in the butter');
    expect(result.sourceText).toBe(source.text);
  });

  it('reports which words the recipe came from, with provenance', async () => {
    const result = await new VideoRecipeService(
      makeAi(),
      makeTranscriber(transcript({ source: 'speech' })),
    ).extract(URL);
    expect(result.stage).toBe('speech');
    expect(result.sourceUrl).toBe('https://www.youtube.com/shorts/abcdef123');
    expect(result.creator).toBe('noodle_chef');
    expect(result.platform).toBe('youtube');
    expect(result.captionChars).toBe(CAPTION.length);
  });

  it('maps a transcript failure to its friendly sentence', async () => {
    const service = new VideoRecipeService(
      makeAi(),
      makeTranscriber(new VideoImportError('PRIVATE', 'yt-dlp: Private video')),
    );
    const error = await service.extract(URL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({ code: 'BAD_REQUEST' });
    expect((error as TRPCError).message).toMatch(/private or needs a login/);
    expect((error as TRPCError).message).not.toMatch(/yt-dlp/);
  });

  it('maps a timeout to TIMEOUT and a blocked site to SERVICE_UNAVAILABLE', async () => {
    await expect(
      new VideoRecipeService(makeAi(), makeTranscriber(new VideoImportError('TIMEOUT'))).extract(
        URL,
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(
      new VideoRecipeService(makeAi(), makeTranscriber(new VideoImportError('BLOCKED'))).extract(
        URL,
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('rejects a video whose words hold no recipe at all', async () => {
    const ai = makeAi(
      annotated({ recipe: recipe({ name: 'NO_RECIPE_FOUND', ingredients: [], instructions: [] }) }),
    );
    await expect(new VideoRecipeService(ai, makeTranscriber()).extract(URL)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: NO_RECIPE_IN_VIDEO_MESSAGE,
    });
  });

  it('keeps a partial recipe, blanking a sentinel name for the form to ask for', async () => {
    const ai = makeAi(annotated({ recipe: recipe({ name: 'NO_RECIPE_FOUND', instructions: [] }) }));
    const result = await new VideoRecipeService(ai, makeTranscriber()).extract(URL);
    expect(result.recipe.name).toBe('');
    expect(result.recipe.instructions).toEqual([]);
    expect(result.recipe.ingredients).toHaveLength(2);
  });

  it('caps confidence when nobody stated the serving count', async () => {
    const result = await new VideoRecipeService(makeAi(), makeTranscriber()).extract(URL);
    expect(result.confidence).toBe('medium');
    expect(result.assumptions).toContain(DERIVED_SERVINGS_NOTE);
  });

  it('keeps confidence when the words state the serving count', async () => {
    const result = await new VideoRecipeService(
      makeAi(),
      makeTranscriber(transcript({ caption: `${CAPTION}\nServes 2` })),
    ).extract(URL);
    expect(result.confidence).toBe('high');
    expect(result.assumptions).not.toContain(DERIVED_SERVINGS_NOTE);
  });

  it('turns a provider failure into the friendly import error', async () => {
    const error = await new VideoRecipeService(
      makeAi(Object.assign(new Error('503 overloaded'), { status: 503 })),
      makeTranscriber(),
    )
      .extract(URL)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
