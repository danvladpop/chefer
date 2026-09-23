import { describe, expect, it } from 'vitest';
import { capConfidence, captionStatesServings } from './servings.js';

describe('captionStatesServings', () => {
  it.each([
    'Serves 4',
    'serves: 6',
    'Makes 12 portions',
    'Yields 8',
    'This recipe makes 4 servings',
    '4 servings of goodness',
  ])('accepts an explicit count: %s', (caption) => {
    expect(captionStatesServings(caption)).toBe(true);
  });

  it.each([
    // The measured case — a portion size, not a yield. This is exactly what
    // forces the model to guess, so it must NOT count as stated.
    '📊 Macros Per Serving (about 3 tenders w/ ranch)\n406 Calories',
    '1.5 lbs chicken tenderloins\n406 cal per serving',
    'High protein chicken tenders #recipe',
    '',
  ])('rejects a caption with no stated yield: %s', (caption) => {
    expect(captionStatesServings(caption)).toBe(false);
  });
});

describe('capConfidence', () => {
  it('lowers a claim above the ceiling', () => {
    expect(capConfidence('high', 'medium')).toBe('medium');
    expect(capConfidence('high', 'low')).toBe('low');
  });

  it('leaves a claim at or below the ceiling alone', () => {
    expect(capConfidence('low', 'medium')).toBe('low');
    expect(capConfidence('medium', 'medium')).toBe('medium');
  });
});
