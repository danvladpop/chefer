import { TRPCError } from '@trpc/server';
import { toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type {
  AnnotatedExtraction,
  ExtractedRecipe,
  ExtractionConfidence,
  IAIService,
} from '../../lib/ai/index.js';
import { NO_RECIPE_SENTINEL } from '../../lib/ai/prompts.js';
import {
  capConfidence,
  captionStatesServings,
  DERIVED_SERVINGS_NOTE,
  reconcileIngredientNames,
  YtDlpMediaFetcher,
  type IMediaFetcher,
} from '../../lib/video-import/index.js';

// ─── Two-stage short-video recipe extractor ──────────────────────────────────
// Builds the CURATED recipe dataset from short cooking videos (Instagram reels,
// TikToks, YouTube Shorts).
//
// WHY TWO STAGES. Measured against real reels, the caption and the video carry
// different halves of a recipe:
//   - The caption carries the QUANTITIES, in clean prose. Extracting from it
//     costs ~550 input tokens and no bandwidth.
//   - The video carries the METHOD. Plenty of creators publish an ingredient
//     list with no steps at all, and the caption-only extraction then returns
//     ZERO instructions — which importRouter's `.min(1)` would reject outright.
//     Reading the clip costs ~20,000 input tokens and a ~15 MB download.
//
// So: always try the cheap stage, escalate only on a concrete signal. Recipes
// whose captions already contain the method never touch ffmpeg. The escalation
// rate over a batch is what sets the real cost per recipe at dataset scale, and
// `stage` is reported per result so that ratio is measurable rather than
// assumed.
//
// This service extracts only — it does not persist. Promotion into the shared
// pool (source=CURATED) goes through the review queue, because an unreviewed
// extraction that says "2 servings" when it means "3" silently corrupts every
// meal plan built on it.

/** Fewer real steps than this means the caption had no method worth keeping. */
const MIN_USABLE_INSTRUCTIONS = 2;

/** Below this a "caption" is a hashtag dump, not an ingredient list. */
const MIN_USABLE_CAPTION_CHARS = 40;

export type ExtractionStage = 'caption' | 'video';

export interface VideoRecipeResult {
  recipe: ExtractedRecipe;
  /** Which stage produced the returned recipe. */
  stage: ExtractionStage;
  confidence: ExtractionConfidence;
  /** What the model inferred — the reviewer's checklist. */
  assumptions: string[];
  /** Canonical post URL, stored as Recipe.sourceUrl. */
  sourceUrl: string;
  creator: string | null;
  captionChars: number;
  /** Why stage 2 ran, or null when the caption alone sufficed. */
  escalationReason: string | null;
  /** Ingredient names rewritten to the caption's cleaner wording. */
  renames: string[];
}

/** Null when the caption alone is enough; otherwise why the video is needed. */
function escalationReason(extraction: AnnotatedExtraction): string | null {
  const { recipe, confidence } = extraction;
  if (recipe.name === NO_RECIPE_SENTINEL) return 'no recipe found in the caption';
  if (recipe.instructions.length < MIN_USABLE_INSTRUCTIONS) {
    return `caption had ${recipe.instructions.length} instruction(s) — the method is only in the video`;
  }
  if (confidence === 'low') return 'low confidence from the caption alone';
  if (recipe.ingredients.length === 0) return 'caption listed no ingredients';
  return null;
}

export class VideoRecipeService {
  constructor(
    private readonly ai: IAIService = aiService,
    private readonly media: IMediaFetcher = new YtDlpMediaFetcher(),
  ) {}

  /**
   * URL → recipe, escalating from caption to video only when the caption
   * cannot carry the recipe on its own.
   */
  async extract(url: string): Promise<VideoRecipeResult> {
    const meta = await this.media.fetchMetadata(url);
    const base = {
      sourceUrl: meta.sourceUrl,
      creator: meta.creator,
      captionChars: meta.caption.length,
    };

    // ── Stage 1: caption only ────────────────────────────────────────────────
    let captionStage: AnnotatedExtraction | null = null;
    let reason: string;

    if (meta.caption.length < MIN_USABLE_CAPTION_CHARS) {
      reason = 'no usable caption';
    } else {
      captionStage = await this.run('videoImport.caption', () =>
        this.ai.extractRecipeAnnotated({ text: meta.caption }),
      );
      const verdict = escalationReason(captionStage);
      if (verdict === null) {
        const servings = this.gradeServings(meta.caption, captionStage);
        return {
          ...base,
          recipe: captionStage.recipe,
          stage: 'caption',
          confidence: servings.confidence,
          assumptions: servings.assumptions,
          escalationReason: null,
          renames: [],
        };
      }
      reason = verdict;
    }

    // ── Stage 2: the clip, with the caption alongside it ─────────────────────
    const video = await this.media.downloadVideo(url);
    const videoStage = await this.run('videoImport.video', () =>
      this.ai.extractRecipeAnnotated({
        videoBase64: video.base64,
        mimeType: video.mimeType,
        text: meta.caption,
      }),
    );

    if (videoStage.recipe.name === NO_RECIPE_SENTINEL) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "We couldn't find a recipe in that video.",
      });
    }

    // Stage 1's names are cleaner whenever it ran at all — see reconcile.ts.
    const { ingredients, renames } = reconcileIngredientNames(
      videoStage.recipe.ingredients,
      captionStage?.recipe.ingredients ?? [],
    );

    const servings = this.gradeServings(meta.caption, videoStage);
    const assumptions = [...servings.assumptions];
    if (video.downscaled) {
      assumptions.push(
        'Clip was re-encoded smaller before analysis; check any fine on-screen text.',
      );
    }

    return {
      ...base,
      recipe: { ...videoStage.recipe, ingredients },
      stage: 'video',
      confidence: servings.confidence,
      assumptions,
      escalationReason: reason,
      renames,
    };
  }

  /**
   * Caps confidence and flags the draft when the serving count was derived
   * rather than read. The model reports "high" even when it guessed, so this
   * is decided from the caption text instead of from what the model claims.
   */
  private gradeServings(
    caption: string,
    extraction: AnnotatedExtraction,
  ): { confidence: ExtractionConfidence; assumptions: string[] } {
    if (captionStatesServings(caption)) {
      return { confidence: extraction.confidence, assumptions: extraction.assumptions };
    }
    return {
      confidence: capConfidence(extraction.confidence, 'medium'),
      assumptions: [...extraction.assumptions, DERIVED_SERVINGS_NOTE],
    };
  }

  /** Maps provider capacity/quota failures to the shared friendly error. */
  private async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toFriendlyAiError(error, label, "We couldn't read a recipe out of that video.");
    }
  }
}

export const videoRecipeService = new VideoRecipeService();
