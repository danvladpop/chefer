import { describe, expect, it } from 'vitest';
import type { TargetInputs } from '@chefer/types';
import {
  explainCarbsFatSentence,
  explainKcalSentence,
  explainProteinSentence,
  missingMetricsSentence,
  ownTargetSentence,
} from './explain-targets';

const fullInputs: TargetInputs = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  activity: 'moderate',
  goal: 'GAIN_MUSCLE',
  isLifter: true,
  proteinGPerKg: 1.8,
  usedAdjustedWeight: false,
  rate: null,
};

describe('explainKcalSentence', () => {
  it('names Mifflin-St Jeor when metrics are known', () => {
    expect(explainKcalSentence(fullInputs)).toContain('Mifflin');
  });

  it('falls back to the missing-metrics sentence', () => {
    expect(explainKcalSentence({ ...fullInputs, weightKg: null })).toBe(missingMetricsSentence());
  });
});

describe('explainProteinSentence', () => {
  it('names the g/kg basis', () => {
    expect(explainProteinSentence(fullInputs)).toContain('1.8 g per kg');
  });

  it('names the BMI adjusted-weight rule when it applied', () => {
    expect(explainProteinSentence({ ...fullInputs, usedAdjustedWeight: true })).toContain(
      'BMI of 30',
    );
  });

  it('has a fallback when protein basis is unknown', () => {
    expect(explainProteinSentence({ ...fullInputs, proteinGPerKg: null })).not.toContain(
      'g per kg',
    );
  });
});

describe('explainCarbsFatSentence', () => {
  it('mentions the carb/fat split', () => {
    expect(explainCarbsFatSentence()).toContain('carbs and fat');
  });
});

describe('ownTargetSentence', () => {
  it('names the date the user set their own target', () => {
    expect(ownTargetSentence(new Date(2026, 0, 15))).toContain('You set this on');
  });
});
