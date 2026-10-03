import { describe, expect, it } from 'vitest';
import { canOfferCreate, createExerciseHref } from './create-exercise-href';

describe('createExerciseHref', () => {
  it('carries the trimmed, encoded search as ?name=', () => {
    expect(createExerciseHref('  Cable fly & press ')).toBe(
      '/gym/exercises/new?name=Cable%20fly%20%26%20press',
    );
  });

  it('falls back to the bare form for an empty search and caps the length', () => {
    expect(createExerciseHref('   ')).toBe('/gym/exercises/new');
    const href = createExerciseHref('x'.repeat(200));
    expect(decodeURIComponent(href.split('=')[1] ?? '')).toHaveLength(60);
  });

  it('offers Create only for searches of two or more characters', () => {
    expect(canOfferCreate('a')).toBe(false);
    expect(canOfferCreate(' a ')).toBe(false);
    expect(canOfferCreate('ab')).toBe(true);
  });
});
