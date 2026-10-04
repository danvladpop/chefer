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
import type {
  DisplayCurrency,
  GoalValue,
  NumbersMode,
  OnboardingIntent,
  OnboardingJob,
  SetDisplayPreferencesInput,
  SetJobsInput,
  TargetInputs,
  TargetsView,
} from '@chefer/types';
import { parseStoredNumbersMode } from '@chefer/types';
import {
  calorieFloor,
  computeBmrTdee,
  computeCalorieTarget,
  effectiveJobs,
  isDeficitBlockedForAge,
  isMinorAge,
  legacyIntentForJobs,
  lifterProteinGPerKg,
  toDisplayCurrency,
  withLifterProteinDetailed,
} from '@chefer/utils';
import { derivedServingSize, householdService } from '../household/household.service.js';
import { consentService } from '../privacy/consent.service.js';

// ─── Calorie target (shared with web + mobile) ───────────────────────────────
// Mifflin-St Jeor, goal adjustment, the under-18 no-deficit rule and the
// sex-specific floor live in @chefer/utils (calorie-target.ts) so the web and
// mobile previews can never drift from the planner (App Review R-02). They are
// re-exported here because the Adaptive Chef (coach) and meal-plan generation
// import them from this module.
export { computeBmrTdee, computeCalorieTarget };

const GOAL_MACRO_SPLITS: Record<string, { protein: number; carbs: number; fat: number }> = {
  LOSE_WEIGHT: { protein: 0.35, carbs: 0.35, fat: 0.3 },
  GAIN_MUSCLE: { protein: 0.35, carbs: 0.4, fat: 0.25 },
  MAINTAIN: { protein: 0.25, carbs: 0.45, fat: 0.3 },
  EAT_HEALTHIER: { protein: 0.2, carbs: 0.5, fat: 0.3 },
  // Higher protein than MAINTAIN (recomp needs a floor even for non-lifters);
  // PERFORMANCE leans a bit more on carbs to fuel training sessions (the
  // per-DayKind carb bias for run/long_run days is a training-nutrition
  // service concern, out of scope for the flat resolver split).
  RECOMP: { protein: 0.3, carbs: 0.4, fat: 0.3 },
  PERFORMANCE: { protein: 0.25, carbs: 0.5, fat: 0.25 },
};

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

/** "−500 kcal/day deficit" style fragment for the targets explanation sheet. */
const GOAL_RATE: Record<string, string> = {
  LOSE_WEIGHT: '−500 kcal/day deficit',
  GAIN_MUSCLE: '+300 kcal/day surplus',
  MAINTAIN: 'Maintenance calories',
  EAT_HEALTHIER: 'Maintenance calories',
  RECOMP: 'Maintenance calories',
  PERFORMANCE: 'Maintenance calories',
};

/** The profile fields `resolveTargets` needs — a subset of `ChefProfile`. */
export interface ResolveTargetsProfile {
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
  /** §2.11, T-35.1 (rev 2): own-target override. Optional, defaults to SUGGESTED. */
  targetMode?: string | null;
  customKcal?: number | null;
  customProteinG?: number | null;
  customCarbsG?: number | null;
  customFatG?: number | null;
}

/**
 * THE single source of the user's daily calorie + macro targets (§2.11,
 * T-35.1). Dashboard, tracker and meal-plan generation must all read targets
 * through this — before it existed each computed its own (live TDEE here,
 * stale snapshot there, hardcoded 30/45/25 splits elsewhere), so changing a
 * goal moved the generated plan but not the dashboard ring (roadmap F-5).
 *
 * Returns `{ effective, suggested, source, inputs }`:
 *  - `suggested` is today's computation (as before: complete body metrics →
 *    live Mifflin-St Jeor TDEE ± goal adjustment ± the coach's cumulative
 *    dial, macros from the goal's split, with the lifter g/kg rule and the
 *    BMI >= 30 adjusted-weight rule applied when a lifter bodyweight is
 *    passed; incomplete metrics → the stored snapshot or 2000).
 *  - `effective` is the user's own numbers when `targetMode === 'OWN'` (a
 *    gym-setup change, a new weigh-in or a goal edit never silently moves
 *    it — those only ever change `suggested`), else `suggested`.
 *  - `inputs` are the values the explanation sentences
 *    (`@chefer/utils/explain-targets`) name.
 *
 * Pure over an already-loaded profile row so callers don't re-query.
 */
export function resolveTargets(
  profile: ResolveTargetsProfile | null,
  /**
   * Lifter bodyweight from trainingNutritionService.loadLifter (audit P2-4):
   * when set, protein follows the goal's g/kg rule (GAIN/PERFORMANCE 1.8,
   * LOSE/RECOMP 2.0, MAINTAIN / EAT_HEALTHIER 1.6 — @chefer/utils) instead of
   * the goal's split, and carbs take up the difference so calories are
   * unchanged. Omitted = the old rules.
   */
  lifterBodyweightKg?: number | null,
): TargetsView {
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
  // Under 18 the coach's dial can never push the target below maintenance
  // (R-02: no calorie deficit for minors); everyone is held to the
  // sex-specific floor (1,500 male / 1,200 otherwise).
  const dial = profile?.targetAdjustmentKcal ?? 0;
  const calories = Math.max(
    calorieFloor(profile?.biologicalSex),
    baseCalories + (isMinorAge(profile?.age) && dial < 0 ? 0 : dial),
  );

  let suggested: DailyTargets = {
    dailyCalorieTarget: calories,
    ...splitToGrams(calories, split, profile?.weightKg ?? null),
  };

  const isLifterFlag = typeof lifterBodyweightKg === 'number' && lifterBodyweightKg > 0;
  let usedAdjustedWeight = false;
  let proteinGPerKg: number | null = null;
  if (isLifterFlag) {
    const detailed = withLifterProteinDetailed(
      suggested,
      lifterBodyweightKg,
      profile?.goal,
      profile?.heightCm ?? null,
    );
    suggested = detailed.targets;
    usedAdjustedWeight = detailed.usedAdjustedWeight;
    proteinGPerKg = lifterProteinGPerKg(profile?.goal ?? null);
  }

  const isOwn = profile?.targetMode === 'OWN';
  const effective: DailyTargets = isOwn
    ? {
        dailyCalorieTarget: profile?.customKcal ?? suggested.dailyCalorieTarget,
        proteinG: profile?.customProteinG ?? suggested.proteinG,
        carbsG: profile?.customCarbsG ?? suggested.carbsG,
        fatG: profile?.customFatG ?? suggested.fatG,
      }
    : suggested;

  const inputs: TargetInputs = {
    weightKg: profile?.weightKg ?? null,
    heightCm: profile?.heightCm ?? null,
    age: profile?.age ?? null,
    activity: profile?.activityLevel ?? null,
    goal: profile?.goal ?? null,
    isLifter: isLifterFlag,
    proteinGPerKg,
    usedAdjustedWeight,
    rate: isDeficitBlockedForAge(profile?.goal, profile?.age)
      ? 'Maintenance calories (no calorie deficit under 18)'
      : (GOAL_RATE[goal] ?? null),
  };

  return { effective, suggested, source: isOwn ? 'own' : 'suggested', inputs };
}

/**
 * The legacy flat shape (`effective` only) — kept so every existing consumer
 * (dashboard, tracker, meal-plan generation, the coach review,
 * training-nutrition service) picks up the own-target override and the new
 * goals with zero call-site changes. New code that needs to tell "own" from
 * "suggested" (the targets router, change detection) calls `resolveTargets`.
 */
export function resolveDailyTargets(
  profile: ResolveTargetsProfile | null,
  lifterBodyweightKg?: number | null,
): DailyTargets {
  return resolveTargets(profile, lifterBodyweightKg).effective;
}

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface SetupPreferencesInput {
  goal: GoalValue;
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
  /** Legacy "cooking for N" — only older app builds send it (P2-3). */
  servingSize?: number | undefined;
}

export interface UpdatePreferencesInput {
  goal?: GoalValue;
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

/**
 * Keeps GymProfile.unit in step with ChefProfile.preferredUnits (backlog
 * P2-6: one unit preference across Food and Gym). Implemented by
 * GymProfileService, injected so this service never imports the gym graph.
 */
export interface GymUnitSync {
  syncFromPreferredUnits(userId: string, units: 'METRIC' | 'IMPERIAL'): Promise<void>;
}

export interface DisplayPreferencesDto {
  preferredUnits: 'METRIC' | 'IMPERIAL';
  /** IANA time zone name (§2.12, T-21.1), or null when never set. Additive. */
  timeZone: string | null;
  currency: DisplayCurrency;
}

export interface PreferencesDto {
  chefProfile: ChefProfile | null;
  dietaryPreferences: DietaryPreferences | null;
  /**
   * §2.4, T-03.1: the jobs every jobs-aware surface should read instead of
   * `chefProfile.onboardingJobs`/`onboardingIntent` directly (additive).
   * Computed from the stored fields only — the TRACK-from-logging inference
   * (T-03.7's pre-selection) needs the last-7-days log count, which
   * `dashboard.summary.jobs` already pays for; `preferences.get` stays cheap
   * since it's read on nearly every screen.
   */
  jobs: OnboardingJob[];
  /**
   * WP-08: the stored numbers mode, `FULL` when never set. Additive — the
   * same value is on `chefProfile.numbersMode` (nullable). Clients render
   * `effectiveNumbersMode(numbersMode)` (NONE is treated as FULL until WP-16).
   */
  numbersMode: NumbersMode;
}

/**
 * The household slice PreferencesService needs (backlog P2-3, one people
 * model). Injected so unit tests can omit it and this service never owns
 * household data.
 */
export interface HouseholdPort {
  list(userId: string): Promise<{ portionFactor: number }[]>;
  migrateLegacyServingSize(userId: string): Promise<number>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PreferencesService {
  constructor(
    private readonly chefProfileRepo: IChefProfileRepository,
    private readonly dietaryPreferencesRepo: IDietaryPreferencesRepository,
    /** Optional so unit tests can omit it; the singleton wires the gym. */
    private readonly gymUnits?: GymUnitSync,
    /** Optional so unit tests can omit it; the singleton wires the household. */
    private readonly household?: HouseholdPort,
  ) {}

  /**
   * "What brings you here?" (backlog P2-3, audit F-PM-6) — free on every
   * tier. Never counts as a profile: hasProfile still needs a goal. Rev 2
   * (T-03.1): also back-fills `onboardingJobs` when the profile has never
   * answered the jobs question, so a legacy client's single answer still
   * shows up wherever `effectiveJobs()`/jobs-aware UI reads the jobs list —
   * a stored (even single-job) list always wins over the derived mapping.
   */
  async setIntent(userId: string, intent: OnboardingIntent): Promise<{ intent: OnboardingIntent }> {
    const existing = await this.chefProfileRepo.findByUserId(userId);
    const data: UpsertChefProfileData = { onboardingIntent: intent };
    if (!existing || existing.onboardingJobs.length === 0) {
      data.onboardingJobs = effectiveJobs({ jobs: [], intent });
    }
    const profile = await this.chefProfileRepo.upsert(userId, data);
    return { intent: profile.onboardingIntent ?? intent };
  }

  /**
   * "What should Chefer help with?" (§2.4, T-03.1) — free on every tier, the
   * multi-select replacement for `setIntent`. Also writes the legacy
   * `onboardingIntent` (the first job with a legacy equivalent) so web and
   * older mobile builds — which only ever read the intent — keep routing
   * sensibly; when none of the chosen jobs has one (e.g. only `USE_WHAT_I_HAVE`
   * / `SAVED_RECIPES` / `TRACK`), the stored legacy intent is left as it was.
   */
  async setJobs(
    userId: string,
    input: SetJobsInput,
    source: 'web' | 'mobile' = 'mobile',
  ): Promise<{ jobs: OnboardingJob[]; intent: OnboardingIntent | null }> {
    const legacyIntent = legacyIntentForJobs(input.jobs);
    const data: UpsertChefProfileData = { onboardingJobs: [...input.jobs] };
    if (legacyIntent) data.onboardingIntent = legacyIntent;
    if (input.trainingWeekdays !== undefined) data.trainingWeekdays = input.trainingWeekdays;
    if (input.autoPlanWeekly !== undefined) data.autoPlanWeekly = input.autoPlanWeekly;
    const profile = await this.chefProfileRepo.upsert(userId, data);
    if (input.autoPlanWeekly !== undefined) {
      await consentService.record({
        userId,
        kind: 'AUTO_PLAN',
        granted: input.autoPlanWeekly,
        source,
      });
    }
    return { jobs: profile.onboardingJobs, intent: profile.onboardingIntent ?? null };
  }

  /**
   * "Show calories and macros on Today" (§2.4, T-04.1) — free on every tier.
   * `null` (never set) means the dashboard derives the ring/weight/nudge
   * visibility from the goal instead (bug B-31); an explicit value always
   * wins, in either direction (a goal-having user may still prefer no ring).
   */
  async setHomeDisplay(
    userId: string,
    showNutritionOnToday: boolean,
  ): Promise<{ showNutritionOnToday: boolean }> {
    const profile = await this.chefProfileRepo.upsert(userId, { showNutritionOnToday });
    return { showNutritionOnToday: profile.showNutritionOnToday ?? showNutritionOnToday };
  }

  /**
   * WP-08 "What do you want to keep an eye on?" — free for every tier.
   * Stores the numbers mode as given (`NONE` is reserved for WP-16 and is
   * accepted now; clients treat it as FULL via `effectiveNumbersMode`).
   * Deliberately independent of `showNutritionOnToday`: that flag keeps
   * its own meaning for older app builds, and the new clients present both
   * in one card.
   */
  async setNumbersMode(
    userId: string,
    numbersMode: NumbersMode,
  ): Promise<{ numbersMode: NumbersMode }> {
    const profile = await this.chefProfileRepo.upsert(userId, { numbersMode });
    return { numbersMode: parseStoredNumbersMode(profile.numbersMode) ?? numbersMode };
  }

  /**
   * A servingSize written by an older app build is the legacy "cooking for
   * N": convert it into household members right away (one people model).
   */
  private async absorbLegacyServingSize(userId: string, servingSize: number | undefined) {
    if (servingSize !== undefined && servingSize > 1 && this.household) {
      await this.household.migrateLegacyServingSize(userId);
    }
  }

  /**
   * True once the user has a personalised profile (a goal is set). A bare
   * ChefProfile row is not enough: registration now creates one just to hold
   * the location-default units and currency (P2-6), and toggles such as
   * setAutoPlanWeekly or setDisplayPreferences upsert one too.
   */
  async hasProfile(userId: string): Promise<boolean> {
    const profile = await this.chefProfileRepo.findByUserId(userId);
    return profile?.goal != null;
  }

  /**
   * Unit system + currency + time zone — free for every tier (audit
   * F-DASH-3-2: units used to save only through the premium updateTargets, so
   * free users could not change them at all). A unit change also moves the
   * gym profile's KG/LB unit so Food and Gym never disagree. `timeZone`
   * (§2.12, T-21.1) is the IANA name server-initiated work (the weekly
   * worker, the quiet-days nudge text) reads for "what day is it for them".
   */
  async setDisplayPreferences(
    userId: string,
    input: SetDisplayPreferencesInput,
  ): Promise<DisplayPreferencesDto> {
    const data: UpsertChefProfileData = {};
    if (input.preferredUnits !== undefined) data.preferredUnits = input.preferredUnits;
    if (input.currency !== undefined) data.deliveryCurrency = input.currency;
    if (input.timeZone !== undefined) data.timeZone = input.timeZone;
    const profile = await this.chefProfileRepo.upsert(userId, data);
    if (input.preferredUnits !== undefined) {
      await this.syncGymUnit(userId, input.preferredUnits);
    }
    return {
      preferredUnits: profile.preferredUnits,
      currency: toDisplayCurrency(profile.deliveryCurrency),
      timeZone: profile.timeZone ?? null,
    };
  }

  /** Best effort: the unit preference is saved even if the gym side fails. */
  private async syncGymUnit(userId: string, units: 'METRIC' | 'IMPERIAL'): Promise<void> {
    if (!this.gymUnits) return;
    try {
      await this.gymUnits.syncFromPreferredUnits(userId, units);
    } catch (error) {
      console.error('PreferencesService: gym unit sync failed', error);
    }
  }

  /**
   * Returns ChefProfile + DietaryPreferences for a user (either may be null).
   */
  async get(userId: string): Promise<PreferencesDto> {
    // The household read runs first: it converts a legacy servingSize, so
    // the preferences row read after it is already migrated.
    const members = this.household ? await this.household.list(userId) : null;
    const [chefProfile, dietaryPreferences] = await Promise.all([
      this.chefProfileRepo.findByUserId(userId),
      this.dietaryPreferencesRepo.findByUserId(userId),
    ]);
    // servingSize stays readable for app builds in the stores, but it now
    // reports the household (owner + members' portions), never a second
    // "cooking for N" (audit F-PM-8).
    return {
      chefProfile,
      dietaryPreferences:
        dietaryPreferences && members
          ? { ...dietaryPreferences, servingSize: derivedServingSize(members) }
          : dietaryPreferences,
      jobs: effectiveJobs({
        jobs: chefProfile?.onboardingJobs ?? [],
        intent: chefProfile?.onboardingIntent ?? null,
      }),
      numbersMode: parseStoredNumbersMode(chefProfile?.numbersMode) ?? 'FULL',
    };
  }

  /**
   * §2.13, T-39.2: every consent event goes through `ConsentService.record`
   * (L-DATA's stable API, merged onto this branch) so `AUTO_PLAN` is never
   * missing from the append-only log. Logged AFTER the profile write
   * succeeds — a failed toggle must not leave a phantom consent event.
   */
  async setAutoPlanWeekly(
    userId: string,
    enabled: boolean,
    source: 'web' | 'mobile' = 'web',
  ): Promise<{ autoPlanWeekly: boolean }> {
    const profile = await this.chefProfileRepo.upsert(userId, { autoPlanWeekly: enabled });
    await consentService.record({ userId, kind: 'AUTO_PLAN', granted: enabled, source });
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
          // servingSize only arrives from older app builds (P2-3); it is
          // absorbed into the household right after this write.
          create: {
            userId,
            ...safety,
            cuisinePreferences,
            mealsPerDay,
            ...(servingSize !== undefined && { servingSize }),
          },
          update: {
            ...safety,
            cuisinePreferences,
            mealsPerDay,
            ...(servingSize !== undefined && { servingSize }),
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
    await this.absorbLegacyServingSize(userId, servingSize);
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

    // Old mobile builds still send units through updateTargets — same sync.
    if (preferredUnits !== undefined) await this.syncGymUnit(userId, preferredUnits);
    // …and a serving size — the legacy "cooking for N" (P2-3).
    await this.absorbLegacyServingSize(userId, servingSize);

    return this.get(userId);
  }
}

export const preferencesService = new PreferencesService(
  chefProfileRepository,
  dietaryPreferencesRepository,
  {
    // Lazy import: many services import this module; the gym graph loads
    // only when a unit actually changes.
    async syncFromPreferredUnits(userId, units) {
      const { gymProfileService } = await import('../gym/gym-profile.service.js');
      await gymProfileService.syncFromPreferredUnits(userId, units);
    },
  },
  householdService,
);
