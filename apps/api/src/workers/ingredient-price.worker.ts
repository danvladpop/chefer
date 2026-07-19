import { prisma } from '@chefer/database';
import { aiService } from '../lib/ai/index.js';
import type { Ingredient } from '../lib/ai/index.js';
import { normalizeIngredientName } from '../lib/ingredient-prices/index.js';

// How often the worker looks for work. The vocabulary changes rarely, so this
// is a discovery interval, not a refresh cadence.
const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 h

// Estimates older than this are re-generated on the next sweep. Weekly for
// now — bump to 30 for a monthly cadence.
const PRICE_REFRESH_DAYS = 7;

// Ingredients per AI call. Keeps prompts small enough for reliable structured
// output while pricing a whole vocabulary in a handful of calls.
const BATCH_SIZE = 40;

/**
 * Builds and maintains the store-agnostic ingredient price vocabulary.
 *
 * - On start (and every sweep): collects the distinct ingredient names used by
 *   ALL recipes in the DB, prices any that are missing from IngredientPrice,
 *   and re-estimates entries older than PRICE_REFRESH_DAYS.
 * - `wake()` lets the shopping-list service trigger an immediate pass when it
 *   serves a list containing unpriced ingredients.
 */
export class IngredientPriceWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    console.log(
      `[IngredientPriceWorker] started (refresh every ${PRICE_REFRESH_DAYS} days, sweep every ${SWEEP_INTERVAL_MS / 3_600_000} h)`,
    );
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[IngredientPriceWorker] stopped');
  }

  /** Triggers an immediate pass (no-op if one is already running). */
  wake(): void {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const vocabulary = await this.collectVocabulary();
      const toEstimate = await this.findStaleOrMissing(vocabulary);
      if (toEstimate.length === 0) return;

      console.log(`[IngredientPriceWorker] estimating ${toEstimate.length} ingredient prices…`);
      for (let i = 0; i < toEstimate.length; i += BATCH_SIZE) {
        await this.estimateBatch(toEstimate.slice(i, i + BATCH_SIZE));
      }
    } catch (err) {
      // Gemini free tier allows 5 requests/min — on quota errors, retry the
      // remaining batches after a short back-off instead of waiting 12 h.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.warn('[IngredientPriceWorker] rate limited — retrying remaining batches in 90s');
        setTimeout(() => this.tick(), 90_000);
      } else {
        console.error('[IngredientPriceWorker] tick error', err);
      }
    } finally {
      this.running = false;
    }
  }

  /** Distinct normalized ingredient names across every recipe in the DB. */
  private async collectVocabulary(): Promise<string[]> {
    const recipes = await prisma.recipe.findMany({ select: { ingredients: true } });
    const names = new Set<string>();
    for (const recipe of recipes) {
      for (const ing of recipe.ingredients as unknown as Ingredient[]) {
        if (ing?.name) names.add(normalizeIngredientName(ing.name));
      }
    }
    return [...names];
  }

  private async findStaleOrMissing(vocabulary: string[]): Promise<string[]> {
    if (vocabulary.length === 0) return [];
    const cutoff = new Date(Date.now() - PRICE_REFRESH_DAYS * 24 * 60 * 60 * 1000);
    const fresh = await prisma.ingredientPrice.findMany({
      where: {
        ingredientName: { in: vocabulary },
        OR: [
          // Recently estimated AND already carrying macros
          { estimatedAt: { gte: cutoff }, caloriesPer100g: { not: null } },
          // Manually maintained rows (USER customs, ADMIN-edited globals)
          // are never AI-refreshed — human edits always win.
          { source: { not: 'AI_ESTIMATE' } },
        ],
      },
      select: { ingredientName: true },
    });
    const freshSet = new Set(fresh.map((p) => p.ingredientName));
    return vocabulary.filter((name) => !freshSet.has(name));
  }

  private async estimateBatch(names: string[]): Promise<void> {
    const estimates = await aiService.estimateIngredientPrices(names);
    // Not logged to aiCallLog: that table is per-user (FK) and this is a
    // system-wide background job. AiCallType.INGREDIENT_PRICES exists for
    // any future user-triggered estimation path.

    for (const est of estimates) {
      const name = normalizeIngredientName(est.ingredientName);
      // Skip rows where the model returned no price at all
      if (
        est.pricePer100gEur == null &&
        est.pricePer100mlEur == null &&
        est.pricePerPieceEur == null
      ) {
        continue;
      }
      const fields = {
        pricePer100gEur: est.pricePer100gEur,
        pricePer100mlEur: est.pricePer100mlEur,
        pricePerPieceEur: est.pricePerPieceEur,
        caloriesPer100g: est.caloriesPer100g,
        proteinPer100g: est.proteinPer100g,
        carbsPer100g: est.carbsPer100g,
        fatPer100g: est.fatPer100g,
        fiberPer100g: est.fiberPer100g,
        gramsPerPiece: est.gramsPerPiece,
      };
      await prisma.ingredientPrice.upsert({
        where: { ingredientName: name },
        create: { ingredientName: name, ...fields },
        update: { ...fields, estimatedAt: new Date() },
      });
    }
    console.log(`[IngredientPriceWorker] ✓ priced ${estimates.length}/${names.length} ingredients`);
  }
}

export const ingredientPriceWorker = new IngredientPriceWorker();
