import { prisma } from '@chefer/database';
import { runOutsideAiCallContext } from '../lib/ai/call-context.js';
import { isAiCapacityFailure } from '../lib/ai/friendly-error.js';
import { aiService } from '../lib/ai/index.js';
import type { Ingredient } from '../lib/ai/index.js';
import {
  kcalFromMacros,
  macrosAreConsistent,
  normalizeIngredientName,
} from '../lib/ingredient-prices/index.js';

// How often the worker looks for work. The vocabulary changes rarely, so this
// is a discovery interval, not a refresh cadence.
const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 h

// Estimates older than this are re-generated on the next sweep. Weekly for
// now — bump to 30 for a monthly cadence.
const PRICE_REFRESH_DAYS = 7;

// Capacity back-off: the first retry after a 429/quota error waits 90 s, each
// further consecutive one doubles, capped at 1 h — so a provider whose free
// daily quota is gone is asked about once an hour, not every 90 s, until the
// day rolls over. Any successful pass resets it.
const CAPACITY_RETRY_BASE_MS = 90_000;
const CAPACITY_RETRY_MAX_MS = 60 * 60 * 1000;

/** The wait before retry number `failures` (1-based) after a capacity error. */
export function capacityRetryDelayMs(failures: number): number {
  return Math.min(CAPACITY_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), CAPACITY_RETRY_MAX_MS);
}

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
  /** Consecutive capacity failures (for the back-off); 0 after a clean pass. */
  private capacityFailures = 0;
  private retryTimer: NodeJS.Timeout | null = null;

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
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    console.log('[IngredientPriceWorker] stopped');
  }

  /**
   * Triggers an immediate pass (no-op if one is already running). Called from
   * user requests, so the pass is detached from that request's AI call
   * context — it is a background job, never "that user's" AI call.
   */
  wake(): void {
    runOutsideAiCallContext(() => void this.tick());
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const vocabulary = await this.collectVocabulary();
      const toEstimate = await this.findStaleOrMissing(vocabulary);
      if (toEstimate.length === 0) {
        this.capacityFailures = 0;
        return;
      }

      console.log(`[IngredientPriceWorker] estimating ${toEstimate.length} ingredient prices…`);
      for (let i = 0; i < toEstimate.length; i += BATCH_SIZE) {
        await this.estimateBatch(toEstimate.slice(i, i + BATCH_SIZE));
      }
      this.capacityFailures = 0;
    } catch (err) {
      // Every provider busy or out of free quota — retry the remaining
      // batches later instead of waiting 12 h, backing off so an exhausted
      // daily quota is not hammered (capacityRetryDelayMs).
      const msg = err instanceof Error ? err.message : String(err);
      if (isAiCapacityFailure(err) || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        this.capacityFailures += 1;
        const delay = capacityRetryDelayMs(this.capacityFailures);
        console.warn(
          `[IngredientPriceWorker] AI over capacity — retrying remaining batches in ${Math.round(
            delay / 1000,
          )}s (${msg.slice(0, 160)})`,
        );
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.tick();
        }, delay);
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
      // Calories that contradict the row's own macros are recomputed from
      // them (4/4/9) before saving — the stored vocabulary feeds the plan's
      // macro reconciliation and manual-recipe nutrition (audit F-PAN-2-1).
      const derivedKcal = kcalFromMacros(est);
      const caloriesPer100g =
        derivedKcal != null && !macrosAreConsistent(est)
          ? Math.round(derivedKcal)
          : est.caloriesPer100g;
      const fields = {
        pricePer100gEur: est.pricePer100gEur,
        pricePer100mlEur: est.pricePer100mlEur,
        pricePerPieceEur: est.pricePerPieceEur,
        caloriesPer100g,
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
