import { TRPCError } from '@trpc/server';
import {
  AiCallType,
  chefProfileRepository,
  mealPlanRepository,
  prisma,
  type Prisma,
} from '@chefer/database';
import { aiService } from '../../lib/ai/index.js';
import type { Ingredient } from '../../lib/ai/types.js';
import { groceryAIService } from '../../lib/grocery-ai/index.js';
import type { GroceryCategory, GrocerySearchResult } from '../../lib/grocery-ai/index.js';
import { resolveIngredientImage } from '../../lib/ingredient-images/index.js';
import {
  estimateItemPriceEur,
  normalizeIngredientName,
} from '../../lib/ingredient-prices/index.js';
import { ingredientPriceWorker } from '../../workers/ingredient-price.worker.js';
import { inferCategory } from '../shared/category-map.js';

export interface ShoppingListItemForWeek {
  key: string;
  ingredientName: string;
  quantity: string;
  unit: string;
  category: GroceryCategory;
  recipeNames: string[];
  imageUrl: string;
  /** Store-agnostic baseline estimate from the price vocabulary; null while unpriced. */
  estimatedPriceEur: number | null;
  /** True for user-added items (chat tool or manual add) — removable in the UI. */
  isCustom?: boolean;
}

export interface WeekShoppingList {
  planId: string | null;
  weekStartDate: string;
  weekEndDate: string;
  hasPlan: boolean;
  items: ShoppingListItemForWeek[];
  weekOffset: number;
  /** Sum of the per-item estimates (items without an estimate excluded). */
  estimatedTotalEur: number | null;
  /** True when the served list is a persisted AI-consolidated list. */
  aiGenerated: boolean;
  /** Item keys the user has checked off — synced across devices (P1-5). */
  checkedKeys: string[];
}

/** Items as persisted in the ShoppingList table (images/prices re-resolved on read). */
interface StoredShoppingListItem {
  key: string;
  ingredientName: string;
  quantity: string;
  unit: string;
  category: GroceryCategory;
  recipeNames: string[];
  isCustom?: boolean;
}

/** One item the user asked to add (chat tool or the page's add-input). */
export interface CustomItemInput {
  name: string;
  quantity?: number | undefined;
  unit?: string | undefined;
}

/** Parses the customItems Json column; marks every row for the UI. */
function readCustomItems(raw: unknown): StoredShoppingListItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as StoredShoppingListItem[]).map((i) => ({ ...i, isCustom: true }));
}

function customItemKey(planId: string, name: string, unit: string): string {
  return `${planId}-custom-${name.toLowerCase().trim().replace(/\s+/g, '-')}-${unit.toLowerCase().trim()}`;
}

function getMondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export class ShoppingListService {
  /**
   * Resolves images and vocabulary price estimates for the raw items and
   * computes the estimated total. Wakes the price worker when the list
   * contains ingredients the vocabulary hasn't priced yet, so they resolve
   * shortly after (next page load shows them).
   */
  private async finalizeItems(rawItems: StoredShoppingListItem[]): Promise<{
    items: ShoppingListItemForWeek[];
    estimatedTotalEur: number | null;
  }> {
    const normalizedNames = rawItems.map((i) => normalizeIngredientName(i.ingredientName));
    const priceRows = await prisma.ingredientPrice.findMany({
      where: { ingredientName: { in: normalizedNames } },
    });
    const priceMap = new Map(priceRows.map((p) => [p.ingredientName, p]));

    const items: ShoppingListItemForWeek[] = await Promise.all(
      rawItems.map(async (item) => {
        const price = priceMap.get(normalizeIngredientName(item.ingredientName));
        return {
          ...item,
          imageUrl: await resolveIngredientImage(item.ingredientName),
          estimatedPriceEur: price
            ? estimateItemPriceEur(price, parseFloat(item.quantity), item.unit)
            : null,
        };
      }),
    );

    if (items.some((i) => i.estimatedPriceEur === null)) {
      ingredientPriceWorker.wake();
    }

    const priced = items.filter((i) => i.estimatedPriceEur !== null);
    const estimatedTotalEur =
      priced.length > 0
        ? Math.round(priced.reduce((sum, i) => sum + (i.estimatedPriceEur ?? 0), 0) * 100) / 100
        : null;

    return { items, estimatedTotalEur };
  }

  async getForWeek(userId: string, weekOffset: number): Promise<WeekShoppingList> {
    const weekStart = getMondayOfWeek(weekOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Find the plan for this week (single indexed query); for offset 0 fall
    // back to the active plan.
    let targetPlan = await mealPlanRepository.findByWeekStart(userId, weekStart);
    if (!targetPlan && weekOffset === 0) {
      targetPlan = await mealPlanRepository.findActiveWithDays(userId);
    }

    if (!targetPlan) {
      return {
        planId: null,
        weekStartDate: weekStart.toISOString(),
        weekEndDate: weekEnd.toISOString(),
        hasPlan: false,
        items: [],
        weekOffset,
        estimatedTotalEur: null,
        aiGenerated: false,
        checkedKeys: [],
      };
    }

    // The stored row serves two jobs: the AI-consolidated item list (written
    // by regenerate, aiGenerated=true) and the synced check-off state (P1-5,
    // which may exist on a bare row before any regenerate). Only AI rows are
    // an ITEM source — a bare row must not shadow the derived list.
    const stored = await prisma.shoppingList.findUnique({ where: { planId: targetPlan.id } });
    const checkedKeys = [...new Set(stored?.checkedKeys ?? [])];
    // User-added items overlay whichever list is served (derived or AI).
    const customItems = readCustomItems(stored?.customItems);
    if (stored?.aiGenerated) {
      const { items, estimatedTotalEur } = await this.finalizeItems([
        ...(stored.items as unknown as StoredShoppingListItem[]),
        ...customItems,
      ]);
      return {
        planId: targetPlan.id,
        weekStartDate: weekStart.toISOString(),
        weekEndDate: weekEnd.toISOString(),
        hasPlan: true,
        items,
        weekOffset,
        estimatedTotalEur,
        aiGenerated: true,
        checkedKeys,
      };
    }

    // Collect all recipe IDs
    type MealSlotJson = { type: string; recipeId: string };
    const uniqueIds = [
      ...new Set(
        targetPlan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId)),
      ),
    ];
    const recipes = await mealPlanRepository.findRecipesByIds(uniqueIds);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    // Aggregate ingredients. Merge key includes the unit: the same ingredient
    // with two different units becomes two lines — previously the second unit
    // silently overwrote the first, dropping its quantity.
    const merged = new Map<
      string,
      {
        name: string;
        quantity: number;
        unit: string;
        category: GroceryCategory;
        recipeIds: Set<string>;
      }
    >();

    for (const day of targetPlan.days) {
      for (const slot of day.meals as MealSlotJson[]) {
        const recipe = recipeMap.get(slot.recipeId);
        if (!recipe) continue;
        const ingredients = recipe.ingredients as unknown as Ingredient[];
        for (const ing of ingredients) {
          const name = ing.name.toLowerCase().trim();
          const key = `${name}|${ing.unit.toLowerCase().trim()}`;
          const existing = merged.get(key);
          if (existing) {
            existing.quantity += ing.quantity;
            existing.recipeIds.add(slot.recipeId);
          } else {
            merged.set(key, {
              name,
              quantity: ing.quantity,
              unit: ing.unit,
              category: inferCategory(ing.name),
              recipeIds: new Set([slot.recipeId]),
            });
          }
        }
      }
    }

    const rawItems = [...merged.entries()].map(([key, data]) => ({
      key: `${targetPlan.id}-${key}`,
      ingredientName: data.name.charAt(0).toUpperCase() + data.name.slice(1),
      quantity: Number.isInteger(data.quantity) ? String(data.quantity) : data.quantity.toFixed(1),
      unit: data.unit,
      category: data.category,
      recipeNames: [...data.recipeIds].map((id) => recipeMap.get(id)?.name ?? '').filter(Boolean),
    }));

    const { items, estimatedTotalEur } = await this.finalizeItems([...rawItems, ...customItems]);

    return {
      planId: targetPlan.id,
      weekStartDate: weekStart.toISOString(),
      weekEndDate: weekEnd.toISOString(),
      hasPlan: true,
      items,
      weekOffset,
      estimatedTotalEur,
      aiGenerated: false,
      checkedKeys,
    };
  }

  /**
   * Toggles membership of `keys` in the plan's checked set (P1-5). Additive
   * per-key semantics (not whole-array replace) so two devices checking
   * different items concurrently both win. Creates a bare row when the plan
   * has no persisted list yet.
   */
  async toggleItems(
    userId: string,
    planId: string,
    keys: string[],
    checked: boolean,
  ): Promise<{ checkedKeys: string[] }> {
    const plan = await mealPlanRepository.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }

    // Read-modify-write under SERIALIZABLE with retry: two rapid toggles (or
    // two devices) otherwise both read the same array and the second write
    // silently drops the first key — observed on the very first manual test.
    for (let attempt = 0; ; attempt++) {
      try {
        const checkedKeys = await prisma.$transaction(
          async (tx) => {
            const existing = await tx.shoppingList.findUnique({ where: { planId } });
            const current = new Set(existing?.checkedKeys ?? []);
            for (const key of keys) {
              if (checked) current.add(key);
              else current.delete(key);
            }
            const next = [...current];
            await tx.shoppingList.upsert({
              where: { planId },
              create: { planId, items: [], aiGenerated: false, checkedKeys: next },
              update: { checkedKeys: next },
            });
            return next;
          },
          { isolationLevel: 'Serializable' },
        );
        return { checkedKeys };
      } catch (err) {
        // P2034: transaction conflict — the concurrent writer won; retry on
        // top of its result.
        const conflict =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
        if (!conflict || attempt >= 3) throw err;
      }
    }
  }

  /**
   * Adds user-chosen items to the plan's list (chat `addToShoppingList` tool
   * + the page's add-input). Stored in the customItems overlay so they never
   * shadow the derived list; same name+unit replaces (idempotent re-add).
   * Same Serializable+retry pattern as toggleItems — the JSON column has the
   * identical read-modify-write hazard.
   */
  async addCustomItems(
    userId: string,
    planId: string,
    inputs: CustomItemInput[],
  ): Promise<{ added: string[] }> {
    const plan = await mealPlanRepository.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }

    const newItems: StoredShoppingListItem[] = inputs.map((input) => {
      const name = input.name.trim();
      const unit = (input.unit ?? 'pcs').trim() || 'pcs';
      const quantity = input.quantity != null && input.quantity > 0 ? input.quantity : 1;
      return {
        key: customItemKey(planId, name, unit),
        ingredientName: name.charAt(0).toUpperCase() + name.slice(1),
        quantity: Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1),
        unit,
        category: inferCategory(name),
        recipeNames: [],
      };
    });

    for (let attempt = 0; ; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const existing = await tx.shoppingList.findUnique({ where: { planId } });
            const byKey = new Map(
              readCustomItems(existing?.customItems).map((i) => [i.key, { ...i }]),
            );
            for (const item of newItems) byKey.set(item.key, item);
            if (byKey.size > 100) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'The list already has 100 custom items — remove some first.',
              });
            }
            // isCustom is a read-time marker, not persisted state
            const next = [...byKey.values()].map(({ isCustom: _isCustom, ...rest }) => rest);
            await tx.shoppingList.upsert({
              where: { planId },
              create: {
                planId,
                items: [],
                aiGenerated: false,
                customItems: next,
              },
              update: { customItems: next },
            });
          },
          { isolationLevel: 'Serializable' },
        );
        return { added: newItems.map((i) => i.ingredientName) };
      } catch (err) {
        const conflict =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
        if (!conflict || attempt >= 3) throw err;
      }
    }
  }

  /** Removes one user-added item (and its check-off state, if any). */
  async removeCustomItem(userId: string, planId: string, key: string): Promise<void> {
    const plan = await mealPlanRepository.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }

    for (let attempt = 0; ; attempt++) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const existing = await tx.shoppingList.findUnique({ where: { planId } });
            if (!existing) return;
            const next = readCustomItems(existing.customItems)
              .filter((i) => i.key !== key)
              .map(({ isCustom: _isCustom, ...rest }) => rest);
            await tx.shoppingList.update({
              where: { planId },
              data: {
                customItems: next,
                checkedKeys: existing.checkedKeys.filter((k) => k !== key),
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
        return;
      } catch (err) {
        const conflict =
          typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2034';
        if (!conflict || attempt >= 3) throw err;
      }
    }
  }

  async regenerate(userId: string, weekOffset: number): Promise<WeekShoppingList> {
    const weekStart = getMondayOfWeek(weekOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const allPlans = await mealPlanRepository.findAllByUserId(userId, 56, 0);
    const targetDateStr = weekStart.toDateString();
    let targetPlan = allPlans.find((p) => {
      const planMonday = new Date(p.weekStartDate);
      planMonday.setHours(0, 0, 0, 0);
      return planMonday.toDateString() === targetDateStr;
    });

    if (!targetPlan && weekOffset === 0) {
      targetPlan = (await mealPlanRepository.findActiveWithDays(userId)) ?? undefined;
    }

    if (!targetPlan) {
      return {
        planId: null,
        weekStartDate: weekStart.toISOString(),
        weekEndDate: weekEnd.toISOString(),
        hasPlan: false,
        items: [],
        weekOffset,
        estimatedTotalEur: null,
        aiGenerated: false,
        checkedKeys: [],
      };
    }

    type MealSlotJson = { type: string; recipeId: string };
    const uniqueIds = [
      ...new Set(
        targetPlan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId)),
      ),
    ];
    const recipes = await mealPlanRepository.findRecipesByIds(uniqueIds);

    // Pre-merge exact name+unit duplicates before the AI call — the model only
    // needs to do the *hard* consolidation (unit conversion, name variants).
    // This roughly halves the prompt and speeds the call up noticeably.
    const preMerged = new Map<string, { name: string; quantity: number; unit: string }>();
    for (const day of targetPlan.days) {
      for (const slot of day.meals as MealSlotJson[]) {
        const recipe = recipes.find((r) => r.id === slot.recipeId);
        if (!recipe) continue;
        for (const ing of recipe.ingredients as unknown as Ingredient[]) {
          const key = `${ing.name.toLowerCase().trim()}|${ing.unit.toLowerCase().trim()}`;
          const existing = preMerged.get(key);
          if (existing) {
            existing.quantity += ing.quantity;
          } else {
            preMerged.set(key, { name: ing.name, quantity: ing.quantity, unit: ing.unit });
          }
        }
      }
    }
    const rawIngredients = [...preMerged.values()];

    const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const aiResult = await aiService.generateShoppingList({
      ingredients: rawIngredients,
      weekLabel,
    });

    prisma.aiCallLog
      .create({ data: { userId, callType: AiCallType.SHOPPING_LIST } })
      .catch((err) => console.error('[aiCallLog] Failed to log SHOPPING_LIST call:', err));

    const rawItems: StoredShoppingListItem[] = aiResult.items.map((item) => ({
      // Stable key (no index): checked-off state in the UI survives reloads
      key: `${targetPlan.id}-ai-${item.ingredientName.toLowerCase().replace(/\s+/g, '-')}-${item.unit.toLowerCase()}`,
      ingredientName: item.ingredientName,
      quantity: item.quantity,
      unit: item.unit,
      // The AI no longer categorises (saves output tokens) — infer locally
      category: item.category ?? inferCategory(item.ingredientName),
      recipeNames: [] as string[],
    }));

    // Persist so the AI-consolidated list survives reloads — getForWeek
    // serves it from now on (until the plan itself is regenerated). The AI
    // list has fresh item keys, so previous check-offs no longer apply —
    // clear them rather than leaving orphans (P1-5).
    const itemsJson = rawItems as unknown as Prisma.InputJsonValue;
    await prisma.shoppingList.upsert({
      where: { planId: targetPlan.id },
      create: {
        planId: targetPlan.id,
        items: itemsJson,
        aiGenerated: true,
      },
      // customItems is deliberately untouched — user-added items survive an
      // AI regenerate (their keys are stable, unlike the AI rows').
      update: { items: itemsJson, aiGenerated: true, checkedKeys: [] },
    });

    const stored = await prisma.shoppingList.findUnique({ where: { planId: targetPlan.id } });
    const { items, estimatedTotalEur } = await this.finalizeItems([
      ...rawItems,
      ...readCustomItems(stored?.customItems),
    ]);

    return {
      planId: targetPlan.id,
      weekStartDate: weekStart.toISOString(),
      weekEndDate: weekEnd.toISOString(),
      hasPlan: true,
      items,
      weekOffset,
      estimatedTotalEur,
      aiGenerated: true,
      checkedKeys: [],
    };
  }

  async searchStores(
    userId: string,
    planId: string,
    userLat?: number,
    userLng?: number,
    deliveryAddress?: string,
  ): Promise<GrocerySearchResult> {
    // Get the week list to have ingredient info
    const allPlans = await mealPlanRepository.findAllByUserId(userId, 52, 0);
    const plan =
      allPlans.find((p) => p.id === planId) ??
      (await mealPlanRepository.findActiveWithDays(userId));

    const chefProfile = await chefProfileRepository.findByUserId(userId);
    const currency = chefProfile?.deliveryCurrency ?? 'EUR';

    if (!plan) {
      return {
        stores: [],
        searchedAt: new Date(),
        locationUsed: 'default',
        currencyCode: currency,
      };
    }

    type MealSlotJson = { type: string; recipeId: string };
    const uniqueIds = [
      ...new Set(plan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId))),
    ];
    const recipes = await mealPlanRepository.findRecipesByIds(uniqueIds);
    const ingredients = recipes.flatMap((r) =>
      (r.ingredients as unknown as Ingredient[]).map((ing) => ({
        name: ing.name,
        quantity: String(ing.quantity),
        unit: ing.unit,
        category: inferCategory(ing.name),
      })),
    );

    const searchInput: Parameters<typeof groceryAIService.searchNearbyStores>[0] = {
      ingredients,
      preferredCurrency: currency,
    };
    if (userLat !== undefined) searchInput.userLat = userLat;
    if (userLng !== undefined) searchInput.userLng = userLng;
    if (deliveryAddress !== undefined) searchInput.deliveryAddress = deliveryAddress;

    return groceryAIService.searchNearbyStores(searchInput);
  }
}

export const shoppingListService = new ShoppingListService();
