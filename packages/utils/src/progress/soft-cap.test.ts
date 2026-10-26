import { describe, expect, it } from 'vitest';
import { candidateXp, cookCandidate, weekGoalCandidate, welcomeCandidate } from './candidates';
import { capXp, scoreAgainstDay } from './soft-cap';
import { XP } from './xp-table';

describe('capXp', () => {
  it('counts everything in full while the day stays under the cap', () => {
    expect(capXp(0, 25)).toBe(25);
    expect(capXp(100, 50)).toBe(50);
  });

  it('149 before: the first point fits, the rest is halved', () => {
    expect(capXp(149, 5)).toBe(1 + 2);
  });

  it('150 before: everything is halved (rounded up)', () => {
    expect(capXp(150, 5)).toBe(3);
    expect(capXp(150, 25)).toBe(13);
  });

  it('151 before behaves like 150', () => {
    expect(capXp(151, 5)).toBe(3);
  });

  it('a 200-XP day halves each new action', () => {
    expect(capXp(200, 40)).toBe(20);
    expect(capXp(200, 1)).toBe(1);
    expect(capXp(200, 0)).toBe(0);
  });

  it('takes a custom cap', () => {
    expect(capXp(10, 10, 15)).toBe(5 + 3);
  });

  it('is never below half and never above the raw amount', () => {
    for (let before = 0; before < 400; before += 7) {
      for (const raw of [1, 5, 10, 25, 40]) {
        const out = capXp(before, raw);
        expect(out).toBeLessThanOrEqual(raw);
        expect(out).toBeGreaterThanOrEqual(Math.ceil(raw / 2));
      }
    }
  });
});

describe('scoreAgainstDay', () => {
  const cook = cookCandidate({
    cookId: 'c1',
    localDate: '2026-10-20',
    recipeId: 'r1',
    recipeName: 'Salmon',
    firstTime: false,
    cookCount: 3,
  });

  it('flags a reduced award as capped', () => {
    expect(scoreAgainstDay(cook, 0)).toEqual({ xp: 25, capped: false });
    expect(scoreAgainstDay(cook, XP.DAILY_SOFT_CAP)).toEqual({ xp: 13, capped: true });
  });

  it('bonus kinds bypass the cap', () => {
    const week = weekGoalCandidate({ weekStart: '2026-10-19', localDate: '2026-10-22' });
    expect(scoreAgainstDay(week, 400)).toEqual({ xp: XP.WEEK_GOAL, capped: false });
    const welcome = welcomeCandidate('2026-10-22');
    expect(scoreAgainstDay(welcome, 400)).toEqual({ xp: candidateXp(welcome), capped: false });
  });
});
