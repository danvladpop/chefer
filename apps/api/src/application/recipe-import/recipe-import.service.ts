import { TRPCError } from '@trpc/server';
import {
  AiCallType,
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  prisma,
  type IDietaryPreferencesRepository,
  type IFavouriteRecipeRepository,
  type Recipe,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
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
import { isRecipeSafe, type SafetyPrefs } from '../../lib/curated-recipes/safety.js';
import { buildPollinationsUrl } from '../../lib/image-gen/pollinations.js';
import { buildRecipeImagePrompt } from '../../lib/image-gen/prompt.js';
import { normalizeIngredientName } from '../../lib/ingredient-prices/index.js';
import { assertRecipeImportQuota } from '../../lib/quotas.js';
import {
  crossCheckMacros,
  extractPageContent,
  fetchRecipePage,
  headCheckImage,
  type MacroCheckResult,
} from '../../lib/recipe-import/index.js';

// ─── Cheferize Anything (F5) — recipe import service ─────────────────────────
// Extract (URL/text/photo) → Cheferize (adapt to the user) → save into the
// personal collection. Copyright stance: personal-collection only — imports
// keep their sourceUrl provenance, are owned by the importing user, are never
// served to other users, and no full page text is stored or republished.
//
// SAFETY: the AI's adapted output is never trusted. The P1-2 allergen matcher
// re-validates it here, and importSave re-runs the check on whatever the
// client submits as "adapted" — the "AI missed the peanut" case fails closed.

const NO_RECIPE_SENTINEL = 'NO_RECIPE_FOUND';

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
 * Lists which of the user's safety terms still match the recipe — the
 * matcher's boolean, decomposed per term so the UI can say WHAT survived.
 */
export function findSafetyIssues(recipe: ExtractedRecipe, prefs: SafetyPrefs): string[] {
  const data = toRecipeData(recipe);
  const issues: string[] = [];
  for (const allergy of prefs.allergies) {
    if (
      !isRecipeSafe(data, {
        allergies: [allergy],
        dietaryRestrictions: [],
        dislikedIngredients: [],
      })
    ) {
      issues.push(allergy);
    }
  }
  for (const restriction of prefs.dietaryRestrictions) {
    if (
      !isRecipeSafe(data, {
        allergies: [],
        dietaryRestrictions: [restriction],
        dislikedIngredients: [],
      })
    ) {
      issues.push(restriction);
    }
  }
  return issues;
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
  ) {}

  /**
   * Extraction + Cheferize preview. Metered per `recipeImportsPerDay`
   * (attempts, not successes — the AiCallLog row is written before the AI
   * calls, mirroring ChatService). Free tier gets this once a day (§6.4
   * ghost state); the web UI blurs the diff for free users, and importSave
   * is premium-only.
   */
  async preview(user: UserProfile, source: RecipeExtractionSource): Promise<ImportPreview> {
    await assertRecipeImportQuota(user);
    await prisma.aiCallLog.create({
      data: { userId: user.id, callType: AiCallType.RECIPE_IMPORT },
    });

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

    const prefs = await this.prefsRepo.findByUserId(user.id);
    const safetyPrefs: SafetyPrefs = {
      allergies: prefs?.allergies ?? [],
      dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
      dislikedIngredients: prefs?.dislikedIngredients ?? [],
    };
    const targetServings = prefs?.servingSize ?? original.servings;

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
      const prefs = await this.prefsRepo.findByUserId(user.id);
      const issues = findSafetyIssues(recipe, {
        allergies: prefs?.allergies ?? [],
        dietaryRestrictions: prefs?.dietaryRestrictions ?? [],
        dislikedIngredients: [], // dislikes are soft — they never block a save
      });
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
