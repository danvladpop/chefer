import { TRPCError } from '@trpc/server';
import type { VideoPlatform, VideoTranscriptSource } from '@chefer/types';
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
  buildTranscriptText,
  capConfidence,
  captionStatesServings,
  DERIVED_SERVINGS_NOTE,
  VideoImportError,
  type IVideoTranscriber,
  type VideoImportErrorCode,
  type VideoTranscript,
} from '../../lib/video-import/index.js';

// ─── Video link → recipe, from the video's WORDS ─────────────────────────────
// One pipeline for both consumers:
//   - the in-app import (recipe.importVideoPreview → the review form), and
//   - the offline curated-dataset tool (`pnpm recipes:from-video`).
//
// The transcriber (lib/video-import) turns the link into text — the caption,
// else subtitles, else a Whisper transcript of the audio — and that text goes
// through the ordinary TEXT extraction (importText route, any provider). No
// model ever receives video frames or audio: the Gemini video path is gone
// (owner decision 2026-09-26).
//
// extractRecipeAnnotated, not extractRecipe: its prompt licenses an EMPTY
// method when the words hold none, instead of reconstructing plausible steps
// from cooking knowledge — so a gap shows up as "not found — please add" in
// the form rather than as invented instructions.
//
// This service extracts only — it does not persist.

export interface VideoRecipeResult {
  recipe: ExtractedRecipe;
  /** Which words the recipe was read from. */
  stage: VideoTranscriptSource;
  confidence: ExtractionConfidence;
  /** What the model inferred — the reviewer's checklist. */
  assumptions: string[];
  /** Canonical post URL, stored as Recipe.sourceUrl. */
  sourceUrl: string;
  platform: VideoPlatform;
  title: string;
  creator: string | null;
  thumbnailUrl: string | null;
  captionChars: number;
  transcriptChars: number;
  /** The exact text the extractor read; the "not found" checks run on it. */
  sourceText: string;
}

const TRPC_CODE: Record<VideoImportErrorCode, TRPCError['code']> = {
  UNSUPPORTED_SITE: 'BAD_REQUEST',
  PRIVATE: 'BAD_REQUEST',
  NOT_FOUND: 'BAD_REQUEST',
  TOO_LONG: 'BAD_REQUEST',
  TOO_LARGE: 'BAD_REQUEST',
  NO_SPEECH: 'BAD_REQUEST',
  FAILED: 'BAD_REQUEST',
  TIMEOUT: 'TIMEOUT',
  BLOCKED: 'SERVICE_UNAVAILABLE',
  UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};

/** VideoImportError → a TRPCError carrying only the friendly sentence. */
export function toVideoTrpcError(error: VideoImportError): TRPCError {
  console.warn(`[video-import] ${error.code}: ${error.detail ?? ''}`);
  // No `cause`: the formatter would treat message === cause.message as an
  // unexpected error and replace the friendly copy.
  return new TRPCError({ code: TRPC_CODE[error.code], message: error.message });
}

export const NO_RECIPE_IN_VIDEO_MESSAGE =
  "We couldn't find a recipe in that video's caption, subtitles or speech. You can paste the recipe text instead.";

export class VideoRecipeService {
  private transcriberInstance: IVideoTranscriber | null;

  constructor(
    private readonly ai: IAIService = aiService,
    transcriber?: IVideoTranscriber,
  ) {
    this.transcriberInstance = transcriber ?? null;
  }

  /**
   * Built on first use, and the env-reading factory imported lazily, so that
   * importing this module (every router/service test does, transitively)
   * never needs the API's env.
   */
  private async transcriber(): Promise<IVideoTranscriber> {
    if (!this.transcriberInstance) {
      const { createVideoTranscriber } = await import('../../lib/video-import/factory.js');
      this.transcriberInstance = createVideoTranscriber();
    }
    return this.transcriberInstance;
  }

  async extract(url: string): Promise<VideoRecipeResult> {
    let transcript: VideoTranscript;
    try {
      transcript = await (await this.transcriber()).transcribe(url);
    } catch (error) {
      if (error instanceof VideoImportError) throw toVideoTrpcError(error);
      throw error;
    }

    const sourceText = buildTranscriptText(transcript);
    let extraction: AnnotatedExtraction;
    try {
      extraction = await this.ai.extractRecipeAnnotated({ text: sourceText });
    } catch (error) {
      throw toFriendlyAiError(
        error,
        'videoImport.extract',
        "We couldn't read a recipe out of that video.",
      );
    }

    const { recipe } = extraction;
    const named = recipe.name.trim() !== '' && recipe.name.trim() !== NO_RECIPE_SENTINEL;
    if (!named && recipe.ingredients.length === 0 && recipe.instructions.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: NO_RECIPE_IN_VIDEO_MESSAGE });
    }

    const servings = gradeServings(sourceText, extraction);
    return {
      recipe: { ...recipe, name: named ? recipe.name.trim() : '' },
      stage: transcript.source,
      confidence: servings.confidence,
      assumptions: servings.assumptions,
      sourceUrl: transcript.sourceUrl,
      platform: transcript.platform,
      title: transcript.title,
      creator: transcript.creator,
      thumbnailUrl: transcript.thumbnailUrl,
      captionChars: transcript.caption.length,
      transcriptChars: transcript.transcript?.length ?? 0,
      sourceText,
    };
  }
}

/**
 * Caps confidence and flags the draft when the serving count was derived
 * rather than read. The model reports "high" even when it guessed, so this is
 * decided from the source text instead of from what the model claims.
 */
function gradeServings(
  sourceText: string,
  extraction: AnnotatedExtraction,
): { confidence: ExtractionConfidence; assumptions: string[] } {
  if (captionStatesServings(sourceText)) {
    return { confidence: extraction.confidence, assumptions: extraction.assumptions };
  }
  return {
    confidence: capConfidence(extraction.confidence, 'medium'),
    assumptions: [...extraction.assumptions, DERIVED_SERVINGS_NOTE],
  };
}

export const videoRecipeService = new VideoRecipeService();
