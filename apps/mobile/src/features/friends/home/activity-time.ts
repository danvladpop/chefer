// ─── Activity timestamps (UX §7.2) ────────────────────────────────────────────
// `2h`, `Yesterday`, `3 days`, then `{d MMM}`. Relative-time formatting stays
// in the app (the copy deck holds only sentences — friends-copy.ts header), so
// it lives here, next to the one screen that uses it.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `5m`, `2h`, `Yesterday`, `3 days`, then `28 Sep` (the item's own date). */
export function formatActivityAge(createdAt: Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - createdAt.getTime());
  if (elapsed < HOUR_MS) return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}m`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days`;
  return `${createdAt.getDate()} ${MONTHS[createdAt.getMonth()] ?? ''}`;
}

/** `14:05` — the "showing what was saved {time}" fragment of the offline line (UX §5.2). */
export function formatSavedTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
