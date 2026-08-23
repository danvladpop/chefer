import type { ChatTools } from './types.js';

// ─── Shared chat tool definitions + dispatch ─────────────────────────────────
// Single source of truth for the chat tool surface (P1-4 + wave 1/2 tools).
// Providers translate `parameters` (a neutral JSON-Schema subset) into their
// own function-calling format: gemini.ts converts to @google/genai Schema,
// openai.ts passes it through as standard JSON Schema.

/** Neutral JSON-Schema subset — the intersection both providers understand. */
export interface ChatToolParamSchema {
  type: 'object' | 'string' | 'number' | 'array';
  description?: string;
  properties?: Record<string, ChatToolParamSchema>;
  required?: string[];
  items?: ChatToolParamSchema;
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: ChatToolParamSchema;
}

export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: 'swapMeal',
    description:
      "Swaps one meal slot in the user's active weekly plan for an alternative recipe. Use when the user asks to swap, change or replace a meal.",
    parameters: {
      type: 'object',
      properties: {
        dayOfWeek: { type: 'number', description: 'Day to swap: 0=Monday … 6=Sunday' },
        mealType: { type: 'string', description: 'One of: breakfast, lunch, dinner, snack' },
      },
      required: ['dayOfWeek', 'mealType'],
    },
  },
  {
    name: 'scaleRecipe',
    description:
      "Rescales the ingredient quantities of a recipe from the user's active plan to a different number of servings.",
    parameters: {
      type: 'object',
      properties: {
        recipeName: {
          type: 'string',
          description: 'Name (or distinctive part of the name) of the recipe to scale',
        },
        servings: { type: 'number', description: 'Desired number of servings' },
      },
      required: ['recipeName', 'servings'],
    },
  },
  {
    name: 'addToShoppingList',
    description:
      "Adds one or more items to the user's shopping list for this week. Use when the user asks to add, put or remember something on the shopping/grocery list.",
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items to add',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Ingredient or product name' },
              quantity: { type: 'number', description: 'Amount (defaults to 1 if omitted)' },
              unit: {
                type: 'string',
                description: 'Unit, e.g. g, kg, ml, l, pcs (defaults to pcs)',
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'getMyReview',
    description:
      "Fetches the user's latest weekly chef review: logging adherence, average calories, weight trend and any calorie-target adjustment. Use when the user asks about their weekly review, check-in, progress, or why their calorie budget changed.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'logMeal',
    description:
      "Logs a meal the user says they ATE (off-plan food: 'I ate a burger', 'had a croissant') into today's tracker with your best realistic macro estimate. Do not use it for planned meals.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short dish name, e.g. "Cheeseburger"' },
        kcal: { type: 'number', description: 'Estimated calories for the portion' },
        protein: { type: 'number', description: 'Estimated protein in grams' },
        carbs: { type: 'number', description: 'Estimated carbs in grams' },
        fat: { type: 'number', description: 'Estimated fat in grams' },
        mealType: {
          type: 'string',
          description: 'One of: breakfast, lunch, dinner, snack (default snack)',
        },
      },
      required: ['name', 'kcal'],
    },
  },
  {
    name: 'importRecipe',
    description:
      "Imports a recipe from a web URL into the user's collection, adapted to their allergies and preferences (Cheferize). Use when the user shares a recipe link and wants it imported, saved or adapted.",
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full http(s) URL of the recipe page' },
      },
      required: ['url'],
    },
  },
  {
    name: 'whatCanIMake',
    description:
      "Lists the recipes the user can (mostly) cook from what is already in their kitchen/pantry. Use when the user asks what they can make, cook or eat with what they have, or what's in their pantry.",
    parameters: { type: 'object', properties: {} },
  },
];

/**
 * Resolves one model-requested tool call against the real ChatTools
 * implementations. Failures are returned as text (never thrown) so the model
 * can relay them conversationally.
 */
export async function dispatchChatTool(
  name: string,
  args: Record<string, unknown>,
  tools: ChatTools,
): Promise<string> {
  try {
    if (name === 'swapMeal') {
      return await tools.swapMeal({
        dayOfWeek: Number(args['dayOfWeek']),
        mealType: String(args['mealType']),
      });
    }
    if (name === 'scaleRecipe') {
      return await tools.scaleRecipe({
        recipeName: String(args['recipeName']),
        servings: Number(args['servings']),
      });
    }
    if (name === 'importRecipe') {
      return await tools.importRecipe({ url: String(args['url']) });
    }
    if (name === 'addToShoppingList') {
      return await tools.addToShoppingList({
        items: Array.isArray(args['items'])
          ? (args['items'] as { name: string; quantity?: number; unit?: string }[])
          : [],
      });
    }
    if (name === 'getMyReview') {
      return await tools.getMyReview();
    }
    if (name === 'whatCanIMake') {
      return await tools.whatCanIMake();
    }
    if (name === 'logMeal') {
      const mealType = typeof args['mealType'] === 'string' ? args['mealType'] : undefined;
      return await tools.logMeal({
        name: typeof args['name'] === 'string' ? args['name'] : '',
        kcal: Number(args['kcal']),
        ...(args['protein'] != null ? { protein: Number(args['protein']) } : {}),
        ...(args['carbs'] != null ? { carbs: Number(args['carbs']) } : {}),
        ...(args['fat'] != null ? { fat: Number(args['fat']) } : {}),
        ...(mealType !== undefined ? { mealType } : {}),
      });
    }
    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Tool failed: ${err instanceof Error ? err.message : 'unknown error'}`;
  }
}

/**
 * Word-chunked fake stream of an already-resolved answer — preserves the chat
 * widget's streaming UX even though tool resolution was request/response.
 */
export function streamText(finalText: string): ReadableStream {
  const encoder = new TextEncoder();
  const words = finalText.split(/(?<= )/);
  return new ReadableStream({
    async start(controller) {
      try {
        for (const word of words) {
          controller.enqueue(encoder.encode(word));
          await new Promise((r) => setTimeout(r, 12));
        }
      } finally {
        controller.close();
      }
    },
  });
}
