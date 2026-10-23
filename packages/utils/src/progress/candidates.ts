import type {
  PlanSlotMealType,
  PrKind,
  ProgressEventKind,
  ReceiptLine,
  ReceiptMeta,
} from '@chefer/types';
import { isFullDay, type SlotRef } from './full-day';
import { welcomeXp } from './levels';
import { XP } from './xp-table';

// ─── Candidates: what a source event could earn, before the daily soft cap ────
// A candidate is the pure description of one ledger row. The API dedupes by
// `candidateKey`, then scores each candidate against the day with `soft-cap`.

export type ProgressCandidate = {
  kind: ProgressEventKind;
  sourceId: string;
  localDate: string;
  lines: ReceiptLine[];
  meta: ReceiptMeta;
};

/** The ledger's idempotency key (`userId` is added by the repository). */
export function candidateKey(kind: ProgressEventKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function candidateXp(c: Pick<ProgressCandidate, 'lines'>): number {
  return c.lines.reduce((sum, line) => sum + line.xp, 0);
}

// ─── Meals ────────────────────────────────────────────────────────────────────

/**
 * `2026-10-22:dinner:2` (slot index, else recipe id) for a recipe entry,
 * `2026-10-22:custom:<entryId>` for a custom one. The date is part of the id:
 * the ledger key is unique per user, and "dinner slot 2" recurs every day.
 * `index` (the entry's position in the day) covers legacy custom entries that
 * were stored without an `entryId`.
 */
export function mealSourceId(entry: {
  date: string;
  mealType?: PlanSlotMealType;
  slotIndex?: number;
  recipeId?: string;
  entryId?: string;
  index?: number;
}): string {
  const ref = entry.slotIndex ?? entry.recipeId;
  if (entry.mealType && ref !== undefined) return `${entry.date}:${entry.mealType}:${ref}`;
  return `${entry.date}:custom:${entry.entryId ?? `#${entry.index ?? 0}`}`;
}

export function mealCandidate(input: {
  date: string;
  sourceId: string;
  mealType?: PlanSlotMealType;
  slotIndex?: number;
  recipeId?: string;
  onPlan: boolean;
}): ProgressCandidate {
  const lines: ReceiptLine[] = [{ code: 'LOGGED', xp: XP.LOGGED }];
  if (input.onPlan) lines.push({ code: 'ON_PLAN', xp: XP.ON_PLAN });
  const meta: ReceiptMeta = {};
  if (input.mealType !== undefined) meta.mealType = input.mealType;
  if (input.slotIndex !== undefined) meta.slotIndex = input.slotIndex;
  if (input.recipeId !== undefined) meta.recipeId = input.recipeId;
  return {
    kind: 'MEAL_LOGGED',
    sourceId: input.sourceId,
    localDate: input.date,
    lines,
    meta,
  };
}

/** Only 5 meals a day earn: keeps the first `5 − existing` candidates. */
export function limitMealsPerDay<T>(existingMealEventsThatDay: number, candidates: T[]): T[] {
  return candidates.slice(0, Math.max(0, XP.MEALS_PER_DAY - existingMealEventsThatDay));
}

const single = (
  kind: ProgressEventKind,
  sourceId: string,
  localDate: string,
  line: ReceiptLine,
  meta: ReceiptMeta = {},
): ProgressCandidate => ({ kind, sourceId, localDate, lines: [line], meta });

export const fullDayCandidate = (date: string): ProgressCandidate =>
  single('FULL_DAY', date, date, { code: 'FULL_DAY', xp: XP.FULL_DAY });

export const proteinCandidate = (date: string): ProgressCandidate =>
  single('PROTEIN_GOAL', date, date, { code: 'PROTEIN_GOAL', xp: XP.PROTEIN_GOAL });

// ─── Cook, gym, shopping, bonuses ─────────────────────────────────────────────

export function cookCandidate(input: {
  cookId: string;
  localDate: string;
  recipeId: string;
  recipeName: string;
  firstTime: boolean;
  /** Home-cooked count including this cook. */
  cookCount: number;
}): ProgressCandidate {
  const lines: ReceiptLine[] = [{ code: 'COOKED_AT_HOME', xp: XP.COOKED_AT_HOME }];
  if (input.firstTime) lines.push({ code: 'FIRST_TIME', xp: XP.FIRST_TIME });
  return {
    kind: 'COOK_FINISHED',
    sourceId: input.cookId,
    localDate: input.localDate,
    lines,
    meta: {
      recipeId: input.recipeId,
      recipeName: input.recipeName,
      cookCount: input.cookCount,
    },
  };
}

const PR_VALUE: Record<PrKind, number> = { e1rm: 3, weight: 2, reps: 1 };
const PR_CODE = { e1rm: 'PR_E1RM', weight: 'PR_WEIGHT', reps: 'PR_REPS' } as const;

/**
 * A finished session: `WORKOUT_COMPLETED`, plus `WORKOUT_PRS` when there are
 * PRs. Only the best 3 PRs earn (e1RM > weight > reps; ties keep input order),
 * `meta.prCount` is how many PRs the session set in all.
 */
export function workoutCandidates(input: {
  sessionId: string;
  localDate: string;
  prs: { kind: PrKind; exerciseName: string }[];
}): ProgressCandidate[] {
  const out: ProgressCandidate[] = [
    single('WORKOUT_COMPLETED', input.sessionId, input.localDate, {
      code: 'WORKOUT_DONE',
      xp: XP.WORKOUT_DONE,
    }),
  ];
  if (input.prs.length > 0) {
    const best = input.prs
      .map((pr, index) => ({ pr, index }))
      .sort((a, b) => PR_VALUE[b.pr.kind] - PR_VALUE[a.pr.kind] || a.index - b.index)
      .slice(0, XP.PRS_PER_SESSION);
    out.push({
      kind: 'WORKOUT_PRS',
      sourceId: input.sessionId,
      localDate: input.localDate,
      lines: best.map(({ pr }) => ({
        code: PR_CODE[pr.kind],
        xp: XP.PR[pr.kind],
        detail: pr.exerciseName.slice(0, 80),
      })),
      meta: { prCount: input.prs.length },
    });
  }
  return out;
}

export const shopDoneCandidate = (input: { planId: string; localDate: string }) =>
  single('SHOP_DONE', input.planId, input.localDate, { code: 'SHOP_DONE', xp: XP.SHOP_DONE });

export const todaysThreeCandidate = (date: string): ProgressCandidate =>
  single('TODAYS_THREE', date, date, { code: 'TODAYS_THREE', xp: XP.TODAYS_THREE });

export const weekGoalCandidate = (input: {
  weekStart: string;
  localDate: string;
}): ProgressCandidate =>
  single(
    'WEEK_GOAL',
    input.weekStart,
    input.localDate,
    { code: 'WEEK_GOAL', xp: XP.WEEK_GOAL },
    { weekStart: input.weekStart },
  );

export const welcomeCandidate = (localDate: string): ProgressCandidate =>
  single('WELCOME', '1', localDate, { code: 'WELCOME', xp: welcomeXp() });

// ─── One tracker day ──────────────────────────────────────────────────────────

export type DayFacts = {
  date: string;
  entries: {
    sourceId: string;
    mealType?: PlanSlotMealType;
    slotIndex?: number;
    recipeId?: string;
    onPlan: boolean;
  }[];
  planSlots: SlotRef[];
  /** Plan slots that are logged, replaced or skipped. */
  handledSlots: SlotRef[];
  /** Taken on purpose: the no-restriction test proves only `proteinG` can matter, and only upward. */
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  proteinTargetG: number | null;
};

/**
 * The meal, full-day and protein candidates of one tracker day. Meals are not
 * truncated here: the API dedupes by key first, then applies `limitMealsPerDay`.
 * The protein goal reads only `totals.proteinG`, and only upward; kcal, carbs
 * and fat are never read.
 */
export function dayCandidates(day: DayFacts): ProgressCandidate[] {
  const out: ProgressCandidate[] = day.entries.map((e) =>
    mealCandidate({
      date: day.date,
      sourceId: e.sourceId,
      ...(e.mealType !== undefined ? { mealType: e.mealType } : {}),
      ...(e.slotIndex !== undefined ? { slotIndex: e.slotIndex } : {}),
      ...(e.recipeId !== undefined ? { recipeId: e.recipeId } : {}),
      onPlan: e.onPlan,
    }),
  );
  if (
    isFullDay({
      planSlots: day.planSlots,
      handledSlots: day.handledSlots,
      loggedCount: day.entries.length,
    })
  ) {
    out.push(fullDayCandidate(day.date));
  }
  if (
    day.proteinTargetG !== null &&
    day.proteinTargetG > 0 &&
    day.totals.proteinG >= day.proteinTargetG
  ) {
    out.push(proteinCandidate(day.date));
  }
  return out;
}
