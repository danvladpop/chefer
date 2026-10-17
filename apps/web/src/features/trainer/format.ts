import type { CoachedSetDto, ExerciseLoadType, WeightUnit } from '@chefer/types';
import { formatLoad, unitLabel } from '@chefer/utils';

type LoadFormat = { loadType: ExerciseLoadType; perHand?: boolean };

/** "62.5 kg × 6, 6, 6, 6" (identical reps collapse to the list as given). */
export function targetText(
  weightKg: number,
  reps: readonly number[],
  unit: WeightUnit,
  load: LoadFormat = { loadType: 'WEIGHTED' },
  timed = false,
): string {
  const suffix = timed ? ' s' : '';
  const repsText = reps.length === 0 ? '—' : `${reps.join(', ')}${suffix}`;
  return `${formatLoad(weightKg, unit, load.loadType, { each: load.perHand })} × ${repsText}`;
}

/** One logged set for the trainer: "60 kg × 8", "W 20 kg × 10", "12 min · 3.2 km". */
export function coachedSetText(
  set: CoachedSetDto,
  unit: WeightUnit,
  load: LoadFormat = { loadType: 'WEIGHTED' },
): string {
  const prefix = set.isWarmup ? 'W ' : '';
  if (set.durationSec !== undefined || set.distanceM !== undefined) {
    const parts: string[] = [];
    if (set.durationSec !== undefined) parts.push(`${Math.round(set.durationSec / 60)} min`);
    if (set.distanceM !== undefined) parts.push(`${(set.distanceM / 1000).toFixed(1)} km`);
    return `${prefix}${parts.join(' · ')}`;
  }
  return `${prefix}${formatLoad(set.weightKg, unit, load.loadType, { each: load.perHand })} × ${set.reps}`;
}

/** "last set: 2 reps in reserve" (3 = "3+"). */
export function rirText(rir: number): string {
  return `Last set: ${rir >= 3 ? '3+' : rir} in reserve`;
}

export { unitLabel };

/** The first word of a display name: "Maria Popescu" -> "Maria". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
