import type { WorkoutType } from '@chefer/types';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN, localDateStr } from '@chefer/utils';

// Health sync (C2), the pure part: everything that decides WHAT is read from
// or written to the phone's health store, kept free of native calls so it is
// unit-tested. The stores (health-connect-store.ts, healthkit-store.ts) only
// translate these shapes into their SDK's records.

/** A weigh-in read from the health store, ready for `tracker.importWeights`. */
export interface ImportedWeight {
  externalId: string;
  weightKg: number;
  /** Local YYYY-MM-DD of the sample. */
  date: string;
}

/** A raw sample as a store reports it. */
export interface WeightSample {
  id: string;
  weightKg: number;
  at: Date;
  /** Written by Chefer itself (never re-imported). */
  fromChefer: boolean;
}

/** A finished Chefer workout to write. `id` doubles as the store's sync id (upsert). */
export interface HealthWorkout {
  id: string;
  type: WorkoutType | null;
  title: string;
  start: Date;
  end: Date;
}

export type HealthMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** One logged food entry to write. `entryId` is the store's sync id, so edits update and deletes remove. */
export interface HealthMeal {
  entryId: string;
  mealType: HealthMealType;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  start: Date;
  end: Date;
}

/** Steps and active energy for today (device only — never sent to the API). */
export interface TodayActivity {
  steps: number | null;
  activeKcal: number | null;
}

/** First import reaches this far back; later ones continue from the cursor. */
export const WEIGHT_LOOKBACK_DAYS = 90;
/** Matches HEALTH_WEIGHT_IMPORT_MAX on the API. */
export const WEIGHT_IMPORT_PAGE = 500;

/**
 * Samples → importable weigh-ins: our own writes, implausible values and
 * duplicate ids are dropped (the API rejects an out-of-range weight for the
 * whole page). Rounded to 0.01 kg.
 */
export function toImportedWeights(samples: readonly WeightSample[]): ImportedWeight[] {
  const seen = new Set<string>();
  const out: ImportedWeight[] = [];
  for (const s of samples) {
    if (s.fromChefer || seen.has(s.id)) continue;
    if (!(s.weightKg >= BODY_WEIGHT_KG_MIN && s.weightKg <= BODY_WEIGHT_KG_MAX)) continue;
    seen.add(s.id);
    out.push({
      externalId: s.id.slice(0, 200),
      weightKg: Math.round(s.weightKg * 100) / 100,
      date: localDateStr(s.at),
    });
  }
  return out;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Where the next weight import starts: the cursor, or the lookback window on the first run. */
export function weightImportSince(cursorIso: string | null, now: Date): Date {
  if (cursorIso) {
    const cursor = new Date(cursorIso);
    if (!Number.isNaN(cursor.getTime())) return cursor;
  }
  return new Date(now.getTime() - WEIGHT_LOOKBACK_DAYS * 86_400_000);
}

/** The newest sample time, to start the next import from. */
export function nextWeightCursor(
  samples: readonly WeightSample[],
  previousIso: string | null,
): string | null {
  let latest = previousIso ? new Date(previousIso).getTime() : Number.NEGATIVE_INFINITY;
  for (const s of samples) latest = Math.max(latest, s.at.getTime());
  return Number.isFinite(latest) ? new Date(latest).toISOString() : previousIso;
}

// ─── Nutrition ────────────────────────────────────────────────────────────────

/** Logged entries have no time of their own: each sits at its slot's usual hour (owner decision). */
const MEAL_SLOT_HOUR: Record<HealthMealType, number> = {
  breakfast: 8,
  lunch: 13,
  snack: 16,
  dinner: 19,
};
const MEAL_MINUTES = 30;

export function healthMealType(slot: string): HealthMealType {
  const s = slot.toLowerCase();
  return s === 'breakfast' || s === 'lunch' || s === 'dinner' ? s : 'snack';
}

/** The local time window an entry is written at, on `day` (YYYY-MM-DD). */
export function mealWindow(day: string, mealType: HealthMealType): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, MEAL_SLOT_HOUR[mealType], 0, 0, 0);
  return { start, end: new Date(start.getTime() + MEAL_MINUTES * 60_000) };
}

/** What one day's sync must do: write every entry (upsert by id) and remove what is gone. */
export function planNutritionSync(
  previousIds: readonly string[],
  meals: readonly HealthMeal[],
): { upsert: HealthMeal[]; remove: string[] } {
  const current = new Set(meals.map((m) => m.entryId));
  return { upsert: [...meals], remove: previousIds.filter((id) => !current.has(id)) };
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

/** Health Connect `ExerciseType` constants (react-native-health-connect). */
export const HC_EXERCISE = {
  OTHER_WORKOUT: 0,
  BIKING: 8,
  DANCING: 16,
  HIGH_INTENSITY_INTERVAL_TRAINING: 36,
  PILATES: 48,
  RUNNING: 56,
  STRENGTH_TRAINING: 70,
  SWIMMING_POOL: 74,
  WALKING: 79,
  YOGA: 83,
} as const;

export function healthConnectExerciseType(type: WorkoutType | null): number {
  switch (type) {
    case 'RUNNING':
      return HC_EXERCISE.RUNNING;
    case 'WALKING':
      return HC_EXERCISE.WALKING;
    case 'CYCLING':
    case 'SPIN':
      return HC_EXERCISE.BIKING;
    case 'SWIMMING':
      return HC_EXERCISE.SWIMMING_POOL;
    case 'YOGA':
      return HC_EXERCISE.YOGA;
    case 'PILATES':
      return HC_EXERCISE.PILATES;
    case 'HIIT':
      return HC_EXERCISE.HIGH_INTENSITY_INTERVAL_TRAINING;
    case 'DANCE':
      return HC_EXERCISE.DANCING;
    case 'CARDIO_MACHINES':
    case 'OTHER_CLASS':
    case 'OTHER':
      return HC_EXERCISE.OTHER_WORKOUT;
    default:
      // Strength focuses and a routine day with no type: Chefer's default is lifting.
      return HC_EXERCISE.STRENGTH_TRAINING;
  }
}

/** HealthKit `HKWorkoutActivityType` raw values (@kingstinct/react-native-healthkit). */
export const HK_ACTIVITY = {
  cycling: 13,
  running: 37,
  swimming: 46,
  traditionalStrengthTraining: 50,
  walking: 52,
  yoga: 57,
  highIntensityIntervalTraining: 63,
  pilates: 66,
  mixedCardio: 73,
  cardioDance: 77,
  other: 3000,
} as const;

export function healthKitActivityType(type: WorkoutType | null): number {
  switch (type) {
    case 'RUNNING':
      return HK_ACTIVITY.running;
    case 'WALKING':
      return HK_ACTIVITY.walking;
    case 'CYCLING':
    case 'SPIN':
      return HK_ACTIVITY.cycling;
    case 'SWIMMING':
      return HK_ACTIVITY.swimming;
    case 'YOGA':
      return HK_ACTIVITY.yoga;
    case 'PILATES':
      return HK_ACTIVITY.pilates;
    case 'HIIT':
      return HK_ACTIVITY.highIntensityIntervalTraining;
    case 'DANCE':
      return HK_ACTIVITY.cardioDance;
    case 'CARDIO_MACHINES':
      return HK_ACTIVITY.mixedCardio;
    case 'OTHER_CLASS':
    case 'OTHER':
      return HK_ACTIVITY.other;
    default:
      return HK_ACTIVITY.traditionalStrengthTraining;
  }
}

// ─── Today's activity ─────────────────────────────────────────────────────────

/** "6,240 steps · 312 kcal active"; null when there is nothing to show. */
export function todayActivityLabel(activity: TodayActivity): string | null {
  const parts: string[] = [];
  if (activity.steps !== null) {
    parts.push(`${activity.steps.toLocaleString('en-US')} step${activity.steps === 1 ? '' : 's'}`);
  }
  if (activity.activeKcal !== null)
    parts.push(`${activity.activeKcal.toLocaleString('en-US')} kcal active`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
