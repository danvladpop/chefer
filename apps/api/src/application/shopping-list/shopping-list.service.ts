import { TRPCError } from '@trpc/server';
import {
  chefProfileRepository,
  mealPlanRepository,
  pantryItemRepository,
  prisma,
  type MealPlan,
  type MealPlanDay,
  type PlanMealSlotJson,
} from '@chefer/database';
import { LABEL_DEPENDENT_INGREDIENTS, type TableSafety, type UserProfile } from '@chefer/types';
import { roundToPurchasable } from '@chefer/utils';
import type { Ingredient } from '../../lib/ai/types.js';
import { hasFeature } from '../../lib/entitlements.js';
import { groceryAIService } from '../../lib/grocery-ai/index.js';
import type { GroceryCategory, GrocerySearchResult } from '../../lib/grocery-ai/index.js';
import { resolveIngredientImage } from '../../lib/ingredient-images/index.js';
import {
  estimateItemPriceEur,
  normalizeIngredientName,
  visibleToUser,
} from '../../lib/ingredient-prices/index.js';
import { ingredientPriceWorker } from '../../workers/ingredient-price.worker.js';
import { householdService } from '../household/household.service.js';
import { planForThisWeek } from '../meal-plan/plan-for-date.js';
import { buildPantryCoverageMatcher } from '../pantry/pantry-match.js';
import { PANTRY_RETIRED } from '../pantry/pantry-retired.js';
import { pantryService } from '../pantry/pantry.service.js';
import { safetyService } from '../safety/safety.service.js';
import { inferCategory } from '../shared/category-map.js';
import { slotShopFactor, type PortionTable } from '../shared/household-scale.js';
import { daysFrom, firstShoppingDay } from '../shared/plan-window.js';
import {
  aggregateIngredientLines,
  canonicalIngredientName,
  formatLineQuantity,
  tidyListItems,
} from './aggregate.js';
import { customItemKey } from './custom-item-key.js';

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
  /**
   * Bug B-24 (T-BUG-24): the pantry has SOME of this line but not all of it
   * — `quantity`/`estimatedPriceEur` above are already reduced to the
   * remaining amount to buy, and this is what the pantry already covers (in
   * the same unit), so the UI can say "You have {haveQuantity} of {need +
   * haveQuantity} · Buy {quantity}". Only ever set for `pantryPlanning`
   * accounts; absent for a full match (`pantryCovered: true` instead) or no
   * match at all.
   */
  haveQuantity?: number;
  /**
   * §2.2, T-01.9/T-02.1: diet labels (e.g. "Gluten-free") this line needs a
   * certified product for — it's a label-dependent ingredient (stock, curry
   * powder, soy sauce…) that CAN be safe but isn't guaranteed to be. Present
   * only when the table has a diet this applies to; the client renders
   * `LabelCaveat` / "Buy certified gluten-free".
   */
  labelCheck?: string[];
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
  /**
   * First day (0 = Monday) the list covers when the plan was made mid-week
   * (audit F-PM-3); absent = the whole week. Additive.
   */
  fromDayOfWeek?: number;
  /**
   * Portions the list's quantities and total are sized for — present only
   * when a premium household's list was scaled to the whole table (backlog
   * P2-3, audit F-PM-5). Absent = recipes as written (single portion for
   * curated plans). Per-person cost = total ÷ this, never ÷ head count.
   */
  portions?: number;
  /**
   * §2.2, T-02.1/T-02.4: the read-back table this list's `labelCheck` lines
   * were computed against — the Shop header's Checked/needs-a-look line.
   */
  tableSafety?: TableSafety;
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
 * FB7-10: the list is never AI-written any more, but rows stored by the old
 * "Regenerate with AI" still exist. They are read only to carry their ticks
 * over to the derived list — and get the derived list's rules (aggregate.ts): no water
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

/** `fromDayOfWeek` for a response, only when the plan was made mid-week. */
function fromDayField(plan: { weekStartDate: Date; createdAt: Date }): { fromDayOfWeek?: number } {
  const from = firstShoppingDay(plan.weekStartDate, plan.createdAt);
  return from > 0 ? { fromDayOfWeek: from } : {};
}

/**
 * Check-offs for a regenerated list: every new row whose canonical name was
 * ticked before, plus ticked custom items (their keys are stable).
 */
export function carryCheckedKeys(
  previousChecked: string[],
  previousItems: { key: string; ingredientName: string; isCustom?: boolean }[],
  nextItems: { key: string; ingredientName: string }[],
): string[] {
  const ticked = new Set(previousChecked);
  const tickedNames = new Set(
    previousItems
      .filter((i) => ticked.has(i.key) && !i.isCustom)
      .map((i) => canonicalIngredientName(i.ingredientName)),
  );
  const carried = nextItems
    .filter((i) => tickedNames.has(canonicalIngredientName(i.ingredientName)))
    .map((i) => i.key);
  const customTicked = previousItems
    .filter((i) => i.isCustom && ticked.has(i.key))
    .map((i) => i.key);
  return [...new Set([...carried, ...customTicked])];
}

/**
 * T-01.9/T-02.1: flags list lines that need a certified product for a
 * gluten-free member's table — the same label-dependent ingredient list
 * `findLabelCaveats` runs against a recipe's ingredients (bug B-47), applied
 * here to a shopping-list line's plain ingredient name. Additive: a table
 * with no gluten-free diet (or no rules at all) leaves every item unchanged.
 */
function withLabelChecks(
  items: ShoppingListItemForWeek[],
  table: TableSafety,
): ShoppingListItemForWeek[] {
  const glutenFreeLabels = [
    ...new Set(
      table.people
        .flatMap((p) => p.items)
        .filter((i) => i.kind === 'diet' && /gluten-free/i.test(i.label))
        .map((i) => i.label),
    ),
  ];
  if (glutenFreeLabels.length === 0) return items;
  return items.map((item) => {
    const name = item.ingredientName.toLowerCase();
    const isLabelDependent = LABEL_DEPENDENT_INGREDIENTS.some((ing) => name.includes(ing));
    return isLabelDependent ? { ...item, labelCheck: glutenFreeLabels } : item;
  });
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
  private async finalizeItems(
    rawItems: StoredShoppingListItem[],
    userId: string,
  ): Promise<{
    items: ShoppingListItemForWeek[];
    estimatedTotalEur: number | null;
  }> {
    const normalizedNames = rawItems.map((i) => normalizeIngredientName(i.ingredientName));
    const priceRows = await prisma.ingredientPrice.findMany({
      where: { ingredientName: { in: normalizedNames }, ...visibleToUser(userId) },
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
    // FB7-10: the pantry is retired — nothing is marked "have it" or subtracted.
    if (PANTRY_RETIRED) {
      return {
        items,
        estimatedTotalEur,
        pantry: { entitled: false, itemCount: 0, savedEur: 0 },
      };
    }
    const entitled = hasFeature(user, 'pantryPlanning');
    const pantryRows = await pantryItemRepository.findByUser(user.id);
    if (pantryRows.length === 0) {
      return { items, estimatedTotalEur, pantry: { entitled, itemCount: 0, savedEur: 0 } };
    }

    const matcher = buildPantryCoverageMatcher(
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
    const round = (v: number) => Math.round(v * 100) / 100;

    // Bug B-24 (T-BUG-24): a pantry row that covers SOME but not all of a
    // line is a PARTIAL match — the item stays on the list at its remaining
    // (need − have) amount, instead of either the whole line or nothing.
    const marked = items.map((item) => {
      if (item.isCustom || ticked.has(item.key)) return item;
      const need = parseFloat(item.quantity);
      const hit = matcher(item.ingredientName, { quantity: need, unit: item.unit });
      if (!hit) return item;
      if (hit.haveQuantity === null || hit.haveQuantity >= need) {
        return { ...item, pantryCovered: true };
      }
      if (hit.haveQuantity <= 0) return item;
      const remaining = need - hit.haveQuantity;
      const priceFactor = need > 0 ? remaining / need : 1;
      // Still a shopping-sized amount: 2 avocados − 1.2 in the pantry is 1, not 0.8.
      const toBuy = roundToPurchasable({
        name: item.ingredientName,
        quantity: remaining,
        unit: item.unit,
      });
      return {
        ...item,
        haveQuantity: round(hit.haveQuantity),
        quantity: formatLineQuantity(toBuy.quantity),
        unit: toBuy.unit,
        ...(item.estimatedPriceEur !== null && {
          estimatedPriceEur: round(item.estimatedPriceEur * priceFactor),
        }),
      };
    });

    const originalPriceByKey = new Map(items.map((item) => [item.key, item.estimatedPriceEur]));
    const savedEur = round(
      marked
        .filter((item) => item.pantryCovered)
        .reduce((sum, item) => sum + (originalPriceByKey.get(item.key) ?? 0), 0),
    );
    const pantry: ShoppingListPantryInfo = { entitled, itemCount: pantryRows.length, savedEur };

    if (!entitled) return { items, estimatedTotalEur, pantry };

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
    table: PortionTable | null = null,
  ): Promise<StoredShoppingListItem[]> {
    type MealSlotJson = PlanMealSlotJson;
    const uniqueIds = [
      ...new Set(
        targetPlan.days.flatMap((d) => (d.meals as MealSlotJson[]).map((m) => m.recipeId)),
      ),
    ];
    const recipes = await mealPlanRepository.findRecipesByIds(uniqueIds);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    // One aggregation for the list, the AI prompt and the planner's cost chip
    // (aggregate.ts, audit F-SHOP-1-1/1-3).
    const shopFrom = firstShoppingDay(targetPlan.weekStartDate, targetPlan.createdAt);
    const lines = aggregateIngredientLines(
      daysFrom(targetPlan.days, shopFrom).flatMap((day) =>
        (day.meals as MealSlotJson[]).flatMap((slot) => {
          const recipe = recipeMap.get(slot.recipeId);
          if (!recipe) return [];
          // P1-1: a portioned slot (1.5× of one serving) is the eater's share;
          // the table (premium members, or "two of us") adds the others'
          // servings on top (P2-3, UX-PLAN-02, UX-REC-02).
          const factor = slotShopFactor(slot.portion, recipe.servings, table);
          return (recipe.ingredients as unknown as Ingredient[]).map((ing) => ({
            name: ing.name,
            quantity: ing.quantity * factor,
            unit: ing.unit,
            recipeId: slot.recipeId,
            slug: ing.slug,
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

  /**
   * FB7-10: carries the ticks of a stored AI-consolidated list onto the derived
   * list and resets the row to a plain check-off row. Returns the check-off keys
   * to serve. A row that was never AI-generated is returned as is.
   */
  private async retireStoredAiList(
    stored: { planId: string; aiGenerated: boolean; items: unknown; checkedKeys: string[] } | null,
    derived: StoredShoppingListItem[],
    custom: StoredShoppingListItem[],
  ): Promise<string[]> {
    const checked = [...new Set(stored?.checkedKeys ?? [])];
    if (!stored?.aiGenerated) return checked;

    const liveKeys = new Set([...derived, ...custom].map((i) => i.key));
    const carried = carryCheckedKeys(
      checked,
      [...tidyAiItems(stored.items as StoredShoppingListItem[]), ...custom],
      derived,
    );
    const next = [...new Set([...carried, ...checked.filter((k) => liveKeys.has(k))])];
    try {
      await prisma.shoppingList.updateMany({
        where: { planId: stored.planId, aiGenerated: true },
        data: { items: [], aiGenerated: false, checkedKeys: next },
      });
    } catch (err) {
      // Best effort: the next read maps the same ticks again.
      console.error('[shopping-list] Failed to retire a stored AI list:', err);
    }
    return next;
  }

  async getForWeek(user: UserProfile, weekOffset: number): Promise<WeekShoppingList> {
    const userId = user.id;
    const weekStart = getMondayOfWeek(weekOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Find the plan for this week (single indexed query). B-13/T-00.15: this
    // used to fall back to findActiveWithDays for offset 0 — whichever plan
    // happened to be ACTIVE, any week — which leaked a later week's plan
    // into "this week"'s Shop view once that week became the sole active
    // plan (every Sunday planner's view). findForWeek only ever matches
    // THIS calendar week.
    const targetPlan = await mealPlanRepository.findForWeek(userId, weekStart);
    // T-01.9/T-02.1: the one read-back table every list line's `labelCheck`
    // and the header's Checked/needs-a-look line are computed against.
    const safetyTable = (await safetyService.loadContext(userId)).table;

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
        tableSafety: safetyTable,
      };
    }

    // The stored row holds the synced check-off state (P1-5) and the user's
    // custom items. FB7-10: its `items` are never served any more — the list is
    // always derived from the plan's recipes, even when the row still carries
    // an old AI-consolidated list (`aiGenerated`).
    const stored = await prisma.shoppingList.findUnique({ where: { planId: targetPlan.id } });
    // Premium households get the list sized for the whole table (P2-3).
    const portions = await householdService.scalingPortions(user);
    const table = await householdService.scalingTable(user);
    const sized = portions !== null ? { portions } : {};
    // User-added items overlay the derived list.
    const customItems = readCustomItems(stored?.customItems);
    const rawItems = await this.buildDerivedRawItems(targetPlan, table);
    // Ticks made on an old AI list (keys `<plan>-ai-…`) map onto the derived
    // rows by canonical name, once, and the row is then reset to a plain
    // check-off row (a later untick of the derived row must not be undone by
    // the stale AI key).
    const checkedKeys = await this.retireStoredAiList(stored, rawItems, customItems);
    const finalized = await this.finalizeItems([...rawItems, ...customItems], userId);
    const { items, estimatedTotalEur, pantry } = await this.applyPantry(
      user,
      finalized.items,
      finalized.estimatedTotalEur,
      checkedKeys,
    );

    return {
      planId: targetPlan.id,
      ...fromDayField(targetPlan),
      weekStartDate: weekStart.toISOString(),
      weekEndDate: weekEnd.toISOString(),
      hasPlan: true,
      items: withLabelChecks(items, safetyTable),
      weekOffset,
      estimatedTotalEur,
      aiGenerated: false,
      checkedKeys,
      pantry,
      tableSafety: safetyTable,
      ...sized,
    };
  }

  /**
   * The plan's list lines exactly as `getForWeek` serves them (before
   * pricing): the derived lines (FB7-10: never the old AI rows) — slot portions (P1-1) and the premium household scale (P2-3) included —
   * plus the user's custom items.
   */
  private async listLinesForPlan(
    user: UserProfile,
    plan: MealPlan & { days: MealPlanDay[] },
  ): Promise<StoredShoppingListItem[]> {
    const stored = await prisma.shoppingList.findUnique({ where: { planId: plan.id } });
    return [
      ...(await this.buildDerivedRawItems(plan, await householdService.scalingTable(user))),
      ...readCustomItems(stored?.customItems),
    ];
  }

  /**
   * F3 seeding: the list lines behind the given keys, as purchases. Checking
   * off upserts them into the pantry (source PURCHASE; staples excluded
   * inside PantryService); unchecking takes that purchase back — it was a
   * mis-tap, not something that is now in the kitchen (audit F-PAN-1-1).
   * The quantity is the one the list shows, household scale included — a
   * family of four ticking "Chicken 1.2 kg" bought 1.2 kg, not one
   * recipe's 300 g.
   */
  private async purchasedItemsForKeys(
    user: UserProfile,
    plan: MealPlan & { days: MealPlanDay[] },
    keys: string[],
  ): Promise<{ name: string; quantity: number; unit: string }[]> {
    const wanted = new Set(keys);
    return (await this.listLinesForPlan(user, plan))
      .filter((item) => wanted.has(item.key))
      .map((item) => ({
        name: item.ingredientName,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
      }));
  }

  /**
   * Toggles membership of `keys` in the plan's checked set (P1-5). Additive
   * per-key semantics (not whole-array replace) so two devices checking
   * different items concurrently both win. Creates a bare row when the plan
   * has no persisted list yet.
   */
  async toggleItems(
    user: UserProfile,
    planId: string,
    keys: string[],
    checked: boolean,
  ): Promise<{ checkedKeys: string[] }> {
    const userId = user.id;
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
        // FB7-10: retired — ticking an item no longer touches the pantry.
        if (!PANTRY_RETIRED) {
          try {
            const purchased = await this.purchasedItemsForKeys(user, plan, keys);
            if (checked) await pantryService.seedFromPurchases(userId, purchased);
            else await pantryService.revertPurchases(userId, purchased);
          } catch (err) {
            console.error('[pantry] Failed to sync the pantry with a check-off:', err);
          }
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

  /**
   * FB7-10: the AI tidy-up is gone. Kept only so shipped binaries that still
   * call `shoppingList.regenerate` get a valid answer: it returns the derived
   * list exactly as `getForWeek` serves it, without calling the AI (and without
   * logging an AI call).
   */
  async regenerate(user: UserProfile, weekOffset: number): Promise<WeekShoppingList> {
    return this.getForWeek(user, weekOffset);
  }

  async searchStores(
    user: UserProfile,
    planId: string,
    userLat?: number,
    userLng?: number,
    deliveryAddress?: string,
  ): Promise<GrocerySearchResult> {
    const userId = user.id;
    const allPlans = await mealPlanRepository.findAllByUserId(userId, 52, 0);
    const plan =
      allPlans.find((p) => p.id === planId) ?? (await planForThisWeek(mealPlanRepository, userId));

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

    // The stores are searched for the list the user sees — aggregated across
    // the week, per slot portion and household scale — not each recipe's
    // ingredients once (which under-bought every repeated or 2× dish).
    const ingredients = (await this.listLinesForPlan(user, plan)).map((item) => ({
      name: item.ingredientName,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    }));

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
