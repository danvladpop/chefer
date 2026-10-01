import type {
  CheferizeInput,
  CoachReviewInput,
  MealPlanInput,
  RecipeLineRepairRequest,
  ShoppingListInput,
  SwapInput,
} from './types.js';

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

PORTION RULES:
- Size every ingredient quantity so each day's total calories land within ±5%
  of the stated daily target. The target already includes the goal adjustment
  (deficit/surplus) — do NOT add or subtract more on top of it.
- Calories: breakfast 20-25%, lunch 30-35%, dinner 35-40%, snack 10-15%
- No recipe name repeats across 7 days
- Realistic prepTimeMins and cookTimeMins

INGREDIENT RULES (mandatory — nutrition is computed from these, never stated):
- Every ingredient has a "slug" copied EXACTLY from the CATALOG list in the
  user message; "name" is how the recipe calls it. Never invent a slug.
- Pick the slug for the state you measure: raw/dry meat, grains and legumes
  (e.g. rice-white-dry, chicken-breast-raw) unless a cooked or canned item is
  really meant.
- unit: "g" for solids, "ml" for liquids; "tsp"/"tbsp" only for oils, spices
  and sauces; "to taste" only for salt and pepper.
- Do NOT output nutritionInfo, calories or macros.

SAFETY (non-negotiable): Never include allergens or disliked ingredients.
Honour all dietary restrictions (vegan, gluten-free, halal, etc.).`;

const GOAL_LABELS: Record<string, string> = {
  LOSE_WEIGHT: 'lose weight (caloric deficit, high protein, low refined carbs)',
  MAINTAIN: 'maintain current weight (balanced macros)',
  GAIN_MUSCLE: 'gain muscle (caloric surplus, very high protein)',
  EAT_HEALTHIER: 'eat healthier (whole foods, micronutrient-rich, minimally processed)',
  // §T-35.2 (rev 2): RECOMP / PERFORMANCE (Prisma `Goal` + `@chefer/types`).
  // These are the AI's instructions; the user-facing phrasing of the same
  // goals is `GOAL_WORDING` in `@chefer/utils` (training-nutrition.ts).
  RECOMP:
    'recomposition (maintenance calories, higher protein — about 1.8–2.0 g/kg — to build muscle while losing fat)',
  PERFORMANCE:
    'fuel training performance (calories and carbs sized to support training load, high protein)',
};

const ACTIVITY_LABELS: Record<string, string> = {
  SEDENTARY: 'sedentary (desk job, little or no exercise)',
  LIGHTLY_ACTIVE: 'lightly active (light exercise 1–3 days/week)',
  MODERATELY_ACTIVE: 'moderately active (moderate exercise 3–5 days/week)',
  VERY_ACTIVE: 'very active (hard exercise 6–7 days/week)',
  ATHLETE: 'athlete (twice-daily training or physical job)',
};

// ── Seam section builders (premium_plan.md §3.3) ─────────────────────────────
// One builder per MealPlanInput seam field, each owned by exactly one wave-2
// feature. Every builder returns '' when its field is absent, so the base
// prompt is byte-identical until a feature actually fills its seam.

/** F2 household — owned by feat/household. */
export function buildHouseholdSection(input: MealPlanInput): string {
  const h = input.householdContext;
  if (!h) return '';
  const lines = [
    `Household: cooking for ${h.memberCount + 1} people total; every recipe must use servings=${h.portionSum} and scale ingredient quantities to it (quantities are for the whole table; calorie targets are per person).`,
  ];
  const { allergies, dietaryRestrictions } = h.mergedSafety;
  if (allergies.length || dietaryRestrictions.length) {
    // The Allergies/Restrictions lines above already carry the union
    // (meal-plan.service merges before building the input) — restated here so
    // the model knows they cover EVERY eater, not just the account owner.
    lines.push(
      `The Allergies and Restrictions above are the combined household set (hard, non-negotiable for every dish): allergies ${
        allergies.length ? allergies.join(', ') : 'none'
      }; restrictions ${dietaryRestrictions.length ? dietaryRestrictions.join(', ') : 'none'}.`,
    );
  }
  if (h.dislikeNotes.length) {
    lines.push(
      `Per-person dislikes (soft — avoid where easy, or note who the dish suits): ${h.dislikeNotes.join('; ')}.`,
    );
  }
  return lines.join('\n');
}

/** F3 pantry — owned by feat/pantry. */
export function buildUseFirstSection(input: MealPlanInput): string {
  const items = input.useFirstIngredients;
  if (!items?.length) return '';
  // Quantity 0 is the pantry's "some" state (amount unknown) — never show
  // a literal "0 g" to the model or it will plan around zero food.
  const list = items
    .map((i) => {
      const amount = i.quantity > 0 ? `${i.quantity} ${i.unit}` : 'some';
      return `${i.name} (${amount} — ${i.reason})`;
    })
    .join(', ');
  return `Pantry (soft constraint, like budget): the user already has ${list}. Listed oldest first — the earlier an item appears, the more urgently it should be used up. Work at least the first two into this week's dinners or lunches where they fit naturally; do not force them into every meal, and never let a pantry item override the safety rules.`;
}

/** F3 leftovers ("cook once, eat twice") — owned by feat/pantry. */
export function buildLeftoversSection(input: MealPlanInput): string {
  if (!input.leftoversMode) return '';
  // Soft steer only: the deterministic dinner→next-lunch pairing (doubled
  // servings + "Leftovers from …" labels) is applied post-generation by
  // application/pantry/leftovers.ts#pairLeftovers — the model just needs to
  // produce dinners worth doubling.
  return `Cook-once-eat-twice week: favour dinners that keep and reheat well (stews, curries, bakes, grain bowls) — 2-3 of them will be cooked in a double batch and eaten again as the next day's lunch. Avoid dinners that die overnight (fried textures, delicate seafood).`;
}

/**
 * Training days (audit P2-4): a lifter's routine weekdays get the
 * training-day bump, with the extra protein in the post-workout meal.
 */
export function buildTrainingDaysSection(input: MealPlanInput): string {
  const t = input.trainingDays;
  if (!t?.days.length) return '';
  const days = t.days.map((d) => `${d.dayOfWeek}=${d.label} (${d.workoutName})`).join(', ');
  const kcal = input.dailyCalorieTarget + t.kcalBonus;
  const protein = input.macroTargets
    ? ` and ~${input.macroTargets.proteinG + t.proteinBonus} g protein`
    : '';
  return `Training days (from the user's gym routine): ${days}. On these days only, the day totals ~${kcal} kcal${protein} (+${t.kcalBonus} kcal, +${t.proteinBonus} g protein over the targets above) — put the extra protein in the meal after training, usually dinner (a protein-rich main: lean meat, fish, eggs, dairy or legumes). Rest days stay at the targets above.`;
}

/**
 * Corrective retry (trust P-1): present only on the second attempt, after the
 * first plan's day totals failed the ±15% server-side validation.
 */
export function buildCalorieCorrectionSection(input: MealPlanInput): string {
  const c = input.calorieCorrection;
  if (!c) return '';
  return `CALORIE CORRECTION — this is a retry; the previous plan failed validation. Its day totals were ${c.previousDayTotals.join(
    ', ',
  )} kcal against the ${c.target} kcal/day target. Every day MUST now total between ${Math.round(
    c.target * 0.9,
  )} and ${Math.round(
    c.target * 1.1,
  )} kcal. Fix it by scaling portion sizes (ingredient quantities), not by adding token side dishes.${
    c.previousDayMacros && input.macroTargets
      ? ` Its macros per day were ${c.previousDayMacros
          .map((m) => `P${Math.round(m.proteinG)}/C${Math.round(m.carbsG)}/F${Math.round(m.fatG)}`)
          .join(', ')} g against P${input.macroTargets.proteinG}/C${input.macroTargets.carbsG}/F${
          input.macroTargets.fatG
        } g — bring each within ±20% by changing what is cooked (leaner proteins, more grains or fruit), not by restating numbers.`
      : ''
  }`;
}

/**
 * plan-ingredient-catalog §6.3: the catalog slug list, FIRST in the user
 * message so identical lists share a cacheable prompt prefix.
 */
export function buildCatalogSection(catalogSlugs: string | undefined): string {
  if (!catalogSlugs) return '';
  return `CATALOG — every ingredient's "slug" must be one of these (exact spelling):\n${catalogSlugs}\n\n`;
}

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

  // Learning signals (P1-1): recent ratings steer taste; pinned dishes are
  // inserted verbatim after generation, so the AI only needs to avoid
  // duplicating them.
  const signalLines: string[] = [];
  if (input.likedDishes?.length) {
    signalLines.push(
      `Liked recently (4-5 stars): ${input.likedDishes.join(', ')}. Favour the cuisines and techniques of these dishes.`,
    );
  }
  if (input.dislikedDishes?.length) {
    signalLines.push(
      `Disliked recently (1-2 stars): ${input.dislikedDishes.join(', ')}. Do not repeat these dishes or close variants.`,
    );
  }
  if (input.pinnedDishNames?.length) {
    signalLines.push(
      `Already booked into this week by the user (do NOT generate these or near-duplicates): ${input.pinnedDishNames.join(', ')}.`,
    );
  }
  if (input.weeklyBudgetEur != null) {
    signalLines.push(
      `Budget (hard constraint): total ingredient cost for the whole week must stay under €${input.weeklyBudgetEur} at typical Romanian supermarket prices. Prefer affordable staples (legumes, eggs, seasonal vegetables, chicken or pork over beef, canned fish over fresh salmon) as needed to stay within it.`,
    );
  }
  // Wave-2 seams — each returns '' until its feature fills the field.
  for (const section of [
    buildHouseholdSection(input),
    buildUseFirstSection(input),
    buildLeftoversSection(input),
    buildTrainingDaysSection(input),
    buildCalorieCorrectionSection(input),
  ]) {
    if (section) signalLines.push(section);
  }

  return `${buildCatalogSection(input.catalogSlugs)}\
7-day plan for: ${input.biologicalSex} ${input.age}yo ${input.heightCm}cm ${input.weightKg}kg, ${activity}
Goal: ${goal}
Target: ${input.dailyCalorieTarget} kcal/day, ${input.mealsPerDay} meals/day (${mealTypes.join('+')}), serving ${input.servingSize}${
    input.macroTargets
      ? `\nMacros per day: protein ${input.macroTargets.proteinG} g, carbs ${input.macroTargets.carbsG} g, fat ${input.macroTargets.fatG} g (each within ±20%), from what the listed ingredient quantities provide.`
      : ''
  }
Allergies: ${allergies}
Restrictions: ${restrictions}
Dislikes: ${dislikes}
Cuisines: ${cuisines}${signalLines.length ? `\n${signalLines.join('\n')}` : ''}
Days: 0=Mon…6=Sun. Exactly ${input.mealsPerDay} meals per day.`;
}

// ─── Meal plan in day chunks (research §5.3/§5.4) ────────────────────────────
// Small-context providers (Groq free: 8K tokens/minute) cannot return a whole
// 5.5–9k-token week in one response, so the OpenAI-compatible client asks for
// one day at a time: the same system prompt and user prompt, plus a chunk
// instruction naming the day and the dishes already planned. Gemini keeps the
// single-call path.

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const MEAL_PLAN_DAY_CHUNK_RULES = `

CHUNKED MODE: the week is generated one day at a time. Produce ONLY the single
day the user message names — one day object, not the whole week. Every rule
above still applies to that day.`;

export function buildMealPlanDayChunkPrompt(
  input: MealPlanInput,
  dayOfWeek: number,
  alreadyPlanned: string[],
): string {
  const lines = [
    buildMealPlanUserPrompt(input),
    `Generate ONLY day ${dayOfWeek} (${DAY_NAMES[dayOfWeek] ?? `day ${dayOfWeek}`}): dayOfWeek=${dayOfWeek}, exactly ${input.mealsPerDay} meals.`,
  ];
  if (alreadyPlanned.length > 0) {
    lines.push(
      `Already planned on earlier days (do NOT repeat or closely imitate): ${alreadyPlanned.join(', ')}.`,
    );
  }
  return lines.join('\n');
}

// ─── Repair round (plan-ingredient-catalog §6.3) ──────────────────────────────

export const REPAIR_LINES_SYSTEM_PROMPT = `\
You fix recipe ingredient lines so they match the Chefer ingredient catalog.
Each line either names a slug the catalog does not have, or uses a unit that
cannot be converted to grams for that ingredient. For every line return:
- slug: copied EXACTLY from the CATALOG list (prefer one of the line's candidates
  when it is the same food; raw/dry state for meat, grains and legumes)
- quantity and unit: the same amount, in "g" for solids or "ml" for liquids
- id: echoed unchanged
Never invent a slug. Do not output nutrition.`;

export function buildRepairLinesPrompt(request: RecipeLineRepairRequest): string {
  const lines = request.lines
    .map(
      (l) =>
        `- id=${l.id} | recipe "${l.recipeName}" | "${l.rawName}" ${l.quantity} ${l.unit}` +
        `${l.slug ? ` | slug "${l.slug}"` : ''} | problem ${l.problem}` +
        (l.candidates.length ? ` | candidates: ${l.candidates.join(', ')}` : ''),
    )
    .join('\n');
  return `${buildCatalogSection(request.catalogSlugs)}Fix these lines:\n${lines}`;
}

// ─── Recipe Swap ──────────────────────────────────────────────────────────────

export const SWAP_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist and personal chef.
When swapping a recipe, provide a single alternative that:
- Is a different dish (different name, different primary ingredients)
- Has a similar portion size and macro profile
- Fits the same meal type
- Strictly respects all dietary restrictions and allergies
- Sets imageUrl to null
- Names every ingredient by a "slug" copied exactly from the CATALOG list
  (raw/dry state for meat, grains and legumes), with unit "g" for solids and
  "ml" for liquids ("tsp"/"tbsp" only for oils, spices and sauces)
- Does NOT output nutritionInfo — nutrition is computed from the ingredients`;

export function buildSwapUserPrompt(input: SwapInput): string {
  const restrictions = input.preferences.dietaryRestrictions.join(', ') || 'none';
  const allergies = input.preferences.allergies.join(', ') || 'none';
  const cuisines = input.preferences.cuisinePreferences.join(', ') || 'any';

  return `${buildCatalogSection(input.catalogSlugs)}\
Swap this ${input.mealType} recipe: "${input.originalRecipeName}"

Constraints:
  Allergies:             ${allergies}
  Dietary restrictions:  ${restrictions}
  Preferred cuisines:    ${cuisines}

Return one alternative ${input.mealType} recipe of a similar size. \
Use id format "recipe_<slug_of_name>".`;
}

// ─── Shopping List ────────────────────────────────────────────────────────────

export const SHOPPING_LIST_SYSTEM_PROMPT = `\
You are Chefer, a smart kitchen assistant. Consolidate a raw ingredient list into an optimised weekly shopping list.

RULES (mandatory):
- Merge duplicate ingredients — combine quantities with the same unit (e.g. two entries of "olive oil 2 tbsp" + "olive oil 1 tbsp" → "olive oil 3 tbsp")
- Normalise units: prefer g/ml/kg/L for weights and volumes; tsp/tbsp/cup for small recipe quantities
- Output exactly one entry per unique ingredient — no duplicates
- quantity must be a numeric string (e.g. "500" or "2.5"), no fractions
- ingredientName in Title Case (e.g. "Chicken Breast", "Olive Oil")
- Exclude pure seasonings/spices already in most pantries (salt, black pepper, generic "spices")`;

export function buildShoppingListPrompt(input: ShoppingListInput): string {
  const lines = input.ingredients.map((i) => `${i.name}: ${i.quantity} ${i.unit}`).join('\n');
  return `Consolidate this raw ingredient list for the week of ${input.weekLabel}:\n\n${lines}`;
}

// ─── Ingredient price estimation ─────────────────────────────────────────────

/**
 * Price-only prompt: the background price worker. Nutrition fields are always
 * null — global nutrition comes only from the catalog (plan-ingredient-catalog
 * F1, §6.4), never from a model.
 */
export const INGREDIENT_PRICES_ONLY_SYSTEM_PROMPT = `\
You are a grocery pricing expert for Romanian supermarkets (Lidl, Kaufland, Carrefour, Mega Image).
Estimate typical mid-range shelf prices in EUR for a list of ingredients.

For every ingredient return the applicable base-unit prices:
- pricePer100gEur — for ingredients bought by weight (meat, vegetables, flour, cheese…)
- pricePer100mlEur — for liquids (oil, milk, sauces…)
- pricePerPieceEur — for countable items (1 medium banana, 1 egg, 1 avocado, 1 bell pepper…)

Do NOT estimate nutrition: set caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g and gramsPerPiece to null.

RULES (mandatory):
- Set a field to null when it does not apply; set AT LEAST ONE price field per ingredient
- Produce sold both by piece and weight (banana, avocado, onion…) should get BOTH pricePerPieceEur and pricePer100gEur
- Prices are typical 2026 Romanian supermarket prices converted to EUR (1 EUR ≈ 5 RON)
- Be realistic: 1 medium banana ≈ 0.30 EUR, 1 egg ≈ 0.20 EUR, olive oil ≈ 0.90 EUR/100ml
- Return every ingredient from the input exactly once, with ingredientName copied verbatim`;

/**
 * Prices + nutrition: ONLY the premium private-ingredient auto-fill (D5) uses
 * it — the result is shown to the user as a labelled, editable suggestion and
 * stored as their own (source USER), never as catalog data.
 */
export const INGREDIENT_PRICES_SYSTEM_PROMPT = `\
You are a grocery pricing and nutrition expert for Romanian supermarkets (Lidl, Kaufland, Carrefour, Mega Image).
Estimate typical mid-range shelf prices in EUR and standard nutrition facts for a list of ingredients.

For every ingredient return the applicable base-unit prices:
- pricePer100gEur — for ingredients bought by weight (meat, vegetables, flour, cheese…)
- pricePer100mlEur — for liquids (oil, milk, sauces…)
- pricePerPieceEur — for countable items (1 medium banana, 1 egg, 1 avocado, 1 bell pepper…)

And the nutrition facts per 100 g (standard food-database values):
- caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g
- gramsPerPiece — typical weight of ONE piece in grams for countable items
  (1 medium banana ≈ 118, 1 egg ≈ 50, 1 garlic clove ≈ 5); null for non-countables

RULES (mandatory):
- Set a field to null when it does not apply; set AT LEAST ONE price field per ingredient
- Produce sold both by piece and weight (banana, avocado, onion…) should get BOTH pricePerPieceEur and pricePer100gEur
- Prices are typical 2026 Romanian supermarket prices converted to EUR (1 EUR ≈ 5 RON)
- Be realistic: 1 medium banana ≈ 0.30 EUR, 1 egg ≈ 0.20 EUR, olive oil ≈ 0.90 EUR/100ml
- Nutrition values are for the raw/uncooked ingredient unless the name says otherwise
- Return every ingredient from the input exactly once, with ingredientName copied verbatim`;

export function buildIngredientPricesPrompt(ingredientNames: string[]): string {
  return `Estimate baseline prices for these ingredients:\n\n${ingredientNames.join('\n')}`;
}

// ─── Meal photo analysis (F4 Snap-to-Log) ────────────────────────────────────

export const MEAL_PHOTO_SYSTEM_PROMPT = `\
You are Chefer, an expert nutritionist analysing a photo of a meal.

Identify the dish and estimate its nutrition for the portion VISIBLE in the
photo (not a generic serving).

HONESTY RULES (mandatory — a wrong confident number is worse than a cautious one):
- Photos cannot reveal hidden oil, butter, sugar or sauces. Estimate the
  midpoint of the realistic range and say what you assumed in portionNote
  (e.g. "assuming ~350 g plate, cooked with 1 tbsp oil").
- confidence reflects how well the photo constrains the estimate:
  "high" — clearly identifiable dish, portion easy to judge;
  "med" — recognisable dish but portion or preparation uncertain;
  "low" — ambiguous dish, mixed/covered food, or unusual angle. When in
  doubt, choose the LOWER confidence.
- kcal is the total for the visible portion; protein/carbs/fat are grams for
  the same portion and must be consistent with the kcal figure
  (4/4/9 kcal per gram, ±15%).
- If the photo does not show food, return dishName "Not a meal", confidence
  "low" and zero for every number.`;

export const MEAL_PHOTO_USER_PROMPT =
  'Identify this meal and estimate its nutrition for the visible portion.';

// ─── Recipe extraction (F5 Cheferize) ────────────────────────────────────────

/** The name the extraction prompts emit when the content holds no recipe. */
export const NO_RECIPE_SENTINEL = 'NO_RECIPE_FOUND';

export const EXTRACT_RECIPE_SYSTEM_PROMPT = `\
You extract ONE cooking recipe from user-provided content: web page text (may include schema.org JSON-LD), pasted text, or a photo of a recipe (cookbook page, handwritten card, screenshot).

RULES (mandatory):
- Extract faithfully — never invent ingredients or steps that are not in the content. When JSON-LD recipe data is present, prefer it over surrounding prose.
- Normalise each ingredient line to { name, quantity, unit }. name is the bare ingredient ("chicken breast", not "2 boneless chicken breasts, diced"). unit is one of: g, kg, ml, l, tsp, tbsp, cup, piece, clove, slice, can, bunch, pinch. Convert imperial weights to metric where natural.
- instructions: ordered array of concise steps, imperative voice, no step numbers in the text.
- nutritionInfo: PER SERVING. Use the page's stated nutrition when present; otherwise estimate honestly from the ingredients.
- servings: from the content; if unstated, estimate from quantities (default 2).
- cuisineType: single best guess ("Italian", "Thai", "International"…).
- dietaryTags: only tags that clearly apply (vegetarian, vegan, gluten-free, dairy-free, pescatarian, keto, paleo).
- description: one appetising sentence, ≤20 words.
- If the content contains NO recipe at all, set name to exactly "NO_RECIPE_FOUND" and leave other fields minimal.`;

export function buildExtractRecipeUserPrompt(source: { text?: string; isPhoto: boolean }): string {
  if (source.isPhoto) {
    return 'Extract the recipe from this photo. Transcribe faithfully — if parts are illegible, extract what is readable.';
  }
  return `Extract the recipe from this content:\n\n${source.text ?? ''}`;
}

// ─── Annotated extraction (video-link import + curated dataset) ──────────────
// Shares EXTRACT_RECIPE_SYSTEM_PROMPT's extraction rules and adds what a
// reviewer — the importing user's form, or the curated-pool reviewer — needs:
// a confidence grade and an explicit list of what the model inferred. Video
// links reach it as TEXT (caption, subtitles or a speech transcript —
// lib/video-import); no model is sent video.

const ANNOTATION_RULES = `\
- confidence: "high" when the amounts were explicit (a written ingredient list), "medium" when most were, "low" when you inferred most of them.
- assumptions: every inference a human reviewer should check — vague amounts you made concrete, estimated nutrition, guessed serving counts. Empty array only when the content stated everything.`;

// The rule that makes gaps visible instead of invented.
//
// Measured failure: given a caption that lists ingredients and macros but NO
// method, the model reconstructed all ten steps from general cooking knowledge,
// invented an air-fryer temperature (garbled to "3750F (1900C)"), reported
// "high" confidence and listed none of it as an assumption. Ten fabricated
// instructions look exactly like ten real ones to the caller, so the extractor
// never looked further for the method.
//
// The extractor must therefore be explicitly licensed to return NOTHING. An
// empty instructions array is a useful, correct answer here — the review form
// shows it as "not found — please add" rather than silently wrong steps.
const NO_INVENTED_METHOD_RULE = `\
- CRITICAL — instructions must come from the content, never from your own cooking knowledge. If the content lists ingredients but does not describe how to cook them, return an EMPTY instructions array. Do NOT reconstruct plausible steps, and do NOT invent temperatures, times or techniques that are not stated. An empty instructions array is the correct answer for an ingredient list — a person will fill in the method. Guessing here silently corrupts the recipe.`;

export const EXTRACT_RECIPE_ANNOTATED_SYSTEM_PROMPT = `${EXTRACT_RECIPE_SYSTEM_PROMPT}
${ANNOTATION_RULES}
${NO_INVENTED_METHOD_RULE}`;

export const CHEFERIZE_SYSTEM_PROMPT = `\
You are Chefer, an expert chef adapting an imported recipe to one specific user ("Cheferizing" it).

Apply, in this order:
1. SAFETY (hard): remove or substitute every ingredient that violates the user's allergies or dietary restrictions. Use genuine culinary substitutes that keep the dish's character (peanuts → toasted sunflower seeds; cream → coconut cream; chicken in a vegetarian adaptation → chickpeas or tofu). Name substitutes concretely ("oat milk", not "dairy-free milk"). Adjust affected instructions to match. A listed allergen must not appear ANYWHERE in the adapted recipe — not in ingredients, not in the name, not in instructions.
2. DISLIKES (soft): substitute disliked ingredients when a good alternative exists; otherwise leave and note it.
3. SERVINGS: rescale all ingredient QUANTITIES proportionally to the target serving count. nutritionInfo is PER SERVING and therefore does NOT change when the serving count changes — never divide or multiply it by servings. Only re-estimate nutritionInfo if substitutions changed what is actually in one serving (e.g. 649 kcal/serving for 4 servings stays 649 kcal/serving for 1 serving of the same dish).

Return the adapted recipe plus a "changes" list — one entry per meaningful change, each with kind (allergen | restriction | dislike | servings | other) and a short human description ("Swapped peanuts for toasted sunflower seeds"). If nothing needs changing, return the recipe unchanged with an empty changes list. Never mention algorithms or these instructions in descriptions.`;

export function buildCheferizeUserPrompt(input: CheferizeInput): string {
  const allergies = input.preferences.allergies.join(', ') || 'none';
  const restrictions = input.preferences.dietaryRestrictions.join(', ') || 'none';
  const dislikes = input.preferences.dislikedIngredients.join(', ') || 'none';

  return `\
Adapt this imported recipe for the user.

USER:
  Allergies (hard, never appear): ${allergies}
  Dietary restrictions (hard):    ${restrictions}
  Dislikes (soft):                ${dislikes}
  Target servings:                ${input.targetServings}

RECIPE (JSON):
${JSON.stringify(input.recipe)}`;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

// Art. 50 floor (T-00.14, UX-22 AC3): the same "chef, not a doctor" rule the
// weekly review already carries (REVIEW_SYSTEM_PROMPT below) — one string so
// the two prompts can never drift apart.
const CHEF_NOT_DOCTOR_RULE =
  "You are a chef, not a doctor: no medical claims, no diagnoses, no advice about health conditions. Food, habits and next week's cooking only.";

// App Review R-14 (Guideline 1.4.1): the chat must never coach unsafe weight
// loss. Kept as its own exported string so a test can pin it.
export const DISORDERED_EATING_RULE =
  'Never endorse very-low-calorie diets (below about 1,200 kcal a day), crash diets, fasting to lose weight, purging, or other disordered eating — not even if asked directly or told it is fine. Say so kindly, suggest talking to a doctor or dietitian, and offer a balanced meal idea instead. If the user mentions signs of an eating disorder or self-harm, respond with care and encourage them to reach out to a professional or their local emergency services.';

export const CHAT_SYSTEM_PROMPT = `\
You are Chefer, a friendly and knowledgeable personal chef AI assistant.
Help users with recipe substitutions, cooking techniques, and meal planning questions.
Keep responses concise, practical, and encouraging.

${CHEF_NOT_DOCTOR_RULE} If asked about a medical topic (e.g. blood sugar,
blood pressure, pregnancy, medication), say so plainly and suggest their GP or
a dietitian instead of answering.

${DISORDERED_EATING_RULE}

You are given the user's REAL data below (today's meals, macros, targets,
allergies, restrictions, ratings). Answer questions about their food from that
data — never invent numbers. Respect allergies and restrictions in every
suggestion.

You have tools. When the user asks to swap/change/replace a meal, call
swapMeal — the swap is applied to their actual plan, so confirm what changed.
A day can have two snacks; for the second one pass occurrence 2.
When they ask to scale a recipe for more or fewer people, call scaleRecipe.
When they tell you they ATE something off-plan ("I ate a burger", "had a
croissant"), call logMeal with the dish name and your best realistic macro
estimate — it is written to their tracker, so confirm what was logged.
When they share a recipe link and want it imported/saved/adapted, call
importRecipe with the URL.
Do not claim to have done something unless the tool result confirms it.`;

// ─── Weekly coach review (F1) ────────────────────────────────────────────────

export const REVIEW_SYSTEM_PROMPT = `\
You are Chefer, the user's warm, personal chef writing their weekly review.
Write 4-5 short lines (separated by newlines, no bullets, no markdown, no
greeting, no sign-off). Be specific to THEIR numbers, encouraging and human.

Hard rules:
- The FIRST line must stand alone as a one-sentence summary of their week.
- Plain kitchen language only. NEVER mention BMR, TDEE, EWMA, algorithms,
  formulas or "the system".
- ${CHEF_NOT_DOCTOR_RULE}
- §T-35.4 (rev 2): the chef SUGGESTS a calorie-budget change; it is no longer
  applied automatically. Frame it as a recommendation the user can accept or
  ignore ("I'd suggest trimming next week's budget by 100 kcal — want me to
  make that change?") — never state it as already decided, and never as math.
- If adherence was low, coach the logging habit warmly instead of the numbers.
- If protein data is given, they lift: say in one line how their protein
  compared with their target, and if short, suggest a protein-forward dish.`;

export function buildReviewUserPrompt(input: CoachReviewInput): string {
  const lines = [
    `Days logged this week: ${input.loggedDays} of 7 (${input.adherencePct}% adherence).`,
    `Average intake on logged days: ${input.avgDailyKcal} kcal vs a ${input.targetKcal} kcal daily target.`,
    input.weightTrendKg !== null
      ? `Weight trend: ${input.weightTrendKg > 0 ? '+' : ''}${input.weightTrendKg.toFixed(2)} kg per week.`
      : 'Weight trend: not enough weigh-ins yet.',
    ...(input.protein
      ? [
          `Average protein on logged days: ${input.protein.avgDailyG} g vs a ${input.protein.targetG} g daily target (${input.protein.gPerKg} g per kg bodyweight — they lift).`,
        ]
      : []),
    `Goal: ${input.goal ?? 'MAINTAIN'}.`,
    // §T-35.4 (rev 2): the coach stops auto-applying targets — this number is
    // a SUGGESTED change the user still has to accept, not a done deal.
    input.adjustmentKcal !== 0
      ? `Suggested (not yet applied): next week's calorie budget would change by ${input.adjustmentKcal > 0 ? '+' : ''}${input.adjustmentKcal} kcal. Propose it as your recommendation, not a decision already made.`
      : 'No calorie-budget change is being suggested this week.',
  ];
  if (input.dishNames.length > 0) {
    lines.push(`Dishes on their plan this week: ${input.dishNames.slice(0, 10).join(', ')}.`);
  }
  return lines.join('\n');
}
