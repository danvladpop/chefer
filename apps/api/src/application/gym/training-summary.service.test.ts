import { describe, expect, it, vi } from 'vitest';
import type { GymBootstrap, PrDto, RecommendResultDto, SessionSummaryDto } from '@chefer/types';
import { exerciseRow, profileRow, routineRow, suggestion } from './__test__/fixtures.js';
import { toExerciseDto, toProfileDto, toRoutineDto } from './mappers.js';
import {
  CHAT_TRAINING_RECENT_SESSIONS,
  formatTrainingSummary,
  TrainingSummaryService,
} from './training-summary.service.js';

// Ask Chef helps with training (2026-10-10): `getMyTraining` is a short,
// read-only text from the user's real gym data. Every dependency is faked —
// no database (CI's unit job has none).

// The default singletons pull lib/flags (env validation) in through client-level.
vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: () => false }));

const TODAY = '2026-10-10';

function session(over: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
  return {
    id: 's1',
    name: 'Day A',
    routineDayId: 'day-a',
    status: 'COMPLETED',
    localDate: '2026-10-08',
    startedAt: '2026-10-08T17:00:00.000Z',
    finishedAt: '2026-10-08T17:52:00.000Z',
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 2,
        sets: [
          { weightKg: 20, reps: 10, isWarmup: true, completed: true },
          { weightKg: 60, reps: 8, isWarmup: false, completed: true },
          { weightKg: 60, reps: 8, isWarmup: false, completed: true },
          { weightKg: 60, reps: 7, isWarmup: false, completed: false },
        ],
      },
    ],
    ...over,
  };
}

/** A cycling class logged from the activity sheet: one DURATION entry with kcal. */
const cyclingClass = session({
  id: 's2',
  name: 'Cycling class',
  routineDayId: null,
  localDate: '2026-10-06',
  startedAt: '2026-10-06T18:00:00.000Z',
  finishedAt: '2026-10-06T18:45:00.000Z',
  exercises: [
    {
      exerciseId: 'spin-class',
      skipped: false,
      lastSetRir: null,
      sets: [
        {
          weightKg: 0,
          reps: 0,
          isWarmup: false,
          completed: true,
          durationSec: 45 * 60,
          caloriesKcal: 400,
        },
      ],
    },
  ],
});

function bootstrap(over: Partial<GymBootstrap> = {}): GymBootstrap {
  const routine = toRoutineDto(routineRow());
  return {
    profile: toProfileDto(profileRow()),
    activeRoutine: routine,
    nextWorkout: {
      routineId: routine.id,
      dayId: 'day-a',
      dayName: 'Day A',
      isDeload: false,
      estimatedMin: 45,
      exercises: [
        {
          routineExerciseId: 're-bench',
          exerciseId: 'bench',
          position: 0,
          sets: 3,
          repMin: 6,
          repMax: 10,
          targetRir: 2,
          restSec: 180,
          supersetGroup: null,
          notes: null,
          repBucket: '6-10',
          suggestion: suggestion({ weightKg: 62.5, sets: 3 }),
          warmups: [],
          lastTime: null,
        },
      ],
    },
    library: [
      toExerciseDto(exerciseRow('bench', { name: 'Bench Press' })),
      toExerciseDto(exerciseRow('squat', { name: 'Back Squat' })),
    ],
    libraryCursor: '2026-10-10T00:00:00.000Z',
    progressions: [],
    recentSessions: [session(), cyclingClass],
    weeks: [],
    streak: { current: 4, best: 6, flexTokens: 1, thisWeekSessions: 2, thisWeekGoal: 3 },
    offers: [],
    activePause: null,
    upcomingPause: null,
    carryOver: [],
    bodyweightKg: 80,
    serverTime: '2026-10-10T08:00:00.000Z',
    engineVersion: 1,
    ...over,
  };
}

const benchPr: PrDto = {
  exerciseId: 'bench',
  kind: 'weight',
  weightKg: 60,
  reps: 8,
  e1rmKg: 75,
  localDate: '2026-10-08',
  sessionId: 's1',
  isFirst: false,
};

const summary = (boot: GymBootstrap, over: { prs?: PrDto[]; unit?: 'KG' | 'LB' } = {}) =>
  formatTrainingSummary({
    boot,
    prs: over.prs ?? [benchPr],
    recommendation: null,
    today: TODAY,
    unit: over.unit ?? 'KG',
  });

describe('formatTrainingSummary', () => {
  it('set up: week vs goal, streak, next workout, routine, sessions and PRs from the data', () => {
    const text = summary(bootstrap());
    expect(text).toContain('today is 2026-10-10');
    expect(text).toContain('weekly goal 3 session(s)');
    expect(text).toContain('This week: 2 of 3 session(s) done');
    expect(text).toContain('Streak: 4 weeks in a row meeting the goal (best 6 weeks)');
    expect(text).toContain('Next workout: Day A (~45 min):');
    expect(text).toContain('  - Bench Press: 3 × 6–10 at 62.5 kg');
    expect(text).toContain('Active routine "Upper/Lower" (2 day(s), next up: Day A):');
    expect(text).toContain('  - Day A: Bench Press 3×6–10');
    expect(text).toContain('  - Day B: Back Squat 3×8–12');
    // Two completed working sets (the warm-up and the unticked set don't count) and a PR.
    expect(text).toContain('Thu 8 Oct Day A — 52 min, 2 working set(s), PR');
    // An activity log: its own minutes and the user's kcal, never "0 sets".
    expect(text).toContain(
      'Tue 6 Oct Cycling class — 45 min, logged activity, ~400 kcal (user-logged)',
    );
    expect(text).toContain('Thu 8 Oct Bench Press: 60 kg × 8 (heaviest weight)');
    expect(text).toContain('Train → Routines → Edit');
    expect(text).not.toContain('NOT set up');
    expect(text).not.toContain('PAUSED');
  });

  it('lb users get every load in lb', () => {
    const boot = bootstrap({ profile: toProfileDto(profileRow({ unit: 'LB' })) });
    const text = summary(boot, { unit: 'LB' });
    expect(text).toContain('weights in lb');
    // 62.5 kg ≈ 137.8 lb; 60 kg ≈ 132.3 lb.
    expect(text).toContain('Bench Press: 3 × 6–10 at 137.8 lb');
    expect(text).toContain('Bench Press: 132.3 lb × 8');
    expect(text).not.toMatch(/\d kg/);
  });

  it('not set up: says so and points to Train, still lists logged activities', () => {
    const text = summary(
      bootstrap({
        profile: null,
        activeRoutine: null,
        nextWorkout: null,
        recentSessions: [cyclingClass],
      }),
      { prs: [] },
    );
    expect(text).toContain('Training is NOT set up yet');
    expect(text).toContain('Train tab');
    expect(text).not.toContain('Next workout');
    expect(text).not.toContain('This week:');
    expect(text).toContain('Cycling class — 45 min, logged activity, ~400 kcal (user-logged)');
  });

  it('an active pause and a planned one are both stated', () => {
    const text = summary(
      bootstrap({
        activePause: {
          id: 'p1',
          startDate: '2026-10-08',
          endDate: '2026-10-15',
          reason: 'vacation',
        },
        upcomingPause: { id: 'p2', startDate: '2026-11-02', endDate: '2026-11-04', reason: null },
      }),
    );
    expect(text).toContain(
      'Training is PAUSED (vacation) from Thu 8 Oct to Thu 15 Oct — paused weeks never break the streak.',
    );
    expect(text).toContain('A pause is planned from Mon 2 Nov to Wed 4 Nov.');
  });

  it('caps the session list and handles no sessions at all', () => {
    const many = Array.from({ length: 9 }, (_, i) => session({ id: `s${i}`, name: `S${i}` }));
    const text = summary(bootstrap({ recentSessions: many }), { prs: [] });
    expect(text.match(/ S\d — /g)).toHaveLength(CHAT_TRAINING_RECENT_SESSIONS);
    expect(summary(bootstrap({ recentSessions: [] }), { prs: [] })).toContain(
      'No finished sessions in the last 12 weeks.',
    );
  });

  it('a start suggestion without a load asks for a starting weight instead of "0 kg"', () => {
    const next = bootstrap().nextWorkout;
    const first = next?.exercises[0];
    if (!next || !first) throw new Error('fixture has a next workout');
    const boot = bootstrap({
      nextWorkout: {
        ...next,
        exercises: [{ ...first, suggestion: suggestion({ kind: 'start', weightKg: 0 }) }],
      },
    });
    expect(summary(boot)).toContain('Bench Press: 3 × 6–10 (load: pick a starting weight)');
  });

  it('marks the recommendation that is already their program', () => {
    const text = formatTrainingSummary({
      boot: bootstrap(),
      prs: [],
      recommendation: { key: 'fb2-beginner', name: 'Full Body 2x', reason: 'Simple and effective' },
      today: TODAY,
      unit: 'KG',
    });
    expect(text).toContain(
      'Program the app recommends for their setup (rule-based, the same as Train setup): Full Body 2x — Simple and effective (this is already their program).',
    );
  });
});

describe('TrainingSummaryService.forChat', () => {
  const recommend = (key = 'ppl'): RecommendResultDto => ({
    recommendedKey: key,
    reason: 'Fits 3 days',
    preview: { key, name: 'Push Pull Legs', days: [] },
    alternatives: [],
    volume: [],
    hints: [],
  });

  function make(boot: GymBootstrap, prs: PrDto[] = [benchPr]) {
    const deps = {
      bootstrap: { get: vi.fn().mockResolvedValue(boot) },
      stats: { prs: vi.fn().mockResolvedValue(prs) },
      profiles: { recommend: vi.fn().mockReturnValue(recommend()) },
    };
    return {
      deps,
      service: new TrainingSummaryService(deps.bootstrap, deps.stats, deps.profiles),
    };
  }

  it('reads the bootstrap for the user’s local today and asks for the profile’s recommendation', async () => {
    const { deps, service } = make(bootstrap());
    const text = await service.forChat('u1', { today: TODAY });
    expect(deps.bootstrap.get).toHaveBeenCalledWith('u1', { today: TODAY }, 5);
    expect(deps.profiles.recommend).toHaveBeenCalledWith({
      days: 3,
      experience: 'BEGINNER',
      equipmentAccess: 'FULL_GYM',
    });
    expect(text).toContain('Push Pull Legs — Fits 3 days.');
    expect(text).toContain('Bench Press: 60 kg × 8');
  });

  it('drops first-ever "baseline" sets from the PR list', async () => {
    const { service } = make(bootstrap(), [{ ...benchPr, isFirst: true }]);
    expect(await service.forChat('u1', { today: TODAY })).not.toContain('Recent PRs');
  });

  it('not set up: no recommendation, units fall back to the nutrition preference', async () => {
    const heavy = session({
      exercises: [
        {
          exerciseId: 'bench',
          skipped: false,
          lastSetRir: null,
          sets: [{ weightKg: 100, reps: 1, isWarmup: false, completed: true }],
        },
      ],
    });
    const { deps, service } = make(
      bootstrap({ profile: null, activeRoutine: null, nextWorkout: null, recentSessions: [heavy] }),
      [{ ...benchPr, weightKg: 100, reps: 1 }],
    );
    const text = await service.forChat('u1', { today: TODAY, preferredUnits: 'IMPERIAL' });
    expect(deps.profiles.recommend).not.toHaveBeenCalled();
    expect(text).toContain('NOT set up');
    expect(text).toContain('weights in lb');
    expect(text).toContain('220.5 lb × 1');
  });

  it('a failing recommendation never breaks the summary', async () => {
    const { deps, service } = make(bootstrap());
    deps.profiles.recommend.mockImplementation(() => {
      throw new Error('no template');
    });
    const text = await service.forChat('u1', { today: TODAY });
    expect(text).toContain('Next workout');
    expect(text).not.toContain('recommends');
  });

  it('no sessions: the PR timeline is not read at all', async () => {
    const { deps, service } = make(bootstrap({ recentSessions: [] }));
    await service.forChat('u1', { today: TODAY });
    expect(deps.stats.prs).not.toHaveBeenCalled();
  });
});
