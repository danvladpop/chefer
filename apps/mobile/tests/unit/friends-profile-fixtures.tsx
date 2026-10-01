import { QueryClient } from '@tanstack/react-query';
import type {
  FriendProfileDto,
  FriendRecipeCard,
  FriendRoutineDto,
  FriendWeekDto,
  FriendWorkoutDto,
} from '@chefer/types';
import { person } from './friends-core-harness';

// Fixtures for the friends-profile-* tests (F2.2). Carol is the seeded public
// profile the Maestro flow uses too.

/**
 * The harness client, plus `gcTime: 0` for mutations: TanStack's default
 * 5-minute mutation GC timer otherwise keeps a single-file (in-band) Jest
 * run alive after the tests finish.
 */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

export const CAROL_ID = 'cseedcarol000000000000001';

export const CAROL = person({
  id: CAROL_ID,
  displayName: 'Carol Reyes',
  firstName: 'Carol',
  relation: 'following',
});

export function profileDto(overrides: Partial<FriendProfileDto> = {}): FriendProfileDto {
  return {
    user: CAROL,
    isSelf: false,
    visibility: 'PUBLIC',
    counts: { followers: 24, following: 31 },
    access: { plan: 'visible', recipes: 'visible', workouts: 'visible' },
    recipeCount: 6,
    ...overrides,
  };
}

export function lockedProfile(overrides: Partial<FriendProfileDto> = {}): FriendProfileDto {
  return profileDto({
    user: { ...CAROL, relation: 'none' },
    access: { plan: 'locked', recipes: 'locked', workouts: 'locked' },
    recipeCount: null,
    ...overrides,
  });
}

export function recipeCard(overrides: Partial<FriendRecipeCard> = {}): FriendRecipeCard {
  return {
    id: 'rcp-shakshuka',
    name: 'Shakshuka',
    imageUrl: null,
    imageStatus: 'DONE',
    perServing: { kcal: 420, protein: 26, carbs: 24, fat: 24 },
    totalTimeMins: 30,
    byOwner: true,
    sourceDomain: null,
    sourceUrl: null,
    isFavourite: false,
    hidden: false,
    ...overrides,
  };
}

const totals = (kcal: number) => ({ kcal, protein: 30, carbs: 40, fat: 12 });

export function weekDto(overrides: Partial<FriendWeekDto> = {}): FriendWeekDto {
  return {
    weekStartDate: '2026-09-28',
    todayIndex: 1,
    days: [
      {
        dayOfWeek: 1,
        meals: [
          {
            type: 'breakfast',
            portion: 1,
            recipe: recipeCard({ id: 'rcp-yogurt', name: 'Greek yogurt bowl' }),
            totals: totals(420),
          },
          {
            type: 'dinner',
            portion: 1,
            recipe: recipeCard({ id: 'rcp-hidden', name: 'Hidden recipe', hidden: true }),
            totals: totals(610),
          },
        ],
        totals: { kcal: 1030, protein: 60, carbs: 80, fat: 24 },
      },
      { dayOfWeek: 2, meals: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
    ],
    averageKcal: 1030,
    targets: null,
    ...overrides,
  };
}

const ex = (
  name: string,
  more: Partial<FriendRoutineDto['days'][number]['exercises'][number]> = {},
) => ({
  exerciseId: `ex-${name.toLowerCase().replace(/\s+/g, '-')}`,
  name,
  isCustom: false,
  sets: 3,
  repMin: 8,
  repMax: 12,
  restSec: 150,
  supersetGroup: null,
  trackingType: 'WEIGHT_REPS',
  ...more,
});

export function routineDto(): FriendRoutineDto {
  return {
    name: 'Push Pull Legs',
    days: [
      {
        position: 0,
        name: 'Push',
        plannedWeekday: 0,
        exercises: [
          ex('Bench press'),
          ex('Overhead press'),
          ex('Dips', { isCustom: true }),
          ex('Lateral raise'),
          ex('Triceps pushdown'),
          ex('Push-up'),
        ],
      },
      {
        position: 1,
        name: 'Pull',
        plannedWeekday: 2,
        exercises: [ex('Row'), ex('Pull-up')],
      },
    ],
  };
}

export function workoutsDto(): FriendWorkoutDto[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `w${i}`,
    name: i % 2 === 0 ? 'Push' : 'Pull',
    localDate: `2026-09-${String(29 - i).padStart(2, '0')}`,
    startedAt: `2026-09-${String(29 - i).padStart(2, '0')}T08:00:00.000Z`,
    durationMin: 58,
    exercises: [
      {
        exerciseId: 'ex-bench-press',
        name: 'Bench press',
        isCustom: false,
        trackingType: 'WEIGHT_REPS',
        sets: [
          { weightKg: 80, reps: 8 },
          { weightKg: 80, reps: 6 },
          { weightKg: 75, reps: 9 },
        ],
      },
      {
        exerciseId: 'ex-run',
        name: 'Run',
        isCustom: false,
        trackingType: 'DURATION_DISTANCE',
        sets: [{ weightKg: 0, reps: 0, durationSec: 1800, distanceM: 5000 }],
      },
    ],
  }));
}
