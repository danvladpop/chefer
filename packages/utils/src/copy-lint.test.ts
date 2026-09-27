// Belt-and-braces half of T-00.6 (technical-plan.md §2.10): the
// `chefer/no-forbidden-copy` ESLint rule scans string literals statically,
// which a template literal built at runtime can dodge. This test instead
// walks the actual exported string *values* of the shared copy modules, so a
// forbidden phrase can't sneak in through string concatenation either.
import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import { PREMIUM_PITCH_COPY } from './premium-pitch';
import { SAFETY_COPY } from './safety-copy';
import { WELLNESS_COPY } from './wellness-copy';

const COPY_MODULES: Record<string, Record<string, string>> = {
  'safety-copy': SAFETY_COPY,
  'wellness-copy': WELLNESS_COPY,
  'premium-pitch': PREMIUM_PITCH_COPY,
};

describe('copy modules never carry a forbidden phrase', () => {
  for (const [name, copy] of Object.entries(COPY_MODULES)) {
    it(`${name} — every exported string is clean`, () => {
      for (const [key, value] of Object.entries(copy)) {
        const phrase = containsForbiddenPhrase(value);
        expect(phrase, `${name}.${key} contains "${String(phrase)}": ${value}`).toBeNull();
      }
    });
  }

  it('the checker itself catches a known-bad sentence (sanity check)', () => {
    expect(containsForbiddenPhrase('This recipe is 100% safe for everyone.')).toBe('safe');
    expect(containsForbiddenPhrase('You missed 2 days this week.')).toBe('missed');
    expect(containsForbiddenPhrase('Checked for tree nuts (Luca).')).toBeNull();
  });
});
