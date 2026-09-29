import { AiCallType, prisma } from '@chefer/database';
import { startOfTodayUtc } from '../../lib/quotas.js';

// ─── Honest AI-usage counters (T-10.8, bug B-49; Q-18, Q-19) ───────────────────
// `profile.getAiUsage` reports what `lib/quotas.ts` actually reserved today —
// nothing more, nothing invented:
//   - A PREMIUM `mealPlan.generate` is ONE `MEAL_PLAN` reservation. Its instant
//     curated week (`instant: true`) is not a second, curated row.
//   - A FREE `generate`, and `planDay` on every tier, reserves `CURATED_PLAN`.
//     That is the free daily cap (3/day) — a real limit, but it costs no AI, so
//     it is reported apart and never added to the AI total.
//   - `mealPlan.resumeTailoring` reserves nothing (it finishes a generation the
//     user already paid for), so it never moves a counter.
//   - An import's AI cost is the PREVIEW (`reserveRecipeImport`, refunded when
//     the page can't be read). Saving is free. `importsSaved` says how many of
//     today's previews ended as a saved recipe; it is display-only.
// The window is the same UTC day the reservations use, so "used / limit"
// agrees with the server's own check.

export type AiCallCounts = Record<AiCallType, number>;

export interface AiUsageRow {
  callType: AiCallType;
  saved: boolean | null;
}

export interface AiUsageTally {
  today: AiCallCounts;
  /** Total AI calls (plan + swap + list + chat + vision + import). Curated plans are not AI. */
  geminiTotal: number;
  /** Premium AI plan generations — the `MEAL_PLAN` reservations. */
  aiMealPlans: number;
  /** Plans built from our recipes — the `CURATED_PLAN` reservations (the free daily cap). */
  curatedPlans: number;
  /** Today's import previews that were saved as a recipe. */
  importsSaved: number;
}

export function emptyCallCounts(): AiCallCounts {
  return {
    [AiCallType.MEAL_PLAN]: 0,
    [AiCallType.RECIPE_SWAP]: 0,
    [AiCallType.SHOPPING_LIST]: 0,
    [AiCallType.IMAGE_GENERATION]: 0,
    [AiCallType.INGREDIENT_PRICES]: 0,
    [AiCallType.CHAT]: 0,
    [AiCallType.SCAN]: 0,
    [AiCallType.RECIPE_IMPORT]: 0,
    [AiCallType.CURATED_PLAN]: 0,
  };
}

/** Pure: turns today's usage rows into the counters the client shows. */
export function tallyAiUsage(rows: readonly AiUsageRow[]): AiUsageTally {
  const today = emptyCallCounts();
  let importsSaved = 0;
  for (const row of rows) {
    today[row.callType]++;
    if (row.callType === AiCallType.RECIPE_IMPORT && row.saved === true) importsSaved++;
  }

  // The field keeps its old name for shipped clients; it counts whatever
  // provider serves the calls. CURATED_PLAN is deliberately absent.
  const geminiTotal =
    today[AiCallType.MEAL_PLAN] +
    today[AiCallType.RECIPE_SWAP] +
    today[AiCallType.SHOPPING_LIST] +
    today[AiCallType.CHAT] +
    today[AiCallType.SCAN] +
    today[AiCallType.RECIPE_IMPORT];

  return {
    today,
    geminiTotal,
    aiMealPlans: today[AiCallType.MEAL_PLAN],
    curatedPlans: today[AiCallType.CURATED_PLAN],
    importsSaved,
  };
}

export async function getTodayAiUsage(userId: string): Promise<AiUsageTally> {
  const rows = await prisma.aiCallLog.findMany({
    where: { userId, createdAt: { gte: startOfTodayUtc() } },
    select: { callType: true, saved: true },
  });
  return tallyAiUsage(rows);
}

/**
 * Marks the newest still-unsaved import preview of today as saved. Best
 * effort by design: a counter must never fail the save it describes.
 */
export async function markLatestImportSaved(userId: string): Promise<void> {
  try {
    const row = await prisma.aiCallLog.findFirst({
      where: {
        userId,
        callType: AiCallType.RECIPE_IMPORT,
        createdAt: { gte: startOfTodayUtc() },
        OR: [{ saved: null }, { saved: false }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (row) await prisma.aiCallLog.update({ where: { id: row.id }, data: { saved: true } });
  } catch (err) {
    console.error('[ai-usage] failed to mark import saved', err);
  }
}
