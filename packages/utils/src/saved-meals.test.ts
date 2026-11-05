import { describe, expect, it } from 'vitest';
import {
  copyMealMessage,
  copyMealTargetDays,
  savedMealSummary,
  savedMealTotals,
} from './saved-meals';

const items = [
  { name: 'Oats', portionMultiplier: 1, kcal: 400.4, protein: 20.25, carbs: 50, fat: 10 },
  { name: 'Coffee', portionMultiplier: 1, kcal: 40, protein: 2, carbs: 4, fat: 1.5 },
];

describe('saved meals', () => {
  it('totals and summarises', () => {
    expect(savedMealTotals(items)).toEqual({ kcal: 440, protein: 22.3, carbs: 54, fat: 11.5 });
    expect(savedMealSummary(items, false)).toBe('2 items · 440 kcal');
    expect(savedMealSummary(items.slice(0, 1), true)).toBe('1 item · 20 g protein');
  });

  it('offers today and the six days before it, never the future', () => {
    const days = copyMealTargetDays(new Date(2026, 9, 22, 9));
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-10-22', label: 'Today' });
    expect(days[1]).toEqual({ date: '2026-10-21', label: 'Yesterday' });
    expect(days[6]?.date).toBe('2026-10-16');
  });

  it('says what was copied', () => {
    expect(copyMealMessage(3, 'Lunch', 'Yesterday')).toBe('Copied 3 entries to lunch, yesterday');
    expect(copyMealMessage(1, 'Dinner', 'Today')).toBe('Copied 1 entry to dinner, today');
    expect(copyMealMessage(0, 'Dinner', 'Today')).toBe('Nothing to copy from that meal.');
  });
});
