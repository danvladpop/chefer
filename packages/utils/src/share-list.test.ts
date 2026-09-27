import { describe, expect, it } from 'vitest';
import { formatDinnersForSharing, formatListForSharing } from './share-list';

const list = [
  { aisle: 'produce', name: 'Onions', amount: '2', checked: false },
  { aisle: 'produce', name: 'Garlic', amount: '1 bulb', checked: true },
  { aisle: 'dairy', name: 'Milk', amount: '1 L', checked: false, haveIt: true },
];

describe('formatListForSharing', () => {
  it('includes every item in "Everything" scope', () => {
    const text = formatListForSharing(list, {
      scope: 'everything',
      withAmounts: true,
      units: 'metric',
    });
    expect(text).toContain('Onions');
    expect(text).toContain('Garlic');
  });

  it('omits checked items in "What\'s left" scope', () => {
    const text = formatListForSharing(list, {
      scope: 'whatsLeft',
      withAmounts: true,
      units: 'metric',
    });
    expect(text).toContain('Onions');
    expect(text).not.toContain('Garlic');
  });

  it('suffixes pantry-covered items with "(have it)"', () => {
    const text = formatListForSharing(list, {
      scope: 'everything',
      withAmounts: false,
      units: 'metric',
    });
    expect(text).toContain('Milk (have it)');
  });

  it('omits amounts when withAmounts is false', () => {
    const text = formatListForSharing(list, {
      scope: 'everything',
      withAmounts: false,
      units: 'metric',
    });
    expect(text).not.toContain('2 Onions');
  });

  it('appends the Chefer footer with no emoji/markdown when a share url is given', () => {
    const text = formatListForSharing(
      list,
      { scope: 'everything', withAmounts: true, units: 'metric' },
      'https://chefer.app',
    );
    expect(text).toContain('Made with Chefer · https://chefer.app');
  });
});

describe('formatDinnersForSharing', () => {
  it('formats one line per day', () => {
    const text = formatDinnersForSharing([
      { dayLabel: 'Mon', recipeName: 'Chicken Stir-fry' },
      { dayLabel: 'Tue', recipeName: 'Pasta Primavera' },
    ]);
    expect(text).toBe('Mon: Chicken Stir-fry\nTue: Pasta Primavera');
  });
});
