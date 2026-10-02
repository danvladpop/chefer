import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPlanRepository, prisma } from '@chefer/database';
import type {
  IChefProfileRepository,
  IChefReviewRepository,
  IWeightEntryRepository,
} from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { targetsService } from '../targets/targets.service.js';
import { trainingNutritionService } from '../training-nutrition/training-nutrition.service.js';
import { CoachService, MIN_LOGGED_DAYS, weekStartUtc } from './coach.service.js';
import { generateReviewTextWithSource as generateReviewText } from './review-text.js';

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
      findForWeek: vi.fn().mockResolvedValue(null),
      findRecipesByIds: vi.fn().mockResolvedValue([]),
    },
  };
});

// review-text pulls env validation (Gemini path) — the template is what the
// mock path returns anyway, so substitute it directly.
vi.mock('./review-text.js', () => ({
  generateReviewTextWithSource: vi.fn().mockResolvedValue({
    text: 'First line of the review.\nSecond line.\nThird line.',
    aiGenerated: true,
  }),
}));

// F3 seam: reviews carry the week's pantry savings — stubbed here so coach
// tests stay isolated from the pantry service's repositories.
vi.mock('../pantry/pantry.service.js', () => ({
  pantryService: { computeWeekPantrySavings: vi.fn().mockResolvedValue(null) },
}));

// Lifter lookup (gym profile + bodyweight): not a lifter unless a test says so.
vi.mock('../training-nutrition/training-nutrition.service.js', () => ({
  trainingNutritionService: {
    loadLifter: vi.fn().mockResolvedValue({ lifterBodyweightKg: null }),
  },
}));

// §2.11, T-35.4: the coach proposes through this instead of writing
// ChefProfile.targetAdjustmentKcal itself.
vi.mock('../targets/targets.service.js', () => ({
  targetsService: { proposeCoachAdjustment: vi.fn().mockResolvedValue(undefined) },
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

function dayLogRow(dayOffset: number, totalKcal = 2000, totalProtein = 120) {
  return {
    date: new Date(WEEK_START.getTime() + dayOffset * DAY_MS),
    totalKcal,
    totalProtein,
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
    resolveProposal: vi.fn().mockResolvedValue(null),
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
    updateForUser: vi.fn(),
    deleteForUser: vi.fn(),
    findLastN: vi.fn().mockResolvedValue(plateauWeights()),
    findLatest: vi.fn().mockResolvedValue(null),
    findInRange: vi.fn().mockResolvedValue([]),
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

  it("flavours the review with THIS week's plan dishes, not the newest ACTIVE plan's (UX-FOOD-02)", async () => {
    const reviewRepo = makeReviewRepo();
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());
    vi.mocked(mealPlanRepository.findForWeek).mockResolvedValueOnce(null);

    await service.runWeeklyReview('u1', SUNDAY);

    const [, weekStart] = vi.mocked(mealPlanRepository.findForWeek).mock.calls[0]!;
    // A calendar-week lookup: always a Monday at local midnight.
    expect(weekStart.getDay()).toBe(1);
    expect(weekStart.getHours()).toBe(0);
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

  it('judges a lifter on their g/kg protein target, not the split (P2-4 follow-up)', async () => {
    vi.mocked(trainingNutritionService.loadLifter).mockResolvedValueOnce({
      lifterBodyweightKg: 80,
    });
    const service = new CoachService(makeReviewRepo(), makeProfileRepo(), makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY, true);

    // PROFILE is LOSE_WEIGHT → 2.0 g/kg × 80 kg = 160 g; the week averaged 120 g.
    expect(generateReviewText).toHaveBeenCalledWith(
      expect.objectContaining({ protein: { avgDailyG: 120, targetG: 160, gPerKg: 2 } }),
    );
  });

  it('non-lifters get no protein judgement', async () => {
    const service = new CoachService(makeReviewRepo(), makeProfileRepo(), makeWeightRepo());
    await service.runWeeklyReview('u1', SUNDAY, true);
    expect(generateReviewText).toHaveBeenCalledWith(expect.objectContaining({ protein: null }));
  });

  it('proposes (never applies) a cumulative-dial move on a second consecutive plateau (LOSE −100)', async () => {
    const reviewRepo = makeReviewRepo({
      // Previous review also saw a plateau — the 2-consecutive rule fires.
      findPreviousBefore: vi.fn().mockResolvedValue({ weightTrendKg: 0 }),
    });
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY);

    // §2.11, T-35.4: the coach never writes targetAdjustmentKcal itself.
    expect(profileRepo.upsert).not.toHaveBeenCalled();
    expect(reviewRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentKcal: 0, proposedAdjustmentKcal: -100 }),
    );
    expect(targetsService.proposeCoachAdjustment).toHaveBeenCalledWith(
      'u1',
      expect.any(Number),
      -100,
    );
  });

  it('first plateau review records the trend but proposes nothing yet', async () => {
    const reviewRepo = makeReviewRepo(); // no previous review
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY);

    expect(profileRepo.upsert).not.toHaveBeenCalled();
    expect(targetsService.proposeCoachAdjustment).not.toHaveBeenCalled();
    expect(reviewRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustmentKcal: 0,
        proposedAdjustmentKcal: null,
        weightTrendKg: 0,
      }),
    );
  });

  it('free-tier reviews (applyAdjustment=false) never propose an adjustment', async () => {
    const reviewRepo = makeReviewRepo({
      findPreviousBefore: vi.fn().mockResolvedValue({ weightTrendKg: 0 }),
    });
    const profileRepo = makeProfileRepo();
    const service = new CoachService(reviewRepo, profileRepo, makeWeightRepo());

    await service.runWeeklyReview('u1', SUNDAY, false);

    expect(profileRepo.upsert).not.toHaveBeenCalled();
    expect(targetsService.proposeCoachAdjustment).not.toHaveBeenCalled();
    expect(reviewRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ adjustmentKcal: 0, proposedAdjustmentKcal: null }),
    );
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
    aiGenerated: true,
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
      // R-14: the banner labels AI-written reviews from this flag.
      expect(result.review.aiGenerated).toBe(true);
    }
  });

  it('exposes aiGenerated=false for a template review (no AI label)', async () => {
    const service = new CoachService(
      makeReviewRepo({
        findLatest: vi.fn().mockResolvedValue({ ...REVIEW_ROW, aiGenerated: false }),
      }),
      makeProfileRepo(),
      makeWeightRepo(),
    );

    const result = await service.getCurrentReview(PREMIUM_USER, SUNDAY);

    expect(result.status === 'full' && result.review.aiGenerated).toBe(false);
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

  // ─── AI data consent (App Store 5.1.2(i)) ───────────────────────────────────

  it('premium users without AI data consent get the template, not the AI', async () => {
    vi.mocked(prisma.dailyLog.groupBy).mockResolvedValue([{ userId: 'u1' }] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { ...PREMIUM_USER, aiDataConsentAt: null },
    ] as never);
    const reviewRepo = makeReviewRepo();
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());

    const { reviewed, aiSkipped } = await service.runReviewSweep(SUNDAY);

    const select = vi.mocked(prisma.user.findMany).mock.calls[0]![0]!.select!;
    expect(select).toMatchObject({ aiDataConsentAt: true });
    expect(generateReviewText).not.toHaveBeenCalled();
    expect(reviewed).toBe(1);
    expect(aiSkipped).toBe(1);
    expect(reviewRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('premium users with AI data consent get the AI-written review', async () => {
    vi.mocked(prisma.dailyLog.groupBy).mockResolvedValue([{ userId: 'u1' }] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { ...PREMIUM_USER, aiDataConsentAt: new Date('2026-08-01') },
    ] as never);
    const service = new CoachService(makeReviewRepo(), makeProfileRepo(), makeWeightRepo());

    const { aiSkipped } = await service.runReviewSweep(SUNDAY);

    expect(generateReviewText).toHaveBeenCalledTimes(1);
    expect(aiSkipped).toBe(0);
  });

  it('stores aiGenerated=true only when the model wrote the text (R-14)', async () => {
    const reviewRepo = makeReviewRepo();
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());
    await service.runWeeklyReview('u1', SUNDAY, true, true);
    expect(reviewRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ aiGenerated: true }));
  });

  it('stores aiGenerated=false when the weekly review uses the template (no AI text)', async () => {
    const reviewRepo = makeReviewRepo();
    const service = new CoachService(reviewRepo, makeProfileRepo(), makeWeightRepo());
    await service.runWeeklyReview('u1', SUNDAY, true, false);
    expect(reviewRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ aiGenerated: false }));
  });
});
