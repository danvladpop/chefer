import { describe, expect, it } from 'vitest';
import { PROGRAM_TEMPLATES } from '@chefer/types';
import { buildTemplatePreview, switchNote } from './template-preview';

describe('buildTemplatePreview (UX-GYM-14)', () => {
  it('lists every day of every template with exercises, sets and a duration', () => {
    for (const template of PROGRAM_TEMPLATES) {
      const days = buildTemplatePreview(template.key, 'FULL_GYM');
      expect(days.length).toBe(template.days.length);
      for (const day of days) {
        expect(day.name).not.toBe('');
        expect(day.estimatedMin).toBeGreaterThan(0);
        expect(day.exercises.length).toBeGreaterThan(0);
        for (const ex of day.exercises) {
          expect(ex.name).not.toBe(ex.exerciseId);
          expect(ex.sets).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('switchNote', () => {
  it('names the weekly goal change only when it differs', () => {
    expect(switchNote(3, 5)).toContain('from 3 to 5');
    expect(switchNote(4, 4)).not.toContain('weekly goal');
    expect(switchNote(null, 4)).not.toContain('weekly goal');
  });
});
