import { describe, expect, it } from 'vitest';
import { recogniseSafetyTerm } from './safety-recognise';

describe('recogniseSafetyTerm', () => {
  it('recognises a canonical label', () => {
    expect(recogniseSafetyTerm('Tree nuts')).toEqual({
      kind: 'allergy',
      id: 'tree-nuts',
      label: 'Tree nuts',
    });
  });

  it('recognises a legacy free-text synonym, case/space-insensitive', () => {
    expect(recogniseSafetyTerm('  NUTS ')).toEqual({
      kind: 'allergy',
      id: 'tree-nuts',
      label: 'Tree nuts',
    });
  });

  it('recognises a diet term', () => {
    expect(recogniseSafetyTerm('gluten free')).toMatchObject({ kind: 'diet', id: 'gluten-free' });
  });

  it('maps a condition to its implied diet', () => {
    expect(recogniseSafetyTerm('coeliac')).toEqual({
      kind: 'condition',
      id: 'coeliac',
      label: 'Coeliac',
      impliesDietId: 'gluten-free',
    });
  });

  it('keeps unrecognised free text, flagged rather than dropped (UX-01 b)', () => {
    expect(recogniseSafetyTerm('green vegetables')).toEqual({
      kind: 'unrecognised',
      term: 'green vegetables',
    });
  });
});
