// ─── Progress screen helpers (UX-FOOD-20), shared by web and mobile ───────────

/** The windows the Progress charts can show, in days (the API serves 7–90). */
export const PROGRESS_RANGES = [7, 28, 90] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];
export const DEFAULT_PROGRESS_RANGE: ProgressRange = 28;

/**
 * A day that counts as "logged": it has a log AND something in it. A day whose
 * entries were all deleted keeps an empty log row (`hasLog` true, 0 kcal), and
 * used to be counted in "Days logged" and drawn as a 0 kcal point.
 */
export function isLoggedDay(day: { hasLog: boolean; totalKcal: number }): boolean {
  return day.hasLog && day.totalKcal > 0;
}

/**
 * Indices of about `wanted` evenly spaced x labels over `count` points,
 * always including the first and last. Spacing is even (no "21, 27" pair
 * squeezed at the end) and a short series never gets duplicates.
 */
export function evenLabelIndices(count: number, wanted = 5): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const n = Math.min(Math.max(2, wanted), count);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round((i * (count - 1)) / (n - 1)));
  return [...out].sort((a, b) => a - b);
}
