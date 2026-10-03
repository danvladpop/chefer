import { describe, expect, it, vi } from 'vitest';
import type { Recipe, SocialUserRow } from '@chefer/database';
import { ExerciseTrackingType, FRIENDS_COPY } from '@chefer/types';
import {
  friendDurationMin,
  readSlots,
  toFriendProfileDto,
  toFriendRecipeCard,
  toFriendRoutineDto,
  toFriendUserSummary,
  toFriendWeekDto,
  toFriendWorkoutDto,
  type FriendRoutineRow,
  type FriendSessionRow,
} from './friend-dto.mappers.js';
import type { SocialAccess } from './social-access.service.js';

// ─── INV-2: allow-list DTOs (implementation-plan.md §1, §5) ───────────────────
// Every friend DTO is built from a FULLY populated owner — rows carrying every
// private field the schema has (notes, deload, heart rate, RPE, prescription,
// swaps, pinned slots, warm-ups) plus the private data own-data DTOs carry
// (email, allergies, safety, cost, calorie target) smuggled onto the rows —
// and the exact deep key set of the result is asserted. A new field reaching
// a follower has to be added here on purpose.

// client-level.ts → flags.ts → env.ts (which throws without secrets).
vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: () => false }));
vi.mock('../../lib/env.js', () => ({ env: {} }));

const OWNER = 'cowner000000000000000001';
const VIEWER = 'cviewer00000000000000001';

const FORBIDDEN_KEYS = [
  'email',
  'allergies',
  'safety',
  'notes',
  'calorieTarget',
  'estimatedCost',
  'pinned',
  'avgHeartRateBpm',
  'prescription',
  'isDeload',
] as const;

/** Every key path in `value`: `a.b`, arrays as `a[].b`. */
function deepKeys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((v) => deepKeys(v, `${prefix}[]`)))].sort();
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        return [path, ...deepKeys(v, path)];
      })
      .sort();
  }
  return [];
}

function expectNoForbiddenKeys(value: unknown): void {
  const leaves = deepKeys(value).map((p) => p.split('.').pop()!.replace(/\[\]$/, ''));
  for (const key of FORBIDDEN_KEYS) expect(leaves, key).not.toContain(key);
}

// ─── A fully populated owner ──────────────────────────────────────────────────

/** Private data own-data DTOs carry, smuggled onto rows to prove nothing spreads. */
const SMUGGLED = {
  email: 'owner@chefer.dev',
  allergies: ['peanuts'],
  safety: { conflicts: ['peanuts'] },
  notes: 'secret note',
  calorieTarget: 1800,
  estimatedCost: 12.5,
  pinned: true,
  avgHeartRateBpm: 150,
  prescription: { weightKg: 100 },
  isDeload: true,
};

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  const row: Recipe = {
    id: 'crecipe00000000000000001',
    name: 'Chicken bowl',
    description: 'Private description',
    ingredients: [{ name: 'chicken', quantity: 200, unit: 'g' }],
    instructions: ['Cook it'],
    nutritionInfo: { calories: 520.4, protein: 40.2, carbs: 50.6, fat: 15.1, fiber: 8 },
    cuisineType: 'Asian',
    dietaryTags: ['high-protein'],
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    imageUrl: 'https://img.chefer.dev/bowl.jpg',
    imageStatus: 'DONE',
    imageRetries: 2,
    imagePriority: 0,
    source: 'MANUAL',
    sourceUrl: 'https://www.bbcgoodfood.com/recipes/bowl',
    creatorId: OWNER,
    createdAt: new Date('2026-09-20T10:00:00Z'),
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
  return { ...SMUGGLED, ...row };
}

const hiddenRecipe = recipe({
  id: 'crecipe00000000000000002',
  name: 'Offensive name',
  imageUrl: 'https://img.chefer.dev/offensive.jpg',
  hiddenAt: new Date('2026-09-25T10:00:00Z'),
  hiddenReason: 'REPORTS',
});

const ownerUser = {
  id: OWNER,
  firstName: 'Maria',
  lastName: 'Pop',
  name: 'mp',
  image: null,
  ...SMUGGLED,
} as SocialUserRow;

const access: SocialAccess = {
  visible: true,
  isSelf: false,
  ownerVisibility: 'PRIVATE',
  outgoing: 'ACCEPTED',
  incoming: 'PENDING',
  can: { plan: 'visible', recipes: 'visible', workouts: 'visible', targets: true },
};

const targets = { dailyCalorieTarget: 2100.4, proteinG: 150, carbsG: 210, fatG: 70 };

function fullWeek() {
  const slot = (type: string, recipeId: string, extra: object = {}) => ({
    type,
    recipeId,
    portion: 1.5,
    leftoverOf: 'Monday',
    ...SMUGGLED,
    ...extra,
  });
  return toFriendWeekDto({
    weekStartDate: '2026-09-28',
    todayIndex: 2,
    ownerId: OWNER,
    days: [
      { dayOfWeek: 0, meals: [slot('lunch', recipe().id), slot('dinner', hiddenRecipe.id)] },
      { dayOfWeek: 2, meals: [slot('breakfast', 'cmissing0000000000000001')] },
    ],
    recipesById: new Map([
      [recipe().id, recipe()],
      [hiddenRecipe.id, hiddenRecipe],
    ]),
    savedIds: new Set([recipe().id]),
    targets: { ...SMUGGLED, ...targets },
  });
}

const exerciseMeta = (id: string, trackingType: ExerciseTrackingType, ownerId: string | null) => ({
  id,
  name: `Exercise ${id}`,
  ownerId,
  trackingType,
});

function fullRoutine(): FriendRoutineRow {
  const re = (id: string, position: number, trackingType: ExerciseTrackingType) => ({
    id: `cre${id}`,
    dayId: 'cday1',
    exerciseId: id,
    position,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 90,
    supersetGroup: position === 0 ? 'A' : null,
    notes: 'private routine note',
    exercise: exerciseMeta(id, trackingType, id === 'custom-row' ? OWNER : null),
  });
  return {
    id: 'croutine1',
    userId: OWNER,
    name: 'Push Pull Legs',
    templateKey: 'ppl',
    isActive: true,
    nextDayId: 'cday1',
    version: 3,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    days: [
      {
        id: 'cday2',
        routineId: 'croutine1',
        position: 1,
        name: 'Pull',
        plannedWeekday: null,
        exercises: [re('custom-row', 0, ExerciseTrackingType.WEIGHT_REPS)],
      },
      {
        id: 'cday1',
        routineId: 'croutine1',
        position: 0,
        name: 'Push',
        plannedWeekday: 0,
        exercises: [
          re('bench-press', 1, ExerciseTrackingType.WEIGHT_REPS),
          re('rowing', 0, ExerciseTrackingType.DURATION_DISTANCE),
        ],
      },
    ],
  };
}

function fullSession(): FriendSessionRow {
  const set = (id: string, position: number, extra: object = {}) => ({
    id,
    sessionExerciseId: 'cse',
    position,
    weightKg: 100,
    reps: 5,
    isWarmup: false,
    completedAt: new Date('2026-09-29T08:10:00Z'),
    durationSec: null,
    distanceM: null,
    intensityRpe: 8,
    resistanceLevel: 4,
    inclinePct: 2,
    caloriesKcal: 50,
    avgHeartRateBpm: 150,
    ...extra,
  });
  const se = (
    id: string,
    position: number,
    trackingType: ExerciseTrackingType,
    sets: ReturnType<typeof set>[],
    skipped = false,
  ) => ({
    id: `cse-${id}`,
    sessionId: 'csession1',
    exerciseId: id,
    routineExerciseId: 'cre1',
    position,
    repMin: 3,
    repMax: 5,
    targetRir: 2,
    restSec: 180,
    skipped,
    swappedFromId: 'other-exercise',
    lastSetRir: 1,
    prescription: { weightKg: 100, reps: [5, 5, 5] },
    notes: 'felt heavy',
    supersetGroup: null,
    sets,
    exercise: exerciseMeta(id, trackingType, null),
  });
  return {
    id: 'csession1',
    userId: OWNER,
    routineId: 'croutine1',
    routineDayId: 'cday1',
    name: 'Push',
    status: 'COMPLETED',
    startedAt: new Date('2026-09-29T08:00:00Z'),
    finishedAt: new Date('2026-09-29T09:05:20Z'),
    localDate: '2026-09-29',
    isDeload: true,
    notes: 'deload week',
    clientUpdatedAt: new Date(),
    engineVersion: 3,
    rotationAppliedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    exercises: [
      se('squat', 1, ExerciseTrackingType.WEIGHT_REPS, [
        set('s2', 1),
        set('s1', 0, { isWarmup: true, weightKg: 60 }),
        set('s3', 2, { completedAt: null }),
      ]),
      se('plank', 0, ExerciseTrackingType.DURATION, [
        set('p1', 0, { weightKg: 0, reps: 0, durationSec: 60 }),
      ]),
      se('run', 2, ExerciseTrackingType.DISTANCE, [set('r1', 0, { distanceM: 5000 })]),
      se('dips', 3, ExerciseTrackingType.BODYWEIGHT_REPS, [set('d1', 0)], true),
      se('curl', 4, ExerciseTrackingType.WEIGHT_REPS, [set('c1', 0, { isWarmup: true })]),
    ],
  };
}

const ALL_TYPES = new Set(Object.values(ExerciseTrackingType));
const STRENGTH_ONLY = new Set<ExerciseTrackingType>([
  ExerciseTrackingType.WEIGHT_REPS,
  ExerciseTrackingType.BODYWEIGHT_REPS,
  ExerciseTrackingType.DURATION,
]);

// ─── Exact key sets ───────────────────────────────────────────────────────────

const USER_KEYS = [
  'displayName',
  'firstName',
  'followsYou',
  'id',
  'imageUrl',
  'relation',
  'requestedYou',
];
const CARD_KEYS = [
  'byOwner',
  'hidden',
  'id',
  'imageStatus',
  'imageUrl',
  'isFavourite',
  'name',
  'perServing',
  'perServing.carbs',
  'perServing.fat',
  'perServing.kcal',
  'perServing.protein',
  'sourceDomain',
  'sourceUrl',
  'totalTimeMins',
];
const MACRO_KEYS = (p: string) => [p, `${p}.carbs`, `${p}.fat`, `${p}.kcal`, `${p}.protein`];
const sorted = (keys: string[]) => [...keys].sort();

describe('friend DTO key sets (INV-2)', () => {
  it('FriendProfileDto', () => {
    const dto = toFriendProfileDto({
      user: ownerUser,
      profile: { visibility: 'PRIVATE', ...SMUGGLED } as never,
      access,
      counts: { followers: 3, following: 4, pendingRequests: 9, ...SMUGGLED } as never,
      recipeCount: 7,
    });
    expect(deepKeys(dto)).toEqual(
      sorted([
        'access',
        'access.plan',
        'access.recipes',
        'access.workouts',
        'counts',
        'counts.followers',
        'counts.following',
        'isSelf',
        'recipeCount',
        'user',
        ...USER_KEYS.map((k) => `user.${k}`),
        'visibility',
      ]),
    );
    expectNoForbiddenKeys(dto);
    expect(dto).toMatchObject({
      user: {
        displayName: 'Maria Pop',
        firstName: 'Maria',
        relation: 'following',
        followsYou: false,
        requestedYou: true,
      },
      recipeCount: 7,
      counts: { followers: 3, following: 4 },
    });
  });

  it('FriendProfileDto withholds recipeCount unless recipes are visible', () => {
    const locked = { ...access, can: { ...access.can, recipes: 'not_shared' as const } };
    const dto = toFriendProfileDto({
      user: ownerUser,
      profile: { visibility: 'PUBLIC' },
      access: locked,
      counts: { followers: 0, following: 0 },
      recipeCount: 7,
    });
    expect(dto.recipeCount).toBeNull();
  });

  it('FriendUserSummary for self', () => {
    const dto = toFriendUserSummary(ownerUser, { isSelf: true, outgoing: null, incoming: null });
    expect(deepKeys(dto)).toEqual(sorted(USER_KEYS));
    expect(dto.relation).toBe('self');
  });

  it('FriendWeekDto', () => {
    const dto = fullWeek();
    const meal = 'days[].meals[]';
    expect(deepKeys(dto)).toEqual(
      sorted([
        'averageKcal',
        'days',
        'days[].dayOfWeek',
        'days[].meals',
        `${meal}.leftoverOf`,
        `${meal}.portion`,
        `${meal}.recipe`,
        ...CARD_KEYS.map((k) => `${meal}.recipe.${k}`),
        ...MACRO_KEYS(`${meal}.totals`),
        `${meal}.type`,
        ...MACRO_KEYS('days[].totals'),
        ...MACRO_KEYS('targets'),
        'todayIndex',
        'weekStartDate',
      ]),
    );
    expectNoForbiddenKeys(dto);
    expect(dto.days.map((d) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // The missing recipe row's slot is dropped; nothing else from the slot JSON.
    expect(dto.days[2]!.meals).toEqual([]);
    expect(dto.targets).toEqual({ kcal: 2100, protein: 150, carbs: 210, fat: 70 });
  });

  it('a hidden recipe in the week is masked but keeps its numbers', () => {
    const dto = fullWeek();
    const hidden = dto.days[0]!.meals[1]!;
    expect(hidden.recipe).toMatchObject({
      id: hiddenRecipe.id,
      name: FRIENDS_COPY.food.hiddenRecipe,
      imageUrl: null,
      sourceDomain: null,
      sourceUrl: null,
      hidden: true,
    });
    expect(hidden.recipe.name).toBe('Hidden recipe');
    expect(hidden.totals.kcal).toBe(781); // 520.4 × 1.5
    expect(JSON.stringify(dto)).not.toContain('Offensive');
    expect(JSON.stringify(dto)).not.toContain('offensive.jpg');
  });

  it('FriendRecipeCard (imported, by the owner, hearted)', () => {
    const card = toFriendRecipeCard(recipe(), { ownerId: OWNER, savedIds: new Set([recipe().id]) });
    expect(deepKeys(card)).toEqual(sorted(CARD_KEYS));
    expectNoForbiddenKeys(card);
    expect(card).toEqual({
      id: recipe().id,
      name: 'Chicken bowl',
      imageUrl: 'https://img.chefer.dev/bowl.jpg',
      imageStatus: 'DONE',
      perServing: { kcal: 520, protein: 40, carbs: 51, fat: 15 },
      totalTimeMins: 30,
      byOwner: true,
      sourceDomain: 'bbcgoodfood.com',
      sourceUrl: 'https://www.bbcgoodfood.com/recipes/bowl',
      isFavourite: true,
      hidden: false,
    });
  });

  it('FriendRecipeCard: open recipes and copies are not "by" the owner; bad source URLs are dropped', () => {
    const ctx = { ownerId: OWNER, savedIds: new Set<string>() };
    expect(toFriendRecipeCard(recipe({ source: 'AI', creatorId: null }), ctx).byOwner).toBe(false);
    expect(
      toFriendRecipeCard(recipe({ originRecipeId: 'corig', originCreatorId: VIEWER }), ctx).byOwner,
    ).toBe(false);
    const js = toFriendRecipeCard(recipe({ sourceUrl: 'javascript:alert(1)' }), ctx);
    expect(js.sourceDomain).toBeNull();
    expect(js.sourceUrl).toBeNull();
    expect(toFriendRecipeCard(recipe({ sourceUrl: null }), ctx).sourceDomain).toBeNull();
  });

  it('FriendRoutineDto', () => {
    const dto = toFriendRoutineDto(fullRoutine(), ALL_TYPES);
    const ex = 'days[].exercises[]';
    expect(deepKeys(dto)).toEqual(
      sorted([
        'days',
        'days[].exercises',
        ...[
          'exerciseId',
          'isCustom',
          'name',
          'repMax',
          'repMin',
          'restSec',
          'sets',
          'supersetGroup',
          'trackingType',
        ].map((k) => `${ex}.${k}`),
        'days[].name',
        'days[].plannedWeekday',
        'days[].position',
        'name',
      ]),
    );
    expectNoForbiddenKeys(dto);
    expect(dto.days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    expect(dto.days[0]!.exercises.map((e) => e.exerciseId)).toEqual(['rowing', 'bench-press']);
    expect(dto.days[1]!.exercises[0]!.isCustom).toBe(true);
    expect(dto.days[0]!.exercises[1]!.isCustom).toBe(false);
  });

  it('FriendRoutineDto drops exercises the client cannot render, keeps the day', () => {
    const dto = toFriendRoutineDto(fullRoutine(), STRENGTH_ONLY);
    expect(dto.days[0]!.exercises.map((e) => e.exerciseId)).toEqual(['bench-press']);
    expect(dto.days).toHaveLength(2);
  });

  it('FriendWorkoutDto', () => {
    const dto = toFriendWorkoutDto(fullSession(), ALL_TYPES);
    const ex = 'exercises[]';
    expect(deepKeys(dto)).toEqual(
      sorted([
        'durationMin',
        'exercises',
        `${ex}.exerciseId`,
        `${ex}.isCustom`,
        `${ex}.name`,
        `${ex}.sets`,
        `${ex}.sets[].distanceM`,
        `${ex}.sets[].durationSec`,
        `${ex}.sets[].reps`,
        `${ex}.sets[].weightKg`,
        `${ex}.trackingType`,
        'id',
        'localDate',
        'name',
        'startedAt',
      ]),
    );
    expectNoForbiddenKeys(dto);
    const json = JSON.stringify(dto);
    for (const leak of ['intensityRpe', 'swappedFromId', 'felt heavy', 'deload', 'lastSetRir']) {
      expect(json).not.toContain(leak);
    }
    expect(dto.durationMin).toBe(65);
    expect(dto.startedAt).toBe('2026-09-29T08:00:00.000Z');
  });

  it('workouts skip skipped exercises, warm-up-only exercises, warm-ups and unticked sets', () => {
    const dto = toFriendWorkoutDto(fullSession(), ALL_TYPES);
    expect(dto.exercises.map((e) => e.exerciseId)).toEqual(['plank', 'squat', 'run']);
    expect(dto.exercises[1]!.sets).toEqual([{ weightKg: 100, reps: 5 }]);
    expect(dto.exercises[0]!.sets).toEqual([{ weightKg: 0, reps: 0, durationSec: 60 }]);
    expect(dto.exercises[2]!.sets).toEqual([{ weightKg: 100, reps: 5, distanceM: 5000 }]);
  });

  it('F3.1: free-text gym names that trip the word filter reach a follower as neutral labels', () => {
    const routine = fullRoutine();
    routine.name = 'fuck legs';
    routine.days[0]!.name = 'shit day';
    routine.days[0]!.exercises[0]!.exercise.name = 'bitch press'; // the custom one
    const r = toFriendRoutineDto(routine, ALL_TYPES);
    expect(r.name).toBe(FRIENDS_COPY.gym.routine);
    expect(r.days.find((d) => d.position === 1)?.name).toBe(FRIENDS_COPY.gym.filtered.day(2));
    expect(r.days.find((d) => d.position === 0)?.name).toBe('Push'); // clean text passes
    const custom = r.days.flatMap((d) => d.exercises).find((e) => e.isCustom);
    expect(custom?.name).toBe(FRIENDS_COPY.gym.filtered.exercise);

    const session = { ...fullSession(), name: 'fuck mondays' };
    expect(toFriendWorkoutDto(session, ALL_TYPES).name).toBe(FRIENDS_COPY.gym.filtered.workout);
  });

  it('workouts apply the tracking-type filter but keep the session', () => {
    const dto = toFriendWorkoutDto(fullSession(), STRENGTH_ONLY);
    expect(dto.exercises.map((e) => e.exerciseId)).toEqual(['plank', 'squat']);
    const none = toFriendWorkoutDto(fullSession(), new Set());
    expect(none.exercises).toEqual([]);
    expect(none.id).toBe('csession1');
  });
});

describe('friendDurationMin', () => {
  const start = new Date('2026-09-29T08:00:00Z');
  it('rounds to minutes, caps at 600, null when unfinished or negative', () => {
    expect(friendDurationMin(start, new Date('2026-09-29T08:44:31Z'))).toBe(45);
    expect(friendDurationMin(start, new Date('2026-09-30T03:00:00Z'))).toBe(600);
    expect(friendDurationMin(start, new Date('2026-09-29T18:00:00Z'))).toBe(600);
    expect(friendDurationMin(start, null)).toBeNull();
    expect(friendDurationMin(start, new Date('2026-09-29T07:00:00Z'))).toBeNull();
  });
});

describe('readSlots', () => {
  it('reads only type, recipeId, portion and leftoverOf; skips invalid slots', () => {
    expect(
      readSlots([
        { type: 'lunch', recipeId: 'r1', portion: 2, pinned: true, leftoverOf: 'Tuesday' },
        { type: 'brunch', recipeId: 'r2' },
        { type: 'dinner' },
        null,
        'junk',
        { type: 'snack', recipeId: 'r3', portion: 'big', leftoverOf: '' },
      ]),
    ).toEqual([
      { type: 'lunch', recipeId: 'r1', portion: 2, leftoverOf: 'Tuesday' },
      { type: 'snack', recipeId: 'r3', portion: undefined, leftoverOf: undefined },
    ]);
    expect(readSlots(null)).toEqual([]);
    expect(readSlots({ not: 'an array' })).toEqual([]);
  });
});
