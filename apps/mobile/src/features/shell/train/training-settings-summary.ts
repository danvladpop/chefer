import type { DayKind, GymProfileDto } from '@chefer/types';
import { formatLoadNumber, unitLabel } from '@chefer/utils';
import { WEEKDAY_SHORT_LABELS } from '../../gym/routine/weekday';

// One-line summaries for the Training settings rows (10 Oct redesign,
// GymSettings board). Pure, computed only from data the screen already has.

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** "20 kg bar · 7 plates · 14 dumbbells" — empty lists are left out. */
export function equipmentSummary(
  profile: Pick<GymProfileDto, 'barWeightKg' | 'platePairsKg' | 'dumbbellsKg' | 'unit'>,
): string {
  const parts = [
    `${formatLoadNumber(profile.barWeightKg, profile.unit)} ${unitLabel(profile.unit)} bar`,
  ];
  if (profile.platePairsKg.length > 0) {
    parts.push(plural(profile.platePairsKg.length, 'plate', 'plates'));
  }
  if (profile.dumbbellsKg.length > 0) {
    parts.push(plural(profile.dumbbellsKg.length, 'dumbbell', 'dumbbells'));
  }
  return parts.join(' · ');
}

const KIND_WORDS: Partial<Record<DayKind, string>> = { run: 'run', long_run: 'long run' };

/**
 * "Mon Wed Sat Sun · run Tue": lift days (from the routine, or a stored
 * `lift` kind), then the planned runs. Rest days are not listed.
 */
export function trainingDaysSummary(
  liftWeekdays: ReadonlySet<number>,
  dayKinds: Readonly<Record<string, DayKind | null | undefined>>,
): string {
  const lift: number[] = [];
  const byKind = new Map<string, number[]>();
  WEEKDAY_SHORT_LABELS.forEach((_, weekday) => {
    const kind = dayKinds[String(weekday)] ?? null;
    if (liftWeekdays.has(weekday) || kind === 'lift') {
      lift.push(weekday);
      return;
    }
    const word = kind ? KIND_WORDS[kind] : undefined;
    if (word) byKind.set(word, [...(byKind.get(word) ?? []), weekday]);
  });
  const days = (list: number[]) => list.map((d) => WEEKDAY_SHORT_LABELS[d]).join(' ');
  const parts: string[] = [];
  if (lift.length > 0) parts.push(days(lift));
  for (const [word, list] of byKind) parts.push(`${word} ${days(list)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Not set';
}

/** "60 min", "75+ min" (the legacy chip's label), or "Not set". */
export function sessionLengthValue(mins: number | null | undefined): string {
  if (!mins) return 'Not set';
  return mins === 75 ? '75+ min' : `${String(mins)} min`;
}
