import { describe, expect, it } from 'vitest';
import { composeNotesWithLikedBy, parseLikedBy, stripLikedBy } from './liked-by';

describe('liked-by notes line (F2 v1 — stored inside MealRating.notes)', () => {
  it('composes text + names into one structured line', () => {
    expect(composeNotesWithLikedBy('Great crust.', ['Maria', 'Tom'])).toBe(
      'Great crust.\nLiked by: Maria, Tom',
    );
  });

  it('omits the line entirely when nobody is selected', () => {
    expect(composeNotesWithLikedBy('Just notes.', [])).toBe('Just notes.');
    expect(composeNotesWithLikedBy('', [])).toBe('');
  });

  it('stores names alone when there is no free text', () => {
    expect(composeNotesWithLikedBy('', ['Timmy'])).toBe('Liked by: Timmy');
  });

  it('round-trips: parse + strip recover both halves', () => {
    const stored = composeNotesWithLikedBy('Too spicy for the kids.', ['Maria']);
    expect(parseLikedBy(stored)).toEqual(['Maria']);
    expect(stripLikedBy(stored)).toBe('Too spicy for the kids.');
  });

  it('parses [] from notes without the line, and tolerates null', () => {
    expect(parseLikedBy('no structured line here')).toEqual([]);
    expect(parseLikedBy(null)).toEqual([]);
    expect(stripLikedBy(null)).toBe('');
  });
});
