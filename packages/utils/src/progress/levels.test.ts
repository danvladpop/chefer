import { describe, expect, it } from 'vitest';
import {
  levelForXp,
  levelUpBetween,
  nextRank,
  pilotLightMax,
  rankFor,
  RANKS,
  welcomeXp,
  xpToNext,
} from './levels';

describe('xpToNext', () => {
  it('is 80 + 60·level', () => {
    expect(xpToNext(1)).toBe(140);
    expect(xpToNext(7)).toBe(500);
    expect(xpToNext(30)).toBe(1880);
  });
});

describe('levelForXp', () => {
  it('starts at level 1 with nothing', () => {
    expect(levelForXp(0)).toEqual({ total: 0, level: 1, xpIntoLevel: 0, xpForLevel: 140 });
  });

  it('crosses a boundary exactly', () => {
    expect(levelForXp(139)).toMatchObject({ level: 1, xpIntoLevel: 139 });
    expect(levelForXp(140)).toEqual({ total: 140, level: 2, xpIntoLevel: 0, xpForLevel: 200 });
    expect(levelForXp(340)).toMatchObject({ level: 3, xpIntoLevel: 0, xpForLevel: 260 });
  });

  it('level 7 → 8 needs 500', () => {
    // cumulative to reach level 7: 140+200+260+320+380+440 = 1740
    expect(levelForXp(1740)).toMatchObject({ level: 7, xpIntoLevel: 0, xpForLevel: 500 });
    expect(levelForXp(2239)).toMatchObject({ level: 7, xpIntoLevel: 499 });
    expect(levelForXp(2240)).toMatchObject({ level: 8, xpIntoLevel: 0 });
  });

  it('treats negative or fractional totals safely', () => {
    expect(levelForXp(-5).level).toBe(1);
    expect(levelForXp(140.9).level).toBe(2);
  });
});

describe('ranks', () => {
  it('lists the nine ranks with their titles', () => {
    expect(RANKS.map((r) => [r.minLevel, r.id, r.title])).toEqual([
      [1, 'KITCHEN_PORTER', 'Kitchen Porter'],
      [3, 'COMMIS', 'Commis'],
      [5, 'LINE_COOK', 'Line Cook'],
      [8, 'CHEF_DE_PARTIE', 'Chef de Partie'],
      [12, 'SOUS_CHEF', 'Sous Chef'],
      [16, 'HEAD_CHEF', 'Head Chef'],
      [20, 'EXECUTIVE_CHEF', 'Executive Chef'],
      [25, 'IRON_CHEF', 'Iron Chef'],
      [30, 'THREE_STAR', 'Three-Star'],
    ]);
  });

  it('rankFor picks the highest rank at or below the level', () => {
    expect(rankFor(1).id).toBe('KITCHEN_PORTER');
    expect(rankFor(2).id).toBe('KITCHEN_PORTER');
    expect(rankFor(3).id).toBe('COMMIS');
    expect(rankFor(7).id).toBe('LINE_COOK');
    expect(rankFor(8).id).toBe('CHEF_DE_PARTIE');
    expect(rankFor(99).id).toBe('THREE_STAR');
  });

  it('nextRank is null at the top', () => {
    expect(nextRank(1)?.id).toBe('COMMIS');
    expect(nextRank(8)?.id).toBe('SOUS_CHEF');
    expect(nextRank(30)).toBeNull();
    expect(nextRank(40)).toBeNull();
  });
});

describe('pilotLightMax', () => {
  it('is 2, or 3 from level 8', () => {
    expect(pilotLightMax(1)).toBe(2);
    expect(pilotLightMax(7)).toBe(2);
    expect(pilotLightMax(8)).toBe(3);
    expect(pilotLightMax(30)).toBe(3);
  });
});

describe('welcomeXp', () => {
  it('is 20% of level 1', () => {
    expect(welcomeXp()).toBe(28);
  });
});

describe('levelUpBetween', () => {
  it('is null inside a level or when nothing changed', () => {
    expect(levelUpBetween(0, 100)).toBeNull();
    expect(levelUpBetween(200, 200)).toBeNull();
    expect(levelUpBetween(300, 100)).toBeNull();
  });

  it('reports a plain level up', () => {
    expect(levelUpBetween(100, 150)).toEqual({
      from: 1,
      to: 2,
      rank: { id: 'KITCHEN_PORTER', title: 'Kitchen Porter', minLevel: 1 },
      rankChanged: false,
    });
  });

  it('flags a rank change, and skipped levels', () => {
    const up = levelUpBetween(200, 400);
    expect(up).toMatchObject({ from: 2, to: 3, rankChanged: true });
    expect(up?.rank.id).toBe('COMMIS');
    expect(levelUpBetween(0, 100_000)).toMatchObject({ from: 1, rankChanged: true });
  });
});
