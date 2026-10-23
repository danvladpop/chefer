import { describe, expect, it } from 'vitest';
import { xpTargetLabel, xpToRankLine } from './copy';

const CHEF_DE_PARTIE = { title: 'Chef de Partie', minLevel: 8 };

describe('xpToRankLine', () => {
  it('names the rank only when the next level starts it', () => {
    expect(xpToRankLine(340, 500, 7, CHEF_DE_PARTIE)).toBe('340 / 500 XP to Chef de Partie');
  });

  it('names the next level when the rank is further away (the bar is per level)', () => {
    expect(xpToRankLine(261, 380, 5, CHEF_DE_PARTIE)).toBe('261 / 380 XP to Lv 6');
    expect(xpTargetLabel(5, CHEF_DE_PARTIE)).toBe('Lv 6');
  });

  it('shows the top-rank line past the last rank', () => {
    expect(xpToRankLine(10, 1900, 31, null)).toBe('Top rank reached');
  });
});
