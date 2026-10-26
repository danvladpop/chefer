import { Platform } from 'react-native';
import type { HealthPlatform, HealthSyncType } from '@chefer/types';
import type { HealthMeal, HealthWorkout, TodayActivity, WeightSample } from './health-model';

// The phone's health store (C2): Health Connect on Android, Apple Health on
// iOS, behind one interface. Both SDKs are native modules that only exist in
// binaries built after 1.0.2, so each store loads its library lazily inside a
// try/catch: on an older binary `getHealthStore()` resolves to null and the
// "Connect health" entry never shows.

export interface HealthStore {
  readonly platform: HealthPlatform;
  /** The store exists and is usable on this phone (Health Connect installed, HealthKit available). */
  isAvailable(): Promise<boolean>;
  /**
   * Shows the OS permission sheet for `types`; resolves with the types the
   * app may now use. (HealthKit never reveals read grants — a read type the
   * user saw counts as granted, and simply returns nothing if denied.)
   */
  requestAccess(types: readonly HealthSyncType[]): Promise<HealthSyncType[]>;
  /** Weigh-ins recorded after `since`, including Chefer's own (flagged). */
  readWeights(since: Date): Promise<WeightSample[]>;
  /** Steps and active energy from `dayStart` until now. */
  readTodayActivity(dayStart: Date): Promise<TodayActivity>;
  /** Writes (or updates) one finished workout. */
  writeWorkout(workout: HealthWorkout): Promise<void>;
  /** Writes (or updates) food entries, one record each. */
  writeMeals(meals: readonly HealthMeal[]): Promise<void>;
  /** Removes food entries Chefer wrote earlier, by entry id. */
  deleteMeals(entryIds: readonly string[]): Promise<void>;
  /** Opens the place where the user changes Chefer's access (Health Connect settings / the Health app). */
  openSettings(): Promise<void>;
}

/** Prefix of every record Chefer writes, so its own writes are recognisable and upserted. */
export const CHEFER_RECORD_PREFIX = 'chefer';
export const workoutRecordId = (id: string): string => `${CHEFER_RECORD_PREFIX}-workout-${id}`;
export const mealRecordId = (entryId: string): string => `${CHEFER_RECORD_PREFIX}-food-${entryId}`;

type HealthConnectStoreModule = typeof import('./health-connect-store');
type HealthKitStoreModule = typeof import('./healthkit-store');

let override: HealthStore | null | undefined;
let cached: HealthStore | null | undefined;

/** This platform's store, or null when the binary has no health SDK. */
export function getHealthStore(): HealthStore | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  try {
    if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: native module may be absent
      const mod = require('./health-connect-store') as HealthConnectStoreModule;
      cached = mod.createHealthConnectStore();
    } else if (Platform.OS === 'ios') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: native module may be absent
      const mod = require('./healthkit-store') as HealthKitStoreModule;
      cached = mod.createHealthKitStore();
    } else {
      cached = null;
    }
  } catch {
    cached = null;
  }
  return cached;
}

/** Test seam: a fake store, `null` for a binary without health SDKs, `undefined` to reset. */
export function setHealthStoreForTests(fake: HealthStore | null | undefined): void {
  override = fake;
  cached = undefined;
}
