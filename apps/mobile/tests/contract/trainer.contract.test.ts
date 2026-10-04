import { beforeAll, describe, expect, it } from 'vitest';
import type { RoutineDto, TrainerRoutineDoc, TrainerRoutineDto } from '@chefer/types';
import {
  clientAtLevel,
  errorOf,
  finishedWorkoutFrom,
  keyPaths,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  trainerWithInvite,
  type CoachUser,
} from './coaching-helpers';

// Trainer coaching through the real API (WP-18, docs/trainer-platform/spec.md
// §2, §5.3, §6, §7, §9, §10). One long scenario: a trainer turns tools on,
// invites a client, edits the routine, sets a next-session target, reads the
// client's workouts and adherence, keeps a private note, and the client leaves.
//
// Skipped as a whole when `coaching.availability` says it is off, so an API
// without FEATURE_FLAGS=coaching does not fail CI (the CI job sets it).

let enabled = false;
let trainer: CoachUser;
let client: CoachUser;
let code: string;
let routine: TrainerRoutineDto;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) {
    console.warn(`[trainer.contract] ${NO_COACHING_MESSAGE}`);
    return;
  }
  trainer = await makeCoachUser({ prefix: 'coach-trainer', firstName: 'Anatrainer' });
  client = await makeCoachUser({ prefix: 'coach-client', firstName: 'Maria', gymSetup: true });
});

/** The trainer's doc from the routine as read (what the editor sends back). */
function docOf(r: TrainerRoutineDto): TrainerRoutineDoc {
  return {
    id: r.id,
    name: r.name,
    days: r.days.map((d) => ({
      id: d.id,
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        trainerNote: e.trainerNote,
      })),
    })),
  };
}

describe.skipIf(false)('trainer coaching (WP-18)', () => {
  it('a user who is not a trainer: status says they can turn tools on, trainer.* is FORBIDDEN with a reason', async () => {
    if (!enabled) return;
    const status = await trainer.api.trainer.status.query();
    expect(status).toEqual({ canActivate: true, active: false, displayName: null });
    const err = await errorOf(trainer.api.trainer.clients.list.query());
    expect(err.code).toBe('FORBIDDEN');
    expect(err.data.reason).toBe('TRAINER_TOOLS_OFF');
  });

  it('turns trainer tools on and creates an invite link', async () => {
    if (!enabled) return;
    const invite = await trainerWithInvite(trainer, 'Maria, Tue/Thu');
    code = invite.code;
    expect(invite.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(invite.url.endsWith(`/coaching/join/${invite.code}`)).toBe(true);
    expect(invite.state).toBe('OPEN');
    const list = await trainer.api.trainer.invites.list.query();
    expect(list.map((i) => i.code)).toContain(code);
    expect(await trainer.api.trainer.status.query()).toMatchObject({
      active: true,
      displayName: 'Ana',
    });
  });

  it('a client without gym setup sees needsGymSetup and cannot join', async () => {
    if (!enabled) return;
    const fresh = await makeCoachUser({ prefix: 'coach-nosetup' });
    const preview = await fresh.api.coaching.previewInvite.query({ code });
    expect(preview).toMatchObject({ state: 'OK', trainerName: 'Ana', needsGymSetup: true });
    const err = await errorOf(fresh.api.coaching.join.mutate({ code }));
    expect(err.code).toBe('PRECONDITION_FAILED');
  });

  it('the client joins through the consent screen, once: the invite is single use', async () => {
    if (!enabled) return;
    const preview = await client.api.coaching.previewInvite.query({ code });
    expect(preview).toEqual({
      state: 'OK',
      trainerName: 'Ana',
      currentTrainerName: null,
      needsGymSetup: false,
    });
    const status = await client.api.coaching.join.mutate({ code, localDate: TODAY });
    expect(status.trainer?.name).toBe('Ana');
    expect(status.stopped).toBeNull();

    const other = await makeCoachUser({ prefix: 'coach-late', gymSetup: true });
    expect((await other.api.coaching.previewInvite.query({ code })).state).toBe('USED');
    expect((await errorOf(other.api.coaching.join.mutate({ code }))).code).toBe('BAD_REQUEST');
    expect(
      (await trainer.api.trainer.invites.list.query()).find((i) => i.code === code)?.state,
    ).toBe('USED');
  });

  it('the client list shows the new client with this week against the goal', async () => {
    if (!enabled) return;
    const rows = await trainer.api.trainer.clients.list.query({ today: TODAY });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: client.id,
      label: 'Maria, Tue/Thu',
      lastWorkoutDate: null,
      week: { sessions: 0, goal: 3 },
      routineChangedByClientAt: null,
    });
    expect(rows[0]?.name).toContain('Maria');
  });

  it('reads the client routine: strength rows carry the next-session panel, no client notes', async () => {
    if (!enabled) return;
    const r = await trainer.api.trainer.client.routine.query({ clientId: client.id, today: TODAY });
    if (!r) throw new Error('the client has no active routine after setup');
    routine = r;
    expect(r.days.length).toBeGreaterThan(0);
    const first = r.days[0]?.exercises[0];
    expect(first?.next?.repBucket).toBe(`${first?.repMin}-${first?.repMax}`);
    expect(first?.next?.override).toBeNull();
    expect(first?.trainerNote).toBeNull();
    expect(first?.lastEditedByOther).toBeNull();
    expect(r.exercises.map((e) => e.id)).toContain(first?.exerciseId);
    // The client's own routine-exercise note is never part of the trainer view.
    expect(keyPaths(r)).not.toContain('notes');
  });

  it('the trainer edits the routine: changed rows and the routine are stamped, others are not', async () => {
    if (!enabled) return;
    const doc = docOf(routine);
    const target = doc.days[0]?.exercises[0];
    if (!target) throw new Error('no exercise to edit');
    target.sets = target.sets + 1;
    target.trainerNote = 'knees out, slow eccentric';
    const saved = await trainer.api.trainer.client.saveRoutine.mutate({
      clientId: client.id,
      routine: doc,
      expectedVersion: routine.version,
    });
    expect(saved.version).toBe(routine.version + 1);
    expect(saved.days[0]?.exercises[0]?.trainerNote).toBe('knees out, slow eccentric');
    routine = saved;

    // The client (level 6) sees who changed what, on exactly the changed row.
    const boot = await client.api.gym.bootstrap.query({ today: TODAY });
    expect(boot.coaching).toEqual({ trainerName: 'Ana' });
    const changed = boot.activeRoutine?.days[0]?.exercises[0];
    expect(changed?.trainerNote).toBe('knees out, slow eccentric');
    expect(changed?.lastEditedByOther?.name).toBe('Ana');
    expect(boot.activeRoutine?.lastEditedByOther?.name).toBe('Ana');
    const untouched = boot.activeRoutine?.days.flatMap((d) => d.exercises).slice(1) ?? [];
    expect(untouched.length).toBeGreaterThan(0);
    for (const e of untouched) {
      expect(e.lastEditedByOther).toBeUndefined();
      expect(e.trainerNote).toBeUndefined();
    }
    // ...and the trainer's note reaches the next workout's exercise.
    const nextEx = boot.nextWorkout?.exercises.find((e) => e.routineExerciseId === changed?.id);
    if (nextEx) expect(nextEx.trainerNote).toBe('knees out, slow eccentric');
  });

  it('only curated exercises can be added; a stale version is a CONFLICT naming the client', async () => {
    if (!enabled) return;
    // A custom exercise of the TRAINER's is not the client's: not visible, so unknown.
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
    const withCustom = docOf(routine);
    withCustom.days[0]?.exercises.push({
      exerciseId: custom.id,
      sets: 3,
      repMin: 8,
      repMax: 10,
      targetRir: 2,
      restSec: 90,
      supersetGroup: null,
      trainerNote: null,
    });
    expect(
      (
        await errorOf(
          trainer.api.trainer.client.saveRoutine.mutate({
            clientId: client.id,
            routine: withCustom,
            expectedVersion: routine.version,
          }),
        )
      ).code,
    ).toBe('BAD_REQUEST');

    // The client edits (level 6 client, from its own routine), then the trainer saves on the old version.
    const mine = (await client.api.gym.routine.get.query({ id: routine.id })).days;
    const edited = {
      id: routine.id,
      name: routine.name,
      days: mine.map((d) => ({
        id: d.id,
        name: d.name,
        plannedWeekday: d.plannedWeekday,
        exercises: d.exercises.map((e, i) => ({
          id: e.id,
          exerciseId: e.exerciseId,
          sets: d.id === mine[0]?.id && i === 1 ? e.sets + 1 : e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      })),
    };
    const clientSave = await client.api.gym.routine.save.mutate({
      routine: edited,
      expectedVersion: routine.version,
    });
    expect(clientSave.version).toBe(routine.version + 1);
    // The client's own save keeps the trainer's note (the client never wrote it).
    expect(clientSave.days[0]?.exercises[0]?.trainerNote).toBe('knees out, slow eccentric');

    const stale = await errorOf(
      trainer.api.trainer.client.saveRoutine.mutate({
        clientId: client.id,
        routine: docOf(routine),
        expectedVersion: routine.version,
      }),
    );
    expect(stale.code).toBe('CONFLICT');
    const conflict = stale.data.conflict as { kind: string; current: RoutineDto };
    expect(conflict.kind).toBe('routine');
    expect(conflict.current.version).toBe(routine.version + 1);
    expect(conflict.current.lastEditedByOther?.name).toContain('Maria');
    // The row the client changed reads "Changed by Maria" on the trainer side.
    expect(conflict.current.days[0]?.exercises[1]?.lastEditedByOther?.name).toContain('Maria');
    expect(conflict.current.days[0]?.exercises[0]?.lastEditedByOther).toBeUndefined();
    expect(conflict.current.days[0]?.exercises[0]?.trainerNote).toBe('knees out, slow eccentric');
    // The client's own routine-exercise notes are never in a trainer's payload.
    expect(conflict.current.days.flatMap((d) => d.exercises).every((e) => e.notes === null)).toBe(
      true,
    );

    // "Use the other version": the trainer re-reads and sees the client's change.
    const reread = await trainer.api.trainer.client.routine.query({ clientId: client.id });
    if (!reread) throw new Error('routine disappeared');
    routine = reread;
    expect(routine.version).toBe(conflict.current.version);
    const clients = await trainer.api.trainer.clients.list.query({ today: TODAY });
    expect(clients[0]?.routineChangedByClientAt).not.toBeNull();
  });

  it('a next-session target: set by the trainer, applied on every client version, consumed once', async () => {
    if (!enabled) return;
    const row = routine.days[0]?.exercises[0];
    if (!row?.next) throw new Error('first row has no next-session data');
    const next = await trainer.api.trainer.client.setNextTarget.mutate({
      clientId: client.id,
      exerciseId: row.exerciseId,
      repBucket: row.next.repBucket,
      weightKg: 62.5,
      reps: [6, 6, 6, 6],
    });
    expect(next.override).toMatchObject({ weightKg: 62.5, reps: [6, 6, 6, 6], setBy: 'TRAINER' });

    // Level 6: "Set by Ana". Level 4 (installed 1.0.1): the target is applied, with no new fields.
    const boot6 = await client.api.gym.bootstrap.query({ today: TODAY });
    const p6 = boot6.progressions.find(
      (p) => p.exerciseId === row.exerciseId && p.repBucket === row.next?.repBucket,
    );
    expect(p6?.override).toMatchObject({ weightKg: 62.5, reps: [6, 6, 6, 6], setByName: 'Ana' });
    expect(p6?.override).not.toHaveProperty('setById');
    expect(p6?.suggestion).toMatchObject({ reasonCode: 'USER_OVERRIDE', weightKg: 62.5, sets: 4 });

    const old = await clientAtLevel(client, 4);
    const boot4 = await old.gym.bootstrap.query({ today: TODAY });
    const p4 = boot4.progressions.find(
      (p) => p.exerciseId === row.exerciseId && p.repBucket === row.next?.repBucket,
    );
    expect(p4?.suggestion).toMatchObject({ reasonCode: 'USER_OVERRIDE', weightKg: 62.5 });
    expect(p4?.override).toMatchObject({ weightKg: 62.5 });
    expect(p4?.override).not.toHaveProperty('setByName');
    expect(p4?.override).not.toHaveProperty('setById');

    // The client logs a workout: the target is consumed, the engine continues, the trainer sees it.
    const nextWorkout = boot6.nextWorkout;
    if (!nextWorkout) throw new Error('no next workout');
    // The workout starts AFTER the target was set (a session started before it does not consume it).
    await client.api.gym.session.upsertMany.mutate({
      docs: [finishedWorkoutFrom(nextWorkout, new Date(Date.now() + 60_000))],
    });
    const after = await trainer.api.trainer.client.routine.query({
      clientId: client.id,
      today: TODAY,
    });
    const same = after?.days
      .flatMap((d) => d.exercises)
      .find((e) => e.exerciseId === row.exerciseId);
    expect(same?.next?.override).toBeNull();
    expect(same?.next?.lastDoneDate).toBe(TODAY);

    // Clearing a target that is not there is fine.
    const cleared = await trainer.api.trainer.client.clearNextTarget.mutate({
      clientId: client.id,
      exerciseId: row.exerciseId,
      repBucket: row.next.repBucket,
    });
    expect(cleared.override).toBeNull();
  });

  it('workouts and adherence: what is shared, and what never is', async () => {
    if (!enabled) return;
    await client.api.gym.pause.create.mutate({
      startDate: TODAY,
      endDate: TODAY,
      reason: 'injury',
    });
    const page = await trainer.api.trainer.client.workouts.query({ clientId: client.id, limit: 5 });
    expect(page.items).toHaveLength(1);
    const w = page.items[0];
    expect(w?.localDate).toBe(TODAY);
    expect(w?.exercises[0]?.sets.every((s) => s.completed && !s.isWarmup)).toBe(true);
    expect(w?.exercises[0]?.lastSetRir).toBe(2);

    const overview = await trainer.api.trainer.client.overview.query({
      clientId: client.id,
      today: TODAY,
    });
    expect(overview.recent).toHaveLength(1);
    expect(overview.adherence.days).toHaveLength(14);
    expect(overview.adherence.days.at(-1)).toMatchObject({
      localDate: TODAY,
      trained: true,
      paused: true,
    });
    expect(overview.adherence.weeks.length).toBeGreaterThan(0);

    const history = await trainer.api.trainer.client.exerciseHistory.query({
      clientId: client.id,
      exerciseId: w?.exercises[0]?.exerciseId ?? '',
    });
    expect(history.entries).toHaveLength(1);

    // Nothing private anywhere in what the trainer received.
    const everything = JSON.stringify([page, overview, history, routine]);
    for (const secret of ['SECRET-SESSION-NOTE', 'SECRET-EXERCISE-NOTE', 'injury']) {
      expect(everything).not.toContain(secret);
    }
    const paths = keyPaths([page, overview, history]);
    for (const forbidden of ['notes', 'caloriesKcal', 'avgHeartRateBpm', 'reason', 'email']) {
      expect(paths).not.toContain(forbidden);
    }
  });

  it('the private note saves and reloads, and appears in nothing the client receives', async () => {
    if (!enabled) return;
    expect(await trainer.api.trainer.client.note.query({ clientId: client.id })).toBeNull();
    const saved = await trainer.api.trainer.client.saveNote.mutate({
      clientId: client.id,
      body: 'PRIVATE-TRAINER-NOTE left knee, careful',
    });
    expect(saved.body).toContain('PRIVATE-TRAINER-NOTE');
    expect((await trainer.api.trainer.client.note.query({ clientId: client.id }))?.body).toContain(
      'PRIVATE-TRAINER-NOTE',
    );

    const clientView = JSON.stringify([
      await client.api.gym.bootstrap.query({ today: TODAY }),
      await client.api.coaching.status.query(),
      await client.api.privacy.getConsentHistory.query(),
    ]);
    expect(clientView).not.toContain('PRIVATE-TRAINER-NOTE');
  });

  it('a stranger, yourself and an unknown id all get the same NOT_FOUND', async () => {
    if (!enabled) return;
    const stranger = await makeCoachUser({ prefix: 'coach-stranger' });
    await stranger.api.trainer.activate.mutate({ displayName: 'Ion' });
    const unknown = 'cnobody0000000000000000001';
    const answers = await Promise.all([
      errorOf(stranger.api.trainer.client.routine.query({ clientId: client.id })),
      errorOf(stranger.api.trainer.client.workouts.query({ clientId: client.id })),
      errorOf(stranger.api.trainer.client.note.query({ clientId: client.id })),
      errorOf(stranger.api.trainer.client.routine.query({ clientId: unknown })),
      errorOf(stranger.api.trainer.client.routine.query({ clientId: stranger.id })),
      errorOf(stranger.api.trainer.clients.remove.mutate({ clientId: client.id })),
    ]);
    for (const a of answers) {
      expect(a.code).toBe('NOT_FOUND');
      expect(a.message).toBe(answers[0].message);
    }
  });

  it('the client leaves: the trainer is locked out at once, the client keeps the routine and the notes', async () => {
    if (!enabled) return;
    const left = await client.api.coaching.leave.mutate();
    expect(left).toEqual({ trainer: null, stopped: null });

    expect(
      (await errorOf(trainer.api.trainer.client.routine.query({ clientId: client.id }))).code,
    ).toBe('NOT_FOUND');
    expect(
      (await errorOf(trainer.api.trainer.client.note.query({ clientId: client.id }))).code,
    ).toBe('NOT_FOUND');
    expect(await trainer.api.trainer.clients.list.query({ today: TODAY })).toEqual([]);

    const boot = await client.api.gym.bootstrap.query({ today: TODAY });
    expect(boot.coaching).toBeNull();
    expect(boot.activeRoutine?.days[0]?.exercises[0]?.trainerNote).toBe(
      'knees out, slow eccentric',
    );
    // The client can clear a trainer note (but never rewrite it).
    const noteRow = boot.activeRoutine?.days[0]?.exercises[0];
    const doc = {
      id: boot.activeRoutine?.id ?? '',
      name: boot.activeRoutine?.name ?? '',
      days: (boot.activeRoutine?.days ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        plannedWeekday: d.plannedWeekday,
        exercises: d.exercises.map((e) => ({
          id: e.id,
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      })),
    };
    const cleared = await client.api.gym.routine.save.mutate({
      routine: doc,
      expectedVersion: boot.activeRoutine?.version ?? 1,
      clearTrainerNoteIds: noteRow ? [noteRow.id] : [],
    });
    expect(cleared.days[0]?.exercises[0]?.trainerNote).toBeUndefined();
  });

  it('the consent log has the grant and the withdrawal with the link as context (level 6 only)', async () => {
    if (!enabled) return;
    const rows6 = (await client.api.privacy.getConsentHistory.query()).filter(
      (e) => e.kind === 'COACHING_SHARING',
    );
    expect(rows6.map((e) => e.granted).sort()).toEqual([false, true]);
    expect(new Set(rows6.map((e) => e.contextId)).size).toBe(1);
    expect(rows6[0]?.contextId).toBeTruthy();

    const old = await clientAtLevel(client, 4);
    const rows4 = await old.privacy.getConsentHistory.query();
    expect(rows4.some((e) => e.kind === 'COACHING_SHARING')).toBe(false);
    const raw4 = await old.privacy.consentLog.query();
    expect(raw4.some((e) => e.kind === 'COACHING_SHARING')).toBe(false);
  });

  it('turning trainer tools off ends every link and revokes open invites', async () => {
    if (!enabled) return;
    const t = await makeCoachUser({ prefix: 'coach-off', firstName: 'Offtrainer' });
    const c = await makeCoachUser({ prefix: 'coach-offclient', gymSetup: true });
    const invite = await trainerWithInvite(t);
    const open = await t.api.trainer.invites.create.mutate({});
    await c.api.coaching.join.mutate({ code: invite.code });
    await t.api.trainer.deactivate.mutate();

    expect(await t.api.trainer.status.query()).toMatchObject({ active: false });
    expect(await c.api.coaching.status.query()).toMatchObject({
      trainer: null,
      stopped: { trainerName: 'Ana' },
    });
    expect((await c.api.coaching.previewInvite.query({ code: open.code })).state).toBe('REVOKED');
    expect((await errorOf(t.api.trainer.clients.list.query())).data.reason).toBe(
      'TRAINER_TOOLS_OFF',
    );
    // Trainer tools can be turned on again.
    await t.api.trainer.activate.mutate({ displayName: 'Ana' });
    expect(await t.api.trainer.clients.list.query()).toEqual([]);
  });

  it("anchors the quiet-days count on the client's local join date, not the server's UTC day", async () => {
    if (!enabled) return;
    const t = await makeCoachUser({ prefix: 'coach-startedon' });
    const c = await makeCoachUser({ prefix: 'coach-startedon-client', gymSetup: true });
    const inv = await trainerWithInvite(t);
    // A client east of UTC (e.g. Bucharest after 21:00) is already on tomorrow's date.
    const utcDay = new Date().toISOString().slice(0, 10);
    const ahead = new Date(`${utcDay}T00:00:00Z`);
    ahead.setUTCDate(ahead.getUTCDate() + 1);
    const joinedOn = ahead.toISOString().slice(0, 10);
    await c.api.coaching.join.mutate({ code: inv.code, localDate: joinedOn });
    const later = new Date(ahead);
    later.setUTCDate(later.getUTCDate() + 3);
    const [row] = await t.api.trainer.clients.list.query({
      today: later.toISOString().slice(0, 10),
    });
    // 3 quiet days since the client's own join date; the UTC day would say 4.
    expect(row).toMatchObject({ clientId: c.id, lastWorkoutDate: null, inactiveDays: 3 });

    // A localDate more than a day off is ignored (falls back to the UTC day), never an error.
    const c2 = await makeCoachUser({ prefix: 'coach-startedon-far', gymSetup: true });
    const inv2 = await t.api.trainer.invites.create.mutate({});
    await c2.api.coaching.join.mutate({ code: inv2.code, localDate: '2001-01-01' });
    const rows = await t.api.trainer.clients.list.query({ today: utcDay });
    expect(rows.find((r) => r.clientId === c2.id)?.inactiveDays).toBe(0);
  });

  it('createRoutine only works for a client with no active routine', async () => {
    if (!enabled) return;
    const t = await makeCoachUser({ prefix: 'coach-create' });
    const inv = await trainerWithInvite(t);
    const c = await makeCoachUser({ prefix: 'coach-create-client', gymSetup: true });
    await c.api.coaching.join.mutate({ code: inv.code });
    expect(
      (await errorOf(t.api.trainer.client.createRoutine.mutate({ clientId: c.id, days: 2 }))).code,
    ).toBe('BAD_REQUEST');
    // Archive the client's only routine, then the trainer can create one.
    const mine = await c.api.gym.routine.list.query();
    await c.api.gym.routine.archive.mutate({ id: mine[0]?.id ?? '' });
    const created = await t.api.trainer.client.createRoutine.mutate({ clientId: c.id, days: 2 });
    expect(created.days).toHaveLength(2);
    expect(created.lastEditedByOther).toBeNull();
    const clientBoot = await c.api.gym.bootstrap.query({ today: TODAY });
    expect(clientBoot.activeRoutine?.id).toBe(created.id);
    expect(clientBoot.activeRoutine?.lastEditedByOther?.name).toBe('Ana');
  });
});

describe('account deletion (spec §2.7)', () => {
  it("a deleted trainer: the client keeps the routine, and the trainer's stamps read 'your trainer'", async () => {
    if (!enabled) return;
    const t = await makeCoachUser({ prefix: 'coach-del-trainer' });
    const c = await makeCoachUser({ prefix: 'coach-del-client', gymSetup: true });
    const invite = await trainerWithInvite(t);
    await c.api.coaching.join.mutate({ code: invite.code });
    const routine = await t.api.trainer.client.routine.query({ clientId: c.id });
    if (!routine) throw new Error('no routine');
    const doc = docOf(routine);
    const row = doc.days[0]?.exercises[0];
    if (!row) throw new Error('no row');
    row.trainerNote = 'cue from a trainer who leaves';
    await t.api.trainer.client.saveRoutine.mutate({
      clientId: c.id,
      routine: doc,
      expectedVersion: routine.version,
    });

    await t.api.user.deleteSelf.mutate({ password: 'Contract@123!', confirm: 'DELETE' });

    const boot = await c.api.gym.bootstrap.query({ today: TODAY });
    expect(boot.coaching).toBeNull();
    const kept = boot.activeRoutine?.days[0]?.exercises[0];
    expect(kept?.trainerNote).toBe('cue from a trainer who leaves');
    expect(kept?.lastEditedByOther?.name).toBe('your trainer');
    expect(boot.activeRoutine?.lastEditedByOther?.name).toBe('your trainer');
    expect(await c.api.coaching.status.query()).toEqual({ trainer: null, stopped: null });
  });

  it("a deleted client: the trainer's list drops them, and the invite stays used", async () => {
    if (!enabled) return;
    const t = await makeCoachUser({ prefix: 'coach-del2-trainer' });
    const c = await makeCoachUser({ prefix: 'coach-del2-client', gymSetup: true });
    const invite = await trainerWithInvite(t);
    await c.api.coaching.join.mutate({ code: invite.code });
    await t.api.trainer.client.saveNote.mutate({ clientId: c.id, body: 'note' });
    await c.api.user.deleteSelf.mutate({ password: 'Contract@123!', confirm: 'DELETE' });

    expect(await t.api.trainer.clients.list.query()).toEqual([]);
    expect(
      (await t.api.trainer.invites.list.query()).find((i) => i.code === invite.code)?.state,
    ).toBe('USED');
  });
});
