import { describe, expect, it } from 'vitest';
import { missingSummary, parseQuantity, recipeMissingFields } from './recipe-form';

describe('recipeMissingFields (T-40.1, D-19)', () => {
  it('flags a missing name', () => {
    expect(
      recipeMissingFields({ name: '', ingredients: [{ name: 'flour', quantity: 200 }] }),
    ).toEqual(['name']);
  });

  it('flags when no ingredient line is COMPLETE (name + amount > 0)', () => {
    expect(recipeMissingFields({ name: 'Bread', ingredients: [] })).toEqual(['ingredient']);
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: 'flour', quantity: 0 }] }),
    ).toEqual(['ingredient']);
    // A named line with no amount is incomplete, not just ignored.
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: 'flour', quantity: NaN }] }),
    ).toEqual(['ingredient']);
  });

  it('passes with a name and one complete ingredient line — the whole D-19 minimum', () => {
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: 'flour', quantity: 200 }] }),
    ).toEqual([]);
  });

  it('a second incomplete line does not block a save once one line is complete', () => {
    expect(
      recipeMissingFields({
        name: 'Bread',
        ingredients: [
          { name: 'flour', quantity: 200 },
          { name: 'salt', quantity: 0 },
        ],
      }),
    ).toEqual([]);
  });
});

describe('missingSummary (PAT-17 — never a silently disabled button)', () => {
  it('returns null when nothing is missing', () => {
    expect(missingSummary([])).toBeNull();
  });

  it('names exactly what is missing', () => {
    expect(missingSummary(['name'])).toBe('Add a name to save.');
    expect(missingSummary(['ingredient'])).toBe(
      'Add at least one ingredient with an amount to save.',
    );
    expect(missingSummary(['name', 'ingredient'])).toBe(
      'Add a name and at least one ingredient with an amount to save.',
    );
  });
});

describe('parseQuantity (T-BUG-O3 C3, AC 6)', () => {
  it('parses plain numbers', () => {
    expect(parseQuantity('200')).toBe(200);
    expect(parseQuantity('0')).toBe(0);
  });

  it('parses a comma decimal', () => {
    expect(parseQuantity('0,5')).toBe(0.5);
  });

  it('parses a simple fraction — "1/2" is 0.5, never 1 or 0', () => {
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('3/4')).toBe(0.75);
  });

  it('parses a unicode fraction — "½" is 0.5, never 0 (the old parseFloat bug)', () => {
    expect(parseQuantity('½')).toBe(0.5);
    expect(parseQuantity('¼')).toBe(0.25);
  });

  it('parses a mixed number', () => {
    expect(parseQuantity('1½')).toBe(1.5);
    expect(parseQuantity('1 1/2')).toBe(1.5);
  });

  it('never returns NaN — empty or garbage input is 0', () => {
    expect(parseQuantity('')).toBe(0);
    expect(parseQuantity('   ')).toBe(0);
    expect(parseQuantity('abc')).toBe(0);
    expect(parseQuantity('-5')).toBe(0);
  });
});
