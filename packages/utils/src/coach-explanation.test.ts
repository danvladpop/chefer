import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import { COACH_REASONS, type CoachExplanation } from '@chefer/types';
import { coachExplanationText } from './coach-explanation';

const trend = {
  fromDate: '2026-09-28',
  toDate: '2026-10-18',
  fromKg: 82.43,
  toKg: 82.38,
  spanDays: 20,
  weighIns: 12,
  kgPerWeek: -0.018,
};

const base: CoachExplanation = {
  version: 1,
  reason: 'plateau',
  suggestedKcal: -100,
  goal: 'LOSE_WEIGHT',
  trend,
  prevKgPerWeek: -0.02,
  intake: { avgKcal: 1850, completeDays: 5, incompleteDays: 1, targetKcal: 1900 },
};

describe('coachExplanationText', () => {
  it('walks from the trend and the complete days to the suggestion', () => {
    const { lines } = coachExplanationText(base, 'METRIC');
    expect(lines).toEqual([
      'Your trend weight held steady, from 82.4 kg to 82.4 kg over 3 weeks.',
      'Your 5 complete days averaged 1,850 kcal, with a target of 1,900 kcal. 1 partly logged day was left out.',
      "Your trend hasn't moved down for two weekly reviews in a row, so I'd suggest −100 kcal a day for next week.",
    ]);
  });

  it('shows the data used, in the user’s unit', () => {
    const { data } = coachExplanationText(
      { ...base, trend: { ...trend, toKg: 81.5, kgPerWeek: -0.33 } },
      'IMPERIAL',
    );
    expect(data).toEqual([
      { label: 'Trend weight', value: '181.7 lb → 179.7 lb' },
      { label: 'Weekly rate', value: '−0.7 lb/wk' },
      { label: 'Weigh-ins', value: '12 over 3 weeks' },
      { label: 'Average intake', value: '1,850 kcal' },
      { label: 'Daily target', value: '1,900 kcal' },
      { label: 'Complete days', value: '5 (+1 partly logged)' },
    ]);
  });

  it('says the direction and the weekly rate when the trend moves', () => {
    const { lines } = coachExplanationText(
      {
        ...base,
        reason: 'on_track',
        suggestedKcal: 0,
        trend: { ...trend, toKg: 81.6, spanDays: 10, kgPerWeek: -0.58 },
      },
      'METRIC',
    );
    expect(lines[0]).toBe(
      'Your trend weight went from 82.4 kg to 81.6 kg over 10 days, about 0.6 kg a week down.',
    );
    expect(lines.at(-1)).toBe(
      'Your trend is moving the way you want, so your budget stays as it is.',
    );
  });

  it('a free account sees the reasoning but not the number', () => {
    const { lines } = coachExplanationText({ ...base, suggestedKcal: null }, 'METRIC');
    expect(lines.at(-1)).toContain('With Premium');
    expect(lines.join(' ')).not.toMatch(/−100/);
  });

  it('a gain stall suggests a bigger budget', () => {
    const { lines } = coachExplanationText(
      { ...base, reason: 'gain_stall', suggestedKcal: 100, goal: 'GAIN_MUSCLE' },
      'METRIC',
    );
    expect(lines.at(-1)).toContain('+100 kcal a day');
  });

  it('without weigh-ins or complete days it says so plainly', () => {
    const { lines, data } = coachExplanationText(
      {
        ...base,
        reason: 'no_trend',
        suggestedKcal: 0,
        trend: null,
        intake: { avgKcal: 0, completeDays: 0, incompleteDays: 3, targetKcal: 2000 },
      },
      'METRIC',
    );
    expect(lines).toEqual([
      'There aren’t enough weigh-ins yet to read your trend weight.',
      'No complete days to average this week. 3 partly logged days were left out.',
      'Weigh in a few times a week and I can read your trend. Until then your budget stays as it is.',
    ]);
    expect(data).toEqual([{ label: 'Complete days', value: '0 (+3 partly logged)' }]);
  });

  it('protein-only mode leaves every calorie line and row out', () => {
    const { lines, data } = coachExplanationText(base, 'METRIC', { proteinOnly: true });
    expect(lines.join(' ')).not.toMatch(/kcal/);
    expect(data.map((d) => d.label)).not.toContain('Average intake');
    expect(lines).toContain('1 partly logged day was left out.');
  });

  it('every reason has adherence-neutral copy (no forbidden or judging words)', () => {
    const judging =
      /\b(missed|failed?|cheat\w*|bad|guilt\w*|compensate|make up|over target|too much|should have)\b/i;
    for (const reason of COACH_REASONS) {
      for (const suggestedKcal of [-100, 0, 100, null]) {
        const text = coachExplanationText({ ...base, reason, suggestedKcal }, 'METRIC').lines.join(
          ' ',
        );
        expect(containsForbiddenPhrase(text), `${reason}: ${text}`).toBeNull();
        expect(text, reason).not.toMatch(judging);
      }
    }
  });
});
