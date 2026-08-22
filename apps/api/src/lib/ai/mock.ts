import { SWAP_POOL_BY_TYPE } from './fixtures/swap-recipes.fixture.js';
import { WEEK_PLAN_FIXTURE } from './fixtures/week-plan.fixture.js';
import type {
  ChatContext,
  ChatMessage,
  IAIService,
  IngredientPriceEstimate,
  MealPlanInput,
  RecipeData,
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
