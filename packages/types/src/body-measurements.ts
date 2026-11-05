import { z } from 'zod';

// ─── Body measurements (market review 2026-10, lane D3) ──────────────────────
// Free for everyone. One entry per local calendar day; each measure is
// optional. Lengths travel and are stored in cm (clients convert at the edge
// for IMPERIAL users); body fat is a percentage.

/** The measures, in display order. Every one but `bodyFat` is a length. */
export const BODY_MEASURES = ['waist', 'hips', 'chest', 'upperArm', 'thigh', 'bodyFat'] as const;
export type BodyMeasure = (typeof BODY_MEASURES)[number];

export const BODY_MEASURE_LABELS: Record<BodyMeasure, string> = {
  waist: 'Waist',
  hips: 'Hips',
  chest: 'Chest',
  upperArm: 'Upper arm',
  thigh: 'Thigh',
  bodyFat: 'Body fat',
};

/** The stored column behind each measure. */
export const BODY_MEASURE_FIELDS = {
  waist: 'waistCm',
  hips: 'hipsCm',
  chest: 'chestCm',
  upperArm: 'upperArmCm',
  thigh: 'thighCm',
  bodyFat: 'bodyFatPct',
} as const satisfies Record<BodyMeasure, string>;
export type BodyMeasureField = (typeof BODY_MEASURE_FIELDS)[BodyMeasure];

/** Plausible adult lengths (cm): a thin upper arm to a large waist. */
export const BODY_LENGTH_CM_MIN = 10;
export const BODY_LENGTH_CM_MAX = 250;
/** Plausible body fat (%). */
export const BODY_FAT_PCT_MIN = 2;
export const BODY_FAT_PCT_MAX = 70;

const lengthCm = z.number().finite().min(BODY_LENGTH_CM_MIN).max(BODY_LENGTH_CM_MAX);

/** The measures of one entry; at least one must be present. */
export const bodyMeasurementValuesSchema = z.object({
  waistCm: lengthCm.optional(),
  hipsCm: lengthCm.optional(),
  chestCm: lengthCm.optional(),
  upperArmCm: lengthCm.optional(),
  thighCm: lengthCm.optional(),
  bodyFatPct: z.number().finite().min(BODY_FAT_PCT_MIN).max(BODY_FAT_PCT_MAX).optional(),
});
export type BodyMeasurementValues = z.infer<typeof bodyMeasurementValuesSchema>;

/** True when at least one measure is set. */
export function hasAnyMeasure(values: BodyMeasurementValues): boolean {
  return Object.values(values).some((v) => v !== undefined);
}

/** One stored entry as the API returns it. */
export interface BodyMeasurementDto {
  id: string;
  /** The local calendar day, `YYYY-MM-DD`. */
  measuredOn: string;
  waistCm: number | null;
  hipsCm: number | null;
  chestCm: number | null;
  upperArmCm: number | null;
  thighCm: number | null;
  bodyFatPct: number | null;
}
