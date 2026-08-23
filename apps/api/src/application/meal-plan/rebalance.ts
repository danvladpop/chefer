import {
  chefProfileRepository,
  dailyLogRepository,
  dietaryPreferencesRepository,
  mealPlanRepository,
} from '@chefer/database';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import {
  ensureCuratedRecipes,
  safeCuratedPools,
  type SafetyPrefs,
} from '../../lib/curated-recipes/index.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';

// ─── Week rebalance (F4 Snap-to-Log) ─────────────────────────────────────────
// Wave-0 seam module (premium_plan.md §3.3): feat/snap owns the whole
// implementation without ever touching meal-plan.service.ts.
//
// Contract: after any meal log, if week-to-date consumed + still-planned
// calories project more than ±15% off the weekly target, swap up to two
// FUTURE meals for closer-calorie alternatives. Never touches today or past
// days. Each swap records the pair it made so the banner's undo can restore
// the previous recipe (undo lives client-side: the banner calls the existing
// mealPlan.replaceRecipe path with previousRecipeId).

export interface RebalanceSwap {
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  mealType: string;
  previousRecipeId: string;
  newRecipeId: string;
  /** Names for the banner copy ("I adjusted Thursday dinner…"). */
  previousRecipeName?: string;
  newRecipeName?: string;
}

export interface RebalanceResult {
  /** Whether any swap was applied. */
  rebalanced: boolean;
  /** The swaps made (empty when rebalanced is false) — kept for undo. */
  swaps: RebalanceSwap[];
  /** Projected weekly kcal deviation (fraction, e.g. 0.18 = 18% over). */
  projectedDeviation: number;
  /** The plan the swaps were applied to — set when rebalanced is true, so
      the client's undo can target mealPlan.replaceRecipe directly. */
  planId?: string;
}

// ─── Pure selection logic (unit-tested with fixtures) ────────────────────────

/** A still-upcoming plan slot (a day strictly after today). */
export interface RebalanceSlot {
  dayOfWeek: number;
  mealType: string;
  recipeId: string;
  recipeName: string;
  kcal: number;
}

/** A pool alternative the slot could swap to. */
export interface RebalanceCandidate {
  id: string;
  name: string;
  kcal: number;
}

export interface RebalanceSelectionInput {
  /** 0=Monday … 6=Sunday. Slots on days ≤ todayIndex are never touched. */
  todayIndex: number;
  weeklyTargetKcal: number;
  /** Σ logged kcal for Monday…today (week-to-date consumed). */
  consumedKcal: number;
  /** Planned slots for days AFTER today (defensively re-filtered inside). */
  futureSlots: RebalanceSlot[];
  /** Safety-filtered pool alternatives per meal type. */
  candidatesByType: Record<string, RebalanceCandidate[]>;
  /** Deviation fraction that triggers a rebalance. Default 0.15. */
  threshold?: number;
  /** Max slots swapped per invocation. Default 2. */
  maxSwaps?: number;
  /**
   * Minimum |deviation| improvement (as a fraction of the weekly target) a
   * swap must deliver to be applied. Stops churn: once the best alternatives
   * are in place, re-running the selection is a no-op. Default 0.02.
   */
  minImprovementFraction?: number;
}

export interface RebalanceSelection {
  swaps: RebalanceSwap[];
  /** Deviation BEFORE any swaps (what triggered — or didn't — the rebalance). */
  projectedDeviation: number;
  /** Deviation after the selected swaps are applied. */
  projectedDeviationAfter: number;
}

/**
 * Greedy, deterministic swap selection. Projects the week (consumed so far +
 * everything still planned on future days), and while the projection is off
 * by more than the threshold, repeatedly applies the single swap that most
 * reduces the absolute deviation — up to `maxSwaps`, future days only,
 * stopping early when no candidate improves meaningfully.
 */
export function selectRebalanceSwaps(input: RebalanceSelectionInput): RebalanceSelection {
  const threshold = input.threshold ?? 0.15;
  const maxSwaps = input.maxSwaps ?? 2;
  const minImprovement = (input.minImprovementFraction ?? 0.02) * input.weeklyTargetKcal;
  const target = input.weeklyTargetKcal;

  // Defensive: never consider today or past days, whatever the caller passed.
  const slots = input.futureSlots.filter((s) => s.dayOfWeek > input.todayIndex);

  let projected = input.consumedKcal + slots.reduce((sum, s) => sum + s.kcal, 0);
  const initialDeviation = target > 0 ? (projected - target) / target : 0;

  const selection: RebalanceSelection = {
    swaps: [],
    projectedDeviation: round4(initialDeviation),
    projectedDeviationAfter: round4(initialDeviation),
  };
  if (target <= 0 || Math.abs(initialDeviation) <= threshold || slots.length === 0) {
    return selection;
  }

  const swappedSlots = new Set<RebalanceSlot>();
  const usedCandidateIds = new Set<string>();

  for (let round = 0; round < maxSwaps; round++) {
    let best: { slot: RebalanceSlot; candidate: RebalanceCandidate; improvement: number } | null =
      null;

    for (const slot of slots) {
      if (swappedSlots.has(slot)) continue;
      const pool = input.candidatesByType[slot.mealType] ?? [];
      for (const candidate of pool) {
        if (candidate.id === slot.recipeId || usedCandidateIds.has(candidate.id)) continue;
        const nextProjected = projected + (candidate.kcal - slot.kcal);
        const improvement = Math.abs(projected - target) - Math.abs(nextProjected - target);
        if (improvement > (best?.improvement ?? 0)) {
          best = { slot, candidate, improvement };
        }
      }
    }

    if (!best || best.improvement < minImprovement) break;

    projected += best.candidate.kcal - best.slot.kcal;
    swappedSlots.add(best.slot);
    usedCandidateIds.add(best.candidate.id);
    selection.swaps.push({
      dayOfWeek: best.slot.dayOfWeek,
      mealType: best.slot.mealType,
      previousRecipeId: best.slot.recipeId,
      previousRecipeName: best.slot.recipeName,
      newRecipeId: best.candidate.id,
      newRecipeName: best.candidate.name,
    });

    // Back within tolerance — done, even if a second swap would still improve.
    if (Math.abs((projected - target) / target) <= threshold) break;
  }

  selection.projectedDeviationAfter = round4((projected - target) / target);
  return selection;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

// ─── Orchestration ────────────────────────────────────────────────────────────

/** 0=Monday … 6=Sunday for today (matches dayOfWeek in plans). */
function getTodayDayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Evaluates the user's current week and applies up to two future-day swaps
 * when the projection is >±15% off the weekly calorie target. Swaps draw
 * from the safety-filtered curated pool (no AI call — deterministic and
 * free); the applied pairs are returned so the client can offer undo via
 * mealPlan.replaceRecipe. No-ops (rebalanced: false) whenever the plan
 * isn't this week's, there are no future days, or the week is on track.
 */
export async function rebalanceWeek(userId: string, planId: string): Promise<RebalanceResult> {
  const noop: RebalanceResult = { rebalanced: false, swaps: [], projectedDeviation: 0 };

  const plan = await mealPlanRepository.findByIdForUser(userId, planId);
  if (!plan) return noop;

  // Only the CURRENT week is ever rebalanced — future weeks regenerate from
  // scratch, past weeks are history.
  const monday = getMondayOfCurrentWeek();
  const planStart = new Date(plan.weekStartDate);
  planStart.setHours(0, 0, 0, 0);
  if (planStart.getTime() !== monday.getTime()) return noop;

  const todayIndex = getTodayDayIndex();
  if (todayIndex >= 6) return noop; // Sunday: no future days left this week

  const [profile, dietaryPrefs, weekLogs] = await Promise.all([
    chefProfileRepository.findByUserId(userId),
    dietaryPreferencesRepository.findByUserId(userId),
    // findLastN(days+1) reaches back exactly to Monday when today is index N.
    dailyLogRepository.findLastN(userId, todayIndex + 1),
  ]);

  const weeklyTargetKcal = resolveDailyTargets(profile).dailyCalorieTarget * 7;
  const consumedKcal = weekLogs.reduce((sum, log) => sum + log.totalKcal, 0);

  // Future slots joined against their recipe rows for calories.
  type MealSlotJson = { type: string; recipeId: string };
  const futureDays = plan.days.filter((d) => d.dayOfWeek > todayIndex);
  const futureSlotJson = futureDays.flatMap((d) =>
    (d.meals as MealSlotJson[]).map((m) => ({ dayOfWeek: d.dayOfWeek, ...m })),
  );
  if (futureSlotJson.length === 0) return noop;

  const recipeRows = await mealPlanRepository.findRecipesByIds([
    ...new Set(futureSlotJson.map((m) => m.recipeId)),
  ]);
  const recipeMap = new Map(recipeRows.map((r) => [r.id, r]));
  const futureSlots: RebalanceSlot[] = futureSlotJson.flatMap((m) => {
    const row = recipeMap.get(m.recipeId);
    if (!row) return [];
    const nutrition = row.nutritionInfo as { calories?: number };
    return [
      {
        dayOfWeek: m.dayOfWeek,
        mealType: m.type,
        recipeId: m.recipeId,
        recipeName: row.name,
        kcal: nutrition.calories ?? 0,
      },
    ];
  });

  const safety: SafetyPrefs = {
    allergies: dietaryPrefs?.allergies ?? [],
    dietaryRestrictions: dietaryPrefs?.dietaryRestrictions ?? [],
    dislikedIngredients: dietaryPrefs?.dislikedIngredients ?? [],
  };
  const pools = safeCuratedPools(safety);
  const candidatesByType: Record<string, RebalanceCandidate[]> = {};
  for (const [type, pool] of Object.entries(pools) as [MealType, RecipeData[]][]) {
    candidatesByType[type] = pool.map((r) => ({
      id: r.id,
      name: r.name,
      kcal: r.nutritionInfo.calories,
    }));
  }

  const selection = selectRebalanceSwaps({
    todayIndex,
    weeklyTargetKcal,
    consumedKcal,
    futureSlots,
    candidatesByType,
  });

  if (selection.swaps.length === 0) {
    return { rebalanced: false, swaps: [], projectedDeviation: selection.projectedDeviation };
  }

  // The swapped-in recipes come from the curated pool — make sure their rows
  // exist before plan slots reference them.
  await ensureCuratedRecipes();
  for (const swap of selection.swaps) {
    await mealPlanRepository.updateDayMeal(planId, swap.dayOfWeek, swap.mealType, swap.newRecipeId);
  }

  return {
    rebalanced: true,
    swaps: selection.swaps,
    projectedDeviation: selection.projectedDeviation,
    planId,
  };
}
