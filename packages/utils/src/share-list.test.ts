import { describe, expect, it } from 'vitest';
import {
  dinnersFromPlan,
  formatDinnersForSharing,
  formatListForSharing,
  shareableItems,
  shareListSubtitle,
  shareListTitle,
  type ShareListItem,
} from './share-list';

const base = { scope: 'everything', withAmounts: true, units: 'metric' } as const;

const list: ShareListItem[] = [
  { aisle: 'produce', name: 'Spinach', quantity: 200, unit: 'g' },
  { aisle: 'produce', name: 'Garlic', amount: '1 bulb', checked: true },
  { aisle: 'proteins', name: 'Chicken thighs', quantity: 800, unit: 'g' },
  { aisle: 'dairy', name: 'Milk', quantity: 1, unit: 'l', haveIt: true },
  { aisle: 'produce', name: 'Birthday candles', isCustom: true },
];

describe('formatListForSharing', () => {
  it('groups by aisle in the list order, upper-case aisle names, bullets, blank line between', () => {
    const text = formatListForSharing(list, {
      ...base,
      aisleLabels: { produce: 'Produce', proteins: 'Proteins', dairy: 'Dairy & Eggs' },
    });
    expect(text).toBe(
      [
        'PRODUCE',
        '- Spinach, 200 g',
        '- Garlic, 1 bulb',
        '- Birthday candles',
        '',
        'PROTEINS',
        '- Chicken thighs, 800 g',
        '',
        'DAIRY & EGGS',
        '- Milk, 1 l (have it)',
      ].join('\n'),
    );
  });

  it('custom lines sit under their aisle, not at the end', () => {
    const text = formatListForSharing(list, base);
    const lines = text.split('\n');
    expect(lines.indexOf('- Birthday candles')).toBeLessThan(lines.indexOf('PROTEINS'));
  });

  it('"What\'s left" omits ticked and pantry-covered lines (AC1, AC5)', () => {
    const text = formatListForSharing(list, { ...base, scope: 'whatsLeft' });
    expect(text).toContain('Spinach');
    expect(text).toContain('Chicken thighs');
    expect(text).not.toContain('Garlic');
    expect(text).not.toContain('Milk');
    expect(text).not.toContain('DAIRY');
    expect(text).not.toContain('(have it)');
  });

  it('42 of 87 unticked shares exactly those 42 lines (AC1)', () => {
    const big: ShareListItem[] = Array.from({ length: 87 }, (_, i) => ({
      aisle: i % 2 === 0 ? 'produce' : 'proteins',
      name: `Item ${i}`,
      checked: i >= 42,
    }));
    const text = formatListForSharing(big, { ...base, scope: 'whatsLeft' });
    expect(text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(42);
    expect(shareableItems(big, 'whatsLeft')).toHaveLength(42);
    expect(shareableItems(big, 'everything')).toHaveLength(87);
  });

  it('marks pantry-covered lines "(have it)" only in Everything', () => {
    expect(formatListForSharing(list, base)).toContain('- Milk, 1 l (have it)');
  });

  it('withAmounts false drops amounts', () => {
    const text = formatListForSharing(list, { ...base, withAmounts: false });
    expect(text).toContain('- Spinach\n');
    expect(text).not.toContain('200 g');
  });

  it('formats amounts in imperial', () => {
    const text = formatListForSharing(
      [{ aisle: 'proteins', name: 'Chicken thighs', quantity: 800, unit: 'g' }],
      { ...base, units: 'imperial' },
    );
    expect(text).toBe('PROTEINS\n- Chicken thighs, 1.8 lb');
  });

  it('never contains emoji or markdown (AC2)', () => {
    const text = formatListForSharing(
      [
        { aisle: 'other', name: '🍎 Apples', quantity: 3, unit: 'piece' },
        { aisle: 'other', name: '**Bold** lentils' },
        { aisle: 'other', name: '# Heading rice' },
      ],
      base,
      'https://chefer.app',
    );
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text).not.toMatch(/[*`~]/);
    expect(text).not.toMatch(/^#/m);
    expect(text).toContain('- Apples, 3 piece');
    expect(text.split('\n').every((l) => l === '' || !/^[\s*#>]/.test(l))).toBe(true);
  });

  it('adds the title, subtitle, dinners and the branding footer, blank-line separated', () => {
    const text = formatListForSharing(
      [{ aisle: 'produce', name: 'Spinach', amount: '200 g' }],
      {
        ...base,
        title: 'Shopping list · 28 Sep – 4 Oct',
        subtitle: 'For 2 dinners · 2 portions',
        withDinners: true,
        dinners: [
          { dayLabel: 'Mon', recipeName: 'Lentil curry' },
          { dayLabel: 'Tue', recipeName: 'Lemon chicken' },
        ],
      },
      'https://chefer.app',
    );
    expect(text).toBe(
      [
        'Shopping list · 28 Sep – 4 Oct',
        'For 2 dinners · 2 portions',
        '',
        'PRODUCE',
        '- Spinach, 200 g',
        '',
        'This week’s dinners',
        'Mon: Lentil curry',
        'Tue: Lemon chicken',
        '',
        'Made with Chefer · https://chefer.app',
      ].join('\n'),
    );
  });

  it('withDinners false leaves the dinners out', () => {
    const text = formatListForSharing(list, {
      ...base,
      dinners: [{ dayLabel: 'Mon', recipeName: 'Lentil curry' }],
    });
    expect(text).not.toContain('dinners');
  });

  it('an empty list yields an empty message body', () => {
    expect(formatListForSharing([], base)).toBe('');
  });
});

describe('shareListTitle / shareListSubtitle', () => {
  it('spans the week', () => {
    expect(shareListTitle({ weekStart: new Date(2026, 8, 28) })).toBe(
      'Shopping list · 28 Sep – 4 Oct',
    );
  });

  it('a mid-week list names the covered days', () => {
    expect(shareListTitle({ weekStart: new Date(2026, 8, 28), fromDayOfWeek: 4 })).toBe(
      'Shopping list · Fri–Sun',
    );
  });

  it('subtitle: dinners and portions, either or both', () => {
    expect(shareListSubtitle({ dinnersCount: 4, portions: 2 })).toBe('For 4 dinners · 2 portions');
    expect(shareListSubtitle({ dinnersCount: 1 })).toBe('For 1 dinner');
    expect(shareListSubtitle({})).toBeUndefined();
  });
});

describe('dinnersFromPlan / formatDinnersForSharing', () => {
  const days = [
    {
      dayOfWeek: 1,
      meals: [
        { type: 'lunch', recipe: { name: 'Soup' } },
        { type: 'dinner', recipe: { name: 'Pasta Primavera' } },
      ],
    },
    { dayOfWeek: 0, meals: [{ type: 'dinner', recipe: { name: 'Chicken Stir-fry' } }] },
    { dayOfWeek: 2, meals: [{ type: 'breakfast', recipe: { name: 'Oats' } }] },
    { dayOfWeek: 3, meals: [] },
  ];
  const label = (d: number) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d] ?? '';

  it('only planned dinners, in weekday order (AC3)', () => {
    expect(dinnersFromPlan(days, label)).toEqual([
      { dayLabel: 'Mon', recipeName: 'Chicken Stir-fry' },
      { dayLabel: 'Tue', recipeName: 'Pasta Primavera' },
    ]);
  });

  it('a mid-week list counts only the dinners it covers (UX-SHOP-03: "Fri–Sun · For 7 dinners")', () => {
    expect(dinnersFromPlan(days, label, 1)).toEqual([
      { dayLabel: 'Tue', recipeName: 'Pasta Primavera' },
    ]);
    expect(dinnersFromPlan(days, label, 0)).toHaveLength(2);
    expect(dinnersFromPlan(days, label, null)).toHaveLength(2);
  });

  it('formats a heading, one line per day and the app pointer', () => {
    expect(formatDinnersForSharing(dinnersFromPlan(days, label), 'https://chefer.app')).toBe(
      [
        'This week’s dinners',
        'Mon: Chicken Stir-fry',
        'Tue: Pasta Primavera',
        '',
        'Shopping list in Chefer',
        '',
        'Made with Chefer · https://chefer.app',
      ].join('\n'),
    );
  });

  it('heads next week’s dinners as next week’s (UX-PLAN-07)', () => {
    expect(
      formatDinnersForSharing(dinnersFromPlan(days, label), undefined, 'Next week’s dinners'),
    ).toMatch(/^Next week’s dinners\nMon: Chicken Stir-fry/);
  });
});
