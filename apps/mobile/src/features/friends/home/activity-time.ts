// ─── Activity timestamps (UX §7.2) ────────────────────────────────────────────
// `2h`, `Yesterday`, `3 days`, then `{d MMM}`. Relative-time formatting stays
// in the app, next to the one screen that uses it; the words are
// `friends.activity.age.*` and the month names `common.monthsShort.*`.
import type { Translator } from '@chefer/i18n';

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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `5m`, `2h`, `Yesterday`, `3 days`, then `28 Sep` (the item's own date). */
export function formatActivityAge(
  createdAt: Date,
  t: Translator['t'],
  now: Date = new Date(),
): string {
  const elapsed = Math.max(0, now.getTime() - createdAt.getTime());
  if (elapsed < HOUR_MS) {
    return t('friends.activity.age.minutes', { n: Math.max(1, Math.floor(elapsed / MINUTE_MS)) });
  }
  if (elapsed < DAY_MS)
    return t('friends.activity.age.hours', { n: Math.floor(elapsed / HOUR_MS) });
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return t('friends.activity.age.yesterday');
  if (days < 7) return t('friends.activity.age.days', { count: days });
  return t('friends.activity.age.date', {
    day: createdAt.getDate(),
    month: t(`common.monthsShort.${MONTH_KEYS[createdAt.getMonth()] ?? 'jan'}`),
  });
}

/** `14:05` — the "showing what was saved {time}" fragment of the offline line (UX §5.2). */
export function formatSavedTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
