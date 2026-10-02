import { TRPCError } from '@trpc/server';
import {
  favouriteRecipeRepository,
  householdMemberRepository,
  toIngredientsMirror,
  type IFavouriteRecipeRepository,
  type Recipe,
} from '@chefer/database';
import type {
  NutritionStatus,
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
  findSafetyBlockers,
  type SafetyBlocker,
  type SafetyPrefs,
} from '../../lib/curated-recipes/safety.js';
import { buildPollinationsUrl } from '../../lib/image-gen/pollinations.js';
import { buildRecipeImagePrompt } from '../../lib/image-gen/prompt.js';
import { reserveRecipeImport } from '../../lib/quotas.js';
import {
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
import { moderationService, type ModerationService } from '../friends/moderation.service.js';
import { toRef, type CatalogIngredientRef } from '../ingredients/catalog-dto.js';
import {
  ingredientResolver,
  type IngredientResolver,
  type ResolveConfidence,
} from '../ingredients/ingredient-resolver.js';
import { ensurePrivateTwins } from '../ingredients/private-twins.js';
import {
  recipeNutritionService,
  type RecipeNutritionService,
  type SavedLineReport,
} from '../ingredients/recipe-nutrition.service.js';
import { markLatestImportSaved } from '../profile/ai-usage.service.js';
import { safetyService, type SafetyService } from '../safety/safety.service.js';
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
  /**
   * T-BUG-51 (copy half): the same conflicts, but naming the actual
   * ingredient line(s) responsible instead of only the allergy/diet label.
   */
  blockedBy?: SafetyBlocker[];
}

/**
 * One extracted line matched against the ingredient catalog (plan §6.2): the
 * review form shows unresolved lines with their candidates. Additive.
 */
export interface ImportLineResolution {
  rawName: string;
  unit: string;
  note: string | null;
  confidence: ResolveConfidence;
  match: CatalogIngredientRef | null;
  /** Fuzzy suggestions for an unmatched line — never applied without the user. */
  candidates: CatalogIngredientRef[];
  /** Edible grams computed for the line; null when it cannot be computed. */
  grams: number | null;
  problem?: SavedLineReport['problem'];
}

export interface ImportPreview {
  via: ImportVia;
  /** `nutritionInfo` is computed from the catalog, never the AI's numbers (I2). */
  original: ExtractedRecipe;
  adapted: ExtractedRecipe;
  changes: RecipeChange[];
  safety: ImportSafety;
  /**
   * Kept for installed clients. Now derived from the catalog computation:
   * `ok` when every adapted line computes, `unknown` otherwise; stated and
   * computed calories are the same computed number.
   */
  macroCheck: MacroCheckResult;
  sourceUrl: string | null;
  ogImageUrl: string | null;
  // ── Additive (plan-ingredient-catalog §6.2) ──
  resolution: { original: ImportLineResolution[]; adapted: ImportLineResolution[] };
  nutritionStatus: {
    original: Extract<NutritionStatus, 'COMPUTED' | 'PARTIAL'>;
    adapted: Extract<NutritionStatus, 'COMPUTED' | 'PARTIAL'>;
  };
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
  // ── Additive (plan-ingredient-catalog §6.2); `draft.nutritionInfo` is computed. ──
  resolution: ImportLineResolution[];
  nutritionStatus: Extract<NutritionStatus, 'COMPUTED' | 'PARTIAL'>;
}

/** An extracted line as the client sends it back, optionally picked from the catalog. */
export interface ImportSaveLine {
  name: string;
  quantity: number;
  unit: string;
  ingredientId?: string | undefined;
  note?: string | undefined;
  optional?: boolean | undefined;
}

export interface ImportSaveInput {
  recipe: Omit<ExtractedRecipe, 'ingredients'> & { ingredients: ImportSaveLine[] };
  variant: 'original' | 'adapted';
  sourceUrl?: string | null | undefined;
  ogImageUrl?: string | null | undefined;
  /**
   * New clients send it: false blocks a save whose lines don't all compute
   * (the review form must resolve them first); true saves it PARTIAL. Old
   * clients omit it and get PARTIAL rather than a blocked save.
   */
  acceptPartial?: boolean | undefined;
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
  // UX-REC-01: an imported recipe has no diet tags worth trusting — judge its ingredients.
  return findRecipeSafetyIssues(toRecipeData(recipe), prefs, { deriveFromIngredients: true });
}

/** T-BUG-51: builds the full ImportSafety payload (labels AND ingredients). */
function checkImportSafety(recipe: ExtractedRecipe, prefs: SafetyPrefs): ImportSafety {
  const data = toRecipeData(recipe);
  const derive = { deriveFromIngredients: true };
  const issues = findRecipeSafetyIssues(data, prefs, derive);
  const blockedBy = findSafetyBlockers(data, prefs, derive);
  return { ok: issues.length === 0, issues, blockedBy };
}

/** "peanut butter, walnuts (tree nuts)" — the copy half of T-BUG-51. */
export function describeSafetyBlockers(blockers: SafetyBlocker[]): string {
  return blockers
    .map((b) =>
      b.ingredients.length > 0
        ? `${b.ingredients.join(', ')} (${b.term})`
        : b.reason
          ? `${b.term}: ${b.reason}`
          : b.term,
    )
    .join('; ');
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
    /** T-01.2: the ONE safety context (owner + household merged, reported recipes). */
    private readonly safety: Pick<SafetyService, 'loadContext'> = safetyService,
    /** Household members (P2-3): the table's servings (portionFactor only). */
    private readonly householdRepo: {
      findByUserId(userId: string): Promise<{ portionFactor: number }[]>;
    } = householdMemberRepository,
    private readonly video: Pick<VideoRecipeService, 'extract'> = videoRecipeService,
    /** PRD §9.4 word filter on shared recipes (Following, plan §4.2 `recipe.importSave`). */
    private readonly moderation: Pick<ModerationService, 'checkRecipeText'> = moderationService,
    /** Catalog resolution + computed nutrition (plan-ingredient-catalog §6.2). */
    private readonly resolver: Pick<IngredientResolver, 'resolveMany'> = ingredientResolver,
    private readonly nutrition: Pick<
      RecipeNutritionService,
      'compute' | 'prepareSave'
    > = recipeNutritionService,
  ) {}

  /**
   * Matches an extracted recipe's lines against the catalog (with fuzzy
   * candidates for the review form) and computes its nutrition. The AI's own
   * numbers are replaced by the computed ones (I2).
   */
  private async resolveAndCompute(
    recipe: ExtractedRecipe,
    userId: string,
  ): Promise<{
    recipe: ExtractedRecipe;
    resolution: ImportLineResolution[];
    status: Extract<NutritionStatus, 'COMPUTED' | 'PARTIAL'>;
  }> {
    const resolved = await this.resolver.resolveMany(
      recipe.ingredients.map((i) => ({ rawName: i.name, unit: i.unit })),
      userId,
    );
    const { result } = await this.nutrition.compute(
      recipe.ingredients.map((i, k) => ({
        ingredientId: resolved[k]?.match?.id ?? null,
        rawName: i.name,
        quantity: i.quantity,
        unit: i.unit,
      })),
      userId,
      recipe.servings,
    );
    const resolution = resolved.map((r, k): ImportLineResolution => {
      const line = result.lines[k];
      return {
        rawName: r.rawName,
        unit: r.unit,
        note: r.note,
        confidence: r.confidence,
        match: r.match ? toRef(r.match, userId) : null,
        candidates: r.candidates.map((c) => toRef(c, userId)),
        grams: line?.grams ?? null,
        ...(line?.problem ? { problem: line.problem } : {}),
      };
    });
    return {
      recipe: { ...recipe, nutritionInfo: result.perServing },
      resolution,
      status: result.status,
    };
  }

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

    // T-01.2: the whole table's allergies and restrictions — an imported
    // recipe must be safe for everyone the user cooks for (P2-3: member
    // safety is free) — via the ONE SafetyService context.
    const [ctx, members] = await Promise.all([
      this.safety.loadContext(user.id),
      this.householdRepo.findByUserId(user.id),
    ]);
    const safetyPrefs = ctx.prefs;
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
    const safety = checkImportSafety(adapted, safetyPrefs);

    await ensurePrivateTwins(user.id);
    const [orig, adapt] = await Promise.all([
      this.resolveAndCompute(original, user.id),
      this.resolveAndCompute(adapted, user.id),
    ]);
    const matched = adapt.resolution.filter((r) => r.problem === undefined).length;
    const macroCheck: MacroCheckResult = {
      status: adapt.status === 'COMPUTED' ? 'ok' : 'unknown',
      computedCaloriesPerServing: adapt.recipe.nutritionInfo.calories,
      statedCaloriesPerServing: adapt.recipe.nutritionInfo.calories,
      matchedLines: matched,
      totalLines: adapt.resolution.length,
    };

    return {
      via,
      original: orig.recipe,
      adapted: adapt.recipe,
      changes: cheferized.changes.slice(0, 20),
      safety,
      macroCheck,
      sourceUrl,
      ogImageUrl,
      resolution: { original: orig.resolution, adapted: adapt.resolution },
      nutritionStatus: { original: orig.status, adapted: adapt.status },
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
    await ensurePrivateTwins(user.id);
    const computed = await this.resolveAndCompute(sanitizeExtracted(result.recipe), user.id);
    const draft = computed.recipe;

    const ctx = await this.safety.loadContext(user.id);
    // Dislikes are soft — never a warning on the video draft either.
    const safety = checkImportSafety(draft, { ...ctx.prefs, dislikedIngredients: [] });

    return {
      via: 'video',
      draft,
      notFound: findNotFoundFields(draft, result.sourceText),
      unverifiedQuantities: unverifiedQuantityIndexes(draft.ingredients, result.sourceText),
      // The form flags an unstated serving count itself; the curated-pool
      // reviewer note would only repeat it.
      assumptions: result.assumptions.filter((a) => a !== DERIVED_SERVINGS_NOTE).slice(0, 10),
      transcriptSource: result.stage,
      safety,
      platform: result.platform,
      sourceUrl: result.sourceUrl,
      ogImageUrl: result.platform === 'youtube' ? result.thumbnailUrl : null,
      videoTitle: result.title.slice(0, 200),
      creator: result.creator,
      resolution: computed.resolution,
      nutritionStatus: computed.status,
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
  async save(
    user: UserProfile,
    input: ImportSaveInput,
  ): Promise<Recipe & { lines: SavedLineReport[] }> {
    const recipe = sanitizeExtracted(input.recipe);

    // PRD §9.4: the same word filter as recipe.create/update — only for an
    // author who shares recipes on Following (BAD_REQUEST + textRejected
    // otherwise). First, so a rejected import touches nothing else.
    await this.moderation.checkRecipeText(user.id, {
      name: recipe.name,
      description: recipe.description,
    });

    // T-BUG-X3 (folded into T-01.2): both variants are checked now — the
    // `original` variant's check used to be skipped entirely. The result is
    // never a block for `original` ("saving a conflicting recipe stays
    // allowed but it is never auto-placed" — §2.1); `adapted` still rejects,
    // fail-closed, with the ingredient-naming copy from T-BUG-51.
    const ctx = await this.safety.loadContext(user.id);
    // Dislikes are soft — they never block a save on either variant.
    const savePrefs = { ...ctx.prefs, dislikedIngredients: [] };
    const safety = checkImportSafety(recipe, savePrefs);

    if (input.variant === 'adapted' && !safety.ok) {
      const detail = describeSafetyBlockers(safety.blockedBy ?? []);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `The adapted recipe still contains ${detail || safety.issues.join(', ')}. Save the original instead, or adjust the recipe.`,
      });
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

    // Nutrition is computed from the lines (plan §6.2): the client's — and the
    // AI's — numbers are dropped, never stored as USER_ENTERED (I2). Picked
    // catalog ids survive sanitizing by position.
    const prepared = await this.nutrition.prepareSave(
      user.id,
      recipe.ingredients.map((line, k) => {
        const sent = input.recipe.ingredients[k];
        return {
          ...line,
          ingredientId: sent?.ingredientId,
          note: sent?.note,
          optional: sent?.optional,
        };
      }),
      recipe.servings,
    );
    if (prepared.nutrition.status !== 'COMPUTED' && input.acceptPartial === false) {
      const missing = prepared.report.filter((l) => l.problem).map((l) => l.name);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Some ingredients have no nutrition data yet: ${missing.join(', ')}. Pick a match for each, or save with incomplete nutrition.`,
      });
    }

    const saved = await this.recipeRepo.createManualRecipe(
      user.id,
      {
        ...recipe,
        ingredients: toIngredientsMirror(prepared.lines),
        nutritionInfo: prepared.nutrition.perServing,
        imageUrl,
        sourceUrl: input.sourceUrl ?? null,
      },
      { lines: prepared.lines, nutrition: prepared.nutrition },
    );
    // T-10.8: the import's AI cost is its preview (already reserved); this
    // only lets Profile say how many of today's previews were saved.
    await markLatestImportSaved(user.id);
    return { ...saved, lines: prepared.report };
  }
}

export const recipeImportService = new RecipeImportService();
