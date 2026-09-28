import { describe, expect, it } from 'vitest';
import {
  firstIncompleteIngredientLineIndex,
  missingSummary,
  parseQuantity,
  recipeMissingFields,
} from './recipe-form';

describe('recipeMissingFields (T-40.1, D-19)', () => {
  it('flags a missing name', () => {
    expect(
      recipeMissingFields({ name: '', ingredients: [{ name: 'flour', quantity: 200 }] }),
    ).toEqual(['name']);
  });

  it('flags a generic "ingredient" only when NO line has a name at all', () => {
    expect(recipeMissingFields({ name: 'Bread', ingredients: [] })).toEqual(['ingredient']);
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: '', quantity: NaN }] }),
    ).toEqual(['ingredient']);
  });

  it('AC4: a named line with no amount is "incompleteLine", not the generic "ingredient"', () => {
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: 'flour', quantity: 0 }] }),
    ).toEqual(['incompleteLine']);
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: 'flour', quantity: NaN }] }),
    ).toEqual(['incompleteLine']);
  });

  it('passes with a name and one complete ingredient line — the whole D-19 minimum', () => {
    expect(
      recipeMissingFields({ name: 'Bread', ingredients: [{ name: 'flour', quantity: 200 }] }),
    ).toEqual([]);
  });

  it('AC4: a named-but-amountless line blocks saving even when another line is complete', () => {
    expect(
      recipeMissingFields({
        name: 'Bread',
        ingredients: [
          { name: 'flour', quantity: 200 },
          { name: 'salt', quantity: 0 },
        ],
      }),
    ).toEqual(['incompleteLine']);
  });

  it('a fully blank line (no name, no amount) is ignored — not flagged as incomplete', () => {
    expect(
      recipeMissingFields({
        name: 'Bread',
        ingredients: [
          { name: 'flour', quantity: 200 },
          { name: '', quantity: NaN },
        ],
      }),
    ).toEqual([]);
  });
});

describe('firstIncompleteIngredientLineIndex (AC4)', () => {
  it('finds the first named line with no amount', () => {
    expect(
      firstIncompleteIngredientLineIndex([
        { name: 'flour', quantity: 200 },
        { name: 'salt', quantity: 0 },
        { name: 'pepper', quantity: 0 },
      ]),
    ).toBe(1);
  });

  it('returns null when every line is either complete or fully blank', () => {
    expect(
      firstIncompleteIngredientLineIndex([
        { name: 'flour', quantity: 200 },
        { name: '', quantity: NaN },
      ]),
    ).toBeNull();
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

  it('AC4: an incomplete line gets its own "Finish the ingredient on line {n}." message', () => {
    expect(missingSummary(['incompleteLine'], 2)).toBe('Finish the ingredient on line 2.');
  });

  it('falls back to a generic line message when no line number is given', () => {
    expect(missingSummary(['incompleteLine'])).toBe('Add an amount, or remove this line.');
  });

  it('a missing name takes priority over naming the incomplete line', () => {
    expect(missingSummary(['name', 'incompleteLine'], 1)).toBe(
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
