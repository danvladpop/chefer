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
});
