import {
  chefProfileRepository,
  dailyLogRepository,
  mealPlanRepository,
  parseSkippedSlots,
} from '@chefer/database';
import type { LoggedMealEntry } from '@chefer/database';
import {
  addDaysLocal,
  dateOnlyKey,
  describeRebalanceSwap,
  describeWeekGap,
  isLossGoal,
  localDateStr,
  LOSS_PROTEIN_KCAL_INCREASE_CAP,
  REBALANCE_MIN_PROTEIN_SWAP_G,
  REBALANCE_PROTEIN_TRIGGER_FRACTION,
  REBALANCE_PROTEIN_TRIGGER_G,
  slotPortion,
  slotStates,
  weekStartForDate,
  weekStartOf,
  type RebalanceReason,
} from '@chefer/utils';
import type { MealType, RecipeData } from '../../lib/ai/types.js';
import { ensureCuratedRecipes, safeCuratedPools } from '../../lib/curated-recipes/index.js';
import { resolveDailyTargets } from '../preferences/preferences.service.js';
import { safetyService, type SafetyContext } from '../safety/safety.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';

// ─── Week rebalance (F4 Snap-to-Log; free + protein-aware since WP-07) ────────
// Wave-0 seam module (premium_plan.md §3.3): feat/snap owns the whole
// implementation without ever touching meal-plan.service.ts.
//
// Contract: after a meal log, if week-to-date consumed + still-planned
// calories project more than ±15% off the weekly target (or, for a preview,
// the week is short on protein), swap up to two FUTURE meals for better
// alternatives from the safety-filtered curated pool. Never touches today,
// past days or "Your pick" slots. NO AI is called anywhere on this path
// (rebalance.no-ai.test.ts proves it) — that is why the feature is free
// ("Premium is for heavy AI only", owner decision 2026-10-02).
//
// Two ways in:
//   - `rebalanceWeek`   — apply at once. What shipped clients (no opt-in) get
//                         after every log, exactly as before.
//   - `previewRebalance`/`applyRebalanceSwaps` — WP-07 / UX-PLAN-09: new
//                         clients see the swaps first and apply explicitly.
// Each swap records the pair it made so undo can restore the previous recipe
// (undo lives client-side: the banner calls mealPlan.replaceRecipe with
// previousRecipeId).

export interface RebalanceSwap {
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  mealType: string;
  /**
   * The slot's index in `day.meals` (a curated day can hold two snacks).
   * Additive: undo sends it to mealPlan.replaceRecipe so the right snack is
   * restored; older clients ignore it.
   */
  slotIndex?: number;
  previousRecipeId: string;
  newRecipeId: string;
  /** Names for the banner copy ("I adjusted Thursday dinner…"). */
  previousRecipeName?: string;
  newRecipeName?: string;
  /** WP-07 (additive): per-serving numbers of the old and new dish. */
  previousKcal?: number;
  newKcal?: number;
  previousProteinG?: number;
  newProteinG?: number;
  /** WP-07 (additive): what the swap was chosen for. */
  reason?: RebalanceReason;
  /** WP-07 (additive): one line, "Sunday dinner → Chicken bowl (+28 g protein)". */
  explanation?: string;
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

/** How a log's rebalance is delivered: applied at once (default), or offered as a preview. */
export type RebalanceMode = 'auto' | 'preview';

/** A protein snack offered when no swap closes the protein gap (never AI). */
export interface RebalanceSnackOption {
  id: string;
  name: string;
  proteinG: number;
  kcal: number;
}

/** WP-07: what a client shows before anything changes. Nothing is written. */
export interface RebalancePreview {
  planId: string;
  /** The swaps `applyRebalance` would make (each with an `explanation`). */
  swaps: RebalanceSwap[];
  /** "You're 36 g short on protein this week." — empty when there is nothing to say. */
  headline: string;
  /** Protein snacks that fit the user's safety rules, when a protein gap remains. */
  snacks: RebalanceSnackOption[];
  week: {
    targetKcal: number;
    projectedKcal: number;
    projectedKcalAfter: number;
    /** Fraction, +0.18 = 18 % over (before / after the swaps). */
    projectedDeviation: number;
    projectedDeviationAfter: number;
    /** Null when the week's protein cannot be judged (no target, or an entry with unknown protein). */
    protein: null | {
      targetG: number;
      projectedG: number;
      projectedAfterG: number;
      gapG: number;
      gapAfterG: number;
    };
  };
}

// ─── Pure selection logic (unit-tested with fixtures) ────────────────────────

/** A still-upcoming plan slot (a day strictly after today). */
export interface RebalanceSlot {
  dayOfWeek: number;
  mealType: string;
  /** Index in `day.meals`; absent in fixtures = the first slot of the type. */
  slotIndex?: number;
  recipeId: string;
  recipeName: string;
  kcal: number;
  /** Protein (g) of the slot at its portion. Absent = unknown, counted as 0. */
  proteinG?: number;
  /**
   * "Your pick" (pinned) slots still count in the week's projection but are
   * never swapped.
   */
  locked?: boolean;
}

/** A pool alternative the slot could swap to. */
export interface RebalanceCandidate {
  id: string;
  name: string;
  kcal: number;
  /** Protein (g) per serving. Absent = unknown, counted as 0. */
  proteinG?: number;
}

export interface RebalanceSelectionInput {
  /** 0=Monday … 6=Sunday. Slots on days ≤ todayIndex are never touched. */
  todayIndex: number;
  weeklyTargetKcal: number;
  /**
   * Σ logged kcal for Monday…today (week-to-date consumed). A slot the user
   * replaced ("Ate something else") is in here with the replacement's numbers.
   */
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
  /** WP-07: weekly protein target (g). Absent or 0 = protein is not scored. */
  weeklyTargetProteinG?: number;
  /** Σ logged protein (g) for Monday…today. */
  consumedProteinG?: number;
  /**
   * Today's planned slots still to eat (status `planned`: not eaten, replaced
   * or skipped). They count in the projection but are never swapped.
   */
  todayRemaining?: { kcal: number; proteinG: number };
  /** The user's goal; on LOSE_WEIGHT a protein fix may add only a little kcal. */
  goal?: string | null;
  /**
   * Whether a protein gap alone may trigger swaps (previews). Off for the
   * auto path, where protein only RANKS swaps that the kcal rule already
   * triggered — shipped clients keep today's triggers.
   */
  proteinTrigger?: boolean;
}

export interface RebalanceSelection {
  swaps: RebalanceSwap[];
  /** Deviation BEFORE any swaps (what triggered — or didn't — the rebalance). */
  projectedDeviation: number;
  /** Deviation after the selected swaps are applied. */
  projectedDeviationAfter: number;
  /** Projected week kcal before / after the swaps. */
  projectedKcal: number;
  projectedKcalAfter: number;
  /** Weekly protein still missing (g, ≥ 0) before / after; 0 when protein is not scored. */
  proteinGapG: number;
  proteinGapAfterG: number;
  projectedProteinG: number;
  projectedProteinAfterG: number;
}

const sumBy = <T>(items: readonly T[], pick: (item: T) => number): number =>
  items.reduce((sum, item) => sum + pick(item), 0);

/** The smallest weekly protein shortfall that justifies a swap. */
export function proteinTriggerG(weeklyTargetProteinG: number): number {
  return Math.max(
    REBALANCE_PROTEIN_TRIGGER_G,
    REBALANCE_PROTEIN_TRIGGER_FRACTION * weeklyTargetProteinG,
  );
}

/**
 * Greedy, deterministic swap selection. Projects the week (consumed so far +
 * what is still to eat today + everything planned on future days), and while
 * the projection is off — by more than the kcal threshold, or (preview) short
 * of protein — repeatedly applies the single swap that scores best, up to
 * `maxSwaps`, future days only, stopping when no candidate helps.
 *
 * A swap scores on the kcal gap it closes AND the protein gap it closes (each
 * as a fraction of its weekly target), so within the kcal tolerance a
 * higher-protein dish wins. A swap offered for protein alone must not push the
 * week outside the kcal tolerance, and on a weight-loss goal the protein fixes
 * together add at most 10 % of one day's calories (UX-PLAN-08).
 */
export function selectRebalanceSwaps(input: RebalanceSelectionInput): RebalanceSelection {
  const threshold = input.threshold ?? 0.15;
  const maxSwaps = input.maxSwaps ?? 2;
  const minImprovement = (input.minImprovementFraction ?? 0.02) * input.weeklyTargetKcal;
  const target = input.weeklyTargetKcal;
  const targetProtein = input.weeklyTargetProteinG ?? 0;
  const proteinScored = targetProtein > 0;
  const lossBudgetKcal = LOSS_PROTEIN_KCAL_INCREASE_CAP * (target / 7);
  const loss = isLossGoal(input.goal);

  // Defensive: never consider today or past days, whatever the caller passed.
  const slots = input.futureSlots.filter((s) => s.dayOfWeek > input.todayIndex);

  let projected =
    input.consumedKcal + (input.todayRemaining?.kcal ?? 0) + sumBy(slots, (s) => s.kcal);
  let projectedProtein =
    (input.consumedProteinG ?? 0) +
    (input.todayRemaining?.proteinG ?? 0) +
    sumBy(slots, (s) => s.proteinG ?? 0);
  const initialDeviation = target > 0 ? (projected - target) / target : 0;
  const gapOf = (protein: number) => (proteinScored ? Math.max(0, targetProtein - protein) : 0);
  const initialGap = gapOf(projectedProtein);

  const selection: RebalanceSelection = {
    swaps: [],
    projectedDeviation: round4(initialDeviation),
    projectedDeviationAfter: round4(initialDeviation),
    projectedKcal: Math.round(projected),
    projectedKcalAfter: Math.round(projected),
    proteinGapG: round1(initialGap),
    proteinGapAfterG: round1(initialGap),
    projectedProteinG: round1(projectedProtein),
    projectedProteinAfterG: round1(projectedProtein),
  };

  const kcalTriggered = () => Math.abs((projected - target) / target) > threshold;
  const proteinTriggered = () =>
    proteinScored &&
    input.proteinTrigger === true &&
    gapOf(projectedProtein) >= proteinTriggerG(targetProtein);

  if (target <= 0 || slots.length === 0 || (!kcalTriggered() && !proteinTriggered())) {
    return selection;
  }

  const swappedSlots = new Set<RebalanceSlot>();
  const usedCandidateIds = new Set<string>();
  // Net kcal that protein-only swaps added (counted against the loss budget).
  let proteinAddedKcal = 0;

  for (let round = 0; round < maxSwaps; round++) {
    const kcalOn = kcalTriggered();
    const proteinOn = proteinTriggered();
    if (!kcalOn && !proteinOn) break;
    const gapNow = gapOf(projectedProtein);

    let best: {
      slot: RebalanceSlot;
      candidate: RebalanceCandidate;
      score: number;
      dk: number;
      dp: number;
      reason: RebalanceReason;
      kcalJustified: boolean;
    } | null = null;

    for (const slot of slots) {
      if (slot.locked || swappedSlots.has(slot)) continue;
      const pool = input.candidatesByType[slot.mealType] ?? [];
      for (const candidate of pool) {
        if (candidate.id === slot.recipeId || usedCandidateIds.has(candidate.id)) continue;
        const dk = candidate.kcal - slot.kcal;
        const dp = proteinScored ? (candidate.proteinG ?? 0) - (slot.proteinG ?? 0) : 0;
        const kcalImprovement = Math.abs(projected - target) - Math.abs(projected + dk - target);
        const proteinImprovement = proteinScored ? gapNow - gapOf(projectedProtein + dp) : 0;

        const kcalJustified = kcalOn && kcalImprovement >= minImprovement;
        // A protein swap may not push the week out of the kcal tolerance...
        const kcalOk =
          kcalImprovement >= 0 || Math.abs((projected + dk - target) / target) <= threshold;
        // ...and on a cut it may add only a little kcal in total.
        const withinLossBudget = !loss || dk <= 0 || proteinAddedKcal + dk <= lossBudgetKcal;
        const proteinJustified =
          proteinOn &&
          proteinImprovement >= REBALANCE_MIN_PROTEIN_SWAP_G &&
          kcalOk &&
          withinLossBudget;
        if (!kcalJustified && !proteinJustified) continue;

        const score =
          kcalImprovement / target + (proteinScored ? proteinImprovement / targetProtein : 0);
        if (best === null || score > best.score) {
          const helpsProtein = proteinImprovement >= REBALANCE_MIN_PROTEIN_SWAP_G;
          best = {
            slot,
            candidate,
            score,
            dk,
            dp,
            kcalJustified,
            reason: !kcalJustified ? 'protein' : helpsProtein ? 'both' : 'calories',
          };
        }
      }
    }

    if (!best) break;

    projected += best.dk;
    projectedProtein += best.dp;
    if (!best.kcalJustified) proteinAddedKcal += best.dk;
    swappedSlots.add(best.slot);
    usedCandidateIds.add(best.candidate.id);
    const swap: RebalanceSwap = {
      dayOfWeek: best.slot.dayOfWeek,
      mealType: best.slot.mealType,
      ...(best.slot.slotIndex !== undefined && { slotIndex: best.slot.slotIndex }),
      previousRecipeId: best.slot.recipeId,
      previousRecipeName: best.slot.recipeName,
      newRecipeId: best.candidate.id,
      newRecipeName: best.candidate.name,
      previousKcal: Math.round(best.slot.kcal),
      newKcal: Math.round(best.candidate.kcal),
      ...(proteinScored && {
        previousProteinG: round1(best.slot.proteinG ?? 0),
        newProteinG: round1(best.candidate.proteinG ?? 0),
      }),
      reason: best.reason,
    };
    swap.explanation = describeRebalanceSwap(swap);
    selection.swaps.push(swap);
  }

  selection.projectedDeviationAfter = round4((projected - target) / target);
  selection.projectedKcalAfter = Math.round(projected);
  selection.proteinGapAfterG = round1(gapOf(projectedProtein));
  selection.projectedProteinAfterG = round1(projectedProtein);
  return selection;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// ─── Orchestration ────────────────────────────────────────────────────────────

type MealSlotJson = { type: string; recipeId: string; portion?: number; pinned?: boolean };

export interface RebalanceOptions {
  /**
   * The client's local "today" (YYYY-MM-DD). Absent = the server's own today,
   * which is what shipped clients always got.
   */
  localDate?: string | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 0=Monday … 6=Sunday for a calendar day string. */
function dayIndexOf(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function addDays(dateStr: string, days: number): string {
  return addDaysLocal(dateStr, days);
}

type CuratedPools = Record<MealType, RecipeData[]>;

/** The user's safe curated alternatives per meal type — the ONLY source of swaps. */
function safePoolsFor(
  prefs: Parameters<typeof safeCuratedPools>[0],
  hiddenRecipeIds: readonly string[],
): CuratedPools {
  const pools = safeCuratedPools(prefs);
  const out = {} as CuratedPools;
  for (const [type, pool] of Object.entries(pools) as [MealType, RecipeData[]][]) {
    out[type] = pool.filter((r) => !hiddenRecipeIds.includes(r.id));
  }
  return out;
}

interface WeekEvaluation {
  planId: string;
  todayIndex: number;
  goal: string | null;
  selection: RebalanceSelection;
  pools: CuratedPools;
  /** Per-serving numbers of every future slot's current recipe, by recipe id. */
  futureSlots: RebalanceSlot[];
  weeklyTargetKcal: number;
  weeklyTargetProteinG: number;
  /** False when a logged entry has unknown protein: the week's protein cannot be judged. */
  proteinKnown: boolean;
  safetyPrefs: SafetyContext['prefs'];
}

/**
 * Reads the week and runs the pure selection. Null = nothing to do (not this
 * week's plan, Sunday, no future meals). Writes nothing.
 */
async function evaluateWeek(
  userId: string,
  planId: string,
  opts: RebalanceOptions & { proteinTrigger: boolean },
): Promise<WeekEvaluation | null> {
  const plan = await mealPlanRepository.findByIdForUser(userId, planId);
  if (!plan) return null;

  const todayStr = opts.localDate ?? localDateStr(new Date());
  const todayIndex = dayIndexOf(todayStr);
  // Only the CURRENT week is ever rebalanced — future weeks regenerate from
  // scratch, past weeks are history. (Same-week check with a day of slack for
  // the local-vs-UTC midnight a plan's weekStartDate may be stored at.)
  const planStart = new Date(plan.weekStartDate).getTime();
  if (Math.abs(planStart - weekStartForDate(todayStr).getTime()) >= DAY_MS) return null;
  if (todayIndex >= 6) return null; // Sunday: no future days left this week

  const [profile, safetyCtx, recentLogs] = await Promise.all([
    chefProfileRepository.findByUserId(userId),
    // T-BUG-X1 (folded into T-01.2): this used to read only the OWNER's
    // dietary prefs, so a rebalance swap could hand a household member's
    // allergen to the table — now the same merged SafetyService context
    // every other surface uses.
    safetyService.loadContext(userId),
    // 15 days reaches back to Monday whatever the weekday.
    dailyLogRepository.findLastN(userId, 15),
  ]);
  const { lifterBodyweightKg } = await trainingNutritionService.loadLifter(userId, profile);
  const targets = resolveDailyTargets(profile, lifterBodyweightKg);
  const weeklyTargetKcal = targets.dailyCalorieTarget * 7;
  const weeklyTargetProteinG = targets.proteinG * 7;

  // Monday…today of the week being rebalanced.
  const monday = weekStartOf(todayStr);
  const weekDates = new Set(Array.from({ length: todayIndex + 1 }, (_, i) => addDays(monday, i)));
  const dateOf = (log: { date: Date }) => dateOnlyKey(log.date);
  const weekLogs = recentLogs.filter((log) => weekDates.has(dateOf(log)));
  const consumedKcal = sumBy(weekLogs, (log) => log.totalKcal);
  const consumedProteinG = sumBy(weekLogs, (log) => log.totalProtein);
  const entriesOf = (log: { loggedMeals: unknown }) => log.loggedMeals as LoggedMealEntry[];
  const proteinKnown = !weekLogs.some((log) =>
    entriesOf(log).some((e) => e.unknownMacros?.includes('protein')),
  );

  // Plan slots joined against their recipe rows for calories and protein.
  const meals = (dayOfWeek: number): MealSlotJson[] =>
    (plan.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals as MealSlotJson[] | undefined) ?? [];
  const todayMeals = meals(todayIndex);
  const futureDays = plan.days.filter((d) => d.dayOfWeek > todayIndex);
  const futureSlotJson = futureDays.flatMap((d) =>
    (d.meals as MealSlotJson[]).map((m, slotIndex) => ({
      dayOfWeek: d.dayOfWeek,
      slotIndex,
      ...m,
    })),
  );
  if (futureSlotJson.length === 0) return null;

  const recipeRows = await mealPlanRepository.findRecipesByIds([
    ...new Set([...futureSlotJson, ...todayMeals].map((m) => m.recipeId)),
  ]);
  const recipeMap = new Map(recipeRows.map((r) => [r.id, r]));
  const macrosOf = (recipeId: string, portion: number | undefined) => {
    const row = recipeMap.get(recipeId);
    if (!row) return null;
    const n = row.nutritionInfo as { calories?: number; protein?: number };
    const p = slotPortion(portion);
    return { row, kcal: Math.round((n.calories ?? 0) * p), proteinG: (n.protein ?? 0) * p };
  };

  const futureSlots: RebalanceSlot[] = futureSlotJson.flatMap((m) => {
    // P1-1: a portioned slot counts at its portion.
    const macros = macrosOf(m.recipeId, m.portion);
    if (!macros) return [];
    return [
      {
        dayOfWeek: m.dayOfWeek,
        mealType: m.type,
        slotIndex: m.slotIndex,
        recipeId: m.recipeId,
        recipeName: macros.row.name,
        kcal: macros.kcal,
        proteinG: macros.proteinG,
        ...(m.pinned === true && { locked: true }),
      },
    ];
  });

  // Today's slots still to eat count in the projection (a replaced slot is
  // eaten with the replacement's numbers — already in `consumed`; a skipped
  // slot is neither eaten nor remaining).
  const todayLog = weekLogs.find((log) => dateOf(log) === todayStr);
  const todayStates = slotStates(
    todayMeals.map((m, slotIndex) => ({ type: m.type, recipeId: m.recipeId, slotIndex })),
    todayLog ? entriesOf(todayLog) : [],
    parseSkippedSlots(todayLog?.skippedSlots),
  );
  const todayRemaining = { kcal: 0, proteinG: 0 };
  todayMeals.forEach((m, i) => {
    if (todayStates[i]?.status !== 'planned') return;
    const macros = macrosOf(m.recipeId, m.portion);
    if (!macros) return;
    todayRemaining.kcal += macros.kcal;
    todayRemaining.proteinG += macros.proteinG;
  });

  const pools = safePoolsFor(safetyCtx.prefs, safetyCtx.hiddenRecipeIds);
  const candidatesByType: Record<string, RebalanceCandidate[]> = {};
  for (const [type, pool] of Object.entries(pools)) {
    candidatesByType[type] = pool.map((r) => ({
      id: r.id,
      name: r.name,
      kcal: r.nutritionInfo.calories,
      proteinG: r.nutritionInfo.protein,
    }));
  }

  const goal = profile?.goal ?? null;
  const selection = selectRebalanceSwaps({
    todayIndex,
    weeklyTargetKcal,
    consumedKcal,
    todayRemaining,
    futureSlots,
    candidatesByType,
    goal,
    ...(proteinKnown && {
      weeklyTargetProteinG,
      consumedProteinG,
      proteinTrigger: opts.proteinTrigger,
    }),
  });

  return {
    planId,
    todayIndex,
    goal,
    selection,
    pools,
    futureSlots,
    weeklyTargetKcal,
    weeklyTargetProteinG,
    proteinKnown,
    safetyPrefs: safetyCtx.prefs,
  };
}

/** Writes swaps into the plan. The swapped-in recipes come from the curated pool. */
async function writeSwaps(planId: string, swaps: readonly RebalanceSwap[]): Promise<void> {
  // Make sure the curated rows exist before plan slots reference them.
  await ensureCuratedRecipes();
  for (const swap of swaps) {
    // By index: on a two-snack day the second snack is its own slot.
    await mealPlanRepository.updateDayMeal(
      planId,
      swap.dayOfWeek,
      swap.mealType,
      swap.newRecipeId,
      undefined,
      swap.slotIndex,
    );
  }
}

/**
 * Evaluates the user's current week and applies up to two future-day swaps
 * when the projection is >±15% off the weekly calorie target. Swaps draw
 * from the safety-filtered curated pool (no AI call — deterministic and
 * free); the applied pairs are returned so the client can offer undo via
 * mealPlan.replaceRecipe. No-ops (rebalanced: false) whenever the plan
 * isn't this week's, there are no future days, or the week is on track.
 *
 * This is the apply-at-once path shipped clients get after every log. Protein
 * only ranks the swaps the kcal rule triggers; a protein gap alone never
 * rewrites a week unprompted (that is `previewRebalance`).
 */
export async function rebalanceWeek(
  userId: string,
  planId: string,
  opts: RebalanceOptions = {},
): Promise<RebalanceResult> {
  const evaluation = await evaluateWeek(userId, planId, { ...opts, proteinTrigger: false });
  if (!evaluation) return { rebalanced: false, swaps: [], projectedDeviation: 0 };
  const { selection } = evaluation;
  if (selection.swaps.length === 0) {
    return { rebalanced: false, swaps: [], projectedDeviation: selection.projectedDeviation };
  }
  await writeSwaps(planId, selection.swaps);
  return {
    rebalanced: true,
    swaps: selection.swaps,
    projectedDeviation: selection.projectedDeviation,
    planId,
  };
}

/** Snacks (safety-filtered, curated, no AI) that fit a protein gap, best protein per kcal first. */
function snacksForGap(
  prefs: SafetyContext['prefs'],
  gapG: number,
  loss: boolean,
  dailyKcal: number,
): RebalanceSnackOption[] {
  if (gapG < REBALANCE_MIN_PROTEIN_SWAP_G) return [];
  const safe = trainingNutritionService.refuelSnacks(prefs, 50);
  const cap = loss ? LOSS_PROTEIN_KCAL_INCREASE_CAP * dailyKcal * 2 : Number.POSITIVE_INFINITY;
  return safe
    .filter((snack) => snack.kcal <= cap)
    .sort((a, b) => b.proteinG / b.kcal - a.proteinG / a.kcal)
    .slice(0, 2)
    .map(({ id, name, proteinG, kcal }) => ({ id, name, proteinG, kcal }));
}

/**
 * UX-PLAN-09: what a rebalance WOULD do, without doing it. Same selection as
 * `rebalanceWeek`, except that a protein gap alone can now trigger swaps.
 * Null when there is nothing to offer (no swaps and no snack worth suggesting).
 */
export async function previewRebalance(
  userId: string,
  planId: string,
  opts: RebalanceOptions = {},
): Promise<RebalancePreview | null> {
  const evaluation = await evaluateWeek(userId, planId, { ...opts, proteinTrigger: true });
  if (!evaluation) return null;
  const { selection, goal } = evaluation;

  const proteinScored = evaluation.proteinKnown && evaluation.weeklyTargetProteinG > 0;
  const snacks =
    proteinScored && selection.proteinGapAfterG >= proteinTriggerG(evaluation.weeklyTargetProteinG)
      ? snacksForGap(
          evaluation.safetyPrefs,
          selection.proteinGapAfterG,
          isLossGoal(goal),
          evaluation.weeklyTargetKcal / 7,
        )
      : [];
  if (selection.swaps.length === 0 && snacks.length === 0) return null;

  return {
    planId,
    swaps: selection.swaps,
    headline: describeWeekGap({
      kcalDelta: selection.projectedKcal - evaluation.weeklyTargetKcal,
      proteinGapG: proteinScored ? selection.proteinGapG : 0,
    }),
    snacks,
    week: {
      targetKcal: evaluation.weeklyTargetKcal,
      projectedKcal: selection.projectedKcal,
      projectedKcalAfter: selection.projectedKcalAfter,
      projectedDeviation: selection.projectedDeviation,
      projectedDeviationAfter: selection.projectedDeviationAfter,
      protein: proteinScored
        ? {
            targetG: evaluation.weeklyTargetProteinG,
            projectedG: selection.projectedProteinG,
            projectedAfterG: selection.projectedProteinAfterG,
            gapG: selection.proteinGapG,
            gapAfterG: selection.proteinGapAfterG,
          }
        : null,
    },
  };
}

/** One swap a client asks to apply (what it saw in a preview). */
export interface RequestedSwap {
  dayOfWeek: number;
  mealType: string;
  slotIndex?: number | undefined;
  previousRecipeId: string;
  newRecipeId: string;
}

/**
 * UX-PLAN-09: applies the swaps the user accepted in a preview. The server
 * trusts nothing it was sent beyond "which swaps": each one is applied only
 * if the slot still holds `previousRecipeId`, is on a future day of the
 * current week, is not "Your pick", and `newRecipeId` is one of the user's
 * safety-filtered curated alternatives for that meal type. Anything else is
 * skipped (a stale preview must not rewrite a week the user has since
 * changed). Returns the same shape as `rebalanceWeek`, so undo is unchanged.
 */
export async function applyRebalanceSwaps(
  userId: string,
  planId: string,
  requested: readonly RequestedSwap[],
  opts: RebalanceOptions = {},
): Promise<RebalanceResult> {
  const noop: RebalanceResult = { rebalanced: false, swaps: [], projectedDeviation: 0 };
  const evaluation = await evaluateWeek(userId, planId, { ...opts, proteinTrigger: true });
  if (!evaluation) return noop;

  const applied: RebalanceSwap[] = [];
  const claimed = new Set<string>();
  for (const req of requested) {
    // The slot's CURRENT state, from the plan as just read.
    const slot = evaluation.futureSlots.find(
      (s) =>
        s.dayOfWeek === req.dayOfWeek &&
        s.mealType === req.mealType &&
        (req.slotIndex === undefined || s.slotIndex === req.slotIndex),
    );
    if (!slot || slot.locked || slot.recipeId !== req.previousRecipeId) continue;
    const key = `${slot.dayOfWeek}:${slot.slotIndex}`;
    if (claimed.has(key)) continue;
    const candidate = (evaluation.pools[req.mealType as MealType] ?? []).find(
      (r) => r.id === req.newRecipeId,
    );
    if (!candidate || candidate.id === slot.recipeId) continue;
    claimed.add(key);
    const swap: RebalanceSwap = {
      dayOfWeek: slot.dayOfWeek,
      mealType: slot.mealType,
      ...(slot.slotIndex !== undefined && { slotIndex: slot.slotIndex }),
      previousRecipeId: slot.recipeId,
      previousRecipeName: slot.recipeName,
      newRecipeId: candidate.id,
      newRecipeName: candidate.name,
      previousKcal: Math.round(slot.kcal),
      newKcal: Math.round(candidate.nutritionInfo.calories),
      ...(evaluation.proteinKnown && {
        previousProteinG: round1(slot.proteinG ?? 0),
        newProteinG: round1(candidate.nutritionInfo.protein),
      }),
    };
    swap.explanation = describeRebalanceSwap(swap);
    applied.push(swap);
  }

  if (applied.length === 0) {
    return { ...noop, projectedDeviation: evaluation.selection.projectedDeviation };
  }
  await writeSwaps(planId, applied);
  return {
    rebalanced: true,
    swaps: applied,
    projectedDeviation: evaluation.selection.projectedDeviation,
    planId,
  };
}
