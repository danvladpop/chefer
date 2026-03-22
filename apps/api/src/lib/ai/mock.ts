import type {
  IAIService,
  MealPlanInput,
  SwapInput,
  WeekPlanResponse,
  RecipeData,
  ChatMessage,
  ChatContext,
} from './types.js';
import { WEEK_PLAN_FIXTURE } from './fixtures/week-plan.fixture.js';
import { SWAP_POOL_BY_TYPE } from './fixtures/swap-recipes.fixture.js';

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

  async chat(
    messages: ChatMessage[],
    _context: ChatContext,
  ): Promise<ReadableStream> {
    await delay(200);

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const response = lastUserMessage
      ? `(Mock) You asked: "${lastUserMessage.content}". In a real deployment this would be answered by the live AI. For now, check the meal plan and enjoy your week!`
      : '(Mock) Hi! I am Chefer, your personal chef AI. How can I help you today?';

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
          controller.enqueue(encoder.encode((i === 0 ? '' : ' ') + words[i]));
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
