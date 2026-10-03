import { describe, expect, it } from 'vitest';
import {
  formatFractionalQuantity,
  formatScaledQuantity,
  formatServingsPair,
  isUnscalableUnit,
} from './scaled-quantity';

describe('isUnscalableUnit (bug B-52 — "to taste" never scales)', () => {
  it('recognises "to taste" in every case', () => {
    expect(isUnscalableUnit('to taste')).toBe(true);
    expect(isUnscalableUnit('To Taste')).toBe(true);
    expect(isUnscalableUnit('as needed')).toBe(true);
  });

  it('leaves ordinary units alone', () => {
    expect(isUnscalableUnit('g')).toBe(false);
    expect(isUnscalableUnit('pinch')).toBe(false);
  });
});

describe('formatFractionalQuantity (bug B-52 — kitchen fractions, not raw decimals)', () => {
  it('renders whole numbers as-is', () => {
    expect(formatFractionalQuantity(3)).toBe('3');
    expect(formatFractionalQuantity(0)).toBe('0');
  });

  it('renders common kitchen fractions with a glyph', () => {
    expect(formatFractionalQuantity(0.5)).toBe('½');
    expect(formatFractionalQuantity(1.5)).toBe('1½');
    expect(formatFractionalQuantity(0.25)).toBe('¼');
    expect(formatFractionalQuantity(1.75)).toBe('1¾');
  });

  it('falls back to one decimal place when no fraction is close', () => {
    expect(formatFractionalQuantity(1.7)).toBe('1.7');
  });
});

describe('formatScaledQuantity (bug B-52)', () => {
  it('never scales or numbers a "to taste" line', () => {
    expect(formatScaledQuantity(2, 'to taste', 3, 'METRIC')).toBe('To taste');
  });

  it('scales an ordinary quantity and renders a kitchen fraction', () => {
    // 1 tsp * 1.5 = 1.5 tsp -> "1½ tsp"
    expect(formatScaledQuantity(1, 'tsp', 1.5, 'IMPERIAL')).toBe('1½ tsp');
  });

  it('UX-REC-07: keeps spoon units in a metric display instead of converting to ml', () => {
    expect(formatScaledQuantity(1, 'tbsp', 1.5, 'METRIC')).toBe('1½ tbsp');
    expect(formatScaledQuantity(2, 'teaspoons', 1, 'METRIC')).toBe('2 tsp');
    expect(formatScaledQuantity(1, 'Tablespoon', 2, 'IMPERIAL')).toBe('2 tbsp');
    // other volumes still convert
    expect(formatScaledQuantity(1, 'cup', 1, 'METRIC')).toBe('240 ml');
  });

  it('a loose kitchen unit (pinch) scales without decimal noise', () => {
    expect(formatScaledQuantity(1, 'pinch', 1.5, 'METRIC')).toBe('1½ pinch');
  });
});

describe('formatServingsPair', () => {
  it('formats "current / base" with fractions, never raw decimals', () => {
    expect(formatServingsPair(1.5, 5)).toBe('1½ / 5');
    expect(formatServingsPair(2, 2)).toBe('2 / 2');
  });
});
