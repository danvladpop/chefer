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

/**
 * Raw Mifflin-St Jeor BMR + activity-multiplied TDEE. Exported for the
 * Adaptive Chef (F1): the weekly-review adjustment policy needs the safe
 * bounds (floor BMR×1.1, ceiling TDEE+500) without the goal adjustment.
 */
export function computeBmrTdee(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string,
  biologicalSex: string | null,
): { bmr: number; tdee: number } {
  // Mifflin-St Jeor: male +5, female −161, unknown average −78
  const sexConstant = biologicalSex === 'MALE' ? 5 : biologicalSex === 'FEMALE' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.55;
  return { bmr: Math.round(bmr), tdee: Math.round(bmr * multiplier) };
}

/**
 * Goal-adjusted daily calorie target (Mifflin-St Jeor TDEE + goal adjustment,
 * e.g. −500 kcal for LOSE_WEIGHT). Exported so meal-plan generation can
 * recompute it live from body metrics — the stored ChefProfile value is only
 * a display snapshot and may predate goal/metric changes.
 */
export function computeCalorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: string,
  biologicalSex: string | null,
  goal?: string | null,
): number {
  const { tdee } = computeBmrTdee(weightKg, heightCm, age, activityLevel, biologicalSex);
  const adjustment = goal ? (GOAL_ADJUSTMENTS[goal] ?? 0) : 0;
  return Math.max(1200, tdee + adjustment); // minimum 1200 kcal
}

// ─── Macro targets ────────────────────────────────────────────────────────────

/**
 * Evidence-based ceiling for daily protein (~2.2 g/kg body weight). Pure
 * percentage splits blew past it at high TDEEs — 35% of a 2,982-kcal
 * gain-muscle target is 261 g (3.5 g/kg), which no generated plan delivers,
 * so the tracker read "half your protein target" forever (prod-followups #8).
 */
const MAX_PROTEIN_G_PER_KG = 2.2;

/**
 * Converts calories + a goal split into gram targets, capping protein at
 * MAX_PROTEIN_G_PER_KG when body weight is known. The calories freed by the
 * cap move to carbs (both 4 kcal/g), so the grams still sum to the target.
 */
function splitToGrams(
  calories: number,
  split: { protein: number; carbs: number; fat: number },
  weightKg: number | null,
): { proteinG: number; carbsG: number; fatG: number } {
  let proteinG = (calories * split.protein) / 4;
  let carbsG = (calories * split.carbs) / 4;
  const proteinCap = weightKg ? weightKg * MAX_PROTEIN_G_PER_KG : null;
  if (proteinCap !== null && proteinG > proteinCap) {
    carbsG += proteinG - proteinCap; // 4 kcal/g on both sides
    proteinG = proteinCap;
  }
  return {
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round((calories * split.fat) / 9),
  };
}

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
  const grams = splitToGrams(calories, split, weightKg);
  return {
    dailyCalorieTarget: calories,
    // Percentages derive from the (possibly capped) grams so the two never
    // disagree on screen.
    proteinPct: Math.round(((grams.proteinG * 4) / calories) * 100),
    carbsPct: Math.round(((grams.carbsG * 4) / calories) * 100),
    fatPct: Math.round(((grams.fatG * 9) / calories) * 100),
    ...grams,
  };
}

// ─── Unified daily targets ────────────────────────────────────────────────────

export interface DailyTargets {
  dailyCalorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const DEFAULT_CALORIE_TARGET = 2000;

/**
 * THE single source of the user's daily calorie + macro targets. Dashboard,
 * tracker and meal-plan generation must all read targets through this —
 * before it existed each computed its own (live TDEE here, stale snapshot
 * there, hardcoded 30/45/25 splits elsewhere), so changing a goal moved the
 * generated plan but not the dashboard ring (roadmap F-5).
 *
 * Pure over an already-loaded profile row so callers don't re-query:
 *  - complete body metrics → live Mifflin-St Jeor TDEE ± goal adjustment,
 *    macros from the goal's split
 *  - incomplete metrics    → stored snapshot (or 2000), macros from the
 *    goal's split applied to that number
 */
export function resolveDailyTargets(
  profile: {
    weightKg: number | null;
    heightCm: number | null;
    age: number | null;
    activityLevel: string | null;
    biologicalSex: string | null;
    goal: string | null;
    dailyCalorieTarget: number | null;
    /**
     * Adaptive Chef cumulative dial (F1). Optional so partial call sites and
     * tests keep compiling; ChefProfile rows always carry it (default 0).
     */
    targetAdjustmentKcal?: number | null;
  } | null,
): DailyTargets {
  const goal = profile?.goal ?? 'MAINTAIN';
  const split = GOAL_MACRO_SPLITS[goal] ?? GOAL_MACRO_SPLITS['MAINTAIN']!;

  const baseCalories =
    profile?.weightKg && profile.heightCm && profile.age && profile.activityLevel
      ? computeCalorieTarget(
          profile.weightKg,
          profile.heightCm,
          profile.age,
          profile.activityLevel,
          profile.biologicalSex,
          profile.goal,
        )
      : (profile?.dailyCalorieTarget ?? DEFAULT_CALORIE_TARGET);

  // F1 ordering contract (premium_plan.md W1-A): the coach's cumulative dial
  // applies AFTER the goal adjustment (inside computeCalorieTarget above) and
  // BEFORE the protein cap (splitToGrams below sees the adjusted calories).
  const calories = Math.max(1200, baseCalories + (profile?.targetAdjustmentKcal ?? 0));

  return {
    dailyCalorieTarget: calories,
    ...splitToGrams(calories, split, profile?.weightKg ?? null),
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
  preferredUnits?: 'METRIC' | 'IMPERIAL';
  weeklyBudgetEur?: number | null;
}

/**
 * Union of the saved and submitted safety entries, saved ones first, with
 * case-insensitive duplicates dropped ("Peanuts" and "peanuts" are one allergy).
 */
export function mergeSafetyList(saved: string[] | undefined, submitted: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...(saved ?? []), ...submitted]) {
    const key = entry.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    merged.push(entry.trim());
  }
  return merged;
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

  async setAutoPlanWeekly(userId: string, enabled: boolean): Promise<{ autoPlanWeekly: boolean }> {
    const profile = await this.chefProfileRepo.upsert(userId, { autoPlanWeekly: enabled });
    return { autoPlanWeekly: profile.autoPlanWeekly };
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

    // Setup never shrinks safety lists. It runs from the onboarding wizard,
    // which may be re-opened after an upgrade; a wizard that started blank
    // used to save [] over the user's real allergies (audit F-ONB-1-1).
    // Removing an allergy is a deliberate edit through updateSafety.
    const existing = await this.dietaryPreferencesRepo.findByUserId(userId);
    const safety = {
      dietaryRestrictions: mergeSafetyList(existing?.dietaryRestrictions, dietaryRestrictions),
      allergies: mergeSafetyList(existing?.allergies, allergies),
      dislikedIngredients: mergeSafetyList(existing?.dislikedIngredients, dislikedIngredients),
    };

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
            ...safety,
            cuisinePreferences,
            mealsPerDay,
            servingSize,
          },
          update: {
            ...safety,
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
      preferredUnits,
      weeklyBudgetEur,
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
    if (preferredUnits !== undefined) profileData.preferredUnits = preferredUnits;
    if (weeklyBudgetEur !== undefined) profileData.weeklyBudgetEur = weeklyBudgetEur;

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
