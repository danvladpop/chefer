// ─── AI Service Types ─────────────────────────────────────────────────────────

export interface NutritionInfo {
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
  fiber: number;   // grams
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  activePlanId?: string;
  userId: string;
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface IAIService {
  generateMealPlan(input: MealPlanInput): Promise<WeekPlanResponse>;
  generateRecipeSwap(input: SwapInput): Promise<RecipeData>;
  chat(messages: ChatMessage[], context: ChatContext): Promise<ReadableStream>;
}
