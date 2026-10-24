import { describe, expect, it } from 'vitest';
import { addDaysLocal } from '../gym/weeks';
import { metWeekStarts, summarizeFlame } from './flame';

// 2026-10-21 is a Wednesday; its week starts Monday 2026-10-19.
const TODAY = '2026-10-21';
const THIS_WEEK = '2026-10-19';

/** `n` consecutive active days starting at the Monday of `weekStart`. */
const activeIn = (weekStart: string, n: number) =>
  Array.from({ length: n }, (_, i) => addDaysLocal(weekStart, i));

/** Active days in each of `count` weeks ending at the week before this one. */
function metWeeks(count: number, perWeek = 3): string[] {
  const out: string[] = [];
  for (let i = count; i >= 1; i -= 1)
    out.push(...activeIn(addDaysLocal(THIS_WEEK, -7 * i), perWeek));
  return out;
}

const base = { goalHistory: [], pauses: [], today: TODAY, level: 1, training: null };

describe('summarizeFlame: this week', () => {
  it('a brand new user has an empty flame and the default goal', () => {
    const f = summarizeFlame({ ...base, activeDates: [] });
    expect(f).toMatchObject({
      current: 0,
      best: 0,
      pilotLights: 0,
      pilotLightMax: 2,
      goal: 3,
      pausedUntil: null,
      nextMilestone: 4,
      training: null,
    });
    expect(f.thisWeek).toEqual({
      weekStart: THIS_WEEK,
      activeDays: 0,
      goal: 3,
      met: false,
      days: ['rest', 'rest', 'today', 'future', 'future', 'future', 'future'],
    });
    expect(f.weeks).toHaveLength(1);
  });

  it('marks active, rest, today and future days', () => {
    const f = summarizeFlame({ ...base, activeDates: ['2026-10-19', '2026-10-21'] });
    expect(f.thisWeek.days).toEqual([
      'active',
      'rest',
      'active',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(f.thisWeek.activeDays).toBe(2);
    expect(f.thisWeek.met).toBe(false);
    expect(f.current).toBe(0);
  });

  it('meeting the goal counts the current week at once', () => {
    const f = summarizeFlame({ ...base, activeDates: activeIn(THIS_WEEK, 3) });
    expect(f.thisWeek.met).toBe(true);
    expect(f.current).toBe(1);
    expect(f.best).toBe(1);
    expect(metWeekStarts(f.weeks)).toEqual([THIS_WEEK]);
  });
});

describe('summarizeFlame: history', () => {
  it('starts at the week of the earliest active date (late-synced back-dating)', () => {
    const f = summarizeFlame({ ...base, activeDates: [...metWeeks(5), ...activeIn(THIS_WEEK, 3)] });
    expect(f.weeks).toHaveLength(6);
    expect(f.weeks[0]?.weekStart).toBe(addDaysLocal(THIS_WEEK, -35));
    expect(f.current).toBe(6);
    expect(f.best).toBe(6);
  });

  it('dates are order-independent and duplicates count once', () => {
    const dates = [...activeIn(THIS_WEEK, 3), ...activeIn(THIS_WEEK, 3)].reverse();
    const f = summarizeFlame({ ...base, activeDates: dates });
    expect(f.thisWeek.activeDays).toBe(3);
  });

  it('a goal change mid-history applies from its week only', () => {
    const lastWeek = addDaysLocal(THIS_WEEK, -7);
    const twoAgo = addDaysLocal(THIS_WEEK, -14);
    const f = summarizeFlame({
      ...base,
      activeDates: [...activeIn(twoAgo, 2), ...activeIn(lastWeek, 3), ...activeIn(THIS_WEEK, 4)],
      goalHistory: [
        { fromWeek: twoAgo, goal: 2 },
        { fromWeek: lastWeek, goal: 5 },
      ],
    });
    expect(f.weeks.map((w) => [w.goal, w.status])).toEqual([
      [2, 'met'],
      [5, 'under'],
      [5, 'current'],
    ]);
    expect(f.goal).toBe(5);
    expect(f.current).toBe(0);
    expect(f.best).toBe(1);
  });

  it('a missed week falls to rest: the flame resets but best stays', () => {
    const f = summarizeFlame({
      ...base,
      activeDates: [
        ...activeIn(addDaysLocal(THIS_WEEK, -21), 3),
        ...activeIn(addDaysLocal(THIS_WEEK, -14), 3),
      ],
    });
    expect(f.best).toBe(2);
    expect(f.current).toBe(0);
  });
});

describe('summarizeFlame: pilot lights', () => {
  it('earns one every 4 met weeks and spends it on a zero-activity week', () => {
    const four = metWeeks(5).slice(0, 12); // weeks -5..-2 (4 weeks x 3 days)
    const f = summarizeFlame({ ...base, activeDates: four });
    // weeks: -5,-4,-3,-2 met, -1 empty (covered), current
    expect(f.weeks.map((w) => w.status)).toEqual(['met', 'met', 'met', 'met', 'flex', 'current']);
    expect(f.pilotLights).toBe(0);
    expect(f.current).toBe(5);
  });

  it('holds earned lights, capped at 2 below level 8 and 3 from level 8', () => {
    const dates = metWeeks(12);
    const low = summarizeFlame({ ...base, activeDates: dates });
    expect(low.pilotLightMax).toBe(2);
    expect(low.pilotLights).toBe(2);
    const high = summarizeFlame({ ...base, activeDates: dates, level: 8 });
    expect(high.pilotLightMax).toBe(3);
    expect(high.pilotLights).toBe(3);
  });

  it('without a light a quiet week resets the flame', () => {
    const f = summarizeFlame({
      ...base,
      activeDates: [
        ...activeIn(addDaysLocal(THIS_WEEK, -21), 3),
        ...activeIn(addDaysLocal(THIS_WEEK, -7), 1),
      ],
    });
    expect(f.weeks.map((w) => w.status)).toEqual(['met', 'empty', 'under', 'current']);
    expect(f.current).toBe(0);
    expect(f.best).toBe(1);
  });
});

describe('summarizeFlame: pauses', () => {
  it('a pause freezes the flame and reports when it ends', () => {
    const lastWeek = addDaysLocal(THIS_WEEK, -7);
    const f = summarizeFlame({
      ...base,
      activeDates: activeIn(addDaysLocal(THIS_WEEK, -14), 3),
      pauses: [{ startDate: lastWeek, endDate: '2026-10-25' }],
    });
    expect(f.weeks.map((w) => w.status)).toEqual(['met', 'paused', 'current']);
    expect(f.current).toBe(1);
    expect(f.pausedUntil).toBe('2026-10-25');
  });

  it('an ended pause is not reported', () => {
    const f = summarizeFlame({
      ...base,
      activeDates: [],
      pauses: [{ startDate: '2026-09-01', endDate: '2026-09-14' }],
    });
    expect(f.pausedUntil).toBeNull();
  });
});

describe('summarizeFlame: milestones and training', () => {
  it('nextMilestone is the first above best, null after 52', () => {
    const f = summarizeFlame({ ...base, activeDates: metWeeks(4) });
    expect(f.best).toBe(4);
    expect(f.nextMilestone).toBe(8);
    expect(summarizeFlame({ ...base, activeDates: metWeeks(55) }).nextMilestone).toBeNull();
  });

  it('passes the gym streak through as the training row', () => {
    const f = summarizeFlame({ ...base, activeDates: [], training: { current: 3, best: 9 } });
    expect(f.training).toEqual({ current: 3, best: 9 });
  });
});

describe('metWeekStarts', () => {
  it('lists the met weeks only', () => {
    const f = summarizeFlame({
      ...base,
      activeDates: [...activeIn(addDaysLocal(THIS_WEEK, -14), 3), ...activeIn(THIS_WEEK, 1)],
    });
    expect(metWeekStarts(f.weeks)).toEqual([addDaysLocal(THIS_WEEK, -14)]);
  });
});
