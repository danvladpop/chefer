import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IWeeklyEmailRepository, WeeklyEmailRecipient } from '@chefer/database';
import { EmailQuotaError } from '../../lib/email/types';
import {
  defaultSendBudget,
  mondayLocal,
  planDinners,
  recapCounts,
  weekLabel,
  WeeklyEmailService,
  weekSource,
  weightChangeLabel,
} from './weekly-email.service';

vi.mock('../../lib/env.js', () => ({
  env: {
    JWT_SECRET: 'j'.repeat(40),
    APP_URL: 'https://app.test',
    EMAIL_MOCK_ENABLED: true,
    EMAIL_PROVIDER: 'mock',
    EMAIL_FROM: 'Chefer <test@chefer.dev>',
    EMAIL_DAILY_CAP: null,
    AI_MOCK_ENABLED: true,
  },
}));
vi.mock('../shopping-list/shopping-list.service.js', () => ({
  shoppingListService: { getForWeek: vi.fn() },
}));

// Monday 21 Sep 2026, 08:00 UTC — inside the week-ready window.
const MONDAY = new Date('2026-09-21T08:00:00Z');
// Sunday 27 Sep 2026, 18:00 UTC — inside the recap window.
const SUNDAY = new Date('2026-09-27T18:00:00Z');

const FREE_USER: WeeklyEmailRecipient = {
  id: 'free1',
  email: 'free@chefer.dev',
  name: null,
  firstName: 'Fran',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const PREMIUM_USER: WeeklyEmailRecipient = {
  ...FREE_USER,
  id: 'prem1',
  email: 'prem@chefer.dev',
  firstName: 'Pat',
  planTier: 'PREMIUM',
};

function plan(origin: string) {
  return {
    id: 'plan1',
    origin,
    days: [
      {
        dayOfWeek: 0,
        meals: [
          { type: 'breakfast', recipeId: 'r1' },
          { type: 'dinner', recipeId: 'r2' },
        ],
      },
      { dayOfWeek: 1, meals: [{ type: 'lunch', recipeId: 'r3' }] },
    ],
  };
}

function makeDeps() {
  const repo = {
    findRecipients: vi.fn().mockResolvedValue([]),
    claimSend: vi.fn().mockResolvedValue(true),
    releaseSend: vi.fn().mockResolvedValue(undefined),
    countSendsSince: vi.fn().mockResolvedValue(0),
    getPreferences: vi.fn(),
    setPreferences: vi.fn(),
    markEmailVerified: vi.fn(),
    findWeekLogs: vi.fn().mockResolvedValue([]),
    countCompletedWorkouts: vi.fn().mockResolvedValue(null),
  } satisfies IWeeklyEmailRepository;
  const deps = {
    repo,
    email: { send: vi.fn().mockResolvedValue(undefined) },
    mealPlans: {
      findByWeekStart: vi.fn().mockResolvedValue(null),
      findRecipesByIds: vi.fn().mockResolvedValue([
        { id: 'r1', name: 'Oats' },
        { id: 'r2', name: 'Lemon chicken' },
        { id: 'r3', name: 'Lentil soup' },
      ]),
    },
    profiles: { findByUserId: vi.fn().mockResolvedValue(null) },
    ratings: { findSignalsForUser: vi.fn().mockResolvedValue([{}, {}]) },
    weights: { findInRange: vi.fn().mockResolvedValue([]) },
    reviews: { findByUserAndWeek: vi.fn().mockResolvedValue(null) },
    listTotalEur: vi.fn().mockResolvedValue(68.4),
    appUrl: 'https://app.test',
    unsubscribeUrl: (userId: string, scope: string) =>
      `https://app.test/unsubscribe?token=${userId}-${scope}`,
    sendDelayMs: 0,
    sendBudget: vi.fn<[], Promise<number | null>>().mockResolvedValue(null),
  };
  return deps;
}

type Deps = ReturnType<typeof makeDeps>;
const service = (deps: Deps) => new WeeklyEmailService(deps);

describe('pure helpers', () => {
  it('weekLabel spans a month boundary', () => {
    expect(weekLabel(new Date('2026-09-21T00:00:00Z'))).toBe('21–27 Sep');
    expect(weekLabel(new Date('2026-09-28T00:00:00Z'))).toBe('28 Sep – 4 Oct');
  });

  it("mondayLocal finds this week's and next week's Monday", () => {
    const sunday = new Date(2026, 8, 27, 18);
    expect(mondayLocal(sunday).getDate()).toBe(21);
    expect(mondayLocal(sunday, 1).getDate()).toBe(28);
  });

  it('planDinners prefers dinner, falls back to the last meal', () => {
    const names = new Map([
      ['r1', 'Oats'],
      ['r2', 'Lemon chicken'],
      ['r3', 'Lentil soup'],
    ]);
    expect(planDinners(plan('USER').days, names)).toEqual([
      { day: 'Mon', name: 'Lemon chicken' },
      { day: 'Tue', name: 'Lentil soup' },
    ]);
  });

  it('weekSource: the Sunday week is learned for premium, curated for free', () => {
    expect(weekSource('WEEKLY_AUTO', true)).toBe('chef');
    expect(weekSource('WEEKLY_AUTO', false)).toBe('curated');
    expect(weekSource('TEMPLATE', false)).toBe('template');
    expect(weekSource('CARRY_FORWARD', true)).toBe('yours');
  });

  it('recapCounts: a day is on target within ±10%', () => {
    const d = (kcal: number, mealCount = 3) => ({ date: new Date(), totalKcal: kcal, mealCount });
    expect(recapCounts([d(2000), d(2150), d(1750), d(0, 0)], 2000)).toEqual({
      mealsLogged: 9,
      daysLogged: 3,
      daysOnTarget: 2,
    });
  });

  it('weightChangeLabel compares the week to the previous weigh-in', () => {
    const weekStart = new Date('2026-09-21T00:00:00Z');
    const entries = [
      { recordedAt: new Date('2026-09-15T07:00:00Z'), weightKg: 80 },
      { recordedAt: new Date('2026-09-24T07:00:00Z'), weightKg: 79.6 },
    ];
    expect(weightChangeLabel(entries, weekStart, 'METRIC')).toBe(
      '−0.4 kg since your previous weigh-in',
    );
    expect(weightChangeLabel(entries.slice(1), weekStart, 'METRIC')).toBeNull();
  });
});

describe('WeeklyEmailService — Monday "week ready"', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = makeDeps();
  });

  it('only asks the repository for opted-in recipients not yet sent this week', async () => {
    await service(deps).sendWeekReady(MONDAY);
    expect(deps.repo.findRecipients).toHaveBeenCalledWith(
      'WEEK_READY',
      new Date('2026-09-21T00:00:00Z'),
      undefined,
    );
  });

  it('claims, then sends with a List-Unsubscribe header', async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('WEEKLY_AUTO'));

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 1, skipped: 0, failed: 0 });
    expect(deps.repo.claimSend).toHaveBeenCalledWith(
      'free1',
      'WEEK_READY',
      new Date('2026-09-21T00:00:00Z'),
    );
    const message = deps.email.send.mock.calls[0]![0];
    expect(message.to).toBe('free@chefer.dev');
    expect(message.headers).toEqual({
      'List-Unsubscribe': '<https://app.test/unsubscribe?token=free1-WEEK_READY>',
    });
    expect(deps.repo.claimSend.mock.invocationCallOrder[0]!).toBeLessThan(
      deps.email.send.mock.invocationCallOrder[0]!,
    );
  });

  it('free users get the curated week copy and no rating lookup', async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('WEEKLY_AUTO'));

    await service(deps).sendWeekReady(MONDAY);

    const { text } = deps.email.send.mock.calls[0]![0];
    expect(text).toContain('We picked a fresh week of recipes');
    expect(text).toContain('Premium weeks learn');
    expect(deps.ratings.findSignalsForUser).not.toHaveBeenCalled();
  });

  it('premium users get their learned week', async () => {
    deps.repo.findRecipients.mockResolvedValue([PREMIUM_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('WEEKLY_AUTO'));

    await service(deps).sendWeekReady(MONDAY);

    const { text } = deps.email.send.mock.calls[0]![0];
    expect(text).toContain('Your chef planned it on Sunday');
    expect(text).toContain('the 2 dishes you rated');
    expect(text).not.toContain('Premium weeks learn');
  });

  it("shows the list total in the user's currency", async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('USER'));
    deps.profiles.findByUserId.mockResolvedValue({ deliveryCurrency: 'USD' });

    await service(deps).sendWeekReady(MONDAY);

    const { subject, text } = deps.email.send.mock.calls[0]![0];
    expect(subject).toBe('Your week is ready: 2 dinners, ~$74 shopping list');
    expect(text).toContain('- Mon: Lemon chicken');
  });

  it('skips a user with nothing planned — no claim, no email', async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER]);

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(deps.repo.claimSend).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('is idempotent: a lost claim (already sent) never sends again', async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('USER'));
    deps.repo.claimSend.mockResolvedValue(false);

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('a failed send releases its claim and the sweep continues', async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER, PREMIUM_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('USER'));
    deps.email.send.mockRejectedValueOnce(new Error('Resend down'));

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(deps.repo.releaseSend).toHaveBeenCalledWith(
      'free1',
      'WEEK_READY',
      new Date('2026-09-21T00:00:00Z'),
    );
    expect(deps.email.send).toHaveBeenCalledTimes(2);
  });

  it('a dry run renders but never claims or sends', async () => {
    deps.repo.findRecipients.mockResolvedValue([FREE_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('USER'));

    const result = await service(deps).sendWeekReady(MONDAY, { dryRun: true, userId: 'free1' });

    expect(deps.repo.findRecipients).toHaveBeenCalledWith('WEEK_READY', expect.any(Date), 'free1');
    expect(result.previews).toHaveLength(1);
    expect(deps.repo.claimSend).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
  });
});

describe('WeeklyEmailService — Sunday recap', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = makeDeps();
    deps.repo.findRecipients.mockResolvedValue([PREMIUM_USER]);
  });

  it('recaps the Monday–Sunday week that is ending', async () => {
    deps.repo.findWeekLogs.mockResolvedValue([
      { date: new Date('2026-09-21'), totalKcal: 2000, mealCount: 3 },
      { date: new Date('2026-09-22'), totalKcal: 2600, mealCount: 4 },
    ]);
    deps.repo.countCompletedWorkouts.mockResolvedValue(3);
    deps.reviews.findByUserAndWeek.mockResolvedValue({ id: 'rev' });

    const result = await service(deps).sendWeeklyRecap(SUNDAY);

    expect(result.sent).toBe(1);
    expect(deps.repo.findWeekLogs).toHaveBeenCalledWith(
      'prem1',
      new Date('2026-09-21T00:00:00Z'),
      new Date('2026-09-28T00:00:00Z'),
    );
    expect(deps.repo.countCompletedWorkouts).toHaveBeenCalledWith(
      'prem1',
      '2026-09-21',
      '2026-09-27',
    );
    const { subject, text } = deps.email.send.mock.calls[0]![0];
    expect(subject).toBe('Your week in review: 7 meals logged, 1 day on target');
    expect(text).toContain('- 3 workouts finished');
    expect(text).toContain("Your chef's weekly review is waiting on Progress.");
    expect(deps.repo.claimSend).toHaveBeenCalledWith(
      'prem1',
      'WEEKLY_RECAP',
      new Date('2026-09-21T00:00:00Z'),
    );
  });

  it('skips a week with nothing to recap', async () => {
    const result = await service(deps).sendWeeklyRecap(SUNDAY);
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('a gym-only week still gets a recap', async () => {
    deps.repo.countCompletedWorkouts.mockResolvedValue(2);
    await service(deps).sendWeeklyRecap(SUNDAY);
    const { text } = deps.email.send.mock.calls[0]![0];
    expect(text).toContain('- 2 workouts finished');
    expect(text).toContain('No meals logged this week, and that is fine.');
  });
});

describe('WeeklyEmailService — daily send cap (EMAIL_DAILY_CAP)', () => {
  const WEEK = new Date('2026-09-21T00:00:00Z');
  const THIRD_USER: WeeklyEmailRecipient = { ...FREE_USER, id: 'free2', email: 'f2@chefer.dev' };
  let deps: Deps;
  beforeEach(() => {
    deps = makeDeps();
    deps.repo.findRecipients.mockResolvedValue([FREE_USER, PREMIUM_USER, THIRD_USER]);
    deps.mealPlans.findByWeekStart.mockResolvedValue(plan('USER'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('stops at the budget BEFORE claiming, so the rest keep no claim', async () => {
    deps.sendBudget.mockResolvedValue(2);

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 2, failed: 0, deferred: 1, capped: true });
    expect(deps.repo.claimSend).toHaveBeenCalledTimes(2);
    expect(deps.repo.claimSend).not.toHaveBeenCalledWith('free2', 'WEEK_READY', WEEK);
    expect(deps.email.send).toHaveBeenCalledTimes(2);
  });

  it('a zero budget sends nothing and defers everyone', async () => {
    deps.sendBudget.mockResolvedValue(0);

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 0, deferred: 3, capped: true });
    expect(deps.repo.claimSend).not.toHaveBeenCalled();
    expect(deps.mealPlans.findByWeekStart).not.toHaveBeenCalled();
  });

  it('skipped users (nothing to say, already sent) do not spend budget', async () => {
    deps.sendBudget.mockResolvedValue(1);
    deps.repo.claimSend.mockResolvedValueOnce(false);

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 1, skipped: 1, deferred: 1, capped: true });
  });

  it("a provider sending-limit error releases that user's claim and stops the sweep", async () => {
    deps.email.send
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new EmailQuotaError('limit'));

    const result = await service(deps).sendWeekReady(MONDAY);

    expect(result).toMatchObject({ sent: 1, failed: 0, deferred: 2, capped: true });
    expect(deps.repo.releaseSend).toHaveBeenCalledWith('prem1', 'WEEK_READY', WEEK);
    expect(deps.repo.claimSend).not.toHaveBeenCalledWith('free2', 'WEEK_READY', WEEK);
    expect(deps.email.send).toHaveBeenCalledTimes(2);
  });

  it('no cap (null budget) sends to everyone', async () => {
    const result = await service(deps).sendWeekReady(MONDAY);
    expect(result).toMatchObject({ sent: 3, deferred: 0, capped: false });
  });

  it('a dry run never reads the budget', async () => {
    await service(deps).sendWeekReady(MONDAY, { dryRun: true });
    expect(deps.sendBudget).not.toHaveBeenCalled();
  });

  it('defaultSendBudget: cap − 50 reserve − weekly claims − transactional sends (24h)', async () => {
    const repo = { countSendsSince: vi.fn().mockResolvedValue(120) };
    const now = new Date('2026-09-21T08:00:00Z');

    expect(await defaultSendBudget(repo, 400, () => 30, now)).toBe(400 - 50 - 120 - 30);
    expect(repo.countSendsSince).toHaveBeenCalledWith(new Date('2026-09-20T08:00:00Z'));
    expect(await defaultSendBudget(repo, 100, () => 30, now)).toBe(0);
    expect(await defaultSendBudget(repo, null, () => 30, now)).toBeNull();
  });
});
