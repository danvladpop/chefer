import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  AiCallType,
  chefProfileRepository,
  dietaryPreferencesRepository,
  favouriteRecipeRepository,
  householdMemberRepository,
  MealPlanOrigin,
  mealPlanRepository,
  mealPlanTailoringRepository,
  mealRatingRepository,
  prisma,
  type FavouriteRecipeWithRecipe,
  type IHouseholdMemberRepository,
  type IMealPlanRepository,
  type IMealPlanTailoringRepository,
  type PlanMealSlotJson,
  type Recipe,
} from '@chefer/database';
import {
  AI_CONSENT_REQUIRED_MESSAGE,
  FRIENDS_COPY,
  type addRecipeToWeekInputSchema,
  type PlanTailoring,
  type PlanTrainingBasis,
  type PlanTrainingDay,
  type SafetyChecks,
  type TableSafety,
  type undoAddToWeekInputSchema,
  type UserProfile,
} from '@chefer/types';
import {
  applyTrainingDayBonus,
  buildPremiumChanges,
  hasTrainingDayBump,
  householdPortionSum,
  PLAN_PORTION_STEPS,
  proteinGapG,
  resolvePlanDays,
  resolvePlanSlots,
  slotPortion,
  trainingDayBonus,
  trainingWeekdays,
} from '@chefer/utils';
import { aiConsentMissing, aiConsentRequiredError } from '../../lib/ai-consent-gate.js';
import { toFriendlyAiError } from '../../lib/ai/friendly-error.js';
import { aiService } from '../../lib/ai/index.js';
import type {
  Ingredient,
  MealPlanInput,
  MealType,
  NutritionInfo,
  RecipeData,
  SwapInput,
  WeekPlanResponse,
} from '../../lib/ai/index.js';
import {
  ensureCuratedRecipes,
  findSafetyIssues,
  MIN_SAFE_POOL_SIZE,
  pickRandomCurated,
  safeCuratedPools,
  type SafetyCheckable,
  type SafetyPrefs,
} from '../../lib/curated-recipes/index.js';
import { hasFeature } from '../../lib/entitlements.js';
import { unsafeForTableError } from '../../lib/friends-errors.js';
import { notifyTailoringQueued } from '../../lib/plan-tailoring-signal.js';
import { PoolExhaustedCause } from '../../lib/pool-exhausted.js';
import { recipeImageWorker } from '../../workers/recipe-image.worker.js';
import {
  computeHouseholdContext,
  legacyServingSizePlaceholders,
} from '../household/household.service.js';
import {
  recipeNutritionService,
  type NutritionLineDto,
} from '../ingredients/recipe-nutrition.service.js';
import { pairLeftovers, pairLeftoverSlots } from '../pantry/leftovers.js';
import { computeUsedPantryItemsForUser, getUseFirstIngredients } from '../pantry/pantry-context.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import {
  defaultRecipeSocialDeps,
  findRecipeVisibleTo,
  isHiddenForeignRecipe,
  isRecipeOpenTo,
  isRecipeVisibleTo,
  recipeAttribution,
  type RecipeAttribution,
  type RecipeSocialDeps,
} from '../recipe/recipe-access.js';
import { recipeCopyService, type RecipeCopyService } from '../recipe/recipe-copy.service.js';
import { safetyService, type SafetyContext } from '../safety/safety.service.js';
import { estimatePlanCostEur, type PlanCostEstimate } from '../shared/plan-cost.js';
import { daysFrom, firstShoppingDay } from '../shared/plan-window.js';
import {
  trainingNutritionService,
  type TrainingNutritionService,
} from '../training-nutrition/training-nutrition.service.js';
import { catalogSlugList } from './ai-recipe-catalog.js';
import {
  aiRecipeFinisher,
  type AiRecipeFinisher,
  type FinishContext,
} from './ai-recipe-finisher.js';
import { planCuratedWeek, type CuratedShapeOptions } from './curated-planner.js';
import { planShapeService } from './plan-shape.service.js';
import {
  lockedSlotIndexes,
  mergeTailoredDay,
  TAILORING_MAX_RESUMES,
  TAILORING_RETRY_MIN_REMAINING_MS,
  tailoringDayOrder,
  toTailoringDto,
  untailoredDays,
  weekOffsetOf,
  withDeadline,
} from './plan-tailoring.js';
import { withServerRecipeIds } from './recipe-ids.js';

export { PoolExhaustedCause };

// ─── Summary DTO ──────────────────────────────────────────────────────────────

export interface MealPlanSummaryDto {
  id: string;
  weekStartDate: Date;
  weekEndDate: Date;
  status: string;
  createdAt: Date;
  recipePreview: string[]; // up to 3 recipe names
  macroSummary: {
    avgKcal: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
  };
}

// ─── Output DTOs ──────────────────────────────────────────────────────────────

export interface RecipeDto {
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
  imageStatus: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  /** UX-26 (T-26.6): true when the recipe row's source is 'AI' (additive; absent = not AI). */
  aiGenerated?: boolean;
  /**
   * plan-ingredient-catalog §9: COMPUTED (from catalog data), PARTIAL (some
   * lines lack data) or USER_ENTERED (typed by the author). Additive; absent on
   * DTOs not built from a stored row.
   */
  nutritionStatus?: 'COMPUTED' | 'PARTIAL' | 'USER_ENTERED';
  /**
   * `mealPlan.getRecipe` only (plan-ingredient-catalog §10): the per-line
   * breakdown behind the computed nutrition. Absent for a recipe without
   * catalog lines.
   */
  nutritionLines?: NutritionLineDto[];
  /**
   * The viewer's allergies and dietary restrictions (household union) this
   * recipe conflicts with. Present only when non-empty; additive, so older
   * clients ignore it (audit F-REC-2-3, F-PLAN-1-7).
   */
  allergenWarnings?: string[];
  /**
   * §T-08.5/T-08.6: on `replaceRecipe`/`swapRecipe`'s response, the recipe id
   * that WAS in the slot — lets the client offer `Undo` (call the same
   * mutation again with this id). Absent when there was nothing to undo to
   * (e.g. an empty slot) or the DTO isn't a swap/replace response.
   */
  previousRecipeId?: string;
  /**
   * §2.2, T-02.1: which of the table's safety rules this recipe passes/fails
   * — the plan-surface `Checked` chip / conflict line. Present only when the
   * table has rules (SafetyService.check's caller only attaches it then, so
   * older/rule-less tables never render a false "Checked" claim — UX-02 AC1).
   */
  safetyChecks?: SafetyChecks;
  /**
   * T-01.10: ingredient-derived diet tags (never trust the static
   * `dietaryTags` for gluten-free/vegan/vegetarian/dairy-free) and, for a
   * label-dependent one, which qualifier it needs a certified product for
   * (SafetyService.decorate()).
   */
  derivedTags?: string[];
  tagQualifiers?: Record<string, string>;
  /**
   * Following (plan §4.2, `mealPlan.getRecipe` only; all additive and
   * omitted when not applicable): `creator` on another user's recipe
   * (`By {name}`), `origin` on the viewer's copy (`From {first}`), `hidden`
   * on the owner's own auto-hidden recipe, and `sourceUrl` when the recipe
   * was imported (Q-F-7: `Source: {domain}`).
   */
  creator?: RecipeAttribution['creator'];
  origin?: RecipeAttribution['origin'];
  hidden?: RecipeAttribution['hidden'];
  sourceUrl?: string;
}

export type AddRecipeToWeekInput = z.infer<typeof addRecipeToWeekInputSchema>;
export type UndoAddToWeekInput = z.infer<typeof undoAddToWeekInputSchema>;

/**
 * `friends.addRecipeToWeek`'s result (plan §4.2). Pass it straight back to
 * `friends.undoAddToWeek` for the snackbar's Undo.
 */
export interface AddRecipeToWeekResultDto {
  planId: string;
  dayOfWeek: number;
  mealType: MealType;
  slotIndex: number;
  /** What the slot now holds: the recipe itself (open/own) or the viewer's copy. */
  addedRecipeId: string;
  /** The original's id when `addedRecipeId` is the viewer's copy, else null. */
  copiedFromId: string | null;
  /** The recipe the slot held before a replace; absent for an add. */
  previousRecipeId?: string;
  /** Whether that slot was `Your pick` — pass it back to Undo with `previousRecipeId`. */
  previousPinned?: boolean;
}

export interface MealSlotDto {
  type: MealType;
  /** The recipe as written — nutritionInfo stays per ONE serving. */
  recipe: RecipeDto;
  /** F3 leftovers: source-day name when this slot is "Leftovers from X". */
  leftoverOf?: string;
  /**
   * P1-1: how many servings of `recipe` this slot is (0.75–2); absent = 1.
   * Clients scale the slot's kcal/macros, pre-set recipe servings and log
   * this portion. Additive — older clients ignore it and show 1×.
   */
  portion?: number;
  /**
   * §2.3, T-07.4: the user chose this exact dish — the card shows
   * `Your pick`, and it survives `generate({ keepPinned: true })` when it
   * still passes the safety filter. Additive; absent = not pinned.
   */
  pinned?: boolean;
}

export interface DayPlanDto {
  dayOfWeek: number;
  meals: MealSlotDto[];
  /**
   * P1-1: grams the day's portioned protein falls short of the user's target,
   * present only when meaningfully short (under 90% and ≥ 10 g). Clients show
   * "Protein short by N g — add a snack" instead of calling the day on target.
   */
  proteinGapG?: number;
  /**
   * §2.3, T-07.2: false when this day is outside the user's chosen days (the
   * user cooks nothing this day) — `meals` is `[]`. Reliable on the response
   * that generated the plan; a later read (`getForWeek`/`getById`/…) omits
   * it rather than guess (no schema column yet to persist it — see the plan
   * shape doc comment on `WeekPlanDto`). Absent = treat as planned (every
   * day, for a plan made before this field existed).
   */
  planned?: boolean;
  /**
   * §2.3, T-07.2: present only on the response that generated the plan, when
   * a chosen day's pool couldn't fill every wanted slot — `reason: 'time'`
   * (nothing left inside the time cap) or `'pool'` (the pool itself was
   * empty for that meal type).
   */
  unfilled?: { slot: MealType; reason: 'time' | 'pool' }[];
}

export const MAX_WEEK_TEMPLATES = 4;

export interface TemplateSummaryDto {
  id: string;
  name: string;
  isFollowed: boolean;
  createdAt: Date;
  mealsCount: number;
  previewNames: string[];
}

export interface WeekPlanDto {
  planId: string;
  weekStartDate: Date;
  days: DayPlanDto[];
  /**
   * True on the response that materialized this week's plan as a copy of the
   * user's previous plan (plans continue week to week until changed) — lets
   * clients hint "continued from last week". Later reads return it as a
   * normal plan without the flag.
   */
  carriedOver?: boolean;
  /**
   * The daily calorie target the plan was (or should have been) built
   * against — same resolver as the dashboard ring, so the planner can badge
   * days that land off target (trust fix P-1/P-2 in docs/ux-fixes-plan.md).
   */
  calorieTarget?: number;
  /** P1-1: the daily protein target (g) the day totals were judged against. */
  proteinTarget?: number;
  /**
   * Estimated week cost from the ingredient price vocabulary (P2-4) —
   * the priced-shopping-list wedge, surfaced on the plan itself. Covers the
   * days from `shoppingFromDay` on, like the shopping list.
   */
  estimatedCost?: PlanCostEstimate;
  /**
   * First day (0 = Monday) the list and cost cover, when the plan was made
   * mid-week (audit F-PM-3). Absent = the whole week.
   */
  shoppingFromDay?: number;
  /**
   * What the generation learned from (P1-1) — present only on the response of
   * a premium generate, so the UI can show "built from N dishes you rated".
   */
  personalisation?: {
    pinnedDishNames: string[];
    likedCount: number;
    dislikedCount: number;
    /** F3: pantry items the generated week actually uses (use-first order). */
    usedPantryItems: string[];
  };
  /**
   * §T-08.3: the same-week plan this `generate` call replaced, `undefined`
   * when there wasn't one. Clients offer `Undo` → `mealPlan.restore({
   * planId: previousPlanId })` (unchanged). Present only on `generate`'s own
   * response, not on later reads.
   */
  previousPlanId?: string;
  /**
   * §T-07.4: present only on a `generate({ keepPinned: true })` response —
   * how many of the previous plan's pinned slots could not be kept (the day
   * is no longer planned, no longer has that meal type, or the pinned dish
   * now fails the safety filter).
   */
  droppedPinned?: number;
  /**
   * §T-10.7 ("What Premium changed", rev 2): present only on a PREMIUM
   * regeneration response. One-time, kind-aware lines the Plan tab can show
   * above the day view before the compare sheet (built by L-PLAN2, wave 3).
   */
  premiumChanges?: {
    lines: string[];
    targetHits: number;
    missDays: number;
    /** Days outside the ±15 % band, with how far off (negative = under) — feeds the card's `Fix it`. */
    misses?: { dayOfWeek: number; deltaKcal: number }[];
  };
  /**
   * §2.6 / T-06.2 (UX-06): this week's training days — lift days from the
   * routine (or a completed workout) and user-set run kinds — with the bump
   * for this viewer. Present whenever the week has any training day, on every
   * tier and goal (markers are universal; kcal is zero where the goal gets no
   * bump). Additive.
   */
  trainingDays?: PlanTrainingDay[];
  /** T-06.4: the rest-day target and protein basis the Explain sheet quotes. */
  trainingBasis?: PlanTrainingBasis;
  /**
   * T-06.7: present (true) only on a `generate` response that built the week
   * around the routine's training days — the premium `Fit meals to my
   * training days` state. Absent on later reads.
   */
  fitTrainingDays?: boolean;
  /**
   * T-10.4 (D-7, flag `householdFirstWeekFree`): true when this week is the
   * free user's household-scaled first week (the cost and list are sized for
   * the table). Additive; absent otherwise.
   */
  firstScaledWeek?: boolean;
  /**
   * Live tailoring (premium "instant week"): present while the chef is
   * replacing this plan's curated days with AI days, and after it finished
   * (DONE/PARTIAL/FAILED). Absent/null = no tailoring (free plans, older
   * plans, a superseded job). Additive — clients that ignore it get the
   * curated week at once and see tailored days on their next read.
   */
  tailoring?: PlanTailoring | null;
  /**
   * §2.2, T-02.1: the read-back table this response's `safetyChecks` were
   * computed against (week card / list header). Present whenever the caller
   * is a signed-in user — `hasRules: false` for a table with nothing to
   * check, same as `safety.getTable`.
   */
  tableSafety?: TableSafety;
}

export type GenerateOptions = {
  leftovers?: boolean;
  /** The caller already reserved (and logged) this generation's quota. */
  usageReserved?: boolean;
  /** WEEKLY_AUTO when the Sunday worker generates (drives the Monday banner). */
  origin?: MealPlanOrigin;
  /**
   * §T-07.2/T-07.3: a one-off override of the stored plan shape for this
   * call only (e.g. `Plan this day` sends `{ days: [d] }`) — never
   * persisted. Merged over the user's stored shape; omitted fields keep
   * the stored value. Old clients that omit it get the stored shape (or
   * the legacy default), exactly as before this feature existed (AC7).
   */
  shape?: Partial<CuratedShapeOptions>;
  /**
   * §T-07.4/T-08.3: preserve slots the user pinned (Replace, an own
   * recipe, `Keep this meal`) that still pass the safety filter, instead
   * of overwriting them. Default false (today's behaviour: a fresh
   * generation replaces everything).
   */
  keepPinned?: boolean;
  /**
   * §T-06.7: `Fit meals to my training days`. `false` turns the training-day
   * bias off for this call; `undefined` keeps today's behaviour (on for
   * lifters whose goal gets the bump). The router only forwards it for
   * premium users.
   */
  fitTrainingDays?: boolean;
  /**
   * The caller's `trainingDayTargets` entitlement, for the `trainingDays`
   * payload on this response. Set by `generate` from the tier.
   */
  trainingAccess?: boolean;
  /**
   * Premium only: return a complete curated week at once and let the chef
   * tailor it day by day in the background (live tailoring) instead of
   * blocking on the whole AI week. The router and the Sunday worker set it
   * (AI_PLAN_TAILORING); omitted = the blocking AI week.
   */
  instant?: boolean;
};

/** One slot of a curated week while it is assembled (before it is stored). */
type CuratedSlot = {
  type: MealType;
  recipe: RecipeData;
  portion: number;
  pinned: boolean;
  leftoverOf?: string;
};

/** How a read shows the plan to this viewer (backlog P2-3). */
export interface PlanViewOptions {
  /**
   * Premium household scaling (`householdPlans`): the week cost is sized for
   * the whole table, matching the shopping list. The router decides it from
   * the viewer's tier.
   */
  householdScaling?: boolean;
  /** UX-06 (T-06.1): the viewer's `trainingDayTargets` entitlement (the bump is applied, not previewed). */
  trainingAccess?: boolean;
}

// ─── Week helper ──────────────────────────────────────────────────────────────

function getMondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** 0=Monday … 6=Sunday for today (matches dayOfWeek in plans). */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun … 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Image generation priority for a plan day: distance in days from today
 * (0 = today's meals generate first). Next week's days sort after this week's.
 */
export function dayImagePriority(dayOfWeek: number, weekOffset: number): number {
  if (weekOffset <= 0) {
    return (dayOfWeek - getTodayDayIndex() + 7) % 7;
  }
  return weekOffset * 7 + dayOfWeek;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MealPlanService {
  constructor(
    private readonly repo: IMealPlanRepository,
    private readonly householdRepo: IHouseholdMemberRepository = householdMemberRepository,
    private readonly training: Pick<
      TrainingNutritionService,
      'loadLifter' | 'trainingSchedule' | 'trainingWeek' | 'isBumpWidened'
    > = trainingNutritionService,
    private readonly tailoringRepo: IMealPlanTailoringRepository = mealPlanTailoringRepository,
    /** INV-5: another user's MANUAL recipe → the viewer's copy before any write. */
    private readonly copies: Pick<RecipeCopyService, 'ownedRecipeFor'> = recipeCopyService,
    /** The Following branch of recipe access (recipe-access.ts §4.3). */
    private readonly recipeSocial: RecipeSocialDeps = defaultRecipeSocialDeps,
    /** Catalog computation of AI recipes (plan-ingredient-catalog §6.3). */
    private readonly aiFinisher: AiRecipeFinisher = aiRecipeFinisher,
  ) {}

  /** `findRecipeVisibleTo` with this service's repository and social deps. */
  private findVisibleRecipe(userId: string, recipeId: string): Promise<Recipe | null> {
    return findRecipeVisibleTo(userId, recipeId, this.repo, this.recipeSocial);
  }

  /**
   * Generates a fresh 7-day meal plan for the user, persists it, and returns
   * the assembled DTO. Only the plan for the targeted week is archived —
   * plans for other weeks are left untouched.
   *
   * Premium users get an AI-personalised plan; free users get a random
   * selection from the curated generic recipe pool, filtered by their
   * allergies/restrictions/dislikes (no AI calls, preset stock images).
   *
   * @param weekOffset 0 = current week, 1 = next week, etc.
   */
  async generate(
    userId: string,
    weekOffset = 0,
    premium = false,
    options: GenerateOptions = {},
  ): Promise<WeekPlanDto> {
    // T-06.1: the tier's `trainingDayTargets` entitlement (premium-only in the
    // matrix); the flag `trainingBumpFree` is ORed on inside the training service.
    const withAccess: GenerateOptions = { ...options, trainingAccess: premium };
    if (!premium) {
      return this.generateCurated(userId, weekOffset, withAccess);
    }
    if (options.instant) {
      return this.generateInstant(userId, weekOffset, withAccess);
    }
    // The blocking AI week sends the whole profile to the AI provider. Without
    // AI-data consent (server-side, R-10) the user gets the curated week
    // instead — the same one the instant path builds, with no tailoring — so
    // generation never fails over consent.
    if (await aiConsentMissing({ userId })) {
      return this.generateInstant(userId, weekOffset, withAccess);
    }
    return this.generateBlocking(userId, weekOffset, withAccess);
  }

  /**
   * T-10.4 (D-7, flag `householdFirstWeekFree`, off by default): the first
   * week generated for a free household is sized for the table. Claims the
   * week on generation (records `ChefProfile.freeScaledWeekStart` once per
   * account) and returns the table's portion sum when this week is that
   * week, else null. Lazy flag import: `lib/flags` validates env at load.
   */
  private async claimFirstScaledWeek(userId: string, weekStart: Date): Promise<number | null> {
    let on = false;
    try {
      const { isFlagEnabled } = await import('../../lib/flags.js');
      on = isFlagEnabled('householdFirstWeekFree');
    } catch {
      on = false;
    }
    if (!on) return null;
    const [profile, members] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      this.householdRepo.findByUserId(userId),
    ]);
    if (members.length === 0) return null;
    const claimed = profile?.freeScaledWeekStart ?? null;
    if (claimed === null) {
      await chefProfileRepository.upsert(userId, { freeScaledWeekStart: weekStart });
    } else if (claimed.getTime() !== weekStart.getTime()) {
      return null;
    }
    return householdPortionSum(members);
  }

  /** Read-only: whether `weekStart` is this user's household-scaled first week. */
  private async firstScaledWeekPortions(userId: string, weekStart: Date): Promise<number | null> {
    const profile = await chefProfileRepository.findByUserId(userId);
    if (profile?.freeScaledWeekStart?.getTime() !== weekStart.getTime()) return null;
    return this.householdPortions(userId);
  }

  /**
   * §2.6 / T-06.2: the `trainingDays` + `trainingBasis` payload for the week
   * starting `weekStart` (one training read for every response that shows the
   * plan). Empty for a user with no training days — the fields stay absent.
   */
  private async trainingPayload(
    userId: string,
    weekStart: Date,
    /** The viewer's `trainingDayTargets` entitlement; undefined = look the tier up. */
    access: boolean | undefined,
  ): Promise<Pick<WeekPlanDto, 'trainingDays' | 'trainingBasis'>> {
    const profile = await chefProfileRepository.findByUserId(userId);
    if (access === undefined) {
      // Mutation responses (swap, replace, scale, restore…) carry no view:
      // resolve the tier from the account rather than previewing for a premium user.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { planTier: true, role: true },
      });
      access = user ? hasFeature(user as UserProfile, 'trainingDayTargets') : false;
    }
    const { trainingDays, basis } = await this.training.trainingWeek(
      userId,
      profile ?? null,
      weekStart,
      access,
    );
    if (trainingDays.length === 0) return {};
    return { trainingDays, ...(basis && { trainingBasis: basis }) };
  }

  /**
   * Everything a premium AI generation is built from — the prompt input, the
   * live targets it is judged against and the household safety union. One
   * implementation behind the blocking week and every live-tailored day, so
   * a tailored day sees exactly what a whole AI week would have.
   */
  private async loadPremiumContext(
    userId: string,
    options: { leftovers?: boolean; fitTrainingDays?: boolean } = {},
  ) {
    // 1. Load user preferences + learning signals (P1-1: pinned favourites
    // and recent ratings feed the generation) + household members (F2). A
    // legacy "cooking for N" becomes members first — the household is the
    // one people model (P2-3, audit F-PM-8).
    await this.householdRepo
      .migrateLegacyServingSize(userId, (n) => legacyServingSizePlaceholders(n))
      .catch((err: unknown) => console.error('[meal-plan] servingSize migration failed', err));
    const [
      chefProfile,
      dietaryPrefs,
      pinnedCandidates,
      ratingSignals,
      householdMembers,
      safetyCtx,
    ] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      dietaryPreferencesRepository.findByUserId(userId),
      favouriteRecipeRepository.findPinnedForNextPlan(userId),
      mealRatingRepository.findSignalsForUser(userId),
      this.householdRepo.findByUserId(userId),
      // T-01.5/delta-4: reported recipes must never resurface in a fresh AI
      // week or a later tailored day — `enforcePlanSafety` excludes them
      // alongside the allergy/restriction pass. `safetyTable` is the same
      // read-back the client renders, so `generate`'s response can carry
      // `tableSafety` without a second query.
      safetyService.loadContext(userId),
    ]);

    // No profile yet (the goal and metrics steps are optional) is not a dead
    // end: generate against default targets, and the dashboard keeps nudging
    // the user to complete their profile (audit F-PM-2).

    // A pin must be a recipe the user may see — never another user's private
    // recipe favourited by id (recipe-access.ts).
    const pinnedFavourites = await this.visiblePins(userId, pinnedCandidates);

    const likedDishes = ratingSignals
      .filter((s) => s.rating >= 4)
      .map((s) => `${s.recipeName} (${s.cuisineType})`);
    const dislikedDishes = ratingSignals.filter((s) => s.rating <= 2).map((s) => s.recipeName);

    // 2. Build the AI input from stored preferences. Targets come from the
    // shared resolver so the generated plan always matches what the dashboard
    // ring and tracker display.
    // Lifters (audit P2-4): protein from bodyweight, and the routine's
    // training days go into the prompt with their bump — same rules the
    // dashboard applies, no extra AI call.
    const { lifterBodyweightKg } = await this.training.loadLifter(userId, chefProfile ?? null);
    const liveTargets = resolveDailyTargets(chefProfile ?? null, lifterBodyweightKg);
    const liveCalorieTarget = liveTargets.dailyCalorieTarget;
    // Lift-day bump: GAIN_MUSCLE-only unless the widened gate is on (Q-3,
    // `trainingBumpFree`); other lifters get the g/kg protein base alone.
    // `fitTrainingDays: false` (T-06.7) turns the bias off for this call.
    const widened = await this.training.isBumpWidened();
    const trainingDays =
      options.fitTrainingDays !== false &&
      lifterBodyweightKg &&
      hasTrainingDayBump(chefProfile?.goal, 'lift', widened)
        ? trainingWeekdays(await this.training.trainingSchedule(userId))
        : [];
    const trainingBonus =
      lifterBodyweightKg && trainingDays.length > 0
        ? trainingDayBonus(liveCalorieTarget, lifterBodyweightKg)
        : null;
    // Per-day targets for validation: training days are held to the bumped day.
    const trainingDayTargets = new Map(
      trainingBonus
        ? trainingDays.map((d) => [d.dayOfWeek, applyTrainingDayBonus(liveTargets, trainingBonus)])
        : [],
    );

    // Household context (F2): the seam field carries servings (portionSum)
    // and soft dislike notes; the HARD safety union is ALSO merged into the
    // top-level allergies/restrictions so every prompt line and downstream
    // check sees the whole table's constraints.
    const ownerSafety: SafetyPrefs = {
      allergies: dietaryPrefs?.allergies ?? [],
      dietaryRestrictions: dietaryPrefs?.dietaryRestrictions ?? [],
      dislikedIngredients: dietaryPrefs?.dislikedIngredients ?? [],
    };
    const householdContext = computeHouseholdContext(householdMembers, ownerSafety);

    // ── F3 pantry seam (wired at wave-2 integration) ─────────────────────────
    // Use-first items steer the prompt (soft constraint); an empty array
    // keeps the prompt byte-identical — the section builder no-ops on empty.
    const useFirstIngredients = await getUseFirstIngredients(userId);

    const aiInput = {
      userId,
      goal: chefProfile?.goal ?? 'MAINTAIN',
      biologicalSex: chefProfile?.biologicalSex ?? 'MALE',
      age: chefProfile?.age ?? 30,
      heightCm: chefProfile?.heightCm ?? 175,
      weightKg: chefProfile?.weightKg ?? 75,
      activityLevel: chefProfile?.activityLevel ?? 'MODERATELY_ACTIVE',
      dailyCalorieTarget: liveCalorieTarget,
      // Macro targets were never sent (audit F-PLAN-1-2): plans hit kcal while
      // fat ran +50–100% over and protein −25%.
      macroTargets: {
        proteinG: liveTargets.proteinG,
        carbsG: liveTargets.carbsG,
        fatG: liveTargets.fatG,
      },
      dietaryRestrictions: householdContext
        ? householdContext.mergedSafety.dietaryRestrictions
        : ownerSafety.dietaryRestrictions,
      allergies: householdContext ? householdContext.mergedSafety.allergies : ownerSafety.allergies,
      dislikedIngredients: ownerSafety.dislikedIngredients,
      cuisinePreferences: dietaryPrefs?.cuisinePreferences ?? [],
      mealsPerDay: dietaryPrefs?.mealsPerDay ?? 3,
      // Servings come from the household (owner 1 + members' portions), never
      // from the legacy serving-size setting (P2-3, audit F-PM-8).
      servingSize: householdContext?.portionSum ?? 1,
      pinnedDishNames: pinnedFavourites.map((f) => f.recipe.name),
      likedDishes,
      dislikedDishes,
      ...(chefProfile?.weeklyBudgetEur != null && {
        weeklyBudgetEur: chefProfile.weeklyBudgetEur,
      }),
      ...(householdContext && { householdContext }),
      ...(useFirstIngredients.length > 0 && { useFirstIngredients }),
      ...(options.leftovers && { leftoversMode: true }),
      ...(trainingBonus && {
        trainingDays: {
          days: trainingDays,
          kcalBonus: trainingBonus.kcalBonus,
          proteinBonus: trainingBonus.proteinBonus,
        },
      }),
    };

    const planSafety: SafetyPrefs = {
      ...ownerSafety,
      ...householdContext?.mergedSafety,
    };
    return {
      // plan-ingredient-catalog §6.3: the slugs this table may eat
      aiInput: { ...aiInput, catalogSlugs: catalogSlugList(planSafety) },
      liveTargets,
      liveCalorieTarget,
      trainingDays,
      trainingBonus,
      trainingDayTargets,
      householdContext,
      planSafety,
      hiddenRecipeIds: safetyCtx.hiddenRecipeIds,
      safetyTable: safetyCtx.table,
      pinnedFavourites,
      likedDishes,
      dislikedDishes,
    };
  }

  /**
   * The original premium path: blocks until the AI has produced the whole
   * week. Still used when live tailoring is switched off (AI_PLAN_TAILORING=
   * false) and when the curated pool cannot cover the user's restrictions
   * (the instant week needs it; only AI can build that week).
   */
  private async generateBlocking(
    userId: string,
    weekOffset: number,
    options: GenerateOptions,
  ): Promise<WeekPlanDto> {
    const {
      aiInput,
      liveTargets,
      liveCalorieTarget,
      trainingDays,
      trainingBonus,
      trainingDayTargets,
      householdContext,
      planSafety,
      hiddenRecipeIds,
      safetyTable,
      pinnedFavourites,
      likedDishes,
      dislikedDishes,
    } = await this.loadPremiumContext(userId, options);

    // 3. Call AI service
    let weekPlan;
    try {
      weekPlan = await aiService.generateMealPlan(aiInput);
    } catch (err) {
      // Every provider in the chain out of capacity (free-tier daily caps) →
      // the friendly "over capacity" sentence; the router refunds the quota.
      throw toFriendlyAiError(
        err,
        'generateMealPlan',
        'Failed to generate meal plan. Please try again.',
      );
    }

    // 3a. Honest numbers first (audit F-REC-2-4): AI recipes whose stated
    // calories drift from their ingredients get resized and restated
    // (macro-reconcile.ts), so the day totals below are real.
    const finishCtx = this.finishContext(
      userId,
      aiInput,
      planSafety,
      hiddenRecipeIds,
      (dow) => (trainingDayTargets.get(dow) ?? liveTargets).dailyCalorieTarget,
    );
    weekPlan = (await this.aiFinisher.finishPlan(weekPlan, finishCtx)).plan;

    // 3a. Server-side day-total validation (trust P-1): the prompt demands
    // ±5% but models routinely return days 25-45% under target — and, with
    // kcal on target, fat +50–100% over (F-PLAN-1-2), so macros count too.
    // One corrective retry with the failed numbers in the prompt; keep
    // whichever attempt is closer. The retry is intentionally NOT logged to
    // aiCallLog — quota counts user actions, and the user asked once.
    const firstScore = planOffTargetScore(weekPlan, liveTargets, trainingDayTargets);
    if (firstScore > 0) {
      try {
        const retryPlan = (
          await this.aiFinisher.finishPlan(
            await aiService.generateMealPlan({
              ...aiInput,
              calorieCorrection: {
                target: liveCalorieTarget,
                previousDayTotals: planDayKcalTotals(weekPlan),
                previousDayMacros: planDayMacroTotals(weekPlan),
              },
            }),
            finishCtx,
          )
        ).plan;
        if (planOffTargetScore(retryPlan, liveTargets, trainingDayTargets) < firstScore) {
          weekPlan = retryPlan;
        }
      } catch (err) {
        console.error('Calorie-correction retry failed; keeping first plan:', err);
      }
    }

    // 3a'. Server-minted recipe ids — never store under the LLM's name slug,
    // which could collide with another user's row (see recipe-ids.ts).
    weekPlan = withServerRecipeIds(weekPlan);

    // 3a''. AI output is never trusted for safety (audit F-PLAN-1-9): every
    // generated dish is re-checked against the household's allergies and
    // restrictions, and a failing slot is replaced from the safe curated
    // pool (or dropped when nothing safe fits) — reported recipes (T-01.5)
    // are excluded from that replacement pool too.
    const safetyPass = await this.enforcePlanSafety(weekPlan, planSafety, hiddenRecipeIds);
    weekPlan = safetyPass.plan;

    // 3a'''. §T-07.2: an explicit one-off shape override (e.g. `Plan this
    // day`) narrows the AI week to the requested days/slots. Without an
    // override, premium generation is unchanged (AC7) — it does not yet read
    // the stored "how you cook" shape automatically (tracked as a follow-up:
    // see the PR notes).
    if (options.shape) {
      const shapeSlots = options.shape.slots;
      const shapeDays = options.shape.days;
      weekPlan = {
        ...weekPlan,
        days: weekPlan.days.map((d) => ({
          ...d,
          meals:
            shapeDays && !shapeDays.includes(d.dayOfWeek)
              ? []
              : shapeSlots
                ? d.meals.filter((m) => (shapeSlots as string[]).includes(m.type))
                : d.meals,
        })),
      };
    }

    // Log AI call (fire-and-forget — never crash the server if logging fails)
    // The router's quota reservation already logged it; the weekly worker
    // path hasn't.
    if (!options.usageReserved) {
      prisma.aiCallLog
        .create({ data: { userId, callType: AiCallType.MEAL_PLAN } })
        .catch((err) => console.error('[aiCallLog] Failed to log MEAL_PLAN call:', err));
    }

    // 3b. Place pinned favourites into the plan verbatim (P1-1). Done as a
    // post-processing step, not via the prompt: the user pinned a SPECIFIC
    // saved recipe, and only slot replacement guarantees that exact recipe
    // (id, image and all) appears — an LLM asked to "include dish X" invents
    // a fresh variant.
    const pinnedIds = new Set(pinnedFavourites.map((f) => f.recipe.id));
    let placedPinNames: string[] = [];
    if (pinnedFavourites.length > 0) {
      placedPinNames = await this.placePinnedRecipes(userId, weekPlan, pinnedFavourites);
    }

    // 3c. F3 leftovers ("cook once, eat twice"): deterministic post-processing
    // pairs dinners with next-day lunches (doubled servings, `leftoverOf`
    // labels). Runs AFTER pin placement so pins land in fresh slots first.
    if (options.leftovers) {
      weekPlan = pairLeftovers(weekPlan);
    }

    // 4. Collect unique recipes and their image priority (min day-distance
    //    across the slots each recipe appears in — today's meals first)
    const recipeMap = new Map<string, RecipeData>();
    const priorityMap = new Map<string, number>();
    for (const day of weekPlan.days) {
      const dayPriority = dayImagePriority(day.dayOfWeek, weekOffset);
      for (const slot of day.meals) {
        recipeMap.set(slot.recipe.id, slot.recipe);
        const prev = priorityMap.get(slot.recipe.id);
        priorityMap.set(slot.recipe.id, Math.min(prev ?? 100, dayPriority));
      }
    }
    const recipes = Array.from(recipeMap.values());

    // 5. Reuse images for dishes we've generated before. LLM recipe IDs are
    //    fresh every run, but names are stable — a name match with a DONE image
    //    means the (deterministic, name-seeded) image already exists.
    const knownImages = await this.repo.findRecipeImagesByNames(recipes.map((r) => r.name));
    const resolvedImage = (r: RecipeData): { imageUrl: string | null; done: boolean } => {
      if (r.imageUrl) return { imageUrl: r.imageUrl, done: true };
      const reused = knownImages.get(r.name.toLowerCase());
      return reused ? { imageUrl: reused, done: true } : { imageUrl: null, done: false };
    };

    // 6. Persist recipes (upsert so reruns are idempotent). Pinned favourites
    // already exist as rows — and must NOT be re-upserted: that would stamp
    // this user's creatorId (and AI source) onto shared curated rows.
    await this.repo.upsertRecipes(
      recipes
        // Curated safety replacements already exist as shared rows too.
        .filter((r) => !pinnedIds.has(r.id) && !safetyPass.curatedIds.has(r.id))
        .map((r) => {
          const img = resolvedImage(r);
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredients: r.ingredients,
            instructions: r.instructions,
            nutritionInfo: r.nutritionInfo,
            cuisineType: r.cuisineType,
            dietaryTags: r.dietaryTags,
            prepTimeMins: r.prepTimeMins,
            cookTimeMins: r.cookTimeMins,
            servings: r.servings,
            imageUrl: img.imageUrl,
            imageStatus: img.done ? ('DONE' as const) : ('PENDING' as const),
            imagePriority: priorityMap.get(r.id) ?? 100,
            creatorId: userId,
          };
        }),
    );
    // …and their catalog lines (status COMPUTED; plan-ingredient-catalog §6.3).
    await this.aiFinisher.persistLines(
      recipes.filter((r) => !pinnedIds.has(r.id) && !safetyPass.curatedIds.has(r.id)),
    );

    // 7. Persist the meal plan (archives only the plan for the same week)
    const weekStartDate = getMondayOfWeek(weekOffset);
    // A newer generation supersedes any live tailoring of this week's plan.
    await this.tailoringRepo.cancelRunningForWeek(userId, weekStartDate);
    const shopFrom = firstShoppingDay(weekStartDate, new Date());
    const plan = await this.repo.createPlan({
      userId,
      weekStartDate,
      days: weekPlan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => ({
          type: m.type,
          recipeId: m.recipe.id,
          ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
        })),
      })),
      recipeIds: recipes.map((r) => r.id),
      origin: options.origin,
    });
    const previousPlanId = plan.previousPlanId ?? undefined;

    // §T-06.2: the week's training days — one read for the response and for
    // the kind-aware `What Premium changed` lines below.
    const training = await this.trainingPayload(userId, weekStartDate, options.trainingAccess);

    // §T-10.7 ("What Premium changed", rev 2): only on a regeneration (a
    // same-week plan existed to replace) — kind-aware lines from what this
    // generation actually did, plus how many days landed on target.
    let premiumChanges: WeekPlanDto['premiumChanges'];
    if (previousPlanId) {
      const dayKcalTotals = planDayKcalTotals(weekPlan);
      premiumChanges = buildPremiumChanges({
        days: weekPlan.days
          .map((d, i) => ({ dayOfWeek: d.dayOfWeek, kcal: dayKcalTotals[i] ?? 0 }))
          .filter((d, i) => (weekPlan.days[i]?.meals.length ?? 0) > 0 || d.kcal > 0),
        targetFor: (dow) =>
          training.trainingDays?.find((t) => t.dayOfWeek === dow)?.targetKcal ??
          trainingDayTargets.get(dow)?.dailyCalorieTarget ??
          liveCalorieTarget,
        baseKcal: liveCalorieTarget,
        trainingDays: training.trainingDays ?? [],
        fitLift: Boolean(trainingBonus) && trainingDays.length > 0,
        leftovers: options.leftovers === true,
        pinCount: placedPinNames.length,
        tolerance: PLAN_KCAL_TOLERANCE,
      });
    }

    // 8. Start image generation immediately — don't wait for the worker's poll
    recipeImageWorker.wake();

    // 8b. A pin means "next plan", not "every plan forever" — reset the flags
    // now that the plan they were pinned for exists.
    if (pinnedFavourites.length > 0) {
      await favouriteRecipeRepository.clearNextPlanFlags(userId);
    }

    // 9. Assemble the DTO
    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      calorieTarget: liveCalorieTarget,
      days: weekPlan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals.map((m) => {
          const img = resolvedImage(m.recipe);
          return {
            type: m.type,
            recipe: decorateRecipeDto(
              toRecipeDto(m.recipe, {
                imageUrl: img.imageUrl,
                imageStatus: img.done ? 'DONE' : 'PENDING',
              }),
              m.recipe,
              { prefs: planSafety, table: safetyTable },
            ),
            ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
          };
        }),
      })),
      // Sized for the table (P2-3): premium generation IS household scaling.
      estimatedCost: await estimatePlanCostEur(daysFrom(weekPlan.days, shopFrom), {
        portions: householdContext?.portionSum ?? null,
        userId,
      }),
      ...(shopFrom > 0 && { shoppingFromDay: shopFrom }),
      tableSafety: safetyTable,
      personalisation: {
        pinnedDishNames: placedPinNames,
        likedCount: likedDishes.length,
        dislikedCount: dislikedDishes.length,
        // F3: which pantry items the week actually cooks from — feeds the
        // "uses N things you already have" banner + plan_used_pantry event.
        usedPantryItems: await computeUsedPantryItemsForUser(userId, weekPlan.days),
      },
      ...(previousPlanId && { previousPlanId }),
      ...(premiumChanges && { premiumChanges }),
      ...training,
      ...(trainingBonus && trainingDays.length > 0 && { fitTrainingDays: true }),
    };
  }

  /**
   * Premium "instant week, then the chef tailors it live": a COMPLETE week
   * from the curated pool right away — safety-filtered for the whole table,
   * the same shape/keepPinned/week options, pinned favourites placed as the
   * user's picks, leftovers paired — and a MealPlanTailoring job that
   * replaces its days with AI days one at a time (PlanTailoringWorker),
   * today first. The AI week used to block the request for minutes on the
   * free provider tier (a real one took 408 s); this returns in about a
   * second and never gets worse than the curated week.
   *
   * Tailoring is only queued with AI data consent (App Store 5.1.2(i)) —
   * clients ask before generating; without it the week stays curated. A
   * table the curated pool cannot cover falls back to the blocking AI week,
   * the only thing that can build it.
   */
  private async generateInstant(
    userId: string,
    weekOffset: number,
    options: GenerateOptions,
  ): Promise<WeekPlanDto> {
    await this.householdRepo
      .migrateLegacyServingSize(userId, (n) => legacyServingSizePlaceholders(n))
      .catch((err: unknown) => console.error('[meal-plan] servingSize migration failed', err));
    const [pinnedCandidates, ratingSignals, members, gate] = await Promise.all([
      favouriteRecipeRepository.findPinnedForNextPlan(userId),
      mealRatingRepository.findSignalsForUser(userId),
      this.householdRepo.findByUserId(userId),
      this.tailoringRepo.findUserGate(userId),
    ]);
    const pinnedFavourites = await this.visiblePins(userId, pinnedCandidates);

    let built: Awaited<ReturnType<MealPlanService['buildCuratedWeek']>>;
    try {
      built = await this.buildCuratedWeek(userId, weekOffset, options, {
        pinnedFavourites,
        leftovers: options.leftovers === true,
        // Premium generation IS household scaling (P2-3).
        costPortions: members.length > 0 ? householdPortionSum(members) : null,
      });
    } catch (err) {
      if (err instanceof TRPCError && err.cause instanceof PoolExhaustedCause) {
        // The blocking AI week is the only thing that can build this table's
        // week, and it sends the profile to the AI provider: without AI-data
        // consent (R-10) it must not run. The pool-exhausted answer clients
        // already handle is returned instead, saying how to unlock it.
        if (await aiConsentMissing({ userId })) {
          console.info(
            '[meal-plan] curated pool too small for this table and no AI data consent — no AI week',
          );
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `We don't have enough recipes matching your restrictions to plan this week without AI. ${AI_CONSENT_REQUIRED_MESSAGE}`,
            cause: new PoolExhaustedCause(),
          });
        }
        console.info(
          '[meal-plan] curated pool too small for this table — premium uses the blocking AI week',
        );
        return this.generateBlocking(userId, weekOffset, options);
      }
      throw err;
    }

    // A pin means "next plan" (P1-1) — it has one now.
    if (pinnedFavourites.length > 0) {
      await favouriteRecipeRepository.clearNextPlanFlags(userId);
    }

    const tailoring = gate?.aiDataConsentAt
      ? await this.queueTailoring(userId, built, weekOffset, options)
      : null;
    // One user generation = one MEAL_PLAN log, as before: the router's quota
    // reservation already logged it; the Sunday worker's path hasn't.
    if (tailoring && !options.usageReserved) {
      prisma.aiCallLog
        .create({ data: { userId, callType: AiCallType.MEAL_PLAN } })
        .catch((err) => console.error('[aiCallLog] Failed to log MEAL_PLAN call:', err));
    }

    const likedCount = ratingSignals.filter((r) => r.rating >= 4).length;
    const dislikedCount = ratingSignals.filter((r) => r.rating <= 2).length;
    // §T-10.7: the instant week is what production premium users get — a
    // regeneration states what Premium did and whether the week meets target.
    const dto = built.dto;
    const premiumChanges = dto.previousPlanId
      ? buildPremiumChanges({
          days: built.days
            .filter((d) => d.meals.length > 0)
            .map((d) => ({
              dayOfWeek: d.dayOfWeek,
              kcal: d.meals.reduce(
                (sum, m) => sum + (m.recipe.nutritionInfo?.calories ?? 0) * slotPortion(m.portion),
                0,
              ),
            })),
          targetFor: (dow) =>
            dto.trainingDays?.find((t) => t.dayOfWeek === dow)?.targetKcal ??
            dto.calorieTarget ??
            0,
          baseKcal: dto.calorieTarget ?? 0,
          trainingDays: dto.trainingDays ?? [],
          fitLift: dto.fitTrainingDays === true,
          leftovers: options.leftovers === true,
          pinCount: built.placedPinNames.length,
          tolerance: PLAN_KCAL_TOLERANCE,
        })
      : undefined;
    return {
      ...dto,
      ...(premiumChanges && { premiumChanges }),
      personalisation: {
        pinnedDishNames: built.placedPinNames,
        likedCount,
        dislikedCount,
        usedPantryItems: await computeUsedPantryItemsForUser(userId, built.days),
      },
      ...(tailoring && { tailoring }),
    };
  }

  /** Creates the tailoring job for a fresh instant week and wakes the worker. */
  private async queueTailoring(
    userId: string,
    built: {
      planId: string;
      storedDays: { dayOfWeek: number; meals: PlanMealSlotJson[] }[];
      shape: CuratedShapeOptions;
    },
    weekOffset: number,
    options: GenerateOptions,
  ): Promise<PlanTailoring | null> {
    const order = tailoringDayOrder(built.storedDays, weekOffset, getTodayDayIndex());
    if (order.length === 0) return null;
    const snapshots = Object.fromEntries(
      order.map((d) => [String(d), built.storedDays.find((x) => x.dayOfWeek === d)?.meals ?? []]),
    );
    const row = await this.tailoringRepo.create({
      planId: built.planId,
      userId,
      queuedDays: order,
      snapshots,
      // Ticks carried over from the replaced plan are the baseline; a NEW
      // tick means the user started shopping for this week.
      baselineCheckedKeys: await this.tailoringRepo.findCheckedKeys(built.planId),
      slotTypes: [...resolvePlanSlots(built.shape.slots ?? [])],
      leftovers: options.leftovers === true,
    });
    notifyTailoringQueued();
    return toTailoringDto(row, 'ACTIVE', order);
  }

  /**
   * Live tailoring, one day (called by PlanTailoringService): asks the AI for
   * `dayOfWeek` with the same prompt input a whole AI week would get, runs
   * the same checks — macro reconciliation, day-total validation with one
   * corrective retry (budget permitting), server-minted ids, the household
   * safety pass — persists the new recipes and returns the day's new slots.
   * The caller writes them (compare-and-set) — this never touches the plan.
   *
   * Locked slots (the user's picks, a leftovers pair) are kept as they are.
   * `{ skip: 'locked' }` when every slot is locked (nothing to tailor).
   * Throws on AI failure, a blown budget, or a day with nothing usable.
   */
  async tailorDay(args: {
    userId: string;
    plan: { id: string; weekStartDate: Date; days: { dayOfWeek: number; meals: unknown }[] };
    dayOfWeek: number;
    slotTypes: readonly string[];
    /** Epoch ms by which the day must be done. */
    deadline: number;
  }): Promise<{ meals: PlanMealSlotJson[] } | { skip: 'locked' }> {
    const { userId, plan, dayOfWeek, slotTypes, deadline } = args;
    const current = (plan.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals ??
      []) as PlanMealSlotJson[];
    const locked = lockedSlotIndexes(plan.days, dayOfWeek);
    if (current.length > 0 && locked.size >= current.length) return { skip: 'locked' };

    const { aiInput, liveTargets, trainingDayTargets, planSafety, hiddenRecipeIds } =
      await this.loadPremiumContext(userId);
    const dayTargets = trainingDayTargets.get(dayOfWeek) ?? liveTargets;

    // The rest of the week (and this day's locked dishes) must not repeat.
    const otherIds = plan.days.flatMap((d) =>
      (d.meals as PlanMealSlotJson[])
        .filter((_, i) => d.dayOfWeek !== dayOfWeek || locked.has(i))
        .map((m) => m.recipeId),
    );
    const rows = await this.repo.findRecipesByIds([...new Set(otherIds)]);
    const alreadyPlanned = [...new Set(rows.map((r) => r.name))];

    const remaining = () => deadline - Date.now();
    const ask = (input: MealPlanInput) =>
      withDeadline(
        aiService.generateMealPlanDay(input, {
          dayOfWeek,
          alreadyPlanned,
          maxWaitMs: Math.max(0, Math.min(20_000, remaining() - 10_000)),
        }),
        remaining(),
      );

    const finishCtx = {
      ...this.finishContext(
        userId,
        aiInput,
        planSafety,
        hiddenRecipeIds,
        () => dayTargets.dailyCalorieTarget,
      ),
      canCallAi: () => remaining() >= TAILORING_RETRY_MIN_REMAINING_MS,
    };
    let dayPlan = (await this.aiFinisher.finishPlan({ days: [await ask(aiInput)] }, finishCtx))
      .plan;
    const firstScore = planOffTargetScore(dayPlan, dayTargets);
    // Same day-total validation as the week (trust P-1, F-PLAN-1-2): one
    // corrective retry, only when the budget still has room for it; keep
    // the closer attempt. Not logged — the user asked once.
    if (firstScore > 0 && remaining() >= TAILORING_RETRY_MIN_REMAINING_MS) {
      try {
        const retry = (
          await this.aiFinisher.finishPlan(
            {
              days: [
                await ask({
                  ...aiInput,
                  calorieCorrection: {
                    target: dayTargets.dailyCalorieTarget,
                    previousDayTotals: planDayKcalTotals(dayPlan),
                    previousDayMacros: planDayMacroTotals(dayPlan),
                  },
                }),
              ],
            },
            finishCtx,
          )
        ).plan;
        if (planOffTargetScore(retry, dayTargets) < firstScore) dayPlan = retry;
      } catch (err) {
        console.warn('[tailoring] corrective retry failed; keeping the first day:', err);
      }
    }

    // Server-minted ids + the household safety pass, exactly as for a week.
    const minted = withServerRecipeIds({ days: dayPlan.days.map((d) => ({ ...d, dayOfWeek })) });
    const safetyPass = await this.enforcePlanSafety(minted, planSafety, hiddenRecipeIds);
    const aiDay = safetyPass.plan.days[0];
    const aiMeals: PlanMealSlotJson[] = (aiDay?.meals ?? []).map((m) => ({
      type: m.type,
      recipeId: m.recipe.id,
    }));
    const merged = mergeTailoredDay(current, locked, aiMeals, slotTypes);
    if (!merged) throw new Error(`tailoring: the AI day ${dayOfWeek} had no usable meals`);

    // Persist the AI recipes that made it in (curated safety replacements
    // already exist as shared rows). Images: reuse a known one by name,
    // else PENDING for the image worker at this day's priority.
    const used = new Set(merged.map((m) => m.recipeId));
    const recipes = (aiDay?.meals ?? [])
      .map((m) => m.recipe)
      .filter((r) => used.has(r.id) && !safetyPass.curatedIds.has(r.id));
    if (recipes.length > 0) {
      const knownImages = await this.repo.findRecipeImagesByNames(recipes.map((r) => r.name));
      const offset = weekOffsetOf(plan.weekStartDate, getMondayOfWeek(0));
      let pending = false;
      await this.repo.upsertRecipes(
        recipes.map((r) => {
          const imageUrl = r.imageUrl ?? knownImages.get(r.name.toLowerCase()) ?? null;
          if (!imageUrl) pending = true;
          return {
            id: r.id,
            name: r.name,
            description: r.description,
            ingredients: r.ingredients,
            instructions: r.instructions,
            nutritionInfo: r.nutritionInfo,
            cuisineType: r.cuisineType,
            dietaryTags: r.dietaryTags,
            prepTimeMins: r.prepTimeMins,
            cookTimeMins: r.cookTimeMins,
            servings: r.servings,
            imageUrl,
            imageStatus: imageUrl ? ('DONE' as const) : ('PENDING' as const),
            imagePriority: dayImagePriority(dayOfWeek, offset),
            creatorId: userId,
          };
        }),
      );
      await this.aiFinisher.persistLines(recipes);
      if (pending) recipeImageWorker.wake();
    }
    return { meals: merged };
  }

  /**
   * "Tailor the rest" (PARTIAL/FAILED): re-queues ONLY the days the chef did
   * not get to (the stopped queue + failed days, from today on) — never a
   * day it already tailored or one the user changed. No new quota
   * reservation: it finishes the generation the user already paid for, is
   * premium-only, needs AI consent, and is capped per plan
   * (TAILORING_MAX_RESUMES) so it cannot become a free generation loop.
   */
  async resumeTailoring(
    userId: string,
    planId: string,
    premium: boolean,
    view: PlanViewOptions = {},
  ): Promise<WeekPlanDto> {
    if (!premium) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Tailoring your week is a premium feature.',
      });
    }
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan || plan.isTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const row = await this.tailoringRepo.findByPlanId(planId);
    if (plan.status !== 'ACTIVE' || !row || (row.status !== 'PARTIAL' && row.status !== 'FAILED')) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'There is nothing left to tailor in this plan.',
      });
    }
    if (row.resumes >= TAILORING_MAX_RESUMES) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Your chef has already tried this week a few times — regenerate for a fresh one.',
      });
    }
    const gate = await this.tailoringRepo.findUserGate(userId);
    if (!gate?.aiDataConsentAt) {
      // R-10: the typed rejection (`data.reason`) so clients open the sheet.
      throw aiConsentRequiredError();
    }
    const weekOffset = weekOffsetOf(plan.weekStartDate, getMondayOfWeek(0));
    const wanted = new Set(untailoredDays(row));
    const order = tailoringDayOrder(plan.days, weekOffset, getTodayDayIndex()).filter((d) =>
      wanted.has(d),
    );
    if (order.length === 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'There is nothing left to tailor in this plan.',
      });
    }
    // The days as they are NOW are the new baseline — the user asked for
    // them to be tailored, so earlier edits to them are no longer a reason
    // to skip (pinned slots stay locked regardless).
    const snapshots = {
      ...(row.snapshots as Record<string, PlanMealSlotJson[]>),
      ...Object.fromEntries(
        order.map((d) => [
          String(d),
          (plan.days.find((x) => x.dayOfWeek === d)?.meals ?? []) as unknown as PlanMealSlotJson[],
        ]),
      ),
    };
    await this.tailoringRepo.saveProgress(row.id, {
      status: 'RUNNING',
      queuedDays: order,
      failedDays: [],
      currentDay: order[0] ?? null,
      snapshots,
      baselineCheckedKeys: await this.tailoringRepo.findCheckedKeys(planId),
      strikes: 0,
      resumes: row.resumes + 1,
      totalDays: row.tailoredDays.length + row.keptDays.length + order.length,
      nextRunAt: new Date(),
      lastError: null,
      finishedAt: null,
    });
    notifyTailoringQueued();
    return this.assemblePlanDto(plan, userId, view);
  }

  /**
   * Drops pinned favourites the user may no longer see (recipe-access.ts),
   * and resolves another user's recipe to the user's own copy (INV-5): a
   * generated plan only ever holds open or own recipes.
   */
  private async visiblePins(
    userId: string,
    pins: FavouriteRecipeWithRecipe[],
  ): Promise<FavouriteRecipeWithRecipe[]> {
    const resolved = await Promise.all(
      pins.map(async (f): Promise<FavouriteRecipeWithRecipe | null> => {
        if (isRecipeOpenTo(f.recipe, userId)) return f;
        if (!(await isRecipeVisibleTo(userId, f.recipe, this.repo, this.recipeSocial))) {
          return null;
        }
        // F3.1: a pin on an auto-hidden recipe still opens, but generation
        // never makes a new copy of it (PRD §13) — skip it, don't fail.
        if (isHiddenForeignRecipe(f.recipe, userId)) return null;
        const owned = await this.copies.ownedRecipeFor(userId, f.recipe);
        return { ...f, recipe: owned.recipe };
      }),
    );
    return resolved.filter((f): f is FavouriteRecipeWithRecipe => f !== null);
  }

  /**
   * Replaces plan slots with the user's pinned favourite recipes (P1-1).
   * Meal types are inferred from where each recipe last appeared in the
   * user's recent plans (falling back to dinner); pins of the same type are
   * spread across the week rather than stacked on consecutive days.
   */
  private async placePinnedRecipes<
    S extends { type: string; recipe: RecipeData; pinned?: boolean },
  >(
    userId: string,
    weekPlan: { days: { dayOfWeek: number; meals: S[] }[] },
    pinnedFavourites: FavouriteRecipeWithRecipe[],
    hooks: { onPlaced?: (slot: S) => void } = {},
  ): Promise<string[]> {
    // recipeId → meal type from the most recent plan that contains it.
    const typeByRecipe = new Map<string, string>();
    const recentPlans = await this.repo.findAllByUserId(userId, 10);
    for (const plan of recentPlans) {
      for (const day of plan.days) {
        for (const slot of day.meals as { type: string; recipeId: string }[]) {
          if (!typeByRecipe.has(slot.recipeId)) typeByRecipe.set(slot.recipeId, slot.type);
        }
      }
    }

    // Spread pins across the week (Mon, Thu, Sat, Tue, Fri, Sun, Wed).
    const DAY_SPREAD = [0, 3, 5, 1, 4, 6, 2];
    const taken = new Set<string>();
    const placed: string[] = [];

    for (const favourite of pinnedFavourites) {
      const recipe = favourite.recipe;
      const mealType = typeByRecipe.get(recipe.id) ?? 'dinner';

      for (const dayOfWeek of DAY_SPREAD) {
        if (taken.has(`${dayOfWeek}:${mealType}`)) continue;
        const day = weekPlan.days.find((d) => d.dayOfWeek === dayOfWeek);
        const slot = day?.meals.find((m) => m.type === mealType);
        // A slot the user already chose (kept pick) is theirs.
        if (!slot || slot.pinned) continue;
        slot.recipe = rowToRecipeData(recipe);
        hooks.onPlaced?.(slot);
        taken.add(`${dayOfWeek}:${mealType}`);
        placed.push(recipe.name);
        break;
      }
    }
    return placed;
  }

  /**
   * FREE-tier plan generation: a random selection from the curated generic
   * recipe pool, filtered by the user's allergies, dietary restrictions and
   * dislikes (P1-2 — safety is free; only personalisation depth is premium).
   * No AI calls; images are preset stock photos (instantly DONE).
   */
  private async generateCurated(
    userId: string,
    weekOffset = 0,
    options: {
      origin?: MealPlanOrigin;
      shape?: Partial<CuratedShapeOptions>;
      keepPinned?: boolean;
      fitTrainingDays?: boolean;
      trainingAccess?: boolean;
    } = {},
  ): Promise<WeekPlanDto> {
    return (await this.buildCuratedWeek(userId, weekOffset, options)).dto;
  }

  /**
   * The curated week, persisted: the free tier's whole plan, and the premium
   * instant week that live tailoring then improves day by day. `premium`
   * adds what the premium generation always did on top of the recipe
   * choice — pinned favourites placed verbatim (as `Your pick`), the
   * leftovers pairing and a household-sized cost.
   */
  private async buildCuratedWeek(
    userId: string,
    weekOffset: number,
    options: {
      origin?: MealPlanOrigin;
      shape?: Partial<CuratedShapeOptions>;
      keepPinned?: boolean;
      fitTrainingDays?: boolean;
      trainingAccess?: boolean;
    },
    premium?: {
      pinnedFavourites: FavouriteRecipeWithRecipe[];
      leftovers: boolean;
      costPortions: number | null;
    },
  ): Promise<{
    dto: WeekPlanDto;
    planId: string;
    days: { dayOfWeek: number; meals: CuratedSlot[] }[];
    storedDays: { dayOfWeek: number; meals: PlanMealSlotJson[] }[];
    shape: CuratedShapeOptions;
    placedPinNames: string[];
  }> {
    await ensureCuratedRecipes();

    // F2: household members' allergies/restrictions are unioned with the
    // owner's — safety is never premium, so the filter applies on the free
    // tier too whenever members exist (e.g. created before a downgrade).
    const ctx = await this.loadSafetyContext(userId);
    const safety = ctx.prefs;
    const rawPools = safeCuratedPools(safety);
    // T-01.5: a reported recipe never resurfaces in a fresh curated week.
    const pools: Record<MealType, RecipeData[]> = {
      breakfast: excludeHidden(rawPools.breakfast, ctx.hiddenRecipeIds),
      lunch: excludeHidden(rawPools.lunch, ctx.hiddenRecipeIds),
      dinner: excludeHidden(rawPools.dinner, ctx.hiddenRecipeIds),
      snack: excludeHidden(rawPools.snack, ctx.hiddenRecipeIds),
    };
    // T-26.7: the curated/instant paths' `safety.filter` evidence line (the AI
    // path logs its own in enforcePlanSafety) — counts and rule ids only.
    const poolTotal = (p: Partial<Record<MealType, unknown[]>> | undefined) =>
      Object.values(p ?? {}).reduce((n, list) => n + (list?.length ?? 0), 0);
    safetyService.logFilterAudit({
      surface: 'plan.curated',
      poolSize: poolTotal(safeCuratedPools(null)),
      kept: poolTotal(pools),
      prefs: safety,
    });

    // §2.3, T-07.1/T-07.2: the stored "how you cook" shape, with this call's
    // one-off override (e.g. `Plan this day` sends `{ days: [d] }`) merged
    // over it. `getShape` itself already falls back to the legacy defaults
    // (breakfast/lunch/dinner, every day, no cap) for a user who never
    // touched the settings (AC7).
    const storedShape = await planShapeService.getShape(userId);
    const shape: CuratedShapeOptions = { ...storedShape, ...options.shape };
    const wantedMainTypes = (['breakfast', 'lunch', 'dinner'] as MealType[]).filter((type) =>
      resolvePlanSlots(shape.slots ?? []).includes(type),
    );

    // Pool exhaustion is an upgrade moment, not an error: the free pool can't
    // cover this combination of restrictions, but AI generation can. Only the
    // meal types the shape actually wants must clear the bar (T-07.2) — a
    // "dinners only" shape no longer needs a breakfast pool. T-10.4: the
    // cause reaches clients as `data.poolExhausted` (lib/trpc.ts).
    const exhausted = wantedMainTypes.filter((type) => pools[type].length < MIN_SAFE_POOL_SIZE);
    if (exhausted.length > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          "We don't have enough free recipes matching your restrictions — upgrade for AI-generated plans that always fit your needs.",
        cause: new PoolExhaustedCause(),
      });
    }

    // Each day picks toward the user's calorie and protein targets, sizes
    // every slot's portion (0.75×–2×) and adds snacks when the mains still
    // fall short (curated-planner.ts, audit F-PLAN-1-3 / F-PM-4 / P1-1).
    // Variety rule unchanged: no repeat until a pool is used up.
    // Lifters (audit P2-4): protein from bodyweight, and the routine's
    // training days lean toward the higher-protein combinations. The
    // training-day calorie bump itself is premium.
    const profile = await chefProfileRepository.findByUserId(userId);
    const { lifterBodyweightKg } = await this.training.loadLifter(userId, profile ?? null);
    const targets = resolveDailyTargets(profile ?? null, lifterBodyweightKg);
    const widened = await this.training.isBumpWidened();
    const trainingDays =
      options.fitTrainingDays !== false &&
      lifterBodyweightKg &&
      hasTrainingDayBump(profile?.goal, 'lift', widened)
        ? trainingWeekdays(await this.training.trainingSchedule(userId)).map((d) => d.dayOfWeek)
        : [];
    const weekStartDate = getMondayOfWeek(weekOffset);

    // §T-07.4: pinned slots from the plan this generation is about to
    // replace survive when the caller asks (`keepPinned`) and the pinned
    // dish still passes the safety filter — otherwise it's dropped and
    // counted (`droppedPinned`).
    let droppedPinned = 0;
    const overrides = new Map<string, { recipeId: string; portion?: number; recipe: RecipeData }>();
    if (options.keepPinned) {
      const existingPlan = await this.repo.findForWeek(userId, weekStartDate);
      const pinnedSlots = (existingPlan?.days ?? []).flatMap((d) =>
        (d.meals as unknown as PlanMealSlotJson[])
          .filter((m) => m.pinned)
          .map((m) => ({
            dayOfWeek: d.dayOfWeek,
            type: m.type as MealType,
            recipeId: m.recipeId,
            portion: m.portion,
          })),
      );
      if (pinnedSlots.length > 0) {
        const rows = await this.repo.findRecipesByIds(pinnedSlots.map((p) => p.recipeId));
        const rowMap = new Map(rows.map((r) => [r.id, r]));
        for (const pin of pinnedSlots) {
          const row = rowMap.get(pin.recipeId);
          if (!row || findSafetyIssues(rowToRecipeData(row), safety).length > 0) {
            droppedPinned++;
            continue;
          }
          overrides.set(`${pin.dayOfWeek}:${pin.type}`, {
            recipeId: pin.recipeId,
            recipe: rowToRecipeData(row),
            ...(pin.portion !== undefined && { portion: pin.portion }),
          });
        }
      }
    }

    const planned = planCuratedWeek(
      pools,
      {
        calories: targets.dailyCalorieTarget,
        proteinG: targets.proteinG,
        goal: profile?.goal ?? null,
        ...(trainingDays.length > 0 && { trainingDays }),
      },
      Math.random,
      shape,
    );

    // Applies a pinned override to the first not-yet-consumed meal of its
    // type on its day; a day that no longer plans that type (or isn't
    // planned at all) can't host the override — it's dropped and counted.
    const consumed = new Set<string>();
    let days = planned.map((day) => {
      const meals = day.meals.map((meal): CuratedSlot => {
        const key = `${day.dayOfWeek}:${meal.type}`;
        const override = !consumed.has(key) ? overrides.get(key) : undefined;
        if (!override) return { ...meal, pinned: false };
        consumed.add(key);
        return {
          type: meal.type,
          recipe: override.recipe,
          portion: override.portion ?? 1,
          pinned: true,
        };
      });
      return { ...day, meals };
    });
    droppedPinned += [...overrides.keys()].filter((key) => !consumed.has(key)).length;

    // Premium (instant week): pinned favourites land verbatim, as the user's
    // pick (P1-1 — the AI week placed them the same way), then "cook once,
    // eat twice" pairs dinners with next-day lunches. Both become locked
    // slots that live tailoring never touches.
    let placedPinNames: string[] = [];
    if (premium && premium.pinnedFavourites.length > 0) {
      placedPinNames = await this.placePinnedRecipes(userId, { days }, premium.pinnedFavourites, {
        onPlaced: (slot) => {
          slot.portion = 1;
          slot.pinned = true;
        },
      });
    }
    if (premium?.leftovers) {
      days = pairLeftoverSlots(days);
    }

    const uniqueRecipeIds = [...new Set(days.flatMap((d) => d.meals.map((m) => m.recipe.id)))];
    const curatedShopFrom = firstShoppingDay(weekStartDate, new Date());
    // P1-1: each slot's portion is stored in the day JSON (1× is left out,
    // so untouched slots look exactly like before). Only planned days keep
    // meals — an unplanned day is stored as `meals: []` (§2.3, T-07.2).
    const storedDays = days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      meals: d.meals.map(
        (m): PlanMealSlotJson => ({
          type: m.type,
          recipeId: m.recipe.id,
          ...(m.portion !== 1 && { portion: m.portion }),
          ...(m.pinned && { pinned: true }),
          ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
        }),
      ),
    }));
    // T-10.4: a free household's first generated week is sized for the table.
    const firstScaledPortions = premium
      ? null
      : await this.claimFirstScaledWeek(userId, weekStartDate);
    // A newer generation supersedes any live tailoring of this week's plan.
    await this.tailoringRepo.cancelRunningForWeek(userId, weekStartDate);
    const plan = await this.repo.createPlan({
      userId,
      weekStartDate,
      days: storedDays,
      recipeIds: uniqueRecipeIds,
      origin: options.origin,
    });

    const dto: WeekPlanDto = {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      calorieTarget: targets.dailyCalorieTarget,
      proteinTarget: targets.proteinG,
      days: days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        planned: d.planned,
        meals: d.meals.map((m) => ({
          type: m.type,
          recipe: decorateRecipeDto(
            toRecipeDto(m.recipe, { imageUrl: m.recipe.imageUrl, imageStatus: 'DONE' }),
            m.recipe,
            ctx,
          ),
          ...(m.portion !== 1 && { portion: m.portion }),
          ...(m.pinned && { pinned: true }),
          ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
        })),
        ...(d.proteinGapG !== null && { proteinGapG: d.proteinGapG }),
        ...(d.unfilled && { unfilled: d.unfilled }),
      })),
      estimatedCost: premium
        ? await estimatePlanCostEur(daysFrom(days, curatedShopFrom), {
            portions: premium.costPortions,
            userId,
          })
        : await estimatePlanCostEur(daysFrom(days, curatedShopFrom), {
            portions: firstScaledPortions,
            userId,
          }),
      ...(!premium && firstScaledPortions !== null && { firstScaledWeek: true }),
      ...(curatedShopFrom > 0 && { shoppingFromDay: curatedShopFrom }),
      tableSafety: ctx.table,
      ...(plan.previousPlanId && { previousPlanId: plan.previousPlanId }),
      ...(options.keepPinned && { droppedPinned }),
      ...(await this.trainingPayload(userId, weekStartDate, options.trainingAccess)),
      ...(premium && trainingDays.length > 0 && { fitTrainingDays: true }),
    };
    return { dto, planId: plan.id, days, storedDays, shape, placedPinNames };
  }

  /**
   * The user's SafetyPrefs with every household member's allergies and
   * dietary restrictions unioned in (F2 — reused by the free curated path,
   * curated swaps and AI swaps; premium generation merges via
   * computeHouseholdContext). Filtering itself stays `filterSafeRecipes`,
   * unchanged.
   */
  /** How AI recipes are finished for this user (plan-ingredient-catalog §6.3). */
  private finishContext(
    userId: string,
    aiInput: MealPlanInput,
    safety: SafetyPrefs,
    hiddenRecipeIds: string[],
    dayTarget: (dayOfWeek: number) => number,
  ): FinishContext {
    const catalogSlugs = aiInput.catalogSlugs ?? catalogSlugList(safety);
    return {
      catalogSlugs,
      dayTarget,
      swapInput: (mealType, originalRecipeName) => ({
        userId,
        mealType,
        originalRecipeName,
        preferences: {
          dietaryRestrictions: safety.dietaryRestrictions,
          allergies: safety.allergies,
          cuisinePreferences: aiInput.cuisinePreferences,
        },
        catalogSlugs,
      }),
      fallback: (mealType) => pickSafeCurated(mealType, hiddenRecipeIds, undefined, safety),
    };
  }

  /**
   * Replaces generated dishes that conflict with the hard safety prefs
   * (allergies, dietary restrictions) with safe curated recipes of the same
   * meal type. A slot with no safe replacement is dropped rather than served.
   */
  private async enforcePlanSafety(
    plan: WeekPlanResponse,
    safety: SafetyPrefs,
    hiddenIds: string[] = [],
  ): Promise<{ plan: WeekPlanResponse; curatedIds: Set<string> }> {
    const curatedIds = new Set<string>();
    // T-26.7: one structured `safety.filter` line per plan generation (counts
    // and taxonomy rule ids only — the evidence trail, never names).
    const poolSize = plan.days.reduce((n, d) => n + d.meals.length, 0);
    if (
      safety.allergies.length === 0 &&
      safety.dietaryRestrictions.length === 0 &&
      hiddenIds.length === 0
    ) {
      safetyService.logFilterAudit({
        surface: 'plan.generate',
        poolSize,
        kept: poolSize,
        prefs: safety,
      });
      return { plan, curatedIds };
    }
    let replaced = 0;
    let dropped = 0;
    const days = plan.days.map((day) => ({
      ...day,
      meals: day.meals.flatMap((slot) => {
        if (
          findSafetyIssues(slot.recipe, safety).length === 0 &&
          !hiddenIds.includes(slot.recipe.id)
        ) {
          return [slot];
        }
        const safe = pickSafeCurated(slot.type, hiddenIds, undefined, safety);
        if (!safe) {
          dropped++;
          return [];
        }
        replaced++;
        curatedIds.add(safe.id);
        // A replacement is a different dish: drop any leftovers label.
        return [{ type: slot.type, recipe: safe }];
      }),
    }));
    if (replaced + dropped > 0) {
      console.warn(
        `[meal-plan] safety pass replaced ${replaced} and dropped ${dropped} unsafe AI slot(s)`,
      );
      if (replaced > 0) await ensureCuratedRecipes();
    }
    safetyService.logFilterAudit({
      surface: 'plan.generate',
      poolSize,
      kept: poolSize - replaced - dropped,
      prefs: safety,
    });
    return { plan: { ...plan, days }, curatedIds };
  }

  /**
   * The ONE safety read this file uses (T-01.2/T-02.1/delta-4): prefs +
   * reported (hidden) recipe ids + the read-back table, via `SafetyService`
   * instead of a locally re-merged copy (that duplication was exactly how
   * this file's own safety pass used to drift from the rest of the app).
   */
  private async loadSafetyContext(userId: string): Promise<SafetyContext> {
    return safetyService.loadContext(userId);
  }

  /** Table portion sum, or null when it's just the owner (P2-3). */
  private async householdPortions(userId: string): Promise<number | null> {
    const members = await this.householdRepo.findByUserId(userId);
    return members.length > 0 ? householdPortionSum(members) : null;
  }

  /**
   * The user's live daily targets (calories + macros) — same resolver the
   * dashboard ring and premium generation use, so every surface shows one
   * number (P-1/P-3).
   */
  private async loadTargets(userId: string) {
    const chefProfile = await chefProfileRepository.findByUserId(userId);
    // Lifters (audit P2-4): protein from bodyweight — the same base targets
    // the curated portions were chosen against, so a plan's protein-gap hint
    // (P1-1) and the dashboard agree.
    const { lifterBodyweightKg } = await this.training.loadLifter(userId, chefProfile ?? null);
    return resolveDailyTargets(chefProfile ?? null, lifterBodyweightKg);
  }

  /**
   * Joins a plan's day JSON against its recipe rows and assembles the
   * WeekPlanDto. The one implementation behind getActive / getForWeek /
   * getById — this logic used to be copy-pasted three times, which is where
   * single-copy bug fixes went to die (roadmap P0-7).
   */
  private async assemblePlanDto(
    plan: {
      id: string;
      weekStartDate: Date;
      createdAt?: Date;
      /** ACTIVE/ARCHIVED — decides whether live tailoring is shown/resumable. */
      status?: string;
      days: { dayOfWeek: number; meals: unknown }[];
    },
    userId?: string,
    view: PlanViewOptions = {},
  ): Promise<WeekPlanDto> {
    const allMeals = plan.days.flatMap((d) => d.meals as PlanMealSlotJson[]);
    const uniqueIds = [...new Set(allMeals.map((m) => m.recipeId))];
    const [recipeRows, safetyCtx, targets, shape, tailoringRow] = await Promise.all([
      this.repo.findRecipesByIds(uniqueIds),
      userId ? this.loadSafetyContext(userId) : Promise.resolve(null),
      userId ? this.loadTargets(userId) : Promise.resolve(null),
      // wave-1 T-07.6: `planned` used to be reliable only on `generate`'s own
      // response (no shape snapshot was kept per-read) — a plain reload of
      // an unplanned day fell back to a generic "no meals" line with no
      // "Plan this day" CTA. Recomputed from the CURRENT stored shape on
      // every read instead: a day with `meals: []` outside today's chosen
      // days is `planned: false` (a day that already has `meals` is never
      // relabelled, regardless of the shape changing later — see below).
      userId ? planShapeService.getShape(userId) : Promise.resolve(null),
      this.tailoringRepo.findByPlanId(plan.id),
    ]);
    const recipeMap = new Map<string, Recipe>(recipeRows.map((r) => [r.id, r]));
    let tailoring: PlanTailoring | null = null;
    if (tailoringRow) {
      const weekOffset = weekOffsetOf(plan.weekStartDate, getMondayOfWeek(0));
      const future = new Set(tailoringDayOrder(plan.days, weekOffset, getTodayDayIndex()));
      const resumable = untailoredDays(tailoringRow).filter((d) => future.has(d));
      tailoring = toTailoringDto(tailoringRow, plan.status, resumable);
    }
    const plannedDays = shape ? resolvePlanDays(shape.days) : null;

    const days: DayPlanDto[] = plan.days.map((d) => {
      let protein = 0;
      const meals = (d.meals as PlanMealSlotJson[]).flatMap((m): MealSlotDto[] => {
        const row = recipeMap.get(m.recipeId);
        if (!row) {
          // A slot whose recipe row is gone (e.g. another user's recipe placed
          // before INV-5, deleted with their account) used to throw and make
          // the whole week unloadable (PRD FD-7). Drop that one slot instead.
          console.warn(
            `[meal-plan] plan ${plan.id} day ${d.dayOfWeek}: recipe ${m.recipeId} is missing — slot dropped from the response`,
          );
          return [];
        }
        const portion = slotPortion(m.portion);
        protein += ((row.nutritionInfo as unknown as NutritionInfo).protein ?? 0) * portion;
        return [
          {
            type: m.type as MealType,
            recipe: decorateRecipeDto(rowToRecipeDto(row), rowToRecipeData(row), safetyCtx),
            ...(m.leftoverOf && { leftoverOf: m.leftoverOf }),
            ...(portion !== 1 && { portion }),
            ...(m.pinned && { pinned: true }),
          },
        ];
      });
      // P1-1: an honest per-day protein hint, judged on portioned totals.
      const gap = meals.length > 0 ? proteinGapG(protein, targets?.proteinG) : null;
      // An empty day is only ever mislabelled toward `planned: true` (the
      // safe direction — never hides a "Plan this day" CTA a day actually
      // deserves; never claims a day WITH meals isn't planned).
      const planned = meals.length > 0 || !plannedDays ? true : plannedDays.includes(d.dayOfWeek);
      return {
        dayOfWeek: d.dayOfWeek,
        meals,
        ...(gap !== null && { proteinGapG: gap }),
        ...(!planned && { planned }),
      };
    });

    const shopFrom = firstShoppingDay(plan.weekStartDate, plan.createdAt);
    let portions = userId && view.householdScaling ? await this.householdPortions(userId) : null;
    // T-10.4: the free household's first week is scaled too (flag-gated at claim time).
    let firstScaledWeek = false;
    if (userId && portions === null) {
      const first = await this.firstScaledWeekPortions(userId, plan.weekStartDate);
      if (first !== null) {
        portions = first;
        firstScaledWeek = true;
      }
    }
    return {
      planId: plan.id,
      weekStartDate: plan.weekStartDate,
      days,
      // Same scaling as the shopping list, so the chip equals the list total.
      estimatedCost: await estimatePlanCostEur(daysFrom(days, shopFrom), { portions, userId }),
      ...(firstScaledWeek && { firstScaledWeek: true }),
      ...(shopFrom > 0 && { shoppingFromDay: shopFrom }),
      ...(targets && {
        calorieTarget: targets.dailyCalorieTarget,
        proteinTarget: targets.proteinG,
      }),
      ...(tailoring && { tailoring }),
      ...(safetyCtx && { tableSafety: safetyCtx.table }),
      ...(userId && (await this.trainingPayload(userId, plan.weekStartDate, view.trainingAccess))),
    };
  }

  /**
   * Returns the plan for the CURRENT calendar week, or null. Kept for old
   * clients (they don't send a week offset); B-13/T-00.15: it used to read
   * `findActiveWithDays` — whichever plan happened to be ACTIVE, any week —
   * which leaked a later week's plan once that week became the sole active
   * plan (e.g. a Sunday planner generating next week). It no longer falls
   * back to next week.
   */
  async getActive(userId: string, view: PlanViewOptions = {}): Promise<WeekPlanDto | null> {
    const plan = await this.repo.findForWeek(userId, getMondayOfWeek(0));
    if (!plan) return null;
    return this.assemblePlanDto(plan, userId, view);
  }

  /**
   * Returns the meal plan for a given week offset (0 = current, -1 = last week, 1 = next week).
   * Returns null if no plan exists for that week.
   */
  async getForWeek(
    userId: string,
    weekOffset: number,
    view: PlanViewOptions = {},
  ): Promise<WeekPlanDto | null> {
    const monday = getMondayOfWeek(weekOffset);
    // B-13/T-00.15: matched to THIS week only — no more falling back to
    // findActiveWithDays for offset 0, which used to show a different week's
    // plan whenever it was the only ACTIVE row (every Sunday planner's view
    // corrupted). Carry-forward below is the only other source for "this
    // week has no plan of its own".
    const plan = await this.repo.findForWeek(userId, monday);

    // Carry-forward: a week without a plan continues the user's most recent
    // one (current and future weeks only — the past stays as it was). The
    // copy is a real plan row so shopping list / tracker / swaps all work on
    // it, and editing it never touches the source week. Deliberate write-on-
    // read: "the plan continues by default" must hold on every surface that
    // reads the week, without each client opting in.
    if (!plan && weekOffset >= 0) {
      // A followed template ("My weeks") wins over the most recent plan.
      const followed = await this.repo.findFollowedTemplate(userId);
      const source = followed ?? (await this.repo.findLatestWithDaysBefore(userId, monday));
      if (source?.days.some((d) => (d.meals as unknown[]).length > 0)) {
        await this.repo.createPlan({
          userId,
          weekStartDate: monday,
          days: source.days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            meals: d.meals as { type: string; recipeId: string }[],
          })),
          recipeIds: [],
          // Marked so the Sunday worker can still replace an untouched copy
          // with a fresh week (audit F-PLAN-4-2); a followed template is a
          // choice and stays.
          origin: followed ? MealPlanOrigin.TEMPLATE : MealPlanOrigin.CARRY_FORWARD,
        });
        const created = await this.repo.findForWeek(userId, monday);
        if (created) {
          return { ...(await this.assemblePlanDto(created, userId, view)), carriedOver: true };
        }
      }
    }

    if (!plan) return null;
    return this.assemblePlanDto(plan, userId, view);
  }

  /**
   * Returns a single recipe by ID, if the user may see it (recipe-access.ts):
   * open recipes work without a meal plan; another user's private recipe is
   * NOT_FOUND.
   */
  async getRecipe(userId: string, recipeId: string): Promise<RecipeDto> {
    const row = await this.findVisibleRecipe(userId, recipeId);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    const [ctx, attribution, nutritionLines] = await Promise.all([
      this.loadSafetyContext(userId),
      this.attributionFor(userId, row),
      recipeNutritionService.breakdown(row.id, userId),
    ]);
    return {
      ...decorateRecipeDto(rowToRecipeDto(row), rowToRecipeData(row), ctx),
      ...attribution,
      ...(row.sourceUrl && { sourceUrl: row.sourceUrl }),
      ...(nutritionLines.length > 0 && { nutritionLines }),
    };
  }

  /**
   * Following attribution for the recipe detail (plan §4.2): `creator` on
   * another user's MANUAL recipe while Following is on for the viewer,
   * `origin` on the viewer's copy, `hidden` on the owner's auto-hidden recipe.
   * No query at all for open recipes or a plain own recipe.
   */
  private async attributionFor(userId: string, row: Recipe): Promise<RecipeAttribution> {
    const own = row.creatorId === userId;
    const othersManual = row.source === 'MANUAL' && !own && row.creatorId !== null;
    const isCopy = own && row.originCreatorId != null;
    const friendsOn = othersManual ? await this.recipeSocial.isEnabled(userId) : false;
    const ids = [
      ...(friendsOn && row.creatorId ? [row.creatorId] : []),
      ...(isCopy && row.originCreatorId ? [row.originCreatorId] : []),
    ];
    const people = ids.length > 0 ? await favouriteRecipeRepository.findPeopleByIds(ids) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return recipeAttribution(
      userId,
      row,
      {
        creator: row.creatorId ? byId.get(row.creatorId) : undefined,
        originCreator: row.originCreatorId ? byId.get(row.originCreatorId) : undefined,
      },
      { friendsOn, withHidden: true },
    );
  }

  /**
   * Swaps a single meal slot. Premium users get an AI-generated alternative;
   * free users get a random curated recipe of the same meal type.
   */
  async swapRecipe(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    _reason?: string,
    premium = false,
    requestedSlotIndex?: number,
  ): Promise<RecipeDto> {
    // Verify the plan belongs to this user (look up by ID so it works for any week)
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    // Validated before any AI call, so a stale index never costs a generation.
    const slotIndex = resolvePlanSlot(plan, dayOfWeek, mealType, requestedSlotIndex);

    if (!premium) {
      return this.swapCurated(userId, planId, dayOfWeek, mealType, plan, slotIndex);
    }

    // Load dietary preferences for the swap prompt. Safety is the household
    // union (F2) — a swapped-in dish must be safe for everyone at the table.
    const [, dietaryPrefs, ctx] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      dietaryPreferencesRepository.findByUserId(userId),
      this.loadSafetyContext(userId),
    ]);
    const mergedSafety = ctx.prefs;

    // Find the current recipe name in the plan day
    const slot = slotAt(plan, dayOfWeek, slotIndex);
    const previousRecipeId = slot?.recipeId;
    const currentRecipe = slot ? await this.repo.findRecipeById(slot.recipeId) : null;

    // Call AI swap (catalog slugs, no nutrition — plan-ingredient-catalog §6.3)
    const catalogSlugs = catalogSlugList(mergedSafety);
    const swapInput = (type: MealType, originalRecipeName: string): SwapInput => ({
      userId,
      mealType: type,
      originalRecipeName,
      preferences: {
        dietaryRestrictions: mergedSafety.dietaryRestrictions,
        allergies: mergedSafety.allergies,
        cuisinePreferences: dietaryPrefs?.cuisinePreferences ?? [],
      },
      catalogSlugs,
    });
    let newRecipe: RecipeData;
    try {
      newRecipe = await aiService.generateRecipeSwap(
        swapInput(mealType as MealType, currentRecipe?.name ?? mealType),
      );
    } catch (err) {
      throw toFriendlyAiError(
        err,
        'generateRecipeSwap',
        'Failed to swap recipe. Please try again.',
      );
    }

    // Computed from the catalog and sized like the dish it replaces (§6.3);
    // a recipe that still won't compute falls back to curated below.
    const finished = await this.aiFinisher.finishRecipe(
      newRecipe,
      mealType as MealType,
      (currentRecipe?.nutritionInfo as { calories?: number } | null)?.calories ?? 0,
      { catalogSlugs, swapInput },
    );
    if (!finished) {
      console.warn('[meal-plan] AI swap did not compute from the catalog; using a curated recipe');
      return this.swapCurated(userId, planId, dayOfWeek, mealType, plan, slotIndex);
    }
    // Server-minted id, as for generated weeks (recipe-ids.ts).
    newRecipe = { ...finished, id: randomUUID() };

    // Usage is logged by the caller's quota reservation (reserveAiSwap).

    // Never trust the AI on safety (F-PLAN-1-9): an unsafe swap falls back
    // to a safe curated recipe instead.
    if (findSafetyIssues(newRecipe, mergedSafety).length > 0) {
      console.warn('[meal-plan] AI swap failed the safety check; using a curated recipe');
      return this.swapCurated(userId, planId, dayOfWeek, mealType, plan, slotIndex);
    }

    // Reuse an existing image if we've generated this dish before
    const knownImages = await this.repo.findRecipeImagesByNames([newRecipe.name]);
    const reusedUrl = newRecipe.imageUrl ?? knownImages.get(newRecipe.name.toLowerCase()) ?? null;

    await this.repo.upsertRecipes([
      {
        id: newRecipe.id,
        name: newRecipe.name,
        description: newRecipe.description,
        ingredients: newRecipe.ingredients,
        instructions: newRecipe.instructions,
        nutritionInfo: newRecipe.nutritionInfo,
        cuisineType: newRecipe.cuisineType,
        dietaryTags: newRecipe.dietaryTags,
        prepTimeMins: newRecipe.prepTimeMins,
        cookTimeMins: newRecipe.cookTimeMins,
        servings: newRecipe.servings,
        imageUrl: reusedUrl,
        imageStatus: reusedUrl ? ('DONE' as const) : ('PENDING' as const),
        imagePriority: dayImagePriority(dayOfWeek, 0),
        creatorId: userId,
      },
    ]);
    await this.aiFinisher.persistLines([newRecipe]);

    // Update the day's meal slot
    await this.repo.updateDayMeal(
      planId,
      dayOfWeek,
      mealType,
      newRecipe.id,
      ...slotArgs(undefined, slotIndex),
    );

    if (!reusedUrl) recipeImageWorker.wake();

    return {
      ...decorateRecipeDto(
        toRecipeDto(newRecipe, {
          imageUrl: reusedUrl,
          imageStatus: reusedUrl ? 'DONE' : 'PENDING',
        }),
        newRecipe,
        ctx,
      ),
      // T-08.6: the default this wave is commit + Undo (no preview) — the
      // client offers Undo by calling `replaceRecipe` back to this id.
      ...(previousRecipeId && { previousRecipeId }),
    };
  }

  /**
   * FREE-tier swap: random curated recipe of the same meal type (no AI),
   * drawn only from the user's safety-filtered pool.
   */
  private async swapCurated(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    plan: { days: { dayOfWeek: number; meals: unknown }[] },
    slotIndex: number | null,
  ): Promise<RecipeDto> {
    await ensureCuratedRecipes();

    // F2: swap alternatives must be safe for the whole household too; T-01.5
    // reported recipes are excluded from the pick as well.
    const ctx = await this.loadSafetyContext(userId);

    const slot = slotAt(plan, dayOfWeek, slotIndex);

    const newRecipe = pickSafeCurated(
      mealType as MealType,
      ctx.hiddenRecipeIds,
      slot?.recipeId,
      ctx.prefs,
    );
    if (!newRecipe) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          "We don't have another free recipe matching your restrictions — upgrade for AI swaps that always fit your needs.",
      });
    }
    // P1-1: a portioned slot keeps its calories — the new dish is sized to
    // the old slot's kcal (nearest portion step), so the day stays on target.
    const oldPortion = slotPortion(slot?.portion);
    let portion: number | undefined;
    if (slot && oldPortion !== 1) {
      const oldRow = await this.repo.findRecipeById(slot.recipeId);
      const oldKcal = (oldRow?.nutritionInfo as unknown as NutritionInfo | undefined)?.calories;
      portion = oldKcal
        ? nearestPortionStep((oldKcal * oldPortion) / (newRecipe.nutritionInfo.calories || 1))
        : undefined;
    }
    await this.repo.updateDayMeal(
      planId,
      dayOfWeek,
      mealType,
      newRecipe.id,
      ...slotArgs(portion, slotIndex),
    );

    return {
      ...decorateRecipeDto(
        toRecipeDto(newRecipe, { imageUrl: newRecipe.imageUrl, imageStatus: 'DONE' }),
        newRecipe,
        ctx,
      ),
      ...(slot?.recipeId && { previousRecipeId: slot.recipeId }),
    };
  }

  /**
   * Replaces a single meal slot with a specific saved recipe chosen by the
   * user. B-34/B-46 (T-00.11): this used to accept anything `recipeId`
   * pointed at, including a recipe that conflicts with the user's or
   * household's allergies/dietary restrictions — Replace is picked from
   * search, not the safety-filtered curated pool, so nothing upstream
   * guaranteed it was edible. Rejected with `UNSAFE_FOR_TABLE` (message
   * names the conflicting allergen/restriction) unless the caller passes
   * `acknowledgeConflict: true` AND the recipe is the user's own manual one
   * — someone else's or a curated recipe never gets a bypass. Additive:
   * `acknowledgeConflict` is optional, so older clients keep hitting the
   * rejection with no way to override (safe default).
   */
  async replaceRecipe(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    recipeId: string,
    requestedSlotIndex?: number,
    acknowledgeConflict?: boolean,
  ): Promise<RecipeDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const slotIndex = resolvePlanSlot(plan, dayOfWeek, mealType, requestedSlotIndex);

    const found = await this.findVisibleRecipe(userId, recipeId);
    if (!found) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }

    const ctx = await this.loadSafetyContext(userId);
    const issues = findSafetyIssues(rowToRecipeData(found), ctx.prefs);
    if (issues.length > 0) {
      // Honoured only for a MANUAL recipe the user owns — or, with Following,
      // another user's MANUAL recipe, which becomes the user's own copy below.
      if (!acknowledgeConflict || !isAcknowledgeable(found)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `UNSAFE_FOR_TABLE: this recipe contains ${issues[0]}, which conflicts with an allergy or dietary restriction set for your table.`,
        });
      }
    }

    // INV-5: another user's MANUAL recipe goes in as the user's own copy.
    const { recipe } = await this.copies.ownedRecipeFor(userId, found);

    // T-08.5/T-BUG-X2: keep the slot's current portion (it used to always
    // drop to 1×) and mark the slot `Your pick` (T-07.4) — a manual Replace
    // is exactly the kind of choice Regenerate should preserve by default.
    const currentSlot = slotAt(plan, dayOfWeek, slotIndex);
    const previousRecipeId = currentSlot?.recipeId;
    const keepPortion = slotPortion(currentSlot?.portion);

    await this.repo.updateDayMeal(
      planId,
      dayOfWeek,
      mealType,
      recipe.id,
      keepPortion !== 1 ? keepPortion : undefined,
      slotIndex ?? undefined,
      true,
    );

    return {
      ...decorateRecipeDto(rowToRecipeDto(recipe), rowToRecipeData(recipe), ctx),
      ...(previousRecipeId && previousRecipeId !== recipe.id && { previousRecipeId }),
    };
  }

  /**
   * `friends.addRecipeToWeek` (PRD FR-17.4–17.7, §13; UX §9.5): puts a
   * recipe the viewer may see into their OWN plan for this or next week.
   *
   * - `add` appends a slot of `mealType` to the day (existing slots keep their
   *   indexes); `replace` swaps the slot at `slotIndex` (its type must match),
   *   keeping its portion. Either way the slot is the user's pick.
   * - Another user's MANUAL recipe goes in as the viewer's private copy,
   *   made once and reused (INV-5, FR-17.7).
   * - A conflict with the viewer's table refuses with `data.unsafeForTable`
   *   unless `acknowledgeConflict` (FR-17.5 `Use anyway`) — honoured, like
   *   `replaceRecipe`, only for a MANUAL recipe (it becomes the viewer's own
   *   copy); an open AI/curated recipe stays refused, without the
   *   `unsafeForTable` data so the client offers no `Use anyway`.
   */
  async addRecipeToSlot(
    userId: string,
    input: AddRecipeToWeekInput,
  ): Promise<AddRecipeToWeekResultDto> {
    const { recipeId, weekOffset, dayOfWeek, mealType, mode, acknowledgeConflict } = input;
    if (mode === 'replace' && input.slotIndex === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose the meal to replace.' });
    }

    const found = await this.findVisibleRecipe(userId, recipeId);
    if (!found) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }

    // The viewer's own week as stored — never `getForWeek`, which writes on
    // read (carry-forward). The sheet reads that first, so a plan normally
    // exists by the time this runs.
    const plan = await this.repo.findForWeek(userId, getMondayOfWeek(weekOffset));
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: FRIENDS_COPY.addToWeek.noPlan });
    }
    const slotIndex =
      mode === 'replace' ? resolvePlanSlot(plan, dayOfWeek, mealType, input.slotIndex) : null;

    const ctx = await this.loadSafetyContext(userId);
    const issues = findSafetyIssues(rowToRecipeData(found), ctx.prefs);
    if (issues.length > 0 && !(acknowledgeConflict && isAcknowledgeable(found))) {
      if (isAcknowledgeable(found)) throw unsafeForTableError(issues);
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `UNSAFE_FOR_TABLE: this recipe contains ${issues[0]}, which conflicts with an allergy or dietary restriction set for your table.`,
      });
    }

    const owned = await this.copies.ownedRecipeFor(userId, found);
    const addedRecipeId = owned.recipe.id;

    if (mode === 'add') {
      const index = await this.repo.appendDayMeal(plan.id, dayOfWeek, mealType, addedRecipeId, {
        pinned: true,
      });
      return {
        planId: plan.id,
        dayOfWeek,
        mealType,
        slotIndex: index,
        addedRecipeId,
        copiedFromId: owned.copiedFromId,
      };
    }

    // replace: `resolvePlanSlot` already proved the slot exists with this type.
    if (slotIndex === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose the meal to replace.' });
    }
    const index = slotIndex;
    const currentSlot = slotAt(plan, dayOfWeek, index);
    const previousRecipeId = currentSlot?.recipeId;
    const keepPortion = slotPortion(currentSlot?.portion);
    await this.repo.updateDayMeal(
      plan.id,
      dayOfWeek,
      mealType,
      addedRecipeId,
      keepPortion !== 1 ? keepPortion : undefined,
      index,
      true,
    );
    return {
      planId: plan.id,
      dayOfWeek,
      mealType,
      slotIndex: index,
      addedRecipeId,
      copiedFromId: owned.copiedFromId,
      ...(previousRecipeId &&
        previousRecipeId !== addedRecipeId && {
          previousRecipeId,
          previousPinned: currentSlot?.pinned === true,
        }),
    };
  }

  /**
   * `friends.undoAddToWeek`: reverses `addRecipeToSlot` on the caller's OWN
   * plan only (NOT_FOUND otherwise), and only while the slot still holds
   * `addedRecipeId` — a stale or repeated Undo is a no-op. An add removes the
   * slot; a replace puts `previousRecipeId` back (it must still be a recipe
   * the user may see, resolved to their own copy like any write — INV-5). The
   * copy itself is kept, so adding again reuses it.
   */
  async undoAddToSlot(userId: string, input: UndoAddToWeekInput): Promise<{ ok: true }> {
    const plan = await this.repo.findByIdForUser(userId, input.planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const { dayOfWeek, mealType, slotIndex, addedRecipeId, previousRecipeId } = input;

    if (previousRecipeId === undefined) {
      await this.repo.removeDayMealIfMatches(
        plan.id,
        dayOfWeek,
        slotIndex,
        addedRecipeId,
        mealType,
      );
      return { ok: true };
    }

    const current = slotAt(plan, dayOfWeek, slotIndex);
    if (current?.type !== mealType || current.recipeId !== addedRecipeId) return { ok: true };
    const previous = await this.findVisibleRecipe(userId, previousRecipeId);
    if (!previous) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    }
    const { recipe } = await this.copies.ownedRecipeFor(userId, previous);
    const portion = slotPortion(current.portion);
    await this.repo.updateDayMeal(
      plan.id,
      dayOfWeek,
      mealType,
      recipe.id,
      portion !== 1 ? portion : undefined,
      slotIndex,
      // The replaced slot's own flag (F3.1: `previousPinned`, from the add's
      // result); an older client doesn't send it, and then a dish the user
      // had in this slot is still their pick.
      input.previousPinned ?? true,
    );
    return { ok: true };
  }

  /** §T-07.4: toggles `Your pick` on an existing slot without touching its recipe. */
  async setSlotPinned(
    userId: string,
    planId: string,
    dayOfWeek: number,
    mealType: string,
    requestedSlotIndex: number | undefined,
    pinned: boolean,
  ): Promise<void> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const slotIndex = resolvePlanSlot(plan, dayOfWeek, mealType, requestedSlotIndex);
    await this.repo.setSlotPinned(planId, dayOfWeek, mealType, slotIndex, pinned);
  }

  /**
   * §T-11.3: scales every slot of one day by `factor` (0.75–1.5×, each
   * slot's own resulting portion still capped to the plan's 0.75–2× steps —
   * T-11.4). `apply: false` (the default) previews without persisting;
   * `apply: true` writes it and is the same shape `PlanMissSheet`'s
   * "Bigger portions" commits (built by L-HOME, wave 2).
   */
  async scaleDay(
    userId: string,
    planId: string,
    dayOfWeek: number,
    factor: number,
    apply = false,
  ): Promise<{ dayOfWeek: number; meals: MealSlotDto[]; kcal: number; protein: number }> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'That day has no plan.' });
    }
    const meals = day.meals as unknown as PlanMealSlotJson[];
    const recipeRows = await this.repo.findRecipesByIds(meals.map((m) => m.recipeId));
    const recipeMap = new Map<string, Recipe>(recipeRows.map((r) => [r.id, r]));

    const newPortions = meals.map((m) => nearestPortionStep(slotPortion(m.portion) * factor));
    if (apply) {
      await this.repo.setDayPortions(planId, dayOfWeek, newPortions);
    }

    let kcal = 0;
    let protein = 0;
    const mealDtos: MealSlotDto[] = meals.map((m, i) => {
      const row = recipeMap.get(m.recipeId);
      if (!row) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Recipe ${m.recipeId} not found in database.`,
        });
      }
      const portion = newPortions[i] ?? 1;
      const n = row.nutritionInfo as unknown as NutritionInfo;
      kcal += (n.calories ?? 0) * portion;
      protein += (n.protein ?? 0) * portion;
      return {
        type: m.type as MealType,
        recipe: rowToRecipeDto(row),
        ...(portion !== 1 && { portion }),
        ...(m.pinned && { pinned: true }),
      };
    });

    return { dayOfWeek, meals: mealDtos, kcal: Math.round(kcal), protein: Math.round(protein) };
  }

  /**
   * §wave-1 L-PLAN (T-planDay, UX-07 "Plan this day"): fills ONE currently
   * unplanned day of an EXISTING plan in place — every other day's `meals`
   * is untouched. Until this existed, the only way to add a day was
   * `generate({ shape: { days: [d] } })`, which rewrites the whole plan
   * document (every other day too), because `generate` always calls
   * `createPlan` fresh.
   *
   * Always uses the curated (zero-AI-cost) picker — the same engine the free
   * tier's `generate` uses — regardless of the caller's plan tier: filling
   * one day doesn't warrant a full AI-personalised regeneration, and this
   * keeps the operation fast and free to retry. The router reserves it
   * against the same `CURATED_PLAN` daily quota `generate`'s free path uses
   * (`reservePlanGeneration(user, false)`).
   *
   * Rejects a day that already has meals (`CONFLICT`) — Replace/AI-swap own
   * changing an existing slot, `generate` owns redoing the whole week.
   */
  async planDay(userId: string, planId: string, dayOfWeek: number): Promise<WeekPlanDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'That day is not part of this plan.' });
    }
    const existingMeals = day.meals as unknown as PlanMealSlotJson[];
    if (existingMeals.length > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This day already has a plan — use Replace or Regenerate instead.',
      });
    }

    await ensureCuratedRecipes();
    const dayCtx = await this.loadSafetyContext(userId);
    const rawDayPools = safeCuratedPools(dayCtx.prefs);
    // T-01.5: a reported recipe never resurfaces via `Plan this day` either.
    const pools: Record<MealType, RecipeData[]> = {
      breakfast: excludeHidden(rawDayPools.breakfast, dayCtx.hiddenRecipeIds),
      lunch: excludeHidden(rawDayPools.lunch, dayCtx.hiddenRecipeIds),
      dinner: excludeHidden(rawDayPools.dinner, dayCtx.hiddenRecipeIds),
      snack: excludeHidden(rawDayPools.snack, dayCtx.hiddenRecipeIds),
    };

    // The stored shape, with `days` forced to just this one day for this
    // call only (never persisted) — mirrors `generate`'s one-off `shape`
    // override (T-07.2/T-07.3).
    const storedShape = await planShapeService.getShape(userId);
    const shape: CuratedShapeOptions = { ...storedShape, days: [dayOfWeek] };
    const wantedMainTypes = (['breakfast', 'lunch', 'dinner'] as MealType[]).filter((type) =>
      resolvePlanSlots(shape.slots ?? []).includes(type),
    );
    // T-10.4: same pool-exhaustion signal `generate` gives — only the meal
    // types this day's shape actually wants must clear the bar.
    const exhausted = wantedMainTypes.filter((type) => pools[type].length < MIN_SAFE_POOL_SIZE);
    if (exhausted.length > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          "We don't have enough free recipes matching your restrictions — upgrade for AI-generated plans that always fit your needs.",
        cause: new PoolExhaustedCause(),
      });
    }

    const profile = await chefProfileRepository.findByUserId(userId);
    const { lifterBodyweightKg } = await this.training.loadLifter(userId, profile ?? null);
    const targets = resolveDailyTargets(profile ?? null, lifterBodyweightKg);
    const widened = await this.training.isBumpWidened();
    const trainingDays =
      lifterBodyweightKg && hasTrainingDayBump(profile?.goal, 'lift', widened)
        ? trainingWeekdays(await this.training.trainingSchedule(userId)).map((d) => d.dayOfWeek)
        : [];

    const planned = planCuratedWeek(
      pools,
      {
        calories: targets.dailyCalorieTarget,
        proteinG: targets.proteinG,
        goal: profile?.goal ?? null,
        ...(trainingDays.length > 0 && { trainingDays }),
      },
      Math.random,
      shape,
    );
    const plannedDay = planned.find((d) => d.dayOfWeek === dayOfWeek);
    if (!plannedDay || plannedDay.meals.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: "We couldn't fit a plan for that day — try again or adjust your plan settings.",
      });
    }

    await this.repo.setDayMeals(
      planId,
      dayOfWeek,
      plannedDay.meals.map((m) => ({
        type: m.type,
        recipeId: m.recipe.id,
        ...(m.portion !== 1 && { portion: m.portion }),
      })),
    );

    const updatedPlan = await this.repo.findByIdForUser(userId, planId);
    if (!updatedPlan) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Plan disappeared while it was being updated.',
      });
    }
    return this.assemblePlanDto(updatedPlan, userId, {});
  }

  // ─── Week templates ("My weeks") ────────────────────────────────────────────
  // Up to MAX_WEEK_TEMPLATES named saved weeks the user rotates through. All
  // free-tier: no AI is involved anywhere in templates.

  async saveAsTemplate(userId: string, planId: string, name: string): Promise<TemplateSummaryDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan || plan.isTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Meal plan not found.' });
    }
    const count = await this.repo.countTemplates(userId);
    if (count >= MAX_WEEK_TEMPLATES) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `You can keep up to ${MAX_WEEK_TEMPLATES} week templates — delete one to save this week.`,
      });
    }
    const template = await this.repo.createTemplate(
      userId,
      name,
      plan.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals as { type: string; recipeId: string }[],
      })),
    );
    const [summary] = await this.summarizeTemplates([{ ...template, days: plan.days }]);
    return summary!;
  }

  async listTemplates(userId: string): Promise<TemplateSummaryDto[]> {
    const templates = await this.repo.findTemplates(userId);
    return this.summarizeTemplates(templates);
  }

  async renameTemplate(userId: string, templateId: string, name: string): Promise<void> {
    const template = await this.repo.findTemplateById(userId, templateId);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Week template not found.' });
    }
    await this.repo.renameTemplate(userId, templateId, name);
  }

  async deleteTemplate(userId: string, templateId: string): Promise<void> {
    const template = await this.repo.findTemplateById(userId, templateId);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Week template not found.' });
    }
    await this.repo.deleteTemplate(userId, templateId);
  }

  /**
   * Marks the template as followed (carry-forward clones it from now on) and
   * applies it to the requested week immediately: the existing plan for that
   * week, if any, is archived by createPlan — one tap to switch weeks.
   */
  async followTemplate(
    userId: string,
    templateId: string,
    weekOffset: 0 | 1,
  ): Promise<WeekPlanDto> {
    const template = await this.repo.findTemplateById(userId, templateId);
    if (!template) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Week template not found.' });
    }
    await this.repo.setFollowedTemplate(userId, templateId);

    const created = await this.applyTemplateToWeek(userId, template, getMondayOfWeek(weekOffset));
    return this.assemblePlanDto(created, userId);
  }

  /**
   * Materializes a template as the plan for the week starting `monday`
   * (origin TEMPLATE). Used by followTemplate and by the Sunday worker, which
   * must repeat a followed week instead of generating over it (F-PLAN-4-1).
   */
  async applyTemplateToWeek(
    userId: string,
    template: { days: { dayOfWeek: number; meals: unknown }[] },
    monday: Date,
  ): Promise<NonNullable<Awaited<ReturnType<IMealPlanRepository['findByWeekStart']>>>> {
    await this.repo.createPlan({
      userId,
      weekStartDate: monday,
      days: template.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        meals: d.meals as { type: string; recipeId: string }[],
      })),
      recipeIds: [],
      origin: MealPlanOrigin.TEMPLATE,
    });
    const created = await this.repo.findByWeekStart(userId, monday);
    if (!created) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Applying the week failed.' });
    }
    return created;
  }

  async unfollowTemplate(userId: string): Promise<void> {
    await this.repo.setFollowedTemplate(userId, null);
  }

  private async summarizeTemplates(
    templates: {
      id: string;
      name: string | null;
      isFollowed: boolean;
      createdAt: Date;
      days: { meals: unknown }[];
    }[],
  ): Promise<TemplateSummaryDto[]> {
    type MealSlotJson = { type: string; recipeId: string };
    const allIds = new Set<string>();
    for (const t of templates) {
      for (const day of t.days) {
        for (const m of day.meals as MealSlotJson[]) allIds.add(m.recipeId);
      }
    }
    const recipeRows = await this.repo.findRecipesByIds([...allIds]);
    const nameById = new Map(recipeRows.map((r) => [r.id, r.name]));

    return templates.map((t) => {
      const meals = t.days.flatMap((d) => d.meals as MealSlotJson[]);
      const uniqueIds = [...new Set(meals.map((m) => m.recipeId))];
      return {
        id: t.id,
        name: t.name ?? 'Saved week',
        isFollowed: t.isFollowed,
        createdAt: t.createdAt,
        mealsCount: meals.length,
        previewNames: uniqueIds.slice(0, 3).map((id) => nameById.get(id) ?? 'Unknown'),
      };
    });
  }

  async list(userId: string, limit = 10, offset = 0): Promise<MealPlanSummaryDto[]> {
    const plans = await this.repo.findAllByUserId(userId, limit, offset);
    if (plans.length === 0) return [];

    // Collect all recipe IDs across all plans
    type MealSlotJson = PlanMealSlotJson;
    const allIds = new Set<string>();
    for (const plan of plans) {
      for (const day of plan.days) {
        for (const m of day.meals as MealSlotJson[]) allIds.add(m.recipeId);
      }
    }
    const recipeRows = await this.repo.findRecipesByIds([...allIds]);
    const recipeMap = new Map<string, Recipe>(recipeRows.map((r) => [r.id, r]));

    return plans.map((plan) => {
      const allMeals = plan.days.flatMap((d) => d.meals as MealSlotJson[]);
      const uniqueIds = [...new Set(allMeals.map((m) => m.recipeId))];
      const previewNames = uniqueIds.slice(0, 3).map((id) => recipeMap.get(id)?.name ?? 'Unknown');

      // Calculate average daily macros
      const dayTotals = plan.days.map((day) => {
        let kcal = 0,
          protein = 0,
          carbs = 0,
          fat = 0;
        for (const m of day.meals as MealSlotJson[]) {
          const recipe = recipeMap.get(m.recipeId);
          if (!recipe) continue;
          const n = recipe.nutritionInfo as unknown as NutritionInfo;
          const p = slotPortion(m.portion);
          kcal += (n.calories ?? 0) * p;
          protein += (n.protein ?? 0) * p;
          carbs += (n.carbs ?? 0) * p;
          fat += (n.fat ?? 0) * p;
        }
        return { kcal, protein, carbs, fat };
      });

      const dayCount = dayTotals.length || 1;
      const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / dayCount);

      const weekStart = new Date(plan.weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return {
        id: plan.id,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        status: plan.status,
        createdAt: plan.createdAt,
        recipePreview: previewNames,
        macroSummary: {
          avgKcal: avg(dayTotals.map((d) => d.kcal)),
          avgProtein: avg(dayTotals.map((d) => d.protein)),
          avgCarbs: avg(dayTotals.map((d) => d.carbs)),
          avgFat: avg(dayTotals.map((d) => d.fat)),
        },
      };
    });
  }

  async restore(userId: string, planId: string): Promise<WeekPlanDto> {
    // Ownership check via a single indexed lookup (previously a 100-row scan)
    const target = await this.repo.findByIdForUser(userId, planId);
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });
    }

    if (target.isTemplate) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });
    }

    // Restore = a fresh copy of the old plan as the newest row for its week.
    // Flipping the old row back to ACTIVE didn't work: week lookups take the
    // newest row, so the restored plan never showed, and every other week's
    // plan was archived too (audit F-PLAN-6-1). createPlan archives only the
    // same week and carries the old plan's shopping ticks and custom items.
    const days = target.days.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      meals: d.meals as PlanMealSlotJson[],
    }));
    const restored = await this.repo.createPlan({
      userId,
      weekStartDate: target.weekStartDate,
      days,
      recipeIds: [...new Set(days.flatMap((d) => d.meals.map((m) => m.recipeId)))],
      carryShoppingFromPlanId: target.id,
    });

    return this.assemblePlanDto({ ...restored, days: target.days }, userId);
  }

  async getById(userId: string, planId: string, view: PlanViewOptions = {}): Promise<WeekPlanDto> {
    const plan = await this.repo.findByIdForUser(userId, planId);
    if (!plan) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });
    }
    return this.assemblePlanDto(plan, userId, view);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const mealPlanService = new MealPlanService(mealPlanRepository);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SlotPlan = { days: { dayOfWeek: number; meals: unknown }[] };

/**
 * The index in `day.meals` of the slot a per-slot operation addresses. A
 * curated day can hold two snacks, so `mealType` alone is ambiguous: clients
 * send `slotIndex`, which must point at a slot of that type (BAD_REQUEST
 * otherwise — a stale client view must not overwrite a different meal).
 * Without it (shipped mobile builds) the first slot of the type is used, as
 * before; null when the day has no such slot.
 */
export function resolvePlanSlot(
  plan: SlotPlan,
  dayOfWeek: number,
  mealType: string,
  slotIndex?: number,
): number | null {
  const meals = (plan.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals ??
    []) as PlanMealSlotJson[];
  if (slotIndex === undefined) {
    const first = meals.findIndex((m) => m.type === mealType);
    return first === -1 ? null : first;
  }
  if (meals[slotIndex]?.type !== mealType) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'That meal is no longer in this slot. Refresh the plan and try again.',
    });
  }
  return slotIndex;
}

/**
 * Whether `acknowledgeConflict` may place this recipe despite a table
 * conflict: a MANUAL recipe — the user's own, or another user's that is
 * placed as the user's own copy (INV-5). Never an open AI/curated recipe
 * (B-34/B-46).
 */
function isAcknowledgeable(recipe: Pick<Recipe, 'source'>): boolean {
  return recipe.source === 'MANUAL';
}

function slotAt(
  plan: SlotPlan,
  dayOfWeek: number,
  slotIndex: number | null,
): PlanMealSlotJson | undefined {
  if (slotIndex === null) return undefined;
  const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
  return (day?.meals as PlanMealSlotJson[] | undefined)?.[slotIndex];
}

/** Trailing `updateDayMeal` args: the portion (undefined at 1×), then the slot index. */
function slotArgs(
  portion: number | undefined,
  slotIndex: number | null,
): [portion?: number | undefined, slotIndex?: number] {
  const sized = portion !== undefined && portion !== 1 ? portion : undefined;
  if (slotIndex === null) return sized !== undefined ? [sized] : [];
  return [sized, slotIndex];
}

/** The plan portion step closest to `ratio` (0.75×–2×). */
export function nearestPortionStep(ratio: number): number {
  return PLAN_PORTION_STEPS.reduce<number>(
    (best, step) => (Math.abs(step - ratio) < Math.abs(best - ratio) ? step : best),
    1,
  );
}

/**
 * Per-day kcal totals of a generated week (per-serving nutrition — matches
 * what the planner's "Day total" row displays).
 */
function planDayKcalTotals(weekPlan: { days: { meals: { recipe: RecipeData }[] }[] }): number[] {
  return weekPlan.days.map((d) =>
    d.meals.reduce((sum, m) => sum + (m.recipe.nutritionInfo?.calories ?? 0), 0),
  );
}

/** How far a plan's days stray beyond the ±15% band around the target (0 = every day in band). */
const PLAN_KCAL_TOLERANCE = 0.15;
function offTargetScore(dayTotals: number[], target: number): number {
  if (!target) return 0;
  return dayTotals.reduce(
    (sum, t) => sum + Math.max(0, Math.abs(t - target) / target - PLAN_KCAL_TOLERANCE),
    0,
  );
}

/** Per-day protein / carbs / fat totals (grams, per serving). */
function planDayMacroTotals(weekPlan: {
  days: { meals: { recipe: RecipeData }[] }[];
}): { proteinG: number; carbsG: number; fatG: number }[] {
  return weekPlan.days.map((d) =>
    d.meals.reduce(
      (acc, m) => ({
        proteinG: acc.proteinG + (m.recipe.nutritionInfo?.protein ?? 0),
        carbsG: acc.carbsG + (m.recipe.nutritionInfo?.carbs ?? 0),
        fatG: acc.fatG + (m.recipe.nutritionInfo?.fat ?? 0),
      }),
      { proteinG: 0, carbsG: 0, fatG: 0 },
    ),
  );
}

/** Macros get a wider band than kcal (±20%) and half the weight. */
const PLAN_MACRO_TOLERANCE = 0.2;
const MACRO_WEIGHT = 0.5;

/**
 * Kcal score plus how far protein, carbs and fat stray beyond ±20% of their
 * targets (audit F-PLAN-1-2). 0 = every day in every band.
 */
export function planOffTargetScore(
  weekPlan: { days: { dayOfWeek?: number; meals: { recipe: RecipeData }[] }[] },
  targets: { dailyCalorieTarget: number; proteinG: number; carbsG: number; fatG: number },
  /**
   * Per-day overrides by dayOfWeek — a lifter's training days are judged
   * against the bumped targets (audit P2-4). Omitted = one target all week.
   */
  dayTargets = new Map<number, typeof targets>(),
): number {
  const targetFor = (i: number) => dayTargets.get(weekPlan.days[i]?.dayOfWeek ?? i) ?? targets;
  const kcal = planDayKcalTotals(weekPlan).reduce(
    (sum, total, i) => sum + offTargetScore([total], targetFor(i).dailyCalorieTarget),
    0,
  );
  const band = (actual: number, target: number) =>
    target > 0 ? Math.max(0, Math.abs(actual - target) / target - PLAN_MACRO_TOLERANCE) : 0;
  const macros = planDayMacroTotals(weekPlan).reduce((sum, d, i) => {
    const t = targetFor(i);
    return sum + band(d.proteinG, t.proteinG) + band(d.carbsG, t.carbsG) + band(d.fatG, t.fatG);
  }, 0);
  return kcal + MACRO_WEIGHT * macros;
}

function toRecipeDto(
  r: RecipeData,
  image?: { imageUrl: string | null; imageStatus: RecipeDto['imageStatus'] },
): RecipeDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    ingredients: r.ingredients,
    instructions: r.instructions,
    nutritionInfo: r.nutritionInfo,
    cuisineType: r.cuisineType,
    dietaryTags: r.dietaryTags,
    prepTimeMins: r.prepTimeMins,
    cookTimeMins: r.cookTimeMins,
    servings: r.servings,
    imageUrl: image?.imageUrl ?? r.imageUrl ?? null,
    // Without an explicit resolution, new AI recipes have no image yet —
    // treat as PENDING so the worker generates one.
    imageStatus: image?.imageStatus ?? 'PENDING',
  };
}

// Converts a Prisma Recipe row into the RecipeData shape the plan-assembly
// pipeline works with — used to inject pinned favourites into AI plans (P1-1).
/**
 * Adds `allergenWarnings` when the recipe conflicts with the viewer's hard
 * safety prefs — the detail page, cook mode and planner show them so an
 * unsafe dish is never presented silently (F-REC-2-3, F-PLAN-1-7). Takes the
 * SafetyCheckable-shaped source directly (a Recipe row via `rowToRecipeData`,
 * or an AI `RecipeData`) so both DTO-mapping paths share one implementation.
 */
function withAllergenWarnings(
  dto: RecipeDto,
  data: SafetyCheckable,
  safety: SafetyPrefs | null,
): RecipeDto {
  if (!safety) return dto;
  const issues = findSafetyIssues(data, safety);
  if (issues.length === 0) return dto;
  const restrictions = new Set(safety.dietaryRestrictions);
  return {
    ...dto,
    allergenWarnings: issues.map((issue) =>
      restrictions.has(issue) ? restrictionWarningLabel(issue) : issue,
    ),
  };
}

/**
 * §2.2/UX-02 AC1: attaches `safetyChecks` (which of the table's rules this
 * recipe passes/fails) only when the table actually has rules — a rule-less
 * table never renders a false "Checked" claim, and older clients that ignore
 * the field see nothing either way.
 */
function withSafetyChecks(
  dto: RecipeDto,
  data: SafetyCheckable,
  table: TableSafety | null,
): RecipeDto {
  if (!table?.hasRules) return dto;
  return { ...dto, safetyChecks: safetyService.check(data, table) };
}

/**
 * T-01.10: the one `SafetyService.decorate()` call every DTO mapping in this
 * file goes through — ingredient-derived diet tags (never the static,
 * sometimes-stale `dietaryTags`) + their label-dependency qualifiers.
 */
function withDerivedTags(dto: RecipeDto, data: SafetyCheckable): RecipeDto {
  const { derivedTags, tagQualifiers } = safetyService.decorate(data);
  return { ...dto, derivedTags, ...(tagQualifiers && { tagQualifiers }) };
}

/**
 * The one place a plan/recipe DTO picks up every additive safety field
 * (T-02.1): derived tags, allergen warnings and, when the table has rules,
 * the `safetyChecks` read-back. `ctx` is `null` when there is no signed-in
 * viewer to check against (never happens on an authenticated procedure, but
 * `assemblePlanDto` is also called without a userId in one legacy path).
 */
function decorateRecipeDto(
  dto: RecipeDto,
  data: SafetyCheckable,
  ctx: Pick<SafetyContext, 'prefs' | 'table'> | null,
): RecipeDto {
  // Never let a malformed/partial row 500 a plan read (bug: recipe.discover's
  // summary DTO used to be cast straight into SafetyService.check, whose
  // ingredients.map then threw for any user with a rule) — every call site
  // in this file passes a full SafetyCheckable already, but decoration
  // failing for one recipe must still never break the whole response.
  try {
    let out = withDerivedTags(dto, data);
    out = withAllergenWarnings(out, data, ctx?.prefs ?? null);
    out = withSafetyChecks(out, data, ctx?.table ?? null);
    return out;
  } catch (err) {
    console.error(
      '[meal-plan] safety decoration failed for a recipe — serving it undecorated',
      err,
    );
    return dto;
  }
}

/** Drops ids the user has reported (T-01.5, UX-01 AC10) from a curated pool. */
function excludeHidden<T extends { id: string }>(pool: T[], hiddenIds: string[]): T[] {
  return hiddenIds.length === 0 ? pool : pool.filter((r) => !hiddenIds.includes(r.id));
}

/**
 * Same as `pickRandomCurated` (lib/curated-recipes) but also excludes
 * reported ids — kept local so a reported recipe never resurfaces via a
 * curated swap/replacement fallback (T-01.5's "excluded from the instant
 * curated week and from later tailored days" requirement) without having to
 * change the shared curated-pool helper's signature. Delegates to the
 * shared helper unchanged when there is nothing to exclude (the common
 * case), so every existing curated-pick behaviour is untouched.
 */
function pickSafeCurated(
  mealType: MealType,
  hiddenIds: string[],
  excludeId?: string,
  prefs?: SafetyPrefs | null,
): RecipeData | null {
  if (hiddenIds.length === 0) return pickRandomCurated(mealType, excludeId, prefs);
  const pools = safeCuratedPools(prefs ?? null);
  const pool = excludeHidden(pools[mealType] ?? pools.breakfast, hiddenIds);
  if (pool.length === 0) return null;
  const candidates = pool.filter((r) => r.id !== excludeId);
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)] ?? null;
}

/**
 * Clients render warnings as "Contains …", which read "Contains Paleo" for a
 * diet conflict. Phrase restrictions as what the dish contains instead:
 * "Gluten-free" → "gluten", "Paleo" → "non-paleo". Stays a plain
 * string so shipped app binaries render it unchanged.
 */
export function restrictionWarningLabel(restriction: string): string {
  const lower = restriction.trim().toLowerCase();
  const free = /^(.+?)[\s-]*free$/.exec(lower);
  if (free?.[1]) return free[1];
  return `non-${lower}`;
}

function rowToRecipeData(row: Recipe): RecipeData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients as unknown as Ingredient[],
    instructions: row.instructions,
    nutritionInfo: row.nutritionInfo as unknown as NutritionInfo,
    cuisineType: row.cuisineType,
    dietaryTags: row.dietaryTags,
    prepTimeMins: row.prepTimeMins,
    cookTimeMins: row.cookTimeMins,
    servings: row.servings,
    imageUrl: row.imageUrl,
  };
}

// Converts a Prisma Recipe row (with JSON fields) to a RecipeDto
function rowToRecipeDto(row: {
  id: string;
  name: string;
  description: string;
  ingredients: unknown;
  instructions: string[];
  nutritionInfo: unknown;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
  imageStatus?: unknown;
  source?: string;
  nutritionStatus?: string;
}): RecipeDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients: row.ingredients as Ingredient[],
    instructions: row.instructions,
    nutritionInfo: row.nutritionInfo as NutritionInfo,
    cuisineType: row.cuisineType,
    dietaryTags: row.dietaryTags,
    prepTimeMins: row.prepTimeMins,
    cookTimeMins: row.cookTimeMins,
    servings: row.servings,
    imageUrl: row.imageUrl,
    imageStatus: (row.imageStatus as 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED') ?? 'DONE',
    ...(row.source === 'AI' && { aiGenerated: true }),
    ...(row.nutritionStatus && {
      nutritionStatus: row.nutritionStatus as 'COMPUTED' | 'PARTIAL' | 'USER_ENTERED',
    }),
  };
}
