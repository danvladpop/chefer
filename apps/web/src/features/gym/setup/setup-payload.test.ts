import { describe, expect, it } from 'vitest';
import { PROGRAM_TEMPLATES } from '@chefer/types';
import {
  buildSetupPayload,
  defaultUnitForLocale,
  friendlySetupError,
  knownWeightCandidates,
  knownWeightError,
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

  // UX-GYM-01: the field says what is wrong instead of silently capping.
  it('validates a starting weight inline against the 1000 kg bound, in the user unit', () => {
    expect(knownWeightError('', 'KG')).toBeNull();
    expect(knownWeightError('62,5', 'KG')).toBeNull();
    expect(knownWeightError('135', 'LB')).toBeNull();
    expect(knownWeightError('4055', 'KG')).toBe('Max 1000 kg.');
    expect(knownWeightError('2300', 'LB')).toBe('Max 2204.6 lb.');
    expect(knownWeightError('0', 'KG')).toMatch(/above 0/);
    expect(knownWeightError('12abc', 'KG')).toBe('Enter a number.');
  });

  it('never shows serialised Zod text from a rejected setup', () => {
    expect(friendlySetupError('[{"code":"too_big","maximum":1000}]')).toMatch(/out of range/);
    expect(friendlySetupError('Too many requests.')).toBe('Too many requests.');
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
