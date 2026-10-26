import type { Translator } from '@chefer/i18n';
import type { Suggestion, SuggestionKind, WeightUnit } from '@chefer/types';
import { formatLoad } from '@chefer/utils';

type LoadType = 'WEIGHTED' | 'BODYWEIGHT' | 'BODYWEIGHT_PLUS' | 'ASSISTED';

/** "10" or "10/9/8" (or with "s" for timed exercises). */
export function repsText(reps: readonly number[], timed = false): string {
  if (reps.length === 0) return '—';
  const suffix = timed ? ' s' : '';
  const first = reps[0];
  return reps.every((r) => r === first) ? `${first}${suffix}` : `${reps.join('/')}${suffix}`;
}

/** "3 × 10 @ 62.5 kg" for a prescription. */
export function prescriptionText(
  s: Pick<Suggestion, 'sets' | 'reps' | 'weightKg'>,
  unit: WeightUnit,
  loadType: LoadType = 'WEIGHTED',
  timed = false,
  perHand = false,
): string {
  const load = formatLoad(s.weightKg, unit, loadType, { each: perHand });
  const base = `${s.sets} × ${repsText(s.reps, timed)}`;
  return loadType === 'BODYWEIGHT' && s.weightKg <= 0 ? base : `${base} @ ${load}`;
}

export const KIND_ARROW: Record<SuggestionKind, string> = {
  start: '•',
  increase: '↑',
  hold: '=',
  decrease: '↓',
  deload: '↓',
};

export const KIND_TONE: Record<SuggestionKind, string> = {
  start: 'bg-gray-100 text-gray-700',
  increase: 'bg-emerald-50 text-emerald-700',
  hold: 'bg-gray-100 text-gray-700',
  decrease: 'bg-amber-50 text-amber-700',
  deload: 'bg-sky-50 text-sky-700',
};

/** "Thu 24 Sep" from a local date (no timezone shifts). */
export function shortDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return localDate;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/**
 * "Thu 24 Sep" in the UI language: weekday + day + short month from a local
 * date, through the fixed `common` tables (same shape as `weekdayDateLabel`
 * in @chefer/utils, which is English only).
 */
export function weekdayDateLabelT(localDate: string, t: Translator['t']): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return localDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAY_KEYS[(date.getUTCDay() + 6) % 7] ?? 'mon';
  const month = MONTH_KEYS[date.getUTCMonth()] ?? 'jan';
  return `${t(`common.weekdaysShort.${weekday}`)} ${date.getUTCDate()} ${t(`common.monthsShort.${month}`)}`;
}
