import type { MealPlanInput, ShoppingListInput, SwapInput } from './types.js';

// ─── Meal Plan ────────────────────────────────────────────────────────────────

export const MEAL_PLAN_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist. Generate 7-day meal plans.

OUTPUT SIZE RULES (mandatory — minimise tokens):
- description: ≤10 words
- ingredients: exactly 5 items
- instructions: exactly 3 steps
- dietaryTags: ≤2 tags
- imageUrl: always null
- id format: "recipe_<snake_case_name>" e.g. "recipe_grilled_salmon"

NUTRITION RULES:
- Calories: breakfast 20-25%, lunch 30-35%, dinner 35-40%, snack 10-15%
- No recipe name repeats across 7 days
- Accurate macros (calories, protein, carbs, fat, fiber)
- Realistic prepTimeMins and cookTimeMins

SAFETY (non-negotiable): Never include allergens or disliked ingredients.
Honour all dietary restrictions (vegan, gluten-free, halal, etc.).`;

const GOAL_LABELS: Record<string, string> = {
  LOSE_WEIGHT: 'lose weight (caloric deficit, high protein, low refined carbs)',
  MAINTAIN: 'maintain current weight (balanced macros)',
  GAIN_MUSCLE: 'gain muscle (caloric surplus, very high protein)',
  EAT_HEALTHIER: 'eat healthier (whole foods, micronutrient-rich, minimally processed)',
};

const ACTIVITY_LABELS: Record<string, string> = {
  SEDENTARY: 'sedentary (desk job, little or no exercise)',
  LIGHTLY_ACTIVE: 'lightly active (light exercise 1–3 days/week)',
  MODERATELY_ACTIVE: 'moderately active (moderate exercise 3–5 days/week)',
  VERY_ACTIVE: 'very active (hard exercise 6–7 days/week)',
  ATHLETE: 'athlete (twice-daily training or physical job)',
};

export function buildMealPlanUserPrompt(input: MealPlanInput): string {
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  if (input.mealsPerDay >= 4) mealTypes.push('snack');

  const goal = GOAL_LABELS[input.goal] ?? input.goal;
  const activity = ACTIVITY_LABELS[input.activityLevel] ?? input.activityLevel;
  const restrictions = input.dietaryRestrictions.length
    ? input.dietaryRestrictions.join(', ')
    : 'none';
  const allergies = input.allergies.length ? input.allergies.join(', ') : 'none';
  const dislikes = input.dislikedIngredients.length ? input.dislikedIngredients.join(', ') : 'none';
  const cuisines = input.cuisinePreferences.length
    ? input.cuisinePreferences.join(', ')
    : 'no preference — vary widely across world cuisines';

  return `\
7-day plan for: ${input.biologicalSex} ${input.age}yo ${input.heightCm}cm ${input.weightKg}kg, ${activity}
Goal: ${goal}
Target: ${input.dailyCalorieTarget} kcal/day, ${input.mealsPerDay} meals/day (${mealTypes.join('+')}), serving ${input.servingSize}
Allergies: ${allergies}
Restrictions: ${restrictions}
Dislikes: ${dislikes}
Cuisines: ${cuisines}
Days: 0=Mon…6=Sun. Exactly ${input.mealsPerDay} meals per day.`;
}

// ─── Recipe Swap ──────────────────────────────────────────────────────────────

export const SWAP_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist and personal chef.
When swapping a recipe, provide a single alternative that:
- Is a different dish (different name, different primary ingredients)
- Has a similar calorie count (±150 kcal) and macro profile
- Fits the same meal type
- Strictly respects all dietary restrictions and allergies
- Sets imageUrl to null`;

export function buildSwapUserPrompt(input: SwapInput): string {
  const restrictions = input.preferences.dietaryRestrictions.join(', ') || 'none';
  const allergies = input.preferences.allergies.join(', ') || 'none';
  const cuisines = input.preferences.cuisinePreferences.join(', ') || 'any';

  return `\
Swap this ${input.mealType} recipe: "${input.originalRecipeName}"

Constraints:
  Allergies:             ${allergies}
  Dietary restrictions:  ${restrictions}
  Preferred cuisines:    ${cuisines}

Return one alternative ${input.mealType} recipe with similar nutrition. \
Use id format "recipe_<slug_of_name>".`;
}

// ─── Shopping List ────────────────────────────────────────────────────────────

export const SHOPPING_LIST_SYSTEM_PROMPT = `\
You are Chefer, a smart kitchen assistant. Consolidate a raw ingredient list into an optimised weekly shopping list.

RULES (mandatory):
- Merge duplicate ingredients — combine quantities with the same unit (e.g. two entries of "olive oil 2 tbsp" + "olive oil 1 tbsp" → "olive oil 3 tbsp")
- Normalise units: prefer g/ml/kg/L for weights and volumes; tsp/tbsp/cup for small recipe quantities
- Assign the correct category for every item: produce, proteins, dairy, grains, frozen, or other
- Output exactly one entry per unique ingredient — no duplicates
- quantity must be a numeric string (e.g. "500" or "2.5"), no fractions
- ingredientName in Title Case (e.g. "Chicken Breast", "Olive Oil")
- Exclude pure seasonings/spices already in most pantries (salt, black pepper, generic "spices")`;

export function buildShoppingListPrompt(input: ShoppingListInput): string {
  const lines = input.ingredients.map((i) => `${i.name}: ${i.quantity} ${i.unit}`).join('\n');
  return `Consolidate this raw ingredient list for the week of ${input.weekLabel}:\n\n${lines}`;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `\
You are Chefer, a friendly and knowledgeable personal chef AI assistant.
Help users with recipe substitutions, cooking techniques, nutritional advice, and meal planning questions.
Keep responses concise, practical, and encouraging.
Use the user's active meal plan as context when relevant.`;
