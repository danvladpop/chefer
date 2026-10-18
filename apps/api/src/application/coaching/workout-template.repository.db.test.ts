import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  prisma,
  routineRepository,
  workoutTemplateRepository,
  type RoutineDayWriteData,
  type RoutineWithDays,
  type TemplateExerciseWriteData,
} from '@chefer/database';
import { diffRoutineDoc } from '@chefer/utils';

// Real-database tests for trainer mode templates (trainer-mode.md §8.1). OFF by
// default (CI has no database). Run them with:
//   cd apps/api && COACHING_DB_TEST=1 npx vitest run src/application/coaching/workout-template.repository.db
//
// What only a real database can prove: the version check of a template save,
// the row ids it keeps, the template columns `replaceDocument` writes on a
// routine day, and `editedSinceTemplate` being set by an ordinary save.

const enabled = process.env['COACHING_DB_TEST'] === '1';
const RUN = `tpldb${Date.now().toString(36)}`;
const created: string[] = [];

async function makeUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${RUN}-${label}@templates.test`, firstName: label },
  });
  created.push(user.id);
  return user.id;
}

afterAll(async () => {
  if (!enabled) return;
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

const tRow = (exerciseId: string, over: Partial<TemplateExerciseWriteData> = {}) => ({
  exerciseId,
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

const keep = (r: RoutineWithDays): RoutineDayWriteData[] =>
  r.days.map((d) => ({
    id: d.id,
    name: d.name,
    plannedWeekday: d.plannedWeekday,
    exercises: d.exercises.map((e) => ({ ...e, notes: e.notes })),
  }));

describe.skipIf(!enabled)('workout templates (real database)', () => {
  let trainer = '';
  let client = '';
  let ex: string[] = [];

  beforeAll(async () => {
    trainer = await makeUser('trainer');
    client = await makeUser('client');
    ex = (
      await prisma.exercise.findMany({
        where: { ownerId: null },
        take: 3,
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).map((e) => e.id);
    expect(ex).toHaveLength(3);
  });

  it('a save is version-checked and keeps the ids of rows it was given', async () => {
    const t = await workoutTemplateRepository.create(trainer, {
      name: 'Lower A',
      workoutType: 'LOWER_BODY',
      exercises: [tRow(ex[0]!), tRow(ex[1]!, { defaultLoadKg: 42.5 })],
    });
    expect(t.version).toBe(1);
    const keptId = t.exercises[1]!.id;
    const ok = await workoutTemplateRepository.replaceDocument(
      trainer,
      t.id,
      {
        name: 'Lower A2',
        workoutType: null,
        exercises: [tRow(ex[1]!, { id: keptId }), tRow(ex[2]!)],
      },
      1,
    );
    if (ok.status !== 'ok') throw new Error(ok.status);
    expect(ok.template.version).toBe(2);
    expect(ok.template.exercises.map((e) => e.id)[0]).toBe(keptId);
    expect(ok.template.exercises.map((e) => e.exerciseId)).toEqual([ex[1], ex[2]]);

    const stale = await workoutTemplateRepository.replaceDocument(
      trainer,
      t.id,
      { name: 'x', workoutType: null, exercises: [] },
      1,
    );
    expect(stale.status).toBe('conflict');
    const other = await makeUser('other');
    expect(
      (
        await workoutTemplateRepository.replaceDocument(
          other,
          t.id,
          { name: 'x', workoutType: null, exercises: [] },
          2,
        )
      ).status,
    ).toBe('not_found');
  });

  it('soft delete hides the template; purge removes it after the cutoff only', async () => {
    const t = await workoutTemplateRepository.create(trainer, {
      name: 'Gone',
      workoutType: null,
      exercises: [],
    });
    const before = await workoutTemplateRepository.countLive(trainer);
    expect(await workoutTemplateRepository.softDelete(trainer, t.id, new Date('2026-01-01'))).toBe(
      true,
    );
    expect(await workoutTemplateRepository.find(trainer, t.id)).toBeNull();
    expect(await workoutTemplateRepository.countLive(trainer)).toBe(before - 1);
    expect((await workoutTemplateRepository.findNames([t.id]))[0]?.deletedAt).not.toBeNull();
    await workoutTemplateRepository.purgeDeletedBefore(new Date('2025-12-01'));
    expect(await workoutTemplateRepository.findNames([t.id])).toHaveLength(1);
    await workoutTemplateRepository.purgeDeletedBefore(new Date('2026-02-01'));
    expect(await workoutTemplateRepository.findNames([t.id])).toHaveLength(0);
  });

  it('the template stamp, editedSinceTemplate on a later save, and assignments of active routines', async () => {
    const r = await routineRepository.create(client, {
      name: 'Plan',
      templateKey: null,
      isActive: true,
      days: [{ name: 'A', plannedWeekday: null, exercises: [] }],
    });
    const assignedAt = new Date('2026-10-18T10:00:00Z');
    const stamped = await routineRepository.replaceDocument(
      client,
      r.id,
      {
        name: r.name,
        days: [
          ...keep(r),
          {
            name: 'Lower A',
            plannedWeekday: 2,
            workoutType: 'LOWER_BODY',
            template: {
              templateId: 'tpl-x',
              templateVersion: 3,
              templateName: 'Lower A',
              assignedAt,
            },
            exercises: [{ ...tRow(ex[0]!), notes: null, trainerNote: 'Brace' }],
          },
        ],
      },
      r.version,
      { actorId: trainer, path: 'TRAINER', diff: diffRoutineDoc },
    );
    if (stamped.status !== 'ok') throw new Error(stamped.status);
    const copy = stamped.routine.days[1]!;
    expect(copy).toMatchObject({
      templateId: 'tpl-x',
      templateVersion: 3,
      templateName: 'Lower A',
      templateAssignedAt: assignedAt,
      editedSinceTemplate: false,
    });
    expect(copy.exercises[0]?.lastEditedById).toBe(trainer);

    // A save that only renames the day keeps the stamp and is not "edited since".
    const renamed = keep(stamped.routine);
    renamed[1] = { ...renamed[1]!, name: 'Legs' };
    const s2 = await routineRepository.replaceDocument(
      client,
      r.id,
      { name: 'Plan', days: renamed },
      stamped.routine.version,
      {
        actorId: client,
        path: 'OWNER',
        diff: diffRoutineDoc,
      },
    );
    if (s2.status !== 'ok') throw new Error(s2.status);
    expect(s2.routine.days[1]).toMatchObject({ templateId: 'tpl-x', editedSinceTemplate: false });

    const assignments = await workoutTemplateRepository.listAssignments(['tpl-x'], [client]);
    expect(assignments).toEqual([
      expect.objectContaining({
        dayId: copy.id,
        userId: client,
        templateVersion: 3,
        editedSinceTemplate: false,
      }),
    ]);

    // The client changes the sets of the copied day: edited since.
    const edited = keep(s2.routine);
    edited[1] = {
      ...edited[1]!,
      exercises: edited[1]!.exercises.map((e) => ({ ...e, sets: e.sets + 1 })),
    };
    const s3 = await routineRepository.replaceDocument(
      client,
      r.id,
      { name: 'Plan', days: edited },
      s2.routine.version,
      {
        actorId: client,
        path: 'OWNER',
        diff: diffRoutineDoc,
      },
    );
    if (s3.status !== 'ok') throw new Error(s3.status);
    expect(s3.routine.days[1]).toMatchObject({ templateId: 'tpl-x', editedSinceTemplate: true });

    // Re-stamping (Update for clients) resets it; `null` clears the columns.
    const restamp = keep(s3.routine);
    restamp[1] = {
      ...restamp[1]!,
      template: { templateId: 'tpl-x', templateVersion: 4, templateName: 'Lower A', assignedAt },
    };
    const s4 = await routineRepository.replaceDocument(
      client,
      r.id,
      { name: 'Plan', days: restamp },
      s3.routine.version,
    );
    if (s4.status !== 'ok') throw new Error(s4.status);
    expect(s4.routine.days[1]).toMatchObject({ templateVersion: 4, editedSinceTemplate: false });
    // An archived (not active) routine's copies are never listed.
    await routineRepository.archive(client, r.id);
    expect(await workoutTemplateRepository.listAssignments(['tpl-x'], [client])).toEqual([]);
    const cleared = keep(s4.routine);
    cleared[1] = { ...cleared[1]!, template: null };
    const s5 = await routineRepository.replaceDocument(
      client,
      r.id,
      { name: 'Plan', days: cleared },
      s4.routine.version,
    );
    if (s5.status !== 'ok') throw new Error(s5.status);
    expect(s5.routine.days[1]).toMatchObject({
      templateId: null,
      templateName: null,
      templateVersion: null,
    });
  });
});
