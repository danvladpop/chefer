import type { Translator } from './translator';

// common.monthsShort in calendar order. A fixed table, not Intl: ICU versions
// disagree on "Sep" vs "Sept", and server and client must print the same label.
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

/** The twelve short month names in `tr`'s language, January first ("Sep" / "sept."). */
export function monthsShort(tr: Pick<Translator, 't'>): string[] {
  return MONTH_KEYS.map((key) => tr.t(`common.monthsShort.${key}`));
}
