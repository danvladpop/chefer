// Guardrail 1, catalogue half: nothing a user can earn or be asked to do is
// named after eating less or weighing less.
import { describe, expect, it } from 'vitest';
import { PROGRESS_EVENT_KINDS, QUEST_KINDS, RECEIPT_LINE_CODES } from '@chefer/types';
import { ACHIEVEMENTS } from './achievements';

const FORBIDDEN = /KCAL|CALORIE|WEIGHT|UNDER|DEFICIT|LOSE/i;
/** The lifted weight on the bar, not body weight. */
const ALLOWED = new Set(['PR_WEIGHT']);

function offenders(names: readonly string[]): string[] {
  return names.filter((n) => !ALLOWED.has(n) && FORBIDDEN.test(n));
}

describe('catalogue guard', () => {
  it('no progress event kind', () => expect(offenders(PROGRESS_EVENT_KINDS)).toEqual([]));
  it('no receipt line code', () => expect(offenders(RECEIPT_LINE_CODES)).toEqual([]));
  it('no quest kind', () => expect(offenders(QUEST_KINDS)).toEqual([]));
  it('no achievement id or metric', () => {
    expect(offenders(ACHIEVEMENTS.map((a) => a.id))).toEqual([]);
    expect(offenders(ACHIEVEMENTS.map((a) => a.metric))).toEqual([]);
  });

  it('the guard itself catches the bad names', () => {
    expect(offenders(['KCAL_UNDER', 'WEIGHT_LOST', 'PR_WEIGHT', 'DEFICIT_DAY', 'COOK'])).toEqual([
      'KCAL_UNDER',
      'WEIGHT_LOST',
      'DEFICIT_DAY',
    ]);
  });
});
