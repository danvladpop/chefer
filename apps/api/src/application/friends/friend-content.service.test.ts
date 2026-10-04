import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import type { MealPlan, MealPlanDay, Recipe } from '@chefer/database';
import { ExerciseTrackingType, FRIENDS_COPY } from '@chefer/types';
import { encodeCursor } from '@chefer/utils';
import { PROFILE_NOT_AVAILABLE_MESSAGE } from '../../lib/friends-errors.js';
import { FriendContentService, type FriendContentDeps } from './friend-content.service.js';
import type { FriendRoutineRow, FriendSessionRow } from './friend-dto.mappers.js';
import type { SocialAccess } from './social-access.service.js';

// FriendContentService (implementation-plan.md §5) against in-memory
// repositories. The meal-plan repository mock carries EVERY write method as a
// spy, so INV-4 ("reads of another user's data never write to that user's
// rows") is asserted on the real repository surface, not just the Pick the
// service declares.

// client-level.ts → flags.ts → env.ts (which throws without secrets); the
// targets reader's module graph reaches env.ts too.
vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: () => false }));
vi.mock('../../lib/env.js', () => ({ env: {} }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const OWNER = 'cowner000000000000000001';
const VIEWER = 'cviewer00000000000000001';

const follower: SocialAccess = {
  visible: true,
  isSelf: false,
  ownerVisibility: 'PRIVATE',
  outgoing: 'ACCEPTED',
  incoming: null,
  can: { plan: 'visible', recipes: 'visible', workouts: 'visible', targets: false },
};

function recipe(id: string, overrides: Partial<Recipe> = {}): Recipe {
  return {
    id,
    name: `Recipe ${id}`,
    description: '',
    ingredients: [],
    instructions: [],
    nutritionInfo: { calories: 400, protein: 30, carbs: 40, fat: 10 },
    cuisineType: 'Any',
    dietaryTags: [],
    prepTimeMins: 5,
    cookTimeMins: 10,
    servings: 1,
    imageUrl: `https://img.chefer.dev/${id}.jpg`,
    imageStatus: 'DONE',
    imageRetries: 0,
    imagePriority: 100,
    source: 'MANUAL',
    sourceUrl: null,
    creatorId: OWNER,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    originRecipeId: null,
    originCreatorId: null,
    hiddenAt: null,
    hiddenReason: null,
    deletedAt: null,
    nutritionStatus: 'PARTIAL',
    nutritionComputedAt: null,
    nutritionTotal: null,
    ...overrides,
  };
}

type PlanWithDays = MealPlan & { days: MealPlanDay[] };

function plan(weekStart: string, days: Record<number, object[]>, extra: Partial<MealPlan> = {}) {
  const id = `cplan-${weekStart}`;
  return {
    id,
    userId: OWNER,
    weekStartDate: new Date(`${weekStart}T00:00:00Z`),
    status: 'ACTIVE',
    isTemplate: false,
    isFollowed: false,
    name: null,
    origin: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
    days: Object.entries(days).map(([d, meals]) => ({
      id: `${id}-${d}`,
      planId: id,
      dayOfWeek: Number(d),
      meals,
    })),
  } as unknown as PlanWithDays;
}

/** Every IMealPlanRepository write, as spies that must never be called. */
const MEAL_PLAN_WRITES = [
  'upsertRecipes',
  'createPlan',
  'archiveOldPlans',
  'updateDayMeal',
  'setSlotPinned',
  'setDayPortions',
  'setDayMeals',
  'createTemplate',
  'renameTemplate',
  'deleteTemplate',
  'setFollowedTemplate',
  'appendDayMeal',
  'removeDayMealIfMatches',
] as const;

interface World {
  now?: Date;
  timeZone?: string | null;
  thisWeek?: PlanWithDays | null;
  followed?: PlanWithDays | null;
  earlier?: PlanWithDays | null;
  recipes?: Recipe[];
  saved?: string[];
  shared?: Recipe[];
  routine?: FriendRoutineRow | null;
  sessions?: FriendSessionRow[];
  /** Ids blocked by, or blocking, the viewer. */
  blocked?: string[];
}

function setup(world: World = {}) {
  const recipes = new Map((world.recipes ?? []).map((r) => [r.id, r]));
  const writes = Object.fromEntries(MEAL_PLAN_WRITES.map((m) => [m, vi.fn()]));
  const mealPlans = {
    ...writes,
    findForWeek: vi.fn(async () => world.thisWeek ?? null),
    findFollowedTemplate: vi.fn(async () => world.followed ?? null),
    findLatestWithDaysBefore: vi.fn(async () => world.earlier ?? null),
    findRecipesByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => recipes.get(id)).filter((r): r is Recipe => r !== undefined),
    ),
  };
  const deps = {
    mealPlans,
    favourites: { findSavedRecipeIds: vi.fn(async () => world.saved ?? []) },
    chefProfiles: {
      findByUserId: vi.fn(async () =>
        world.timeZone === undefined ? null : ({ timeZone: world.timeZone } as never),
      ),
    },
    socialProfiles: {
      findMany: vi.fn(async (ids: string[]) =>
        ids.includes(OWNER)
          ? [
              {
                userId: OWNER,
                visibility: 'PRIVATE',
                user: { id: OWNER, firstName: 'Maria', lastName: 'Pop', name: null, image: null },
              } as never,
            ]
          : [],
      ),
    },
    follows: { counts: vi.fn(async () => ({ followers: 2, following: 5, pendingRequests: 1 })) },
    recipes: {
      listShared: vi.fn(async (_owner: string, opts: { limit: number }) =>
        (world.shared ?? []).slice(0, opts.limit),
      ),
      countShared: vi.fn(async () => (world.shared ?? []).length),
    },
    routines: { findActiveWithExercises: vi.fn(async () => world.routine ?? null) },
    sessions: { listCompletedInLocalDateRange: vi.fn(async () => world.sessions ?? []) },
    targets: {
      effective: vi.fn(async () => ({
        dailyCalorieTarget: 2000,
        proteinG: 140,
        carbsG: 200,
        fatG: 70,
      })),
    },
    blocks: { blockedIdsEither: vi.fn(async () => world.blocked ?? []) },
    now: () => world.now ?? new Date('2026-10-01T12:00:00Z'), // a Thursday
  } satisfies FriendContentDeps;
  return { service: new FriendContentService(deps), deps, writes };
}

function expectNoWrites(writes: Record<string, ReturnType<typeof vi.fn>>): void {
  for (const [name, spy] of Object.entries(writes)) expect(spy, name).not.toHaveBeenCalled();
}

// ─── week ─────────────────────────────────────────────────────────────────────

describe('week (INV-4: read-only)', () => {
  it('no plan this week but an earlier one → the carried view, and nothing is written', async () => {
    const { service, deps, writes } = setup({
      earlier: plan('2026-09-21', {
        0: [{ type: 'lunch', recipeId: 'r1', portion: 2 }],
        3: [{ type: 'dinner', recipeId: 'r2' }],
      }),
      recipes: [recipe('r1'), recipe('r2')],
    });
    const week = await service.week(VIEWER, OWNER, follower);
    expect(week).not.toBeNull();
    expect(week!.weekStartDate).toBe('2026-09-28');
    expect(week!.todayIndex).toBe(3);
    expect(week!.days[0]!.meals[0]).toMatchObject({ type: 'lunch', portion: 2 });
    expect(week!.days[0]!.totals.kcal).toBe(800);
    expect(week!.days[3]!.meals[0]!.recipe.id).toBe('r2');
    expect(week!.averageKcal).toBe(600);
    expect(deps.mealPlans.findLatestWithDaysBefore).toHaveBeenCalledWith(
      OWNER,
      new Date('2026-09-28T00:00:00Z'),
    );
    expectNoWrites(writes);
  });

  it('a followed template wins over the latest earlier plan, still in memory only', async () => {
    const { service, deps, writes } = setup({
      followed: plan(
        '2026-01-01',
        { 1: [{ type: 'breakfast', recipeId: 'rt' }] },
        {
          isTemplate: true,
          isFollowed: true,
        },
      ),
      earlier: plan('2026-09-21', { 0: [{ type: 'lunch', recipeId: 'r1' }] }),
      recipes: [recipe('rt'), recipe('r1')],
    });
    const week = await service.week(VIEWER, OWNER, follower);
    expect(week!.days[1]!.meals[0]!.recipe.id).toBe('rt');
    expect(week!.days[0]!.meals).toEqual([]);
    expect(deps.mealPlans.findLatestWithDaysBefore).not.toHaveBeenCalled();
    expectNoWrites(writes);
  });

  it('nothing this week and nothing to carry (or only empty days) → null', async () => {
    expect(await setup().service.week(VIEWER, OWNER, follower)).toBeNull();
    const { service, writes } = setup({ earlier: plan('2026-09-21', { 0: [], 1: [] }) });
    expect(await service.week(VIEWER, OWNER, follower)).toBeNull();
    expectNoWrites(writes);
  });

  it("this week's own plan is used as is; an empty own plan is still a week", async () => {
    const { service, deps } = setup({
      thisWeek: plan('2026-09-28', { 2: [] }),
      earlier: plan('2026-09-21', { 0: [{ type: 'lunch', recipeId: 'r1' }] }),
      recipes: [recipe('r1')],
    });
    const week = await service.week(VIEWER, OWNER, follower);
    expect(week!.days.every((d) => d.meals.length === 0)).toBe(true);
    expect(week!.averageKcal).toBeNull();
    expect(deps.mealPlans.findFollowedTemplate).not.toHaveBeenCalled();
    expect(deps.mealPlans.findRecipesByIds).not.toHaveBeenCalled();
  });

  it('hidden recipes are masked; missing recipe rows drop their slot; hearts are the viewer’s', async () => {
    const { service, deps } = setup({
      thisWeek: plan('2026-09-28', {
        0: [
          { type: 'lunch', recipeId: 'rh', pinned: true },
          { type: 'dinner', recipeId: 'gone' },
          { type: 'snack', recipeId: 'r1', leftoverOf: 'Sunday' },
        ],
      }),
      recipes: [recipe('rh', { hiddenAt: new Date(), hiddenReason: 'FILTER' }), recipe('r1')],
      saved: ['r1'],
    });
    const week = await service.week(VIEWER, OWNER, follower);
    const [hidden, snack] = week!.days[0]!.meals;
    expect(week!.days[0]!.meals).toHaveLength(2);
    expect(hidden!.recipe).toMatchObject({
      id: 'rh',
      name: FRIENDS_COPY.food.hiddenRecipe,
      imageUrl: null,
      hidden: true,
      isFavourite: false,
    });
    expect(hidden!.totals.kcal).toBe(400);
    expect(snack).toMatchObject({ leftoverOf: 'Sunday', recipe: { isFavourite: true } });
    expect(deps.favourites.findSavedRecipeIds).toHaveBeenCalledWith(VIEWER);
  });

  it('F3.1: a copy of a hidden original, a blocked person’s recipe and a filtered name are masked too', async () => {
    const BLOCKED = 'cblocked0000000000000001';
    const OTHER = 'cother000000000000000001';
    const { service, deps } = setup({
      thisWeek: plan('2026-09-28', {
        0: [
          { type: 'breakfast', recipeId: 'copy-of-hidden' },
          { type: 'lunch', recipeId: 'copy-of-blocked' },
          { type: 'dinner', recipeId: 'by-blocked' },
          { type: 'snack', recipeId: 'filtered' },
        ],
        1: [
          { type: 'lunch', recipeId: 'copy-ok' },
          { type: 'dinner', recipeId: 'ai' },
        ],
      }),
      recipes: [
        recipe('orig-hidden', {
          creatorId: OTHER,
          hiddenAt: new Date(),
          hiddenReason: 'REPORTS',
        }),
        recipe('orig-ok', { creatorId: OTHER }),
        recipe('copy-of-hidden', { originRecipeId: 'orig-hidden', originCreatorId: OTHER }),
        recipe('copy-of-blocked', { originRecipeId: 'gone', originCreatorId: BLOCKED }),
        recipe('by-blocked', { creatorId: BLOCKED }), // placed before INV-5
        recipe('filtered', { name: 'fuck this stew' }),
        recipe('copy-ok', { originRecipeId: 'orig-ok', originCreatorId: OTHER }),
        recipe('ai', { source: 'AI', creatorId: null }),
      ],
      blocked: [BLOCKED],
    });
    const week = await service.week(VIEWER, OWNER, follower);
    const masked = (id: string) =>
      week!.days.flatMap((d) => d.meals).find((m) => m.recipe.id === id)!.recipe;
    for (const id of ['copy-of-hidden', 'copy-of-blocked', 'by-blocked', 'filtered']) {
      expect(masked(id), id).toMatchObject({
        name: FRIENDS_COPY.food.hiddenRecipe,
        imageUrl: null,
        hidden: true,
      });
    }
    for (const id of ['copy-ok', 'ai']) expect(masked(id).hidden, id).toBe(false);
    expect(deps.blocks.blockedIdsEither).toHaveBeenCalledWith(VIEWER);
  });

  it('targets only when can.targets, from the read-only reader', async () => {
    const world = {
      thisWeek: plan('2026-09-28', { 0: [{ type: 'lunch', recipeId: 'r1' }] }),
      recipes: [recipe('r1')],
    };
    const off = setup(world);
    expect((await off.service.week(VIEWER, OWNER, follower))!.targets).toBeNull();
    expect(off.deps.targets.effective).not.toHaveBeenCalled();

    const on = setup(world);
    const withTargets = { ...follower, can: { ...follower.can, targets: true } };
    expect((await on.service.week(VIEWER, OWNER, withTargets))!.targets).toEqual({
      kcal: 2000,
      protein: 140,
      carbs: 200,
      fat: 70,
    });
    expect(on.deps.targets.effective).toHaveBeenCalledWith(OWNER, null);
  });
});

describe("week: the OWNER's week and today (FD-15, time-zone edges)", () => {
  // 2026-09-27 is a Sunday; 23:30 UTC is already Monday 28 Sep in Kiritimati (+14).
  const sundayLateUtc = new Date('2026-09-27T23:30:00Z');
  const cases: [string | null, string, number][] = [
    ['Pacific/Kiritimati', '2026-09-28', 0],
    ['America/Los_Angeles', '2026-09-21', 6],
    ['Europe/Bucharest', '2026-09-28', 0], // 02:30 Monday local
    [null, '2026-09-21', 6], // UTC fallback
    ['Not/AZone', '2026-09-21', 6], // unknown zone → UTC
  ];
  it.each(cases)('tz %s → week of %s, todayIndex %i', async (tz, monday, today) => {
    const { service, deps } = setup({
      now: sundayLateUtc,
      timeZone: tz,
      thisWeek: plan(monday, { 0: [{ type: 'lunch', recipeId: 'r1' }] }),
      recipes: [recipe('r1')],
    });
    const week = await service.week(VIEWER, OWNER, follower);
    expect(deps.mealPlans.findForWeek).toHaveBeenCalledWith(OWNER, new Date(`${monday}T00:00:00Z`));
    expect(week!.weekStartDate).toBe(monday);
    expect(week!.todayIndex).toBe(today);
  });
});

// ─── recipes ──────────────────────────────────────────────────────────────────

describe('recipes', () => {
  it('imported recipes carry sourceDomain/sourceUrl; hidden rows never come out', async () => {
    const { service, deps } = setup({
      shared: [
        recipe('ri', { sourceUrl: 'https://www.youtube.com/watch?v=abc' }),
        recipe('rh', { hiddenAt: new Date(), hiddenReason: 'REPORTS' }),
        recipe('rw'),
      ],
      saved: ['rw'],
    });
    const page = await service.recipes(VIEWER, OWNER, { search: '  bowl ' });
    expect(page.items.map((c) => c.id)).toEqual(['ri', 'rw']);
    expect(page.items[0]).toMatchObject({
      sourceDomain: 'youtube.com',
      sourceUrl: 'https://www.youtube.com/watch?v=abc',
      byOwner: true,
      isFavourite: false,
    });
    expect(page.items[1]).toMatchObject({ sourceDomain: null, isFavourite: true });
    expect(deps.recipes.listShared).toHaveBeenCalledWith(OWNER, {
      search: 'bowl',
      cursor: null,
      limit: 21,
    });
  });

  it('keyset pages: nextCursor from the last item; a tampered cursor restarts at the top', async () => {
    const shared = Array.from({ length: 3 }, (_, i) =>
      recipe(`r${i}`, { createdAt: new Date(Date.UTC(2026, 8, 10 - i)) }),
    );
    const { service, deps } = setup({ shared });
    const first = await service.recipes(VIEWER, OWNER, { limit: 2 });
    expect(first.items.map((c) => c.id)).toEqual(['r0', 'r1']);
    expect(first.nextCursor).toBe(encodeCursor(shared[1]!.createdAt, 'r1'));

    await service.recipes(VIEWER, OWNER, { limit: 2, cursor: first.nextCursor! });
    expect(deps.recipes.listShared).toHaveBeenLastCalledWith(OWNER, {
      search: undefined,
      cursor: { createdAt: shared[1]!.createdAt, id: 'r1' },
      limit: 3,
    });

    await service.recipes(VIEWER, OWNER, { cursor: "'; DROP TABLE recipes" });
    expect(deps.recipes.listShared).toHaveBeenLastCalledWith(
      OWNER,
      expect.objectContaining({ cursor: null }),
    );

    const last = await service.recipes(VIEWER, OWNER, { limit: 5 });
    expect(last.nextCursor).toBeNull();
  });
});

// ─── profile ──────────────────────────────────────────────────────────────────

describe('profile', () => {
  it('header, counts, access; recipeCount only when recipes are visible', async () => {
    const { service, deps } = setup({ shared: [recipe('a'), recipe('b')] });
    const dto = await service.profile(OWNER, follower);
    expect(dto).toMatchObject({
      user: { id: OWNER, displayName: 'Maria Pop', relation: 'following' },
      counts: { followers: 2, following: 5 },
      access: { plan: 'visible', recipes: 'visible', workouts: 'visible' },
      recipeCount: 2,
      visibility: 'PRIVATE',
      isSelf: false,
    });

    const locked = { ...follower, outgoing: null, can: { ...follower.can, recipes: 'locked' } };
    deps.recipes.countShared.mockClear();
    const lockedDto = await service.profile(OWNER, locked as SocialAccess);
    expect(lockedDto.recipeCount).toBeNull();
    expect(lockedDto.user.relation).toBe('none');
    expect(deps.recipes.countShared).not.toHaveBeenCalled();
  });

  it('a profile that disappeared mid-request is "Profile not available"', async () => {
    const { service } = setup();
    const err = await service
      .profile('cgone0000000000000000001', follower)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect(err).toMatchObject({ code: 'NOT_FOUND', message: PROFILE_NOT_AVAILABLE_MESSAGE });
  });
});

// ─── gym ──────────────────────────────────────────────────────────────────────

const meta = (id: string, trackingType: ExerciseTrackingType) => ({
  id,
  name: id,
  ownerId: null,
  trackingType,
  perHand: false,
});

function session(
  id: string,
  localDate: string,
  finishedAt: Date | null,
  exercises: { id: string; type: ExerciseTrackingType; skipped?: boolean; warmupOnly?: boolean }[],
): FriendSessionRow {
  const startedAt = new Date(`${localDate}T08:00:00Z`);
  return {
    id,
    userId: OWNER,
    routineId: null,
    routineDayId: null,
    name: `Workout ${id}`,
    status: 'COMPLETED',
    startedAt,
    finishedAt,
    localDate,
    isDeload: true,
    notes: 'private',
    clientUpdatedAt: startedAt,
    engineVersion: 1,
    rotationAppliedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    exercises: exercises.map((e, position) => ({
      id: `se-${id}-${e.id}`,
      sessionId: id,
      exerciseId: e.id,
      routineExerciseId: null,
      position,
      repMin: 5,
      repMax: 8,
      targetRir: 2,
      restSec: 120,
      skipped: e.skipped ?? false,
      swappedFromId: 'swapped',
      lastSetRir: 1,
      prescription: { weightKg: 80 },
      notes: 'private',
      supersetGroup: null,
      exercise: meta(e.id, e.type),
      sets: [
        {
          id: `set-${id}-${e.id}`,
          sessionExerciseId: `se-${id}-${e.id}`,
          position: 0,
          weightKg: 80,
          reps: 6,
          isWarmup: e.warmupOnly ?? false,
          completedAt: startedAt,
          durationSec: e.type === ExerciseTrackingType.DISTANCE ? 1500 : null,
          distanceM: e.type === ExerciseTrackingType.DISTANCE ? 5000 : null,
          intensityRpe: 7,
          resistanceLevel: null,
          inclinePct: null,
          caloriesKcal: null,
          avgHeartRateBpm: 155,
        },
      ],
    })),
  };
}

describe('workouts (FD-15: owner-today − 6 … owner-today, ≤ 30, no cursor)', () => {
  it.each([
    // now 2026-10-01T16:00Z: Tokyo is already 2 Oct, Los Angeles still 1 Oct.
    ['Asia/Tokyo', '2026-09-26', '2026-10-02'],
    ['America/Los_Angeles', '2026-09-25', '2026-10-01'],
    [null, '2026-09-25', '2026-10-01'],
  ])('tz %s → %s … %s', async (tz, from, to) => {
    const { service, deps } = setup({ now: new Date('2026-10-01T16:00:00Z'), timeZone: tz });
    await service.workouts(OWNER, 5);
    expect(deps.sessions.listCompletedInLocalDateRange).toHaveBeenCalledWith(OWNER, from, to, 30);
  });

  it('skips skipped and warm-up-only exercises, filters tracking types by level, caps duration', async () => {
    const start = new Date('2026-09-30T08:00:00Z');
    const { service } = setup({
      sessions: [
        session('w1', '2026-09-30', new Date(start.getTime() + 13 * 3600_000), [
          { id: 'squat', type: ExerciseTrackingType.WEIGHT_REPS },
          { id: 'run', type: ExerciseTrackingType.DISTANCE },
          { id: 'dips', type: ExerciseTrackingType.BODYWEIGHT_REPS, skipped: true },
          { id: 'curl', type: ExerciseTrackingType.WEIGHT_REPS, warmupOnly: true },
          { id: 'intervals', type: ExerciseTrackingType.INTERVALS },
        ]),
        session('w2', '2026-09-28', null, [
          { id: 'bench', type: ExerciseTrackingType.WEIGHT_REPS },
        ]),
      ],
    });
    const level0 = await service.workouts(OWNER, 0);
    expect(level0.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(level0[0]!.exercises.map((e) => e.exerciseId)).toEqual(['squat']);
    expect(level0[0]!.durationMin).toBe(600);
    expect(level0[1]!.durationMin).toBeNull();

    const level3 = await service.workouts(OWNER, 3);
    expect(level3[0]!.exercises.map((e) => e.exerciseId)).toEqual(['squat', 'run']);
    expect(level3[0]!.exercises[1]!.sets).toEqual([
      { weightKg: 80, reps: 6, durationSec: 1500, distanceM: 5000 },
    ]);
    const level5 = await service.workouts(OWNER, 7);
    expect(level5[0]!.exercises.map((e) => e.exerciseId)).toEqual(['squat', 'run', 'intervals']);

    const json = JSON.stringify(level5);
    for (const leak of ['private', 'swapped', 'isDeload', 'avgHeartRateBpm', 'intensityRpe']) {
      expect(json).not.toContain(leak);
    }
  });

  it('drops sessions outside the window even if a repository returned them', async () => {
    const { service } = setup({
      timeZone: 'UTC',
      sessions: [
        session('in', '2026-09-25', null, []),
        session('old', '2026-09-24', null, []),
        session('future', '2026-10-02', null, []),
      ],
    });
    expect((await service.workouts(OWNER, 5)).map((w) => w.id)).toEqual(['in']);
  });
});

describe('routine', () => {
  it('null without an active routine; otherwise filtered by level', async () => {
    expect(await setup().service.routine(OWNER, 5)).toBeNull();
    const routine = {
      id: 'cr',
      userId: OWNER,
      name: 'Full body',
      templateKey: null,
      isActive: true,
      nextDayId: null,
      version: 1,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastEditedById: null,
      lastEditedAt: null,
      days: [
        {
          id: 'cd',
          routineId: 'cr',
          position: 0,
          name: 'A',
          plannedWeekday: 2,
          exercises: [
            ExerciseTrackingType.WEIGHT_REPS,
            ExerciseTrackingType.DISTANCE,
            ExerciseTrackingType.INTERVALS,
          ].map((t, position) => ({
            id: `cre-${t}`,
            dayId: 'cd',
            exerciseId: t,
            position,
            sets: 3,
            repMin: 8,
            repMax: 10,
            targetRir: 2,
            restSec: 90,
            supersetGroup: null,
            notes: 'private',
            trainerNote: null,
            lastEditedById: null,
            lastEditedAt: null,
            exercise: meta(t, t),
          })),
        },
      ],
    } as FriendRoutineRow;
    const { service } = setup({ routine });
    const types = async (level: number) =>
      (await service.routine(OWNER, level))!.days[0]!.exercises.map((e) => e.trackingType);
    expect(await types(0)).toEqual(['WEIGHT_REPS']);
    expect(await types(3)).toEqual(['WEIGHT_REPS', 'DISTANCE']);
    expect(await types(7)).toEqual(['WEIGHT_REPS', 'DISTANCE', 'INTERVALS']);
  });
});
