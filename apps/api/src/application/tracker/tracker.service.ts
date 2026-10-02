import { TRPCError } from '@trpc/server';
import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  weightEntryRepository,
} from '@chefer/database';
import type { DailyLog, LoggedMealEntry } from '@chefer/database';
import type { NutritionTargets, TrainingDayNutrition, UserProfile } from '@chefer/types';
import { slotPortion } from '@chefer/utils';
import { hasFeature } from '../../lib/entitlements.js';
import { planForDate, planForThisWeek } from '../meal-plan/plan-for-date.js';
import { rebalanceWeek, type RebalanceResult } from '../meal-plan/rebalance.js';
import { resolveDailyTargets, resolveTargets } from '../preferences/preferences.service.js';
import { findRecipeVisibleTo } from '../recipe/recipe-access.js';
import { recipeCopyService } from '../recipe/recipe-copy.service.js';
import {
  trainingDayFields,
  trainingNutritionService,
} from '../training-nutrition/training-nutrition.service.js';
import {
  aggregateRecents,
  ensureEntryIds,
  isRecipeEntry,
  matchesRecipeSlot,
  mergeLoggedMeals,
  needsEntryIdBackfill,
  newEntryId,
  type RecentLogDay,
} from './merge-log.js';

export type { LoggedMealEntry };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DayPlanMeal {
  recipeId: string;
  mealType: string;
  recipeName: string;
  imageUrl: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /**
   * P1-1: the plan slot's portion (servings of the recipe) when not 1×. The
   * macros above stay per ONE serving; clients default the logged portion
   * to this. Additive — older clients ignore it and log 1×.
   */
  portion?: number;
  /**
   * The slot's index in the plan day's `meals` (additive). Clients key rows
   * by it and send it back on logged entries, so two identical snacks tick
   * separately.
   */
  slotIndex?: number;
}

/** A logged planned-recipe entry whose recipe is no longer in today's plan. */
export interface OffPlanLoggedMeal {
  /**
   * The stored entry's stable id (UX-FOOD-03) — what edit/delete address.
   * Additive: `getDay` backfills ids, so it is present on every row it
   * returns; optional only so older clients' types stay valid.
   */
  entryId?: string;
  /** The logged portion (UX-FOOD-03) — the edit sheet's starting point. */
  portionMultiplier?: number;
  recipeId: string;
  recipeName: string;
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayTrackerData {
  date: string; // YYYY-MM-DD
  plannedMeals: DayPlanMeal[];
  /**
   * Whether the user has an active meal plan at all (T-19.6) — distinct from
   * `plannedMeals` being empty because today just has nothing scheduled
   * (weekend, a rest day). A Track-only user may never generate a plan; the
   * tracker's empty state reads differently for the two cases. Additive:
   * older clients ignore it.
   */
  hasActivePlan: boolean;
  /**
   * Logged recipes that aren't among today's planned meals — e.g. cooked
   * before a regenerate or swap. The tracker shows and counts them (audit
   * F-PM-1). Additive: older clients ignore it.
   */
  offPlanLogged: OffPlanLoggedMeal[];
  log: {
    loggedMeals: LoggedMealEntry[];
    totalKcal: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
  } | null;
  targets: {
    dailyCalorieTarget: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  /**
   * GAIN_MUSCLE lifters only: this day's training-day adjustment — the same
   * payload `dashboard.summary.nutrition.trainingDay` carries (audit P2-4
   * follow-up). Additive; `targets` above keeps meaning the BASE targets.
   */
  trainingDay?: TrainingDayNutrition;
  /**
   * This day's targets with the training-day bump applied — present only when
   * it applies (premium, training day). New clients show these instead of
   * `targets`, exactly as Today does.
   */
  adjustedTargets?: NutritionTargets;
}

export interface DaySummary {
  date: string;
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hasLog: boolean;
}

/** One row of `tracker.recents` (T-19.1) — a distinct thing the user has logged. */
export interface RecentTrackerEntry {
  key: string;
  recipeId?: string;
  name: string;
  imageUrl: string | null;
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  estimatedBy?: 'vision' | 'manual';
  portionMultiplier?: number;
  count: number;
  lastLoggedAt: string;
}

/** How many days back `recents` scans for distinct entries. */
const RECENTS_WINDOW_DAYS = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayDate(dateStr: string): Date {
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Recipe ids the tracker shows as planned for this date (same source as getDay). */
async function plannedRecipeIdsFor(userId: string, dateStr: string): Promise<Set<string>> {
  const plan = await planForDate(mealPlanRepository, userId, dateStr);
  const jsDay = dayDate(dateStr).getUTCDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const day = plan?.days.find((d) => d.dayOfWeek === dayOfWeek);
  const slots = (day?.meals ?? []) as { recipeId: string }[];
  return new Set(slots.map((s) => s.recipeId));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const trackerService = {
  async getDay(
    userId: string,
    dateStr: string,
    /** The viewer, for the tier-gated training-day bump. Optional for tests. */
    viewer?: UserProfile,
  ): Promise<DayTrackerData> {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);

    // The plan for the day's own WEEK (UX-FOOD-02) — not the newest ACTIVE
    // plan, which is next week's once the user has opened next week.
    const plan = await planForDate(mealPlanRepository, userId, dateStr);
    const [profile, log] = await Promise.all([
      chefProfileRepository.findByUserId(userId),
      dailyLogRepository.findByDate(userId, date),
    ]);

    // Determine day-of-week (0=Mon)
    const jsDay = date.getUTCDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

    // Full resolved targets — the tracker's macro bars must show the SAME
    // numbers as the dashboard (prod-followups #4: it used to hardcode
    // 150/250/70, which doesn't even sum to the calorie target). Lifters'
    // protein follows bodyweight and a training day gets the same bump as
    // Today (audit P2-4) — one service computes both surfaces.
    const {
      targets: { dailyCalorieTarget, proteinG, carbsG, fatG },
      training,
    } = await trainingNutritionService.targetsForDay(
      userId,
      profile,
      { localDate: dateStr, weekday: dayOfWeek },
      viewer ? hasFeature(viewer, 'trainingNutrition') : false,
    );

    const plannedMeals: DayPlanMeal[] = [];

    if (plan) {
      const dayPlan = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
      if (dayPlan) {
        const mealSlots = dayPlan.meals as { type: string; recipeId: string; portion?: number }[];
        const recipeIds = mealSlots.map((m) => m.recipeId);
        const recipes = await mealPlanRepository.findRecipesByIds(recipeIds);
        const recipeMap = new Map(recipes.map((r) => [r.id, r]));

        for (const [slotIndex, slot] of mealSlots.entries()) {
          const recipe = recipeMap.get(slot.recipeId);
          if (!recipe) continue;
          const nutrition = recipe.nutritionInfo as {
            calories?: number;
            protein?: number;
            carbs?: number;
            fat?: number;
          };
          plannedMeals.push({
            recipeId: slot.recipeId,
            mealType: slot.type,
            recipeName: recipe.name,
            imageUrl: recipe.imageUrl ?? null,
            kcal: nutrition.calories ?? 0,
            protein: nutrition.protein ?? 0,
            carbs: nutrition.carbs ?? 0,
            fat: nutrition.fat ?? 0,
            ...(slotPortion(slot.portion) !== 1 && { portion: slotPortion(slot.portion) }),
            slotIndex,
          });
        }
      }
    }

    // Backfill any entry logged before entryId existed (bug B-34, T-19.2) —
    // best-effort: a failed backfill must never fail the day read, and the
    // client still gets in-memory ids for this response either way.
    let loggedMeals = (log?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    if (log && needsEntryIdBackfill(loggedMeals)) {
      try {
        const backfilled = await dailyLogRepository.mutateDay(userId, date, (current) =>
          ensureEntryIds(current),
        );
        loggedMeals = backfilled.loggedMeals as unknown as LoggedMealEntry[];
      } catch (err) {
        console.error('[tracker] entryId backfill failed (read unaffected):', err);
        loggedMeals = ensureEntryIds(loggedMeals);
      }
    }

    // "Never change your targets silently" (§2.11, T-11.1): every read of the
    // resolved targets detects and records a change since the last snapshot.
    // Best-effort — a broken detection must never fail the day read. Lazy
    // import (same convention as preferences.service.ts's gym module): most
    // callers of getDay never need the targets/flags graph loaded.
    try {
      const { targetsService } = await import('../targets/targets.service.js');
      const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(userId, profile);
      await targetsService.detectAndRecordChange(
        userId,
        profile,
        resolveTargets(profile, lifterBodyweightKg),
      );
    } catch (err) {
      console.error('[tracker] target change detection failed (read unaffected):', err);
    }

    const plannedIds = new Set(plannedMeals.map((m) => m.recipeId));
    const offPlanEntries = loggedMeals
      .filter(isRecipeEntry)
      .filter((m) => !plannedIds.has(m.recipeId));
    const offPlanNames =
      offPlanEntries.length > 0
        ? new Map(
            (await mealPlanRepository.findRecipesByIds(offPlanEntries.map((m) => m.recipeId))).map(
              (r) => [r.id, r.name],
            ),
          )
        : new Map<string, string>();
    const offPlanLogged: OffPlanLoggedMeal[] = offPlanEntries.map((m) => ({
      ...(m.entryId && { entryId: m.entryId }),
      portionMultiplier: m.portionMultiplier,
      recipeId: m.recipeId,
      recipeName: offPlanNames.get(m.recipeId) ?? 'Logged meal',
      mealType: m.mealType,
      kcal: m.kcal,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
    }));

    return {
      date: dateStr,
      plannedMeals,
      hasActivePlan: plan !== null,
      offPlanLogged,
      log: log
        ? {
            loggedMeals,
            totalKcal: log.totalKcal,
            totalProtein: log.totalProtein,
            totalCarbs: log.totalCarbs,
            totalFat: log.totalFat,
          }
        : null,
      targets: { dailyCalorieTarget, proteinG, carbsG, fatG },
      ...trainingDayFields(training),
    };
  },

  async upsertDay(
    user: UserProfile,
    dateStr: string,
    loggedMeals: LoggedMealEntry[],
  ): Promise<{ log: DailyLog; rebalance: RebalanceResult | null }> {
    const plannedRecipeIds = await plannedRecipeIdsFor(user.id, dateStr);
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(dateStr), (stored) =>
      mergeLoggedMeals(stored, loggedMeals, plannedRecipeIds),
    );
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /**
   * Logs one serving of a recipe ("Made it!" in cook mode). Atomic and
   * idempotent: an existing entry for the same recipe and meal type is
   * replaced, so a double tap can't double-log (F-M-TRK-1-1). Nutrition
   * comes from the stored recipe, never the client.
   *
   * With a `slotIndex` (Today's "I ate this") only the entry for that slot
   * is replaced, so logging the second of two identical snacks keeps the
   * first. Without one (cook mode, older clients) the old rule stands.
   *
   * Following (INV-5): another user's recipe (cooked from their profile) is
   * logged as the user's own copy — the log must never reference a row the
   * other person can edit, hide or delete. The entry carries the copy's id.
   */
  async logRecipe(
    user: UserProfile,
    dateStr: string,
    input: {
      recipeId: string;
      mealType: string;
      portionMultiplier: number;
      slotIndex?: number | undefined;
    },
  ): Promise<{ log: DailyLog; rebalance: RebalanceResult | null }> {
    const visible = await findRecipeVisibleTo(user.id, input.recipeId);
    if (!visible) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    const { recipe } = await recipeCopyService.ownedRecipeFor(user.id, visible);
    const n = recipe.nutritionInfo as {
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    };
    const p = input.portionMultiplier;
    const entry: LoggedMealEntry = {
      recipeId: recipe.id,
      mealType: input.mealType,
      ...(input.slotIndex !== undefined && { slotIndex: input.slotIndex }),
      portionMultiplier: p,
      kcal: Math.round((n.calories ?? 0) * p),
      protein: Math.round((n.protein ?? 0) * p * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * p * 10) / 10,
      fat: Math.round((n.fat ?? 0) * p * 10) / 10,
    };
    const target = { recipeId: recipe.id, mealType: input.mealType, slotIndex: input.slotIndex };
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(dateStr), (stored) => [
      ...stored.filter((m) => !matchesRecipeSlot(m, target)),
      entry,
    ]);
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /**
   * Removes one planned-recipe entry (T-19.4, one-save model) — the tracker's
   * untick. The counterpart of `logRecipe`: same identity rule
   * (`matchesRecipeSlot`), so ticking then unticking a row is a clean
   * round-trip regardless of whether the row carries a `slotIndex`. A no-op
   * (not NOT_FOUND) when nothing matches — unticking an already-unticked row
   * (a race with another tab, or a retried request) must not error.
   */
  async unlogRecipe(
    userId: string,
    dateStr: string,
    input: { recipeId: string; mealType: string; slotIndex?: number | undefined },
  ): Promise<DailyLog> {
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) =>
      stored.filter((m) => !matchesRecipeSlot(m, input)),
    );
  },

  /**
   * Removes any entries (recipe or custom) by their `entryId` — used to undo
   * `copyDay` (deletes exactly the copies, via their fresh ids) and, more
   * generally, anywhere a client already holds stable ids for a batch of
   * entries. Idempotent: an id that doesn't match anything is silently
   * ignored, so a double-tapped Undo is harmless.
   */
  async deleteEntries(userId: string, dateStr: string, entryIds: string[]): Promise<DailyLog> {
    const ids = new Set(entryIds);
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) =>
      stored.filter((m) => !m.entryId || !ids.has(m.entryId)),
    );
  },

  /**
   * Appends one custom entry (photo scan or manual quick-add, F4) to the
   * day's log. Custom entries store pre-scaled macros with portionMultiplier
   * 1 — the confirm sheet already let the user edit the numbers.
   */
  async logCustomMeal(
    user: UserProfile,
    dateStr: string,
    entry: {
      name: string;
      estimatedBy: 'vision' | 'manual';
      mealType: string;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
    },
  ): Promise<{ log: DailyLog; rebalance: RebalanceResult | null }> {
    // Atomic append — parallel adds no longer overwrite each other (F-TRK-1-2).
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(dateStr), (stored) => [
      ...stored,
      {
        custom: { name: entry.name, estimatedBy: entry.estimatedBy },
        mealType: entry.mealType,
        portionMultiplier: 1,
        kcal: entry.kcal,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
      },
    ]);
    const rebalance = await this.maybeRebalance(user);
    return { log, rebalance };
  },

  /**
   * Removes one custom entry. UX-FOOD-17: by its stable `entryId` when the
   * client has one (new builds) — the id survives any change to the day's
   * array between render and tap — else by its index in the day's
   * loggedMeals (1.0.1 builds, which never send an id). `entryId` wins when
   * both are present. Planned-recipe entries are managed by `unlogRecipe` /
   * `deleteEntries` and cannot be deleted here.
   */
  async deleteCustomMeal(
    userId: string,
    dateStr: string,
    target: { entryId?: string | undefined; entryIndex?: number | undefined },
  ): Promise<DailyLog> {
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) => {
      const index =
        target.entryId !== undefined
          ? stored.findIndex((m) => m.entryId === target.entryId)
          : (target.entryIndex ?? -1);
      if (!stored[index]?.custom) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No custom entry at that position.' });
      }
      return stored.filter((_, i) => i !== index);
    });
  },

  /**
   * Edits one custom entry by its stable `entryId` (bug B-34, T-19.2) — the
   * Edit entry sheet. Only custom entries (quick-adds, photo scans) can be
   * edited here; a planned-recipe entry is edited by re-ticking it with a
   * different portion. NOT_FOUND covers a stale id (already deleted) or one
   * that names a recipe entry.
   */
  async updateCustomMeal(
    userId: string,
    dateStr: string,
    entryId: string,
    updates: {
      name?: string | undefined;
      estimatedBy?: 'vision' | 'manual' | undefined;
      mealType?: string | undefined;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
    },
  ): Promise<DailyLog> {
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) => {
      const index = stored.findIndex((m) => m.entryId === entryId && m.custom);
      if (index === -1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom entry not found.' });
      }
      const existing = stored[index]!;
      const next: LoggedMealEntry = {
        ...existing,
        mealType: updates.mealType ?? existing.mealType,
        custom: {
          name: updates.name ?? existing.custom!.name,
          estimatedBy: updates.estimatedBy ?? existing.custom!.estimatedBy,
        },
        kcal: updates.kcal,
        protein: updates.protein,
        carbs: updates.carbs,
        fat: updates.fat,
      };
      return stored.map((m, i) => (i === index ? next : m));
    });
  },

  /**
   * Edits one logged RECIPE entry by its stable `entryId` (UX-FOOD-03) — the
   * "Also eaten" rows for a recipe that has left the plan, which otherwise
   * could be neither corrected nor removed. Changes the portion and/or the
   * meal; the macros are recomputed from the stored recipe, never trusted
   * from the client. NOT_FOUND covers a stale id or one that names a custom
   * entry (those use `updateCustomMeal`).
   */
  async updateRecipeEntry(
    userId: string,
    dateStr: string,
    entryId: string,
    updates: { portionMultiplier?: number | undefined; mealType?: string | undefined },
  ): Promise<DailyLog> {
    const log = await dailyLogRepository.findByDate(userId, dayDate(dateStr));
    const current = ((log?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? []).find(
      (m) => m.entryId === entryId && isRecipeEntry(m),
    );
    if (!current?.recipeId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Logged meal not found.' });
    }
    const [recipe] = await mealPlanRepository.findRecipesByIds([current.recipeId]);
    if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
    const n = recipe.nutritionInfo as {
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    };
    const p = updates.portionMultiplier ?? current.portionMultiplier;
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) => {
      const index = stored.findIndex((m) => m.entryId === entryId && isRecipeEntry(m));
      if (index === -1) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Logged meal not found.' });
      }
      const next: LoggedMealEntry = {
        ...stored[index]!,
        mealType: updates.mealType ?? stored[index]!.mealType,
        portionMultiplier: p,
        kcal: Math.round((n.calories ?? 0) * p),
        protein: Math.round((n.protein ?? 0) * p * 10) / 10,
        carbs: Math.round((n.carbs ?? 0) * p * 10) / 10,
        fat: Math.round((n.fat ?? 0) * p * 10) / 10,
      };
      return stored.map((m, i) => (i === index ? next : m));
    });
  },

  /**
   * Re-adds a custom entry exactly as it was (bug B-34, T-19.2) — the bin's
   * `Undo` snackbar (8s), which sends back the deleted entry's own snapshot.
   * Idempotent on `entry.entryId`: a double-tapped Undo (or a race with
   * another tab) never duplicates the row.
   */
  async restoreCustomMeal(
    userId: string,
    dateStr: string,
    entry: LoggedMealEntry,
  ): Promise<DailyLog> {
    return dailyLogRepository.mutateDay(userId, dayDate(dateStr), (stored) => {
      if (entry.entryId && stored.some((m) => m.entryId === entry.entryId)) return stored;
      return [...stored, entry.entryId ? entry : { ...entry, entryId: newEntryId() }];
    });
  },

  /**
   * Copies every logged entry from `fromDateStr` onto `toDateStr` (T-19.3,
   * "Copy {yesterday} to today"). Each copy gets its OWN `entryId` (so Undo
   * can delete exactly the copies, not the originals) and drops `slotIndex` —
   * the target day's plan slots are a different day and may not even have
   * that slot.
   */
  async copyDay(
    user: UserProfile,
    fromDateStr: string,
    toDateStr: string,
  ): Promise<{ log: DailyLog; copiedEntryIds: string[]; rebalance: RebalanceResult | null }> {
    const fromLog = await dailyLogRepository.findByDate(user.id, dayDate(fromDateStr));
    const sourceEntries = (fromLog?.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [];
    const copies: LoggedMealEntry[] = sourceEntries.map((m) => {
      const { slotIndex: _slotIndex, entryId: _entryId, ...rest } = m;
      return { ...rest, entryId: newEntryId() };
    });
    const log = await dailyLogRepository.mutateDay(user.id, dayDate(toDateStr), (stored) => [
      ...stored,
      ...copies,
    ]);
    const rebalance = await this.maybeRebalance(user);
    return { log, copiedEntryIds: copies.map((c) => c.entryId!), rebalance };
  },

  /**
   * Last `RECENTS_WINDOW_DAYS` days' distinct logged entries, most frequent
   * first (T-19.1) — the search-first Log sheet's "Recent" group. Distinct by
   * recipe or by (normalized) custom name; a deleted entry simply isn't in
   * the scanned days any more, so it never needs separate filtering.
   */
  async recents(userId: string, limit = 15): Promise<RecentTrackerEntry[]> {
    const logs = await dailyLogRepository.findLastN(userId, RECENTS_WINDOW_DAYS);
    const days: RecentLogDay[] = logs.map((l) => ({
      dateStr: l.date.toISOString().split('T')[0]!,
      entries: (l.loggedMeals as unknown as LoggedMealEntry[] | null) ?? [],
    }));
    const aggregates = aggregateRecents(days, limit);

    const recipeIds = [
      ...new Set(aggregates.map((a) => a.recipeId).filter((id): id is string => !!id)),
    ];
    const recipes =
      recipeIds.length > 0 ? await mealPlanRepository.findRecipesByIds(recipeIds) : [];
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    return aggregates.map((a) => {
      const recipe = a.recipeId ? recipeMap.get(a.recipeId) : undefined;
      return {
        key: a.key,
        ...(a.recipeId && { recipeId: a.recipeId }),
        name: recipe?.name ?? a.customName ?? 'Logged meal',
        imageUrl: recipe?.imageUrl ?? null,
        mealType: a.mealType,
        kcal: a.kcal,
        protein: a.protein,
        carbs: a.carbs,
        fat: a.fat,
        ...(a.estimatedBy && { estimatedBy: a.estimatedBy }),
        ...(a.portionMultiplier !== undefined && { portionMultiplier: a.portionMultiplier }),
        count: a.count,
        lastLoggedAt: a.lastLoggedAt,
      };
    });
  },

  /**
   * F4 rebalance hook — runs after any log write. Premium-only (gated by the
   * photoLogging matrix key: free tier logs honestly but the chef doesn't
   * re-plan the week). Failures are swallowed: a broken rebalance must never
   * fail the log save itself.
   */
  async maybeRebalance(user: UserProfile): Promise<RebalanceResult | null> {
    if (!hasFeature(user, 'photoLogging')) return null;
    try {
      // Only the current week is ever rebalanced (UX-PLAN-09).
      const plan = await planForThisWeek(mealPlanRepository, user.id);
      if (!plan) return null;
      return await rebalanceWeek(user.id, plan.id);
    } catch (err) {
      console.error('[tracker] rebalanceWeek failed (log save unaffected):', err);
      return null;
    }
  },

  /**
   * Daily totals for the trailing `dayCount` days (today inclusive), zero-
   * filled for unlogged days. weeklySummary/monthlySummary used to be
   * byte-identical copies of this differing only in N.
   *
   * `localDate` (§2.12, T-21.1, bug B-33) anchors the window on the CLIENT's
   * local "today" instead of the server's UTC one — a user whose local day
   * has already turned over (or hasn't yet, relative to UTC) used to see a
   * week/month window shifted by a day. The query itself asks for one extra
   * day as a buffer for that same skew; optional and back-compat: omitting it
   * keeps the old server-UTC-anchored behaviour exactly.
   */
  async summary(
    userId: string,
    dayCount: number,
    localDate?: string,
  ): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    const [logs, profile] = await Promise.all([
      dailyLogRepository.findLastN(userId, localDate ? dayCount + 1 : dayCount),
      chefProfileRepository.findByUserId(userId),
    ]);
    const dailyCalorieTarget = resolveDailyTargets(profile).dailyCalorieTarget;

    const anchor = localDate ? new Date(`${localDate}T00:00:00Z`) : new Date();
    const days: DaySummary[] = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() - i);
      d.setUTCHours(0, 0, 0, 0);
      const dateStr = d.toISOString().split('T')[0]!;
      const log = logs.find((l) => {
        const ld = new Date(l.date);
        ld.setUTCHours(0, 0, 0, 0);
        return ld.toISOString().split('T')[0] === dateStr;
      });
      days.push({
        date: dateStr,
        totalKcal: log?.totalKcal ?? 0,
        totalProtein: log?.totalProtein ?? 0,
        totalCarbs: log?.totalCarbs ?? 0,
        totalFat: log?.totalFat ?? 0,
        hasLog: !!log,
      });
    }
    return { days, dailyCalorieTarget };
  },

  async weeklySummary(
    userId: string,
    localDate?: string,
  ): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    return this.summary(userId, 7, localDate);
  },

  async monthlySummary(
    userId: string,
    localDate?: string,
  ): Promise<{ days: DaySummary[]; dailyCalorieTarget: number }> {
    return this.summary(userId, 28, localDate);
  },

  async logWeight(userId: string, weightKg: number, dateStr?: string) {
    const recordedAt = dateStr ? new Date(dateStr) : new Date();
    return weightEntryRepository.create({ userId, weightKg, recordedAt });
  },

  async updateWeight(userId: string, id: string, weightKg: number, dateStr?: string) {
    const updated = await weightEntryRepository.updateForUser(userId, id, {
      weightKg,
      ...(dateStr && { recordedAt: new Date(dateStr) }),
    });
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Weigh-in not found' });
    return updated;
  },

  async deleteWeight(userId: string, id: string) {
    const deleted = await weightEntryRepository.deleteForUser(userId, id);
    if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Weigh-in not found' });
    return { success: true as const };
  },

  async weightHistory(userId: string, days: number) {
    return weightEntryRepository.findLastN(userId, days);
  },
};
