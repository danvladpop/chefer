// ─── Cardio catalogue data (T-42.1, 06 §6) ───────────────────────────────────
// MET ranges, default metrics and quick-log presets for the 12 W2 cardio
// entries (+ the 8 WP-20 quick-log activities) in exercise-catalog.ts. Kept separate from ExerciseCatalogEntry
// (structural/engine fields) because none of this drives the strength
// engine — it's read only by the cardio entry UI (T-42.3) and the calorie
// estimate (T-42.10, W5, behind cardioCaloriesOnSummary). MET values are
// general ranges from the 2024 Adult Compendium of Physical Activities
// (06 §6) — verify per-activity before any calorie feature ships.

export type CardioMetric = 'time' | 'distance' | 'incline' | 'resistance' | 'pace';

export interface CardioCatalogEntry {
  exerciseId: string;
  metLow: number;
  metHigh: number;
  /** Which optional fields the minimal entry UI shows, in display order. */
  metrics: readonly CardioMetric[];
  /**
   * Quick-fill duration chips, minutes (06 §5.5/UX-42: "10 15 20 30 45 60").
   * Every W2 entry uses the same set; kept per-entry so a future one (a
   * sport with a fixed match length, say) can override it.
   */
  durationChipsMin: readonly number[];
  /** True only for the rower — distance is logged/displayed in metres, never km/mi. */
  distanceInMetres: boolean;
}

const STANDARD_DURATION_CHIPS_MIN = [10, 15, 20, 30, 45, 60] as const;

function entry(
  exerciseId: string,
  metLow: number,
  metHigh: number,
  metrics: readonly CardioMetric[],
  opts: Partial<Pick<CardioCatalogEntry, 'distanceInMetres' | 'durationChipsMin'>> = {},
): CardioCatalogEntry {
  return {
    exerciseId,
    metLow,
    metHigh,
    metrics,
    durationChipsMin: opts.durationChipsMin ?? STANDARD_DURATION_CHIPS_MIN,
    distanceInMetres: opts.distanceInMetres ?? false,
  };
}

export const CARDIO_CATALOG: readonly CardioCatalogEntry[] = [
  entry('treadmill-walk', 2.8, 4.3, ['time', 'distance', 'incline']),
  entry('treadmill-incline-walk', 5, 9, ['time', 'distance', 'incline']),
  entry('treadmill-run', 8, 13, ['time', 'distance', 'pace']),
  entry('outdoor-walk', 2.8, 4.3, ['time', 'distance']),
  entry('outdoor-run', 6, 13, ['time', 'distance', 'pace']),
  entry('outdoor-cycle', 4, 10, ['time', 'distance', 'pace']),
  entry('stationary-bike-upright', 5, 8.5, ['time', 'distance', 'resistance']),
  entry('stationary-bike-recumbent', 3.5, 7, ['time', 'distance', 'resistance']),
  entry('spin-class', 6, 10, ['time', 'resistance']),
  entry('elliptical', 5, 9, ['time', 'distance', 'resistance']),
  // Rowing machine distance is conventionally metres (500 m splits), not km/mi.
  entry('rowing-machine', 5, 8.5, ['time', 'distance', 'pace'], { distanceInMetres: true }),
  entry('stair-climber', 8, 11, ['time', 'resistance']),
  // WP-20 quick-log activities (activity-log.ts): time only — the duration the
  // user types, plus an optional kcal/effort on the one set. MET ranges are the
  // same Compendium-style estimates as above; nothing reads them for a calorie
  // number (a quick-log's kcal is whatever the watch/machine said).
  entry('pilates-class', 3, 4, ['time']),
  entry('yoga-class', 2.5, 4, ['time']),
  entry('hiit-class', 6, 10, ['time']),
  entry('dance-class', 4.5, 7.5, ['time']),
  entry('swimming', 5.8, 9.8, ['time']),
  entry('running', 8, 12, ['time']),
  entry('walking', 2.8, 4.3, ['time']),
  entry('other-activity', 3, 8, ['time']),
];

export const CARDIO_CATALOG_BY_ID: ReadonlyMap<string, CardioCatalogEntry> = new Map(
  CARDIO_CATALOG.map((e) => [e.exerciseId, e]),
);

/** The set of curated exercise ids this wave's `Cardio` chip offers (T-42.3). */
export const CARDIO_EXERCISE_IDS: ReadonlySet<string> = new Set(CARDIO_CATALOG_BY_ID.keys());
