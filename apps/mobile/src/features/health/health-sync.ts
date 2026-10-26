import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import {
  healthPlatformSchema,
  healthSyncTypeSchema,
  type HealthPlatform,
  type HealthSyncType,
  type WorkoutSessionDoc,
} from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { kv } from '../gym/offline/kv';
import {
  chunk,
  healthMealType,
  mealWindow,
  nextWeightCursor,
  planNutritionSync,
  toImportedWeights,
  WEIGHT_IMPORT_PAGE,
  weightImportSince,
  type HealthMeal,
  type ImportedWeight,
} from './health-model';
import { getHealthStore, type HealthStore } from './health-store';

// Health sync (C2), what runs: the per-account settings (which types are on,
// the weight cursor, which food entries were written per day) and the three
// sync jobs. Kept in the KV store under a non-gym key, so sign-out wipes it
// (clearLocalUserData) and the next account starts with health sync off.

const SETTINGS_KEY = 'health.sync';
/** How long the ids written for a day are remembered (to remove a deleted entry). */
const WRITTEN_MEALS_DAYS = 31;

export interface HealthSyncSettings {
  platform: HealthPlatform;
  types: HealthSyncType[];
  /** ISO time of the newest weigh-in already read. */
  weightCursor: string | null;
  /** Food entry ids written to the store, per local day (to remove deleted ones). */
  writtenMeals: Record<string, string[]>;
}

const listeners = new Set<() => void>();
let snapshot: { raw: string | null; value: HealthSyncSettings | null } = { raw: null, value: null };

/** The stored settings, or null while health sync was never set up on this account. */
export function readHealthSettings(): HealthSyncSettings | null {
  // Memoised on the stored string, so useSyncExternalStore gets a stable value
  // and a sign-out wipe (which removes the key behind our back) still reads null.
  const raw = kv.getString(SETTINGS_KEY);
  if (raw === snapshot.raw) return snapshot.value;
  snapshot = { raw, value: parseSettings(raw) };
  return snapshot.value;
}

// Parsed, not trusted: the stored JSON may come from an older build.
const storedSettingsSchema = z.object({
  platform: healthPlatformSchema,
  types: z
    .array(z.unknown())
    .catch([])
    .transform((types) =>
      types.flatMap((t) => {
        const parsed = healthSyncTypeSchema.safeParse(t);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  weightCursor: z.string().nullable().catch(null),
  writtenMeals: z.record(z.array(z.string())).catch({}),
});

function parseSettings(raw: string | null): HealthSyncSettings | null {
  if (raw === null) return null;
  try {
    const parsed = storedSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeHealthSettings(next: HealthSyncSettings): void {
  kv.setJSON(SETTINGS_KEY, next);
  for (const listener of listeners) listener();
}

export function subscribeHealthSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read of the stored settings. */
export function useHealthSettings(): HealthSyncSettings | null {
  return useSyncExternalStore(subscribeHealthSettings, readHealthSettings);
}

/** The settings with `type` switched on or off (a new account starts with nothing on). */
export function withHealthType(
  current: HealthSyncSettings | null,
  platform: HealthPlatform,
  type: HealthSyncType,
  on: boolean,
): HealthSyncSettings {
  const base = current ?? { platform, types: [], weightCursor: null, writtenMeals: {} };
  const others = base.types.filter((t) => t !== type);
  return { ...base, platform, types: on ? [...others, type] : others };
}

export function isHealthTypeOn(type: HealthSyncType): boolean {
  return readHealthSettings()?.types.includes(type) ?? false;
}

// ─── Weight in ────────────────────────────────────────────────────────────────

export type ImportWeights = (input: {
  source: HealthPlatform;
  entries: ImportedWeight[];
}) => Promise<{ imported: number; skipped: number }>;

/**
 * Reads weigh-ins since the cursor and imports them in pages; the API skips
 * samples it already has, so a retry after a failure never doubles one. The
 * cursor only moves once every page went through.
 */
export async function runWeightImport(
  store: HealthStore,
  importWeights: ImportWeights,
  now = new Date(),
): Promise<{ imported: number; skipped: number }> {
  const settings = readHealthSettings();
  if (!settings?.types.includes('weight')) return { imported: 0, skipped: 0 };
  const samples = await store.readWeights(weightImportSince(settings.weightCursor, now));
  let imported = 0;
  let skipped = 0;
  for (const page of chunk(toImportedWeights(samples), WEIGHT_IMPORT_PAGE)) {
    const result = await importWeights({ source: store.platform, entries: page });
    imported += result.imported;
    skipped += result.skipped;
  }
  const latest = readHealthSettings();
  if (latest)
    writeHealthSettings({
      ...latest,
      weightCursor: nextWeightCursor(samples, latest.weightCursor),
    });
  return { imported, skipped };
}

// ─── Workouts out ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget from finishWorkout / saveLoggedSession: the workout is
 * already safe in the outbox, so a health-store failure is only logged away.
 */
export function mirrorFinishedWorkout(doc: WorkoutSessionDoc): void {
  if (!isHealthTypeOn('workouts')) return;
  const store = getHealthStore();
  if (!store) return;
  syncFinishedWorkout(store, doc).catch(() => undefined);
}

/** Writes a finished workout (upsert by its id). No-op unless `workouts` is on. */
export async function syncFinishedWorkout(
  store: HealthStore,
  doc: WorkoutSessionDoc,
): Promise<void> {
  if (!isHealthTypeOn('workouts') || !doc.finishedAt) return;
  await store.writeWorkout({
    id: doc.id,
    type: doc.workoutType ?? null,
    title: doc.name,
    start: new Date(doc.startedAt),
    end: new Date(doc.finishedAt),
  });
}

// ─── Food out ─────────────────────────────────────────────────────────────────

/** The parts of a `tracker.getDay` result the food sync reads (a real day is passed in use-health-sync). */
export interface HealthDay {
  date: string;
  plannedMeals: readonly { recipeId: string; recipeName: string }[];
  offPlanLogged: readonly { recipeId: string; recipeName: string }[];
  log: {
    loggedMeals: readonly {
      entryId?: string | null | undefined;
      mealType: string;
      recipeId?: string | null | undefined;
      custom?: { name: string } | null | undefined;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
    }[];
  } | null;
}

/** A day's logged entries as health-store meals (entries without an id are skipped). */
export function mealsFromDay(day: HealthDay): HealthMeal[] {
  const names = new Map<string, string>();
  for (const m of day.plannedMeals) names.set(m.recipeId, m.recipeName);
  for (const m of day.offPlanLogged) names.set(m.recipeId, m.recipeName);
  return (day.log?.loggedMeals ?? []).flatMap((e): HealthMeal[] => {
    if (!e.entryId) return [];
    const mealType = healthMealType(e.mealType);
    const name = e.custom?.name ?? (e.recipeId ? names.get(e.recipeId) : undefined) ?? 'Meal';
    return [
      {
        entryId: e.entryId,
        mealType,
        name,
        kcal: Math.max(0, e.kcal),
        proteinG: Math.max(0, e.protein),
        carbsG: Math.max(0, e.carbs),
        fatG: Math.max(0, e.fat),
        ...mealWindow(day.date, mealType),
      },
    ];
  });
}

/** Mirrors one logged day into the store: upserts every entry, removes deleted ones. */
export async function syncNutritionDay(
  store: HealthStore,
  day: HealthDay,
  now = new Date(),
): Promise<void> {
  const settings = readHealthSettings();
  if (!settings?.types.includes('nutrition')) return;
  const meals = mealsFromDay(day);
  const plan = planNutritionSync(settings.writtenMeals[day.date] ?? [], meals);
  await store.writeMeals(plan.upsert);
  await store.deleteMeals(plan.remove);
  const latest = readHealthSettings();
  if (!latest) return;
  // Only recent days are ever re-synced; older bookkeeping is dropped.
  const oldest = localDateStr(new Date(now.getTime() - WRITTEN_MEALS_DAYS * 86_400_000));
  const writtenMeals = Object.fromEntries(
    Object.entries(latest.writtenMeals).filter(([date]) => date >= oldest),
  );
  writtenMeals[day.date] = meals.map((m) => m.entryId);
  writeHealthSettings({ ...latest, writtenMeals });
}
