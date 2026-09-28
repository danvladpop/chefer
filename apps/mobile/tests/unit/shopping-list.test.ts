import { parseCustomItemInput } from '../../src/features/shopping-list/parse-custom-item';

describe('parseCustomItemInput', () => {
  it('parses quantity + unit + name', () => {
    expect(parseCustomItemInput('2 kg flour')).toEqual({ name: 'flour', quantity: 2, unit: 'kg' });
    expect(parseCustomItemInput('1.5l milk')).toEqual({ name: 'milk', quantity: 1.5, unit: 'l' });
    expect(parseCustomItemInput('3,5 g saffron')).toEqual({
      name: 'saffron',
      quantity: 3.5,
      unit: 'g',
    });
  });

  it('parses bare quantity + name', () => {
    expect(parseCustomItemInput('6 eggs')).toEqual({ name: 'eggs', quantity: 6 });
  });

  it('treats plain text as a name-only item', () => {
    expect(parseCustomItemInput('olive oil')).toEqual({ name: 'olive oil' });
    expect(parseCustomItemInput('  spread  ')).toEqual({ name: 'spread' });
  });

  it('bug B-32: infers grams for a large bare number instead of defaulting to "pcs"', () => {
    expect(parseCustomItemInput('225 paneer')).toEqual({
      name: 'paneer',
      quantity: 225,
      unit: 'g',
    });
    // At/under the threshold, a bare count still means "no unit" (pieces,
    // decided downstream) — e.g. a dozen eggs.
    expect(parseCustomItemInput('20 eggs')).toEqual({ name: 'eggs', quantity: 20 });
    expect(parseCustomItemInput('21 eggs')).toEqual({ name: 'eggs', quantity: 21, unit: 'g' });
  });

  it('an explicit unit is never overridden by the large-number inference', () => {
    expect(parseCustomItemInput('225 pcs paneer')).toEqual({
      name: 'paneer',
      quantity: 225,
      unit: 'pcs',
    });
  });
});
