import { describe, expect, it } from 'vitest';
import type { MealPlanTailoring } from '@chefer/database';
import {
  lockedSlotIndexes,
  mergeTailoredDay,
  tailoringDayOrder,
  TailoringTimeoutError,
  toTailoringDto,
  weekOffsetOf,
  withDeadline,
} from './plan-tailoring.js';

const day = (dayOfWeek: number, meals: unknown[]) => ({ dayOfWeek, meals });
const slot = (type: string, recipeId: string, extra: Record<string, unknown> = {}) => ({
  type,
  recipeId,
  ...extra,
});
const fullWeek = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, [slot('dinner', `r${d}`)]));

describe('tailoringDayOrder', () => {
  it('current week: today first, then the following days; past days are left alone', () => {
    expect(tailoringDayOrder(fullWeek, 0, 3)).toEqual([3, 4, 5, 6]);
  });

  it('next week: Monday first', () => {
    expect(tailoringDayOrder(fullWeek, 1, 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('skips unplanned days (no meals)', () => {
    const week = fullWeek.map((d) => (d.dayOfWeek === 5 ? day(5, []) : d));
    expect(tailoringDayOrder(week, 1, 0)).toEqual([0, 1, 2, 3, 4, 6]);
  });
});

describe('weekOffsetOf', () => {
  it('counts whole weeks from the current Monday', () => {
    const monday = new Date(2026, 8, 28);
    expect(weekOffsetOf(new Date(2026, 9, 5), monday)).toBe(1);
    expect(weekOffsetOf(new Date(2026, 8, 28), monday)).toBe(0);
  });
});

describe('lockedSlotIndexes', () => {
  it("locks the user's picks and both halves of a leftovers pair", () => {
    const week = [
      day(0, [slot('breakfast', 'b0'), slot('lunch', 'l0'), slot('dinner', 'd0')]),
      day(1, [
        slot('breakfast', 'b1', { pinned: true }),
        slot('lunch', 'd0', { leftoverOf: 'Monday' }),
        slot('dinner', 'd1'),
      ]),
    ];
    // Monday's dinner feeds Tuesday's leftovers lunch.
    expect([...lockedSlotIndexes(week, 0)]).toEqual([2]);
    expect([...lockedSlotIndexes(week, 1)].sort()).toEqual([0, 1]);
  });
});

describe('mergeTailoredDay', () => {
  const current = [
    slot('breakfast', 'cb', { pinned: true }),
    slot('lunch', 'cl', { portion: 1.5 }),
    slot('dinner', 'cd'),
    slot('snack', 'cs'),
  ];
  const locked = new Set([0]);

  it('keeps locked slots verbatim and takes the AI for everything else', () => {
    const ai = [slot('breakfast', 'ab'), slot('lunch', 'al'), slot('dinner', 'ad')];
    expect(mergeTailoredDay(current, locked, ai, ['breakfast', 'lunch', 'dinner'])).toEqual([
      slot('breakfast', 'cb', { pinned: true }),
      slot('lunch', 'al'),
      slot('dinner', 'ad'),
    ]);
  });

  it('never makes a day emptier: a main the AI left out keeps its curated slot', () => {
    const ai = [slot('lunch', 'al')];
    expect(mergeTailoredDay(current, new Set(), ai, ['breakfast', 'lunch', 'dinner'])).toEqual([
      slot('breakfast', 'cb', { pinned: true }),
      slot('lunch', 'al'),
      slot('dinner', 'cd'),
    ]);
  });

  it('drops AI meal types the plan shape does not want', () => {
    const dinnersOnly = [slot('dinner', 'cd')];
    const ai = [slot('breakfast', 'ab'), slot('dinner', 'ad')];
    expect(mergeTailoredDay(dinnersOnly, new Set(), ai, ['dinner'])).toEqual([
      slot('dinner', 'ad'),
    ]);
  });

  it('null when the AI contributed nothing usable', () => {
    expect(mergeTailoredDay(current, locked, [slot('breakfast', 'ab')], ['breakfast'])).toBeNull();
  });
});

describe('toTailoringDto', () => {
  const row = {
    status: 'RUNNING',
    tailoredDays: [3],
    totalDays: 4,
    currentDay: 4,
    queuedDays: [4, 5, 6],
    keptDays: [],
    failedDays: [],
    resumes: 0,
  } as unknown as MealPlanTailoring;

  it('maps a running job', () => {
    expect(toTailoringDto(row, 'ACTIVE', [4, 5, 6])).toEqual({
      status: 'RUNNING',
      tailoredDays: [3],
      totalDays: 4,
      currentDay: 4,
      queuedDays: [4, 5, 6],
      keptDays: [],
      canResume: false,
    });
  });

  it('a stopped job lists failed + unreached days and may resume while the plan is current', () => {
    const partial = {
      ...row,
      status: 'PARTIAL',
      queuedDays: [6],
      failedDays: [5],
    } as unknown as MealPlanTailoring;
    expect(toTailoringDto(partial, 'ACTIVE', [5, 6])).toMatchObject({
      status: 'PARTIAL',
      currentDay: null,
      queuedDays: [6, 5],
      canResume: true,
    });
    expect(toTailoringDto(partial, 'ARCHIVED', [5, 6])?.canResume).toBe(false);
    expect(toTailoringDto({ ...partial, resumes: 3 }, 'ACTIVE', [5, 6])?.canResume).toBe(false);
    expect(toTailoringDto(partial, 'ACTIVE', [])?.canResume).toBe(false);
  });

  it('shows nothing for a cancelled job or a superseded running one', () => {
    expect(toTailoringDto({ ...row, status: 'CANCELLED' } as never, 'ACTIVE', [])).toBeNull();
    expect(toTailoringDto(row, 'ARCHIVED', [])).toBeNull();
  });
});

describe('withDeadline', () => {
  it('rejects with a TailoringTimeoutError past the budget', async () => {
    await expect(withDeadline(new Promise(() => undefined), 5)).rejects.toBeInstanceOf(
      TailoringTimeoutError,
    );
    await expect(withDeadline(Promise.resolve(1), 50)).resolves.toBe(1);
  });
});
