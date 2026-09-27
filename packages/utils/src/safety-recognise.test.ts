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
    // T-01.9 rev 2: coeliac implies the coeliac-STRENGTH gluten-free diet
    // (which also excludes label-dependent ingredients), not the plain one.
    expect(recogniseSafetyTerm('coeliac')).toEqual({
      kind: 'condition',
      id: 'coeliac',
      label: 'Coeliac',
      impliesDietId: 'gluten-free-coeliac',
    });
  });

  it('T-01.1 (bug B-04): a dislike CATEGORY like "green vegetables" is now recognised, not dropped', () => {
    expect(recogniseSafetyTerm('green vegetables')).toEqual({
      kind: 'dislike',
      id: 'leafy-greens',
      label: 'Leafy greens',
    });
  });

  it('keeps a genuinely unrecognised free-text term flagged rather than dropped (UX-01 b)', () => {
    expect(recogniseSafetyTerm('a weird home remedy')).toEqual({
      kind: 'unrecognised',
      term: 'a weird home remedy',
    });
  });
});
