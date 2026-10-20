import type {
  CoachStartDto,
  NextWorkoutDto,
  NextWorkoutExerciseDto,
  Suggestion,
  TrainerBookingDto,
} from '@chefer/types';
import { makeExercise } from './gym-fixtures';

// Fixtures for the coached logger tests (trainer mode M3, trainer-mode.md §6.7). Not a test file.

export const MARIA = 'cmaria000000000000000001';
export const ION = 'cion00000000000000000002';
export const BOOKING = 'cbooking0000000000000001';

export function coachSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    kind: 'start',
    weightKg: 60,
    reps: [10, 10, 10],
    sets: 3,
    reasonCode: 'START',
    inputs: { repMin: 8, repMax: 12, loadType: 'WEIGHTED', equipment: 'BARBELL' },
    deltaKg: 0,
    engineVersion: 1,
    ...overrides,
  };
}

export function prescribed(
  exerciseId: string,
  overrides: Partial<NextWorkoutExerciseDto> = {},
): NextWorkoutExerciseDto {
  return {
    routineExerciseId: `re-${exerciseId}`,
    exerciseId,
    position: 0,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    notes: null,
    repBucket: '8-12',
    suggestion: coachSuggestion(),
    warmups: [],
    lastTime: null,
    ...overrides,
  };
}

export function nextWorkout(overrides: Partial<NextWorkoutDto> = {}): NextWorkoutDto {
  return {
    routineId: 'routine-maria',
    dayId: 'day-lower-a',
    dayName: 'Lower body A',
    isDeload: false,
    estimatedMin: 45,
    exercises: [prescribed('squat')],
    ...overrides,
  };
}

export function coachStart(
  clientId: string,
  name: string,
  overrides: Partial<CoachStartDto> = {},
): CoachStartDto {
  return {
    client: { id: clientId, name, unit: 'KG' },
    workout: nextWorkout(),
    exercises: [makeExercise('squat', 'Back Squat')],
    bookingId: BOOKING,
    ...overrides,
  };
}

export function booking(overrides: Partial<TrainerBookingDto> = {}): TrainerBookingDto {
  return {
    id: BOOKING,
    kind: 'BOOKING',
    seriesId: null,
    startsAt: '2026-10-19T18:00:00.000Z',
    endsAt: '2026-10-19T19:00:00.000Z',
    durationMin: 60,
    timeZone: 'Europe/Bucharest',
    location: null,
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: [
      {
        clientId: MARIA,
        name: 'Maria Pop',
        attendance: 'SCHEDULED',
        workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
        workoutSessionId: null,
      },
      {
        clientId: ION,
        name: 'Ion Rusu',
        attendance: 'SCHEDULED',
        workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
        workoutSessionId: null,
      },
    ],
    ...overrides,
  };
}
