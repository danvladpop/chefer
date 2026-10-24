// ─── Trainer coaching: what a trainer sees of a client's food and weight (lane K) ──
// Pure rules shared by the API (which shapes the DTOs) and both apps. The
// numbers follow the client's own numbers mode: a client who hides calories,
// or every number, never has them shown to their trainer either.

import {
  COACHING_DATA_LIMITS,
  type ClientFoodDayDto,
  type ClientFoodEntryDto,
  type ClientWeightEntryDto,
  type TrainerNumbersView,
} from '@chefer/types';
import { slotStates, type LoggedMealRef, type PlannedMealSlot, type SlotRef } from '../today';

/**
 * The client's stored numbers mode (`ChefProfile.numbersMode`) as the trainer's
 * view. Unknown / unset = FULL, like every client app. `NONE` hides every
 * number from the trainer already, even though the client apps render it as
 * FULL until the "hide numbers" mode ships (lane E3): the trainer side errs
 * on the private side.
 * TODO(lane E3): if E3 stores "hide numbers" anywhere other than
 * `numbersMode: 'NONE'`, read it here — this is the one place both apps and
 * the API decide it.
 */
export function trainerNumbersView(numbersMode: string | null | undefined): TrainerNumbersView {
  if (numbersMode === 'NONE') return 'NONE';
  if (numbersMode === 'PROTEIN_ONLY') return 'PROTEIN_ONLY';
  return 'FULL';
}

/** Calories are shown only in FULL; protein in FULL and PROTEIN_ONLY. */
export function showsKcal(view: TrainerNumbersView): boolean {
  return view === 'FULL';
}
export function showsProtein(view: TrainerNumbersView): boolean {
  return view !== 'NONE';
}

/** One logged entry as the food summary needs it (a `daily_logs.loggedMeals` row plus its name). */
export interface FoodLogEntryInput extends LoggedMealRef {
  name: string;
  kcal: number;
  protein: number;
}

export interface FoodDayInput {
  date: string;
  /** The day's planned slots (their `slotIndex` = the position in the plan day), or null without a plan. */
  planned: readonly PlannedMealSlot[] | null;
  logged: readonly FoodLogEntryInput[];
  skipped: readonly SlotRef[];
  /** The stored day totals (`DailyLog.totalKcal` / `totalProtein`), or null with no log row. */
  totals: { kcal: number; protein: number } | null;
  /** The day's targets as the client sees them (training-day bump included), or null when unknown. */
  target: { kcal: number; proteinG: number } | null;
}

const round = (n: number) => Math.round(n);

/** One day of a client's food log as the trainer sees it (`ClientFoodDayDto`). */
export function foodDaySummary(input: FoodDayInput, view: TrainerNumbersView): ClientFoodDayDto {
  const kcalShown = showsKcal(view);
  const proteinShown = showsProtein(view);
  const states = input.planned ? slotStates(input.planned, input.logged, input.skipped) : null;
  const onPlan = new Set((states ?? []).flatMap((s) => (s.status === 'eaten' ? [s.entry] : [])));
  const entries: ClientFoodEntryDto[] = input.logged
    .slice(0, COACHING_DATA_LIMITS.entriesPerDay)
    .map((entry) => ({
      name: entry.name,
      mealType: entry.mealType,
      kcal: kcalShown ? round(entry.kcal) : null,
      proteinG: proteinShown ? round(entry.protein) : null,
      onPlan: onPlan.has(entry),
    }));
  const logged = input.logged.length > 0;
  return {
    date: input.date,
    mealsLogged: input.logged.length,
    kcal: kcalShown && logged ? round(input.totals?.kcal ?? 0) : null,
    proteinG: proteinShown && logged ? round(input.totals?.protein ?? 0) : null,
    targetKcal: kcalShown && input.target ? round(input.target.kcal) : null,
    targetProteinG: proteinShown && input.target ? round(input.target.proteinG) : null,
    plan:
      states && states.length > 0
        ? {
            planned: states.length,
            eaten: states.filter((s) => s.status === 'eaten').length,
            swapped: states.filter((s) => s.status === 'replaced').length,
            skipped: states.filter((s) => s.status === 'skipped').length,
          }
        : null,
    entries,
  };
}

/**
 * Plan adherence over several days: planned meals eaten as planned ÷ planned
 * meals, 0–1. Null when nothing was planned on any of them.
 */
export function planAdherence(days: readonly Pick<ClientFoodDayDto, 'plan'>[]): number | null {
  const planned = days.reduce((sum, d) => sum + (d.plan?.planned ?? 0), 0);
  if (planned === 0) return null;
  return days.reduce((sum, d) => sum + (d.plan?.eaten ?? 0), 0) / planned;
}

/**
 * Weigh-ins as the trainer sees them: one per day (the day's last), oldest
 * first, from `fromDate` (inclusive). `recordedAt`'s UTC date is the day, the
 * same convention the client's own weight list uses.
 */
export function weighInsByDay(
  entries: readonly { recordedAt: Date; weightKg: number }[],
  fromDate: string,
): ClientWeightEntryDto[] {
  const byDay = new Map<string, { at: number; weightKg: number }>();
  for (const e of entries) {
    const date = e.recordedAt.toISOString().slice(0, 10);
    if (date < fromDate) continue;
    const at = e.recordedAt.getTime();
    const prev = byDay.get(date);
    if (!prev || at >= prev.at) byDay.set(date, { at, weightKg: e.weightKg });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, weightKg: Math.round(v.weightKg * 10) / 10 }));
}

/**
 * The `YYYY-MM-DD` a Prisma `@db.Date` column holds (e.g. `DailyLog.date`).
 * Such a value is the user's own calendar day, stored as UTC midnight, so its
 * UTC parts ARE the day. Never use it on "now": that is the server's day
 * (`scripts/check-utc-days.mjs`); take the client's `localDate` instead.
 */
export function dbDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
