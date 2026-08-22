import { describe, expect, it } from 'vitest';
import { parseStepDuration } from './cook-mode-utils';

describe('parseStepDuration (P1-3 inline timers)', () => {
  it('parses simple minute durations', () => {
    expect(parseStepDuration('Simmer covered for 15 minutes.')).toBe(15 * 60);
    expect(parseStepDuration('Poach for 3 min.')).toBe(3 * 60);
  });

  it('uses the upper bound of a range — better an over-timer than raw food', () => {
    expect(parseStepDuration('Roast for 12-15 minutes until golden.')).toBe(15 * 60);
    expect(parseStepDuration('Bake 25–30 min.')).toBe(30 * 60);
  });

  it('parses hours', () => {
    expect(parseStepDuration('Marinate for 1 hour.')).toBe(3600);
    expect(parseStepDuration('Slow-cook 2 hrs.')).toBe(2 * 3600);
  });

  it('returns null when no duration is mentioned', () => {
    expect(parseStepDuration('Season with salt and pepper.')).toBeNull();
    expect(parseStepDuration('Serve immediately.')).toBeNull();
  });

  it('ignores absurd durations', () => {
    expect(parseStepDuration('Ferment for 48 hours.')).toBeNull();
  });
});
