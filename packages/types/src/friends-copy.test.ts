import { describe, expect, it } from 'vitest';
import { FRIENDS_COPY } from './friends-copy';

// User-facing name is "Following" (PRD Q-F-3). The code name `friends` must
// never reach a user-visible string.
const FORBIDDEN = /\bfriends?\b/i;

const SAMPLE_ARGS: readonly unknown[][] = [
  ['Maria', 'Maria', 'Maria', 'Maria'],
  [1, 1, 1, 1],
  [3, 3, 3, 3],
  [0, 0, 0, 0],
  ['Maria', 1, 'Maria', 1],
  ['Maria', 2, 'Maria', 2],
];

function collect(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === 'string') {
    out.push({ path, text: value });
  } else if (typeof value === 'function') {
    SAMPLE_ARGS.forEach((args, i) => {
      const result: unknown = (value as (...a: unknown[]) => unknown)(...args);
      collect(result, `${path}()#${i}`, out);
    });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, `${path}.${k}`, out);
  }
}

describe('FRIENDS_COPY', () => {
  const all: { path: string; text: string }[] = [];
  collect(FRIENDS_COPY, 'FRIENDS_COPY', all);

  it('has a substantial deck and no empty strings', () => {
    expect(all.length).toBeGreaterThan(150);
    expect(all.filter((s) => s.text.trim() === '')).toEqual([]);
  });

  it('never shows the user the word "Friends"', () => {
    const offenders = all.filter((s) => FORBIDDEN.test(s.text));
    expect(offenders).toEqual([]);
  });

  it('never leaks an un-interpolated placeholder', () => {
    expect(all.filter((s) => /undefined|\{\w+\}|\[object/.test(s.text))).toEqual([]);
  });

  it('says Following', () => {
    expect(FRIENDS_COPY.nav.label).toBe('Following');
    expect(FRIENDS_COPY.intro.cta).toBe('Turn on Following');
    expect(FRIENDS_COPY.turnOff.done).toBe('Following is off.');
  });

  it('carries the Blocked people title and the consent-history label', () => {
    expect(FRIENDS_COPY.blocked.title).toBe('Blocked people');
    expect(FRIENDS_COPY.consent.label(true)).toBe('Following and sharing: on');
    expect(FRIENDS_COPY.consent.label(false)).toBe('Following and sharing: off');
  });

  it('carries the server error messages (F3.1: no inline strings in friends.*)', () => {
    expect(FRIENDS_COPY.server.notActivated).toBe('Turn on Following to use this.');
    expect(FRIENDS_COPY.server.requestCap).toBe(
      'You’ve asked to follow this person several times this week. Try again later.',
    );
    expect(FRIENDS_COPY.server.reportCap).toBe(
      'Too many reports today. Please try again tomorrow.',
    );
    expect(FRIENDS_COPY.server.followSelf).toBe('You can’t follow yourself.');
  });

  it('carries the moderation messages (plan §4.6, UX §4.1)', () => {
    expect(FRIENDS_COPY.recipe.textRejected).toBe(
      'Some words in this recipe’s name or description aren’t allowed on shared recipes. Change them, or turn off recipe sharing.',
    );
    expect(FRIENDS_COPY.intro.nameRejected).toBe(
      'Please choose a different name. Some words aren’t allowed on Chefer profiles.',
    );
  });

  it('interpolates like UX §12', () => {
    expect(FRIENDS_COPY.locked.private.body('Maria')).toBe(
      'Follow Maria to see their meals and workouts.',
    );
    expect(FRIENDS_COPY.home.activityLabel(0)).toBe('Activity');
    expect(FRIENDS_COPY.home.activityLabel(2)).toBe('Activity, 2 new');
    expect(FRIENDS_COPY.home.requests(4)).toBe('Requests · 4');
    expect(FRIENDS_COPY.reason.mutualMany('Maria', 1)).toBe('Followed by Maria and 1 other');
    expect(FRIENDS_COPY.reason.mutualMany('Maria', 3)).toBe('Followed by Maria and 3 others');
    expect(FRIENDS_COPY.profile.counts(1, 31)).toBe('1 follower · 31 following');
    expect(FRIENDS_COPY.profile.counts(24, 31)).toBe('24 followers · 31 following');
    expect(FRIENDS_COPY.search.announce(0)).toBe('No one found');
    expect(FRIENDS_COPY.search.announce(1)).toBe('1 person found');
    expect(FRIENDS_COPY.search.announce(7)).toBe('7 people found');
    expect(FRIENDS_COPY.search.noResults.title('ana')).toBe('No one found for “ana”');
    expect(FRIENDS_COPY.activated.filterHidden(1)).toBe(
      'One of your recipes won’t be shown to followers because of words in their name or description.',
    );
    expect(FRIENDS_COPY.activated.filterHidden(3)).toContain('3 of your recipes');
    expect(FRIENDS_COPY.food.avg(2150)).toBe('avg 2,150 kcal/day');
    expect(FRIENDS_COPY.food.macros(420, 28, 45, 12)).toBe('420 kcal · P 28 g · C 45 g · F 12 g');
    expect(FRIENDS_COPY.food.portion(1)).toBe('1 portion');
    expect(FRIENDS_COPY.food.portion(2)).toBe('2 portions');
    expect(FRIENDS_COPY.gym.exercises(1)).toBe('1 exercise');
    expect(FRIENDS_COPY.addToWeek.cta('Tue', 'lunch')).toBe('Add to Tue lunch');
    expect(FRIENDS_COPY.report.reasons.OTHER).toBe('Something else');
    expect(FRIENDS_COPY.turnOff.bullets).toHaveLength(4);
  });
});
