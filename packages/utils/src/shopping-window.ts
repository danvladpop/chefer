// "Covers Fri–Sun": the shopping list of a plan made mid-week only covers
// the remaining days (audit F-PM-3). One label for web and mobile.

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** null for a whole-week list; otherwise e.g. "Fri–Sun" or "Sun only". */
export function shoppingWindowLabel(fromDayOfWeek: number | null | undefined): string | null {
  if (fromDayOfWeek == null || fromDayOfWeek <= 0) return null;
  const from = SHORT_DAYS[Math.min(6, fromDayOfWeek)] ?? 'Sun';
  return fromDayOfWeek >= 6 ? `${from} only` : `${from}–Sun`;
}
