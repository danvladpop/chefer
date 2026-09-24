import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IExerciseProgressionRepository,
  IExerciseRepository,
  ITrainingPauseRepository,
  IWorkoutSessionRepository,
} from '@chefer/database';
import type { NextWorkoutDto, ProgressionDto, SessionSummaryDto } from '@chefer/types';
import {
  buildNextWorkout,
  shouldOfferDeload,
  summarizeWeeks,
  toSessionSummary,
} from '@chefer/utils';
import {
  exerciseRow,
  profileRow,
  progressionState,
  routineRow,
  sessionDoc,
  sessionRow,
  suggestion,
} from './__test__/fixtures.js';
import { GymBootstrapService, previousMonth } from './gym-bootstrap.service.js';
import type { GymUserContext } from './gym-context.js';
import { toEquipmentProfile, toRoutineDto } from './mappers.js';

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  buildNextWorkout: vi.fn(),
  shouldOfferDeload: vi.fn(),
  summarizeWeeks: vi.fn(),
  toSessionSummary: vi.fn(),
  weekStartOf: vi.fn(() => '2026-09-21'),
  addDaysLocal: vi.fn((d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }),
}));

const USER = 'u1';
const TODAY = '2026-09-24';

function ctx(over: Partial<GymUserContext> = {}): GymUserContext {
  const profile = profileRow();
  return {
    profileRow: profile,
    equipment: toEquipmentProfile(profile),
    experience: 'BEGINNER',
    facts: { experience: 'BEGINNER', ageYears: 34 },
    offerState: {},
    activeRoutine: toRoutineDto(routineRow({ nextDayId: 'day-b' })),
    ...over,
  };
}

const progression: ProgressionDto = {
  exerciseId: 'bench',
  repBucket: '6-10',
  state: progressionState(),
  override: null,
  suggestion: suggestion(),
};

function setup(
  opts: {
    context?: GymUserContext;
    dates?: string[];
    exercises?: ReturnType<typeof exerciseRow>[];
  } = {},
) {
  const older = sessionDoc({ localDate: '2026-09-20', startedAt: '2026-09-20T10:00:00.000Z' });
  const newer = sessionDoc({ localDate: '2026-09-22', startedAt: '2026-09-22T10:00:00.000Z' });
  const exerciseRepo = {
    findVisible: vi
      .fn()
      .mockResolvedValue(
        opts.exercises ?? [
          exerciseRow('bench', { updatedAt: new Date('2026-09-01T00:00:00.000Z') }),
          exerciseRow('squat', { updatedAt: new Date('2026-09-20T00:00:00.000Z') }),
        ],
      ),
  } as unknown as IExerciseRepository;
  const progressionRepo = {
    findForUser: vi.fn().mockResolvedValue([]),
  } as unknown as IExerciseProgressionRepository;
  const sessionRepo = {
    findCompletedDates: vi.fn().mockResolvedValue(opts.dates ?? ['2026-09-20', '2026-09-22']),
    findCompleted: vi.fn().mockResolvedValue([sessionRow(older), sessionRow(newer)]),
  } as unknown as IWorkoutSessionRepository;
  const pauseRepo = {
    listForUser: vi.fn().mockResolvedValue([]),
  } as unknown as ITrainingPauseRepository;
  const weightRepo = {
    findLatest: vi.fn().mockResolvedValue({ weightKg: 81.4 }),
  };
  const loader = { load: vi.fn().mockResolvedValue(opts.context ?? ctx()) };
  const prog = { toDtos: vi.fn().mockReturnValue([progression]) };
  const ensure = vi.fn().mockResolvedValue(undefined);
  const service = new GymBootstrapService(
    exerciseRepo,
    progressionRepo,
    sessionRepo,
    pauseRepo,
    weightRepo,
    loader,
    prog,
    ensure,
  );
  return { service, sessionRepo, prog, ensure, older, newer };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(toSessionSummary).mockImplementation(
    (d) => ({ id: d.id, localDate: d.localDate }) as SessionSummaryDto,
  );
  vi.mocked(summarizeWeeks).mockReturnValue({
    weeks: Array.from({ length: 14 }, (_, i) => ({
      weekStart: `w${i}`,
      goal: 3,
      sessions: 3,
      status: 'met' as const,
      flexTokens: 0,
    })),
    streak: { current: 4, best: 6, flexTokens: 1, thisWeekSessions: 1, thisWeekGoal: 3 },
  });
  vi.mocked(buildNextWorkout).mockReturnValue({ dayId: 'day-b' } as NextWorkoutDto);
  vi.mocked(shouldOfferDeload).mockReturnValue({ offer: false, reason: null });
});

describe('GymBootstrapService.get', () => {
  it('assembles the offline read model for the device-local day', async () => {
    const { service, sessionRepo, prog, ensure, older, newer } = setup();

    const b = await service.get(USER, { today: TODAY });

    expect(ensure).toHaveBeenCalled();
    expect(b.profile?.unit).toBe('KG');
    expect(b.activeRoutine?.id).toBe('r1');
    // Next workout = the rotation pointer's day, with prescriptions for today.
    expect(buildNextWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ dayId: 'day-b', today: TODAY, isDeload: false }),
    );
    const progressions = vi.mocked(buildNextWorkout).mock.calls[0]?.[0].progressions;
    expect([...(progressions?.keys() ?? [])]).toEqual(['bench|6-10']);
    expect(b.nextWorkout?.dayId).toBe('day-b');
    expect(prog.toDtos).toHaveBeenCalledWith(expect.anything(), [], expect.any(Map), TODAY);
    expect(b.progressions).toEqual([progression]);
    // Last 12 weeks of completed sessions, newest first.
    expect(sessionRepo.findCompleted).toHaveBeenCalledWith(USER, { fromLocalDate: '2026-07-02' });
    expect(b.recentSessions.map((s) => s.id)).toEqual([newer.id, older.id]);
    // Every week since setup is shipped (the offline fold re-derives the streak from them).
    expect(b.weeks).toHaveLength(14);
    expect(b.streak.current).toBe(4);
    expect(b.library.map((e) => e.id)).toEqual(['bench', 'squat']);
    expect(b.libraryCursor).toBe('2026-09-20T00:00:00.000Z');
    expect(b.bodyweightKg).toBe(81.4);
    expect(b.engineVersion).toBe(1);
    expect(Date.parse(b.serverTime)).not.toBeNaN();
  });

  it('returns only library rows changed since the cursor (and keeps the cursor when none)', async () => {
    const { service } = setup();

    const delta = await service.get(USER, {
      today: TODAY,
      librarySince: '2026-09-10T00:00:00.000Z',
    });
    expect(delta.library.map((e) => e.id)).toEqual(['squat']);
    expect(delta.libraryCursor).toBe('2026-09-20T00:00:00.000Z');

    const none = await service.get(USER, {
      today: TODAY,
      librarySince: '2026-09-23T00:00:00.000Z',
    });
    expect(none.library).toEqual([]);
    expect(none.libraryCursor).toBe('2026-09-23T00:00:00.000Z');
  });

  it('before setup: no profile, no next workout, empty weeks, no offers', async () => {
    const { service } = setup({ context: ctx({ profileRow: null, activeRoutine: null }) });

    const b = await service.get(USER, { today: TODAY });

    expect(b.profile).toBeNull();
    expect(b.nextWorkout).toBeNull();
    expect(b.weeks).toEqual([]);
    expect(b.streak.current).toBe(0);
    expect(b.offers).toEqual([]);
    expect(summarizeWeeks).not.toHaveBeenCalled();
  });

  it('offers a comeback after more than 8 days away, keyed by the last session', async () => {
    const { service } = setup({ dates: ['2026-09-10'] });

    const b = await service.get(USER, { today: TODAY });

    expect(b.offers).toEqual([
      expect.objectContaining({ kind: 'comeback', key: 'comeback:2026-09-10' }),
    ]);
  });

  it('offers the monthly recap in the first days of a month and honours dismissals', async () => {
    const early = '2026-10-03';
    const { service } = setup({ dates: ['2026-09-28', '2026-10-01'] });
    const b = await service.get(USER, { today: early });
    expect(b.offers.map((o) => o.key)).toEqual(['recap:2026-09']);

    const dismissed = setup({
      dates: ['2026-09-28', '2026-10-01'],
      context: ctx({ offerState: { dismissed: { 'recap:2026-09': '2026-10-02T00:00:00Z' } } }),
    });
    const b2 = await dismissed.service.get(USER, { today: early });
    expect(b2.offers).toEqual([]);
  });

  it('offers a deload when the engine says so, unless one is already running', async () => {
    vi.mocked(shouldOfferDeload).mockReturnValue({ offer: true, reason: 'reactive' });
    const { service } = setup();
    const b = await service.get(USER, { today: TODAY });
    expect(b.offers).toEqual([
      expect.objectContaining({
        kind: 'deload',
        key: 'deload:2026-09-21',
        data: { reason: 'reactive' },
      }),
    ]);

    const running = setup({
      context: ctx({ offerState: { deload: { startDate: '2026-09-22', endDate: '2026-09-28' } } }),
    });
    const b2 = await running.service.get(USER, { today: TODAY });
    expect(b2.offers).toEqual([]);
    expect(buildNextWorkout).toHaveBeenLastCalledWith(expect.objectContaining({ isDeload: true }));
  });

  it('falls back to the first day when the pointer is missing', async () => {
    const { service } = setup({
      context: ctx({ activeRoutine: toRoutineDto(routineRow({ nextDayId: null })) }),
    });
    await service.get(USER, { today: TODAY });
    expect(buildNextWorkout).toHaveBeenCalledWith(expect.objectContaining({ dayId: 'day-a' }));
  });
});

describe('previousMonth', () => {
  it('wraps the year', () => {
    expect(previousMonth('2026-01-05')).toBe('2025-12');
    expect(previousMonth('2026-10-05')).toBe('2026-09');
  });
});
