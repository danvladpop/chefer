import type { CoachedSetDto, ExerciseMeta, NextTargetDto } from '@chefer/types';
import { formatLoad, formatLoadNumber } from '@chefer/utils';
import { WEEKDAY_SHORT_LABELS } from '../gym/routine/weekday';

// Pure formatting for the trainer screens (spec §2.4, §2.5). Weights are shown in kg: the trainer's
// own unit preference is not part of what a client shares, and the engine stores kg.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Maria Pop" → "Maria" (client-facing copy uses the first name). */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== '' ? first : name;
}

/** "Tue 30 Sep" for a device-local `YYYY-MM-DD` date. */
export function formatWeekdayDate(localDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) return localDate;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(year, month - 1, day);
  // getDay(): 0 = Sunday; the app's weekday labels start on Monday.
  const weekday = WEEKDAY_SHORT_LABELS[(d.getDay() + 6) % 7] ?? '';
  return `${weekday} ${day} ${MONTHS[month - 1] ?? ''}`;
}

/** "Last set effort": reps in reserve, 3 meaning "3+". */
export function rirText(rir: number | null): string | null {
  if (rir === null) return null;
  return rir >= 3 ? 'Last set: 3+ reps in reserve' : `Last set: ${rir} in reserve`;
}

/** One logged set as the trainer reads it: "60 kg × 8", "60 kg × 8 (warm-up)", "Not completed", cardio "20 min · 3.2 km". */
export function formatCoachedSet(set: CoachedSetDto): string {
  if (set.durationSec !== undefined && set.durationSec > 0 && set.reps <= 0) {
    const minutes = Math.round((set.durationSec / 60) * 10) / 10;
    const distance =
      set.distanceM !== undefined && set.distanceM > 0
        ? ` · ${Math.round((set.distanceM / 1000) * 100) / 100} km`
        : '';
    return `${minutes} min${distance}`;
  }
  const base = `${formatLoadNumber(set.weightKg, 'KG')} kg × ${set.reps}`;
  if (!set.completed) return `${base} (not completed)`;
  return set.isWarmup ? `${base} (warm-up)` : base;
}

/** "62.5 kg × 6, 6, 6, 6" — the weight once, then each set's reps. */
export function formatTargetValue(
  weightKg: number,
  reps: readonly number[],
  meta: ExerciseMeta | undefined,
): string {
  const load = formatLoad(weightKg, 'KG', meta?.loadType ?? 'WEIGHTED', {
    each: meta?.perHand ?? false,
  });
  return `${load} × ${reps.join(', ')}`;
}

/** What the engine (or the pending target) prescribes next, as one value string. */
export function nextTargetValueText(next: NextTargetDto, meta: ExerciseMeta | undefined): string {
  const source = next.override
    ? { weightKg: next.override.weightKg, reps: next.override.reps }
    : { weightKg: next.suggestion.weightKg, reps: next.suggestion.reps };
  return formatTargetValue(source.weightKg, source.reps, meta);
}

/** "6–8" or "8" for the rep range a next target is keyed to. */
export function repRangeText(repMin: number, repMax: number): string {
  return repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
}
