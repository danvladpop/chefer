// Weekday convention: 0 = Monday … 6 = Sunday (matches packages/types/gym/templates.ts).
export const WEEKDAY_SHORT_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const WEEKDAY_FULL_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function weekdayLabel(weekday: number | null): string {
  if (weekday === null) return 'No fixed day';
  return WEEKDAY_FULL_LABELS[weekday] ?? 'No fixed day';
}
