import {
  mealsSafetyLine,
  mealTileLabel,
  mealTileMeta,
  mealTypeWord,
  weekStripDays,
} from '../../src/features/shell/meals/meals-model';
import { getTranslator, resetLocaleForTests } from '../../src/lib/i18n';

// Lane J phase 4: the Meals tab's model builds its words through the
// translator, so a Romanian phone reads Romanian tiles, strip and safety line.

const meal = {
  type: 'dinner',
  pinned: false,
  portion: 1.5,
  leftoverOf: null,
  recipe: {
    prepTimeMins: 5,
    cookTimeMins: 5,
    nutritionInfo: { calories: 600, protein: 40, carbs: 50, fat: 20 },
  },
};

const tableSafety = {
  hasRules: true,
  people: [
    {
      items: [
        { label: 'Peanuts', kind: 'allergy' },
        { label: 'Shellfish', kind: 'allergy' },
      ],
    },
  ],
};

afterEach(() => resetLocaleForTests(['en-US']));

describe('Meals model in English', () => {
  beforeEach(() => resetLocaleForTests(['en-US']));

  it('keeps the English tile meta and safety line', () => {
    const { t } = getTranslator();
    expect(mealTileMeta(t, meal, false, false)).toBe('900 kcal · 1½× portion · 10 min');
    expect(mealTileMeta(t, meal, false, true)).toBe('60 g protein · 1½× portion · 10 min');
    expect(mealTileMeta(t, meal, false, false, true)).toBe('1½ portions · 10 min');
    expect(mealTileLabel(t, 'dinner', true)).toBe('Side');
    expect(mealsSafetyLine(t, tableSafety)).toBe(
      'Checked for peanuts and shellfish. Always read labels.',
    );
  });
});

describe('Meals model in Romanian', () => {
  beforeEach(() => resetLocaleForTests(['ro-RO']));

  it('labels tiles, meal types and the safety line in Romanian', () => {
    const { t } = getTranslator();
    expect(mealTileLabel(t, 'dinner', false)).toBe('Cină');
    expect(mealTileLabel(t, 'dinner', true)).toBe('Garnitură');
    expect(mealTypeWord(t, 'breakfast')).toBe('mic dejun');
    expect(mealTileMeta(t, { ...meal, pinned: true }, false, true)).toBe(
      '60 g proteine · porție de 1½× · fixată',
    );
    expect(mealsSafetyLine(t, tableSafety)).toBe(
      'Verificat pentru peanuts și shellfish. Citește mereu etichetele.',
    );
    expect(mealsSafetyLine(t, { hasRules: false, people: [] })).toBe(
      'Idei de mese, nu sfaturi medicale. Citește mereu etichetele.',
    );
  });

  it('names the day strip in Romanian', () => {
    const { t } = getTranslator();
    const days = weekStripDays(t, new Date(2026, 10, 2), 2);
    expect(days[0]?.weekday).toBe(t('common.weekdaysShort.mon'));
    expect(days[2]?.accessibilityLabel).toBe('Miercuri, 4 noiembrie');
  });
});
