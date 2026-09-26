// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NutritionSummary } from './nutrition-summary';

afterEach(cleanup);

const base = {
  dailyCalorieTarget: 2728,
  plannedKcal: 2700,
  eatenKcal: 2810,
  protein: { planned: 140, targetG: 140, eaten: 120 },
  carbs: { planned: 300, targetG: 300, eaten: 250 },
  fat: { planned: 91, targetG: 91, eaten: 148 },
};

describe('NutritionSummary (MO-06)', () => {
  it('marks the calorie ring and only the over-target macro bar as over', () => {
    render(<NutritionSummary nutrition={base} />);
    const ring = screen.getByRole('progressbar', { name: '2810 of 2728 kcal eaten today' });
    expect(ring).toHaveAttribute('data-over', 'true');
    expect(screen.getByRole('progressbar', { name: 'Fat: 148 of 91 grams eaten' })).toHaveAttribute(
      'data-over',
      'true',
    );
    expect(
      screen.getByRole('progressbar', { name: 'Protein: 120 of 140 grams eaten' }),
    ).not.toHaveAttribute('data-over');
  });

  it('animates bars with scaleX from the left, never width', () => {
    render(<NutritionSummary nutrition={base} />);
    const fill = screen
      .getByRole('progressbar', { name: 'Protein: 120 of 140 grams eaten' })
      .querySelector<HTMLElement>('[data-part="fill"]');
    expect(fill).toHaveClass('origin-left');
    expect(fill?.style.transform).toMatch(/^scaleX\(/);
    expect(fill?.style.width).toBe('');
    expect(fill?.className).not.toContain('transition-all');
  });
});
