import { prescriptionFor } from '@/features/gym/workout/workout-model';
import {
  EXERCISE_BY_ID,
  type CoachStartDto,
  type GymProfileDto,
  type NextWorkoutDto,
  type NextWorkoutExerciseDto,
  type TrainerBookingDto,
} from '@chefer/types';

// Test-only fixtures for the coached logger.

export const TODAY = '2026-10-20';

const PROFILE: GymProfileDto = {
  experience: 'BEGINNER',
  equipmentAccess: 'FULL_GYM',
  unit: 'KG',
  weeklyGoal: 3,
  barWeightKg: 20,
  platePairsKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbellsKg: [10, 12, 14, 16, 18, 20],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
  reminderEnabled: false,
  reminderTime: null,
  reminderTimes: {},
  quietNudgeDays: null,
  setupCompletedAt: '2026-09-01T10:00:00.000Z',
};

/** A two-exercise routine day, prescribed by the shared engine. */
export function plannedWorkout(dayName = 'Lower body A'): NextWorkoutDto {
  const exercises = ['back-squat', 'barbell-bench-press'].map(
    (id, position): NextWorkoutExerciseDto => {
      const meta = EXERCISE_BY_ID.get(id);
      if (!meta) throw new Error(`unknown exercise ${id}`);
      const p = prescriptionFor({
        meta,
        bootstrap: { profile: PROFILE, progressions: [] },
        today: TODAY,
        sets: 3,
        repMin: 8,
        repMax: 12,
        isFirstForPattern: false,
      });
      return {
        routineExerciseId: `re-${position}`,
        exerciseId: id,
        position,
        sets: p.prescription.sets,
        repMin: p.repMin,
        repMax: p.repMax,
        targetRir: p.targetRir,
        restSec: p.restSec,
        supersetGroup: null,
        notes: null,
        repBucket: '8-12',
        suggestion: p.prescription,
        warmups: [],
        lastTime:
          position === 0
            ? { localDate: '2026-10-13', sets: [{ weightKg: 40, reps: 8 }], lastSetRir: 2 }
            : null,
      };
    },
  );
  return {
    routineId: 'routine-1',
    dayId: 'day-a',
    dayName,
    isDeload: false,
    estimatedMin: 45,
    exercises,
  };
}

export function coachStart(
  clientId: string,
  name: string,
  opts: { workout?: NextWorkoutDto | null; bookingId?: string | null; unit?: 'KG' | 'LB' } = {},
): CoachStartDto {
  return {
    client: { id: clientId, name, unit: opts.unit ?? 'KG' },
    workout: opts.workout === undefined ? plannedWorkout() : opts.workout,
    exercises: [],
    bookingId: opts.bookingId ?? null,
  };
}

export function booking(
  clients: {
    clientId: string;
    name: string;
    attendance?: 'SCHEDULED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED';
    workoutSessionId?: string | null;
  }[],
  id = 'b1',
): TrainerBookingDto {
  return {
    id,
    kind: 'BOOKING',
    seriesId: null,
    startsAt: '2026-10-20T15:00:00.000Z',
    endsAt: '2026-10-20T16:00:00.000Z',
    durationMin: 60,
    timeZone: 'Europe/Bucharest',
    location: null,
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: clients.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      attendance: c.attendance ?? 'SCHEDULED',
      workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
      workoutSessionId: c.workoutSessionId ?? null,
    })),
  };
}
