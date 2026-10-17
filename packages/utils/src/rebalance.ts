// ─── Week-rebalance undo hand-off (F4 Snap-to-Log, audit TRK-3) ───────────────
// A log (tracker save, quick add, photo scan, cook-mode "Made it!") can swap
// future meals to keep the week on target (free for everyone since WP-07: no AI). Nothing in the schema
// stores the swap pairs, so each client keeps them locally and undo replays
// the previous recipes through mealPlan.replaceRecipe. Pure helpers only —
// the storage itself is per-platform (localStorage on web, KV on mobile).

export interface RebalanceSwapLike {
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  mealType: string;
  /** The slot's index in `day.meals` (two-snack days); absent from older APIs. */
  slotIndex?: number | undefined;
  previousRecipeId: string;
  newRecipeId: string;
  previousRecipeName?: string | undefined;
  newRecipeName?: string | undefined;
  /**
   * WP-07 additive detail, filled by the API (older APIs and persisted
   * hand-offs lack it). Per-serving numbers of the old and new dish, so a
   * client can explain the swap without another call.
   */
  previousKcal?: number | undefined;
  newKcal?: number | undefined;
  previousProteinG?: number | undefined;
  newProteinG?: number | undefined;
  /** Why the swap was chosen: the week's calories, its protein, or both. */
  reason?: RebalanceReason | undefined;
  /** The API's own one-line explanation (describeRebalanceSwap). */
  explanation?: string | undefined;
}

export type RebalanceReason = 'calories' | 'protein' | 'both';

/** Structural mirror of the API's RebalanceResult (meal-plan/rebalance). */
export interface RebalanceResultLike {
  rebalanced: boolean;
  swaps: RebalanceSwapLike[];
  projectedDeviation: number;
  planId?: string | undefined;
}

export interface PendingRebalance {
  planId: string;
  swaps: RebalanceSwapLike[];
  createdAt: number; // epoch ms
}

/** A hand-off goes stale after a day — the week has moved on. */
export const REBALANCE_UNDO_EXPIRY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Thresholds shared by the API's swap selection and its tests (WP-07) ──────

/** A swap-driving protein gap: at least this many grams short for the week… */
export const REBALANCE_PROTEIN_TRIGGER_G = 30;
/** …and at least this fraction of the weekly protein target. */
export const REBALANCE_PROTEIN_TRIGGER_FRACTION = 0.02;
/** A swap must close at least this much of the protein gap to be offered. */
export const REBALANCE_MIN_PROTEIN_SWAP_G = 8;
/**
 * On a weight-loss goal a protein fix may add at most this share of ONE day's
 * calories in total (UX-PLAN-08: never "Bigger portions (+503 kcal)").
 */
export const LOSS_PROTEIN_KCAL_INCREASE_CAP = 0.1;

/** Goals that run a calorie deficit: protein fixes must stay calorie-tight. */
export function isLossGoal(goal: string | null | undefined): boolean {
  return goal === 'LOSE_WEIGHT';
}

/**
 * UX-PLAN-08 for the plan-miss sheets (mobile and web): the portion factor a
 * protein-gap fix may use. On a loss goal a factor above 1 is held to
 * +LOSS_PROTEIN_KCAL_INCREASE_CAP (10 %); everything else is unchanged.
 * `null` when the cap leaves nothing worth offering (< 3 % change).
 */
export function capProteinScaleFactor(
  factor: number,
  goal: string | null | undefined,
): number | null {
  const capped =
    isLossGoal(goal) && factor > 1 ? Math.min(factor, 1 + LOSS_PROTEIN_KCAL_INCREASE_CAP) : factor;
  const rounded = Math.round(capped * 100) / 100;
  return Math.abs(rounded - 1) < 0.03 ? null : rounded;
}

/** The mealType part of copy: "snack" slots keep their name. */
function slotLabel(swap: Pick<RebalanceSwapLike, 'dayOfWeek' | 'mealType'>): string {
  return `${DAY_NAMES[swap.dayOfWeek] ?? 'A coming day'} ${swap.mealType}`;
}

function signed(n: number, unit: string): string {
  const rounded = Math.round(n);
  return `${rounded > 0 ? '+' : '\u2212'}${Math.abs(rounded)} ${unit}`;
}

/**
 * ONE line for one swap (B-11), shared by mobile and web:
 * "Sunday dinner → Chicken bowl (+28 g protein)". The detail leads with what
 * the swap was chosen for (protein for a protein swap, calories for a
 * calorie swap) and drops a number that barely moves (< 5 g, < 50 kcal).
 * Falls back to the plain "Sunday dinner → Chicken bowl" when the API sent no
 * numbers (older API, persisted hand-off).
 */
export function describeRebalanceSwap(swap: RebalanceSwapLike): string {
  const label = slotLabel(swap);
  const name = swap.newRecipeName ?? 'a different dish';
  const protein =
    swap.previousProteinG !== undefined && swap.newProteinG !== undefined
      ? swap.newProteinG - swap.previousProteinG
      : null;
  const kcal =
    swap.previousKcal !== undefined && swap.newKcal !== undefined
      ? swap.newKcal - swap.previousKcal
      : null;
  const proteinPart =
    protein !== null && Math.abs(protein) >= 5 ? signed(protein, 'g protein') : null;
  const kcalPart = kcal !== null && Math.abs(kcal) >= 50 ? signed(kcal, 'kcal') : null;
  const parts = swap.reason === 'calories' ? [kcalPart, proteinPart] : [proteinPart, kcalPart];
  const detail = parts.filter((p): p is string => p !== null).join(', ');
  return detail ? `${label} \u2192 ${name} (${detail})` : `${label} \u2192 ${name}`;
}

export interface WeekGapLike {
  /** Projected week kcal minus the weekly target (+ over, − under). */
  kcalDelta?: number | undefined;
  /** Weekly protein still missing, grams (≥ 0). */
  proteinGapG?: number | undefined;
}

/**
 * The reason line above a preview: "You're about 600 kcal over for the week"
 * / "You're 36 g short on protein this week". Empty when there is nothing to
 * say. Numbers only when they matter (≥ 100 kcal, ≥ REBALANCE_MIN_PROTEIN_SWAP_G).
 */
export function describeWeekGap(gap: WeekGapLike): string {
  const parts: string[] = [];
  const kcal = gap.kcalDelta ?? 0;
  if (Math.abs(kcal) >= 100) {
    const rounded = Math.round(Math.abs(kcal) / 50) * 50;
    parts.push(`about ${rounded} kcal ${kcal > 0 ? 'over' : 'under'} for the week`);
  }
  const protein = gap.proteinGapG ?? 0;
  if (protein >= REBALANCE_MIN_PROTEIN_SWAP_G) {
    parts.push(`${Math.round(protein)} g short on protein this week`);
  }
  if (parts.length === 0) return '';
  return `You're ${parts.join(' and ')}.`;
}

/** A protein snack the API offers instead of (or besides) a swap. */
export interface RebalanceSnackLike {
  id: string;
  name: string;
  proteinG: number;
  kcal: number;
}

/** "Greek yogurt with honey (+17 g protein, 150 kcal)". */
export function describeProteinSnack(snack: RebalanceSnackLike): string {
  return `${snack.name} (+${Math.round(snack.proteinG)} g protein, ${Math.round(snack.kcal)} kcal)`;
}

/** What `mealPlan.previewRebalance` (and a log's `rebalancePreview`) returns. */
export interface RebalancePreviewLike {
  planId: string;
  swaps: RebalanceSwapLike[];
  /** "You're 36 g short on protein this week." (server-rendered describeWeekGap). */
  headline: string;
  snacks: RebalanceSnackLike[];
}

/** The offer line: "I can rebalance the rest of your week: Sunday dinner → X (+28 g protein)." */
export function rebalanceOfferCopy(preview: Pick<RebalancePreviewLike, 'swaps'>): string {
  const lines = preview.swaps.map((s) => s.explanation ?? describeRebalanceSwap(s));
  if (lines.length === 0) return '';
  return `I can rebalance the rest of your week: ${lines.join('; ')}.`;
}

/** "I adjusted Thursday dinner to keep your week on track" (+ "and Friday lunch"). */
export function rebalanceBannerCopy(swaps: RebalanceSwapLike[]): string {
  const parts = swaps.map((s) => `${DAY_NAMES[s.dayOfWeek] ?? 'a coming day'} ${s.mealType}`);
  if (parts.length === 0) return '';
  const lastPart = parts[parts.length - 1] ?? '';
  const joined = parts.length === 1 ? lastPart : `${parts.slice(0, -1).join(', ')} and ${lastPart}`;
  return `I adjusted ${joined} to keep your week on track.`;
}

/**
 * The mealPlan.replaceRecipe calls that restore the pre-rebalance plan —
 * one per swap, each putting previousRecipeId back into its slot.
 */
export function undoOperations(pending: PendingRebalance): {
  planId: string;
  dayOfWeek: number;
  mealType: string;
  slotIndex?: number;
  recipeId: string;
}[] {
  return pending.swaps.map((swap) => ({
    planId: pending.planId,
    dayOfWeek: swap.dayOfWeek,
    mealType: swap.mealType,
    ...(swap.slotIndex !== undefined && { slotIndex: swap.slotIndex }),
    recipeId: swap.previousRecipeId,
  }));
}

/** Whether a stored hand-off is still worth showing. */
export function isPendingFresh(pending: PendingRebalance, now: number = Date.now()): boolean {
  return pending.swaps.length > 0 && now - pending.createdAt < REBALANCE_UNDO_EXPIRY_MS;
}

/**
 * Folds a fresh rebalance result into whatever is already pending, so a
 * second rebalance never destroys the first one's undo (audit F-TRK-3-2).
 *
 * - No-op result (not rebalanced, no plan, no swaps) → the existing pending.
 * - Different plan, or the existing one is stale → the new swaps replace it.
 * - Same plan → one entry per slot (day + meal type + slot index, so the
 *   two snacks of a curated day stay apart). A slot swapped twice
 *   keeps its ORIGINAL previous recipe (undo restores what the user planned)
 *   and the latest new one; a slot swapped back to its original drops out.
 */
export function mergePendingRebalance(
  existing: PendingRebalance | null,
  result: RebalanceResultLike | null | undefined,
  now: number = Date.now(),
): PendingRebalance | null {
  if (!result?.rebalanced || !result.planId || result.swaps.length === 0) {
    return existing;
  }
  const sameLivePlan =
    existing !== null && existing.planId === result.planId && isPendingFresh(existing, now);
  const base = sameLivePlan ? existing.swaps : [];

  const slotKey = (s: RebalanceSwapLike) => `${s.dayOfWeek}:${s.mealType}:${s.slotIndex ?? ''}`;
  const bySlot = new Map<string, RebalanceSwapLike>();
  for (const swap of base) bySlot.set(slotKey(swap), swap);
  for (const swap of result.swaps) {
    const key = slotKey(swap);
    const earlier = bySlot.get(key);
    if (!earlier) {
      bySlot.set(key, swap);
      continue;
    }
    const merged: RebalanceSwapLike = {
      ...swap,
      previousRecipeId: earlier.previousRecipeId,
      previousRecipeName: earlier.previousRecipeName,
    };
    if (merged.previousRecipeId === merged.newRecipeId) {
      bySlot.delete(key);
    } else {
      bySlot.set(key, merged);
    }
  }

  const swaps = [...bySlot.values()];
  if (swaps.length === 0) return null;
  return { planId: result.planId, swaps, createdAt: now };
}

/** Parses a stored hand-off; null when missing, malformed or stale. */
export function parsePendingRebalance(
  raw: unknown,
  now: number = Date.now(),
): PendingRebalance | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<PendingRebalance>;
  if (
    typeof value.planId !== 'string' ||
    !value.planId ||
    !Array.isArray(value.swaps) ||
    typeof value.createdAt !== 'number'
  ) {
    return null;
  }
  const pending: PendingRebalance = {
    planId: value.planId,
    swaps: value.swaps,
    createdAt: value.createdAt,
  };
  return isPendingFresh(pending, now) ? pending : null;
}
