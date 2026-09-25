// Weeks, streaks, flex tokens, pauses (research §4.2) and deload offers (§1.6).
import { describe, expect, it } from 'vitest';
import type { ProgressionState, ReasonCode, SessionSummaryDto, WeekSummary } from '@chefer/types';
import { deloadContinues, shouldOfferDeload } from './deload';
import { initialState } from './progression';
import { KG_PROFILE, slotFor } from './test-fixtures';
import {
  addDaysLocal,
  daysBetweenLocal,
  goalForWeek,
  settleWeeks,
  summarizeWeeks,
  weekdayOf,
  weekStartOf,
} from './weeks';

describe('local date math (Monday weeks, UTC-parsed)', () => {
  it('finds the Monday of a week, including Sunday/Monday boundaries', () => {
    expect(weekStartOf('2026-09-24')).toBe('2026-09-21'); // Thursday
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28'); // across a year
    expect(weekdayOf('2026-09-21')).toBe(0);
    expect(weekdayOf('2026-09-27')).toBe(6);
  });

  it('is immune to daylight-saving changes (EU 2026-03-29 / 2026-10-25, US 2026-03-08 / 2026-11-01)', () => {
    expect(weekStartOf('2026-03-29')).toBe('2026-03-23');
    expect(addDaysLocal('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysLocal('2026-03-29', 1)).toBe('2026-03-30');
    expect(daysBetweenLocal('2026-03-28', '2026-03-30')).toBe(2);
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
    expect(addDaysLocal('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDaysLocal('2026-10-19', 7)).toBe('2026-10-26');
    expect(daysBetweenLocal('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDaysLocal('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDaysLocal('2026-11-01', -1)).toBe('2026-10-31');
    expect(daysBetweenLocal('2026-03-30', '2026-03-28')).toBe(-2);
  });

  it('rejects malformed dates', () => {
    expect(() => weekStartOf('2026-9-1')).toThrow(/Invalid local date/);
  });

  it('resolves the goal in force for a week', () => {
    const history = [
      { fromWeek: '2026-09-16', goal: 2 }, // mid-week entry applies from its Monday
      { fromWeek: '2026-08-31', goal: 3 },
    ];
    expect(goalForWeek(history, '2026-08-24')).toBe(3);
    expect(goalForWeek(history, '2026-09-07')).toBe(3);
    expect(goalForWeek(history, '2026-09-14')).toBe(2);
    expect(goalForWeek([], '2026-09-14')).toBe(3);
  });
});

const goal3 = [{ fromWeek: '2026-01-05', goal: 3 }];

/** n sessions on the Monday..Wednesday of the week starting `monday`. */
function inWeek(monday: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDaysLocal(monday, i));
}

function statuses(weeks: WeekSummary[]): string[] {
  return weeks.map((w) => w.status);
}

describe('summarizeWeeks', () => {
  it('settles met / under / current weeks and the streak', () => {
    const r = summarizeWeeks({
      sessionDates: [
        ...inWeek('2026-08-31', 3),
        ...inWeek('2026-09-07', 2),
        ...inWeek('2026-09-14', 3),
        '2026-09-22',
      ],
      goalHistory: goal3,
      pauses: [],
      today: '2026-09-24',
      firstWeek: '2026-09-02',
    });
    expect(r.weeks.map((w) => w.weekStart)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ]);
    expect(statuses(r.weeks)).toEqual(['met', 'under', 'met', 'current']);
    expect(r.streak).toEqual({
      current: 1,
      best: 1,
      flexTokens: 0,
      thisWeekSessions: 1,
      thisWeekGoal: 3,
    });
  });

  it('counts the current week once its goal is met', () => {
    const r = summarizeWeeks({
      sessionDates: [...inWeek('2026-09-14', 3), ...inWeek('2026-09-21', 3)],
      goalHistory: goal3,
      pauses: [],
      today: '2026-09-24',
      firstWeek: '2026-09-14',
    });
    expect(statuses(r.weeks)).toEqual(['met', 'met']);
    expect(r.streak.current).toBe(2);
  });

  it('earns a flex token every 4 met weeks (max 2) and auto-spends it on an under-goal week', () => {
    const dates: string[] = [];
    let monday = '2026-06-01';
    for (let i = 0; i < 12; i++) {
      dates.push(...inWeek(monday, 3));
      monday = addDaysLocal(monday, 7);
    }
    // weeks 13–15: 1 session each (two flex weeks, then under)
    for (let i = 0; i < 3; i++) {
      dates.push(monday);
      monday = addDaysLocal(monday, 7);
    }
    const r = summarizeWeeks({
      sessionDates: dates,
      goalHistory: goal3,
      pauses: [],
      today: monday, // week 16, nothing logged yet
      firstWeek: '2026-06-01',
    });
    const tokens = r.weeks.map((w) => w.flexTokens);
    expect(tokens.slice(0, 12)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(statuses(r.weeks).slice(12)).toEqual(['flex', 'flex', 'under', 'current']);
    expect(tokens.slice(12, 15)).toEqual([1, 0, 0]);
    expect(r.streak).toMatchObject({ current: 0, best: 14, flexTokens: 0 });
  });

  it('an empty week breaks the streak even with a token in hand', () => {
    const dates = [
      ...inWeek('2026-06-01', 3),
      ...inWeek('2026-06-08', 3),
      ...inWeek('2026-06-15', 3),
      ...inWeek('2026-06-22', 3),
    ];
    const r = summarizeWeeks({
      sessionDates: dates,
      goalHistory: goal3,
      pauses: [],
      today: '2026-07-08',
      firstWeek: '2026-06-01',
    });
    expect(statuses(r.weeks)).toEqual(['met', 'met', 'met', 'met', 'empty', 'current']);
    expect(r.streak).toMatchObject({ current: 0, best: 4, flexTokens: 1 });
  });

  it('a pause spanning weeks freezes the streak (neither grows nor breaks it)', () => {
    const r = summarizeWeeks({
      sessionDates: [...inWeek('2026-08-31', 3), '2026-09-08', ...inWeek('2026-09-21', 3)],
      goalHistory: goal3,
      pauses: [{ startDate: '2026-09-10', endDate: '2026-09-20' }],
      today: '2026-09-30',
      firstWeek: '2026-08-31',
    });
    expect(statuses(r.weeks)).toEqual(['met', 'paused', 'paused', 'met', 'current']);
    expect(r.streak.current).toBe(2);
  });

  it('a met week inside a pause still counts as met', () => {
    const r = summarizeWeeks({
      sessionDates: inWeek('2026-09-14', 3),
      goalHistory: goal3,
      pauses: [{ startDate: '2026-09-14', endDate: '2026-09-20' }],
      today: '2026-09-22',
      firstWeek: '2026-09-14',
    });
    expect(statuses(r.weeks)).toEqual(['met', 'current']);
  });

  it('a goal change mid-streak applies from its week on', () => {
    const r = summarizeWeeks({
      sessionDates: [
        ...inWeek('2026-08-31', 3),
        ...inWeek('2026-09-07', 3),
        ...inWeek('2026-09-14', 2),
      ],
      goalHistory: [
        { fromWeek: '2026-08-31', goal: 3 },
        { fromWeek: '2026-09-14', goal: 2 },
      ],
      pauses: [],
      today: '2026-09-21',
      firstWeek: '2026-08-31',
    });
    expect(r.weeks.map((w) => [w.goal, w.status])).toEqual([
      [3, 'met'],
      [3, 'met'],
      [2, 'met'],
      [2, 'current'],
    ]);
    expect(r.streak).toMatchObject({ current: 3, thisWeekGoal: 2, thisWeekSessions: 0 });
  });

  it('assigns a Sunday session to the week before a Monday session', () => {
    const r = summarizeWeeks({
      sessionDates: ['2026-09-13', '2026-09-14'],
      goalHistory: [{ fromWeek: '2026-09-07', goal: 1 }],
      pauses: [],
      today: '2026-09-15',
      firstWeek: '2026-09-07',
    });
    expect(r.weeks.map((w) => [w.weekStart, w.sessions, w.status])).toEqual([
      ['2026-09-07', 1, 'met'],
      ['2026-09-14', 1, 'met'],
    ]);
  });

  it('handles DST weeks like any other', () => {
    const r = summarizeWeeks({
      sessionDates: ['2026-03-23', '2026-03-29', '2026-10-19', '2026-10-25'],
      goalHistory: [{ fromWeek: '2026-03-23', goal: 2 }],
      pauses: [],
      today: '2026-10-26',
      firstWeek: '2026-10-19',
    });
    expect(r.weeks.map((w) => [w.weekStart, w.sessions])).toEqual([
      ['2026-10-19', 2],
      ['2026-10-26', 0],
    ]);
  });

  it('returns no weeks before setup, but still reports this week’s goal', () => {
    const r = summarizeWeeks({
      sessionDates: [],
      goalHistory: [{ fromWeek: '2026-09-28', goal: 4 }],
      pauses: [],
      today: '2026-09-24',
      firstWeek: '2026-09-28',
    });
    expect(r.weeks).toEqual([]);
    expect(r.streak).toEqual({
      current: 0,
      best: 0,
      flexTokens: 0,
      thisWeekSessions: 0,
      thisWeekGoal: 4,
    });
  });

  it('settleWeeks clamps a zero goal to 1', () => {
    const r = settleWeeks(
      [{ weekStart: '2026-09-14', goal: 0, sessions: 1, paused: false }],
      '2026-09-21',
    );
    expect(r.weeks[0]).toMatchObject({ goal: 1, status: 'met' });
    expect(settleWeeks([], '2026-09-21').streak.thisWeekGoal).toBe(3);
  });
});

function stateWith(reasonCode: ReasonCode, lastExposureDate: string | null): ProgressionState {
  const s = initialState({
    slot: slotFor('barbell-bench-press', 3, 8, 12),
    profile: KG_PROFILE,
    experience: 'INTERMEDIATE',
    knownWeightKg: 60,
  });
  return { ...s, lastExposureDate, next: { ...s.next, reasonCode } };
}

function metWeeks(n: number, lastMonday: string, current = true): WeekSummary[] {
  const weeks: WeekSummary[] = [];
  for (let i = n - 1; i >= 0; i--) {
    weeks.push({
      weekStart: addDaysLocal(lastMonday, -7 * i),
      goal: 3,
      sessions: 3,
      status: 'met',
      flexTokens: 0,
    });
  }
  if (current) {
    weeks.push({
      weekStart: addDaysLocal(lastMonday, 7),
      goal: 3,
      sessions: 0,
      status: 'current',
      flexTokens: 0,
    });
  }
  return weeks;
}

describe('shouldOfferDeload (research §1.6)', () => {
  const today = '2026-09-24';
  const base = {
    weeks: [] as WeekSummary[],
    experience: 'INTERMEDIATE' as const,
    today,
    firstWeek: '2026-01-05',
  };

  it('reactive: ≥ 3 struggling exercises in the last 7 days', () => {
    const states = [
      stateWith('MISSED_TWICE', '2026-09-22'),
      stateWith('STALL_RESET', '2026-09-18'),
      stateWith('MISSED_TWICE', '2026-09-24'),
      stateWith('ADD_REPS', '2026-09-23'),
    ];
    expect(shouldOfferDeload({ ...base, states })).toEqual({ offer: true, reason: 'reactive' });
  });

  it('reactive: stale, future or missing dates and other reasons do not count', () => {
    const states = [
      stateWith('MISSED_TWICE', '2026-09-22'),
      stateWith('STALL_RESET', '2026-09-17'),
      stateWith('MISSED_TWICE', null),
      stateWith('MISSED_TWICE', '2026-09-25'),
    ];
    expect(shouldOfferDeload({ ...base, states })).toEqual({ offer: false, reason: null });
  });

  it('reactive: 30 % of a large routine is the bar when it exceeds 3', () => {
    const struggling = Array.from({ length: 3 }, () => stateWith('MISSED_TWICE', today));
    const fine = Array.from({ length: 9 }, () => stateWith('ADD_REPS', today));
    expect(shouldOfferDeload({ ...base, states: [...struggling, ...fine] }).offer).toBe(false);
    expect(
      shouldOfferDeload({
        ...base,
        states: [...struggling, stateWith('STALL_RESET', today), ...fine],
      }).offer,
    ).toBe(true);
  });

  it('proactive: intermediates after every 6 consecutive met weeks', () => {
    const lastMonday = '2026-09-14';
    expect(shouldOfferDeload({ ...base, states: [], weeks: metWeeks(6, lastMonday) })).toEqual({
      offer: true,
      reason: 'proactive',
    });
    expect(shouldOfferDeload({ ...base, states: [], weeks: metWeeks(5, lastMonday) }).offer).toBe(
      false,
    );
    expect(shouldOfferDeload({ ...base, states: [], weeks: metWeeks(7, lastMonday) }).offer).toBe(
      false,
    );
    expect(shouldOfferDeload({ ...base, states: [], weeks: metWeeks(12, lastMonday) }).offer).toBe(
      true,
    );
    expect(shouldOfferDeload({ ...base, states: [], weeks: [] }).offer).toBe(false);
  });

  it('proactive: a flex week breaks the run; a stale week list offers nothing', () => {
    const weeks = metWeeks(6, '2026-09-14');
    const withFlex = weeks.map((w, i) => (i === 2 ? { ...w, status: 'flex' as const } : w));
    expect(shouldOfferDeload({ ...base, states: [], weeks: withFlex }).offer).toBe(false);
    expect(
      shouldOfferDeload({ ...base, states: [], weeks: metWeeks(6, '2026-08-17', false) }).offer,
    ).toBe(false);
  });

  it('proactive: beginners only after their first 12 weeks', () => {
    const weeks = metWeeks(6, '2026-09-14');
    expect(
      shouldOfferDeload({
        ...base,
        experience: 'BEGINNER',
        states: [],
        weeks,
        firstWeek: '2026-08-03',
      }).offer,
    ).toBe(false);
    expect(
      shouldOfferDeload({
        ...base,
        experience: 'BEGINNER',
        states: [],
        weeks,
        firstWeek: '2026-06-01',
      }).offer,
    ).toBe(true);
  });
});

describe('deloadContinues', () => {
  const s = (
    id: string,
    localDate: string,
    isDeload: boolean,
    status: SessionSummaryDto['status'] = 'COMPLETED',
  ): SessionSummaryDto => ({
    id,
    name: 'x',
    routineDayId: null,
    status,
    localDate,
    startedAt: `${localDate}T10:00:00.000Z`,
    finishedAt: null,
    isDeload,
    exercises: [],
  });

  it('a deload week lasts the routine’s days-per-week sessions', () => {
    const two = [
      s('a', '2026-09-20', false),
      s('b', '2026-09-22', true),
      s('c', '2026-09-23', true),
    ];
    expect(deloadContinues(two, 3)).toBe(true);
    expect(deloadContinues([...two, s('d', '2026-09-24', true)], 3)).toBe(false);
    expect(deloadContinues([...two, s('e', '2026-09-24', true, 'DISCARDED')], 3)).toBe(true);
    expect(deloadContinues([s('f', '2026-09-24', true), s('g', '2026-09-24', true)], 0)).toBe(
      false,
    );
    expect(deloadContinues([], 3)).toBe(true);
  });
});
