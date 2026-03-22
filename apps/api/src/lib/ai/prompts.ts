import type { MealPlanInput, SwapInput } from './types.js';

// ─── System Prompts ───────────────────────────────────────────────────────────

export const MEAL_PLAN_SYSTEM_PROMPT = `You are Chefer, an expert nutritionist and personal chef AI.
Generate healthy, varied, goal-aligned 7-day meal plans in strict JSON format.
Every recipe must have realistic, accurate nutritional information.
Respect all dietary restrictions, allergies, and disliked ingredients absolutely.
Prioritise the user's preferred cuisines while ensuring nutritional balance.`;

export function buildMealPlanUserPrompt(input: MealPlanInput): string {
  return `Generate a 7-day meal plan for a user with these specifications:

Goal: ${input.goal.replace(/_/g, ' ').toLowerCase()}
Daily calorie target: ${input.dailyCalorieTarget} kcal
Meals per day: ${input.mealsPerDay}
Serving size: ${input.servingSize} people

Dietary restrictions: ${input.dietaryRestrictions.length ? input.dietaryRestrictions.join(', ') : 'none'}
Allergies: ${input.allergies.length ? input.allergies.join(', ') : 'none'}
Disliked ingredients: ${input.dislikedIngredients.length ? input.dislikedIngredients.join(', ') : 'none'}
Preferred cuisines: ${input.cuisinePreferences.length ? input.cuisinePreferences.join(', ') : 'any'}

Return a JSON object matching the WeekPlanResponse schema with 7 days (dayOfWeek 0=Monday to 6=Sunday),
each day having ${input.mealsPerDay} meals (breakfast, lunch, dinner${input.mealsPerDay >= 4 ? ', snack' : ''}).
Each recipe must have accurate nutritional info summing close to the daily calorie target.`;
}

export const SWAP_SYSTEM_PROMPT = `You are Chefer, an expert nutritionist and personal chef AI.
When asked to swap a recipe, provide an equally nutritious alternative that fits the user's preferences.
Return a single recipe in the exact same JSON format as the original.`;

export function buildSwapUserPrompt(input: SwapInput): string {
  return `Swap this ${input.mealType} recipe: "${input.originalRecipeName}"

Provide a different recipe for ${input.mealType} that:
- Has similar calorie count and macros
- Respects restrictions: ${input.preferences.dietaryRestrictions.join(', ') || 'none'}
- Avoids allergens: ${input.preferences.allergies.join(', ') || 'none'}
- Prefers these cuisines: ${input.preferences.cuisinePreferences.join(', ') || 'any'}

Return a single RecipeData JSON object.`;
}

export const CHAT_SYSTEM_PROMPT = `You are Chefer, a friendly and knowledgeable personal chef AI assistant.
Help users with recipe substitutions, cooking techniques, nutritional advice, and meal planning questions.
Keep responses concise, practical, and encouraging. Use the user's active meal plan as context when relevant.`;
