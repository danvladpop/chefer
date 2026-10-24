import { describe, expect, it } from 'vitest';
import { PROGRESS_EVENT_KINDS } from '@chefer/types';
import { DEFAULT_ACTIVE_DAY_GOAL, RULES_VERSION, UNCAPPED_KINDS, XP } from './xp-table';

describe('xp table', () => {
  it('pins the launch values (README §5)', () => {
    expect(RULES_VERSION).toBe(1);
    expect(XP).toEqual({
      LOGGED: 5,
      ON_PLAN: 5,
      MEALS_PER_DAY: 5,
      FULL_DAY: 15,
      PROTEIN_GOAL: 10,
      COOKED_AT_HOME: 25,
      FIRST_TIME: 10,
      WORKOUT_DONE: 40,
      PR: { e1rm: 20, weight: 15, reps: 10 },
      PRS_PER_SESSION: 3,
      SHOP_DONE: 10,
      TODAYS_THREE: 40,
      WEEK_GOAL: 50,
      DAILY_SOFT_CAP: 150,
    });
    expect(DEFAULT_ACTIVE_DAY_GOAL).toBe(3);
  });

  it('only the bonuses bypass the soft cap, and they are real kinds', () => {
    expect([...UNCAPPED_KINDS].sort()).toEqual(['TODAYS_THREE', 'WEEK_GOAL', 'WELCOME']);
    for (const kind of UNCAPPED_KINDS) expect(PROGRESS_EVENT_KINDS).toContain(kind);
  });
});
