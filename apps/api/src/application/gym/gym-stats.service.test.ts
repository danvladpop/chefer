import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IExerciseRepository,
  ITrainingPauseRepository,
  IWorkoutSessionRepository,
  WeightEntry,
} from '@chefer/database';
import type { SessionSummaryDto } from '@chefer/types';
import { bestE1rm, collectPrs, toSessionSummary } from '@chefer/utils';
import { profileRow, sessionDoc, sessionRow } from './__test__/fixtures.js';
import type { GymUserContext } from './gym-context.js';
import { GymStatsService, shiftMonth } from './gym-stats.service.js';
import { toEquipmentProfile } from './mappers.js';

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  bestE1rm: vi.fn(),
  collectPrs: vi.fn(),
  toSessionSummary: vi.fn(),
  addDaysLocal: vi.fn((d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }),
}));

const USER = 'u1';

/** Summary with one bench entry whose single working set is `kg × reps`. */
function summary(localDate: string, kg: number, reps = 5): SessionSummaryDto {
  return {
    id: `s-${localDate}`,
    name: 'A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate,
    startedAt: `${localDate}T10:00:00.000Z`,
    finishedAt: null,
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: null,
        sets: [
          { weightKg: 20, reps: 10, isWarmup: true, completed: true },
          { weightKg: kg, reps, isWarmup: false, completed: true },
        ],
      },
    ],
  };
}

function setup(summaries: SessionSummaryDto[], weights: WeightEntry[] = []) {
  // Each stored row maps (via the mocked engine) to the next summary.
  const rows = summaries.map(() => sessionRow(sessionDoc()));
  const queue = [...summaries];
  vi.mocked(toSessionSummary).mockImplementation(() => queue.shift()!);
  const sessionRepo = {
    findCompleted: vi.fn().mockResolvedValue(rows),
    findCompletedDates: vi.fn().mockResolvedValue([]),
  } as unknown as IWorkoutSessionRepository;
  const exerciseRepo = {
    findVisible: vi.fn().mockResolvedValue([]),
  } as unknown as IExerciseRepository;
  const pauseRepo = {
    listForUser: vi.fn().mockResolvedValue([]),
  } as unknown as ITrainingPauseRepository;
  const weightRepo = { findInRange: vi.fn().mockResolvedValue(weights) };
  const profile = profileRow();
  const context: GymUserContext = {
    profileRow: null,
    equipment: toEquipmentProfile(profile),
    experience: 'BEGINNER',
    facts: { experience: 'BEGINNER', ageYears: null },
    offerState: {},
    activeRoutine: null,
  };
  const loader = { load: vi.fn().mockResolvedValue(context) };
  return {
    service: new GymStatsService(sessionRepo, exerciseRepo, pauseRepo, weightRepo, loader),
    sessionRepo,
    weightRepo,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Engine stand-in: e1RM = weight × (1 + reps/30) over working sets.
  vi.mocked(bestE1rm).mockImplementation((sets) => {
    const work = sets.filter((s) => s.completed && !s.isWarmup);
    const best = work
      .map((s) => ({ e1rmKg: s.weightKg * (1 + s.reps / 30), weightKg: s.weightKg, reps: s.reps }))
      .sort((a, b) => b.e1rmKg - a.e1rmKg)[0];
    return best ? { ...best, lowConfidence: false } : null;
  });
});

describe('GymStatsService', () => {
  it('e1rm: PR flags use all history, the range trims output, trend = rolling max of 3', async () => {
    const { service } = setup([
      summary('2026-01-10', 100), // outside 3m
      summary('2026-08-01', 90),
      summary('2026-08-15', 105),
      summary('2026-09-01', 95),
      summary('2026-09-15', 110),
    ]);

    const s = await service.e1rm(USER, 'bench', '3m', '2026-09-24');

    expect(s.points.map((p) => p.localDate)).toEqual([
      '2026-08-01',
      '2026-08-15',
      '2026-09-01',
      '2026-09-15',
    ]);
    expect(s.points.map((p) => p.isPr)).toEqual([false, true, false, true]);
    const e = (kg: number) => kg * (1 + 5 / 30);
    expect(s.trend).toEqual([e(90), e(105), e(105), e(110)]);
  });

  it('repPrs keeps the heaviest completed working set per rep count', async () => {
    const { service } = setup([
      summary('2026-09-01', 100, 5),
      summary('2026-09-08', 102.5, 5),
      summary('2026-09-15', 90, 8),
    ]);

    const rows = await service.repPrs(USER, 'bench');

    expect(rows).toEqual([
      { reps: 5, weightKg: 102.5, localDate: '2026-09-08' },
      { reps: 8, weightKg: 90, localDate: '2026-09-15' },
    ]);
  });

  it('prs returns the engine timeline newest first, limited', async () => {
    vi.mocked(collectPrs).mockReturnValue([
      {
        exerciseId: 'bench',
        kind: 'weight',
        weightKg: 100,
        reps: 5,
        e1rmKg: null,
        localDate: '2026-09-01',
        sessionId: 'a',
      },
      {
        exerciseId: 'bench',
        kind: 'weight',
        weightKg: 105,
        reps: 5,
        e1rmKg: null,
        localDate: '2026-09-08',
        sessionId: 'b',
      },
    ]);
    const { service } = setup([summary('2026-09-01', 100)]);

    const prs = await service.prs(USER, 'bench', 1);

    expect(prs.map((p) => p.sessionId)).toEqual(['b']);
  });

  it('bodyweight keeps the last entry per day within the range', async () => {
    const { service, weightRepo } = setup([], [
      { weightKg: 80, recordedAt: new Date('2026-09-20T07:00:00Z') },
      { weightKg: 79.6, recordedAt: new Date('2026-09-20T21:00:00Z') },
      { weightKg: 79.2, recordedAt: new Date('2026-09-22T07:00:00Z') },
    ] as WeightEntry[]);

    const pts = await service.bodyweight(USER, '3m', '2026-09-24');

    expect(weightRepo.findInRange).toHaveBeenCalledWith(
      USER,
      new Date('2026-06-25T00:00:00.000Z'),
      new Date('2026-09-25T00:00:00.000Z'),
    );
    expect(pts).toEqual([
      { localDate: '2026-09-20', weightKg: 79.6 },
      { localDate: '2026-09-22', weightKg: 79.2 },
    ]);
  });

  it('shiftMonth wraps years both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-05', 0)).toBe('2026-05');
  });
});
