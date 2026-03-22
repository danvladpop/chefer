// Plain serialisable DTOs — no Prisma runtime imports, safe for client components.

export interface ChefProfileData {
  goal: string | null;
  biologicalSex: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string | null;
  dailyCalorieTarget: number | null;
  deliveryAddress?: string | null;
  deliveryCurrency?: string | null;
}

export interface DietaryPreferencesData {
  cuisinePreferences: string[];
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
  mealsPerDay: number;
  servingSize: number;
}
