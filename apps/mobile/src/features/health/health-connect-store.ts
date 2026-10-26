import type * as HealthConnectModule from 'react-native-health-connect';
import Constants from 'expo-constants';
import type { HealthSyncType } from '@chefer/types';
import { healthConnectExerciseType, type HealthMealType, type WeightSample } from './health-model';
import { mealRecordId, workoutRecordId, type HealthStore } from './health-store';

// Health Connect (Android, C2). `react-native-health-connect` is a native
// module: requiring it on a binary without it throws, which getHealthStore()
// turns into "no store".

type HealthConnect = typeof HealthConnectModule;
type Permission = Parameters<HealthConnect['requestPermission']>[0][number];

const PERMISSIONS: Record<HealthSyncType, { accessType: 'read' | 'write'; recordType: string }> = {
  weight: { accessType: 'read', recordType: 'Weight' },
  steps: { accessType: 'read', recordType: 'Steps' },
  activeEnergy: { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  workouts: { accessType: 'write', recordType: 'ExerciseSession' },
  nutrition: { accessType: 'write', recordType: 'Nutrition' },
};

/** Health Connect's `MealType` constants. */
const HC_MEAL: Record<HealthMealType, number> = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 };

export function createHealthConnectStore(): HealthStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
  const hc = require('react-native-health-connect') as HealthConnect;
  const ownPackage = Constants.expoConfig?.android?.package ?? null;
  let initialised: Promise<boolean> | null = null;

  const ready = (): Promise<boolean> => {
    initialised ??= (async () => {
      const status = await hc.getSdkStatus();
      if (status !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      return hc.initialize();
    })().catch(() => false);
    return initialised;
  };

  return {
    platform: 'HEALTH_CONNECT',

    isAvailable: ready,

    async requestAccess(types) {
      if (!(await ready())) return [];
      const asked = types.map((t) => PERMISSIONS[t] as Permission);
      const granted = await hc.requestPermission(asked);
      const has = (p: { accessType: string; recordType: string }) =>
        granted.some(
          (g) =>
            'recordType' in g && g.accessType === p.accessType && g.recordType === p.recordType,
        );
      return types.filter((t) => has(PERMISSIONS[t]));
    },

    async readWeights(since) {
      if (!(await ready())) return [];
      const samples: WeightSample[] = [];
      let pageToken: string | undefined;
      do {
        const page = await hc.readRecords('Weight', {
          timeRangeFilter: { operator: 'after', startTime: since.toISOString() },
          pageSize: 500,
          ...(pageToken ? { pageToken } : {}),
        });
        for (const r of page.records) {
          samples.push({
            id: r.metadata?.id ?? `${r.time}-${r.weight.inKilograms}`,
            weightKg: r.weight.inKilograms,
            at: new Date(r.time),
            fromChefer: ownPackage !== null && r.metadata?.dataOrigin === ownPackage,
          });
        }
        // The last page answers with an empty token.
        pageToken = page.pageToken === '' ? undefined : page.pageToken;
      } while (pageToken);
      return samples;
    },

    async readTodayActivity(dayStart) {
      if (!(await ready())) return { steps: null, activeKcal: null };
      const timeRangeFilter = {
        operator: 'between' as const,
        startTime: dayStart.toISOString(),
        endTime: new Date().toISOString(),
      };
      const [steps, energy] = await Promise.allSettled([
        hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter }),
        hc.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }),
      ]);
      return {
        steps: steps.status === 'fulfilled' ? steps.value.COUNT_TOTAL : null,
        activeKcal:
          energy.status === 'fulfilled'
            ? Math.round(energy.value.ACTIVE_CALORIES_TOTAL.inKilocalories)
            : null,
      };
    },

    async writeWorkout(w) {
      if (!(await ready())) return;
      await hc.insertRecords([
        {
          recordType: 'ExerciseSession',
          startTime: w.start.toISOString(),
          endTime: w.end.toISOString(),
          exerciseType: healthConnectExerciseType(w.type),
          title: w.title,
          // Same client id + a higher version = Health Connect updates, never duplicates.
          metadata: { clientRecordId: workoutRecordId(w.id), clientRecordVersion: Date.now() },
        },
      ]);
    },

    async writeMeals(meals) {
      if (meals.length === 0 || !(await ready())) return;
      const version = Date.now();
      await hc.insertRecords(
        meals.map((m) => ({
          recordType: 'Nutrition' as const,
          startTime: m.start.toISOString(),
          endTime: m.end.toISOString(),
          name: m.name,
          mealType: HC_MEAL[m.mealType],
          energy: { value: m.kcal, unit: 'kilocalories' as const },
          protein: { value: m.proteinG, unit: 'grams' as const },
          totalCarbohydrate: { value: m.carbsG, unit: 'grams' as const },
          totalFat: { value: m.fatG, unit: 'grams' as const },
          metadata: { clientRecordId: mealRecordId(m.entryId), clientRecordVersion: version },
        })),
      );
    },

    async deleteMeals(entryIds) {
      if (entryIds.length === 0 || !(await ready())) return;
      await hc.deleteRecordsByUuids('Nutrition', [], entryIds.map(mealRecordId));
    },

    openSettings() {
      hc.openHealthConnectSettings();
      return Promise.resolve();
    },
  };
}
