import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@chefer/database';
import type {
  IChefProfileRepository,
  IChefReviewRepository,
  IWeightEntryRepository,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { CoachService, MIN_LOGGED_DAYS, weekStartUtc } from './coach.service.js';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    prisma: {
      dailyLog: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    },
    mealPlanRepository: {
      findActiveWithDays: vi.fn().mockResolvedValue(null),
      findRecipesByIds: vi.fn().mockResolvedValue([]),
    },
  };
});

// review-text pulls env validation (Gemini path) — the template is what the
// mock path returns anyway, so substitute it directly.
vi.mock('./review-text.js', () => ({
  generateReviewText: vi
    .fn()
    .mockResolvedValue('First line of the review.\nSecond line.\nThird line.'),
}));

// F3 seam: reviews carry the week's pantry savings — stubbed here so coach
// tests stay isolated from the pantry service's repositories.
vi.mock('../pantry/pantry.service.js', () => ({
  pantryService: { computeWeekPantrySavings: vi.fn().mockResolvedValue(null) },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Sunday afternoon UTC — when the worker tick runs. Week start: Mon 17 Aug.
const SUNDAY = new Date('2026-08-23T12:00:00Z');
const WEEK_START = new Date('2026-08-17T00:00:00Z');

const DAY_MS = 24 * 60 * 60 * 1000;

const PROFILE = {
  id: 'cp1',
  userId: 'u1',
  goal: 'LOSE_WEIGHT',
  biologicalSex: 'MALE',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'MODERATELY_ACTIVE',
  dailyCalorieTarget: null,
  targetAdjustmentKcal: 0,
};

function dayLogRow(dayOffset: number, totalKcal = 2000) {
  return {
    date: new Date(WEEK_START.getTime() + dayOffset * DAY_MS),
    totalKcal,
    loggedMeals: [{ mealType: 'lunch' }],
  };
}

/** 5 flat weigh-ins over 12 days — a clean plateau (trend 0). */
function plateauWeights() {
  return [0, 3, 6, 9, 12].map((d) => ({
    recordedAt: new Date(SUNDAY.getTime() - (12 - d) * DAY_MS),
    weightKg: 80,
  }));
}

function makeReviewRepo(overrides: Partial<IChefReviewRepository> = {}): IChefReviewRepository {
  return {
    findByUserAndWeek: vi.fn().mockResolvedValue(null),
    findLatest: vi.fn().mockResolvedValue(null),
    findPreviousBefore: vi.fn().mockResolvedValue(null),
    upsert: vi
      .fn()
      .mockImplementation((data: Record<string, unknown>) =>
        Promise.resolve({ id: 'r1', createdAt: SUNDAY, savedEur: null, ...data }),
      ),
    ...overrides,
  };
}

function makeProfileRepo(overrides: Partial<IChefProfileRepository> = {}): IChefProfileRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue(PROFILE),
    upsert: vi.fn().mockResolvedValue(PROFILE),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeWeightRepo(overrides: Partial<IWeightEntryRepository> = {}): IWeightEntryRepository {
  return {
    create: vi.fn(),
    findLastN: vi.fn().mockResolvedValue(plateauWeights()),
    findLatest: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const FREE_USER: UserProfile = {
  id: 'u1',
  email: 'agent-coach@chefer.dev',
  name: 'Coach Test',
  firstName: 'Coach',
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const PREMIUM_USER: UserProfile = { ...FREE_USER, planTier: 'PREMIUM' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.dailyLog.findMany).mockResolvedValue([
    dayLogRow(0),
    dayLogRow(1),
    dayLogRow(2),
    dayLogRow(3),
  ] as never);
  vi.mocked(prisma.dailyLog.count).mockResolvedValue(0);
});

// ─── weekStartUtc ─────────────────────────────────────────────────────────────

describe('weekStartUtc', () => {
  it('maps a Sunday to the Monday that started its week (UTC midnight)', () => {
    expect(weekStartUtc(SUNDAY).toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });

  it('maps a Monday to itself at UTC midnight', () => {
    expect(weekStartUtc(new Date('2026-08-17T15:30:00Z')).toISOString()).toBe(
      '2026-08-17T00:00:00.000Z',
    );
  });
});

// ─── runWeeklyReview ──────────────────────────────────────────────────────────

describe('CoachService.runWeeklyReview', () => {
  it('is a no-op when a review for the week already exists (worker idempotency)', async () => {
    const existing = { id: 'existing', weekStart: WEEK_START };
    const reviewRepo = makeReviewRepo({
      findByUserAndWeek: vi.fn().mockResolvedValue(existing),
    });
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    const result = await service.runWeeklyReview('u1', SUNDAY);

    expect(result).toBe(existing);
    expect(reviewRepo.upsert).not.toHaveBeenCalled();
    expect(profileRepo.upsert).not.toHaveBeenCalled();
    expect(prisma.dailyLog.findMany).not.toHaveBeenCalled();
  });

  it(`returns null (writes nothing) under ${MIN_LOGGED_DAYS} logged days`, async () => {
    vi.mocked(prisma.dailyLog.findMany).mockResolvedValue([dayLogRow(0), dayLogRow(1)] as never);
    const reviewRepo = makeReviewRepo();
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());

    await expect(service.runWeeklyReview('u1', SUNDAY)).resolves.toBeNull();
    expect(reviewRepo.upsert).not.toHaveBeenCalled();
  });

  it('writes the review row keyed on the UTC Monday of the reviewed week', async () => {
    const reviewRepo = makeReviewRepo();
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY);

    expect(reviewRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        weekStart: WEEK_START,
        adherencePct: Math.round((4 / 7) * 100),
        avgDailyKcal: 2000,
        savedEur: null, // F3 seam stays empty in wave 1
      }),
    );
  });

  it('moves the cumulative dial on a second consecutive plateau (LOSE −100)', async () => {
    const reviewRepo = makeReviewRepo({
      // Previous review also saw a plateau — the 2-consecutive rule fires.
      findPreviousBefore: vi.fn().mockResolvedValue({ weightTrendKg: 0 }),
    });
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY);

    expect(profileRepo.upsert).toHaveBeenCalledWith('u1', { targetAdjustmentKcal: -100 });
    expect(reviewRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentKcal: -100 }),
    );
  });

  it('accumulates onto an existing dial instead of overwriting it', async () => {
    const reviewRepo = makeReviewRepo({
      findPreviousBefore: vi.fn().mockResolvedValue({ weightTrendKg: 0 }),
    });
    const profileRepo = makeProfileRepo({
      findByUserId: vi.fn().mockResolvedValue({ ...PROFILE, targetAdjustmentKcal: -100 }),
    });
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY);

    expect(profileRepo.upsert).toHaveBeenCalledWith('u1', { targetAdjustmentKcal: -200 });
  });

  it('first plateau review records the trend but leaves the dial alone', async () => {
    const reviewRepo = makeReviewRepo(); // no previous review
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY);

    expect(profileRepo.upsert).not.toHaveBeenCalled();
    expect(reviewRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentKcal: 0, weightTrendKg: 0 }),
    );
  });

  it('free-tier reviews (applyAdjustment=false) never move the dial', async () => {
    const reviewRepo = makeReviewRepo({
      findPreviousBefore: vi.fn().mockResolvedValue({ weightTrendKg: 0 }),
    });
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY, false);

    expect(profileRepo.upsert).not.toHaveBeenCalled();
    expect(reviewRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ adjustmentKcal: 0 }));
  });
});

// ─── getCurrentReview ─────────────────────────────────────────────────────────

describe('CoachService.getCurrentReview', () => {
  const REVIEW_ROW = {
    id: 'r1',
    userId: 'u1',
    weekStart: WEEK_START,
    adherencePct: 71,
    avgDailyKcal: 2100,
    weightTrendKg: -0.2,
    adjustmentKcal: -100,
    savedEur: null,
    reviewText: 'First line of the review.\nSecond line.\nThird line.',
    createdAt: SUNDAY,
  };

  it("returns eligibility info when there's no review yet", async () => {
    vi.mocked(prisma.dailyLog.count).mockResolvedValue(1);
    const service = new CoachService(makeReviewRepo(), makeProfileRepo(), makeWeightRepo());

    const result = await service.getCurrentReview(PREMIUM_USER, SUNDAY);

    expect(result).toEqual({ status: 'none', loggedDaysThisWeek: 1, daysNeeded: 2 });
  });

  it('treats a stale review (>14 days after its week started) as none', async () => {
    const service = new CoachService(
      makeReviewRepo({ findLatest: vi.fn().mockResolvedValue(REVIEW_ROW) }),
      makeProfileRepo(),
      makeWeightRepo(),
    );

    const result = await service.getCurrentReview(PREMIUM_USER, new Date('2026-09-15T12:00:00Z'));

    expect(result.status).toBe('none');
  });

  it('premium gets the full review', async () => {
    const service = new CoachService(
      makeReviewRepo({ findLatest: vi.fn().mockResolvedValue(REVIEW_ROW) }),
      makeProfileRepo(),
      makeWeightRepo(),
    );

    const result = await service.getCurrentReview(PREMIUM_USER, SUNDAY);

    expect(result.status).toBe('full');
    if (result.status === 'full') {
      expect(result.review.reviewText).toContain('Second line.');
      expect(result.review.adjustmentKcal).toBe(-100);
    }
  });

  it('free gets ONLY the first line — the rest never leaves the server', async () => {
    const service = new CoachService(
      makeReviewRepo({ findLatest: vi.fn().mockResolvedValue(REVIEW_ROW) }),
      makeProfileRepo(),
      makeWeightRepo(),
    );

    const result = await service.getCurrentReview(FREE_USER, SUNDAY);

    expect(result.status).toBe('teaser');
    if (result.status === 'teaser') {
      expect(result.firstLine).toBe('First line of the review.');
      expect(result.lockedLineCount).toBe(2);
      expect(JSON.stringify(result)).not.toContain('Second line.');
    }
  });

  it('admins count as premium (entitlements helper, not tier comparison)', async () => {
    const service = new CoachService(
      makeReviewRepo({ findLatest: vi.fn().mockResolvedValue(REVIEW_ROW) }),
      makeProfileRepo(),
      makeWeightRepo(),
    );

    const result = await service.getCurrentReview({ ...FREE_USER, role: 'ADMIN' }, SUNDAY);

    expect(result.status).toBe('full');
  });
});

// ─── runReviewSweep ───────────────────────────────────────────────────────────

describe('CoachService.runReviewSweep', () => {
  it('reviews eligible users and skips already-reviewed ones (idempotent)', async () => {
    vi.mocked(prisma.dailyLog.groupBy).mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { ...FREE_USER, id: 'u1', planTier: 'PREMIUM' },
      { ...FREE_USER, id: 'u2' },
    ] as never);

    const reviewRepo = makeReviewRepo({
      // u2 already has this week's review — skipped.
      findByUserAndWeek: vi
        .fn()
        .mockImplementation((userId: string) =>
          Promise.resolve(userId === 'u2' ? { id: 'existing' } : null),
        ),
    });
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());

    const { reviewed } = await service.runReviewSweep(SUNDAY);

    expect(reviewed).toBe(1);
    expect(reviewRepo.upsert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reviewRepo.upsert).mock.calls[0]![0].userId).toBe('u1');
  });

  it("one user's failure does not starve the rest of the sweep", async () => {
    vi.mocked(prisma.dailyLog.groupBy).mockResolvedValue([
      { userId: 'u1' },
      { userId: 'u2' },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { ...FREE_USER, id: 'u1' },
      { ...FREE_USER, id: 'u2' },
    ] as never);

    const reviewRepo = makeReviewRepo({
      findByUserAndWeek: vi
        .fn()
        .mockRejectedValueOnce(new Error('DB hiccup'))
        .mockResolvedValue(null),
    });
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());

    const { reviewed } = await service.runReviewSweep(SUNDAY);

    expect(reviewed).toBe(1);
  });
});
