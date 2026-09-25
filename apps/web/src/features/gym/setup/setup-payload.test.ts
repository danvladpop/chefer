import { describe, expect, it } from 'vitest';
import { PROGRAM_TEMPLATES } from '@chefer/types';
import {
  buildSetupPayload,
  defaultUnitForLocale,
  knownWeightCandidates,
  knownWeightsToKg,
  parseWeightInput,
  previewForTemplate,
  type SetupAnswers,
} from './setup-payload';

const base: SetupAnswers = {
  days: 3,
  experience: 'BEGINNER',
  equipmentAccess: 'FULL_GYM',
  unit: 'KG',
  plannedWeekdays: [4, 0, 2, 2],
  reminderTime: null,
  templateKey: 'fb3-beginner',
  startMode: 'calibrate',
  knownWeights: {},
};

describe('setup payload', () => {
  it('parses typed weights leniently', () => {
    expect(parseWeightInput(' 62,5 ')).toBe(62.5);
    expect(parseWeightInput('')).toBeNull();
    expect(parseWeightInput('abc')).toBeNull();
    expect(parseWeightInput('0')).toBeNull();
    expect(parseWeightInput('-5')).toBeNull();
  });

  it('converts known weights in pounds to kg and drops blanks', () => {
    expect(knownWeightsToKg({ 'barbell-bench-press': '135', squat: '', dl: 'x' }, 'LB')).toEqual({
      'barbell-bench-press': 61.23,
    });
    expect(knownWeightsToKg({ a: '60' }, 'KG')).toEqual({ a: 60 });
  });

  it('caps absurd weights at the schema limit', () => {
    expect(knownWeightsToKg({ a: '5000' }, 'KG')).toEqual({ a: 1000 });
  });

  it('omits knownWeightsKg when calibrating, even if weights were typed', () => {
    const payload = buildSetupPayload({ ...base, knownWeights: { a: '60' } });
    expect(payload).not.toHaveProperty('knownWeightsKg');
  });

  it('sends kg known weights in "I know my weights" mode', () => {
    const payload = buildSetupPayload({
      ...base,
      unit: 'LB',
      startMode: 'known',
      knownWeights: { 'barbell-back-squat': '225', 'barbell-bench-press': '' },
    });
    expect(payload.knownWeightsKg).toEqual({ 'barbell-back-squat': 102.06 });
    expect(payload.unit).toBe('LB');
  });

  it('dedupes and sorts weekdays, and nulls a malformed reminder time', () => {
    const payload = buildSetupPayload({ ...base, reminderTime: '7pm' });
    expect(payload.plannedWeekdays).toEqual([0, 2, 4]);
    expect(payload.reminderTime).toBeNull();
    expect(buildSetupPayload({ ...base, reminderTime: '18:30' }).reminderTime).toBe('18:30');
  });

  it('rejects invalid answers through the shared schema', () => {
    expect(() => buildSetupPayload({ ...base, days: 9 })).toThrow();
  });

  it('defaults the unit from the locale', () => {
    expect(defaultUnitForLocale('en-US')).toBe('LB');
    expect(defaultUnitForLocale('en-GB')).toBe('KG');
    expect(defaultUnitForLocale('ro')).toBe('KG');
    expect(defaultUnitForLocale(undefined)).toBe('KG');
  });
});

describe('program preview', () => {
  it('previews every template with days, durations and a balance', () => {
    for (const t of PROGRAM_TEMPLATES) {
      const preview = previewForTemplate(t.key, 'FULL_GYM', t.experience);
      expect(preview?.days).toHaveLength(t.days.length);
      expect(preview?.days.every((d) => d.estimatedMin > 0)).toBe(true);
      expect(preview?.volume.length).toBeGreaterThan(0);
    }
  });

  it('applies the equipment swaps', () => {
    const ids = (access: 'FULL_GYM' | 'DUMBBELLS') =>
      previewForTemplate('fb3-beginner', access, 'BEGINNER')!.days.flatMap((d) =>
        d.exercises.map((e) => e.exerciseId),
      );
    expect(ids('DUMBBELLS')).not.toEqual(ids('FULL_GYM'));
  });

  it('asks known weights once per loadable exercise', () => {
    const preview = previewForTemplate('fb3-beginner', 'FULL_GYM', 'BEGINNER')!;
    const ids = knownWeightCandidates(preview).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown template', () => {
    expect(previewForTemplate('nope', 'FULL_GYM', 'BEGINNER')).toBeNull();
  });
});
