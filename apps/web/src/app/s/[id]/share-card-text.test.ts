import { describe, expect, it } from 'vitest';
import { createTranslator } from '@chefer/i18n';
import type { ShareCardPayload } from '@chefer/types';
import { shareCardLines } from '@chefer/utils';
import { shareCardText } from './share-card-text';

// Lane J phase 4: the public share page says what shareCardLines says, in the
// reader's language.

const RECAP: ShareCardPayload = {
  kind: 'recap',
  label: '12–18 Oct',
  cooking: { cookedFromPlan: 9, newRecipesTried: 0 },
  protein: { hit: 4, logged: 6 },
  training: { sessions: 3, prCount: 1, streakWeeks: 2 },
};
const RECIPE: ShareCardPayload = {
  kind: 'cook',
  title: 'Lemon pasta',
  imageUrl: null,
  totalMinutes: 25,
  servings: 2,
  nutrition: { kcal: 540, proteinG: 22 },
};

describe('shareCardText', () => {
  it('matches shareCardLines word for word in English', () => {
    const { t } = createTranslator('en');
    for (const payload of [RECAP, RECIPE]) {
      expect(shareCardText(payload, t)).toEqual(shareCardLines(payload));
    }
  });

  it('speaks Romanian, still leaving zero counts off', () => {
    const { t } = createTranslator('ro');
    const lines = shareCardText(RECAP, t);
    expect(lines.title).toBe('Săptămâna pe scurt');
    expect(lines.eyebrow).toBe('Săptămâna mea · 12–18 Oct');
    expect(lines.stats).toEqual([
      { value: '9', label: 'mese gătite din planul meu' },
      { value: '4 din 6', label: 'zile cu obiectivul de proteine atins' },
      { value: '3', label: 'antrenamente' },
      { value: '1', label: 'record personal nou' },
      { value: '2 săpt.', label: 'de antrenament la rând' },
    ]);
    expect(shareCardText(RECIPE, t).stats[1]).toEqual({ value: '2', label: 'porții' });
  });
});
