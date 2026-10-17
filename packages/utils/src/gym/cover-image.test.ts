import { describe, expect, it } from 'vitest';
import { coverImagePath } from './cover-image';

const library: Record<string, readonly string[]> = {
  bench: ['/static/exercises/bench-start.jpg', '/static/exercises/bench-end.jpg'],
  squat: ['https://cdn.example/squat.jpg'],
  'custom-row': [],
  blank: [''],
};
const imagesOf = (id: string) => library[id];

describe('coverImagePath', () => {
  it('the first exercise with a photo, in order, and its first photo', () => {
    expect(coverImagePath(['bench', 'squat'], imagesOf)).toBe('/static/exercises/bench-start.jpg');
    expect(coverImagePath(['squat', 'bench'], imagesOf)).toBe('https://cdn.example/squat.jpg');
  });

  it('skips exercises without a photo (custom, empty paths, unknown ids)', () => {
    expect(coverImagePath(['custom-row', 'blank', 'gone', 'squat'], imagesOf)).toBe(
      'https://cdn.example/squat.jpg',
    );
  });

  it('null when nothing has a photo, or there are no exercises', () => {
    expect(coverImagePath(['custom-row', 'gone'], imagesOf)).toBeNull();
    expect(coverImagePath([], imagesOf)).toBeNull();
  });
});
