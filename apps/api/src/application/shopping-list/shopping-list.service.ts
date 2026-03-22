import { chefProfileRepository, mealPlanRepository } from '@chefer/database';
import type { Ingredient } from '../../lib/ai/types.js';
import { groceryAIService } from '../../lib/grocery-ai/index.js';
import type { GroceryCategory, GrocerySearchResult } from '../../lib/grocery-ai/index.js';

export interface ShoppingListItemForWeek {
  key: string;
  ingredientName: string;
  quantity: string;
  unit: string;
  category: GroceryCategory;
  recipeNames: string[];
}

export interface WeekShoppingList {
  planId: string | null;
  weekStartDate: string;
  weekEndDate: string;
  hasPlan: boolean;
  items: ShoppingListItemForWeek[];
  weekOffset: number;
}

const CATEGORY_MAP: Record<string, GroceryCategory> = {
  tomato: 'produce',
  spinach: 'produce',
  onion: 'produce',
  garlic: 'produce',
  lemon: 'produce',
  lime: 'produce',
  avocado: 'produce',
  mushroom: 'produce',
  pepper: 'produce',
  lettuce: 'produce',
  cucumber: 'produce',
  zucchini: 'produce',
  carrot: 'produce',
  broccoli: 'produce',
  celery: 'produce',
  kale: 'produce',
  apple: 'produce',
  banana: 'produce',
  berry: 'produce',
  fruit: 'produce',
  shallot: 'produce',
  herb: 'produce',
  cilantro: 'produce',
  parsley: 'produce',
  chicken: 'proteins',
  beef: 'proteins',
  salmon: 'proteins',
  tuna: 'proteins',
  egg: 'proteins',
  tofu: 'proteins',
  shrimp: 'proteins',
  turkey: 'proteins',
  pork: 'proteins',
  lamb: 'proteins',
  cod: 'proteins',
  fish: 'proteins',
  milk: 'dairy',
  cheese: 'dairy',
  yogurt: 'dairy',
  butter: 'dairy',
  cream: 'dairy',
  parmesan: 'dairy',
  mozzarella: 'dairy',
  feta: 'dairy',
  rice: 'grains',
  pasta: 'grains',
  flour: 'grains',
  bread: 'grains',
  oat: 'grains',
  quinoa: 'grains',
  lentil: 'grains',
  bean: 'grains',
  oil: 'grains',
  vinegar: 'grains',
  soy: 'grains',
  honey: 'grains',
  almond: 'grains',
  walnut: 'grains',
  cashew: 'grains',
  nut: 'grains',
  chickpea: 'grains',
  coconut: 'grains',
};

function inferCategory(name: string): GroceryCategory {
  const lower = name.toLowerCase();
  for (const [keyword, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) return cat;
  }
  return 'other';
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
  async getForWeek(userId: string, weekOffset: number): Promise<WeekShoppingList> {
    const weekStart = getMondayOfWeek(weekOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Find plan for this week
    const allPlans = await mealPlanRepository.findAllByUserId(userId, 52, 0);

    // Find plan whose weekStartDate is closest to weekStart
    let targetPlan = allPlans.find((p) => {
      const planMonday = new Date(p.weekStartDate);
      planMonday.setHours(0, 0, 0, 0);
      const targetMonday = new Date(weekStart);
      targetMonday.setHours(0, 0, 0, 0);
      return Math.abs(planMonday.getTime() - targetMonday.getTime()) < 7 * 24 * 60 * 60 * 1000;
    });

    // If no plan for this week, for offset 0 use active plan
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

    // Aggregate ingredients
    const merged = new Map<
      string,
      { quantity: number; unit: string; category: GroceryCategory; recipeIds: Set<string> }
    >();

    for (const day of targetPlan.days) {
      for (const slot of day.meals as MealSlotJson[]) {
        const recipe = recipeMap.get(slot.recipeId);
        if (!recipe) continue;
        const ingredients = recipe.ingredients as unknown as Ingredient[];
        for (const ing of ingredients) {
          const key = ing.name.toLowerCase().trim();
          const existing = merged.get(key);
          if (existing && existing.unit === ing.unit) {
            existing.quantity += ing.quantity;
            existing.recipeIds.add(slot.recipeId);
          } else {
            merged.set(key, {
              quantity: ing.quantity,
              unit: ing.unit,
              category: inferCategory(ing.name),
              recipeIds: new Set([slot.recipeId]),
            });
          }
        }
      }
    }

    const items: ShoppingListItemForWeek[] = [...merged.entries()].map(([name, data]) => ({
      key: `${targetPlan!.id}-${name}`,
      ingredientName: name.charAt(0).toUpperCase() + name.slice(1),
      quantity: Number.isInteger(data.quantity) ? String(data.quantity) : data.quantity.toFixed(1),
      unit: data.unit,
      category: data.category,
      recipeNames: [...data.recipeIds].map((id) => recipeMap.get(id)?.name ?? '').filter(Boolean),
    }));

    return {
      planId: targetPlan.id,
      weekStartDate: weekStart.toISOString(),
      weekEndDate: weekEnd.toISOString(),
      hasPlan: true,
      items,
      weekOffset,
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
