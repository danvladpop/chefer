import { beforeAll, describe, expect, it } from 'vitest';
import type { TrainerRoutineDoc } from '@chefer/types';
import {
  clientAtLevel,
  finishedWorkoutFrom,
  keyPaths,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  trainerWithInvite,
  type CoachApi,
  type CoachUser,
} from './coaching-helpers';

// Old clients and trainer coaching (WP-18, spec §10): a 1.0.1 binary (API level
// 4) must never see trainer data or mis-render, but keeps working: the
// trainer's target is applied, its own routine saves keep the trainer's notes,
// COACHING_SHARING rows are not sent to it. Skipped when coaching is off.

let enabled = false;
let trainer: CoachUser;
let client: CoachUser;
let old: CoachApi;
let routineId = '';

const NEW_KEYS = ['trainerNote', 'lastEditedByOther', 'setByName', 'setById', 'coaching'];

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) {
    console.warn(`[coaching-compat.contract] ${NO_COACHING_MESSAGE}`);
    return;
  }
  trainer = await makeCoachUser({ prefix: 'compat-trainer' });
  client = await makeCoachUser({ prefix: 'compat-client', gymSetup: true });
  const invite = await trainerWithInvite(trainer);
  await client.api.coaching.join.mutate({ code: invite.code });
  old = await clientAtLevel(client, 4);

  // The trainer edits: a note on the first exercise, and a next-session target.
  const routine = await trainer.api.trainer.client.routine.query({ clientId: client.id });
  if (!routine) throw new Error('no routine');
  routineId = routine.id;
  const doc: TrainerRoutineDoc = {
    id: routine.id,
    name: routine.name,
    days: routine.days.map((d, di) => ({
      id: d.id,
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e, ei) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        trainerNote: di === 0 && ei === 0 ? 'COMPAT-TRAINER-NOTE' : null,
      })),
    })),
  };
  await trainer.api.trainer.client.saveRoutine.mutate({
    clientId: client.id,
    routine: doc,
    expectedVersion: routine.version,
  });
  const first = routine.days[0]?.exercises[0];
  if (!first?.next) throw new Error('first row has no next-session data');
  await trainer.api.trainer.client.setNextTarget.mutate({
    clientId: client.id,
    exerciseId: first.exerciseId,
    repBucket: first.next.repBucket,
    weightKg: 62.5,
    reps: [6, 6, 6, 6],
  });
});

describe('a level-4 client (the installed 1.0.1 app) of a coached user', () => {
  it('bootstrap carries none of the new fields, anywhere', async () => {
    if (!enabled) return;
    const boot = await old.gym.bootstrap.query({ today: TODAY });
    const paths = keyPaths(boot);
    for (const key of NEW_KEYS) expect(paths).not.toContain(key);
    expect(JSON.stringify(boot)).not.toContain('COMPAT-TRAINER-NOTE');
    expect(boot.activeRoutine?.days[0]?.exercises[0]).not.toHaveProperty('trainerNote');
  });

  it('routine.get and the routine list are the legacy shape', async () => {
    if (!enabled) return;
    const routine = await old.gym.routine.get.query({ id: routineId });
    for (const key of NEW_KEYS) expect(keyPaths(routine)).not.toContain(key);
    for (const key of NEW_KEYS)
      expect(keyPaths(await old.gym.routine.list.query())).not.toContain(key);
  });

  it("the trainer's next-session target is still applied (the wording gap is accepted)", async () => {
    if (!enabled) return;
    const boot = await old.gym.bootstrap.query({ today: TODAY });
    const overridden = boot.progressions.find((p) => p.override !== null);
    expect(overridden?.override).toMatchObject({ weightKg: 62.5, reps: [6, 6, 6, 6] });
    expect(overridden?.suggestion).toMatchObject({ reasonCode: 'USER_OVERRIDE', weightKg: 62.5 });
    const next = boot.nextWorkout?.exercises.find((e) => e.exerciseId === overridden?.exerciseId);
    expect(next?.suggestion).toMatchObject({ weightKg: 62.5, sets: 4 });
  });

  it('its own full-document save keeps the trainer note on kept rows', async () => {
    if (!enabled) return;
    const routine = await old.gym.routine.get.query({ id: routineId });
    const saved = await old.gym.routine.save.mutate({
      routine: {
        id: routine.id,
        name: routine.name,
        days: routine.days.map((d) => ({
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
      },
      expectedVersion: routine.version,
    });
    // Legacy answer...
    for (const key of NEW_KEYS) expect(keyPaths(saved)).not.toContain(key);
    // ...and the note is still there for the trainer and for a level-6 client.
    const seenByTrainer = await trainer.api.trainer.client.routine.query({ clientId: client.id });
    expect(seenByTrainer?.days[0]?.exercises[0]?.trainerNote).toBe('COMPAT-TRAINER-NOTE');
    // The old save is attributed too: the trainer sees nothing changed by the client on a no-op save.
    expect(seenByTrainer?.days[0]?.exercises[0]?.lastEditedByOther).toBeNull();
    const six = await client.api.gym.routine.get.query({ id: routineId });
    expect(six.days[0]?.exercises[0]?.trainerNote).toBe('COMPAT-TRAINER-NOTE');
  });

  it('the target is consumed by a workout logged from the old client', async () => {
    if (!enabled) return;
    const boot = await old.gym.bootstrap.query({ today: TODAY });
    if (!boot.nextWorkout) throw new Error('no next workout');
    await old.gym.session.upsertMany.mutate({
      docs: [finishedWorkoutFrom(boot.nextWorkout, new Date(Date.now() + 60_000))],
    });
    const after = await old.gym.bootstrap.query({ today: TODAY });
    expect(after.progressions.every((p) => p.override === null)).toBe(true);
  });

  it('the consent log it receives has no COACHING_SHARING rows; the other clients still get them', async () => {
    if (!enabled) return;
    for (const rows of [
      await old.privacy.getConsentHistory.query(),
      await old.privacy.consentLog.query(),
    ]) {
      expect(rows.some((e) => e.kind === 'COACHING_SHARING')).toBe(false);
      expect(rows.length).toBeGreaterThan(0);
    }
    const six = await client.api.privacy.getConsentHistory.query();
    expect(six.some((e) => e.kind === 'COACHING_SHARING' && e.granted)).toBe(true);
  });

  it('a level-0 client (no header at all) is treated the same way', async () => {
    if (!enabled) return;
    const zero = await clientAtLevel(client, 0);
    const boot = await zero.gym.bootstrap.query({ today: TODAY });
    for (const key of NEW_KEYS) expect(keyPaths(boot)).not.toContain(key);
    expect(
      (await zero.privacy.getConsentHistory.query()).some((e) => e.kind === 'COACHING_SHARING'),
    ).toBe(false);
  });
});
