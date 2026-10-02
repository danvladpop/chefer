import { describe, expect, it } from 'vitest';
import {
  conflictText,
  splitCheckedByVerification,
  taggedOnlyLineText,
  warningsHeadline,
  warningText,
} from './safety-copy';

describe('conflictText (UX-PLAN-06: a diet reads as what the dish is not)', () => {
  it('names the offending ingredient: "Not paleo: contains quinoa"', () => {
    expect(conflictText({ label: 'Paleo', kind: 'diet', ingredients: ['quinoa'] })).toBe(
      'Not paleo: contains quinoa',
    );
  });

  it('works without details by recognising the diet label', () => {
    expect(conflictText({ label: 'Vegetarian' })).toBe('Not vegetarian');
    expect(conflictText({ label: 'Gluten-free' })).toBe('Not gluten-free');
  });

  it('says why a limit failed', () => {
    expect(
      conflictText({
        label: 'Keto',
        kind: 'diet',
        ingredients: [],
        reason: '22 g net carbs per serving',
      }),
    ).toBe('Not keto: 22 g net carbs per serving');
  });

  it('caps the ingredient list at three', () => {
    expect(
      conflictText({
        label: 'Paleo',
        kind: 'diet',
        ingredients: ['rice', 'beans', 'cheese', 'sugar'],
      }),
    ).toBe('Not paleo: contains rice, beans, cheese');
  });

  it('an allergy still reads "Contains …", with the ingredient when it differs', () => {
    expect(conflictText({ label: 'Peanut', kind: 'allergy', ingredients: ['peanut butter'] })).toBe(
      'Contains peanut: peanut butter',
    );
    expect(conflictText({ label: 'Peanut' })).toBe('Contains peanut');
  });
});

describe('warnings from older API responses', () => {
  it('turns "non-paleo" into "Not paleo" and allergens into "Contains …"', () => {
    expect(warningText('non-paleo')).toBe('Not paleo');
    expect(warningText('peanut')).toBe('Contains peanut');
    expect(warningsHeadline(['non-paleo', 'non-vegetarian', 'peanut'])).toBe(
      'Not paleo or vegetarian · Contains peanut',
    );
    expect(warningsHeadline(['gluten'])).toBe('Contains gluten');
  });
});

describe('tag-only passes (UX-REC-01)', () => {
  it('splits taggedOnly out of checked', () => {
    const { verified, taggedOnly } = splitCheckedByVerification({
      checked: [
        { label: 'Vegetarian', who: 'you' },
        { label: 'Paleo', who: 'you' },
      ],
      taggedOnly: [{ label: 'Paleo', who: 'you' }],
    });
    expect(verified).toEqual([{ label: 'Vegetarian', who: 'you' }]);
    expect(taggedOnly).toEqual([{ label: 'Paleo', who: 'you' }]);
  });

  it('keeps everything verified when an older API sends no taggedOnly', () => {
    const { verified, taggedOnly } = splitCheckedByVerification({
      checked: [{ label: 'Paleo', who: 'you' }],
    });
    expect(verified).toHaveLength(1);
    expect(taggedOnly).toEqual([]);
  });

  it('labels them "Tagged paleo (not verified)", never "Checked"', () => {
    expect(taggedOnlyLineText([{ label: 'Paleo', who: 'you' }])).toBe(
      'Tagged paleo (not verified)',
    );
    expect(
      taggedOnlyLineText([
        { label: 'Paleo', who: 'you' },
        { label: 'Keto', who: 'Mia' },
      ]),
    ).toBe('Tagged paleo and keto (not verified)');
  });
});
