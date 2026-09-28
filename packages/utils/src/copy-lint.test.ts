// Belt-and-braces half of T-00.6 (technical-plan.md §2.10): the
// `chefer/no-forbidden-copy` ESLint rule scans string literals statically,
// which a template literal built at runtime can dodge. This test instead
// walks the actual exported string *values* of the shared copy modules, so a
// forbidden phrase can't sneak in through string concatenation either.
import { describe, expect, it } from 'vitest';
import { containsForbiddenPhrase } from '@chefer/eslint-config/rules/no-forbidden-copy';
import { PLAN_TAILORING_COPY } from './plan-tailoring';
import { PREMIUM_PITCH_COPY } from './premium-pitch';
import { SAFETY_COPY } from './safety-copy';
import { WELLNESS_COPY } from './wellness-copy';

const COPY_MODULES: Record<string, Record<string, string>> = {
  'safety-copy': SAFETY_COPY,
  'wellness-copy': WELLNESS_COPY,
  'premium-pitch': PREMIUM_PITCH_COPY,
  'plan-tailoring': PLAN_TAILORING_COPY,
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

  // UX-22 (T-22.2/T-22.3): the mandatory disclaimer text DISCLAIMS medical
  // advice ("not medical advice", "doesn't give medical advice") — the
  // opposite of the CLAIM the rule exists to catch — so it must be exempt,
  // while an actual claim anywhere else in the same string still isn't.
  it('the disclaimer wording itself ("not medical advice") is allowed', () => {
    expect(containsForbiddenPhrase('Not medical advice — check with your GP.')).toBeNull();
    expect(
      containsForbiddenPhrase(
        "Chefer offers general healthy-eating and training guidance. It isn't a medical device and doesn't give medical advice.",
      ),
    ).toBeNull();
    // The allowance is exact and narrow, not a general negation heuristic —
    // an unrelated forbidden phrase in the same string is still caught.
    expect(containsForbiddenPhrase('Not medical advice, but this diet cures everything.')).toBe(
      'cures',
    );
  });
});
