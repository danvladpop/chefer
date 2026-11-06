import { createHash } from 'node:crypto';
import {
  recipeTranslationRepository,
  type IRecipeTranslationRepository,
  type RecipeTranslation,
  type TranslatableRecipe,
} from '@chefer/database';
import type { SupportedLocale } from '@chefer/types';
import type { IAIService, RecipeTranslationDraft } from '../../lib/ai/types.js';

// ─── Recipe translations (Lane J phase 3, ADR 0004) ───────────────────────────
// Curated recipes are written in English. A RecipeTranslation row carries one
// recipe's display text in another language; readers of that language see it
// in place of the English, and everyone else (or a reader whose translation is
// missing or out of date) sees the English. Only display text is swapped, and
// only in the DTOs a reader gets: the Recipe row, and every name-based rule on
// it (plan matching, leftovers, shopping-list grouping), stays English.
//
// The pipeline (`pnpm recipes:translate`) drafts translations with the AI and
// marks them MACHINE_DRAFT; a person reviews them and marks them REVIEWED.
// Drafts are shown to readers too — a reviewed English fallback is not better
// for someone who reads Romanian — and the review sheet lists what is left.

/** The English text a translation is made from. */
export type RecipeSourceText = {
  name: string;
  description: string;
  instructions: string[];
  ingredientNames: string[];
};

/** Ingredient display names from Recipe.ingredients (Json `{ name, … }[]`). */
export function ingredientNamesOf(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.map((line) =>
    line !== null &&
    typeof line === 'object' &&
    typeof (line as { name?: unknown }).name === 'string'
      ? (line as { name: string }).name
      : '',
  );
}

export function sourceTextOf(recipe: TranslatableRecipe): RecipeSourceText {
  return {
    name: recipe.name,
    description: recipe.description,
    instructions: recipe.instructions,
    ingredientNames: ingredientNamesOf(recipe.ingredients),
  };
}

/** sha256 of the English — a translation is current while this still matches. */
export function recipeSourceHash(source: RecipeSourceText): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        source.name,
        source.description,
        source.instructions,
        source.ingredientNames,
      ]),
    )
    .digest('hex');
}

/** Romanian must use ș/ț with a comma below; models still emit the cedilla forms. */
function fixRomanianDiacritics(text: string): string {
  return text.replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț');
}

function normaliseDraft(
  locale: SupportedLocale,
  draft: RecipeTranslationDraft,
): RecipeTranslationDraft {
  if (locale !== 'ro') return draft;
  return {
    name: fixRomanianDiacritics(draft.name),
    description: fixRomanianDiacritics(draft.description),
    instructions: draft.instructions.map(fixRomanianDiacritics),
    ingredientNames: draft.ingredientNames.map(fixRomanianDiacritics),
  };
}

/** Any recipe-shaped DTO: only the display fields it actually carries are swapped. */
type LocalizableRecipe = {
  id: string;
  name: string;
  description?: string;
  instructions?: string[];
  /** A list of `{ name, … }` lines (Recipe.ingredients is Json, so `unknown`). */
  ingredients?: unknown;
};

export type TranslatePendingResult = {
  /** Recipes that got a new or refreshed translation (or would, on a dry run). */
  translated: string[];
  /** Recipes whose translation is already current. */
  current: number;
  failed: { recipeId: string; error: string }[];
};

export class RecipeTranslationService {
  constructor(
    private readonly repo: IRecipeTranslationRepository = recipeTranslationRepository,
    // Loaded on first use: the AI module's import graph is heavy, and only
    // the pipeline needs it — the read path (localize) never calls the AI.
    private ai?: Pick<IAIService, 'translateRecipe'>,
  ) {}

  private async getAi(): Promise<Pick<IAIService, 'translateRecipe'>> {
    this.ai ??= (await import('../../lib/ai/index.js')).aiService;
    return this.ai;
  }

  /**
   * The same recipes with their display text in `locale`, where a current
   * translation exists; English otherwise. Never throws: a failed lookup
   * leaves the English, because a reader must always get their recipe.
   */
  async localize<T extends LocalizableRecipe>(recipes: T[], locale: SupportedLocale): Promise<T[]> {
    if (locale === 'en' || recipes.length === 0) return recipes;
    try {
      const ids = recipes.map((r) => r.id);
      const translations = await this.repo.findForRecipes(ids, locale);
      if (translations.length === 0) return recipes;
      // The DTOs may be summaries (no steps), so freshness is checked against
      // the English rows, not against what the caller happens to carry.
      const english = await this.repo.findCuratedRecipes(translations.map((t) => t.recipeId));
      const currentHash = new Map(english.map((r) => [r.id, recipeSourceHash(sourceTextOf(r))]));
      const usable = new Map(
        translations
          .filter((t) => currentHash.get(t.recipeId) === t.sourceHash)
          .map((t) => [t.recipeId, t]),
      );
      return recipes.map((recipe) => {
        const t = usable.get(recipe.id);
        return t ? applyTranslation(recipe, t) : recipe;
      });
    } catch (error) {
      console.error('[RecipeTranslation] localize failed — serving English', error);
      return recipes;
    }
  }

  /** `localize` over every recipe in a week plan (`days[].meals[].recipe`). */
  async localizeWeekPlan<P extends { days: { meals: { recipe: LocalizableRecipe }[] }[] }>(
    plan: P | null,
    locale: SupportedLocale,
  ): Promise<P | null> {
    if (!plan || locale === 'en') return plan;
    const recipes = plan.days.flatMap((day) => day.meals.map((meal) => meal.recipe));
    const byId = new Map((await this.localize(recipes, locale)).map((r) => [r.id, r]));
    return {
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        meals: day.meals.map((meal) => ({
          ...meal,
          recipe: byId.get(meal.recipe.id) ?? meal.recipe,
        })),
      })),
    };
  }

  /** `localize` for one recipe. */
  async localizeOne<T extends LocalizableRecipe>(recipe: T, locale: SupportedLocale): Promise<T> {
    const [localized] = await this.localize([recipe], locale);
    return localized ?? recipe;
  }

  /**
   * Drafts translations for curated recipes that have none in `locale`, or
   * whose English changed since (`force` redoes every one). One AI call per
   * recipe, sequential; a failure is reported and the run goes on.
   */
  async translatePending(opts: {
    locale: Exclude<SupportedLocale, 'en'>;
    limit?: number;
    recipeIds?: readonly string[];
    dryRun?: boolean;
    force?: boolean;
    onProgress?: (recipeId: string, outcome: 'translated' | 'failed') => void;
  }): Promise<TranslatePendingResult> {
    const recipes = await this.repo.findCuratedRecipes(opts.recipeIds);
    const existing = new Map(
      (
        await this.repo.findForRecipes(
          recipes.map((r) => r.id),
          opts.locale,
        )
      ).map((t) => [t.recipeId, t.sourceHash]),
    );
    const pending = recipes.filter(
      (r) => opts.force === true || existing.get(r.id) !== recipeSourceHash(sourceTextOf(r)),
    );
    const batch = pending.slice(0, opts.limit ?? pending.length);
    const result: TranslatePendingResult = {
      translated: [],
      current: recipes.length - pending.length,
      failed: [],
    };
    if (opts.dryRun) {
      result.translated = batch.map((r) => r.id);
      return result;
    }

    const ai = await this.getAi();
    for (const recipe of batch) {
      const source = sourceTextOf(recipe);
      try {
        const draft = normaliseDraft(
          opts.locale,
          await ai.translateRecipe({ locale: opts.locale, recipe: source }),
        );
        // Steps and ingredient names are matched by position on read, so a
        // draft that added, merged or dropped one is unusable.
        if (draft.instructions.length !== source.instructions.length) {
          throw new Error(
            `expected ${source.instructions.length} steps, got ${draft.instructions.length}`,
          );
        }
        if (draft.ingredientNames.length !== source.ingredientNames.length) {
          throw new Error(
            `expected ${source.ingredientNames.length} ingredient names, got ${draft.ingredientNames.length}`,
          );
        }
        await this.repo.upsert({
          recipeId: recipe.id,
          locale: opts.locale,
          ...draft,
          source: 'ai:translateRecipe',
          sourceHash: recipeSourceHash(source),
        });
        result.translated.push(recipe.id);
        opts.onProgress?.(recipe.id, 'translated');
      } catch (error) {
        result.failed.push({
          recipeId: recipe.id,
          error: error instanceof Error ? error.message : String(error),
        });
        opts.onProgress?.(recipe.id, 'failed');
      }
    }
    return result;
  }

  /** Marks translations REVIEWED after a person read them; returns how many changed. */
  async approve(
    recipeIds: readonly string[],
    locale: Exclude<SupportedLocale, 'en'>,
  ): Promise<number> {
    return this.repo.setStatus(recipeIds, locale, 'REVIEWED');
  }

  /**
   * A Markdown sheet of every MACHINE_DRAFT translation in `locale`, English
   * beside it, for the owner's review (docs/i18n/recipes-<locale>-review.md).
   */
  async reviewSheet(locale: Exclude<SupportedLocale, 'en'>): Promise<string> {
    const drafts = await this.repo.findByStatus(locale, 'MACHINE_DRAFT');
    const english = new Map(
      (await this.repo.findCuratedRecipes(drafts.map((d) => d.recipeId))).map((r) => [r.id, r]),
    );
    const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
    const lines = [
      `# Recipe translations (${locale}): owner review`,
      '',
      '<!-- Generated by `pnpm recipes:translate sheet`. Do not edit by hand. -->',
      '',
      `${drafts.length} machine-drafted translations to review. Fix a wording in the database (or re-run`,
      'the pipeline with `--force --recipe <id>`), then approve with',
      '`pnpm recipes:translate approve <recipeId…>`.',
      '',
    ];
    for (const draft of drafts) {
      const source = english.get(draft.recipeId);
      if (!source) continue;
      const src = sourceTextOf(source);
      lines.push(
        `## ${draft.name} — \`${draft.recipeId}\``,
        '',
        '| | English | Română |',
        '| --- | --- | --- |',
      );
      lines.push(`| Name | ${cell(src.name)} | ${cell(draft.name)} |`);
      lines.push(`| Description | ${cell(src.description)} | ${cell(draft.description)} |`);
      src.ingredientNames.forEach((name, i) =>
        lines.push(
          `| Ingredient ${i + 1} | ${cell(name)} | ${cell(draft.ingredientNames[i] ?? '')} |`,
        ),
      );
      src.instructions.forEach((step, i) =>
        lines.push(`| Step ${i + 1} | ${cell(step)} | ${cell(draft.instructions[i] ?? '')} |`),
      );
      lines.push('');
    }
    return lines.join('\n');
  }
}

function applyTranslation<T extends LocalizableRecipe>(recipe: T, t: RecipeTranslation): T {
  const localized: T = { ...recipe, name: t.name };
  if (recipe.description !== undefined) localized.description = t.description;
  if (recipe.instructions?.length === t.instructions.length) {
    localized.instructions = t.instructions;
  }
  const lines = recipe.ingredients;
  if (Array.isArray(lines) && lines.length === t.ingredientNames.length) {
    localized.ingredients = lines.map((line: unknown, i) =>
      line !== null && typeof line === 'object'
        ? { ...line, name: t.ingredientNames[i] ?? (line as { name?: unknown }).name }
        : line,
    );
  }
  return localized;
}

export const recipeTranslationService = new RecipeTranslationService();
