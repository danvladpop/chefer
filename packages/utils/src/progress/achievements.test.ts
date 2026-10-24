import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_IDS } from '@chefer/types';
import {
  ACHIEVEMENTS,
  buildAchievements,
  newUnlocks,
  tierFor,
  type ProgressCounters,
} from './achievements';

const zero: ProgressCounters = {
  welcome: 0,
  cooks: 0,
  distinctRecipesCooked: 0,
  daysLogged: 0,
  fullDays: 0,
  proteinDays: 0,
  prs: 0,
  trainingStreakBest: 0,
  flameBest: 0,
  shopsDone: 0,
  todaysThreeDays: 0,
};

describe('catalogue', () => {
  it('has the 11 achievements of tech-plan §9, each id once, tiers ascending', () => {
    expect(ACHIEVEMENTS.map((a) => a.id).sort()).toEqual([...ACHIEVEMENT_IDS].sort());
    for (const a of ACHIEVEMENTS) {
      expect(a.tiers).toEqual([...a.tiers].sort((x, y) => x - y));
      expect(new Set(a.tiers).size).toBe(a.tiers.length);
    }
    const by = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
    expect(by.get('HOME_CHEF')).toMatchObject({
      group: 'KITCHEN',
      metric: 'cooks',
      tiers: [10, 50, 150],
    });
    expect(by.get('FLAME')).toMatchObject({
      group: 'FLAME',
      metric: 'flameBest',
      tiers: [4, 8, 12, 26, 52],
    });
    expect(by.get('IRON_WEEKS')).toMatchObject({ group: 'GYM', metric: 'trainingStreakBest' });
    expect(by.get('CLEAN_SWEEP')).toMatchObject({ group: 'PLAN', tiers: [1, 10, 30] });
    expect(by.get('HONEST_LOGGER')?.group).toBe('TABLE');
    expect(ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0)).toBe(33);
  });
});

describe('tierFor', () => {
  it('counts the thresholds reached', () => {
    expect(tierFor([10, 50, 150], 0)).toBe(0);
    expect(tierFor([10, 50, 150], 9)).toBe(0);
    expect(tierFor([10, 50, 150], 10)).toBe(1);
    expect(tierFor([10, 50, 150], 149)).toBe(2);
    expect(tierFor([10, 50, 150], 999)).toBe(3);
  });
});

describe('newUnlocks', () => {
  it('returns every tier reached and not held, including skipped lower tiers', () => {
    const out = newUnlocks({ ...zero, cooks: 60, welcome: 1 }, []);
    expect(out).toEqual([
      { achievementId: 'WELCOME', tier: 1 },
      { achievementId: 'HOME_CHEF', tier: 1 },
      { achievementId: 'HOME_CHEF', tier: 2 },
    ]);
  });

  it('skips tiers already held', () => {
    const out = newUnlocks({ ...zero, cooks: 60 }, [{ achievementId: 'HOME_CHEF', tier: 1 }]);
    expect(out).toEqual([{ achievementId: 'HOME_CHEF', tier: 2 }]);
  });

  it('is empty when nothing new was reached', () => {
    expect(newUnlocks(zero, [])).toEqual([]);
  });
});

describe('buildAchievements', () => {
  const at = new Date('2026-10-20T10:00:00Z');
  const unlock = (achievementId: 'HOME_CHEF', tier: number, seenAt: Date | null) => ({
    id: `u${tier}`,
    achievementId,
    tier,
    unlockedAt: at,
    seenAt,
  });

  it('groups items and fills tier, progress, next target, copy and new dot', () => {
    const dto = buildAchievements({ ...zero, cooks: 12 }, [unlock('HOME_CHEF', 1, null)]);
    expect(dto.total).toBe(33);
    expect(dto.earned).toBe(1);
    expect(dto.groups.map((g) => g.group)).toEqual(['KITCHEN', 'TABLE', 'GYM', 'FLAME', 'PLAN']);
    const home = dto.groups.flatMap((g) => g.items).find((i) => i.id === 'HOME_CHEF');
    expect(home).toMatchObject({
      title: 'Home Chef',
      description: 'Cook 50 meals in cook mode',
      tier: 1,
      tiers: [10, 50, 150],
      progress: 12,
      nextTarget: 50,
      unlockedAt: at,
      isNew: true,
    });
  });

  it('seen unlocks are not new; unearned items have no unlock date', () => {
    const dto = buildAchievements({ ...zero, cooks: 12 }, [unlock('HOME_CHEF', 1, at)]);
    const items = dto.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.id === 'HOME_CHEF')?.isNew).toBe(false);
    expect(items.find((i) => i.id === 'FLAME')).toMatchObject({
      tier: 0,
      unlockedAt: null,
      isNew: false,
    });
  });

  it('a finished item has no next target and describes its last tier', () => {
    const dto = buildAchievements({ ...zero, cooks: 200 }, [
      unlock('HOME_CHEF', 1, at),
      unlock('HOME_CHEF', 2, at),
      unlock('HOME_CHEF', 3, at),
    ]);
    const home = dto.groups.flatMap((g) => g.items).find((i) => i.id === 'HOME_CHEF');
    expect(home).toMatchObject({ nextTarget: null, description: 'Cook 150 meals in cook mode' });
    expect(home?.unlockedAt).toEqual(at);
    expect(dto.closestNext?.id).not.toBe('HOME_CHEF');
  });

  it('never takes a held badge back when a counter falls', () => {
    const dto = buildAchievements({ ...zero, cooks: 3 }, [unlock('HOME_CHEF', 1, at)]);
    const home = dto.groups.flatMap((g) => g.items).find((i) => i.id === 'HOME_CHEF');
    expect(home).toMatchObject({ tier: 1, nextTarget: 50 });
  });

  it('closestNext is the unfinished item with the highest progress / target', () => {
    const dto = buildAchievements({ ...zero, welcome: 1, cooks: 9, daysLogged: 3 }, []);
    // cooks 9/10 = 0.9 beats daysLogged 3/7
    expect(dto.closestNext?.id).toBe('HOME_CHEF');
  });

  it('ties go to the smaller remaining count, then catalogue order', () => {
    // cooks 5/10 and training 2/4 are both 50%; training has 2 left, cooks 5.
    const half = buildAchievements({ ...zero, welcome: 1, cooks: 5, trainingStreakBest: 2 }, []);
    expect(half.closestNext?.id).toBe('IRON_WEEKS');
    // everything at 0%: the smallest next target (Clean Sweep, 1) is closest.
    expect(buildAchievements({ ...zero, welcome: 1 }, []).closestNext?.id).toBe('CLEAN_SWEEP');
  });

  it('with every unfinished item at 0 progress the first one still leads; null when all are done', () => {
    expect(buildAchievements(zero, []).closestNext).not.toBeNull();
    const all: ProgressCounters = {
      welcome: 1,
      cooks: 999,
      distinctRecipesCooked: 999,
      daysLogged: 999,
      fullDays: 999,
      proteinDays: 999,
      prs: 999,
      trainingStreakBest: 999,
      flameBest: 999,
      shopsDone: 999,
      todaysThreeDays: 999,
    };
    expect(buildAchievements(all, []).closestNext).toBeNull();
  });
});
