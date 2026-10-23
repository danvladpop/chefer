import { packagedProductRepository, type IPackagedProductRepository } from '@chefer/database';
import {
  FOOD_TEXT_LIMITS,
  type FoodTextPer100g,
  type ParsedFoodItem,
  type UserProfile,
} from '@chefer/types';
import { productDisplayName } from '@chefer/utils';
import { isAiCapacityFailure, toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type { FoodTextParseItem, IAIService } from '../../lib/ai/types.js';
import { reserveFoodText } from '../../lib/quotas.js';
import { ingredientsService } from '../ingredients/ingredients.service.js';
import { trackerService, type RecentTrackerEntry } from '../tracker/tracker.service.js';

// ─── Typed "I ate…" logging (lane A4) ─────────────────────────────────────────
// The AI only splits the sentence and guesses amounts. Each item's NUMBERS
// come from the most trusted thing Chefer already knows, in this order:
//   1. one of the user's recent logs with the same name (their own numbers),
//   2. their own packaged product, or a cached product with that exact name,
//   3. Chefer's ingredient catalog,
//   4. only then the model's own estimate (logged as "estimated").
// Nothing is logged here: the client shows the list, the user edits amounts
// and confirms, and `tracker.logItems` writes the entries.

const FAILED = 'We couldn’t read that just now. Try again, or search for each food.';

export function normaliseFoodName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d+(\.\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?<=\w{3})s$/, '');
}

/** "egg" names "Egg" or "Eggs, boiled" but not "Eggplant": a whole leading word match. */
function namesSameFood(candidate: string, food: string): boolean {
  const c = normaliseFoodName(candidate);
  const f = normaliseFoodName(food);
  return c === f || c.startsWith(`${f} `);
}

function estimatePer100g(item: FoodTextParseItem): FoodTextPer100g {
  return {
    kcal: item.kcalPer100g,
    protein: item.proteinPer100g,
    carbs: item.carbsPer100g,
    fat: item.fatPer100g,
  };
}

export interface FoodTextDeps {
  ai: Pick<IAIService, 'parseFoodText'>;
  products: Pick<IPackagedProductRepository, 'search'>;
  searchIngredients: typeof ingredientsService.search;
  recents: (userId: string) => Promise<RecentTrackerEntry[]>;
}

export class FoodTextService {
  constructor(
    private readonly deps: FoodTextDeps = {
      ai: aiService,
      products: packagedProductRepository,
      searchIngredients: (...args) => ingredientsService.search(...args),
      recents: (userId) => trackerService.recents(userId, 30),
    },
  ) {}

  private async match(
    userId: string,
    item: FoodTextParseItem,
    recents: RecentTrackerEntry[],
    key: string,
  ): Promise<ParsedFoodItem> {
    const base = { key, text: item.text };
    const recent = recents.find(
      (r) =>
        normaliseFoodName(r.name) === normaliseFoodName(item.food) ||
        normaliseFoodName(r.name) === normaliseFoodName(item.text),
    );
    if (recent) {
      return {
        ...base,
        name: recent.name,
        source: 'recent',
        unit: 'serving',
        servings: item.count ?? 1,
        perServing: {
          kcal: recent.kcal,
          protein: recent.protein,
          carbs: recent.carbs,
          fat: recent.fat,
        },
      };
    }

    const products = await this.deps.products.search(item.food, userId, 3);
    const product = products.find(
      (p) =>
        p.kcalPer100g !== null &&
        (p.ownerId === userId ||
          namesSameFood(p.name, item.food) ||
          namesSameFood(productDisplayName(p), item.food)),
    );
    if (product && product.kcalPer100g !== null) {
      return {
        ...base,
        name: productDisplayName(product),
        source: 'product',
        productId: product.id,
        unit: 'g',
        grams: Math.round(item.grams),
        per100g: {
          kcal: product.kcalPer100g,
          protein: product.proteinPer100g,
          carbs: product.carbsPer100g,
          fat: product.fatPer100g,
        },
      };
    }

    const ingredients = await this.deps.searchIngredients(userId, item.food, 5);
    const ingredient = ingredients.find(
      (i) => i.per100g !== null && namesSameFood(i.displayName, item.food),
    );
    if (ingredient?.per100g) {
      return {
        ...base,
        name: ingredient.displayName,
        source: 'ingredient',
        unit: 'g',
        grams: Math.round(item.grams),
        per100g: {
          kcal: ingredient.per100g.calories,
          protein: ingredient.per100g.protein,
          carbs: ingredient.per100g.carbs,
          fat: ingredient.per100g.fat,
        },
      };
    }

    return {
      ...base,
      name: item.food.charAt(0).toUpperCase() + item.food.slice(1),
      source: 'estimate',
      unit: 'g',
      grams: Math.round(item.grams),
      per100g: estimatePer100g(item),
    };
  }

  /** Quota (free 10/day) → AI split → matching. AI consent is checked at the router. */
  async parse(user: UserProfile, text: string): Promise<{ items: ParsedFoodItem[] }> {
    const reservation = await reserveFoodText(user);
    let parsed: FoodTextParseItem[];
    try {
      parsed = await this.deps.ai.parseFoodText(text);
    } catch (err) {
      if (isAiCapacityFailure(err)) await reservation.release();
      throw toFriendlyAiError(err, 'parseFoodText', FAILED);
    }
    const items = parsed.slice(0, FOOD_TEXT_LIMITS.maxItems);
    if (items.length === 0) return { items: [] };
    const recents = await this.deps.recents(user.id);
    return {
      items: await Promise.all(items.map((item, i) => this.match(user.id, item, recents, `${i}`))),
    };
  }
}

export const foodTextService = new FoodTextService();
