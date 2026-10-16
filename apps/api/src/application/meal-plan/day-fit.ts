import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  parseSkippedSlots,
  type LoggedMealEntry,
} from '@chefer/database';
import {
  applyTrainingDayBonus,
  dateOnlyKey,
  fitDayPortions,
  hasTrainingDayBump,
  localDateStr,
  slotPortion,
  slotStates,
  trainingDayBonus,
  trainingWeekdays,
  weekStartForDate,
  type DayFitSlot,
} from '@chefer/utils';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import { ensureCuratedRecipes, safeCuratedPools } from '../../lib/curated-recipes/index.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { safetyService } from '../safety/safety.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';

// ─── Day rebalance (owner, 2026-10-16) ────────────────────────────────────────
// A swap, a replace or a target change should leave each day on ITS target —
// the training-day target Today shows included. Zero AI, free for everyone:
// the day's OTHER open slots are resized (¾×–2×, `fitDayPortions`), and when
// resizing alone can't reach the band, ONE change is suggested (a better
// fitting safe curated dish for an open slot, or a snack) — nothing changes
// until the user taps it. Open = still planned: not eaten, replaced or
// skipped today, not pinned ("your pick"), not a leftover, not the slot the
// user just changed. Past days of the current week are history: never touched.

interface SlotJson {
  type: string;
  recipeId: string;
  portion?: number;
  pinned?: boolean;
  leftoverOf?: unknown;
}

export interface DayTargets {
  calories: number;
  proteinG: number;
}

export interface PlanTargets {
  base: DayTargets;
  /** Weekdays (Monday = 0) whose target is the bumped training-day one. */
  byDay: Map<number, DayTargets>;
  goal: string | null;
}

export interface DayFitChange {
  slotIndex: number;
  mealType: string;
  recipeName: string;
  from: number;
  to: number;
}

export interface DayFitSuggestion {
  kind: 'swap' | 'snack';
  /** The open slot the swap replaces (absent for a snack). */
  slotIndex?: number;
  mealType: string;
  recipeId: string;
  recipeName: string;
  /** What the day gains with it (portions re-fitted around it). */
  kcalDelta: number;
  proteinDelta: number;
}

export interface DayFitOutcome {
  planId: string;
  dayOfWeek: number;
  changes: DayFitChange[];
  /** The day's portions before the fit, index-aligned — what Undo restores. */
  previousPortions: number[];
  kcal: number;
  proteinG: number;
  targetKcal: number;
  targetProteinG: number;
  onTarget: boolean;
  /** Nothing open was left to resize (e.g. dinner was the last meal). */
  nothingOpen: boolean;
  suggestion: DayFitSuggestion | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndexOf(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The week's per-day targets: base, with the training-day bump on lift days (free since WP-07). */
export async function loadPlanTargets(userId: string): Promise<PlanTargets> {
  const profile = await chefProfileRepository.findByUserId(userId);
  const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(userId, profile);
  const targets = resolveDailyTargets(profile, lifterBodyweightKg);
  const base = { calories: targets.dailyCalorieTarget, proteinG: targets.proteinG };
  const byDay = new Map<number, DayTargets>();
  const widened = await trainingNutritionService.isBumpWidened();
  if (lifterBodyweightKg && hasTrainingDayBump(profile?.goal, 'lift', widened)) {
    const days = trainingWeekdays(await trainingNutritionService.trainingSchedule(userId));
    if (days.length > 0) {
      const bumped = applyTrainingDayBonus(
        targets,
        trainingDayBonus(targets.dailyCalorieTarget, lifterBodyweightKg),
      );
      for (const d of days) {
        byDay.set(d.dayOfWeek, { calories: bumped.dailyCalorieTarget, proteinG: bumped.proteinG });
      }
    }
  }
  return { base, byDay, goal: profile?.goal ?? null };
}

type PlanRow = NonNullable<Awaited<ReturnType<typeof mealPlanRepository.findByIdForUser>>>;

/** Where `plan`'s week sits relative to the user's today: past days are never fitted. */
function dayRelation(
  plan: PlanRow,
  dayOfWeek: number,
  todayStr: string,
): 'past' | 'today' | 'future' {
  const planStart = new Date(plan.weekStartDate).getTime();
  const thisWeek = Math.abs(planStart - weekStartForDate(todayStr).getTime()) < DAY_MS;
  if (!thisWeek) return planStart < weekStartForDate(todayStr).getTime() ? 'past' : 'future';
  const today = dayIndexOf(todayStr);
  if (dayOfWeek < today) return 'past';
  return dayOfWeek === today ? 'today' : 'future';
}

interface FitContext {
  plan: PlanRow;
  targets: PlanTargets;
  todayStr: string;
  recipes: Map<string, { name: string; kcal: number; protein: number }>;
  todayLog: {
    totalKcal: number;
    totalProtein: number;
    entries: LoggedMealEntry[];
    skipped: ReturnType<typeof parseSkippedSlots>;
  } | null;
}

async function loadContext(
  userId: string,
  plan: PlanRow,
  localDate: string | undefined,
  targets?: PlanTargets,
): Promise<FitContext> {
  const todayStr = localDate ?? localDateStr(new Date());
  const ids = [
    ...new Set(plan.days.flatMap((d) => (d.meals as unknown as SlotJson[]).map((m) => m.recipeId))),
  ];
  const [rows, loaded, recent] = await Promise.all([
    mealPlanRepository.findRecipesByIds(ids),
    targets ? Promise.resolve(targets) : loadPlanTargets(userId),
    dailyLogRepository.findLastN(userId, 2),
  ]);
  const recipes = new Map(
    rows.map((r) => {
      const n = r.nutritionInfo as { calories?: number; protein?: number };
      return [r.id, { name: r.name, kcal: n.calories ?? 0, protein: n.protein ?? 0 }] as const;
    }),
  );
  const log = recent.find((l) => dateOnlyKey(l.date) === todayStr);
  return {
    plan,
    targets: loaded,
    todayStr,
    recipes,
    todayLog: log
      ? {
          totalKcal: log.totalKcal,
          totalProtein: log.totalProtein,
          entries: log.loggedMeals as unknown as LoggedMealEntry[],
          skipped: parseSkippedSlots(log.skippedSlots),
        }
      : null,
  };
}

interface DayModel {
  meals: SlotJson[];
  slots: DayFitSlot[];
  extra: { kcal: number; protein: number };
  target: DayTargets;
}

/** The day as `fitDayPortions` sees it; null for a past or missing day. */
function modelDay(ctx: FitContext, dayOfWeek: number, lock: ReadonlySet<number>): DayModel | null {
  const day = ctx.plan.days.find((d) => d.dayOfWeek === dayOfWeek);
  const meals = (day?.meals as unknown as SlotJson[] | undefined) ?? [];
  if (meals.length === 0) return null;
  const relation = dayRelation(ctx.plan, dayOfWeek, ctx.todayStr);
  if (relation === 'past') return null;

  // Today: what was eaten (or replaced) is in the log totals; only `planned`
  // slots are still open. Other days: every slot counts at its portion.
  const states =
    relation === 'today'
      ? slotStates(
          meals.map((m, slotIndex) => ({ type: m.type, recipeId: m.recipeId, slotIndex })),
          ctx.todayLog?.entries ?? [],
          ctx.todayLog?.skipped ?? [],
        )
      : null;
  const slots = meals.map((m, i): DayFitSlot => {
    const r = ctx.recipes.get(m.recipeId);
    const planned = !states || states[i]?.status === 'planned';
    return {
      kcal: r?.kcal ?? 0,
      protein: r?.protein ?? 0,
      portion: slotPortion(m.portion),
      counts: planned && r !== undefined,
      locked: !planned || lock.has(i) || m.pinned === true || m.leftoverOf !== undefined || !r,
    };
  });
  const extra =
    relation === 'today' && ctx.todayLog
      ? { kcal: ctx.todayLog.totalKcal, protein: ctx.todayLog.totalProtein }
      : { kcal: 0, protein: 0 };
  return { meals, slots, extra, target: ctx.targets.byDay.get(dayOfWeek) ?? ctx.targets.base };
}

const weights = (goal: string | null) => ({
  proteinWeight: goal === 'GAIN_MUSCLE' ? 1.5 : 1,
  ...(goal === 'LOSE_WEIGHT' && { kcalOverWeight: 1.5 }),
});

function dayMiss(kcal: number, protein: number, t: DayTargets): number {
  const kcalMiss = t.calories > 0 ? Math.abs(kcal - t.calories) / t.calories : 0;
  const proteinShort = t.proteinG > 0 ? Math.max(0, t.proteinG - protein) / t.proteinG : 0;
  return kcalMiss + proteinShort;
}

/** The one change that best closes a day portions alone can't: a swap of an open slot, or a snack. */
async function bestSuggestion(
  userId: string,
  model: DayModel,
  goal: string | null,
  afterPortions: readonly number[],
): Promise<DayFitSuggestion | null> {
  await ensureCuratedRecipes();
  const ctx = await safetyService.loadContext(userId);
  const pools = safeCuratedPools(ctx.prefs);
  const inDay = new Set(model.meals.map((m) => m.recipeId));
  const hidden = new Set(ctx.hiddenRecipeIds);
  const usable = (r: RecipeData) => !inDay.has(r.id) && !hidden.has(r.id);
  const base = fitDayPortions(
    model.slots.map((s, i) => ({ ...s, portion: afterPortions[i] ?? s.portion })),
    model.target,
    { ...weights(goal), extra: model.extra },
  );
  // A suggestion must close at least a third of the gap (ideally all of it).
  const baseMiss = dayMiss(base.after.kcal, base.after.protein, model.target);
  let best: { s: DayFitSuggestion; miss: number } | null = null;
  const consider = (s: DayFitSuggestion, slots: DayFitSlot[]) => {
    const fit = fitDayPortions(slots, model.target, { ...weights(goal), extra: model.extra });
    const miss = dayMiss(fit.after.kcal, fit.after.protein, model.target);
    if (miss > baseMiss * (2 / 3)) return;
    if (!best || miss < best.miss) {
      best = {
        s: {
          ...s,
          kcalDelta: fit.after.kcal - base.after.kcal,
          proteinDelta: fit.after.protein - base.after.protein,
        },
        miss,
      };
    }
  };
  model.slots.forEach((slot, i) => {
    if (slot.locked || slot.counts === false) return;
    const type = model.meals[i]!.type as MealType;
    for (const r of (pools[type] ?? []).filter(usable).slice(0, 60)) {
      const slots = model.slots.map((s, j) =>
        j === i
          ? { ...s, kcal: r.nutritionInfo.calories, protein: r.nutritionInfo.protein, portion: 1 }
          : s,
      );
      consider(
        {
          kind: 'swap',
          slotIndex: i,
          mealType: type,
          recipeId: r.id,
          recipeName: r.name,
          kcalDelta: 0,
          proteinDelta: 0,
        },
        slots,
      );
    }
  });
  for (const r of (pools.snack ?? []).filter(usable).slice(0, 40)) {
    consider(
      {
        kind: 'snack',
        mealType: 'snack',
        recipeId: r.id,
        recipeName: r.name,
        kcalDelta: 0,
        proteinDelta: 0,
      },
      [
        ...model.slots,
        {
          kcal: r.nutritionInfo.calories,
          protein: r.nutritionInfo.protein,
          portion: 1,
          locked: false,
        },
      ],
    );
  }
  const found = best as { s: DayFitSuggestion; miss: number } | null;
  return found ? found.s : null;
}

/**
 * Fits one day of `planId` around the slots in `lockSlotIndexes` (the one the
 * user just changed) and writes the new portions. Null when the plan or day
 * is missing or the day is in the past. `suggest` adds the one-change
 * suggestion when resizing alone can't reach the target.
 */
export async function fitPlanDay(
  userId: string,
  planId: string,
  dayOfWeek: number,
  opts: { lockSlotIndexes?: number[]; localDate?: string; suggest?: boolean } = {},
): Promise<DayFitOutcome | null> {
  const plan = await mealPlanRepository.findByIdForUser(userId, planId);
  if (!plan) return null;
  const ctx = await loadContext(userId, plan, opts.localDate);
  return fitWithContext(
    userId,
    ctx,
    dayOfWeek,
    new Set(opts.lockSlotIndexes ?? []),
    opts.suggest ?? true,
  );
}

async function fitWithContext(
  userId: string,
  ctx: FitContext,
  dayOfWeek: number,
  lock: ReadonlySet<number>,
  suggest: boolean,
): Promise<DayFitOutcome | null> {
  const model = modelDay(ctx, dayOfWeek, lock);
  if (!model) return null;
  const fit = fitDayPortions(model.slots, model.target, {
    ...weights(ctx.targets.goal),
    extra: model.extra,
  });
  const previousPortions = model.slots.map((s) => s.portion);
  if (fit.changed.length > 0) {
    await mealPlanRepository.setDayPortions(ctx.plan.id, dayOfWeek, fit.portions);
  }
  const suggestion =
    suggest && !fit.onTarget && !fit.nothingOpen
      ? await bestSuggestion(userId, model, ctx.targets.goal, fit.portions)
      : null;
  return {
    planId: ctx.plan.id,
    dayOfWeek,
    changes: fit.changed.map((i) => ({
      slotIndex: i,
      mealType: model.meals[i]!.type,
      recipeName: ctx.recipes.get(model.meals[i]!.recipeId)?.name ?? '',
      from: previousPortions[i] ?? 1,
      to: fit.portions[i] ?? 1,
    })),
    previousPortions,
    kcal: fit.after.kcal,
    proteinG: fit.after.protein,
    targetKcal: model.target.calories,
    targetProteinG: model.target.proteinG,
    onTarget: fit.onTarget,
    nothingOpen: fit.nothingOpen,
    suggestion,
  };
}

export interface WeekRefitOutcome {
  planId: string;
  days: { dayOfWeek: number; previousPortions: number[]; changed: number }[];
}

/**
 * Targets changed (training setup, goal, weight, coach): resizes today's open
 * slots and every later day of the current week — and next week's plan when
 * one exists — to the new per-day targets. Same recipes, new portions; the
 * user's picks, pinned slots and what was eaten stay. Null when nothing moved.
 */
export async function refitPlanWeeks(
  userId: string,
  opts: { localDate?: string } = {},
): Promise<WeekRefitOutcome[]> {
  const todayStr = opts.localDate ?? localDateStr(new Date());
  const monday = weekStartForDate(todayStr);
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const [thisWeek, nextWeek] = await Promise.all([
    mealPlanRepository.findForWeek(userId, monday),
    mealPlanRepository.findForWeek(userId, nextMonday),
  ]);
  const targets = await loadPlanTargets(userId);
  const out: WeekRefitOutcome[] = [];
  for (const plan of [thisWeek, nextWeek]) {
    if (!plan) continue;
    const full = await mealPlanRepository.findByIdForUser(userId, plan.id);
    if (!full) continue;
    const ctx = await loadContext(userId, full, todayStr, targets);
    const days: WeekRefitOutcome['days'] = [];
    for (const d of full.days) {
      const res = await fitWithContext(userId, ctx, d.dayOfWeek, new Set(), false);
      if (res && res.changes.length > 0) {
        days.push({
          dayOfWeek: d.dayOfWeek,
          previousPortions: res.previousPortions,
          changed: res.changes.length,
        });
      }
    }
    if (days.length > 0) out.push({ planId: full.id, days });
  }
  return out;
}

/** Undo for a fit or a refit: puts a day's portions back exactly (index-aligned). */
export async function restoreDayPortions(
  userId: string,
  planId: string,
  dayOfWeek: number,
  portions: readonly number[],
): Promise<boolean> {
  const plan = await mealPlanRepository.findByIdForUser(userId, planId);
  const day = plan?.days.find((d) => d.dayOfWeek === dayOfWeek);
  if (!plan || !day) return false;
  const meals = day.meals as unknown as SlotJson[];
  // The day changed shape since (a slot added or removed): nothing safe to restore.
  if (meals.length !== portions.length) return false;
  await mealPlanRepository.setDayPortions(planId, dayOfWeek, [...portions]);
  return true;
}

export interface AppliedSuggestion {
  dayFit: DayFitOutcome | null;
  /** What Undo needs: the swapped-out recipe, or the added snack's slot. */
  undo:
    | { kind: 'swap'; slotIndex: number; mealType: string; previousRecipeId: string }
    | { kind: 'snack'; slotIndex: number };
  /** The day's portions before the change (index-aligned to the day BEFORE it). */
  previousPortions: number[];
}

/**
 * Applies a day-fit suggestion the user tapped. Trusts nothing but the ids:
 * the recipe must be one of the user's safe curated recipes of that type, the
 * slot must still be open (not pinned, not a leftover) and the day not past.
 * Null when any check fails — the client refreshes instead.
 */
export async function applyDayFitSuggestion(
  userId: string,
  input: {
    planId: string;
    dayOfWeek: number;
    kind: 'swap' | 'snack';
    mealType: string;
    recipeId: string;
    slotIndex?: number | undefined;
    localDate?: string | undefined;
  },
): Promise<AppliedSuggestion | null> {
  const plan = await mealPlanRepository.findByIdForUser(userId, input.planId);
  if (!plan) return null;
  const todayStr = input.localDate ?? localDateStr(new Date());
  if (dayRelation(plan, input.dayOfWeek, todayStr) === 'past') return null;
  await ensureCuratedRecipes();
  const ctx = await safetyService.loadContext(userId);
  const pools = safeCuratedPools(ctx.prefs);
  const type = (input.kind === 'snack' ? 'snack' : input.mealType) as MealType;
  const safe = (pools[type] ?? []).some((r) => r.id === input.recipeId);
  if (!safe || ctx.hiddenRecipeIds.includes(input.recipeId)) return null;

  const meals =
    (plan.days.find((d) => d.dayOfWeek === input.dayOfWeek)?.meals as unknown as
      | SlotJson[]
      | undefined) ?? [];
  const previousPortions = meals.map((m) => slotPortion(m.portion));
  let undo: AppliedSuggestion['undo'];
  if (input.kind === 'swap') {
    const i = input.slotIndex;
    const slot = i === undefined ? undefined : meals[i];
    if (
      i === undefined ||
      slot?.type !== input.mealType ||
      slot.pinned ||
      slot.leftoverOf !== undefined
    ) {
      return null;
    }
    await mealPlanRepository.updateDayMeal(
      plan.id,
      input.dayOfWeek,
      slot.type,
      input.recipeId,
      undefined,
      i,
      false,
    );
    undo = { kind: 'swap', slotIndex: i, mealType: slot.type, previousRecipeId: slot.recipeId };
  } else {
    const index = await mealPlanRepository.appendDayMeal(
      plan.id,
      input.dayOfWeek,
      'snack',
      input.recipeId,
      {
        pinned: false,
      },
    );
    undo = { kind: 'snack', slotIndex: index };
  }
  const dayFit = await fitPlanDay(userId, plan.id, input.dayOfWeek, {
    localDate: todayStr,
    suggest: false,
  });
  return { dayFit, undo, previousPortions };
}

/** How long the "portions updated" notice may still show after a refit. */
export const PORTION_REFIT_NOTICE_MS = 7 * DAY_MS;

/**
 * Call after anything that moves the user's targets (goal, body, training
 * setup, routine days, coach, own targets). Resizes this and next week's
 * plans and records what changed on each plan for the notice + Undo.
 * Best-effort: a failure is logged and never fails the change that caused it.
 */
export async function refitAfterTargetChange(
  userId: string,
  opts: { localDate?: string } = {},
): Promise<void> {
  try {
    const outcomes = await refitPlanWeeks(userId, opts);
    const at = new Date().toISOString();
    for (const o of outcomes) {
      await mealPlanRepository.setPortionRefit(o.planId, {
        at,
        days: o.days.map(({ dayOfWeek, previousPortions }) => ({ dayOfWeek, previousPortions })),
      });
    }
  } catch (err) {
    console.error('[day-fit] portion refit after a target change failed:', err);
  }
}

/** Undo the last targets refit of `planId`: every day it resized gets its portions back. */
export async function undoPortionRefit(
  userId: string,
  planId: string,
): Promise<{ restored: number }> {
  const plan = await mealPlanRepository.findByIdForUser(userId, planId);
  const refit = plan?.portionRefit as {
    days?: { dayOfWeek: number; previousPortions: number[] }[];
  } | null;
  if (!plan || !refit?.days) return { restored: 0 };
  let restored = 0;
  for (const d of refit.days) {
    if (await restoreDayPortions(userId, planId, d.dayOfWeek, d.previousPortions)) restored++;
  }
  await mealPlanRepository.setPortionRefit(planId, null);
  return { restored };
}

/** The user saw the notice: forget the refit (its Undo goes with it). */
export async function dismissPortionRefit(userId: string, planId: string): Promise<void> {
  const plan = await mealPlanRepository.findByIdForUser(userId, planId);
  if (plan?.portionRefit) await mealPlanRepository.setPortionRefit(planId, null);
}

/** The DTO's view of a stored refit: shown for a week, then forgotten. */
export function portionRefitNotice(
  value: unknown,
  now = Date.now(),
): { at: string; days: number } | null {
  const v = value as { at?: unknown; days?: unknown[] } | null;
  if (!v || typeof v.at !== 'string' || !Array.isArray(v.days) || v.days.length === 0) return null;
  const at = Date.parse(v.at);
  if (!Number.isFinite(at) || now - at > PORTION_REFIT_NOTICE_MS) return null;
  return { at: v.at, days: v.days.length };
}
