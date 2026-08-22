// ─── AI Service Types ─────────────────────────────────────────────────────────

export interface NutritionInfo {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  fiber: number; // grams
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface RecipeData {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  nutritionInfo: NutritionInfo;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealSlot {
  type: MealType;
  recipe: RecipeData;
}

export interface DayPlan {
  dayOfWeek: number; // 0 = Monday, 6 = Sunday
  meals: MealSlot[];
}

export interface WeekPlanResponse {
  days: DayPlan[];
}

export interface MealPlanInput {
  userId: string;
  goal: string;
  biologicalSex: string;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: string;
  dailyCalorieTarget: number;
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
  cuisinePreferences: string[];
  mealsPerDay: number;
  servingSize: number;
  // ── Learning signals (P1-1) — optional so mocks/tests stay minimal ──
  /** Dishes the pinned favourites will occupy — the AI must not duplicate them. */
  pinnedDishNames?: string[];
  /** Recently liked (4–5★): "name (cuisine)" strings. */
  likedDishes?: string[];
  /** Recently disliked (1–2★) dish names — do not repeat or closely imitate. */
  dislikedDishes?: string[];
}

export interface SwapInput {
  userId: string;
  originalRecipeName: string;
  mealType: MealType;
  preferences: {
    dietaryRestrictions: string[];
    allergies: string[];
    cuisinePreferences: string[];
  };
}

export interface ShoppingListInput {
  ingredients: { name: string; quantity: number; unit: string }[];
  weekLabel: string; // e.g., "Mon 24 Mar – Sun 30 Mar 2025"
}

export type ShoppingCategory = 'produce' | 'proteins' | 'dairy' | 'grains' | 'frozen' | 'other';

export interface AiShoppingListItem {
  ingredientName: string;
  quantity: string; // numeric string, e.g. "500" or "2.5"
  unit: string;
  /** Optional — the live AI no longer returns it (inferred locally); mock still does. */
  category?: ShoppingCategory;
}

export interface ShoppingListResponse {
  items: AiShoppingListItem[];
}

// ─── Ingredient price & macro estimation ─────────────────────────────────────
// Store-agnostic baseline prices per base-unit family plus per-100g macros.
// At least one price field is set per ingredient; null means the family
// doesn't apply (e.g. no per-piece price for olive oil).

export interface IngredientPriceEstimate {
  ingredientName: string;
  pricePer100gEur: number | null;
  pricePer100mlEur: number | null;
  pricePerPieceEur: number | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  /** Typical weight of one piece in grams (banana ≈ 118), null for non-countables. */
  gramsPerPiece: number | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Tool implementations the chat model may invoke (P1-4). Implemented by
 * ChatService over the real services; each returns a plain-text result that
 * is fed back to the model.
 */
export interface ChatTools {
  /** Swaps a slot in the user's active plan. dayOfWeek: 0=Monday…6=Sunday. */
  swapMeal(args: { dayOfWeek: number; mealType: string }): Promise<string>;
  /** Rescales a recipe from the active plan to a serving count. */
  scaleRecipe(args: { recipeName: string; servings: number }): Promise<string>;
}

export interface ChatContext {
  userId: string;
  /**
   * Prompt-ready summary of the user's real data: today's meals with macros,
   * daily targets, allergies/restrictions, recent ratings. Built fresh per
   * message by ChatService — the model answers from THIS, not from guesses.
   */
  contextSummary: string;
  tools?: ChatTools;
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface IAIService {
  generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse>;
  generateRecipeSwap(input: SwapInput): Promise<RecipeData>;
  generateShoppingList(input: ShoppingListInput): Promise<ShoppingListResponse>;
  estimateIngredientPrices(ingredientNames: string[]): Promise<IngredientPriceEstimate[]>;
  chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream>;
}
