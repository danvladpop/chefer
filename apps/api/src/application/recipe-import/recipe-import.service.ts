import { TRPCError } from '@trpc/server';
import {
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  householdMemberRepository,
  prisma,
  type IDietaryPreferencesRepository,
  type IFavouriteRecipeRepository,
  type Recipe,
} from '@chefer/database';
import type {
  UserProfile,
  VideoDraftField,
  VideoPlatform,
  VideoTranscriptSource,
} from '@chefer/types';
import { householdPortionSum } from '@chefer/utils';
import { toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type {
  CheferizedRecipe,
  ExtractedRecipe,
  IAIService,
  RecipeChange,
  RecipeData,
  RecipeExtractionSource,
} from '../../lib/ai/index.js';
import { NO_RECIPE_SENTINEL } from '../../lib/ai/prompts.js';
import {
  findSafetyIssues as findRecipeSafetyIssues,
  type SafetyPrefs,
} from '../../lib/curated-recipes/safety.js';
import { buildPollinationsUrl } from '../../lib/image-gen/pollinations.js';
import { buildRecipeImagePrompt } from '../../lib/image-gen/prompt.js';
import { normalizeIngredientName } from '../../lib/ingredient-prices/index.js';
import { reserveRecipeImport } from '../../lib/quotas.js';
import {
  crossCheckMacros,
  extractPageContent,
  fetchRecipePage,
  headCheckImage,
  type MacroCheckResult,
} from '../../lib/recipe-import/index.js';
import {
  DERIVED_SERVINGS_NOTE,
  findNotFoundFields,
  unverifiedQuantityIndexes,
} from '../../lib/video-import/index.js';
import { mergeHouseholdSafety } from '../household/household.service.js';
import {
  videoRecipeService,
  type VideoRecipeService,
} from '../video-import/video-recipe.service.js';

// ─── Cheferize Anything (F5) — recipe import service ─────────────────────────
// Extract (URL/text/photo) → Cheferize (adapt to the user) → save into the
// personal collection. Copyright stance: personal-collection only — imports
// keep their sourceUrl provenance, are owned by the importing user, are never
// served to other users, and no full page text is stored or republished.
//
// SAFETY: the AI's adapted output is never trusted. The P1-2 allergen matcher
// re-validates it here, and importSave re-runs the check on whatever the
// client submits as "adapted" — the "AI missed the peanut" case fails closed.

export type ImportVia = 'url' | 'photo' | 'text';

export interface ImportSafety {
  /** True when the adapted recipe passed the P1-2 matcher re-validation. */
  ok: boolean;
  /** The safety terms that still match the adapted recipe (fail-closed evidence). */
  issues: string[];
}

export interface ImportPreview {
  via: ImportVia;
  original: ExtractedRecipe;
  adapted: ExtractedRecipe;
  changes: RecipeChange[];
  safety: ImportSafety;
  macroCheck: MacroCheckResult;
  sourceUrl: string | null;
  ogImageUrl: string | null;
}

/**
 * Video-link import (owner decision 2026-09-26): a DRAFT read from the video's
 * words for the user to review, correct and complete in a form — no Cheferize
 * pass, no diff. Saved through importSave as the `original` variant.
 */
export interface VideoImportPreview {
  via: 'video';
  /** The extraction; `name`, `ingredients` or `instructions` may be empty. */
  draft: ExtractedRecipe;
  /** Fields the video's words did not cover — "not found — please add". */
  notFound: VideoDraftField[];
  /** Ingredient indexes whose amount appears nowhere in the words. */
  unverifiedQuantities: number[];
  /** What the model inferred ("a drizzle" read as 1 tbsp). */
  assumptions: string[];
  transcriptSource: VideoTranscriptSource;
  /** The draft vs the household's allergies/restrictions (warning only). */
  safety: ImportSafety;
  platform: VideoPlatform;
  sourceUrl: string;
  /** The video thumbnail (YouTube only — TikTok/Instagram CDN links expire). */
  ogImageUrl: string | null;
  videoTitle: string;
  creator: string | null;
}

export interface ImportSaveInput {
  recipe: ExtractedRecipe;
  variant: 'original' | 'adapted';
  sourceUrl?: string | null | undefined;
  ogImageUrl?: string | null | undefined;
}

/** ExtractedRecipe → RecipeData shim so the P1-2 matcher can run on it. */
function toRecipeData(recipe: ExtractedRecipe): RecipeData {
  return { ...recipe, id: 'import-preview', imageUrl: null };
}

/**
 * Lists which of the user's safety terms still match the recipe, so the UI
 * can say WHAT survived (shared matcher: curated-recipes/safety.ts).
 */
export function findSafetyIssues(recipe: ExtractedRecipe, prefs: SafetyPrefs): string[] {
  return findRecipeSafetyIssues(toRecipeData(recipe), prefs);
}

/** Clamps AI output to the lengths the recipe form/DB expect. */
function sanitizeExtracted(recipe: ExtractedRecipe): ExtractedRecipe {
  const clampNum = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(v)));
  return {
    name: recipe.name.trim().slice(0, 120),
    description: recipe.description.trim().slice(0, 500) || 'Imported recipe.',
    ingredients: recipe.ingredients.slice(0, 40).map((i) => ({
      name: i.name.trim().slice(0, 80),
      quantity: Math.max(0.01, Math.round(i.quantity * 100) / 100),
      unit: i.unit.trim().slice(0, 20) || 'piece',
    })),
    instructions: recipe.instructions.slice(0, 30).map((s) => s.trim().slice(0, 500)),
    nutritionInfo: {
      calories: clampNum(recipe.nutritionInfo.calories, 0, 5000),
      protein: clampNum(recipe.nutritionInfo.protein, 0, 500),
      carbs: clampNum(recipe.nutritionInfo.carbs, 0, 1000),
      fat: clampNum(recipe.nutritionInfo.fat, 0, 500),
      fiber: clampNum(recipe.nutritionInfo.fiber, 0, 200),
    },
    cuisineType: recipe.cuisineType.trim().slice(0, 60) || 'International',
    dietaryTags: recipe.dietaryTags.slice(0, 10).map((t) => t.trim().toLowerCase().slice(0, 30)),
    prepTimeMins: clampNum(recipe.prepTimeMins, 0, 24 * 60),
    cookTimeMins: clampNum(recipe.cookTimeMins, 0, 24 * 60),
    servings: clampNum(recipe.servings, 1, 20),
  };
}

export class RecipeImportService {
  constructor(
    private readonly ai: IAIService = aiService,
    private readonly recipeRepo: IFavouriteRecipeRepository = favouriteRecipeRepository,
    private readonly prefsRepo: IDietaryPreferencesRepository = dietaryPreferencesRepository,
    /** Household members (P2-3): their safety + the table's servings. */
    private readonly householdRepo: {
      findByUserId(userId: string): Promise<
        {
          portionFactor: number;
          allergies: string[];
          dietaryRestrictions: string[];
        }[]
      >;
    } = householdMemberRepository,
    private readonly video: Pick<VideoRecipeService, 'extract'> = videoRecipeService,
  ) {}

  /**
   * Extraction + Cheferize preview. Metered per `recipeImportsPerDay` with
   * an atomic reservation that is refunded when the preview fails (bad URL,
   * unreadable page, provider error), so a typo no longer burns the free
   * daily preview (audit F-REC-4-2). Free tier gets this once a day (§6.4
   * ghost state); the web UI blurs the diff for free users, and importSave
   * is premium-only.
   */
  async preview(user: UserProfile, source: RecipeExtractionSource): Promise<ImportPreview> {
    const reservation = await reserveRecipeImport(user);
    try {
      return await this.runPreview(user, source);
    } catch (err) {
      await reservation.release();
      throw err;
    }
  }

  private async runPreview(
    user: UserProfile,
    source: RecipeExtractionSource,
  ): Promise<ImportPreview> {
    let via: ImportVia;
    let extractionSource: RecipeExtractionSource;
    let sourceUrl: string | null = null;
    let ogImageUrl: string | null = null;

    if (source.url) {
      via = 'url';
      sourceUrl = source.url;
      const { html, finalUrl } = await fetchRecipePage(source.url);
      const content = extractPageContent(html, finalUrl);
      ogImageUrl = content.ogImageUrl;
      if (content.aiText.trim().length < 40) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That page has no readable content — paste the recipe text instead.',
        });
      }
      extractionSource = { url: source.url, text: content.aiText };
    } else if (source.imageBase64) {
      via = 'photo';
      extractionSource = {
        imageBase64: source.imageBase64,
        mimeType: source.mimeType ?? 'image/jpeg',
      };
    } else if (source.text) {
      via = 'text';
      extractionSource = { text: source.text };
    } else {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Provide a URL, pasted text, or a photo to import.',
      });
    }

    // Upstream AI failures (free-tier 429s, timeouts) surface as one friendly
    // sentence, never the raw provider blob (§4.5.2) — raw error in the log.
    let rawExtracted: ExtractedRecipe;
    try {
      rawExtracted = await this.ai.extractRecipe(extractionSource);
    } catch (err) {
      throw toFriendlyAiError(
        err,
        'extractRecipe',
        "The chef couldn't read that recipe — please try again.",
      );
    }
    if (rawExtracted.name.trim() === NO_RECIPE_SENTINEL || rawExtracted.ingredients.length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          via === 'url'
            ? "Couldn't find a recipe on that page. Try the recipe's own page, or paste the text."
            : "Couldn't find a recipe in that content.",
      });
    }
    const original = sanitizeExtracted(rawExtracted);

    const [prefs, members] = await Promise.all([
      this.prefsRepo.findByUserId(user.id),
      this.householdRepo.findByUserId(user.id),
    ]);
    // The whole table's allergies and restrictions — an imported recipe must
    // be safe for everyone the user cooks for (P2-3: member safety is free).
    const safetyPrefs: SafetyPrefs = mergeHouseholdSafety(
      {
        allergies: prefs?.allergies ?? [],
        dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
        dislikedIngredients: prefs?.dislikedIngredients ?? [],
      },
      members,
    );
    // One people model (audit F-PM-8): servings come from the household,
    // never the legacy serving-size setting. Solo users get one serving.
    const targetServings = householdPortionSum(members);

    let cheferized: CheferizedRecipe;
    try {
      cheferized = await this.ai.cheferizeRecipe({
        recipe: original,
        targetServings,
        preferences: safetyPrefs,
      });
    } catch (err) {
      throw toFriendlyAiError(
        err,
        'cheferizeRecipe',
        "The chef couldn't adapt that recipe — please try again.",
      );
    }
    const adapted = sanitizeExtracted(cheferized.adapted);

    // AI output is never trusted for safety — re-validate with the P1-2
    // matcher. `ok: false` means an allergen/restriction survived the
    // adaptation; the UI shows a hard warning and importSave rejects it.
    const issues = findSafetyIssues(adapted, safetyPrefs);
    const safety: ImportSafety = { ok: issues.length === 0, issues };

    const macroCheck = await this.crossCheckAgainstVocabulary(original);

    return {
      via,
      original,
      adapted,
      changes: cheferized.changes.slice(0, 20),
      safety,
      macroCheck,
      sourceUrl,
      ogImageUrl,
    };
  }

  /**
   * Video link → reviewable draft. Premium-only like every AI import (the
   * RECIPE_IMPORT quota is FORBIDDEN for free), metered on the same daily
   * reservation and refunded when the video cannot be read.
   */
  async previewVideo(user: UserProfile, url: string): Promise<VideoImportPreview> {
    const reservation = await reserveRecipeImport(user);
    try {
      return await this.runVideoPreview(user, url);
    } catch (err) {
      await reservation.release();
      throw err;
    }
  }

  private async runVideoPreview(user: UserProfile, url: string): Promise<VideoImportPreview> {
    const result = await this.video.extract(url);
    const draft = sanitizeExtracted(result.recipe);

    const [prefs, members] = await Promise.all([
      this.prefsRepo.findByUserId(user.id),
      this.householdRepo.findByUserId(user.id),
    ]);
    const issues = findSafetyIssues(
      draft,
      mergeHouseholdSafety(
        {
          allergies: prefs?.allergies ?? [],
          dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
          dislikedIngredients: [], // dislikes are soft — never a warning here
        },
        members,
      ),
    );

    return {
      via: 'video',
      draft,
      notFound: findNotFoundFields(draft, result.sourceText),
      unverifiedQuantities: unverifiedQuantityIndexes(draft.ingredients, result.sourceText),
      // The form flags an unstated serving count itself; the curated-pool
      // reviewer note would only repeat it.
      assumptions: result.assumptions.filter((a) => a !== DERIVED_SERVINGS_NOTE).slice(0, 10),
      transcriptSource: result.stage,
      safety: { ok: issues.length === 0, issues },
      platform: result.platform,
      sourceUrl: result.sourceUrl,
      ogImageUrl: result.platform === 'youtube' ? result.thumbnailUrl : null,
      videoTitle: result.title.slice(0, 200),
      creator: result.creator,
    };
  }

  /**
   * Saves an imported recipe into the user's collection (`source: MANUAL`,
   * provenance in `sourceUrl`). Saved imports are rateable and pinnable, so
   * they flow into P1-1 generation placement with zero extra work.
   *
   * Fail-closed: the adapted variant is re-validated against the CURRENT
   * safety prefs server-side — whatever the client sends, an allergen
   * violation is rejected.
   */
  async save(user: UserProfile, input: ImportSaveInput): Promise<Recipe> {
    const recipe = sanitizeExtracted(input.recipe);

    if (input.variant === 'adapted') {
      const [prefs, members] = await Promise.all([
        this.prefsRepo.findByUserId(user.id),
        this.householdRepo.findByUserId(user.id),
      ]);
      const issues = findSafetyIssues(
        recipe,
        mergeHouseholdSafety(
          {
            allergies: prefs?.allergies ?? [],
            dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
            dislikedIngredients: [], // dislikes are soft — they never block a save
          },
          members,
        ),
      );
      if (issues.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `The adapted recipe still conflicts with your preferences (${issues.join(', ')}). Save the original instead, or adjust the recipe.`,
        });
      }
    }

    // Image: the page's og:image when it actually serves one (HEAD-checked,
    // SSRF-guarded), otherwise the deterministic name-seeded Pollinations
    // pipeline — same dish, same URL, CDN-cached.
    let imageUrl: string;
    if (input.ogImageUrl && (await headCheckImage(input.ogImageUrl))) {
      imageUrl = input.ogImageUrl;
    } else {
      imageUrl = buildPollinationsUrl(
        buildRecipeImagePrompt(recipe.name, recipe.cuisineType),
        recipe.name,
        recipe.cuisineType,
      );
    }

    return this.recipeRepo.createManualRecipe(user.id, {
      ...recipe,
      ingredients: recipe.ingredients,
      nutritionInfo: recipe.nutritionInfo,
      imageUrl,
      sourceUrl: input.sourceUrl ?? null,
    });
  }

  /** Vocabulary lookup + pure cross-check (lib/recipe-import/macro-check). */
  private async crossCheckAgainstVocabulary(recipe: ExtractedRecipe): Promise<MacroCheckResult> {
    const names = [...new Set(recipe.ingredients.map((i) => normalizeIngredientName(i.name)))];
    const rows = await prisma.ingredientPrice.findMany({
      where: { ingredientName: { in: names } },
      select: {
        ingredientName: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        fiberPer100g: true,
        gramsPerPiece: true,
      },
    });
    return crossCheckMacros(recipe, rows);
  }
}

export const recipeImportService = new RecipeImportService();
