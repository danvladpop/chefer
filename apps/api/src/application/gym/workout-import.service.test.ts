import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise, IExerciseRepository, IRoutineRepository } from '@chefer/database';
import { EXERCISE_CATALOG, type ExerciseDto, type WorkoutImportCommitInput } from '@chefer/types';
import { collectPrs, toSessionSummary } from '@chefer/utils';
import { exerciseRow, makeMemorySessionRepo, profileRow } from './__test__/fixtures.js';
import type { ExerciseLibraryService } from './exercise-library.service.js';
import {
  customExerciseFor,
  sessionIdFor,
  uuidV5,
  WorkoutImportService,
} from './workout-import.service.js';
import { WorkoutSessionService } from './workout-session.service.js';

// G2: a Strong / Hevy file in, ordinary COMPLETED sessions out — through the
// real WorkoutSessionService over the in-memory repository (same write
// semantics as Prisma), so idempotency is tested end to end.

vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: () => false }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@sentry/node', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

const USER = 'u1';
const fixture = (name: string) =>
  readFileSync(
    new URL(
      `../../../../../packages/utils/src/gym/__fixtures__/workout-import/${name}`,
      import.meta.url,
    ),
    'utf8',
  );

function setup() {
  const library: Exercise[] = EXERCISE_CATALOG.map((e) =>
    exerciseRow(e.id, {
      name: e.name,
      aliases: e.aliases,
      equipment: e.equipment,
      primaryMuscles: e.primaryMuscles,
      repMin: e.repMin,
      repMax: e.repMax,
    }),
  );
  const exerciseRepo = {
    findVisible: vi.fn(() => Promise.resolve([...library])),
    findVisibleByIds: vi.fn((_u: string, ids: string[]) =>
      Promise.resolve(library.filter((e) => ids.includes(e.id))),
    ),
  } as unknown as IExerciseRepository;
  const createCustom = vi.fn(
    (_u: string, input: Parameters<ExerciseLibraryService['createCustom']>[1]) => {
      const row = exerciseRow(`custom-${library.length}`, {
        ownerId: USER,
        name: input.name,
        equipment: input.equipment,
        primaryMuscles: input.primaryMuscles,
        repMin: input.repMin,
        repMax: input.repMax,
        restSec: input.restSec,
        trackingType: input.trackingType ?? 'WEIGHT_REPS',
      });
      library.push(row);
      return Promise.resolve(row as unknown as ExerciseDto);
    },
  );
  const memory = makeMemorySessionRepo();
  const progression = { recompute: vi.fn().mockResolvedValue(undefined) };
  const sessions = new WorkoutSessionService(
    memory.repo,
    { findByIdForUser: vi.fn() } as unknown as IRoutineRepository,
    exerciseRepo,
    progression,
    { findByUserId: vi.fn().mockResolvedValue(profileRow()), update: vi.fn() },
  );
  const importDocs = vi.spyOn(sessions, 'importDocs');
  const service = new WorkoutImportService(exerciseRepo, memory.repo, sessions, { createCustom });
  return { service, memory, progression, createCustom, importDocs };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

const hevyCommit = (over: Partial<WorkoutImportCommitInput> = {}): WorkoutImportCommitInput => ({
  csv: fixture('hevy-kg.csv'),
  timeZone: 'Europe/Bucharest',
  mappings: [
    {
      name: 'Bench Press (Barbell)',
      action: { type: 'existing', exerciseId: 'barbell-bench-press' },
    },
    {
      name: 'Triceps Rope Pushdown',
      action: { type: 'existing', exerciseId: 'rope-triceps-pushdown' },
    },
    { name: 'Lateral Raise (Dumbbell)', action: { type: 'skip' } },
    { name: 'Pull Up', action: { type: 'existing', exerciseId: 'pull-up' } },
    { name: 'Running', action: { type: 'existing', exerciseId: 'running' } },
    { name: 'Zercher Carry (Barbell)', action: { type: 'create', primaryMuscle: 'quads' } },
  ],
  ...over,
});

describe('uuidV5', () => {
  it('matches the RFC 4122 example', () => {
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('gives each user their own ids for the same workout', () => {
    const w = { key: 'HEVY|2025-09-22T14:05|Push' };
    expect(sessionIdFor('u1', w)).toBe(sessionIdFor('u1', w));
    expect(sessionIdFor('u1', w)).not.toBe(sessionIdFor('u2', w));
  });
});

describe('preview', () => {
  it('summarises the file and how every exercise name maps', async () => {
    const preview = await ctx.service.preview(USER, { csv: fixture('hevy-kg.csv') });
    if (preview.status !== 'ready') throw new Error(preview.status);
    expect(preview).toMatchObject({
      source: 'HEVY',
      weightUnit: 'KG',
      workouts: 2,
      sets: 9,
      firstDate: '2025-09-22',
      lastDate: '2025-12-05',
      alreadyImported: 0,
    });
    const status = Object.fromEntries(
      preview.exercises.map((e) => [e.name, [e.status, e.exerciseId]]),
    );
    expect(status).toMatchObject({
      'Bench Press (Barbell)': ['matched', 'barbell-bench-press'],
      'Triceps Rope Pushdown': ['matched', 'rope-triceps-pushdown'],
      'Lateral Raise (Dumbbell)': ['matched', 'dumbbell-lateral-raise'],
      'Pull Up': ['matched', 'pull-up'],
      Running: ['matched', 'running'],
      'Zercher Carry (Barbell)': ['unmatched', null],
    });
    expect(ctx.memory.rows.size).toBe(0);
  });

  it('asks for the unit of an older Strong file, then previews it', async () => {
    expect(await ctx.service.preview(USER, { csv: fixture('strong-comma.csv') })).toEqual({
      status: 'needs_unit',
      source: 'STRONG',
    });
    const withUnit = await ctx.service.preview(USER, {
      csv: fixture('strong-comma.csv'),
      weightUnit: 'LB',
    });
    expect(withUnit).toMatchObject({ status: 'ready', weightUnit: 'LB', workouts: 2 });
  });

  it('says when a file is not a workout export', async () => {
    expect(await ctx.service.preview(USER, { csv: 'Date,Food\n2026-01-01,Apple' })).toEqual({
      status: 'invalid',
      reason: 'unknown_format',
    });
  });
});

describe('commit', () => {
  it('writes COMPLETED, routine-less sessions marked as imported, placed in the user’s time zone', async () => {
    const result = await ctx.service.commit(USER, hevyCommit());
    expect(result).toMatchObject({
      source: 'HEVY',
      imported: 2,
      alreadyImported: 0,
      skippedWorkouts: 0,
      createdExercises: 1,
      firstDate: '2025-09-22',
      lastDate: '2025-12-05',
    });
    const written = [...ctx.memory.rows.values()].map((r) => r.doc);
    expect(written.every((d) => d.status === 'COMPLETED' && d.routineId === null)).toBe(true);
    expect(written.every((d) => d.importSource === 'HEVY')).toBe(true);
    const push = written.find((d) => d.name === 'Push ☀️')!;
    // 14:05 in Bucharest (EEST, UTC+3) on 22 Sep.
    expect(push.startedAt.toISOString()).toBe('2025-09-22T11:05:00.000Z');
    expect(push.finishedAt?.toISOString()).toBe('2025-09-22T12:20:00.000Z');
    expect(push.localDate).toBe('2025-09-22');
    expect(push.notes).toBe('Back, chest, "fun"');
  });

  it('keeps dates, sets, reps, kg weights, warm-ups and notes; RPE becomes reps in reserve; skips stay out', async () => {
    await ctx.service.commit(USER, hevyCommit());
    const push = [...ctx.memory.rows.values()].map((r) => r.doc).find((d) => d.name === 'Push ☀️')!;
    expect(push.exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'rope-triceps-pushdown',
    ]);
    const bench = push.exercises[0]!;
    expect(bench.sets.map((s) => [s.isWarmup, s.weightKg, s.reps, s.completedAt !== null])).toEqual(
      [
        [true, 40, 10, true],
        [false, 80, 6, true],
        [false, 80, 5, true],
      ],
    );
    expect(bench.notes).toBe('Pause at chest\nkeep elbows in');
    expect(bench.lastSetRir).toBe(0); // last working set at RPE 10
    const long = [...ctx.memory.rows.values()]
      .map((r) => r.doc)
      .find((d) => d.name === 'Weekend Long')!;
    const run = long.exercises.find((e) => e.exerciseId === 'running')!;
    expect(run.sets[0]).toMatchObject({ weightKg: 0, reps: 0, distanceM: 5000, durationSec: 1680 });
  });

  it('creates a custom exercise for an unmatched name, inferred from the file', async () => {
    await ctx.service.commit(USER, hevyCommit());
    expect(ctx.createCustom).toHaveBeenCalledTimes(1);
    expect(ctx.createCustom.mock.calls[0]?.[1]).toMatchObject({
      name: 'Zercher Carry (Barbell)',
      equipment: 'BARBELL',
      primaryMuscles: ['quads'],
      trackingType: 'WEIGHT_REPS',
    });
  });

  it('feeds progression once, for every imported exercise', async () => {
    await ctx.service.commit(USER, hevyCommit());
    expect(ctx.progression.recompute).toHaveBeenCalledTimes(1);
    expect(ctx.progression.recompute.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        'barbell-bench-press',
        'rope-triceps-pushdown',
        'pull-up',
        'running',
      ]),
    );
  });

  it('imported history yields PRs like logged history does', async () => {
    await ctx.service.commit(USER, hevyCommit());
    const docs = ctx.importDocs.mock.calls[0]?.[1] ?? [];
    const prs = collectPrs(
      docs.map((d) => toSessionSummary(d)),
      'barbell-bench-press',
    );
    expect(prs.map((p) => [p.kind, p.weightKg, p.reps, p.localDate])).toContainEqual([
      'e1rm',
      80,
      6,
      '2025-09-22',
    ]);
  });

  it('is idempotent: the same file again writes nothing and creates nothing', async () => {
    await ctx.service.commit(USER, hevyCommit());
    const before = [...ctx.memory.rows.keys()];
    const again = await ctx.service.commit(USER, hevyCommit());
    expect(again).toMatchObject({ imported: 0, alreadyImported: 2, createdExercises: 0 });
    expect([...ctx.memory.rows.keys()]).toEqual(before);
    expect(ctx.createCustom).toHaveBeenCalledTimes(1);
    const preview = await ctx.service.preview(USER, { csv: fixture('hevy-kg.csv') });
    expect(preview).toMatchObject({ status: 'ready', alreadyImported: 2 });
  });

  it('never overwrites a session the user edited after importing it', async () => {
    await ctx.service.commit(USER, hevyCommit());
    const stored = [...ctx.memory.rows.values()].find((r) => r.doc.name === 'Push ☀️')!;
    stored.doc = {
      ...stored.doc,
      name: 'Push (edited)',
      clientUpdatedAt: new Date('2026-10-01T00:00:00Z'),
    };
    await ctx.service.commit(USER, hevyCommit());
    expect([...ctx.memory.rows.values()].some((r) => r.doc.name === 'Push (edited)')).toBe(true);
  });

  it('a workout whose every exercise was skipped is left out', async () => {
    const result = await ctx.service.commit(
      USER,
      hevyCommit({
        mappings: [
          {
            name: 'Bench Press (Barbell)',
            action: { type: 'existing', exerciseId: 'barbell-bench-press' },
          },
        ],
      }),
    );
    expect(result).toMatchObject({ imported: 1, skippedWorkouts: 1 });
  });

  it('rejects a mapping to an exercise the user cannot see', async () => {
    await expect(
      ctx.service.commit(
        USER,
        hevyCommit({
          mappings: [
            { name: 'Pull Up', action: { type: 'existing', exerciseId: 'someone-elses' } },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('pound files are stored in kilograms', async () => {
    await ctx.service.commit(USER, {
      csv: fixture('hevy-lbs.csv'),
      timeZone: 'America/New_York',
      mappings: [
        { name: 'Squat (Barbell)', action: { type: 'existing', exerciseId: 'back-squat' } },
      ],
    });
    const [lower] = [...ctx.memory.rows.values()].map((r) => r.doc);
    expect(lower?.exercises[0]?.sets.map((s) => s.weightKg)).toEqual([61.23, 102.06]);
    // 1:01 PM in New York (EDT, UTC−4) on 11 Jun.
    expect(lower?.startedAt.toISOString()).toBe('2026-06-11T17:01:00.000Z');
  });
});

describe('customExerciseFor', () => {
  it('infers tracking from what was logged', () => {
    expect(customExerciseFor('Hand Gripper', 'strength', 'forearms')).toMatchObject({
      equipment: 'BARBELL',
      loadType: 'WEIGHTED',
      trackingType: 'WEIGHT_REPS',
    });
    expect(customExerciseFor('L-Sit', 'timed', 'abs')).toMatchObject({
      equipment: 'BODYWEIGHT',
      trackingType: 'DURATION',
      isTimed: true,
    });
    expect(customExerciseFor('Muscle Up (Assisted)', 'bodyweight', 'lats')).toMatchObject({
      equipment: 'ASSISTED',
      loadType: 'ASSISTED',
      trackingType: 'BODYWEIGHT_REPS',
    });
    expect(customExerciseFor('Hiking', 'cardio', 'quads')).toMatchObject({
      equipment: 'OUTDOOR',
      trackingType: 'DURATION_DISTANCE',
    });
  });
});
