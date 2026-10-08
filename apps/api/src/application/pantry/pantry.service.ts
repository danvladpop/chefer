import { TRPCError } from '@trpc/server';
import {
  mealPlanRepository,
  pantryItemRepository,
  prisma,
  type IMealPlanRepository,
  type IPantryItemRepository,
  type PantryItem,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import type { Ingredient } from '../../lib/ai/index.js';
import { CURATED_POOL_BY_TYPE } from '../../lib/curated-recipes/index.js';
import { hasFeature } from '../../lib/entitlements.js';
import {
  estimateItemPriceEur,
  normalizeIngredientName,
  visibleToUser,
} from '../../lib/ingredient-prices/index.js';
import { planForThisWeek } from '../meal-plan/plan-for-date.js';
import { planShapeService } from '../meal-plan/plan-shape.service.js';
import { safetyService, type SafetyService } from '../safety/safety.service.js';
import { slotShopFactor } from '../shared/household-scale.js';
import { buildPantryMatcher, rankRecipesByPantry } from './pantry-match.js';
import { PANTRY_RETIRED } from './pantry-retired.js';
import { isStapleIngredient } from './staples.js';

// ─── PantryService (F3 Zero-Waste Kitchen) ────────────────────────────────────
// The user's kitchen inventory. Rows are seeded by shopping-list check-offs
// (ShoppingListService.toggleItems → seedFromPurchases, source PURCHASE) or
// added by hand (MANUAL). Quantity convention (schema frozen, no new column):
// quantity > 0 is a real amount; quantity === 0 means "some" — the user still
// has the ingredient, amount unknown (weekly confirms decay stale rows to it).

/** Manual rows older than this decay to "some" on a weekly confirm. */
const DECAY_AFTER_DAYS = 7;

const MAX_PANTRY_ITEMS = 200;

export interface PantryItemDto {
  id: string;
  ingredientName: string;
  /** null = the "some" state (quantity 0 in storage — amount unknown). */
  quantity: number | null;
  unit: string;
  source: string;
  updatedAt: Date;
}

function toDto(item: PantryItem): PantryItemDto {
  return {
    id: item.id,
    ingredientName: item.ingredientName,
    quantity: item.quantity > 0 ? item.quantity : null,
    unit: item.unit,
    source: item.source,
    updatedAt: item.updatedAt,
  };
}

export interface PurchasedItemInput {
  name: string;
  quantity: number;
  unit: string;
}

export class PantryService {
  constructor(
    private readonly repo: IPantryItemRepository = pantryItemRepository,
    private readonly planRepo: IMealPlanRepository = mealPlanRepository,
    private readonly safety: SafetyService = safetyService,
  ) {}

  /** All items, oldest first (the use-first order the provider serves). */
  async list(userId: string): Promise<{ items: PantryItemDto[]; count: number }> {
    const items = await this.repo.findByUser(userId);
    return { items: items.map(toDto), count: items.length };
  }

  /**
   * Seeds pantry rows from checked-off shopping list items (source PURCHASE).
   * Staples are never tracked; names are normalized so re-buys collapse onto
   * the same row (@@unique(userId, ingredientName, unit)). Returns how many
   * rows were written. Unchecking never removes — you still have last week's
   * groceries.
   */
  async seedFromPurchases(userId: string, purchased: PurchasedItemInput[]): Promise<number> {
    const rows = purchased
      .filter((item) => item.name.trim().length > 0 && !isStapleIngredient(item.name))
      .map((item) => ({
        userId,
        ingredientName: normalizeIngredientName(item.name),
        quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0,
        unit: item.unit.toLowerCase().trim() || 'pcs',
        source: 'PURCHASE' as const,
      }));
    if (rows.length === 0) return 0;
    await this.repo.upsertMany(rows);
    return rows.length;
  }

  /**
   * Undoes seedFromPurchases for unticked list lines: removes the matching
   * PURCHASE rows (same name and unit). MANUAL rows are the user's own and
   * are never touched.
   */
  async revertPurchases(userId: string, purchased: PurchasedItemInput[]): Promise<number> {
    const wanted = new Set(
      purchased.map(
        (item) =>
          `${normalizeIngredientName(item.name)}|${item.unit.toLowerCase().trim() || 'pcs'}`,
      ),
    );
    if (wanted.size === 0) return 0;
    const rows = await this.repo.findByUser(userId);
    const ids = rows
      .filter((row) => row.source === 'PURCHASE' && wanted.has(`${row.ingredientName}|${row.unit}`))
      .map((row) => row.id);
    await this.repo.deleteByIds(userId, ids);
    return ids.length;
  }

  /** Manual add/edit (premium). Staples are rejected with a friendly message. */
  async addManual(
    userId: string,
    input: { name: string; quantity?: number | undefined; unit: string },
  ): Promise<PantryItemDto> {
    const name = normalizeIngredientName(input.name);
    if (name.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Give the ingredient a name.' });
    }
    if (isStapleIngredient(name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `No need to track ${name} — Chefer assumes staples like salt, pepper, oil and water are always in your kitchen.`,
      });
    }
    const count = await this.repo.countByUser(userId);
    if (count >= MAX_PANTRY_ITEMS) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Your kitchen already tracks ${MAX_PANTRY_ITEMS} items — clear some first.`,
      });
    }
    const item = await this.repo.upsert({
      userId,
      ingredientName: name,
      quantity: input.quantity != null && input.quantity > 0 ? input.quantity : 0,
      unit: input.unit.toLowerCase().trim() || 'pcs',
      source: 'MANUAL',
    });
    return toDto(item);
  }

  /**
   * Removes one row by id — every tier (UX-SHOP-05: the free "In my kitchen"
   * list could only grow while remove was premium-only). Returns the removed
   * row so the client can offer Undo (`restoreItem`).
   */
  async removeItem(userId: string, id: string): Promise<PantryItemDto | null> {
    const [row] = await this.repo.findByIds(userId, [id]);
    await this.repo.deleteById(userId, id);
    return row ? toDto(row) : null;
  }

  /**
   * Edits a row's amount and unit (UX-SHOP-05). `quantity: null` is the
   * "some" state; a number must be positive. A unit change moves the row
   * (the unique key includes the unit), keeping its source.
   */
  async updateItem(
    userId: string,
    id: string,
    input: { quantity: number | null; unit: string },
  ): Promise<PantryItemDto> {
    if (input.quantity !== null && !(input.quantity > 0)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Enter an amount above zero, or leave it empty for "some".',
      });
    }
    const [row] = await this.repo.findByIds(userId, [id]);
    if (!row)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'That item is gone from your kitchen.' });
    const unit = input.unit.toLowerCase().trim() || 'pcs';
    if (unit !== row.unit) await this.repo.deleteById(userId, id);
    const saved = await this.repo.upsert({
      userId,
      ingredientName: row.ingredientName,
      quantity: input.quantity ?? 0,
      unit,
      source: row.source === 'MANUAL' ? 'MANUAL' : 'PURCHASE',
    });
    return toDto(saved);
  }

  /**
   * Undo for a removal: puts the row back as it was (any tier — removing is
   * open to every tier, so taking it back must be too).
   */
  async restoreItem(
    userId: string,
    input: {
      ingredientName: string;
      quantity?: number | undefined;
      unit: string;
      source: 'PURCHASE' | 'MANUAL';
    },
  ): Promise<PantryItemDto> {
    const name = normalizeIngredientName(input.ingredientName);
    if (name.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Give the ingredient a name.' });
    }
    if ((await this.repo.countByUser(userId)) >= MAX_PANTRY_ITEMS) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Your kitchen already tracks ${MAX_PANTRY_ITEMS} items — clear some first.`,
      });
    }
    const item = await this.repo.upsert({
      userId,
      ingredientName: name,
      quantity: input.quantity != null && input.quantity > 0 ? input.quantity : 0,
      unit: input.unit.toLowerCase().trim() || 'pcs',
      source: input.source,
    });
    return toDto(item);
  }

  /**
   * "I'm out of it" — removes every row for the ingredient (any unit). Used
   * by the shopping list's one-tap re-add on a "have it" item: clearing the
   * pantry row puts the item back into the buy list and the estimated total.
   */
  async markOutOfStock(userId: string, ingredientName: string): Promise<{ removed: number }> {
    const removed = await this.repo.deleteByIngredientName(
      userId,
      normalizeIngredientName(ingredientName),
    );
    return { removed };
  }

  /**
   * Weekly confirm ("still have these?", Sunday/first visit of the week):
   * tapped items are cleared; every kept row older than DECAY_AFTER_DAYS
   * decays to the "some" state (quantity 0) — honest v1 depletion, no fake
   * per-recipe gram math (premium_plan.md §5 W2-E.2). Decay preserves
   * updatedAt so the use-first order is untouched.
   */
  async confirmWeekly(userId: string, clearIds: string[]): Promise<{ remaining: number }> {
    await this.repo.deleteByIds(userId, clearIds);
    const remaining = await this.repo.findByUser(userId);
    const cutoff = Date.now() - DECAY_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const stale = remaining
      .filter((item) => item.quantity > 0 && item.updatedAt.getTime() < cutoff)
      .map((item) => item.id);
    await this.repo.decayToSome(userId, stale);
    return { remaining: remaining.length };
  }

  /**
   * Chat tool `whatCanIMake` (F3): ranks the active plan's recipes plus the
   * curated pool by pantry coverage and answers in plain text for the model.
   * Free tier gets an honest teaser (pantryPlanning is premium).
   */
  async whatCanIMake(user: UserProfile): Promise<string> {
    if (PANTRY_RETIRED) {
      return "Pantry tracking has been retired from Chefer, so there is nothing to match recipes against. Suggest recipes from the user's meal plan or recipe collection instead.";
    }
    const pantry = await this.repo.findByUser(user.id);
    if (pantry.length === 0) {
      return 'The pantry is empty. Items are added automatically when the user checks off shopping list items, or by hand on the Pantry page.';
    }
    if (!hasFeature(user, 'pantryPlanning')) {
      return `The user has ${pantry.length} item(s) in their kitchen, but pantry-aware cooking suggestions are a premium feature — suggest upgrading so plans and suggestions cook from what they already have.`;
    }

    // B-34/B-46/T-01.2: never suggest a dish the household can't eat — one
    // SafetyService context instead of a duplicated merge+matcher call, so
    // this stays in sync with every other safety-aware surface.
    const ctx = await this.safety.loadContext(user.id);

    const pantryNames = pantry.map((p) => p.ingredientName);
    const curatedCandidates = Object.values(CURATED_POOL_BY_TYPE)
      .flat()
      .map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        dietaryTags: recipe.dietaryTags,
      }));
    const candidates = new Map<string, { name: string; ingredients: { name: string }[] }>();
    for (const recipe of this.safety.filter(curatedCandidates, ctx)) {
      candidates.set(recipe.name, { name: recipe.name, ingredients: recipe.ingredients });
    }
    const activePlan = await planForThisWeek(this.planRepo, user.id);
    if (activePlan) {
      type MealSlotJson = { type: string; recipeId: string };
      const ids = [
        ...new Set(
          activePlan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId)),
        ),
      ];
      const recipes = await this.planRepo.findRecipesByIds(ids);
      const planCandidates = recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        ingredients: recipe.ingredients as unknown as Ingredient[],
        instructions: recipe.instructions,
        dietaryTags: recipe.dietaryTags,
      }));
      for (const recipe of this.safety.filter(planCandidates, ctx)) {
        candidates.set(recipe.name, { name: recipe.name, ingredients: recipe.ingredients });
      }
    }

    const ranked = rankRecipesByPantry([...candidates.values()], pantryNames, 3);
    if (ranked.length === 0) {
      const names = pantryNames.slice(0, 8).join(', ');
      return `The pantry has: ${names}. No known recipe is mostly covered by it — suggest dishes built around those ingredients, or generating a plan (premium plans automatically cook from the pantry).`;
    }
    const lines = ranked.map((r) => {
      const missing =
        r.missing.length > 0
          ? `missing: ${r.missing.slice(0, 4).join(', ')}`
          : 'everything on hand';
      return `- ${r.name} — uses ${r.matched.length} pantry item(s) (${r.matched.slice(0, 4).join(', ')}); ${missing}`;
    });
    return `From the ${pantry.length} item(s) in the user's kitchen, the best matches:\n${lines.join('\n')}\nStaples (salt, pepper, oil…) are assumed on hand.`;
  }

  /**
   * Σ estimated EUR prices of this week's plan ingredients that the pantry
   * covers — the figure the shopping list header shows and the coach seam:
   * ChefReview.savedEur (wired by coach code at review time, not here).
   * Returns null when the user has no plan for that week.
   */
  async computeWeekPantrySavings(userId: string, weekStart: Date): Promise<number | null> {
    // FB7-10: retired — the coach review records no pantry saving.
    if (PANTRY_RETIRED) return null;
    const plan = await this.planRepo.findByWeekStart(userId, weekStart);
    if (!plan) return null;
    const pantry = await this.repo.findByUser(userId);
    if (pantry.length === 0) return 0;
    const matcher = buildPantryMatcher(pantry.map((p) => p.ingredientName));

    type MealSlotJson = { type: string; recipeId: string; portion?: number };
    // The savings are what the pantry covers of the whole shop: the slot's
    // eater portion plus "two of us" (UX-PLAN-02).
    const { cookingFor } = await planShapeService.getShape(userId);
    const table = { members: [], cookingFor };
    const ids = [
      ...new Set(plan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId))),
    ];
    const recipes = await this.planRepo.findRecipesByIds(ids);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    // Merge lines the same way the derived shopping list does (name|unit key).
    type Ingredient = { name: string; quantity: number; unit: string };
    const merged = new Map<string, { name: string; quantity: number; unit: string }>();
    for (const day of plan.days) {
      for (const slot of day.meals as MealSlotJson[]) {
        const recipe = recipeMap.get(slot.recipeId);
        if (!recipe) continue;
        const portion = slotShopFactor(slot.portion, null, table); // P1-1 portioned slots
        for (const ing of recipe.ingredients as unknown as Ingredient[]) {
          const key = `${normalizeIngredientName(ing.name)}|${ing.unit.toLowerCase().trim()}`;
          const quantity = ing.quantity * portion;
          const existing = merged.get(key);
          if (existing) existing.quantity += quantity;
          else merged.set(key, { name: ing.name, quantity, unit: ing.unit });
        }
      }
    }

    const covered = [...merged.values()].filter((line) => matcher(line.name) !== null);
    if (covered.length === 0) return 0;

    const priceRows = await prisma.ingredientPrice.findMany({
      where: {
        ingredientName: { in: covered.map((line) => normalizeIngredientName(line.name)) },
        ...visibleToUser(userId),
      },
    });
    const priceMap = new Map(priceRows.map((row) => [row.ingredientName, row]));
    const total = covered.reduce((sum, line) => {
      const price = priceMap.get(normalizeIngredientName(line.name));
      const eur = price ? estimateItemPriceEur(price, line.quantity, line.unit) : null;
      return sum + (eur ?? 0);
    }, 0);
    return Math.round(total * 100) / 100;
  }
}

export const pantryService = new PantryService();
