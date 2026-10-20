import { describe, expect, it } from 'vitest';
import {
  emptyTemplateDraft,
  fromTemplateDto,
  hasTemplateContent,
  toTemplateDoc,
} from './template-draft';
import { templateDto } from './test-fixtures';

describe('template draft ↔ document', () => {
  it('round-trips a template, trimming the name and notes and keeping row ids and loads', () => {
    const draft = fromTemplateDto(templateDto());
    draft.name = '  Lower body A  ';
    const first = draft.rows.days[0]?.exercises[0];
    if (first) first.trainerNote = '  knees out ';
    const doc = toTemplateDoc(draft);
    expect(doc.name).toBe('Lower body A');
    expect(doc.exercises[0]).toMatchObject({
      id: 'te1',
      exerciseId: 'back-squat',
      defaultLoadKg: 60,
      trainerNote: 'knees out',
    });
    expect(doc.exercises[1]).toMatchObject({ exerciseId: 'plank', defaultLoadKg: null });
  });

  it('a new template has content only with a name and an exercise or a workout type', () => {
    const draft = emptyTemplateDraft();
    expect(hasTemplateContent(toTemplateDoc(draft))).toBe(false);
    draft.name = 'Yoga flow';
    expect(hasTemplateContent(toTemplateDoc(draft))).toBe(false);
    draft.workoutType = 'YOGA';
    expect(hasTemplateContent(toTemplateDoc(draft))).toBe(true);
  });
});
