import { describe, expect, it } from 'vitest';
import { formatQuantity } from './units';

describe('formatQuantity', () => {
  describe('METRIC display', () => {
    it('keeps grams as grams below 1 kg', () => {
      expect(formatQuantity(250, 'g', 'METRIC')).toBe('250 g');
    });

    it('promotes to kilograms at 1000 g', () => {
      expect(formatQuantity(1000, 'g', 'METRIC')).toBe('1 kg');
      expect(formatQuantity(1.5, 'kg', 'METRIC')).toBe('1.5 kg');
    });

    it('converts imperial mass to metric', () => {
      expect(formatQuantity(1, 'lb', 'METRIC')).toBe('454 g');
      expect(formatQuantity(4, 'oz', 'METRIC')).toBe('113 g');
    });

    it('converts kitchen volume units to millilitres', () => {
      expect(formatQuantity(2, 'cups', 'METRIC')).toBe('480 ml');
      expect(formatQuantity(1, 'tbsp', 'METRIC')).toBe('15 ml');
      expect(formatQuantity(1, 'tsp', 'METRIC')).toBe('5 ml');
    });

    it('promotes to litres at 1000 ml', () => {
      expect(formatQuantity(1.2, 'l', 'METRIC')).toBe('1.2 l');
      expect(formatQuantity(5, 'cups', 'METRIC')).toBe('1.2 l');
    });
  });

  describe('IMPERIAL display', () => {
    it('converts metric mass to oz below a pound, lb above', () => {
      expect(formatQuantity(100, 'g', 'IMPERIAL')).toBe('3.5 oz');
      expect(formatQuantity(1, 'kg', 'IMPERIAL')).toBe('2.2 lb');
    });

    it('passes authored imperial kitchen units through', () => {
      expect(formatQuantity(2, 'cups', 'IMPERIAL')).toBe('2 cups');
      expect(formatQuantity(1, 'cup', 'IMPERIAL')).toBe('1 cup');
      expect(formatQuantity(1, 'tablespoon', 'IMPERIAL')).toBe('1 tbsp');
      expect(formatQuantity(2, 'tsp', 'IMPERIAL')).toBe('2 tsp');
    });

    it('converts metric volume to fl oz / cups', () => {
      expect(formatQuantity(100, 'ml', 'IMPERIAL')).toBe('3.4 fl oz');
      expect(formatQuantity(1, 'l', 'IMPERIAL')).toBe('4.2 cups');
    });
  });

  describe('pass-through behaviour', () => {
    it('leaves count and unknown units untouched in both systems', () => {
      expect(formatQuantity(2, 'pieces', 'METRIC')).toBe('2 pieces');
      expect(formatQuantity(3, 'cloves', 'IMPERIAL')).toBe('3 cloves');
      expect(formatQuantity(1, 'medium', 'METRIC')).toBe('1 medium');
    });

    it('is case- and whitespace-insensitive on the unit', () => {
      expect(formatQuantity(250, ' G ', 'METRIC')).toBe('250 g');
      expect(formatQuantity(2, 'Cups', 'METRIC')).toBe('480 ml');
    });

    it('returns non-finite quantities unformatted', () => {
      expect(formatQuantity(Number.NaN, 'g', 'METRIC')).toBe('NaN g');
      expect(formatQuantity(Number.POSITIVE_INFINITY, 'g', 'METRIC')).toBe('Infinity g');
    });
  });

  describe('rounding', () => {
    it('rounds to integers at 10 and above, one decimal below', () => {
      expect(formatQuantity(10.4, 'g', 'METRIC')).toBe('10 g');
      expect(formatQuantity(2.25, 'g', 'METRIC')).toBe('2.3 g');
      expect(formatQuantity(2, 'g', 'METRIC')).toBe('2 g');
    });
  });
});
