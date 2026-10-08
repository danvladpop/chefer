import type { DisplayCurrency } from '@chefer/types';
import { currencySymbol, fromEur, toEur } from './currency';

// UX-ACC-23: the weekly budget field used to turn "abc" into "no budget" (and
// say "Saved ✓"), and silently stored 5,000 as 2,000. Both clients now parse
// the typed text with this one function and show the result inline.

/** The API's ceiling for `weeklyBudgetEur` (preferences.router.ts: `.max(2000)`). */
export const MAX_WEEKLY_BUDGET_EUR = 2000;

export type BudgetInput =
  /** Blank: the user is removing the budget (an explicit, valid choice). */
  { kind: 'empty' } | { kind: 'ok'; eur: number } | { kind: 'error'; message: string };

/** The largest whole amount the user can type in `currency`, e.g. 2000 for EUR. */
export function weeklyBudgetCap(currency: DisplayCurrency): number {
  return Math.floor(fromEur(MAX_WEEKLY_BUDGET_EUR, currency));
}

function capAmount(currency: DisplayCurrency): string {
  const symbol = currencySymbol(currency);
  return `${symbol.length > 1 ? `${symbol} ` : symbol}${String(weeklyBudgetCap(currency))}`;
}

/** "Up to €2000 a week" — shown under the field so the cap is never a surprise. */
export function weeklyBudgetCapLabel(currency: DisplayCurrency): string {
  return `Up to ${capAmount(currency)} a week`;
}

const AMOUNT = /^\d+(?:[.,]\d{1,2})?$/;

export function parseWeeklyBudget(text: string, currency: DisplayCurrency): BudgetInput {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (!AMOUNT.test(trimmed)) {
    return { kind: 'error', message: 'Enter a weekly amount as a number, for example 60.' };
  }
  const amount = Number(trimmed.replace(',', '.'));
  if (!(amount > 0)) {
    return {
      kind: 'error',
      message: 'Enter an amount above zero, or leave it empty for no budget.',
    };
  }
  if (amount > weeklyBudgetCap(currency)) {
    return { kind: 'error', message: `The most you can set is ${capAmount(currency)} a week.` };
  }
  return { kind: 'ok', eur: Math.min(MAX_WEEKLY_BUDGET_EUR, toEur(amount, currency)) };
}
