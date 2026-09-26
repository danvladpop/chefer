import { describe, expect, it } from 'vitest';
import { pastWeeks } from './my-weeks';

// Server stores Monday midnight in its own zone: 21:00Z the evening before
// for UTC+3, as seen in the audit (F-PLAN-6-3).
const monday = (iso: string) => `${iso}T21:00:00.000Z`;
const plan = (id: string, weekStart: string, createdAt: string, status = 'ARCHIVED') => ({
  id,
  weekStartDate: monday(weekStart),
  createdAt,
  status,
});

// "Now" is Saturday 26 Sep 2026: the week of Mon 21 Sep is still running.
const NOW = new Date('2026-09-26T10:00:00Z');

describe('pastWeeks', () => {
  it('drops the current and future weeks (next week, 2027)', () => {
    const plans = [
      plan('current', '2026-09-20', '2026-09-21T08:00:00Z', 'ACTIVE'),
      plan('next', '2026-09-27', '2026-09-26T08:00:00Z', 'ACTIVE'),
      plan('far', '2027-09-19', '2026-09-22T08:00:00Z'),
      plan('last', '2026-09-13', '2026-09-14T08:00:00Z'),
    ];
    expect(pastWeeks(plans, NOW).map((p) => p.id)).toEqual(['last']);
  });

  it('keeps one card per week: the latest regenerate', () => {
    const plans = [
      plan('first', '2026-09-13', '2026-09-14T08:00:00Z'),
      plan('regen', '2026-09-13', '2026-09-15T08:00:00Z'),
      plan('carry', '2026-09-13', '2026-09-14T09:00:00Z'),
    ];
    expect(pastWeeks(plans, NOW).map((p) => p.id)).toEqual(['regen']);
  });

  it('prefers the ACTIVE copy of a week over a newer archived one', () => {
    const plans = [
      plan('active', '2026-09-13', '2026-09-14T08:00:00Z', 'ACTIVE'),
      plan('newer', '2026-09-13', '2026-09-16T08:00:00Z'),
    ];
    expect(pastWeeks(plans, NOW).map((p) => p.id)).toEqual(['active']);
  });

  it('sorts by week, newest first, not by creation time', () => {
    const plans = [
      plan('aug', '2026-08-30', '2026-09-20T08:00:00Z'),
      plan('sep', '2026-09-13', '2026-09-14T08:00:00Z'),
      plan('sep6', '2026-09-06', '2026-09-07T08:00:00Z'),
    ];
    expect(pastWeeks(plans, NOW).map((p) => p.id)).toEqual(['sep', 'sep6', 'aug']);
  });

  it('a week becomes past once its Sunday is over', () => {
    const weekOf21 = plan('w21', '2026-09-20', '2026-09-21T08:00:00Z', 'ACTIVE');
    expect(pastWeeks([weekOf21], new Date('2026-09-27T12:00:00Z'))).toEqual([]);
    expect(pastWeeks([weekOf21], new Date('2026-09-28T06:00:00Z'))).toEqual([weekOf21]);
  });

  it('accepts Date objects and ignores unparseable dates', () => {
    const plans = [
      {
        id: 'd',
        weekStartDate: new Date(monday('2026-09-06')),
        createdAt: new Date(),
        status: 'ARCHIVED',
      },
      { id: 'bad', weekStartDate: 'not a date', createdAt: '2026-09-01', status: 'ARCHIVED' },
    ];
    expect(pastWeeks(plans, NOW).map((p) => p.id)).toEqual(['d']);
  });
});
