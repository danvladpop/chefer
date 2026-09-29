import type { DistanceUnit, ExerciseMeta, GymProfileDto, SessionSetDoc } from '@chefer/types';
import {
  distanceUnitFor,
  effortLabelForRpe,
  formatDistance,
  formatDurationMinutes,
  isStrengthTrackingType,
  trackingTypeOf,
} from '@chefer/utils';

// T-42.5 (UX-42, Q-31): the web RENDERS cardio (history, summary) but never
// logs it — that is phone-only until the "web: log cardio" ledger row is built.
// The rules (time · distance · effort, never "0 kg × 0") live in @chefer/utils.

/** True for a cardio exercise (any non-strength tracking type). */
export function isCardioExercise(meta: ExerciseMeta | undefined): boolean {
  return meta !== undefined && !isStrengthTrackingType(trackingTypeOf(meta));
}

/** The profile's distance unit, else km/mi from the weight unit (mirrors the phone). */
export function profileDistanceUnit(
  profile: Pick<GymProfileDto, 'unit' | 'distanceUnit'> | null | undefined,
): DistanceUnit {
  if (profile?.distanceUnit) return profile.distanceUnit;
  return profile?.unit === 'LB' ? 'MI' : 'KM';
}

type CardioSetFields = Pick<SessionSetDoc, 'durationSec' | 'distanceM' | 'intensityRpe'>;

/** "20 min · 5.0 km · Moderate" — only the parts that were logged. */
export function cardioSetText(
  set: CardioSetFields,
  exerciseId: string,
  profileUnit: DistanceUnit,
): string {
  const distanceUnit = distanceUnitFor(exerciseId, profileUnit);
  const parts: string[] = [];
  if (set.durationSec !== undefined) parts.push(formatDurationMinutes(set.durationSec));
  if (set.distanceM !== undefined) parts.push(formatDistance(set.distanceM, distanceUnit));
  if (set.intensityRpe !== undefined) {
    parts.push(effortLabelForRpe(set.intensityRpe) ?? `RPE ${set.intensityRpe}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}
