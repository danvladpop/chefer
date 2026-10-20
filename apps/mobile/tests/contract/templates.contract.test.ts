import { beforeAll, describe, expect, it } from 'vitest';
import type { CoachingNoticeDto, TemplateDoc, TrainerRoutineDto } from '@chefer/types';
import {
  errorOf,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  type CoachUser,
} from './coaching-helpers';

// Trainer mode M2, workout templates, through the real API
// (docs/prd-2026-10/trainer-mode.md §6.6 acceptance, §9, §14): build a template,
// assign it to 3 clients (two as a new day, one in place of a day), tune one
// client's kg, edit the template, update 2 of the 3. The third is unchanged; all
// three see "Changed by Ana" and got the "Ana updated your routine" notice.
// Plus authorization (a non-client is CLIENT_UNAVAILABLE per client, another
// trainer's template is NOT_FOUND), CONFLICT on a stale save and the limits.
// Skipped when coaching is off on the API.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[templates.contract] ${NO_COACHING_MESSAGE}`);
});

const unread = (list: CoachingNoticeDto[], kind: CoachingNoticeDto['kind']) =>
  list.filter((n) => n.kind === kind && !n.read);

async function joinAsClient(trainer: CoachUser, firstName: string): Promise<CoachUser> {
  const client = await makeCoachUser({ prefix: 'tpl-client', firstName, gymSetup: true });
  const invite = await trainer.api.trainer.invites.create.mutate({ label: firstName });
  await client.api.coaching.join.mutate({ code: invite.code, localDate: TODAY });
  return client;
}

async function routineOf(trainer: CoachUser, client: CoachUser): Promise<TrainerRoutineDto> {
  const r = await trainer.api.trainer.client.routine.query({ clientId: client.id, today: TODAY });
  if (!r) throw new Error('the client has no active routine');
  return r;
}

describe('trainer mode: workout templates (§6.6 acceptance)', () => {
  let trainer: CoachUser;
  let c1: CoachUser;
  let c2: CoachUser;
  let c3: CoachUser;
  let outsider: CoachUser;
  let doc: TemplateDoc;
  let templateId = '';
  /** In every client's routine (setup gave them all the same one): the client has a load for it. */
  let known = { exerciseId: '', repMin: 0, repMax: 0 };
  /** A curated strength exercise none of them has done. */
  let fresh = '';
  let replacedDayId = '';

  beforeAll(async () => {
    if (!enabled) return;
    trainer = await makeCoachUser({ prefix: 'tpl-trainer', firstName: 'Anatpl' });
    await trainer.api.trainer.activate.mutate({ displayName: 'Ana' });
    c1 = await joinAsClient(trainer, 'Maria');
    c2 = await joinAsClient(trainer, 'Ion');
    c3 = await joinAsClient(trainer, 'Dana');
    outsider = await makeCoachUser({ prefix: 'tpl-outsider', gymSetup: true });

    const r = await routineOf(trainer, c1);
    const row = r.days.flatMap((d) => d.exercises).find((e) => e.next !== null);
    if (!row) throw new Error('no strength row in the client routine');
    known = { exerciseId: row.exerciseId, repMin: row.repMin, repMax: row.repMax };
    const used = new Set(r.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    const library = await c1.api.gym.library.list.query();
    const pick = library.find(
      (e) =>
        e.ownerId === null &&
        !e.archived &&
        e.trackingType === 'WEIGHT_REPS' &&
        e.loadType === 'WEIGHTED' &&
        !used.has(e.id),
    );
    if (!pick) throw new Error('no curated strength exercise outside the routine');
    fresh = pick.id;
    replacedDayId = (await routineOf(trainer, c3)).days[0]?.id ?? '';

    doc = {
      name: `Lower body ${Date.now().toString(36)}`.slice(0, 40),
      workoutType: 'LOWER_BODY',
      exercises: [
        {
          exerciseId: known.exerciseId,
          sets: 3,
          repMin: known.repMin,
          repMax: known.repMax,
          targetRir: 2,
          restSec: 120,
          supersetGroup: null,
          // The clients already lift this one: never overwritten.
          defaultLoadKg: 200,
          trainerNote: 'Brace',
        },
        {
          exerciseId: fresh,
          sets: 3,
          repMin: 8,
          repMax: 10,
          targetRir: 2,
          restSec: 90,
          supersetGroup: null,
          defaultLoadKg: 40,
          trainerNote: null,
        },
      ],
    };
  });

  it('builds a template: curated only, at most 20 exercises', async () => {
    if (!enabled) return;
    expect(await trainer.api.trainer.templates.list.query()).toEqual([]);

    const custom = await trainer.api.gym.library.createCustom.mutate({
      name: `Trainer custom ${Date.now()}`,
      category: 'COMPOUND',
      equipment: 'BARBELL',
      loadType: 'WEIGHTED',
      primaryMuscles: ['quads'],
      secondaryMuscles: [],
      repMin: 6,
      repMax: 10,
      restSec: 90,
      isTimed: false,
      cues: [],
    });
    const secondRow = doc.exercises[1];
    if (!secondRow) throw new Error('fixture: the template needs a second row');
    const withCustom = {
      ...doc,
      exercises: [...doc.exercises, { ...secondRow, exerciseId: custom.id }],
    };
    const notCurated = await errorOf(trainer.api.trainer.templates.create.mutate(withCustom));
    expect(notCurated.code).toBe('BAD_REQUEST');
    expect(notCurated.message).toBe('Templates can only use exercises from the Chefer library.');

    const tooMany = { ...doc, exercises: Array.from({ length: 21 }, () => secondRow) };
    expect((await errorOf(trainer.api.trainer.templates.create.mutate(tooMany))).code).toBe(
      'BAD_REQUEST',
    );

    const created = await trainer.api.trainer.templates.create.mutate(doc);
    templateId = created.id;
    expect(created).toMatchObject({ name: doc.name, workoutType: 'LOWER_BODY', version: 1 });
    expect(created.exercises.map((e) => e.defaultLoadKg)).toEqual([200, 40]);
    expect(created.exerciseMeta.map((e) => e.id).sort()).toEqual([known.exerciseId, fresh].sort());
    expect(created.assignments).toEqual([]);
    const [row] = await trainer.api.trainer.templates.list.query();
    expect(row).toMatchObject({ id: templateId, exerciseCount: 2, assignedCount: 0 });
    expect(row?.estimatedMin).toBeGreaterThan(0);
  });

  it('assigns to 3 clients (2 new days, 1 replaced day); a non-client fails alone', async () => {
    if (!enabled) return;
    const res = await trainer.api.trainer.templates.assign.mutate({
      templateId,
      targets: [
        { clientId: c1.id, mode: 'ADD_DAY', weekday: 5 },
        { clientId: outsider.id, mode: 'ADD_DAY' },
        { clientId: c2.id, mode: 'ADD_DAY' },
        { clientId: c3.id, mode: 'REPLACE_DAY', routineDayId: replacedDayId },
      ],
    });
    expect(res.templateVersion).toBe(1);
    expect(res.results.map((r) => [r.clientId, r.ok])).toEqual([
      [c1.id, true],
      [outsider.id, false],
      [c2.id, true],
      [c3.id, true],
    ]);
    expect(res.results[1]).toEqual({
      clientId: outsider.id,
      ok: false,
      reason: 'CLIENT_UNAVAILABLE',
    });
    const c3Result = res.results[3];
    expect(c3Result?.ok && c3Result.routineDayId).toBe(replacedDayId);

    // c1's new day: named after the template, the weekday, the "Based on" ref, the cue.
    const r1 = await routineOf(trainer, c1);
    const added = r1.days[r1.days.length - 1];
    expect(added).toMatchObject({
      name: doc.name,
      plannedWeekday: 5,
      workoutType: 'LOWER_BODY',
      template: { templateId, name: doc.name, version: 1, deleted: false },
    });
    expect(added?.exercises.map((e) => e.trainerNote)).toEqual(['Brace', null]);
    // Default loads: only where the client had no progression yet.
    const [knownRow, freshRow] = added?.exercises ?? [];
    expect(knownRow?.next?.override ?? null).toBeNull();
    expect(freshRow?.next?.override).toMatchObject({ weightKg: 40, setBy: 'TRAINER' });

    // c3's day was replaced in place: same id, the template's exercises.
    const r3 = await routineOf(trainer, c3);
    const replaced = r3.days.find((d) => d.id === replacedDayId);
    expect(replaced?.exercises.map((e) => e.exerciseId)).toEqual([known.exerciseId, fresh]);
    expect(replaced?.template?.version).toBe(1);

    const [row] = await trainer.api.trainer.templates.list.query();
    expect(row).toMatchObject({ assignedCount: 3, outdatedCount: 0 });
  });

  it('tunes one client’s kg, then edits the template: 3 clients have an older version', async () => {
    if (!enabled) return;
    const freshRow = (await routineOf(trainer, c2)).days
      .flatMap((d) => d.exercises)
      .find((e) => e.exerciseId === fresh);
    if (!freshRow?.next) throw new Error('no next-session data for the new exercise');
    await trainer.api.trainer.client.setNextTarget.mutate({
      clientId: c2.id,
      exerciseId: fresh,
      repBucket: freshRow.next.repBucket,
      weightKg: 45,
      reps: [8, 8, 8],
    });

    const v2: TemplateDoc = {
      ...doc,
      exercises: doc.exercises.map((e, i) =>
        i === 0 ? { ...e, sets: 4, trainerNote: 'Brace hard' } : e,
      ),
    };
    const saved = await trainer.api.trainer.templates.save.mutate({
      templateId,
      template: v2,
      expectedVersion: 1,
    });
    expect(saved.version).toBe(2);

    const stale = await errorOf(
      trainer.api.trainer.templates.save.mutate({ templateId, template: doc, expectedVersion: 1 }),
    );
    expect(stale.code).toBe('CONFLICT');
    expect(stale.data.conflict?.kind).toBe('template');
    expect((stale.data.conflict?.current as { version: number }).version).toBe(2);

    const [row] = await trainer.api.trainer.templates.list.query();
    expect(row).toMatchObject({ assignedCount: 3, outdatedCount: 3 });
  });

  it('a client edits their copy (edited since), then 2 of the 3 are updated; the third is unchanged', async () => {
    if (!enabled) return;
    // Dana changes the sets of her copied day herself.
    const active = (await c3.api.gym.bootstrap.query({ today: TODAY })).activeRoutine;
    if (!active) throw new Error('no active routine');
    const mine = await c3.api.gym.routine.get.query({ id: active.id });
    const saved = await c3.api.gym.routine.save.mutate({
      expectedVersion: mine.version,
      routine: {
        id: mine.id,
        name: mine.name,
        days: mine.days.map((d) => ({
          id: d.id,
          name: d.name,
          plannedWeekday: d.plannedWeekday,
          exercises: d.exercises.map((e) => ({
            id: e.id,
            exerciseId: e.exerciseId,
            sets: d.id === replacedDayId && e.exerciseId === fresh ? 5 : e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
            targetRir: e.targetRir,
            restSec: e.restSec,
            supersetGroup: e.supersetGroup,
            notes: e.notes,
          })),
        })),
      },
    });
    expect(saved.version).toBe(mine.version + 1);

    const before = await trainer.api.trainer.templates.get.query({ templateId });
    expect(before.assignments).toHaveLength(3);
    expect(before.assignments.every((a) => a.outdated)).toBe(true);
    expect(before.assignments.find((a) => a.clientId === c3.id)?.editedSince).toBe(true);
    expect(before.assignments.find((a) => a.clientId === c1.id)?.editedSince).toBe(false);
    expect(before.assignments.find((a) => a.clientId === c1.id)?.clientName).toContain('Maria');

    const res = await trainer.api.trainer.templates.updateClients.mutate({
      templateId,
      clientIds: [c1.id, c2.id],
    });
    expect(res.templateVersion).toBe(2);
    expect(res.results.every((r) => r.ok)).toBe(true);

    const after = await trainer.api.trainer.templates.get.query({ templateId });
    const byClient = new Map(after.assignments.map((a) => [a.clientId, a]));
    expect(byClient.get(c1.id)).toMatchObject({ templateVersion: 2, outdated: false });
    expect(byClient.get(c2.id)).toMatchObject({ templateVersion: 2, outdated: false });
    expect(byClient.get(c3.id)).toMatchObject({
      templateVersion: 1,
      outdated: true,
      editedSince: true,
    });
    expect((await trainer.api.trainer.templates.list.query())[0]?.outdatedCount).toBe(1);

    // c1 and c2 have version 2's prescription; c2's tuned 45 kg is kept.
    const r2 = await routineOf(trainer, c2);
    const copy2 = r2.days.find((d) => d.template?.templateId === templateId);
    expect(copy2?.template?.version).toBe(2);
    expect(copy2?.exercises[0]).toMatchObject({ sets: 4, trainerNote: 'Brace hard' });
    expect(copy2?.exercises[1]?.next?.override).toMatchObject({ weightKg: 45 });

    // The third client is unchanged: version 1 and her own 5 sets.
    const copy3 = (await routineOf(trainer, c3)).days.find((d) => d.id === replacedDayId);
    expect(copy3?.template?.version).toBe(1);
    expect(copy3?.exercises.map((e) => e.sets)).toEqual([3, 5]);
  });

  it('all three clients see "Changed by Ana" and got the routine notice', async () => {
    if (!enabled) return;
    for (const client of [c1, c2, c3]) {
      const boot = await client.api.gym.bootstrap.query({ today: TODAY });
      const rows = boot.activeRoutine?.days.flatMap((d) => d.exercises) ?? [];
      expect(rows.some((e) => e.lastEditedByOther?.name === 'Ana')).toBe(true);
      const notices = unread(await client.api.coaching.notices.query(), 'ROUTINE_UPDATED');
      expect(notices).toHaveLength(1);
      expect(notices[0]?.other).toMatchObject({ id: trainer.id, role: 'TRAINER' });
    }
  });

  it('another trainer’s template is NOT_FOUND; a non-trainer is FORBIDDEN', async () => {
    if (!enabled) return;
    const other = await makeCoachUser({ prefix: 'tpl-other' });
    await other.api.trainer.activate.mutate({ displayName: 'Ion' });
    for (const call of [
      other.api.trainer.templates.get.query({ templateId }),
      other.api.trainer.templates.save.mutate({ templateId, template: doc, expectedVersion: 2 }),
      other.api.trainer.templates.delete.mutate({ templateId }),
      other.api.trainer.templates.assign.mutate({
        templateId,
        targets: [{ clientId: c1.id, mode: 'ADD_DAY' }],
      }),
      other.api.trainer.templates.updateClients.mutate({ templateId, clientIds: [c1.id] }),
    ]) {
      const err = await errorOf(call);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('This template isn’t available.');
    }
    const err = await errorOf(outsider.api.trainer.templates.list.query());
    expect(err.code).toBe('FORBIDDEN');
    expect(err.data.reason).toBe('TRAINER_TOOLS_OFF');
  });

  it('delete: gone from the library, the clients keep their copy with "Based on" as text', async () => {
    if (!enabled) return;
    expect(await trainer.api.trainer.templates.delete.mutate({ templateId })).toEqual({ ok: true });
    expect(await trainer.api.trainer.templates.list.query()).toEqual([]);
    expect((await errorOf(trainer.api.trainer.templates.get.query({ templateId }))).code).toBe(
      'NOT_FOUND',
    );
    const copy = (await routineOf(trainer, c1)).days.find(
      (d) => d.template?.templateId === templateId,
    );
    expect(copy?.template).toEqual({ templateId, name: doc.name, version: 2, deleted: true });
    expect(copy?.exercises).toHaveLength(2);
  });
});
