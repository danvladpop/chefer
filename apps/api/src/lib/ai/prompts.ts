import type { MealPlanInput, SwapInput } from './types.js';

// ─── Meal Plan ────────────────────────────────────────────────────────────────

export const MEAL_PLAN_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist and personal chef.
Your job is to design complete, realistic 7-day meal plans tailored to a person's goals, \
body metrics, dietary needs, and cuisine tastes.

Rules you must follow absolutely:
- NEVER include ingredients the user is allergic to — this is a safety requirement.
- NEVER include ingredients the user dislikes.
- Honour every dietary restriction (vegan, gluten-free, halal, etc.) without exception.
- Each recipe must have accurate, realistic nutritional information.
- Spread calories across the day according to meal type: \
  breakfast 20–25%, lunch 30–35%, dinner 35–40%, snack 10–15%.
- Ensure variety: no recipe name should repeat across the 7 days.
- Adapt portion sizes to the serving size multiplier provided.
- Prefer the user's listed cuisines while ensuring the week stays nutritionally balanced.
- Every recipe must be practical to prepare at home (real ingredients, real techniques).
- prepTimeMins and cookTimeMins must be realistic for the dish.
- Set imageUrl to null — it will be filled in separately.
- Generate a stable id for each recipe using the format: \
  "recipe_<slug_of_name>" (e.g. "recipe_grilled_salmon_bowl").`;

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
Create a personalised 7-day meal plan for this person:

PROFILE
  Goal:            ${goal}
  Sex:             ${input.biologicalSex}
  Age:             ${input.age} years
  Height:          ${input.heightCm} cm
  Weight:          ${input.weightKg} kg
  Activity level:  ${activity}

NUTRITION TARGETS
  Daily calories:  ${input.dailyCalorieTarget} kcal
  Meals per day:   ${input.mealsPerDay} (${mealTypes.join(', ')})
  Serving size:    ${input.servingSize} ${input.servingSize === 1 ? 'person' : 'people'}

DIETARY CONSTRAINTS (non-negotiable)
  Allergies:             ${allergies}
  Dietary restrictions:  ${restrictions}
  Disliked ingredients:  ${dislikes}

PREFERENCES
  Preferred cuisines: ${cuisines}

Generate all 7 days (dayOfWeek 0 = Monday … 6 = Sunday). \
Each day must have exactly ${input.mealsPerDay} meal(s): ${mealTypes.join(', ')}. \
Total daily calories across all meals should sum to approximately \
${input.dailyCalorieTarget} kcal ± 100 kcal.`;
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

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `\
You are Chefer, a friendly and knowledgeable personal chef AI assistant.
Help users with recipe substitutions, cooking techniques, nutritional advice, and meal planning questions.
Keep responses concise, practical, and encouraging.
Use the user's active meal plan as context when relevant.`;
