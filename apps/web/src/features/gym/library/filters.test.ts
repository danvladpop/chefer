import { describe, expect, it } from 'vitest';
import type { ExerciseDto } from '@chefer/types';
import { DEFAULT_LIBRARY_FILTERS, filterExercises } from './filters';

function exercise(overrides: Partial<ExerciseDto> = {}): ExerciseDto {
  return {
    id: 'barbell-bench-press',
    ownerId: null,
    name: 'Barbell Bench Press',
    aliases: ['bench press', 'flat bench'],
    category: 'COMPOUND',
    movementPattern: 'horizontal-push',
    equipment: 'BARBELL',
    loadType: 'WEIGHTED',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    repMin: 6,
    repMax: 10,
    restSec: 180,
    incrementKg: 2.5,
    perHand: false,
    isLowerBody: false,
    isTimed: false,
    swapGroup: 'horizontal-press',
    cues: [],
    mistakes: [],
    blurb: null,
    images: [],
    videoId: null,
    videoStartSec: null,
    videoChannel: null,
    archived: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterExercises', () => {
  const library: ExerciseDto[] = [
    exercise(),
    exercise({
      id: 'goblet-squat',
      name: 'Goblet Squat',
      aliases: [],
      equipment: 'DUMBBELL',
      primaryMuscles: ['quads'],
      secondaryMuscles: ['glutes'],
    }),
    exercise({
      id: 'my-curl',
      ownerId: 'user-1',
      name: 'My Custom Curl',
      aliases: [],
      category: 'ISOLATION',
      equipment: 'DUMBBELL',
      primaryMuscles: ['biceps'],
      secondaryMuscles: [],
    }),
    exercise({ id: 'archived-row', archived: true }),
  ];

  it('excludes archived rows always', () => {
    const result = filterExercises(library, DEFAULT_LIBRARY_FILTERS);
    expect(result.some((e) => e.id === 'archived-row')).toBe(false);
  });

  it('matches by name, case-insensitively', () => {
    const result = filterExercises(library, { ...DEFAULT_LIBRARY_FILTERS, query: 'squat' });
    expect(result.map((e) => e.id)).toEqual(['goblet-squat']);
  });

  it('matches by alias', () => {
    const result = filterExercises(library, { ...DEFAULT_LIBRARY_FILTERS, query: 'flat bench' });
    expect(result.map((e) => e.id)).toEqual(['barbell-bench-press']);
  });

  it('filters by equipment', () => {
    const result = filterExercises(library, { ...DEFAULT_LIBRARY_FILTERS, equipment: 'DUMBBELL' });
    expect(result.map((e) => e.id).sort()).toEqual(['goblet-squat', 'my-curl']);
  });

  it('filters by muscle group, matching primary or secondary', () => {
    const result = filterExercises(library, { ...DEFAULT_LIBRARY_FILTERS, muscleGroup: 'glutes' });
    expect(result.map((e) => e.id)).toEqual(['goblet-squat']);
  });

  it('"Mine" keeps only exercises with an owner', () => {
    const result = filterExercises(library, { ...DEFAULT_LIBRARY_FILTERS, mineOnly: true });
    expect(result.map((e) => e.id)).toEqual(['my-curl']);
  });

  it('sorts alphabetically by name', () => {
    const result = filterExercises(library, DEFAULT_LIBRARY_FILTERS);
    expect(result.map((e) => e.name)).toEqual([
      'Barbell Bench Press',
      'Goblet Squat',
      'My Custom Curl',
    ]);
  });

  it('combines filters', () => {
    const result = filterExercises(library, {
      query: 'curl',
      muscleGroup: 'biceps',
      equipment: 'DUMBBELL',
      mineOnly: true,
    });
    expect(result.map((e) => e.id)).toEqual(['my-curl']);
  });
});
