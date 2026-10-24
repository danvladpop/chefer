import type { LevelInfo, LevelUp, Rank } from '@chefer/types';
import { rankTitle } from './copy';

// ─── Chef levels and ranks (ideas 1–3) ────────────────────────────────────────

/** XP a level needs in total: level 7 → 8 = 500. */
export function xpToNext(level: number): number {
  return 80 + 60 * level;
}

/** Lifetime Chef XP → level, and where you are inside it. */
export function levelForXp(total: number): LevelInfo {
  const safe = Math.max(0, Math.floor(total));
  let level = 1;
  let remaining = safe;
  while (remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level += 1;
  }
  return { total: safe, level, xpIntoLevel: remaining, xpForLevel: xpToNext(level) };
}

const RANK_STARTS = [
  ['KITCHEN_PORTER', 1],
  ['COMMIS', 3],
  ['LINE_COOK', 5],
  ['CHEF_DE_PARTIE', 8],
  ['SOUS_CHEF', 12],
  ['HEAD_CHEF', 16],
  ['EXECUTIVE_CHEF', 20],
  ['IRON_CHEF', 25],
  ['THREE_STAR', 30],
] as const;

export const RANKS: Rank[] = RANK_STARTS.map(([id, minLevel]) => ({
  id,
  title: rankTitle(id),
  minLevel,
}));

export function rankFor(level: number): Rank {
  let found: Rank = RANKS[0] ?? {
    id: 'KITCHEN_PORTER',
    title: rankTitle('KITCHEN_PORTER'),
    minLevel: 1,
  };
  for (const rank of RANKS) if (level >= rank.minLevel) found = rank;
  return found;
}

/** The next rank above `level`, or null at the top. */
export function nextRank(level: number): Rank | null {
  return RANKS.find((r) => r.minLevel > level) ?? null;
}

/** Pilot lights the Flame can hold: 2, or 3 from Chef de Partie (level 8). */
export function pilotLightMax(level: number): number {
  return level >= 8 ? 3 : 2;
}

/** The endowed start (idea 6): 20% of level 1. */
export function welcomeXp(): number {
  return Math.round(0.2 * xpToNext(1));
}

/** The level-up between two lifetime totals, or null when the level did not rise. */
export function levelUpBetween(totalBefore: number, totalAfter: number): LevelUp | null {
  const from = levelForXp(totalBefore).level;
  const to = levelForXp(totalAfter).level;
  if (to <= from) return null;
  return { from, to, rank: rankFor(to), rankChanged: rankFor(from).id !== rankFor(to).id };
}
