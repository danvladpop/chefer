import { describe, expect, it } from 'vitest';
import { applySafetyTerm, keepSafetyTermAsNote } from './safety-add-term';

const EMPTY = { dietaryRestrictions: [], allergies: [], dislikedIngredients: [] };

describe('applySafetyTerm', () => {
  it('ignores blank input', () => {
    expect(applySafetyTerm(EMPTY, '   ')).toEqual({ status: 'empty' });
  });

  it('adds a recognised allergen to the allergy list (UX-ACC-01: "sesame")', () => {
    const outcome = applySafetyTerm(EMPTY, ' sesame ');
    expect(outcome.status).toBe('applied');
    if (outcome.status !== 'applied') return;
    expect(outcome.value.allergies.join(',').toLowerCase()).toContain('sesame');
    expect(outcome.message.length).toBeGreaterThan(0);
  });

  it('keeps what was already selected', () => {
    const outcome = applySafetyTerm({ ...EMPTY, allergies: ['Peanuts'] }, 'sesame');
    expect(outcome.status).toBe('applied');
    if (outcome.status !== 'applied') return;
    expect(outcome.value.allergies).toContain('Peanuts');
    expect(outcome.value.allergies.length).toBe(2);
  });

  it('asks for a decision on an unrecognised term instead of dropping it', () => {
    expect(applySafetyTerm(EMPTY, 'zzzqqq')).toEqual({
      status: 'needs-decision',
      variant: 'unrecognised',
      term: 'zzzqqq',
    });
  });
});

describe('keepSafetyTermAsNote', () => {
  it('stores the term as a literal note', () => {
    const next = keepSafetyTermAsNote(EMPTY, 'zzzqqq');
    expect(JSON.stringify(next)).toContain('zzzqqq');
  });
});
