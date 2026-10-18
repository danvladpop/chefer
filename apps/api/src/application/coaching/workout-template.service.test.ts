import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActiveLinkWithClient,
  Exercise,
  ExerciseProgression,
  RoutineDayWithExercises,
  RoutineDayWriteData,
  RoutineWithDays,
  TemplateAssignmentRow,
  WorkoutTemplateExercise,
  WorkoutTemplateWithExercises,
} from '@chefer/database';
import { TEMPLATE_COPY, type TemplateDoc } from '@chefer/types';
import type { ConflictCause } from '../../lib/conflict.js';
import { WorkoutTemplateService } from './workout-template.service.js';

// Trainer mode templates (trainer-mode.md §6.6, §14 "template assign and update
// merge (keeps loads, flags edited days)"). Repositories are fakes: no DB.

// workout-template.service.ts → gym services → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const TRAINER = 'ctrainer0000000000000001';
const OTHER_TRAINER = 'ctrainer0000000000000002';
const C1 = 'cclient00000000000000001';
const C2 = 'cclient00000000000000002';
const C3 = 'cclient00000000000000003';
const STRANGER = 'cstranger000000000000001';
const NOW = new Date('2026-10-18T10:00:00Z');

const exercise = (id: string, over: Partial<Exercise> = {}): Exercise =>
  ({
    id,
    name: id,
    ownerId: null,
    category: 'COMPOUND',
    trackingType: 'WEIGHT_REPS',
    loadType: 'WEIGHTED',
    isTimed: false,
    primaryMuscles: [],
    secondaryMuscles: [],
    ...over,
  }) as unknown as Exercise;

const EXERCISES = [
  exercise('squat'),
  exercise('rdl'),
  exercise('plank', { trackingType: 'DURATION', category: 'ISOLATION' }),
  exercise('custom-mine', { ownerId: TRAINER }),
];

const tRow = (id: string, exerciseId: string, over: Partial<WorkoutTemplateExercise> = {}) => ({
  id,
  templateId: 't1',
  exerciseId,
  position: 0,
  sets: 3,
  repMin: 6,
  repMax: 8,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  defaultLoadKg: null,
  trainerNote: null,
  ...over,
});

function template(over: Partial<WorkoutTemplateWithExercises> = {}): WorkoutTemplateWithExercises {
  return {
    id: 't1',
    trainerId: TRAINER,
    name: 'Lower body A',
    workoutType: 'LOWER_BODY',
    version: 2,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    exercises: [
      tRow('te1', 'squat', { defaultLoadKg: 60, trainerNote: 'Brace' }),
      tRow('te2', 'rdl', { position: 1, defaultLoadKg: 50 }),
    ],
    ...over,
  };
}

const rRow = (id: string, exerciseId: string, over: object = {}) => ({
  id,
  dayId: 'd1',
  exerciseId,
  position: 0,
  sets: 3,
  repMin: 6,
  repMax: 8,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  notes: null,
  trainerNote: null,
  lastEditedById: null,
  lastEditedAt: null,
  ...over,
});

const day = (id: string, over: Partial<RoutineDayWithExercises> = {}) =>
  ({
    id,
    routineId: 'r1',
    position: 0,
    name: `Day ${id}`,
    plannedWeekday: null,
    workoutType: null,
    templateId: null,
    templateVersion: null,
    templateAssignedAt: null,
    templateName: null,
    editedSinceTemplate: false,
    exercises: [],
    ...over,
  }) as RoutineDayWithExercises;

function routine(userId: string, days: RoutineDayWithExercises[], version = 3): RoutineWithDays {
  return {
    id: `r-${userId}`,
    userId,
    name: 'Plan',
    version,
    isActive: true,
    days,
  } as unknown as RoutineWithDays;
}

const link = (clientId: string, firstName: string) =>
  ({
    trainerId: TRAINER,
    clientId,
    client: { id: clientId, firstName, lastName: null, name: null },
  }) as unknown as ActiveLinkWithClient;

/** Applies a replaceDocument write to a stored routine (ids kept, new ones minted). */
function applyWrite(stored: RoutineWithDays, days: RoutineDayWriteData[]): RoutineWithDays {
  let n = 0;
  return {
    ...stored,
    version: stored.version + 1,
    days: days.map((d, i) => {
      const id = d.id ?? `new-day-${(n += 1)}`;
      const before = stored.days.find((x) => x.id === d.id);
      return {
        ...(before ?? day(id)),
        id,
        position: i,
        name: d.name,
        plannedWeekday: d.plannedWeekday,
        workoutType: d.workoutType === undefined ? (before?.workoutType ?? null) : d.workoutType,
        ...(d.template && {
          templateId: d.template.templateId,
          templateVersion: d.template.templateVersion,
          templateName: d.template.templateName,
          templateAssignedAt: d.template.assignedAt,
          editedSinceTemplate: false,
        }),
        exercises: d.exercises.map((e, j) =>
          rRow(e.id ?? `new-row-${(n += 1)}`, e.exerciseId, { ...e, position: j }),
        ),
      };
    }),
  };
}

function setup(
  opts: {
    template?: WorkoutTemplateWithExercises | null;
    routines?: Record<string, RoutineWithDays | null>;
    links?: ActiveLinkWithClient[];
    assignments?: TemplateAssignmentRow[];
    progressions?: Record<string, Pick<ExerciseProgression, 'exerciseId' | 'repBucket'>[]>;
    liveCount?: number;
    /** Conflicts to answer per client before a write succeeds. */
    conflicts?: Record<string, number>;
  } = {},
) {
  const store = new Map<string, RoutineWithDays | null>(Object.entries(opts.routines ?? {}));
  const conflicts = new Map(Object.entries(opts.conflicts ?? {}));
  const tpl = opts.template === undefined ? template() : opts.template;
  const writes: { userId: string; days: RoutineDayWriteData[]; actor: unknown }[] = [];
  const deps = {
    templates: {
      listForTrainer: vi.fn(async (trainerId: string) =>
        tpl?.trainerId === trainerId ? [tpl] : [],
      ),
      find: vi.fn(async (trainerId: string, id: string) =>
        tpl?.id === id && tpl.trainerId === trainerId && tpl.deletedAt === null ? tpl : null,
      ),
      findNames: vi.fn(async () => []),
      countLive: vi.fn(async () => opts.liveCount ?? 0),
      create: vi.fn(async (trainerId: string, data) =>
        template({
          trainerId,
          name: data.name,
          workoutType: data.workoutType,
          version: 1,
          exercises: data.exercises.map((e: object, i: number) =>
            tRow(`n${i}`, '', { ...e, position: i }),
          ),
        }),
      ),
      replaceDocument: vi.fn(),
      softDelete: vi.fn(async () => true),
      purgeDeletedBefore: vi.fn(async () => 0),
      listAssignments: vi.fn(async () => opts.assignments ?? []),
    },
    links: {
      listActiveForTrainer: vi.fn(
        async () => opts.links ?? [link(C1, 'Maria'), link(C2, 'Ion'), link(C3, 'Dana')],
      ),
    },
    routines: {
      findActive: vi.fn(async (userId: string) => store.get(userId) ?? null),
      replaceDocument: vi.fn(
        async (
          userId: string,
          _id: string,
          doc: { name: string; days: RoutineDayWriteData[] },
          expectedVersion: number,
          actor: unknown,
        ) => {
          const current = store.get(userId);
          if (!current) return { status: 'not_found' as const };
          const left = conflicts.get(userId) ?? 0;
          if (left > 0 || current.version !== expectedVersion) {
            conflicts.set(userId, left - 1);
            // Someone else saved in between.
            const bumped = { ...current, version: current.version + 1 };
            store.set(userId, bumped);
            return { status: 'conflict' as const, current: bumped };
          }
          writes.push({ userId, days: doc.days, actor });
          const saved = applyWrite(current, doc.days);
          store.set(userId, saved);
          return { status: 'ok' as const, routine: saved };
        },
      ),
    },
    exercises: {
      findVisibleByIds: vi.fn(async (_u: string, ids: string[]) =>
        EXERCISES.filter((e) => ids.includes(e.id)),
      ),
    },
    progressions: {
      findForUser: vi.fn(
        async (userId: string) =>
          (opts.progressions?.[userId] ?? []) as unknown as ExerciseProgression[],
      ),
    },
    progression: {
      setOverride: vi.fn(
        async (_userId: string, _input: { exerciseId: string }, _opts: object) => ({}) as never,
      ),
    },
    notifier: { trainerSaved: vi.fn(async () => undefined) },
    now: () => NOW,
  };
  const service = new WorkoutTemplateService(deps);
  return { service, deps, writes, store };
}

const doc = (over: Partial<TemplateDoc> = {}): TemplateDoc => ({
  name: ' Lower body A ',
  workoutType: 'LOWER_BODY',
  exercises: [
    {
      exerciseId: 'squat',
      sets: 3,
      repMin: 6,
      repMax: 8,
      targetRir: 2,
      restSec: 120,
      supersetGroup: 'Z',
      defaultLoadKg: 60,
      trainerNote: '  Brace  ',
    },
    {
      exerciseId: 'rdl',
      sets: 3,
      repMin: 8,
      repMax: 10,
      targetRir: 2,
      restSec: 90,
      supersetGroup: 'Z',
      defaultLoadKg: null,
      trainerNote: '   ',
    },
  ],
  ...over,
});

const assignment = (
  userId: string,
  version: number,
  over: Partial<TemplateAssignmentRow> = {},
) => ({
  dayId: `d-${userId}`,
  dayName: 'Legs',
  routineId: `r-${userId}`,
  userId,
  templateId: 't1',
  templateVersion: version,
  templateAssignedAt: NOW,
  editedSinceTemplate: false,
  ...over,
});

describe('list', () => {
  it('counts assigned and outdated ACTIVE clients only, once per client', async () => {
    const { service, deps } = setup({
      links: [link(C1, 'Maria'), link(C2, 'Ion')],
      assignments: [assignment(C1, 1), assignment(C1, 1, { dayId: 'second' }), assignment(C2, 2)],
    });
    const [row] = await service.list(TRAINER);
    // The repository is asked about active clients only (a former client's copy never counts).
    expect(deps.templates.listAssignments).toHaveBeenCalledWith(['t1'], [C1, C2]);
    expect(row).toMatchObject({
      id: 't1',
      exerciseCount: 2,
      assignedCount: 2,
      outdatedCount: 1,
      updatedAt: NOW.toISOString(),
    });
    expect(row?.estimatedMin).toBeGreaterThan(0);
  });

  it('an empty template has no estimate', async () => {
    const { service } = setup({ template: template({ exercises: [] }) });
    const [row] = await service.list(TRAINER);
    expect(row).toMatchObject({ exerciseCount: 0, estimatedMin: null, assignedCount: 0 });
  });
});

describe('get', () => {
  it('another trainer’s, a deleted or a missing template is the one NOT_FOUND', async () => {
    for (const s of [
      setup({ template: template({ trainerId: OTHER_TRAINER }) }),
      setup({ template: template({ deletedAt: NOW }) }),
      setup({ template: null }),
    ]) {
      await expect(s.service.get(TRAINER, 't1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: TEMPLATE_COPY.server.notFound,
      });
    }
  });

  it('lists the active clients with a copy, outdated and edited-since flags, newest first', async () => {
    const { service } = setup({
      assignments: [
        assignment(C1, 1, { templateAssignedAt: new Date('2026-10-01T00:00:00Z') }),
        assignment(C2, 2, {
          editedSinceTemplate: true,
          templateAssignedAt: new Date('2026-10-10T00:00:00Z'),
        }),
      ],
    });
    const dto = await service.get(TRAINER, 't1');
    expect(dto.exerciseMeta.map((e) => e.id).sort()).toEqual(['rdl', 'squat']);
    expect(dto.assignments).toEqual([
      expect.objectContaining({
        clientId: C2,
        clientName: 'Ion',
        outdated: false,
        editedSince: true,
      }),
      expect.objectContaining({
        clientId: C1,
        clientName: 'Maria',
        outdated: true,
        templateVersion: 1,
      }),
    ]);
  });
});

describe('create / save / delete', () => {
  it('creates trimmed, with canonical superset letters and no empty cue', async () => {
    const { service, deps } = setup();
    await service.create(TRAINER, doc());
    const data = deps.templates.create.mock.calls[0]?.[1];
    expect(data.name).toBe('Lower body A');
    expect(data.exercises.map((e: { supersetGroup: string }) => e.supersetGroup)).toEqual([
      'A',
      'A',
    ]);
    expect(data.exercises.map((e: { trainerNote: string | null }) => e.trainerNote)).toEqual([
      'Brace',
      null,
    ]);
  });

  it('the 201st template is refused', async () => {
    const { service, deps } = setup({ liveCount: 200 });
    await expect(service.create(TRAINER, doc())).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: TEMPLATE_COPY.server.limit(200),
    });
    expect(deps.templates.create).not.toHaveBeenCalled();
  });

  it.each(['custom-mine', 'nope'])('a non-curated exercise (%s) is refused', async (id) => {
    const { service, deps } = setup();
    const bad = doc();
    bad.exercises[1] = { ...bad.exercises[1]!, exerciseId: id };
    await expect(service.create(TRAINER, bad)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: TEMPLATE_COPY.server.notCurated,
    });
    await expect(
      service.save(TRAINER, { templateId: 't1', template: bad, expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(deps.templates.create).not.toHaveBeenCalled();
    expect(deps.templates.replaceDocument).not.toHaveBeenCalled();
  });

  it('a stale save is CONFLICT carrying { kind: template, current }', async () => {
    const { service, deps } = setup();
    deps.templates.replaceDocument.mockResolvedValue({
      status: 'conflict',
      current: template({ version: 5 }),
    });
    const err = await service
      .save(TRAINER, { templateId: 't1', template: doc(), expectedVersion: 2 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('CONFLICT');
    const payload = ((err as TRPCError).cause as ConflictCause).payload;
    expect(payload.kind).toBe('template');
    expect(payload.current).toMatchObject({ id: 't1', version: 5 });
  });

  it('save / delete of a template that is not the trainer’s: NOT_FOUND', async () => {
    const { service, deps } = setup();
    deps.templates.replaceDocument.mockResolvedValue({ status: 'not_found' });
    deps.templates.softDelete.mockResolvedValue(false);
    await expect(
      service.save(TRAINER, { templateId: 't1', template: doc(), expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.delete(TRAINER, 't1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('delete is a soft delete', async () => {
    const { service, deps } = setup();
    await expect(service.delete(TRAINER, 't1')).resolves.toEqual({ ok: true });
    expect(deps.templates.softDelete).toHaveBeenCalledWith(TRAINER, 't1', NOW);
  });
});

describe('assign', () => {
  const routines = () => ({
    [C1]: routine(C1, [day('a1', { exercises: [rRow('x1', 'squat')] })]),
    [C2]: routine(C2, [
      day('b1', {
        name: 'Legs',
        plannedWeekday: 2,
        exercises: [rRow('y1', 'lunge'), rRow('y2', 'squat', { notes: 'mine' })],
      }),
    ]),
    [C3]: null,
  });

  it('ADD_DAY appends a day named after the template, with the weekday, type and stamp', async () => {
    const { service, writes, deps } = setup({ routines: routines() });
    const res = await service.assign(TRAINER, {
      templateId: 't1',
      targets: [{ clientId: C1, mode: 'ADD_DAY', weekday: 3 }],
    });
    expect(res).toMatchObject({ templateId: 't1', templateVersion: 2 });
    expect(res.results).toEqual([{ clientId: C1, ok: true, routineDayId: 'new-day-1' }]);
    const w = writes[0];
    expect(w?.actor).toMatchObject({ actorId: TRAINER, path: 'TRAINER' });
    expect(w?.days[0]).toMatchObject({ id: 'a1' });
    expect(w?.days[0]?.template).toBeUndefined();
    expect(w?.days[1]).toMatchObject({
      name: 'Lower body A',
      plannedWeekday: 3,
      workoutType: 'LOWER_BODY',
      template: {
        templateId: 't1',
        templateVersion: 2,
        templateName: 'Lower body A',
        assignedAt: NOW,
      },
    });
    expect(w?.days[1]?.exercises).toEqual([
      expect.objectContaining({
        id: undefined,
        exerciseId: 'squat',
        trainerNote: 'Brace',
        notes: null,
      }),
      expect.objectContaining({ id: undefined, exerciseId: 'rdl', trainerNote: null }),
    ]);
    expect(deps.notifier.trainerSaved).toHaveBeenCalledTimes(1);
    expect(deps.notifier.trainerSaved).toHaveBeenCalledWith(
      C1,
      TRAINER,
      expect.objectContaining({ version: 3 }),
      expect.objectContaining({ version: 4 }),
    );
  });

  it('REPLACE_DAY keeps the day id, name and weekday, and the row id of a kept exercise', async () => {
    const { service, writes } = setup({ routines: routines() });
    const res = await service.assign(TRAINER, {
      templateId: 't1',
      targets: [{ clientId: C2, mode: 'REPLACE_DAY', routineDayId: 'b1' }],
    });
    expect(res.results).toEqual([{ clientId: C2, ok: true, routineDayId: 'b1' }]);
    expect(writes[0]?.days[0]).toMatchObject({
      id: 'b1',
      name: 'Legs',
      plannedWeekday: 2,
      workoutType: 'LOWER_BODY',
      template: { templateId: 't1', templateVersion: 2 },
    });
    expect(writes[0]?.days[0]?.exercises.map((e) => [e.id, e.exerciseId])).toEqual([
      ['y2', 'squat'],
      [undefined, 'rdl'],
    ]);
  });

  it('each target fails on its own: CLIENT_UNAVAILABLE, NO_ROUTINE, DAY_NOT_FOUND, DAY_LIMIT', async () => {
    const full = routine(
      C1,
      Array.from({ length: 7 }, (_, i) => day(`f${i}`)),
    );
    const { service, writes } = setup({ routines: { ...routines(), [C1]: full } });
    const res = await service.assign(TRAINER, {
      templateId: 't1',
      targets: [
        { clientId: STRANGER, mode: 'ADD_DAY' },
        { clientId: C3, mode: 'ADD_DAY' },
        { clientId: C2, mode: 'REPLACE_DAY', routineDayId: 'gone' },
        { clientId: C1, mode: 'ADD_DAY' },
        { clientId: C2, mode: 'ADD_DAY' },
      ],
    });
    expect(res.results).toEqual([
      { clientId: STRANGER, ok: false, reason: 'CLIENT_UNAVAILABLE' },
      { clientId: C3, ok: false, reason: 'NO_ROUTINE' },
      { clientId: C2, ok: false, reason: 'DAY_NOT_FOUND' },
      { clientId: C1, ok: false, reason: 'DAY_LIMIT' },
      { clientId: C2, ok: true, routineDayId: 'new-day-1' },
    ]);
    expect(writes.map((w) => w.userId)).toEqual([C2]);
  });

  it('another trainer’s template: NOT_FOUND for the whole call', async () => {
    const { service } = setup({
      template: template({ trainerId: OTHER_TRAINER }),
      routines: routines(),
    });
    await expect(
      service.assign(TRAINER, { templateId: 't1', targets: [{ clientId: C1, mode: 'ADD_DAY' }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: TEMPLATE_COPY.server.notFound });
  });

  it('a racing client save is retried once on the fresh routine, then reported as CONFLICT', async () => {
    const once = setup({ routines: routines(), conflicts: { [C1]: 1 } });
    const r1 = await once.service.assign(TRAINER, {
      templateId: 't1',
      targets: [{ clientId: C1, mode: 'ADD_DAY' }],
    });
    expect(r1.results[0]).toMatchObject({ ok: true });
    expect(once.deps.routines.findActive).toHaveBeenCalledTimes(2);

    const twice = setup({ routines: routines(), conflicts: { [C1]: 2 } });
    const r2 = await twice.service.assign(TRAINER, {
      templateId: 't1',
      targets: [{ clientId: C1, mode: 'ADD_DAY' }],
    });
    expect(r2.results).toEqual([{ clientId: C1, ok: false, reason: 'CONFLICT' }]);
    expect(twice.deps.notifier.trainerSaved).not.toHaveBeenCalled();
  });

  it('default loads become next-session targets only where the client has no progression', async () => {
    const tpl = template({
      exercises: [
        tRow('te1', 'squat', { defaultLoadKg: 60, sets: 4 }),
        tRow('te2', 'rdl', { position: 1, defaultLoadKg: 50 }),
        tRow('te3', 'plank', { position: 2, defaultLoadKg: 10, repMin: 30, repMax: 60 }),
      ],
    });
    const { service, deps } = setup({
      template: tpl,
      routines: routines(),
      // C1 already lifts squats in this rep range: their load is never overwritten.
      progressions: { [C1]: [{ exerciseId: 'squat', repBucket: '6-8' }] },
    });
    await service.assign(TRAINER, {
      templateId: 't1',
      targets: [{ clientId: C1, mode: 'ADD_DAY' }],
    });
    expect(deps.progression.setOverride).toHaveBeenCalledTimes(1);
    expect(deps.progression.setOverride).toHaveBeenCalledWith(
      C1,
      { exerciseId: 'rdl', repBucket: '6-8', weightKg: 50, reps: [6, 6, 6] },
      { setById: TRAINER },
    );
  });
});

describe('updateClients', () => {
  const copied = (userId: string, version: number, rows: ReturnType<typeof rRow>[]) =>
    routine(userId, [
      day('other', { exercises: [rRow('o1', 'bench')] }),
      day(`copy-${userId}`, {
        name: 'Legs',
        templateId: 't1',
        templateVersion: version,
        templateName: 'Lower body A',
        templateAssignedAt: new Date('2026-10-01T00:00:00Z'),
        editedSinceTemplate: true,
        exercises: rows,
      }),
    ]);

  it('replaces the copy’s exercises, keeping row ids (and so loads) of exercises still there', async () => {
    const { service, writes, deps } = setup({
      routines: {
        [C1]: copied(C1, 1, [rRow('k1', 'squat'), rRow('k2', 'lunge')]),
        [C2]: copied(C2, 1, [rRow('m1', 'squat')]),
        [C3]: routine(C3, [day('plain')]),
      },
    });
    const res = await service.updateClients(TRAINER, {
      templateId: 't1',
      clientIds: [C1, C2, C3, STRANGER],
    });
    expect(res.results).toEqual([
      { clientId: C1, ok: true, routineDayId: `copy-${C1}` },
      { clientId: C2, ok: true, routineDayId: `copy-${C2}` },
      { clientId: C3, ok: false, reason: 'NOT_ASSIGNED' },
      { clientId: STRANGER, ok: false, reason: 'CLIENT_UNAVAILABLE' },
    ]);
    const c1 = writes.find((w) => w.userId === C1);
    expect(c1?.days[0]).toMatchObject({ id: 'other' });
    expect(c1?.days[0]?.template).toBeUndefined();
    expect(c1?.days[1]?.exercises.map((e) => [e.id, e.exerciseId])).toEqual([
      ['k1', 'squat'],
      [undefined, 'rdl'],
    ]);
    // The new version's stamp: editedSinceTemplate resets; the assignment date is kept.
    expect(c1?.days[1]?.template).toEqual({
      templateId: 't1',
      templateVersion: 2,
      templateName: 'Lower body A',
      assignedAt: new Date('2026-10-01T00:00:00Z'),
    });
    expect(deps.notifier.trainerSaved).toHaveBeenCalledTimes(2);
    // Default loads: only for exercises new to the day (rdl), never for the kept squat.
    expect(deps.progression.setOverride.mock.calls.map((c) => [c[0], c[1].exerciseId])).toEqual([
      [C1, 'rdl'],
      [C2, 'rdl'],
    ]);
  });

  it('a client who is not assigned, or has no routine, is reported, not thrown', async () => {
    const { service } = setup({ routines: { [C1]: null } });
    const res = await service.updateClients(TRAINER, { templateId: 't1', clientIds: [C1] });
    expect(res.results).toEqual([{ clientId: C1, ok: false, reason: 'NO_ROUTINE' }]);
  });
});
