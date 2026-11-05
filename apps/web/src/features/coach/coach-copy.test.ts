import { describe, expect, it } from 'vitest';
import { createTranslator } from '@chefer/i18n';
import type { CoachExplanation } from '@chefer/types';
import { coachExplanationText } from '@chefer/utils';
import { coachExplanationCopy, weightErrorText, weightTrendText } from './coach-copy';

// Lane J phase 4: the translator twins of the @chefer/utils coach and weight
// copy say the same thing in English and follow the reader's language.

const EXPLANATION: CoachExplanation = {
  version: 1,
  reason: 'plateau',
  suggestedKcal: -100,
  goal: 'LOSE_WEIGHT',
  trend: {
    fromDate: '2026-09-28',
    toDate: '2026-10-18',
    fromKg: 82.4,
    toKg: 82.3,
    spanDays: 20,
    weighIns: 12,
    kgPerWeek: -0.03,
  },
  prevKgPerWeek: 0,
  intake: { avgKcal: 1850, completeDays: 5, incompleteDays: 1, targetKcal: 1900 },
};

const en = createTranslator('en');
const ro = createTranslator('ro');

describe('coachExplanationCopy', () => {
  it('in English, keeps the lines and rows of coachExplanationText (apostrophes aside)', () => {
    const straight = (s: string) => s.replace(/’/g, "'");
    for (const proteinOnly of [false, true]) {
      const ours = coachExplanationCopy(en, EXPLANATION, 'METRIC', { proteinOnly });
      const theirs = coachExplanationText(EXPLANATION, 'METRIC', { proteinOnly });
      expect(ours.lines.map(straight)).toEqual(theirs.lines.map(straight));
      expect(ours.data).toEqual(theirs.data);
    }
  });

  it('in Romanian, writes the reasoning in Romanian and still drops kcal in protein-only mode', () => {
    const full = coachExplanationCopy(ro, EXPLANATION, 'METRIC');
    expect(full.lines[0]).toBe(
      'Tendința greutății tale a rămas stabilă, de la 82.4 kg la 82.3 kg, în 3 săptămâni.',
    );
    expect(full.lines[1]).toContain('O zi înregistrată parțial nu a fost inclusă.');
    expect(full.lines[2]).toContain('îți sugerez −100 kcal pe zi');
    const protein = coachExplanationCopy(ro, EXPLANATION, 'METRIC', { proteinOnly: true });
    expect(protein.lines.join(' ')).not.toMatch(/kcal/);
  });
});

describe('weight copy', () => {
  it('words the weekly trend and the parser errors in Romanian', () => {
    expect(weightTrendText(ro, -0.4, 'METRIC')).toBe('−0,4 kg/săpt.');
    expect(weightTrendText(ro, 0.01, 'METRIC')).toBe('stabil');
    expect(weightTrendText(en, -0.4, 'METRIC')).toBe('−0.4 kg/wk');
    expect(weightErrorText(ro, 'Use a number like 72.5.')).toBe(
      'Folosește un număr, de exemplu 72,5.',
    );
    expect(weightErrorText(ro, 'Weight must be between 20 and 400 kg.')).toBe(
      'Greutatea trebuie să fie între 20 și 400 kg.',
    );
  });
});
