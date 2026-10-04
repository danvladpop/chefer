import { act } from '@testing-library/react-native';
import type {
  AdherenceDto,
  ClientRowDto,
  CoachedWorkoutDto,
  InviteDto,
  NextTargetDto,
  Suggestion,
  TrainerRoutineDto,
} from '@chefer/types';
import type { Handlers } from './friends-core-harness';
import { makeExercise } from './gym-fixtures';

// Shared fixtures for the trainer-* tests (WP-18 lane C). Handlers answer by tRPC path through the fake
// link in friends-core-harness (`renderWithTrpc`), so a test can assert exactly which procedures ran.

export async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

export const MARIA = 'cmaria000000000000000001';
export const ION = 'cion00000000000000000002';

export function clientRow(overrides: Partial<ClientRowDto> = {}): ClientRowDto {
  return {
    clientId: MARIA,
    name: 'Maria Pop',
    since: '2026-09-20T09:00:00.000Z',
    label: 'Maria, Tue/Thu',
    lastWorkoutDate: '2026-09-30',
    week: { sessions: 2, goal: 3 },
    inactiveDays: 2,
    routineChangedByClientAt: null,
    ...overrides,
  };
}

/** Handlers for a user who may be a trainer and has trainer tools on. */
export function trainerHandlers(overrides: Handlers = {}): Handlers {
  return {
    'coaching.availability': () => ({ enabled: true, canBeTrainer: true }),
    'trainer.status': () => ({ canActivate: true, active: true, displayName: 'Ana' }),
    'trainer.clients.list': () => [clientRow()],
    'user.me': () => ({ name: 'Ana Ionescu' }),
    ...overrides,
  };
}

export function invite(overrides: Partial<InviteDto> = {}): InviteDto {
  return {
    code: '7K2M9Q4XHA',
    url: 'https://chefer.app/coaching/join/7K2M9Q4XHA',
    label: 'Maria, Tue/Thu',
    createdAt: '2026-10-01T09:00:00.000Z',
    expiresAt: '2026-10-15T09:00:00.000Z',
    state: 'OPEN',
    ...overrides,
  };
}

export function workout(overrides: Partial<CoachedWorkoutDto> = {}): CoachedWorkoutDto {
  return {
    id: 'w1',
    name: 'Upper A',
    localDate: '2026-09-30',
    startedAt: '2026-09-30T17:00:00.000Z',
    finishedAt: '2026-09-30T18:00:00.000Z',
    durationMin: 58,
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Barbell Bench Press',
        skipped: false,
        lastSetRir: 2,
        sets: [
          { weightKg: 40, reps: 10, isWarmup: true, completed: true },
          { weightKg: 60, reps: 8, isWarmup: false, completed: true },
          { weightKg: 60, reps: 7, isWarmup: false, completed: true },
        ],
      },
      { exerciseId: 'row', name: 'Barbell Row', skipped: true, lastSetRir: null, sets: [] },
    ],
    ...overrides,
  };
}

export function adherence(overrides: Partial<AdherenceDto> = {}): AdherenceDto {
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(2026, 8, 21 + i); // 21 Sep … 4 Oct (Mon first)
    const pad = (n: number) => String(n).padStart(2, '0');
    const localDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return {
      localDate,
      planned: i % 2 === 0 || i === 13,
      trained: i === 0 || i === 2,
      paused: i === 4,
    };
  });
  return {
    weeks: [
      { weekStart: '2026-09-14', goal: 3, sessions: 3, status: 'met' },
      { weekStart: '2026-09-21', goal: 3, sessions: 1, status: 'under' },
      { weekStart: '2026-09-28', goal: 3, sessions: 0, status: 'paused' },
    ],
    days,
    ...overrides,
  };
}

const SUGGESTION: Suggestion = {
  kind: 'hold',
  weightKg: 60,
  reps: [8, 8, 8],
  sets: 3,
  reasonCode: 'TOP_OF_RANGE',
  inputs: {},
  deltaKg: 0,
  engineVersion: 1,
};

export function nextTarget(overrides: Partial<NextTargetDto> = {}): NextTargetDto {
  return {
    repBucket: '6-8',
    suggestion: SUGGESTION,
    override: null,
    lastDoneDate: null,
    ...overrides,
  };
}

export const LIBRARY = [
  makeExercise('bench', 'Barbell Bench Press'),
  makeExercise('row', 'Barbell Row'),
  makeExercise('squat', 'Back Squat'),
  { ...makeExercise('mine', 'Maria Custom Lift'), ownerId: MARIA },
];

export function trainerRoutine(overrides: Partial<TrainerRoutineDto> = {}): TrainerRoutineDto {
  return {
    id: 'r1',
    name: 'Maria routine',
    templateKey: null,
    version: 4,
    nextDayId: 'd1',
    updatedAt: '2026-10-03T09:00:00.000Z',
    lastEditedByOther: null,
    days: [
      {
        id: 'd1',
        position: 0,
        name: 'Upper',
        plannedWeekday: 3,
        exercises: [
          {
            id: 'e1',
            exerciseId: 'bench',
            position: 0,
            sets: 4,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 180,
            supersetGroup: null,
            trainerNote: null,
            lastEditedByOther: null,
            next: nextTarget(),
          },
          {
            id: 'e2',
            exerciseId: 'row',
            position: 1,
            sets: 3,
            repMin: 10,
            repMax: 12,
            targetRir: 1,
            restSec: 90,
            supersetGroup: null,
            trainerNote: null,
            lastEditedByOther: null,
            next: null,
          },
        ],
      },
    ],
    exercises: LIBRARY.slice(0, 2).map((e) => ({ ...e, isCustom: false })),
    ...overrides,
  };
}
