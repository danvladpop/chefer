import { SWAP_POOL_BY_TYPE } from './fixtures/swap-recipes.fixture.js';
import { WEEK_PLAN_FIXTURE } from './fixtures/week-plan.fixture.js';
import type {
  ChatContext,
  ChatMessage,
  ExtractedRecipe,
  IAIService,
  IngredientPriceEstimate,
  MealPhotoEstimate,
  MealPlanInput,
  RecipeData,
  RecipeExtractionSource,
  ShoppingListInput,
  ShoppingListResponse,
  SwapInput,
  WeekPlanResponse,
} from './types.js';

// ─── Mock AI Service ──────────────────────────────────────────────────────────
// Deterministic fixture-based implementation used in development and testing.
// No external API calls; returns pre-baked data instantly.

export class MockAIService implements IAIService {
  // Cycle index for swap recipe pool — increments per call to avoid always
  // returning the first alternative.
  private swapIndex = 0;

  async generateMealPlan(_input: MealPlanInput): Promise<WeekPlanResponse> {
    // Simulate a brief AI "thinking" delay so the UI loading state is visible
    await delay(600);
    return WEEK_PLAN_FIXTURE;
  }

  async generateRecipeSwap(input: SwapInput): Promise<RecipeData> {
    await delay(300);

    const pool = SWAP_POOL_BY_TYPE[input.mealType] ?? SWAP_POOL_BY_TYPE['breakfast'] ?? [];
    const recipe = pool[this.swapIndex % (pool.length || 1)];
    this.swapIndex += 1;

    if (!recipe) {
      throw new Error(`No swap recipes available for meal type: ${input.mealType}`);
    }

    // Return the recipe with a fresh ID so repeated swaps don't collide
    return { ...recipe, id: `swap-${Date.now()}` };
  }

  async generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse> {
    await delay(400);
    // Merge duplicates by name+unit, return with simple category inference
    const merged = new Map<string, { quantity: number; unit: string }>();
    for (const ing of input.ingredients) {
      const key = `${ing.name.toLowerCase().trim()}|${ing.unit}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += ing.quantity;
      } else {
        merged.set(key, { quantity: ing.quantity, unit: ing.unit });
      }
    }
    return {
      items: [...merged.entries()].map(([key, data]) => {
        const name = key.split('|')[0] ?? key;
        return {
          ingredientName: name.charAt(0).toUpperCase() + name.slice(1),
          quantity: Number.isInteger(data.quantity)
            ? String(data.quantity)
            : data.quantity.toFixed(1),
          unit: data.unit,
          category: 'other' as const,
        };
      }),
    };
  }

  async estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]> {
    await delay(200);
    // Deterministic pseudo-prices derived from the name hash so dev renders
    // stable, plausible-looking values without any API call.
    return ingredientNames.map((name) => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
      const base = 0.3 + (Math.abs(hash) % 250) / 100; // €0.30 – €2.79
      const round = (v: number) => Math.round(v * 100) / 100;
      return {
        ingredientName: name,
        pricePer100gEur: round(base),
        pricePer100mlEur: round(base * 0.8),
        pricePerPieceEur: round(base * 1.2),
        caloriesPer100g: Math.round(40 + (Math.abs(hash) % 300)),
        proteinPer100g: round(2 + (Math.abs(hash) % 20)),
        carbsPer100g: round(5 + (Math.abs(hash) % 40)),
        fatPer100g: round(1 + (Math.abs(hash) % 15)),
        fiberPer100g: round(Math.abs(hash) % 8),
        gramsPerPiece: 50 + (Math.abs(hash) % 150),
      };
    });
  }

  async analyzeMealPhoto(_imageBase64: string, _mimeType: string): Promise<MealPhotoEstimate> {
    await delay(400);
    // Deterministic fixture (premium_plan.md §3.3) so F4's confirm-sheet UI
    // and quota tests iterate without live vision calls.
    return {
      dishName: 'Grilled chicken with rice and vegetables',
      confidence: 'med',
      kcal: 520,
      protein: 38,
      carbs: 55,
      fat: 14,
      portionNote: 'assuming a standard 350 g plate',
    };
  }

  async extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe> {
    await delay(400);
    // Deterministic fixture keyed loosely off the source so F5's preview/edit
    // sheet renders plausibly in dev.
    const via = source.url ? 'link' : source.imageBase64 ? 'photo' : 'text';
    return {
      name: `Rustic Tomato Basil Pasta (imported via ${via})`,
      description: 'Simple weeknight pasta with a fresh tomato sauce.',
      ingredients: [
        { name: 'spaghetti', quantity: 400, unit: 'g' },
        { name: 'tomato', quantity: 600, unit: 'g' },
        { name: 'garlic', quantity: 3, unit: 'piece' },
        { name: 'olive oil', quantity: 3, unit: 'tbsp' },
        { name: 'basil', quantity: 20, unit: 'g' },
      ],
      instructions: [
        'Cook the spaghetti in salted water until al dente.',
        'Soften garlic in olive oil, add chopped tomatoes and simmer 10 minutes.',
        'Toss the pasta with the sauce and torn basil; season and serve.',
      ],
      nutritionInfo: { calories: 480, protein: 14, carbs: 82, fat: 11, fiber: 6 },
      cuisineType: 'Italian',
      dietaryTags: ['vegetarian'],
      prepTimeMins: 10,
      cookTimeMins: 20,
      servings: 4,
    };
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream> {
    await delay(200);

    // The mock echoes the REAL per-message context and exercises the same
    // tool handlers the live path uses (P1-4) — so local dev tests the whole
    // pipeline, not a canned regex script.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const question = lastUserMessage?.content ?? '';

    let response: string;
    if (/swap/i.test(question) && context.tools) {
      const dayMatch =
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/i.exec(
          question,
        );
      const jsDay = new Date().getDay();
      const today = jsDay === 0 ? 6 : jsDay - 1;
      const DAY_INDEX: Record<string, number> = {
        monday: 0,
        tuesday: 1,
        wednesday: 2,
        thursday: 3,
        friday: 4,
        saturday: 5,
        sunday: 6,
        today,
        tomorrow: (today + 1) % 7,
      };
      const dayOfWeek = DAY_INDEX[dayMatch?.[1]?.toLowerCase() ?? 'today'] ?? today;
      const mealType =
        /\b(breakfast|lunch|dinner|snack)\b/i.exec(question)?.[1]?.toLowerCase() ?? 'lunch';
      const result = await context.tools.swapMeal({ dayOfWeek, mealType });
      response = `(Mock) ${result}`;
    } else if (/\bi (just )?(ate|had)\b/i.test(question) && context.tools) {
      // "I ate a burger" → exercises the real logMeal tool handler (F4) with
      // a deterministic estimate; the point is the pipeline, not NLP.
      const dish = question
        .replace(/^.*?\bi (just )?(ate|had)\b/i, '')
        .replace(/[.!?].*$/, '')
        .trim();
      const result = await context.tools.logMeal({
        name: dish.length > 0 ? dish : 'mock meal',
        kcal: 450,
        protein: 20,
        carbs: 45,
        fat: 18,
        mealType: 'snack',
      });
      response = `(Mock) ${result}`;
    } else if (/add\b.*\b(shopping|grocery) list/i.test(question) && context.tools) {
      // "add milk and 2 kg flour to my shopping list" → name-only items; the
      // point is exercising the real tool handler, not NLP.
      const itemsText = question
        .replace(/^.*?\badd\b/i, '')
        .replace(/\b(to|on)\b.*\b(shopping|grocery) list.*$/i, '');
      const items = itemsText
        .split(/,|\band\b/i)
        .map((s) => ({ name: s.trim() }))
        .filter((i) => i.name.length > 0);
      const result = await context.tools.addToShoppingList({
        items: items.length > 0 ? items : [{ name: 'mock item' }],
      });
      response = `(Mock) ${result}`;
    } else if (question) {
      response = `(Mock) You asked: "${question}". Here is what I know about your day:\n${context.contextSummary}`;
    } else {
      response = '(Mock) Hi! I am Chefer, your personal chef AI. How can I help you today?';
    }

    return stringToReadableStream(response);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringToReadableStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      // Emit word-by-word with a tiny gap to simulate streaming
      const words = text.split(' ');
      let i = 0;
      const push = () => {
        if (i < words.length) {
          controller.enqueue(encoder.encode((i === 0 ? '' : ' ') + (words[i] ?? '')));
          i += 1;
          setTimeout(push, 30);
        } else {
          controller.close();
        }
      };
      push();
    },
  });
}
