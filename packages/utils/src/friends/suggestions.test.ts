import { describe, expect, it } from 'vitest';
import {
  rankSuggestions,
  scoreSuggestion,
  suggestionReason,
  type SuggestionCandidate,
} from './suggestions';

const base = { mutualCount: 0, followsYou: false, followers: 0, featured: false };

describe('scoreSuggestion', () => {
  it('is 10 per mutual, +25 for a follower, 2·ln(1+followers) when popular', () => {
    expect(scoreSuggestion({ ...base, mutualCount: 3 })).toBe(30);
    expect(scoreSuggestion({ ...base, followsYou: true })).toBe(25);
    expect(scoreSuggestion({ ...base, followers: 9 })).toBeCloseTo(2 * Math.log(10), 10);
    expect(
      scoreSuggestion({ ...base, mutualCount: 1, followsYou: true, followers: 9 }),
    ).toBeCloseTo(35 + 2 * Math.log(10), 10);
  });

  it('gives no popularity below the minimum followers', () => {
    expect(scoreSuggestion({ ...base, followers: 2 })).toBe(0);
    expect(scoreSuggestion({ ...base, followers: 3 })).toBeGreaterThan(0);
  });

  it('keeps a featured profile eligible with no followers (cold start)', () => {
    expect(scoreSuggestion({ ...base, featured: true })).toBeGreaterThan(0);
    expect(scoreSuggestion({ ...base, featured: true, followers: 50 })).toBeCloseTo(
      2 * Math.log(51),
      10,
    );
  });
});

describe('suggestionReason', () => {
  it('ranks mutual over follows-you over popular, null when none', () => {
    expect(suggestionReason({ ...base, mutualCount: 1, followsYou: true, followers: 20 })).toBe(
      'mutual',
    );
    expect(suggestionReason({ ...base, followsYou: true, followers: 20 })).toBe('follows_you');
    expect(suggestionReason({ ...base, followers: 20 })).toBe('popular');
    expect(suggestionReason({ ...base, featured: true })).toBe('popular');
    expect(suggestionReason(base)).toBeNull();
  });
});

describe('rankSuggestions', () => {
  const c = (userId: string, over: Partial<SuggestionCandidate> = {}): SuggestionCandidate => ({
    userId,
    ...base,
    ...over,
  });

  it('orders by score, then followers, then recent activity, then id', () => {
    const ranked = rankSuggestions(
      [
        c('pop', { followers: 100 }),
        c('mutual2', { mutualCount: 2 }),
        c('fy-old', { followsYou: true, followers: 5, lastActiveAt: new Date('2026-01-01') }),
        c('fy-new', { followsYou: true, followers: 5, lastActiveAt: new Date('2026-09-01') }),
        c('fy-big', { followsYou: true, followers: 500 }),
      ],
      10,
    );
    expect(ranked.map((r) => r.userId)).toEqual(['fy-big', 'fy-new', 'fy-old', 'mutual2', 'pop']);
    expect(ranked[0]?.reason).toBe('follows_you');
    expect(ranked[3]?.reason).toBe('mutual');
  });

  it('drops candidates that qualify through no source and honours the limit', () => {
    const ranked = rankSuggestions(
      [
        c('nobody'),
        c('a', { mutualCount: 1 }),
        c('b', { mutualCount: 2 }),
        c('c', { mutualCount: 3 }),
      ],
      2,
    );
    expect(ranked.map((r) => r.userId)).toEqual(['c', 'b']);
  });

  it('is deterministic on full ties', () => {
    const ranked = rankSuggestions([c('b', { mutualCount: 1 }), c('a', { mutualCount: 1 })], 5);
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'b']);
  });

  it('lists the cold-start featured profile when there are no connections', () => {
    const ranked = rankSuggestions([c('kitchen', { featured: true })], 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.reason).toBe('popular');
  });
});
