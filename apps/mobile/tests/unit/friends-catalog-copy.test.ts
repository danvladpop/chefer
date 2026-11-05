import { createTranslator } from '@chefer/i18n';

// The Following copy lives in the `friends` catalog (it used to be FRIENDS_COPY,
// UX §12). These pin the English wording and interpolation, and that Romanian
// has the plural forms the screens rely on.

const en = createTranslator('en').t;
const ro = createTranslator('ro').t;

describe('friends catalog, English', () => {
  it('says Following', () => {
    expect(en('friends.nav.label')).toBe('Following');
    expect(en('friends.intro.cta')).toBe('Turn on Following');
    expect(en('friends.turnOff.done')).toBe('Following is off.');
    expect(en('friends.blocked.title')).toBe('Blocked people');
  });

  it('carries the moderation message', () => {
    expect(en('friends.intro.nameRejected')).toBe(
      'Please choose a different name. Some words aren’t allowed on Chefer profiles.',
    );
  });

  it('interpolates like UX §12', () => {
    expect(en('friends.locked.private.body', { first: 'Maria' })).toBe(
      'Follow Maria to see their meals and workouts.',
    );
    expect(en('friends.home.activityLabel')).toBe('Activity');
    expect(en('friends.home.activityLabelNew', { unread: 2 })).toBe('Activity, 2 new');
    expect(en('friends.home.requests', { n: 4 })).toBe('Requests · 4');
    expect(en('friends.reason.mutualMany', { name: 'Maria', count: 1 })).toBe(
      'Followed by Maria and 1 other',
    );
    expect(en('friends.reason.mutualMany', { name: 'Maria', count: 3 })).toBe(
      'Followed by Maria and 3 others',
    );
    expect(en('friends.profile.counts', { count: 1, following: 31 })).toBe(
      '1 follower · 31 following',
    );
    expect(en('friends.profile.counts', { count: 24, following: 31 })).toBe(
      '24 followers · 31 following',
    );
    expect(en('friends.search.announce', { count: 1 })).toBe('1 person found');
    expect(en('friends.search.announce', { count: 7 })).toBe('7 people found');
    expect(en('friends.search.noResults.title', { query: 'ana' })).toBe('No one found for “ana”');
    expect(en('friends.activated.filterHidden', { count: 1 })).toBe(
      'One of your recipes won’t be shown to followers because of words in their name or description.',
    );
    expect(en('friends.activated.filterHidden', { count: 3 })).toContain('3 of your recipes');
    expect(en('friends.food.avg', { kcal: 2150 })).toBe('avg 2,150 kcal/day');
    expect(en('friends.food.macros', { kcal: 420, p: 28, c: 45, f: 12 })).toBe(
      '420 kcal · P 28 g · C 45 g · F 12 g',
    );
    expect(en('friends.food.portion', { count: 1 })).toBe('1 portion');
    expect(en('friends.food.portion', { count: 2 })).toBe('2 portions');
    expect(en('friends.gym.exercises', { count: 1 })).toBe('1 exercise');
    expect(en('friends.addToWeek.cta', { day: 'Tue', meal: 'lunch' })).toBe('Add to Tue lunch');
    expect(en('friends.report.reasons.OTHER')).toBe('Something else');
    expect(en('friends.private.confirm.body', { count: 1 })).toContain('Your 1 current follower');
    expect(en('friends.private.confirm.body', { count: 5 })).toContain('Your 5 current followers');
  });
});

describe('friends catalog, Romanian', () => {
  it('uses the right plural form, with „de” from 20', () => {
    expect(ro('friends.profile.counts', { count: 1, following: 3 })).toBe(
      '1 urmăritor · urmărește 3',
    );
    expect(ro('friends.profile.counts', { count: 3, following: 3 })).toBe(
      '3 urmăritori · urmărește 3',
    );
    expect(ro('friends.profile.counts', { count: 20, following: 3 })).toBe(
      '20 de urmăritori · urmărește 3',
    );
    expect(ro('friends.food.portion', { count: 2 })).toBe('2 porții');
    expect(ro('friends.food.portion', { count: 25 })).toBe('25 de porții');
  });

  it('never calls the feature „prieteni”', () => {
    expect(ro('friends.nav.label')).toBe('Urmărire');
  });
});
