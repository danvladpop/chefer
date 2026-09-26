import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  renderVerifyEmail,
  renderWeeklyRecapEmail,
  renderWeekReadyEmail,
  type WeeklyRecapEmailData,
  type WeekReadyEmailData,
} from './templates';

const READY: WeekReadyEmailData = {
  firstName: 'Ana',
  tier: 'PREMIUM',
  source: 'chef',
  ratedCount: 3,
  weekLabel: '21–27 Sep',
  dinners: [
    { day: 'Mon', name: 'Lemon chicken' },
    { day: 'Tue', name: 'Mac & cheese <deluxe>' },
  ],
  listTotal: '~€74',
  planUrl: 'https://app.test/meal-plan',
  listUrl: 'https://app.test/shopping-list',
  preferencesUrl: 'https://app.test/preferences',
  unsubscribeUrl: 'https://app.test/unsubscribe?token=abc.def',
};

const RECAP: WeeklyRecapEmailData = {
  firstName: 'Ana',
  tier: 'FREE',
  weekLabel: '21–27 Sep',
  mealsLogged: 12,
  daysLogged: 5,
  daysOnTarget: 3,
  weightChange: '−0.4 kg since your previous weigh-in',
  gymSessions: 2,
  nextWeekDinners: 7,
  hasChefReview: false,
  progressUrl: 'https://app.test/progress',
  planUrl: 'https://app.test/meal-plan?week=1',
  preferencesUrl: 'https://app.test/preferences',
  unsubscribeUrl: 'https://app.test/unsubscribe?token=abc.def',
};

describe('renderWeekReadyEmail', () => {
  it('lists the dinners and the list total in subject, text and HTML', () => {
    const email = renderWeekReadyEmail(READY);
    expect(email.subject).toBe('Your week is ready: 2 dinners, ~€74 shopping list');
    expect(email.text).toContain('- Mon: Lemon chicken');
    expect(email.text).toContain('Estimated shopping list: ~€74.');
    expect(email.html).toContain('Lemon chicken');
    expect(email.html).toContain('~€74');
    expect(email.html).toContain('href="https://app.test/meal-plan"');
  });

  it('escapes recipe names in the HTML part (text stays literal)', () => {
    const email = renderWeekReadyEmail(READY);
    expect(email.html).toContain('Mac &amp; cheese &lt;deluxe&gt;');
    expect(email.html).not.toContain('<deluxe>');
    expect(email.text).toContain('Mac & cheese <deluxe>');
  });

  it('carries the unsubscribe and preferences links in both parts', () => {
    const email = renderWeekReadyEmail(READY);
    expect(email.text).toContain('Unsubscribe: https://app.test/unsubscribe?token=abc.def');
    expect(email.html).toContain('href="https://app.test/unsubscribe?token=abc.def"');
    expect(email.html).toContain('href="https://app.test/preferences"');
  });

  it('premium: the learned week names the rated dishes, no upsell', () => {
    const email = renderWeekReadyEmail(READY);
    expect(email.text).toContain('around your targets and the 3 dishes you rated');
    expect(email.text).not.toContain('Premium weeks learn');
  });

  it('free: the curated week, plus a quiet premium line', () => {
    const email = renderWeekReadyEmail({ ...READY, tier: 'FREE', source: 'curated' });
    expect(email.text).toContain('We picked a fresh week of recipes');
    expect(email.text).toContain('Premium weeks learn from the dishes you rate');
  });

  it('a template week and a self-made week say so', () => {
    expect(renderWeekReadyEmail({ ...READY, source: 'template' }).text).toContain(
      'The saved week you follow in My weeks repeats',
    );
    expect(renderWeekReadyEmail({ ...READY, source: 'yours' }).text).toContain(
      "Here's the week you planned.",
    );
  });

  it('works without a price estimate or a first name', () => {
    const email = renderWeekReadyEmail({ ...READY, listTotal: null, firstName: null });
    expect(email.subject).toBe('Your week is ready: 2 dinners planned');
    expect(email.text.startsWith('Hi,')).toBe(true);
    expect(email.text).toContain('Your shopping list is ready too.');
  });
});

describe('renderWeeklyRecapEmail', () => {
  it('summarises meals, days on target, weight and workouts', () => {
    const email = renderWeeklyRecapEmail(RECAP);
    expect(email.subject).toBe('Your week in review: 12 meals logged, 3 days on target');
    expect(email.text).toContain('- 12 meals logged across 5 days');
    expect(email.text).toContain('- 3 days on your calorie target');
    expect(email.text).toContain('- Weight: −0.4 kg since your previous weigh-in');
    expect(email.text).toContain('- 2 workouts finished');
    expect(email.text).toContain('Next week is already planned: 7 dinners.');
  });

  it('leaves out gym and weight lines when there is nothing to show', () => {
    const email = renderWeeklyRecapEmail({ ...RECAP, gymSessions: null, weightChange: null });
    expect(email.text).not.toContain('workout');
    expect(email.text).not.toContain('Weight:');
  });

  it('a quiet food week is encouraged, never scolded', () => {
    const email = renderWeeklyRecapEmail({
      ...RECAP,
      mealsLogged: 0,
      daysLogged: 0,
      daysOnTarget: 0,
    });
    expect(email.subject).toBe('Your week in review');
    expect(email.text).toContain('No meals logged this week, and that is fine.');
    expect(email.text).not.toMatch(/missed|broke|failed/i);
  });

  it('premium: points to the chef review; free: the review is the upsell', () => {
    const premium = renderWeeklyRecapEmail({ ...RECAP, tier: 'PREMIUM', hasChefReview: true });
    expect(premium.text).toContain("Your chef's weekly review is waiting on Progress.");
    expect(premium.text).not.toContain('Premium adds');

    const free = renderWeeklyRecapEmail(RECAP);
    expect(free.text).toContain('Premium adds a weekly chef review');
    expect(free.text).not.toContain("Your chef's weekly review");
  });
});

describe('renderVerifyEmail', () => {
  it('links to the confirmation URL', () => {
    const email = renderVerifyEmail({ firstName: 'Ana', verifyUrl: 'https://app.test/v?t=1&x=2' });
    expect(email.subject).toBe('Confirm your email for Chefer');
    expect(email.text).toContain('https://app.test/v?t=1&x=2');
    expect(email.html).toContain('href="https://app.test/v?t=1&amp;x=2"');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
