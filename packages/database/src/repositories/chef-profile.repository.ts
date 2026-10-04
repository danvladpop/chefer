import { Prisma } from '@prisma/client';
import type { ActivityLevel, BiologicalSex, ChefProfile, Goal } from '@prisma/client';
import { prisma } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ActivityLevel, BiologicalSex, Goal };

export interface UpsertChefProfileData {
  displayName?: string | null;
  biologicalSex?: BiologicalSex | null;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel | null;
  goal?: Goal | null;
  dailyCalorieTarget?: number | null;
  /** Adaptive Chef (F1): cumulative weekly-review calorie dial. */
  targetAdjustmentKcal?: number;
  weeklyBudgetEur?: number | null;
  deliveryAddress?: string | null;
  deliveryCurrency?: string | null;
  preferredUnits?: 'METRIC' | 'IMPERIAL';
  /** Premium Sunday auto-planning opt-out (audit F-PLAN-4-3). */
  autoPlanWeekly?: boolean;
  /** Onboarding audience (backlog P2-3). */
  onboardingIntent?: 'EAT_BETTER' | 'HOUSEHOLD' | 'TRAIN' | null;
  // §2.4, T-03.1/T-04.1/T-06.9/T-21.1 (S4, rev 2)
  onboardingJobs?: (
    | 'TRAIN'
    | 'PLAN_MEALS'
    | 'HOUSEHOLD'
    | 'USE_WHAT_I_HAVE'
    | 'SAVED_RECIPES'
    | 'TRACK'
  )[];
  trainingWeekdays?: number[];
  showNutritionOnToday?: boolean | null;
  /** WP-08: 'FULL' | 'PROTEIN_ONLY' | 'NONE' (null = FULL). */
  numbersMode?: string | null;
  /** Weekday -> DayKind ('lift' | 'run' | 'long_run' | 'rest'), e.g. `{ "5": "long_run" }`. */
  trainingDayKinds?: Prisma.InputJsonValue;
  timeZone?: string | null;
  // §2.11, T-35.1/T-11.1 (S11, rev 2)
  targetMode?: 'SUGGESTED' | 'OWN';
  customKcal?: number | null;
  customProteinG?: number | null;
  customCarbsG?: number | null;
  customFatG?: number | null;
  customTrainingKcal?: number | null;
  customTrainingProteinG?: number | null;
  addTrainingBonus?: boolean;
  targetSnapshot?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  /** S10 (T-10.4, D-7): the week start whose household scaling was free (first week). */
  freeScaledWeekStart?: Date | null;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IChefProfileRepository {
  findByUserId(userId: string): Promise<ChefProfile | null>;
  upsert(userId: string, data: UpsertChefProfileData): Promise<ChefProfile>;
  delete(userId: string): Promise<void>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class ChefProfileRepository implements IChefProfileRepository {
  async findByUserId(userId: string): Promise<ChefProfile | null> {
    return prisma.chefProfile.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: UpsertChefProfileData): Promise<ChefProfile> {
    const payload: Prisma.ChefProfileUncheckedCreateInput = {
      userId,
      ...data,
    };
    return prisma.chefProfile.upsert({
      where: { userId },
      create: payload,
      update: data,
    });
  }

  async delete(userId: string): Promise<void> {
    await prisma.chefProfile.delete({ where: { userId } });
  }

  clearHealthData(userId: string): Prisma.PrismaPromise<Prisma.BatchPayload> {
    return prisma.chefProfile.updateMany({
      where: { userId },
      data: {
        goal: null,
        biologicalSex: null,
        age: null,
        heightCm: null,
        weightKg: null,
        activityLevel: null,
        dailyCalorieTarget: null,
        targetAdjustmentKcal: 0,
        targetMode: 'SUGGESTED',
        customKcal: null,
        customProteinG: null,
        customCarbsG: null,
        customFatG: null,
        customTrainingKcal: null,
        customTrainingProteinG: null,
        // The last targets the user saw derive from the metrics just erased.
        targetSnapshot: Prisma.DbNull,
      },
    });
  }
}

export const chefProfileRepository = new ChefProfileRepository();
