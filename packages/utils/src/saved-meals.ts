import type { SavedMealItem } from '@chefer/types';
import { formatNumber } from './format';

// ─── Saved meals + copy meal (lane A2) ────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The numbers a saved meal logs, summed over its items. */
export function savedMealTotals(items: readonly SavedMealItem[]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  return items.reduce(
    (sum, item) => ({
      kcal: Math.round(sum.kcal + item.kcal),
      protein: round1(sum.protein + item.protein),
      carbs: round1(sum.carbs + item.carbs),
      fat: round1(sum.fat + item.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** "3 items · 540 kcal" (or "… · 32 g protein" in protein-only mode). */
export function savedMealSummary(items: readonly SavedMealItem[], proteinOnly: boolean): string {
  const totals = savedMealTotals(items);
  const count = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
  return proteinOnly
    ? `${count} · ${formatNumber(totals.protein)} g protein`
    : `${count} · ${formatNumber(totals.kcal)} kcal`;
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The days a meal can be copied to: today and the six days before it, newest
 * first ("Today", "Yesterday", then weekday + day). Logging never goes into
 * the future.
 */
export function copyMealTargetDays(today: Date): { date: string; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Yesterday'
          : day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    return { date: isoDay(day), label };
  });
}

/** "Copied 3 entries to lunch, yesterday" — the snackbar after a copy. */
export function copyMealMessage(count: number, mealLabel: string, dayLabel: string): string {
  if (count === 0) return 'Nothing to copy from that meal.';
  const entries = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  return `Copied ${entries} to ${mealLabel.toLowerCase()}, ${dayLabel.toLowerCase()}`;
}
