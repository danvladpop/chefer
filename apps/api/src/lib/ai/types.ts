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
  /**
   * F3 leftovers ("cook once, eat twice"): set on a lunch slot that reuses
   * the previous day's doubled dinner — the source day's name ("Tuesday").
   * Json-only label, no schema change (premium_plan.md §5 W2-E.5).
   */
  leftoverOf?: string;
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
  /** Hard weekly ingredient-cost ceiling in EUR (P2-4, premium). */
  weeklyBudgetEur?: number;
  // ── Premium-expansion seams (premium_plan.md §3.3) — each optional field
  //    is owned by exactly ONE feature; prompts.ts has one section builder
  //    per seam that no-ops when the field is absent. ──
  /** Household generation context (F2 — feat/household fills this). */
  householdContext?: {
    memberCount: number;
    /** ceil(Σ portionFactor) including the owner — drives servings. */
    portionSum: number;
    /** Union of every member's allergies + restrictions with the owner's. */
    mergedSafety: { allergies: string[]; dietaryRestrictions: string[] };
    /** Soft per-member dislikes, e.g. "avoid mushrooms for Maria". */
    dislikeNotes: string[];
  };
  /** Pantry items generation should prefer (F3 — feat/pantry fills this). */
  useFirstIngredients?: { name: string; quantity: number; unit: string; reason: string }[];
  /**
   * F3 "cook once, eat twice": prompts the model toward dinners that reheat
   * well; the deterministic pairing itself is applied post-generation by
   * `application/pantry/leftovers.ts#pairLeftovers`.
   */
  leftoversMode?: boolean;
  /**
   * Set only on the one corrective retry after server-side day-total
   * validation fails (meal-plan.service). Carries the rejected attempt's
   * numbers so the prompt can demand the model fix them.
   */
  calorieCorrection?: {
    target: number;
    previousDayTotals: number[];
    /** Per-day macro totals of the failed attempt (audit F-PLAN-1-2). */
    previousDayMacros?: { proteinG: number; carbsG: number; fatG: number }[];
  };
  /** Daily macro targets (grams) from resolveDailyTargets (audit F-PLAN-1-2). */
  macroTargets?: { proteinG: number; carbsG: number; fatG: number };
}

// ─── Meal photo analysis (F4 Snap-to-Log) ────────────────────────────────────

export interface MealPhotoEstimate {
  dishName: string;
  confidence: 'low' | 'med' | 'high';
  kcal: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  /** Human note on the assumed portion, e.g. "assuming a 350 g plate". */
  portionNote: string;
}

// ─── Recipe extraction (F5 Cheferize) ────────────────────────────────────────

/**
 * Exactly one of url/text/imageBase64/videoBase64 is the PRIMARY source;
 * mimeType accompanies images and video. `text` may additionally accompany
 * `videoBase64` as the clip's caption — the two-stage video extractor sends
 * both, because captions carry the quantities and the video carries the method.
 */
export interface RecipeExtractionSource {
  url?: string;
  text?: string;
  imageBase64?: string;
  /** Base64 mp4 of a short cooking clip (reel/Short/TikTok). Gemini-only. */
  videoBase64?: string;
  mimeType?: string;
}

/** How much of the extraction was read off explicit amounts vs inferred. */
export type ExtractionConfidence = 'high' | 'medium' | 'low';

/**
 * An extraction plus the provenance a human reviewer needs. Curated recipes
 * are reviewed before they reach the shared pool, so the reviewer must be able
 * to sort by "what did the model guess at" rather than treat every row as
 * equally solid — `assumptions` lists exactly that ("'a drizzle of olive oil'
 * read as 1 tbsp").
 */
export interface AnnotatedExtraction {
  recipe: ExtractedRecipe;
  confidence: ExtractionConfidence;
  assumptions: string[];
}

/** RecipeData minus id/imageUrl — the AI extracts content, not identity. */
export type ExtractedRecipe = Omit<RecipeData, 'id' | 'imageUrl'>;

/** One adaptation the Cheferize pass made, listed in the diff UI. */
export interface RecipeChange {
  kind: 'allergen' | 'restriction' | 'dislike' | 'servings' | 'other';
  description: string;
}

export interface CheferizeInput {
  recipe: ExtractedRecipe;
  /** The user's preferred serving count — quantities rescale to it. */
  targetServings: number;
  preferences: {
    allergies: string[];
    dietaryRestrictions: string[];
    dislikedIngredients: string[];
  };
}

/**
 * Cheferize result. The AI's output is NEVER trusted for safety — the
 * recipe-import service re-validates `adapted` with the P1-2 allergen
 * matcher and fails closed when an allergen survived the adaptation.
 */
export interface CheferizedRecipe {
  adapted: ExtractedRecipe;
  changes: RecipeChange[];
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
  /** Adds user-requested items to this week's shopping list (custom overlay). */
  addToShoppingList(args: {
    items: { name: string; quantity?: number; unit?: string }[];
  }): Promise<string>;
  /** Latest weekly chef review — adherence, trend, adjustment (F1, coach). */
  getMyReview(): Promise<string>;
  /**
   * "I ate this" (F4 Snap-to-Log): appends a custom entry to today's tracker
   * log. Macros are the model's estimate; missing ones default to 0.
   */
  logMeal(args: {
    name: string;
    kcal: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    mealType?: string;
  }): Promise<string>;
  /** Imports a recipe from a URL (F5 Cheferize) — premium saves it, free gets a preview note. */
  importRecipe(args: { url: string }): Promise<string>;
  /**
   * "What can I make?" (F3 pantry): ranks known recipes by how much of them
   * the user's pantry already covers. Premium answers with matches; free
   * gets an honest teaser.
   */
  whatCanIMake(): Promise<string>;
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
  /** F4 Snap-to-Log — Gemini implementation lands with feat/snap (wave 1). */
  analyzeMealPhoto(imageBase64: string, mimeType: string): Promise<MealPhotoEstimate>;
  /**
   * F5 Cheferize — extraction from page text, pasted text or a photo.
   * URL sources are fetched/stripped by the recipe-import service first;
   * implementations receive `text` (or `imageBase64`), never fetch.
   */
  extractRecipe(source: RecipeExtractionSource): Promise<ExtractedRecipe>;
  /**
   * Extraction that also reports confidence + the assumptions it made.
   * Additive alongside extractRecipe, which F5 (and shipped mobile clients)
   * still call unchanged. Accepts text, photo or video sources.
   */
  extractRecipeAnnotated(source: RecipeExtractionSource): Promise<AnnotatedExtraction>;
  /** F5 Cheferize — adapts an extracted recipe to the user's safety prefs + servings. */
  cheferizeRecipe(input: CheferizeInput): Promise<CheferizedRecipe>;
  /**
   * The Sunday coach review prose (F1). Plain text, 4-5 short lines. Callers
   * fall back to the deterministic template on any error, so implementations
   * simply throw on failure (audit P0-5: the coach used to call Gemini
   * directly, outside the interface and the provider chain).
   */
  generateReviewText(input: CoachReviewInput): Promise<string>;
}

/** Inputs for the weekly coach review prose. */
export interface CoachReviewInput {
  adherencePct: number;
  loggedDays: number;
  avgDailyKcal: number;
  targetKcal: number;
  weightTrendKg: number | null;
  adjustmentKcal: number;
  goal: string | null;
  /** Dish names from the reviewed week's plan (for flavour, may be empty). */
  dishNames: string[];
}
