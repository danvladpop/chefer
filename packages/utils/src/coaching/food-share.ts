// ─── Trainer coaching: what a trainer sees of a client's food and weight (lane K) ──
// Pure rules shared by the API (which shapes the DTOs) and both apps. The
// numbers follow the client's own numbers mode: a client who hides calories,
// or every number, never has them shown to their trainer either.

import {
  COACHING_DATA_COPY,
  COACHING_DATA_LIMITS,
  type ClientFoodDayDto,
  type ClientFoodEntryDto,
  type ClientWeekFoodDto,
  type ClientWeekSummaryDto,
  type ClientWeekWeightDto,
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

/**
 * The weekly card's food part from the 7 day rows (`ClientWeekFoodDto`).
 * Averages are over the LOGGED days (an unlogged day is unknown, not zero);
 * targets are averaged over all 7.
 */
export function summarizeFoodWeek(
  days: readonly ClientFoodDayDto[],
  numbers: TrainerNumbersView,
): ClientWeekFoodDto {
  const logged = days.filter((d) => d.mealsLogged > 0);
  const avg = (values: (number | null)[]) => {
    const known = values.filter((v): v is number => v !== null);
    return known.length === 0 ? null : Math.round(known.reduce((a, b) => a + b, 0) / known.length);
  };
  return {
    numbers,
    daysLogged: logged.length,
    mealsLogged: days.reduce((sum, d) => sum + d.mealsLogged, 0),
    avgKcal: avg(logged.map((d) => d.kcal)),
    avgProteinG: avg(logged.map((d) => d.proteinG)),
    targetKcal: avg(days.map((d) => d.targetKcal)),
    targetProteinG: avg(days.map((d) => d.targetProteinG)),
    planAdherence: planAdherence(days),
  };
}

/**
 * The weekly card's weight part: the latest weigh-in, and its change since the
 * last weigh-in on or before `since` (7 days ago). Entries oldest first.
 */
export function weekWeight(
  entries: readonly ClientWeightEntryDto[],
  since: string,
): ClientWeekWeightDto {
  const latest = entries.at(-1) ?? null;
  const before = [...entries].reverse().find((e) => e.date <= since) ?? null;
  return {
    latest,
    changeKg:
      latest && before && before.date !== latest.date
        ? Math.round((latest.weightKg - before.weightKg) * 10) / 10
        : null,
  };
}

/** The weekly card as plain lines, so web and mobile read the same (`COACHING_DATA_COPY.week`). */
export interface WeekSummaryLines {
  workouts: string;
  /** Null when food is not shared. */
  food: string[] | null;
  /** Null when weight is not shared. */
  weight: string[] | null;
  /** Shown when neither is shared. */
  notShared: { title: string; hint: string } | null;
}

export function weekSummaryLines(
  summary: ClientWeekSummaryDto,
  client: string,
  format: {
    weightKg: (kg: number, signed?: boolean) => string;
    date: (localDate: string) => string;
  },
): WeekSummaryLines {
  const copy = COACHING_DATA_COPY.week;
  const n = (v: number) => v.toLocaleString('en-GB');
  let food: string[] | null = null;
  if (summary.food) {
    const f = summary.food;
    food = [copy.daysLogged(f.daysLogged)];
    if (f.numbers === 'NONE') food.push(copy.numbersHidden(client));
    if (f.avgKcal !== null) {
      food.push(copy.avgKcal(n(f.avgKcal), f.targetKcal !== null ? n(f.targetKcal) : null));
    } else if (f.numbers === 'PROTEIN_ONLY') {
      food.push(copy.caloriesHidden(client));
    }
    if (f.avgProteinG !== null) {
      food.push(
        copy.avgProtein(n(f.avgProteinG), f.targetProteinG !== null ? n(f.targetProteinG) : null),
      );
    }
    food.push(
      f.planAdherence !== null ? copy.plan(Math.round(f.planAdherence * 100)) : copy.noPlan,
    );
  }
  let weight: string[] | null = null;
  if (summary.weight) {
    const w = summary.weight;
    weight = w.latest
      ? [
          copy.weightLatest(format.weightKg(w.latest.weightKg), format.date(w.latest.date)),
          ...(w.changeKg === null
            ? []
            : Math.abs(w.changeKg) < 0.05
              ? [copy.weightSteady]
              : [copy.weightChange(format.weightKg(w.changeKg, true).replace('-', '−'))]),
        ]
      : [copy.noWeighIn];
  }
  return {
    workouts: copy.workouts(summary.workouts.done, summary.workouts.goal),
    food,
    weight,
    notShared:
      !summary.sharing.food && !summary.sharing.weight
        ? { title: copy.notShared(client), hint: copy.notSharedHint }
        : null,
  };
}

/** One Food-tab day as parts ("3 meals", "1,850 / 2,000 kcal", "110 / 125 g protein", "2 of 3 planned"). */
export function foodDayParts(day: ClientFoodDayDto): string[] {
  const copy = COACHING_DATA_COPY.food;
  if (day.mealsLogged === 0) return [copy.nothingLogged];
  return [
    copy.meals(day.mealsLogged),
    ...(day.kcal !== null ? [copy.kcal(day.kcal, day.targetKcal)] : []),
    ...(day.proteinG !== null ? [copy.protein(day.proteinG, day.targetProteinG)] : []),
    ...(day.plan ? [copy.plan(day.plan.eaten, day.plan.planned)] : []),
  ];
}
