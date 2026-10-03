import { describe, expect, it } from 'vitest';
import {
  cantCheckLine,
  checkedForChipA11yLabel,
  checkedForChipText,
  checkedForLineText,
  conditionNoticeText,
  conflictConfirmBody,
  conflictConfirmTitle,
  filteredForLineText,
  memberSummaryLine,
  pickerFooterText,
  reportSentSnackbarText,
  tableSummaryLine,
  unrecognisedNoticeText,
} from './safety-copy';

describe('safety-copy builders', () => {
  it('checkedForLineText joins rules with the who in parentheses', () => {
    expect(
      checkedForLineText([
        { label: 'Tree nuts', who: 'Luca' },
        { label: 'Fish', who: 'Ana' },
        { label: 'Vegetarian', who: 'you' },
      ]),
    ).toBe('Checked for Tree nuts (Luca) · Fish (Ana) · Vegetarian (you)');
  });

  it('checkedForChipText is the compact count', () => {
    expect(checkedForChipText(3)).toBe('3 checks passed');
    expect(checkedForChipText(1)).toBe('1 check passed');
  });

  it('checkedForChipA11yLabel spells the rules out', () => {
    expect(checkedForChipA11yLabel(['tree nuts', 'fish', 'vegetarian'])).toBe(
      'Checked for tree nuts, fish and vegetarian',
    );
    expect(checkedForChipA11yLabel(['tree nuts'])).toBe('Checked for tree nuts');
    expect(checkedForChipA11yLabel([])).toBe('Checked for your table');
  });

  it('cantCheckLine names the kept note', () => {
    expect(cantCheckLine('low sugar')).toBe('Can’t check: “low sugar”');
  });

  it('filteredForLineText states the hidden count', () => {
    expect(filteredForLineText('vegan + gluten-free', 14)).toBe(
      'Filtered for vegan + gluten-free · 14 hidden',
    );
  });

  it('pickerFooterText singularises one hidden recipe', () => {
    expect(pickerFooterText(1)).toBe('1 recipe hidden because they don’t fit your table');
    expect(pickerFooterText(3)).toBe('3 recipes hidden because they don’t fit your table');
  });

  it('tableSummaryLine reads back who each rule is for', () => {
    expect(
      tableSummaryLine(4, [
        { label: 'tree nuts', who: 'Luca' },
        { label: 'fish', who: 'Ana' },
      ]),
    ).toBe('4 at the table · we’ll check for tree nuts (Luca) and fish (Ana)');
    expect(tableSummaryLine(1, [])).toBe('1 at the table');
  });

  it('conflict confirm copy names the allergen and the day', () => {
    expect(conflictConfirmTitle('tree nuts')).toBe('Contains tree nuts');
    expect(conflictConfirmBody('Luca', 'tree nuts', 'Tuesday')).toBe(
      'Luca is allergic to tree nuts. Add it to Tuesday anyway?',
    );
  });

  it('reportSentSnackbarText names the recipe', () => {
    expect(reportSentSnackbarText('Greek Yogurt Parfait')).toBe(
      'Thanks. We’ve hidden Greek Yogurt Parfait from your plans and will check it.',
    );
  });

  it('unrecognisedNoticeText and conditionNoticeText never promise safety', () => {
    expect(unrecognisedNoticeText('zzz')).toContain('zzz');
    expect(conditionNoticeText('pre-diabetes')).toContain('pre-diabetes');
    expect(conditionNoticeText('pre-diabetes')).not.toMatch(/\bmedical advice\b/i);
  });

  it('memberSummaryLine omits empty parts', () => {
    expect(
      memberSummaryLine({
        portionLabel: '½',
        allergies: ['Tree nuts'],
        diet: 'Vegetarian',
        dislikes: ['Fish'],
      }),
    ).toBe('½ portion · allergic: Tree nuts · Vegetarian · won’t eat: Fish');
    expect(memberSummaryLine({ portionLabel: '1', allergies: [], dislikes: [] })).toBe('1 portion');
  });
});
