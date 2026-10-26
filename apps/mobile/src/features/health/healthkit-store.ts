import { Linking } from 'react-native';
import type * as HealthKitModule from '@kingstinct/react-native-healthkit';
import Constants from 'expo-constants';
import type { HealthSyncType } from '@chefer/types';
import { healthKitActivityType, type WeightSample } from './health-model';
import { mealRecordId, workoutRecordId, type HealthStore } from './health-store';

// Apple Health (iOS, C2) through @kingstinct/react-native-healthkit (Nitro).
// Requiring it on a binary without the native module throws, which
// getHealthStore() turns into "no store".

type HealthKit = typeof HealthKitModule;
type QuantityTypeIdentifier = HealthKitModule.QuantityTypeIdentifier;
type QuantitySampleForSaving = HealthKitModule.QuantitySampleForSaving;
type SampleTypeIdentifierWriteable = HealthKitModule.SampleTypeIdentifierWriteable;

const READ: Partial<Record<HealthSyncType, QuantityTypeIdentifier>> = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  steps: 'HKQuantityTypeIdentifierStepCount',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
};
const SHARE: Partial<Record<HealthSyncType, SampleTypeIdentifierWriteable[]>> = {
  workouts: ['HKWorkoutTypeIdentifier'],
  nutrition: [
    'HKCorrelationTypeIdentifierFood',
    'HKQuantityTypeIdentifierDietaryEnergyConsumed',
    'HKQuantityTypeIdentifierDietaryProtein',
    'HKQuantityTypeIdentifierDietaryCarbohydrates',
    'HKQuantityTypeIdentifierDietaryFatTotal',
  ],
};

export function createHealthKitStore(): HealthStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
  const hk = require('@kingstinct/react-native-healthkit') as HealthKit;
  const ownBundle = Constants.expoConfig?.ios?.bundleIdentifier ?? null;
  const available = (): boolean => {
    try {
      return hk.isHealthDataAvailable();
    } catch {
      return false;
    }
  };

  return {
    platform: 'APPLE_HEALTH',

    isAvailable: () => Promise.resolve(available()),

    async requestAccess(types) {
      if (!available()) return [];
      const toRead = types.flatMap((t) => {
        const id = READ[t];
        return id ? [id] : [];
      });
      const toShare = types.flatMap((t) => SHARE[t] ?? []);
      await hk.requestAuthorization({ toRead, toShare });
      // Write grants are knowable; read grants never are (Apple's privacy rule).
      return types.filter((t) => {
        const share = SHARE[t];
        if (!share) return true;
        return share.every(
          (id) => hk.authorizationStatusFor(id) === hk.AuthorizationStatus.sharingAuthorized,
        );
      });
    },

    async readWeights(since) {
      if (!available()) return [];
      const samples = await hk.queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', {
        limit: -1,
        unit: 'kg',
        filter: { date: { startDate: since } },
      });
      return samples.map(
        (s): WeightSample => ({
          id: s.uuid,
          weightKg: s.quantity,
          at: new Date(s.startDate),
          fromChefer: ownBundle !== null && s.sourceRevision.source.bundleIdentifier === ownBundle,
        }),
      );
    },

    async readTodayActivity(dayStart) {
      if (!available()) return { steps: null, activeKcal: null };
      const filter = { date: { startDate: dayStart, endDate: new Date() } };
      const [steps, energy] = await Promise.allSettled([
        hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
          filter,
          unit: 'count',
        }),
        hk.queryStatisticsForQuantity(
          'HKQuantityTypeIdentifierActiveEnergyBurned',
          ['cumulativeSum'],
          { filter, unit: 'kcal' },
        ),
      ]);
      const sum = (r: typeof steps) =>
        r.status === 'fulfilled' && r.value.sumQuantity
          ? Math.round(r.value.sumQuantity.quantity)
          : null;
      return { steps: sum(steps), activeKcal: sum(energy) };
    },

    async writeWorkout(w) {
      if (!available()) return;
      // A sync identifier + a higher version makes HealthKit replace, never duplicate.
      await hk.saveWorkoutSample(healthKitActivityType(w.type), [], w.start, w.end, undefined, {
        HKMetadataKeySyncIdentifier: workoutRecordId(w.id),
        HKMetadataKeySyncVersion: Date.now(),
      });
    },

    async writeMeals(meals) {
      if (meals.length === 0 || !available()) return;
      const version = Date.now();
      for (const m of meals) {
        const part = (
          quantityType: QuantityTypeIdentifier,
          quantity: number,
          unit: string,
        ): QuantitySampleForSaving => ({
          quantityType,
          quantity,
          unit,
          startDate: m.start,
          endDate: m.end,
        });
        await hk.saveCorrelationSample(
          'HKCorrelationTypeIdentifierFood',
          [
            part('HKQuantityTypeIdentifierDietaryEnergyConsumed', m.kcal, 'kcal'),
            part('HKQuantityTypeIdentifierDietaryProtein', m.proteinG, 'g'),
            part('HKQuantityTypeIdentifierDietaryCarbohydrates', m.carbsG, 'g'),
            part('HKQuantityTypeIdentifierDietaryFatTotal', m.fatG, 'g'),
          ],
          m.start,
          m.end,
          {
            HKMetadataKeyFoodType: m.name,
            HKMetadataKeySyncIdentifier: mealRecordId(m.entryId),
            HKMetadataKeySyncVersion: version,
          },
        );
      }
    },

    async deleteMeals(entryIds) {
      if (entryIds.length === 0 || !available()) return;
      for (const id of entryIds) {
        await hk.deleteObjects('HKCorrelationTypeIdentifierFood', {
          metadata: { withMetadataKey: 'HKMetadataKeySyncIdentifier', value: mealRecordId(id) },
        });
      }
    },

    // Health app › Sharing › Apps › Chefer is where read and write access live; iOS has no deeper link.
    openSettings: () => Linking.openURL('x-apple-health://'),
  };
}
