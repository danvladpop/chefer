import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotatedExtraction, ExtractedRecipe, IAIService } from '../../lib/ai/types.js';
import type {
  DownloadedVideo,
  IMediaFetcher,
  VideoMetadata,
} from '../../lib/video-import/index.js';
import { VideoRecipeService } from './video-recipe.service.js';

// The AI module validates env at import time — mock it; every test injects its
// own stub IAIService and IMediaFetcher through the constructor anyway.
vi.mock('../../lib/ai/index.js', () => ({ aiService: {} }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CAPTION = `Air Fried Chipotle Honey Chicken Tenders
• 1.5 lbs chicken tenderloins
• 1/4 cup honey
• 2 garlic cloves
406 cal / 49g protein`;

function recipe(overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe {
  return {
    name: 'Chipotle Honey Chicken Tenders',
    description: 'Crispy air-fried tenders in a sweet-hot glaze.',
    ingredients: [
      { name: 'chicken tenderloins', quantity: 680, unit: 'g' },
      { name: 'honey', quantity: 0.25, unit: 'cup' },
    ],
    instructions: ['Bread the chicken.', 'Air fry at 190C for 14 minutes.'],
    nutritionInfo: { calories: 406, protein: 49, carbs: 38, fat: 6, fiber: 3 },
    cuisineType: 'American',
    dietaryTags: [],
    prepTimeMins: 15,
    cookTimeMins: 15,
    servings: 3,
    ...overrides,
  };
}

function annotated(overrides: Partial<AnnotatedExtraction> = {}): AnnotatedExtraction {
  return { recipe: recipe(), confidence: 'high', assumptions: [], ...overrides };
}

function metadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    caption: CAPTION,
    sourceUrl: 'https://www.instagram.com/reel/ABC123/',
    creator: 'hunt4shredz',
    durationSecs: 15,
    ...overrides,
  };
}

function video(overrides: Partial<DownloadedVideo> = {}): DownloadedVideo {
  return { base64: 'AAAA', mimeType: 'video/mp4', bytes: 4, downscaled: false, ...overrides };
}

function makeMedia(meta = metadata(), clip = video()): IMediaFetcher {
  return {
    fetchMetadata: vi.fn().mockResolvedValue(meta),
    downloadVideo: vi.fn().mockResolvedValue(clip),
  };
}

function makeAi(...responses: AnnotatedExtraction[]): IAIService {
  const extractRecipeAnnotated = vi.fn();
  for (const r of responses) extractRecipeAnnotated.mockResolvedValueOnce(r);
  return { extractRecipeAnnotated } as unknown as IAIService;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VideoRecipeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('stage 1 suffices', () => {
    it('returns the caption extraction without downloading the video', async () => {
      const media = makeMedia();
      const ai = makeAi(annotated());
      const result = await new VideoRecipeService(ai, media).extract('https://ig/reel/x');

      expect(result.stage).toBe('caption');
      expect(result.escalationReason).toBeNull();
      expect(media.downloadVideo).not.toHaveBeenCalled();
      expect(ai.extractRecipeAnnotated).toHaveBeenCalledTimes(1);
      // The cheap stage must never be handed the clip.
      expect(ai.extractRecipeAnnotated).toHaveBeenCalledWith({ text: CAPTION });
    });

    it('carries provenance through', async () => {
      const result = await new VideoRecipeService(makeAi(annotated()), makeMedia()).extract(
        'https://ig/reel/x',
      );
      expect(result.sourceUrl).toBe('https://www.instagram.com/reel/ABC123/');
      expect(result.creator).toBe('hunt4shredz');
      expect(result.captionChars).toBe(CAPTION.length);
    });
  });

  describe('escalation to stage 2', () => {
    it('escalates when the caption carries no method', async () => {
      // The measured real-world case: captions list ingredients, not steps.
      const media = makeMedia();
      const ai = makeAi(annotated({ recipe: recipe({ instructions: [] }) }), annotated());
      const result = await new VideoRecipeService(ai, media).extract('https://ig/reel/x');

      expect(result.stage).toBe('video');
      expect(result.escalationReason).toContain('0 instruction(s)');
      expect(media.downloadVideo).toHaveBeenCalledOnce();
      expect(ai.extractRecipeAnnotated).toHaveBeenLastCalledWith({
        videoBase64: 'AAAA',
        mimeType: 'video/mp4',
        text: CAPTION, // the caption rides along — it holds the quantities
      });
    });

    it('escalates on low confidence', async () => {
      const ai = makeAi(annotated({ confidence: 'low' }), annotated());
      const result = await new VideoRecipeService(ai, makeMedia()).extract('https://ig/reel/x');
      expect(result.stage).toBe('video');
      expect(result.escalationReason).toBe('low confidence from the caption alone');
    });

    it('escalates when the caption holds no recipe at all', async () => {
      const ai = makeAi(annotated({ recipe: recipe({ name: 'NO_RECIPE_FOUND' }) }), annotated());
      const result = await new VideoRecipeService(ai, makeMedia()).extract('https://ig/reel/x');
      expect(result.escalationReason).toBe('no recipe found in the caption');
    });

    it('skips stage 1 entirely when there is no usable caption', async () => {
      const media = makeMedia(metadata({ caption: '#food #viral' }));
      const ai = makeAi(annotated());
      const result = await new VideoRecipeService(ai, media).extract('https://ig/reel/x');

      expect(result.escalationReason).toBe('no usable caption');
      // One call, not two — no tokens wasted on a hashtag dump.
      expect(ai.extractRecipeAnnotated).toHaveBeenCalledTimes(1);
      expect(result.stage).toBe('video');
    });
  });

  describe('stage-2 output handling', () => {
    it("rewrites video names to the caption stage's cleaner wording", async () => {
      const captionStage = annotated({
        recipe: recipe({
          instructions: [],
          ingredients: [
            { name: 'eggs', quantity: 2, unit: 'piece' },
            { name: 'garlic', quantity: 2, unit: 'clove' },
          ],
        }),
      });
      const videoStage = annotated({
        recipe: recipe({
          ingredients: [
            { name: 'large eggs', quantity: 2, unit: 'piece' },
            { name: 'garlic cloves, minced', quantity: 2, unit: 'clove' },
          ],
        }),
      });
      const result = await new VideoRecipeService(
        makeAi(captionStage, videoStage),
        makeMedia(),
      ).extract('https://ig/reel/x');

      expect(result.recipe.ingredients.map((i) => i.name)).toEqual(['eggs', 'garlic']);
      expect(result.renames).toHaveLength(2);
    });

    it('flags a re-encoded clip for the reviewer', async () => {
      const ai = makeAi(annotated({ recipe: recipe({ instructions: [] }) }), annotated());
      const media = makeMedia(metadata(), video({ downscaled: true }));
      const result = await new VideoRecipeService(ai, media).extract('https://ig/reel/x');
      expect(result.assumptions.some((a) => a.includes('re-encoded'))).toBe(true);
    });

    it('caps confidence and flags the draft when servings were derived', async () => {
      // CAPTION states "per serving", never a yield — the model still says
      // "high", so the service must override it.
      const ai = makeAi(annotated({ recipe: recipe({ instructions: [] }) }), annotated());
      const result = await new VideoRecipeService(ai, makeMedia()).extract('https://ig/reel/x');

      expect(result.confidence).toBe('medium');
      expect(result.assumptions.some((a) => a.includes('NOT stated'))).toBe(true);
    });

    it('trusts the model when the caption states a yield', async () => {
      const media = makeMedia(metadata({ caption: `${CAPTION}\nServes 4` }));
      const ai = makeAi(annotated({ recipe: recipe({ instructions: [] }) }), annotated());
      const result = await new VideoRecipeService(ai, media).extract('https://ig/reel/x');

      expect(result.confidence).toBe('high');
      expect(result.assumptions.some((a) => a.includes('NOT stated'))).toBe(false);
    });

    it('rejects a video with no recipe in it', async () => {
      const ai = makeAi(
        annotated({ recipe: recipe({ instructions: [] }) }),
        annotated({ recipe: recipe({ name: 'NO_RECIPE_FOUND' }) }),
      );
      await expect(
        new VideoRecipeService(ai, makeMedia()).extract('https://ig/reel/x'),
      ).rejects.toThrow(TRPCError);
    });
  });
});
