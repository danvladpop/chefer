import { TRPCError } from '@trpc/server';
// ─── Singleton ────────────────────────────────────────────────────────────────
import {
  chefProfileRepository,
  dietaryPreferencesRepository,
  prisma,
  type ChefProfile,
  type DietaryPreferences,
  type IChefProfileRepository,
  type IDietaryPreferencesRepository,
  type UpsertChefProfileData,
  type UpsertDietaryPreferencesData,
} from '@chefer/database';

// ─── Activity multipliers (Mifflin-St Jeor) ──────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  ATHLETE: 1.9,
};

const GOAL_ADJUSTMENTS: Record<string, number> = {
  LOSE_WEIGHT: -500,
  MAINTAIN: 0,
  GAIN_MUSCLE: 300,
  EAT_HEALTHIER: 0,
};

const GOAL_MACRO_SPLITS: Record<string, { protein: number; carbs: number; fat: number }> = {
  LOSE_WEIGHT: { protein: 0.35, carbs: 0.35, fat: 0.3 },
  GAIN_MUSCLE: { protein: 0.35, carbs: 0.4, fat: 0.25 },
  MAINTAIN: { protein: 0.25, carbs: 0.45, fat: 0.3 },
  EAT_HEALTHIER: { protein: 0.2, carbs: 0.5, fat: 0.3 },
};

function computeCalorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string,
  biologicalSex: string | null,
  goal?: string | null,
): number {
  // Mifflin-St Jeor: male +5, female −161, unknown average −78
  const sexConstant = biologicalSex === 'MALE' ? 5 : biologicalSex === 'FEMALE' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.55;
  const tdee = Math.round(bmr * multiplier);
  const adjustment = goal ? (GOAL_ADJUSTMENTS[goal] ?? 0) : 0;
  return Math.max(1200, tdee + adjustment); // minimum 1200 kcal
}

// ─── Macro targets ────────────────────────────────────────────────────────────

export interface MacroTargets {
  dailyCalorieTarget: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function computeMacroTargets(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string,
  biologicalSex: string | null,
  goal: string,
): MacroTargets {
  const calories = computeCalorieTarget(
    weightKg,
    heightCm,
    age,
    activityLevel,
    biologicalSex,
    goal,
  );
  const split = GOAL_MACRO_SPLITS[goal] ?? GOAL_MACRO_SPLITS['MAINTAIN']!;
  return {
    dailyCalorieTarget: calories,
    proteinPct: Math.round(split.protein * 100),
    carbsPct: Math.round(split.carbs * 100),
    fatPct: Math.round(split.fat * 100),
    proteinG: Math.round((calories * split.protein) / 4),
    carbsG: Math.round((calories * split.carbs) / 4),
    fatG: Math.round((calories * split.fat) / 9),
  };
}

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface SetupPreferencesInput {
  goal: 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE' | 'EAT_HEALTHIER';
  biologicalSex: 'MALE' | 'FEMALE';
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: 'SEDENTARY' | 'LIGHTLY_ACTIVE' | 'MODERATELY_ACTIVE' | 'VERY_ACTIVE' | 'ATHLETE';
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
  cuisinePreferences: string[];
  mealsPerDay: number;
  servingSize: number;
}

export interface UpdatePreferencesInput {
  goal?: 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE' | 'EAT_HEALTHIER';
  biologicalSex?: 'MALE' | 'FEMALE';
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: 'SEDENTARY' | 'LIGHTLY_ACTIVE' | 'MODERATELY_ACTIVE' | 'VERY_ACTIVE' | 'ATHLETE';
  dietaryRestrictions?: string[];
  allergies?: string[];
  dislikedIngredients?: string[];
  cuisinePreferences?: string[];
  mealsPerDay?: number;
  servingSize?: number;
  deliveryAddress?: string | null;
  deliveryCurrency?: string | null;
}

export interface PreferencesDto {
  chefProfile: ChefProfile | null;
  dietaryPreferences: DietaryPreferences | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PreferencesService {
  constructor(
    private readonly chefProfileRepo: IChefProfileRepository,
    private readonly dietaryPreferencesRepo: IDietaryPreferencesRepository,
  ) {}

  /**
   * Returns true if the user already has a ChefProfile (completed onboarding).
   */
  async hasProfile(userId: string): Promise<boolean> {
    const profile = await this.chefProfileRepo.findByUserId(userId);
    return profile !== null;
  }

  /**
   * Returns ChefProfile + DietaryPreferences for a user (either may be null).
   */
  async get(userId: string): Promise<PreferencesDto> {
    const [chefProfile, dietaryPreferences] = await Promise.all([
      this.chefProfileRepo.findByUserId(userId),
      this.dietaryPreferencesRepo.findByUserId(userId),
    ]);
    return { chefProfile, dietaryPreferences };
  }

  /**
   * Upserts ChefProfile and DietaryPreferences in a single transaction.
   * Safe to call multiple times (idempotent).
   */
  async setup(userId: string, input: SetupPreferencesInput): Promise<void> {
    const {
      goal,
      biologicalSex,
      age,
      heightCm,
      weightKg,
      activityLevel,
      dietaryRestrictions,
      allergies,
      dislikedIngredients,
      cuisinePreferences,
      mealsPerDay,
      servingSize,
    } = input;

    const dailyCalorieTarget = computeCalorieTarget(
      weightKg,
      heightCm,
      age,
      activityLevel,
      biologicalSex,
      goal,
    );

    try {
      await prisma.$transaction([
        prisma.chefProfile.upsert({
          where: { userId },
          create: {
            userId,
            goal,
            biologicalSex,
            age,
            heightCm,
            weightKg,
            activityLevel,
            dailyCalorieTarget,
          },
          update: {
            goal,
            biologicalSex,
            age,
            heightCm,
            weightKg,
            activityLevel,
            dailyCalorieTarget,
          },
        }),
        prisma.dietaryPreferences.upsert({
          where: { userId },
          create: {
            userId,
            dietaryRestrictions,
            allergies,
            dislikedIngredients,
            cuisinePreferences,
            mealsPerDay,
            servingSize,
          },
          update: {
            dietaryRestrictions,
            allergies,
            dislikedIngredients,
            cuisinePreferences,
            mealsPerDay,
            servingSize,
          },
        }),
      ]);
    } catch (error) {
      console.error('PreferencesService.setup error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save your preferences. Please try again.',
      });
    }
  }

  /**
   * Partial update of ChefProfile and/or DietaryPreferences in a transaction.
   * Only fields present in the input are written; omitted fields are untouched.
   */
  async update(userId: string, input: UpdatePreferencesInput): Promise<PreferencesDto> {
    const {
      goal,
      biologicalSex,
      age,
      heightCm,
      weightKg,
      activityLevel,
      dietaryRestrictions,
      allergies,
      dislikedIngredients,
      cuisinePreferences,
      mealsPerDay,
      servingSize,
      deliveryAddress,
      deliveryCurrency,
    } = input;

    // Recompute calorie target only when enough body-metric fields are provided
    const profileData: UpsertChefProfileData = {};
    if (goal !== undefined) profileData.goal = goal;
    if (biologicalSex !== undefined) profileData.biologicalSex = biologicalSex;
    if (age !== undefined) profileData.age = age;
    if (heightCm !== undefined) profileData.heightCm = heightCm;
    if (weightKg !== undefined) profileData.weightKg = weightKg;
    if (activityLevel !== undefined) profileData.activityLevel = activityLevel;
    if (deliveryAddress !== undefined) profileData.deliveryAddress = deliveryAddress;
    if (deliveryCurrency !== undefined) profileData.deliveryCurrency = deliveryCurrency;

    if (Object.keys(profileData).length > 0) {
      // If all body metrics are known, recompute calorie target
      const existing = await this.chefProfileRepo.findByUserId(userId);
      const mergedWeight = weightKg ?? existing?.weightKg ?? null;
      const mergedHeight = heightCm ?? existing?.heightCm ?? null;
      const mergedAge = age ?? existing?.age ?? null;
      const mergedActivity = activityLevel ?? existing?.activityLevel ?? null;
      const mergedSex = biologicalSex ?? existing?.biologicalSex ?? null;

      if (mergedWeight && mergedHeight && mergedAge && mergedActivity) {
        const mergedGoal = goal ?? existing?.goal ?? null;
        profileData.dailyCalorieTarget = computeCalorieTarget(
          mergedWeight,
          mergedHeight,
          mergedAge,
          mergedActivity,
          mergedSex,
          mergedGoal,
        );
      }
    }

    const prefData: UpsertDietaryPreferencesData = {};
    if (dietaryRestrictions !== undefined) prefData.dietaryRestrictions = dietaryRestrictions;
    if (allergies !== undefined) prefData.allergies = allergies;
    if (dislikedIngredients !== undefined) prefData.dislikedIngredients = dislikedIngredients;
    if (cuisinePreferences !== undefined) prefData.cuisinePreferences = cuisinePreferences;
    if (mealsPerDay !== undefined) prefData.mealsPerDay = mealsPerDay;
    if (servingSize !== undefined) prefData.servingSize = servingSize;

    try {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(profileData).length > 0) {
          await tx.chefProfile.upsert({
            where: { userId },
            create: { userId, ...profileData },
            update: profileData,
          });
        }
        if (Object.keys(prefData).length > 0) {
          await tx.dietaryPreferences.upsert({
            where: { userId },
            create: { userId, ...prefData },
            update: prefData,
          });
        }
      });
    } catch (error) {
      console.error('PreferencesService.update error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update your preferences. Please try again.',
      });
    }

    return this.get(userId);
  }
}

export const preferencesService = new PreferencesService(
  chefProfileRepository,
  dietaryPreferencesRepository,
);
