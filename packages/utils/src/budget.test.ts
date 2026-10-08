import { describe, expect, it } from 'vitest';
import {
  MAX_WEEKLY_BUDGET_EUR,
  parseWeeklyBudget,
  weeklyBudgetCap,
  weeklyBudgetCapLabel,
} from './budget';

describe('parseWeeklyBudget (UX-ACC-23)', () => {
  it('treats blank as "no budget"', () => {
    expect(parseWeeklyBudget('', 'EUR')).toEqual({ kind: 'empty' });
    expect(parseWeeklyBudget('   ', 'EUR')).toEqual({ kind: 'empty' });
  });

  it('accepts a plain amount, with a comma or a dot', () => {
    expect(parseWeeklyBudget('60', 'EUR')).toEqual({ kind: 'ok', eur: 60 });
    expect(parseWeeklyBudget('60,5', 'EUR')).toEqual({ kind: 'ok', eur: 60.5 });
    expect(parseWeeklyBudget(' 60.25 ', 'EUR')).toEqual({ kind: 'ok', eur: 60.25 });
  });

  it('rejects text instead of erasing the saved budget', () => {
    for (const text of ['abc', '12abc', '-5', '1e3', '1.234', '6 0']) {
      expect(parseWeeklyBudget(text, 'EUR').kind).toBe('error');
    }
    expect(parseWeeklyBudget('0', 'EUR').kind).toBe('error');
  });

  it('rejects an amount over the cap instead of silently storing the cap', () => {
    const result = parseWeeklyBudget('5000', 'EUR');
    expect(result).toEqual({ kind: 'error', message: 'The most you can set is €2000 a week.' });
    expect(parseWeeklyBudget('2000', 'EUR')).toEqual({ kind: 'ok', eur: 2000 });
  });

  it('applies the cap in the display currency and never sends more than the EUR cap', () => {
    const cap = weeklyBudgetCap('USD');
    expect(cap).toBeGreaterThan(MAX_WEEKLY_BUDGET_EUR - 1);
    const atCap = parseWeeklyBudget(String(cap), 'USD');
    expect(atCap.kind).toBe('ok');
    if (atCap.kind === 'ok') expect(atCap.eur).toBeLessThanOrEqual(MAX_WEEKLY_BUDGET_EUR);
    expect(parseWeeklyBudget(String(cap + 1), 'USD').kind).toBe('error');
  });

  it('labels the cap', () => {
    expect(weeklyBudgetCapLabel('EUR')).toBe('Up to €2000 a week');
  });
});
