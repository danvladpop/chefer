import {
  chefProfileRepository,
  dailyLogRepository,
  favouriteRecipeRepository,
  MealPlanOrigin,
  mealPlanRepository,
  mealRatingRepository,
  type LoggedMealEntry,
  type TargetChange,
} from '@chefer/database';
import type {
  NutritionTargets,
  OnboardingJob,
  SafetyChecks,
  TrainingDayNutrition,
  UserProfile,
} from '@chefer/types';
import {
  effectiveJobs,
  isSlotEaten,
  MEAL_ORDER,
  MEAL_WINDOW_END,
  resolveTodayMeals,
  slotPortion,
  TRACK_INFERENCE_MIN_DAYS,
} from '@chefer/utils';
import type { NutritionInfo } from '../../lib/ai/index.js';
import type { SafetyCheckable } from '../../lib/curated-recipes/safety.js';
import { hasFeature, isPremiumUser } from '../../lib/entitlements.js';
import type { DailyTargets } from '../preferences/preferences.service.js';
import { safetyService } from '../safety/safety.service.js';
import {
  trainingDayFields,
  trainingNutritionService,
  type TrainingDayResult,
} from '../training-nutrition/training-nutrition.service.js';

// ─── T-04.2 additive types ──────────────────────────────────────────────────────

/** `dashboard.summary({ include })` — the extra, opt-in reads (T-04.2). */
export type DashboardIncludeOption =
  | 'tonight'
  | 'tomorrow'
  | 'shopDue'
  | 'safetyChecks'
  | 'targets';

export interface DashboardHeroMeal {
  planId: string;
  dayOfWeek: number;
  slotIndex: number;
  mealType: string;
  done: boolean;
  recipe: {
    id: string;
    name: string;
    description: string;
    imageUrl: string | null;
    kcal: number;
    servings: number;
    prepTimeMins: number;
    cookTimeMins?: number;
  };
  /**
   * T-11 placement (Tonight hero only): the table's safety chip, decorated
   * read-only from `SafetyService` — never written back into the stored plan
   * JSON. Present only when `include` asked for it AND the table has rules
   * (`CheckedForChip` renders nothing otherwise).
   */
  safetyChecks?: SafetyChecks;
}

export interface DashboardShopDue {
  count: number;
  sample: string[];
  forDate: string;
}

export interface DashboardPlanVsTarget {
  plannedKcal: number;
  targetKcal: number;
  status: 'under' | 'over' | 'on_target';
}

export interface DashboardPendingTargetChange {
  id: string;
  kind: string;
  reason: string;
  fields: { field: string; before: number; after: number }[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  user: { firstName: string | null; displayName: string | null };
  today: { date: string; dayOfWeek: number };
  /** §2.4, T-04.2: the active plan's id, or null with no plan for this week — additive. */
  planId: string | null;
  /** §2.4, T-03.1/T-04.1: the effective jobs list (`effectiveJobs()`) — additive. */
  jobs: OnboardingJob[];
  weekPlan: {
    dayOfWeek: number;
    meals: {
      mealType: string;
      recipeId: string;
      recipeName: string;
      imageUrl: string | null;
      kcal: number;
    }[];
  }[];
  nextMeal: {
    mealType: string;
    /**
     * P1-1: the plan slot's portion (servings of the recipe) when not 1×;
     * `recipe.kcal` already includes it. Additive — older clients ignore it.
     */
    portion?: number;
    /**
     * Today's next meal only: the slot's index in the plan day's `meals`.
     * Clients pass it to tracker.logRecipe so the second of two identical
     * snacks logs as its own entry. Additive.
     */
    slotIndex?: number;
    /**
     * §2.4, T-04.2: which plan day this slot is on (0=Mon…6=Sun) — today's
     * for `nextMeal`, tomorrow's for `tomorrowFirstMeal`. Paired with the
     * top-level `planId`, lets Tonight's `Swap` sheet address the exact
     * slot. Additive.
     */
    dayOfWeek?: number;
    recipe: {
      id: string;
      name: string;
      description: string;
      imageUrl: string | null;
      kcal: number;
      servings: number;
      prepTimeMins: number;
      /** Additive (older clients ignore it): prep + cook is the real time (F-PM-10). */
      cookTimeMins?: number;
    };
  } | null;
  /** Set when every meal window today has passed — tomorrow's first meal. */
  tomorrowFirstMeal: DashboardSummary['nextMeal'];
  /**
   * §2.4, T-04.2: today's DINNER slot specifically (not "the next open
   * meal") — the Tonight card. `include: ['tonight']` only; absent
   * otherwise, `null` with no dinner planned or no active plan. `done`
   * reflects today's log, independent of the meal-window clock (a dinner
   * logged early is still "done", not "next").
   */
  tonight?: DashboardHeroMeal | null;
  /**
   * §2.4, T-04.2: tomorrow's first planned meal (dinner for a dinners-only
   * plan). `include: ['tomorrow']` only.
   */
  tomorrow?: DashboardHeroMeal | null;
  /**
   * §2.4, T-04.2: unticked shopping-list lines used by tomorrow's planned
   * meals. `include: ['shopDue']` only; `null` when nothing is due (hidden
   * card) or there is no plan/list.
   */
  shopDue?: DashboardShopDue | null;
  /**
   * T-11 placement: today's planned kcal against the resolved target, for
   * the ring's neutral status chip (UX-11 §3, `Plan: {planned} of {target}
   * kcal`, never a warning on open). `include: ['targets']` only.
   */
  planVsTarget?: DashboardPlanVsTarget;
  /**
   * T-11 placement: the most recently detected unresolved `TargetChange`,
   * for `ChangeNoticeCard` — read-only via `TargetsService` (owned by
   * L-TRACK). `include: ['targets']` only; `null` when there is none.
   */
  pendingTargetChange?: DashboardPendingTargetChange | null;
  restOfToday: {
    mealType: string;
    scheduledLabel: string;
    recipeName: string;
    /** Additive (older clients ignore it): lets "Later today" rows open the recipe. */
    recipeId?: string;
    kcal: number;
  }[];
  recentFavourites: {
    id: string;
    name: string;
    imageUrl: string | null;
    cuisineType: string;
    prepTimeMins: number;
  }[];
  nutrition: {
    dailyCalorieTarget: number;
    plannedKcal: number;
    /**
     * What was LOGGED today (tracker), additive — the home ring used to show
     * planned food only, e.g. "540 remaining" with 6,070 kcal eaten
     * (audit F-DASH-1-2). Older clients ignore these fields.
     */
    eatenKcal: number;
    protein: { planned: number; targetG: number; eaten: number };
    carbs: { planned: number; targetG: number; eaten: number };
    fat: { planned: number; targetG: number; eaten: number };
    /**
     * GAIN_MUSCLE lifters only (set-up gym profile, bodyweight known —
     * audit P2-4): today's training-day adjustment. Additive; the fields
     * above keep meaning the BASE targets, so older clients are unchanged.
     */
    trainingDay?: TrainingDayNutrition;
    /**
     * Today's targets with the training-day bump applied — present only when
     * it applies (premium, training day). New clients show these instead of
     * the base targets above.
     */
    adjustedTargets?: NutritionTargets;
  };
  /**
   * Set when the active plan was created BEFORE its week began (PW-5 Sunday
   * auto-generation, or planning ahead by hand) — the dashboard celebrates
   * "your week is ready" at the start of the week.
   */
  weekReady: { preparedAt: Date; ratedCount: number } | null;
  /**
   * B-31 interim (T-00.12): the calorie ring, weight card, profile nudge and
   * Snap-to-log assume a goal — meaningless (and once, embarrassing) for a
   * user who never set one, e.g. someone who only wants to log what they
   * ate. True when `chefProfile.goal` is set, OR the user already tracks
   * (logged on ≥ 3 of the last 7 days — the ring stays home for them too,
   * rev 2). No persisted field yet (that's wave 1's
   * `ChefProfile.showNutritionOnToday`) — derived fresh every call.
   */
  showNutritionCards: boolean;
  /**
   * §2.4, T-04.1: the real successor to `showNutritionCards` above (kept
   * for older clients) — an explicit `ChefProfile.showNutritionOnToday`
   * wins either way (a goal-having user may still turn the ring off), else
   * the same goal-or-tracks derivation. Additive.
   */
  showNutrition: boolean;
}

// ─── Meal type schedules ───────────────────────────────────────────────────────

const MEAL_SCHEDULE: Record<string, string> = {
  breakfast: '8:00 AM',
  lunch: '12:30 PM',
  snack: '3:30 PM',
  dinner: '7:00 PM',
};

// Meal order and windows live in @chefer/utils (shared with the Today
// surfaces' next-meal logic); re-exported for existing importers.
export { MEAL_ORDER, MEAL_WINDOW_END };

/**
 * The next meal to surface, resolved by TYPE against the meals the plan
 * actually contains: the first still-open window among `availableTypes`.
 *
 * Resolving by position broke 3-meal plans (the default): the old index
 * pointed into the fixed 4-slot MEAL_ORDER, so from 17:00 it addressed a
 * fourth slot that didn't exist and the dashboard hero went blank at
 * dinner time — and from 14:00 it surfaced dinner while the snack window
 * was still open on 4-meal plans.
 *
 * Returns null when every window has passed (late evening).
 */
export function getNextMealType(currentHour: number, availableTypes: string[]): string | null {
  for (const type of MEAL_ORDER) {
    if (!availableTypes.includes(type)) continue;
    if (currentHour < (MEAL_WINDOW_END[type] ?? 0)) return type;
  }
  return null;
}

/**
 * "Friday, September 25". A client-supplied local date arrives as UTC
 * midnight (see getSummary), so it is formatted in UTC to keep its weekday.
 */
function formatDayLabel(now: Date): string {
  const isUtcMidnight =
    now.getUTCHours() === 0 && now.getUTCMinutes() === 0 && now.getUTCSeconds() === 0;
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(isUtcMidnight && { timeZone: 'UTC' }),
  });
}

/** YYYY-MM-DD of `now` — UTC fields for a client-supplied date, else server-local. */
function toLocalDateString(now: Date, useUtc: boolean): string {
  const y = useUtc ? now.getUTCFullYear() : now.getFullYear();
  const m = (useUtc ? now.getUTCMonth() : now.getMonth()) + 1;
  const d = useUtc ? now.getUTCDate() : now.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class DashboardService {
  async getSummary(
    userId: string,
    firstName: string | null,
    local?: {
      localDate?: string | undefined;
      localHour?: number | undefined;
      include?: readonly DashboardIncludeOption[] | undefined;
    },
    /** The viewer, for tier-gated extras (training-day bump). Optional for tests. */
    viewer?: UserProfile,
  ): Promise<DashboardSummary> {
    const include = new Set(local?.include ?? []);
    // "Today" is the client's calendar day when it tells us; server time is
    // the fallback for older clients. A local date is kept as UTC midnight so
    // the weekday and label below read it without any time-zone shift.
    const now = local?.localDate ? new Date(`${local.localDate}T00:00:00Z`) : new Date();
    const useUtc = Boolean(local?.localDate);
    // Monday=0 … Sunday=6 (same as MealPlanDay.dayOfWeek)
    const jsDay = useUtc ? now.getUTCDay() : now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const todayIndex = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
    const currentHourLocal = local?.localHour ?? new Date().getHours();

    // B-13/T-00.15: "Today" reads the plan whose WEEK matches `now`, not
    // whichever plan happens to be ACTIVE — findActiveWithDays could return
    // a different (e.g. next) week's plan once that week became the sole
    // active one, showing tomorrow's-week meals as today's on the dashboard.
    const monday = new Date(now);
    if (useUtc) {
      monday.setUTCDate(now.getUTCDate() - todayIndex);
      monday.setUTCHours(0, 0, 0, 0);
    } else {
      monday.setDate(now.getDate() - todayIndex);
      monday.setHours(0, 0, 0, 0);
    }

    const [chefProfile, plan, favourites, todayLog, recentLogs] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      mealPlanRepository.findForWeek(userId, monday),
      favouriteRecipeRepository.findByUserId(userId, 4),
      dailyLogRepository.findByDate(userId, local?.localDate ? now : new Date()),
      // B-31 interim (T-00.12): "tracks" = logged on ≥ 3 of the last 7 days.
      dailyLogRepository.findLastN(userId, 7),
    ]);
    // A DailyLog row survives with an empty loggedMeals after the user
    // removes every entry for that day (mutateDay upserts the row rather
    // than deleting it) — count only days that still have >= 1 entry, else
    // logged-then-cleared days would wrongly count as "tracks".
    const daysWithEntries = recentLogs.filter(
      (log) => ((log.loggedMeals as unknown as LoggedMealEntry[] | null) ?? []).length > 0,
    ).length;
    const showNutritionCards =
      chefProfile?.goal != null || daysWithEntries >= TRACK_INFERENCE_MIN_DAYS;
    // §2.4, T-04.1: an explicit override (Settings toggle) always wins, in
    // either direction, over the goal/tracks derivation above.
    const showNutrition = chefProfile?.showNutritionOnToday ?? showNutritionCards;
    // §2.4, T-03.1/T-04.1: the jobs every jobs-aware Today surface reads.
    const jobs = effectiveJobs({
      jobs: chefProfile?.onboardingJobs ?? [],
      intent: chefProfile?.onboardingIntent ?? null,
      loggedDaysLast7: daysWithEntries,
    });

    // Lifters get protein from bodyweight; on a training day the bump is
    // applied for premium and previewed for free (audit P2-4). The tracker
    // reads the same service, so both surfaces show the same targets.
    const { targets, training } = await trainingNutritionService.targetsForDay(
      userId,
      chefProfile,
      { localDate: toLocalDateString(now, useUtc), weekday: todayIndex },
      viewer ? hasFeature(viewer, 'trainingNutrition') : false,
    );
    const eaten = {
      kcal: todayLog?.totalKcal ?? 0,
      protein: Math.round(todayLog?.totalProtein ?? 0),
      carbs: Math.round(todayLog?.totalCarbs ?? 0),
      fat: Math.round(todayLog?.totalFat ?? 0),
    };

    if (!plan) {
      return this.emptyDashboard(
        userId,
        firstName,
        now,
        todayIndex,
        targets,
        favourites,
        eaten,
        training,
        showNutritionCards,
        showNutrition,
        jobs,
        include,
      );
    }

    // Join all recipe IDs
    // P1-1: slots may carry a portion multiplier — every kcal/macro figure
    // below is for the portion actually planned.
    type MealSlot = { type: string; recipeId: string; portion?: number };
    const allMealSlots = plan.days.flatMap((d: { dayOfWeek: number; meals: unknown }) => ({
      dayOfWeek: d.dayOfWeek,
      meals: d.meals as MealSlot[],
    }));

    const uniqueIds = [...new Set(allMealSlots.flatMap((d) => d.meals.map((m) => m.recipeId)))];
    const recipeRows = await mealPlanRepository.findRecipesByIds(uniqueIds);
    const recipeMap = new Map(recipeRows.map((r) => [r.id, r]));

    // Build weekPlan
    const weekPlan = allMealSlots.map(({ dayOfWeek, meals }) => ({
      dayOfWeek,
      meals: meals.map((m) => {
        const recipe = recipeMap.get(m.recipeId);
        const nutrition = recipe?.nutritionInfo as NutritionInfo | undefined;
        return {
          mealType: m.type,
          recipeId: m.recipeId,
          recipeName: recipe?.name ?? 'Unknown',
          imageUrl: recipe?.imageUrl ?? null,
          kcal: Math.round((nutrition?.calories ?? 0) * slotPortion(m.portion)),
        };
      }),
    }));

    // Get today's meals
    const todayDay = plan.days.find((d: { dayOfWeek: number }) => d.dayOfWeek === todayIndex);
    const todayMeals = todayDay ? (todayDay.meals as MealSlot[]) : [];

    // Compute planned kcal + macros for today
    let plannedKcal = 0;
    let plannedProtein = 0;
    let plannedCarbs = 0;
    let plannedFat = 0;
    for (const slot of todayMeals) {
      const recipe = recipeMap.get(slot.recipeId);
      if (recipe) {
        const n = recipe.nutritionInfo as unknown as NutritionInfo;
        const p = slotPortion(slot.portion);
        plannedKcal += n.calories * p;
        plannedProtein += n.protein * p;
        plannedCarbs += n.carbs * p;
        plannedFat += n.fat * p;
      }
    }

    // Next meal and rest of today — resolved by meal TYPE against the meals
    // this plan actually contains, skipping any meal already logged today:
    // after "Made it!" on dinner the spotlight moves on instead of offering
    // the same dinner again (audit F-PM-10). Shared with the clients via
    // @chefer/utils resolveTodayMeals, which also puts them in day order.
    // Every slot counts: a curated day can hold two snacks, and picking the
    // first slot per type used to hide the second one from Today.
    const orderedMeals = todayMeals
      .map((slot, slotIndex) => ({ ...slot, slotIndex }))
      .filter((slot) => recipeMap.has(slot.recipeId));
    const loggedToday = (todayLog?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    const resolved = resolveTodayMeals(orderedMeals, currentHourLocal, loggedToday);

    const toHeroMeal = (
      slot: MealSlot & { slotIndex?: number },
      dayOfWeek?: number,
    ): DashboardSummary['nextMeal'] => {
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) return null;
      const n = recipe.nutritionInfo as unknown as NutritionInfo;
      const portion = slotPortion(slot.portion);
      return {
        mealType: slot.type,
        ...(portion !== 1 && { portion }),
        ...(slot.slotIndex !== undefined && { slotIndex: slot.slotIndex }),
        ...(dayOfWeek !== undefined && { dayOfWeek }),
        recipe: {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          imageUrl: recipe.imageUrl,
          kcal: Math.round(n.calories * portion),
          servings: recipe.servings,
          prepTimeMins: recipe.prepTimeMins,
          cookTimeMins: recipe.cookTimeMins,
        },
      };
    };

    const nextMeal: DashboardSummary['nextMeal'] = resolved.next
      ? toHeroMeal(resolved.next, todayIndex)
      : null;
    const restOfToday: DashboardSummary['restOfToday'] = resolved.later.flatMap((slot) => {
      const recipe = recipeMap.get(slot.recipeId);
      if (!recipe) return [];
      const n = recipe.nutritionInfo as unknown as NutritionInfo;
      return [
        {
          mealType: slot.type,
          scheduledLabel: MEAL_SCHEDULE[slot.type] ?? '',
          recipeName: recipe.name,
          recipeId: recipe.id,
          kcal: Math.round(n.calories * slotPortion(slot.portion)),
        },
      ];
    });

    // Late evening (every window has passed) or everything left today is
    // already eaten — surface tomorrow's first meal so the hero card is never
    // blank while an active plan exists.
    const tomorrowIndex = (todayIndex + 1) % 7;
    const tomorrowDay = plan.days.find((d: { dayOfWeek: number }) => d.dayOfWeek === tomorrowIndex);
    const tomorrowMeals = tomorrowDay ? (tomorrowDay.meals as MealSlot[]) : [];
    let tomorrowFirstMeal: DashboardSummary['tomorrowFirstMeal'] = null;
    if (!nextMeal) {
      const firstSlot = MEAL_ORDER.map((type) => tomorrowMeals.find((m) => m.type === type)).find(
        (slot) => slot !== undefined,
      );
      if (firstSlot) tomorrowFirstMeal = toHeroMeal(firstSlot, tomorrowIndex);
    }

    // §2.4, T-04.2: today's DINNER slot specifically — the Tonight card.
    // `done` reflects the log, not the meal-window clock (an early-logged
    // dinner is still "done").
    let tonight: DashboardHeroMeal | null | undefined;
    if (include.has('tonight')) {
      const dinnerIndex = todayMeals.findIndex((m) => m.type === 'dinner');
      const dinnerSlot = dinnerIndex === -1 ? undefined : todayMeals[dinnerIndex];
      const hero = dinnerSlot ? toHeroMeal({ ...dinnerSlot, slotIndex: dinnerIndex }) : null;
      tonight =
        hero && dinnerSlot
          ? {
              planId: plan.id,
              dayOfWeek: todayIndex,
              slotIndex: dinnerIndex,
              mealType: hero.mealType,
              done: isSlotEaten(
                { type: dinnerSlot.type, recipeId: dinnerSlot.recipeId },
                loggedToday,
              ),
              recipe: hero.recipe,
            }
          : null;
      if (tonight && include.has('safetyChecks')) {
        const recipe = recipeMap.get(tonight.recipe.id);
        if (recipe) {
          const table = await safetyService.getTable(userId);
          if (table.hasRules) {
            tonight = {
              ...tonight,
              safetyChecks: safetyService.check(recipe as unknown as SafetyCheckable, table),
            };
          }
        }
      }
    }

    // §2.4, T-04.2: tomorrow's first planned meal — same slot the
    // tomorrowFirstMeal fallback above resolves, always computed (not only
    // in the late-evening fallback case) when the caller asked for it.
    let tomorrow: DashboardHeroMeal | null | undefined;
    if (include.has('tomorrow')) {
      // Same priority as the tomorrowFirstMeal fallback above: the first
      // MEAL_ORDER type this day actually has, not array position (a
      // dinners-only plan's single slot still resolves correctly).
      const firstType = MEAL_ORDER.find((type) => tomorrowMeals.some((m) => m.type === type));
      const firstIndex =
        firstType === undefined ? -1 : tomorrowMeals.findIndex((m) => m.type === firstType);
      const firstSlot = firstIndex === -1 ? undefined : tomorrowMeals[firstIndex];
      const hero = firstSlot ? toHeroMeal({ ...firstSlot, slotIndex: firstIndex }) : null;
      tomorrow =
        hero && firstSlot
          ? {
              planId: plan.id,
              dayOfWeek: tomorrowIndex,
              slotIndex: firstIndex,
              mealType: hero.mealType,
              // Tomorrow hasn't happened yet — never "done" from today's read.
              done: false,
              recipe: hero.recipe,
            }
          : null;
    }

    // §2.4, T-04.2: unticked shopping-list lines used by tomorrow's meals.
    let shopDue: DashboardShopDue | null | undefined;
    if (include.has('shopDue') && viewer) {
      shopDue = await this.shopDueFor(viewer, plan.id, tomorrowMeals, recipeMap, now, useUtc);
    }

    const targetsExtras = include.has('targets')
      ? await this.targetsExtrasFor(userId, Math.round(plannedKcal), targets.dailyCalorieTarget)
      : undefined;

    // PW-5: did the Sunday worker prepare this week? Only WEEKLY_AUTO plans —
    // a carry-forward copy or a manual plan made early used to claim "the
    // chef prepared this week's plan for you on Sunday" (audit F-PLAN-4-2).
    let weekReady: DashboardSummary['weekReady'] = null;
    // Free users' Sunday week is curated (P2-5): it doesn't learn from
    // ratings, so it never claims to.
    if (plan.origin === MealPlanOrigin.WEEKLY_AUTO) {
      // No viewer (tests, older call sites) keeps the premium behaviour.
      const premium = viewer ? isPremiumUser(viewer) : true;
      const signals = premium ? await mealRatingRepository.findSignalsForUser(userId, 20) : [];
      weekReady = { preparedAt: plan.createdAt, ratedCount: signals.length };
    }

    return {
      user: { firstName, displayName: chefProfile?.displayName ?? null },
      today: {
        date: formatDayLabel(now),
        dayOfWeek: todayIndex,
      },
      planId: plan.id,
      jobs,
      weekPlan,
      nextMeal,
      tomorrowFirstMeal,
      ...(tonight !== undefined && { tonight }),
      ...(tomorrow !== undefined && { tomorrow }),
      ...(shopDue !== undefined && { shopDue }),
      ...(targetsExtras ?? {}),
      restOfToday,
      weekReady,
      showNutritionCards,
      showNutrition,
      recentFavourites: favourites.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        imageUrl: f.recipe.imageUrl,
        cuisineType: f.recipe.cuisineType,
        prepTimeMins: f.recipe.prepTimeMins,
      })),
      nutrition: {
        dailyCalorieTarget: targets.dailyCalorieTarget,
        plannedKcal: Math.round(plannedKcal),
        eatenKcal: eaten.kcal,
        protein: {
          planned: Math.round(plannedProtein),
          targetG: targets.proteinG,
          eaten: eaten.protein,
        },
        carbs: { planned: Math.round(plannedCarbs), targetG: targets.carbsG, eaten: eaten.carbs },
        fat: { planned: Math.round(plannedFat), targetG: targets.fatG, eaten: eaten.fat },
        ...trainingDayFields(training),
      },
    };
  }

  /**
   * T-11 placement: `planVsTarget` (today's planned kcal vs the resolved
   * target) and `pendingTargetChange` (the most recent unresolved
   * `TargetChange`) — read-only via `TargetsService` (L-TRACK). Called only
   * when `include` asks for it. Dynamic import (not a top-level one):
   * `targets.service.ts` pulls in `lib/flags.ts` → `lib/env.ts`, which
   * validates its env vars at import time — several dashboard unit tests
   * import only pure helpers from this module with zero env/DB mocking, so
   * a static import here would break every one of them for a field most
   * callers never ask for (the same reason `coach.service.ts` hit this
   * before, per its own import comment).
   */
  private async targetsExtrasFor(
    userId: string,
    plannedKcal: number,
    targetKcal: number,
  ): Promise<Pick<DashboardSummary, 'planVsTarget' | 'pendingTargetChange'>> {
    const planVsTarget: DashboardPlanVsTarget = {
      plannedKcal,
      targetKcal,
      status: plannedKcal < targetKcal ? 'under' : plannedKcal > targetKcal ? 'over' : 'on_target',
    };
    const { targetsService } = await import('../targets/targets.service.js');
    const changes = await targetsService.listMyUnresolvedChanges(userId);
    const change: TargetChange | undefined = changes[0];
    const pendingTargetChange: DashboardPendingTargetChange | null = change
      ? {
          id: change.id,
          kind: change.kind,
          reason: change.reason,
          fields: change.fields as unknown as { field: string; before: number; after: number }[],
        }
      : null;
    return { planVsTarget, pendingTargetChange };
  }

  /**
   * §2.4, T-04.2: unticked shopping-list lines used by tomorrow's planned
   * meals. Reuses `ShoppingListService.getForWeek` (this week, offset 0) —
   * the same pricing/image-resolved list the Shop tab shows — filtered to
   * lines whose `recipeNames` include one of tomorrow's planned recipes and
   * whose key isn't already checked off. A future optimisation could skip
   * the pricing/image resolution for this read-only summary; left as-is for
   * now since it's opt-in (`include: ['shopDue']`) and reuses tested logic
   * rather than duplicating the list-building rules.
   */
  private async shopDueFor(
    viewer: UserProfile,
    planId: string,
    tomorrowMeals: { type: string; recipeId: string }[],
    recipeMap: Map<string, { name: string }>,
    now: Date,
    useUtc: boolean,
  ): Promise<DashboardShopDue | null> {
    if (tomorrowMeals.length === 0) return null;
    // Dynamic import (not a top-level one): shopping-list.service.ts pulls in
    // the AI service module, which validates its env vars at import time —
    // a static import here would force every dashboard.summary caller (and
    // every dashboard unit test) to pay for that, just for an opt-in field
    // most callers never ask for.
    const { shoppingListService } = await import('../shopping-list/shopping-list.service.js');
    const list = await shoppingListService.getForWeek(viewer, 0);
    if (list.planId !== planId) return null; // clock/week mismatch — skip rather than show the wrong week
    const tomorrowRecipeNames = new Set(
      tomorrowMeals.map((m) => recipeMap.get(m.recipeId)?.name).filter((n): n is string => !!n),
    );
    const due = list.items.filter(
      (item) =>
        !list.checkedKeys.includes(item.key) &&
        item.recipeNames.some((name) => tomorrowRecipeNames.has(name)),
    );
    if (due.length === 0) return null;
    const tomorrow = new Date(now);
    if (useUtc) tomorrow.setUTCDate(now.getUTCDate() + 1);
    else tomorrow.setDate(now.getDate() + 1);
    return {
      count: due.length,
      sample: due.slice(0, 3).map((item) => item.ingredientName),
      forDate: toLocalDateString(tomorrow, useUtc),
    };
  }

  private async emptyDashboard(
    userId: string,
    firstName: string | null,
    now: Date,
    todayIndex: number,
    targets: DailyTargets,
    favourites: Awaited<ReturnType<typeof favouriteRecipeRepository.findByUserId>>,
    eaten: { kcal: number; protein: number; carbs: number; fat: number },
    training: TrainingDayResult | null,
    showNutritionCards: boolean,
    showNutrition: boolean,
    jobs: OnboardingJob[],
    include: Set<DashboardIncludeOption>,
  ): Promise<DashboardSummary> {
    const targetsExtras = include.has('targets')
      ? await this.targetsExtrasFor(userId, 0, targets.dailyCalorieTarget)
      : undefined;
    return {
      user: { firstName, displayName: null },
      today: {
        date: formatDayLabel(now),
        dayOfWeek: todayIndex,
      },
      planId: null,
      jobs,
      weekPlan: [],
      nextMeal: null,
      tomorrowFirstMeal: null,
      ...(include.has('tonight') && { tonight: null }),
      ...(include.has('tomorrow') && { tomorrow: null }),
      ...(include.has('shopDue') && { shopDue: null }),
      ...(targetsExtras ?? {}),
      restOfToday: [],
      weekReady: null,
      showNutritionCards,
      showNutrition,
      recentFavourites: favourites.map((f) => ({
        id: f.recipe.id,
        name: f.recipe.name,
        imageUrl: f.recipe.imageUrl,
        cuisineType: f.recipe.cuisineType,
        prepTimeMins: f.recipe.prepTimeMins,
      })),
      nutrition: {
        dailyCalorieTarget: targets.dailyCalorieTarget,
        plannedKcal: 0,
        eatenKcal: eaten.kcal,
        protein: { planned: 0, targetG: targets.proteinG, eaten: eaten.protein },
        carbs: { planned: 0, targetG: targets.carbsG, eaten: eaten.carbs },
        fat: { planned: 0, targetG: targets.fatG, eaten: eaten.fat },
        ...trainingDayFields(training),
      },
    };
  }
}

export const dashboardService = new DashboardService();
