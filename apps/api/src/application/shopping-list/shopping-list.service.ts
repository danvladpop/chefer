import { TRPCError } from '@trpc/server';
import {
  AiCallType,
  chefProfileRepository,
  mealPlanRepository,
  pantryItemRepository,
  prisma,
  type MealPlan,
  type MealPlanDay,
  type Prisma,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { aiService } from '../../lib/ai/index.js';
import type { Ingredient } from '../../lib/ai/types.js';
import { hasFeature } from '../../lib/entitlements.js';
import { groceryAIService } from '../../lib/grocery-ai/index.js';
import type { GroceryCategory, GrocerySearchResult } from '../../lib/grocery-ai/index.js';
import { resolveIngredientImage } from '../../lib/ingredient-images/index.js';
import {
  estimateItemPriceEur,
  normalizeIngredientName,
} from '../../lib/ingredient-prices/index.js';
import { ingredientPriceWorker } from '../../workers/ingredient-price.worker.js';
import { buildPantryMatcher } from '../pantry/pantry-match.js';
import { pantryService } from '../pantry/pantry.service.js';
import { inferCategory } from '../shared/category-map.js';
import { aggregateIngredientLines, formatLineQuantity, tidyListItems } from './aggregate.js';

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
  /**
   * F3: the user's pantry already has this ingredient ("have it" chip) —
   * excluded from `estimatedTotalEur`. Only ever set for `pantryPlanning`
   * accounts; the one-tap re-add clears the pantry row (`pantry.markOutOfStock`).
   */
  pantryCovered?: boolean;
}

/** F3 pantry summary attached to every served list. */
export interface ShoppingListPantryInfo {
  /** Whether this account's tier gets the actual subtraction (pantryPlanning). */
  entitled: boolean;
  /** Total PantryItem rows the user has ("You now have N items…"). */
  itemCount: number;
  /**
   * Σ estimated prices of pantry-covered items on THIS list. For entitled
   * accounts these items are excluded from `estimatedTotalEur` ("saved ~€X
   * this week"); for free accounts it is the §6.4 ghost figure ("would have
   * saved ~€X") — the list total itself is untouched.
   */
  savedEur: number;
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
  /** F3 pantry subtraction summary — always present (zeros when pantry is empty). */
  pantry: ShoppingListPantryInfo;
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

/**
 * AI-consolidated rows get the derived list's rules (aggregate.ts): no water
 * or "to taste" lines, no leftover duplicates, and the local aisle map
 * wherever the stored category is missing or "other" — the model no longer
 * categorises, and older rows were stored as "other" (audit F-SHOP-1-1/1-2).
 */
function tidyAiItems(items: StoredShoppingListItem[]): StoredShoppingListItem[] {
  return tidyListItems(items).map((item) =>
    item.category && item.category !== 'other'
      ? item
      : { ...item, category: inferCategory(item.ingredientName) },
  );
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

  /**
   * F3 pantry subtraction: marks pantry-covered items ("have it") and
   * recomputes the totals. `pantryPlanning` accounts get the real
   * subtraction — covered items leave `estimatedTotalEur` and `savedEur`
   * counts what stays in the kitchen; free accounts keep their numbers and
   * receive the ghost figures only (§6.4). Custom items are deliberate adds
   * and are never subtracted.
   */
  private async applyPantry(
    user: UserProfile,
    items: ShoppingListItemForWeek[],
    estimatedTotalEur: number | null,
    checkedKeys: string[] = [],
  ): Promise<{
    items: ShoppingListItemForWeek[];
    estimatedTotalEur: number | null;
    pantry: ShoppingListPantryInfo;
  }> {
    const entitled = hasFeature(user, 'pantryPlanning');
    const pantryRows = await pantryItemRepository.findByUser(user.id);
    if (pantryRows.length === 0) {
      return { items, estimatedTotalEur, pantry: { entitled, itemCount: 0, savedEur: 0 } };
    }

    const matcher = buildPantryMatcher(
      pantryRows.map((row) => ({
        name: row.ingredientName,
        quantity: row.quantity,
        unit: row.unit,
      })),
    );
    // A ticked line was bought FOR this week: ticking seeds the pantry, and
    // that pantry row must not flip the same line to "have it", drop it
    // from the total and count it as saved (audit F-PAN-1-1).
    const ticked = new Set(checkedKeys);
    const coveredKeys = new Set(
      items
        .filter(
          (item) =>
            !item.isCustom &&
            !ticked.has(item.key) &&
            matcher(item.ingredientName, {
              quantity: parseFloat(item.quantity),
              unit: item.unit,
            }) !== null,
        )
        .map((item) => item.key),
    );
    const round = (v: number) => Math.round(v * 100) / 100;
    const savedEur = round(
      items
        .filter((item) => coveredKeys.has(item.key))
        .reduce((sum, item) => sum + (item.estimatedPriceEur ?? 0), 0),
    );
    const pantry: ShoppingListPantryInfo = { entitled, itemCount: pantryRows.length, savedEur };

    if (!entitled) return { items, estimatedTotalEur, pantry };

    const marked = items.map((item) =>
      coveredKeys.has(item.key) ? { ...item, pantryCovered: true } : item,
    );
    const priced = marked.filter((item) => item.estimatedPriceEur !== null);
    const newTotal =
      priced.length > 0
        ? round(
            priced
              .filter((item) => !item.pantryCovered)
              .reduce((sum, item) => sum + (item.estimatedPriceEur ?? 0), 0),
          )
        : null;
    return { items: marked, estimatedTotalEur: newTotal, pantry };
  }

  /** Derived (non-AI) item lines from the plan's recipes — the P1-5 merge. */
  private async buildDerivedRawItems(
    targetPlan: MealPlan & { days: MealPlanDay[] },
  ): Promise<StoredShoppingListItem[]> {
    type MealSlotJson = { type: string; recipeId: string };
    const uniqueIds = [
      ...new Set(
        targetPlan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId)),
      ),
    ];
    const recipes = await mealPlanRepository.findRecipesByIds(uniqueIds);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    // One aggregation for the list, the AI prompt and the planner's cost chip
    // (aggregate.ts, audit F-SHOP-1-1/1-3).
    const lines = aggregateIngredientLines(
      targetPlan.days.flatMap((day) =>
        (day.meals as MealSlotJson[]).flatMap((slot) => {
          const recipe = recipeMap.get(slot.recipeId);
          if (!recipe) return [];
          return (recipe.ingredients as unknown as Ingredient[]).map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            recipeId: slot.recipeId,
          }));
        }),
      ),
    );

    return lines.map((l) => ({
      key: `${targetPlan.id}-${l.keyPart}`,
      ingredientName: l.name,
      quantity: formatLineQuantity(l.quantity),
      unit: l.unit,
      category: inferCategory(l.name),
      recipeNames: l.recipeIds.map((id) => recipeMap.get(id)?.name ?? '').filter(Boolean),
    }));
  }

  async getForWeek(user: UserProfile, weekOffset: number): Promise<WeekShoppingList> {
    const userId = user.id;
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
      const { pantry } = await this.applyPantry(user, [], null);
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
        pantry,
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
      const finalized = await this.finalizeItems([
        ...tidyAiItems(stored.items as unknown as StoredShoppingListItem[]),
        ...customItems,
      ]);
      const { items, estimatedTotalEur, pantry } = await this.applyPantry(
        user,
        finalized.items,
        finalized.estimatedTotalEur,
        checkedKeys,
      );
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
        pantry,
      };
    }

    const rawItems = await this.buildDerivedRawItems(targetPlan);
    const finalized = await this.finalizeItems([...rawItems, ...customItems]);
    const { items, estimatedTotalEur, pantry } = await this.applyPantry(
      user,
      finalized.items,
      finalized.estimatedTotalEur,
      checkedKeys,
    );

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
      pantry,
    };
  }

  /**
   * F3 seeding: the list lines behind the given keys, as purchases. Checking
   * off upserts them into the pantry (source PURCHASE; staples excluded
   * inside PantryService); unchecking takes that purchase back — it was a
   * mis-tap, not something that is now in the kitchen (audit F-PAN-1-1).
   */
  private async purchasedItemsForKeys(
    plan: MealPlan & { days: MealPlanDay[] },
    keys: string[],
  ): Promise<{ name: string; quantity: number; unit: string }[]> {
    const stored = await prisma.shoppingList.findUnique({ where: { planId: plan.id } });
    const candidates: StoredShoppingListItem[] = [
      ...(stored?.aiGenerated
        ? tidyAiItems(stored.items as unknown as StoredShoppingListItem[])
        : await this.buildDerivedRawItems(plan)),
      ...readCustomItems(stored?.customItems),
    ];
    const wanted = new Set(keys);
    const purchased = candidates
      .filter((item) => wanted.has(item.key))
      .map((item) => ({
        name: item.ingredientName,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
      }));
    return purchased;
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
        // F3: checking off = buying — seed the pantry (all tiers: the free
        // ghost state needs the real item count/savings); unchecking reverts
        // it. Never let a pantry failure break the check-off itself.
        try {
          const purchased = await this.purchasedItemsForKeys(plan, keys);
          if (checked) await pantryService.seedFromPurchases(userId, purchased);
          else await pantryService.revertPurchases(userId, purchased);
        } catch (err) {
          console.error('[pantry] Failed to sync the pantry with a check-off:', err);
        }
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

  async regenerate(user: UserProfile, weekOffset: number): Promise<WeekShoppingList> {
    const userId = user.id;
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
      const { pantry } = await this.applyPantry(user, [], null);
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
        pantry,
      };
    }

    type MealSlotJson = { type: string; recipeId: string };
    const uniqueIds = [
      ...new Set(
        targetPlan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId)),
      ),
    ];
    const recipes = await mealPlanRepository.findRecipesByIds(uniqueIds);

    // Pre-merge with the shared aggregator before the AI call — the model
    // only needs to do the *hard* consolidation, and water/"to taste" lines
    // never reach it. This roughly halves the prompt.
    const rawIngredients = aggregateIngredientLines(
      targetPlan.days.flatMap((day) =>
        (day.meals as MealSlotJson[]).flatMap((slot) => {
          const recipe = recipes.find((r) => r.id === slot.recipeId);
          if (!recipe) return [];
          return (recipe.ingredients as unknown as Ingredient[]).map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            recipeId: slot.recipeId,
          }));
        }),
      ),
    ).map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit }));

    const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const aiResult = await aiService.generateShoppingList({
      ingredients: rawIngredients,
      weekLabel,
    });

    prisma.aiCallLog
      .create({ data: { userId, callType: AiCallType.SHOPPING_LIST } })
      .catch((err) => console.error('[aiCallLog] Failed to log SHOPPING_LIST call:', err));

    const rawItems: StoredShoppingListItem[] = tidyAiItems(
      aiResult.items.map((item) => ({
        // Stable key (no index): checked-off state in the UI survives reloads
        key: `${targetPlan.id}-ai-${item.ingredientName.toLowerCase().replace(/\s+/g, '-')}-${item.unit.toLowerCase()}`,
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        // The AI no longer categorises (saves output tokens) — infer locally
        category: item.category ?? inferCategory(item.ingredientName),
        recipeNames: [] as string[],
      })),
    );

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
    const finalized = await this.finalizeItems([
      ...rawItems,
      ...readCustomItems(stored?.customItems),
    ]);
    const { items, estimatedTotalEur, pantry } = await this.applyPantry(
      user,
      finalized.items,
      finalized.estimatedTotalEur,
    );

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
      pantry,
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
