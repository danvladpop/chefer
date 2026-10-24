import { z } from 'zod';

// Apple Health / Health Connect sync (C2, owner decisions 2026-10-23). The
// user turns each data type on separately; reads come into Chefer, writes go
// out to the phone's health store. Steps and active energy stay on the device
// (a Today line only): never sent to the API, never added to food targets.

/** The phone's health store. Also the `WeightEntry.source` of an imported weigh-in. */
export const healthPlatformSchema = z.enum(['APPLE_HEALTH', 'HEALTH_CONNECT']);
export type HealthPlatform = z.infer<typeof healthPlatformSchema>;

/** One switch on the "Connect health" screen. */
export const healthSyncTypeSchema = z.enum([
  /** Read: weigh-ins → WeightEntry (tracker.importWeights). */
  'weight',
  /** Read, on device only. */
  'steps',
  /** Read, on device only. */
  'activeEnergy',
  /** Write: finished Chefer workouts. */
  'workouts',
  /** Write: logged food, one record per entry. */
  'nutrition',
]);
export type HealthSyncType = z.infer<typeof healthSyncTypeSchema>;

export const HEALTH_SYNC_TYPES = healthSyncTypeSchema.options;

/** `privacy.recordHealthSync`: the types now on (empty = all off). */
export const recordHealthSyncInputSchema = z.object({
  platform: healthPlatformSchema,
  types: z.array(healthSyncTypeSchema).max(HEALTH_SYNC_TYPES.length),
});
export type RecordHealthSyncInput = z.infer<typeof recordHealthSyncInputSchema>;

/** Weigh-ins per `tracker.importWeights` call; the client pages a longer history. */
export const HEALTH_WEIGHT_IMPORT_MAX = 500;

const PLATFORM_LABEL: Record<HealthPlatform, string> = {
  APPLE_HEALTH: 'Apple Health',
  HEALTH_CONNECT: 'Health Connect',
};

const TYPE_LABEL: Record<HealthSyncType, string> = {
  weight: 'weight',
  steps: 'steps',
  activeEnergy: 'active energy',
  workouts: 'workouts',
  nutrition: 'food',
};

/**
 * Consent history row for a HEALTH_SYNC event (`providers` = platform, then the
 * types on): "Health Connect: weight, steps" or "Apple Health: turned off".
 */
export function healthSyncConsentLabel(providers: readonly string[]): string {
  const [first, ...rest] = providers;
  const platform = healthPlatformSchema.safeParse(first);
  const name = platform.success ? PLATFORM_LABEL[platform.data] : 'Health sync';
  const on = rest.flatMap((t) => {
    const type = healthSyncTypeSchema.safeParse(t);
    return type.success ? [TYPE_LABEL[type.data]] : [];
  });
  return on.length > 0 ? `${name}: ${on.join(', ')}` : `${name}: turned off`;
}
