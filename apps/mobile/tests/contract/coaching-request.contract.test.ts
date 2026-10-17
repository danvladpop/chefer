import { beforeAll, describe, expect, it } from 'vitest';
import {
  COACHING_API_LEVEL,
  routineChangesLine,
  type CoachingNoticeDto,
  type TrainerRoutineDto,
} from '@chefer/types';
import {
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  type CoachApi,
} from './coaching-helpers';

// PRD 2026-10 §4.1–4.3, what the mobile Find a trainer / Requests / notices screens rely on:
// find by name → the trainer's card → "Ask to coach me" (requestCoaching with the device-local day) →
// the pending request on Your trainer → the trainer's Requests → Accept → coaching.status names the
// trainer; and after a trainer save, the client's unread ROUTINE_UPDATED notice with its changes, which
// Dismiss marks read. Skipped when coaching is off on the API.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[coaching-request.contract] ${NO_COACHING_MESSAGE}`);
});

const LETTERS = 'bcdfghjklmnpqrstvwxz';
function uniqueName(prefix: string): string {
  let out = prefix;
  for (let i = 0; i < 6; i += 1) out += LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
  return out;
}

/** The trainer's save that the client's notice reports: one more set on the first row. */
async function trainerAddsASet(trainer: CoachApi, clientId: string): Promise<void> {
  const routine: TrainerRoutineDto | null = await trainer.trainer.client.routine.query({
    clientId,
    today: TODAY,
  });
  if (!routine) throw new Error('the client has no routine');
  const first = routine.days[0]?.exercises[0];
  if (!first) throw new Error('the routine has no exercise');
  await trainer.trainer.client.saveRoutine.mutate({
    clientId,
    expectedVersion: routine.version,
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
          sets: e.id === first.id ? Math.min(10, e.sets + 1) : e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          trainerNote: e.trainerNote,
        })),
      })),
    },
  });
}

const unread = (list: CoachingNoticeDto[], kind: CoachingNoticeDto['kind']) =>
  list.filter((n) => n.kind === kind && !n.read);

describe(`coaching requests and notices at level ${COACHING_API_LEVEL}`, () => {
  it('find → card → request → Requests → accept → status; then a trainer save becomes a notice', async () => {
    if (!enabled) return;
    const trainerName = uniqueName('Ana');
    const trainer = await makeCoachUser({ prefix: 'creq-trainer', firstName: trainerName });
    const activated = await trainer.api.trainer.activate.mutate({
      displayName: trainerName,
      gymLine: 'Iron Gym, Cluj',
    });
    expect(activated).toMatchObject({ active: true, gymLine: 'Iron Gym, Cluj' });
    const client = await makeCoachUser({
      prefix: 'creq-client',
      firstName: 'Maria',
      gymSetup: true,
    });

    // Find a trainer: by name, with the gym line and room for clients.
    const found = await client.api.coaching.findTrainers.query({ query: trainerName });
    const row = found.items.find((t) => t.trainerId === trainer.id);
    expect(row).toEqual({
      trainerId: trainer.id,
      name: trainerName,
      gymLine: 'Iron Gym, Cluj',
      acceptingClients: true,
    });

    // The card before asking.
    expect(await client.api.coaching.trainerCard.query({ trainerId: trainer.id })).toMatchObject({
      relation: 'NONE',
      currentTrainerName: null,
      pendingRequestTo: null,
      needsGymSetup: false,
    });

    // "Ask to coach me" from the consent screen, with the device-local day.
    const request = await client.api.coaching.requestCoaching.mutate({
      trainerId: trainer.id,
      localDate: TODAY,
    });
    expect(request.trainer).toEqual({ id: trainer.id, name: trainerName });
    expect(typeof request.expiresAt).toBe('string');
    const pending = await client.api.coaching.status.query();
    expect(pending.trainer).toBeNull();
    expect(pending.request?.id).toBe(request.id);
    expect((await client.api.coaching.trainerCard.query({ trainerId: trainer.id })).relation).toBe(
      'REQUESTED',
    );

    // The trainer's Requests and the REQUEST_RECEIVED notice.
    const requests = await trainer.api.trainer.requests.list.query();
    const mine = requests.find((r) => r.id === request.id);
    expect(mine).toMatchObject({ client: { id: client.id }, hasTrainer: false });
    const trainerNotices = await trainer.api.coaching.notices.query();
    expect(unread(trainerNotices, 'REQUEST_RECEIVED')[0]?.other).toMatchObject({
      id: client.id,
      role: 'CLIENT',
    });

    // Accept: coaching starts, the client hears so, the trainer counts one client.
    expect(await trainer.api.trainer.requests.accept.mutate({ requestId: request.id })).toEqual({
      ok: true,
      clientId: client.id,
    });
    const coached = await client.api.coaching.status.query();
    expect(coached.trainer?.name).toBe(trainerName);
    expect(coached.request ?? null).toBeNull();
    expect(
      unread(await client.api.coaching.notices.query(), 'REQUEST_ACCEPTED')[0]?.other,
    ).toMatchObject({ id: trainer.id, name: trainerName, role: 'TRAINER' });
    expect((await trainer.api.trainer.status.query()).activeClients).toBe(1);
    expect((await client.api.coaching.trainerCard.query({ trainerId: trainer.id })).relation).toBe(
      'YOUR_TRAINER',
    );

    // A trainer save → the client's "<Trainer> updated your routine" card with what changed.
    await trainerAddsASet(trainer.api, client.id);
    const updated = unread(await client.api.coaching.notices.query(), 'ROUTINE_UPDATED');
    expect(updated).toHaveLength(1);
    const card = updated[0];
    if (!card) throw new Error('no ROUTINE_UPDATED notice');
    expect(card.other).toMatchObject({ id: trainer.id, name: trainerName, role: 'TRAINER' });
    expect(card.changes?.length).toBeGreaterThan(0);
    expect(card.changes?.[0]?.kind).toBe('changed');
    expect(routineChangesLine(card.changes ?? [])).toMatch(/→/);

    // The row stamps still name the trainer (current trainer: not "former").
    const boot = await client.api.gym.bootstrap.query({ today: TODAY });
    expect(boot.activeRoutine?.lastEditedByOther?.name).toBe(trainerName);
    expect(boot.activeRoutine?.lastEditedByOther?.former ?? false).toBe(false);

    // Dismiss marks it read for every device.
    expect(await client.api.coaching.dismissNotice.mutate({ id: card.id })).toEqual({ ok: true });
    expect(unread(await client.api.coaching.notices.query(), 'ROUTINE_UPDATED')).toHaveLength(0);
  });

  it('Cancel request clears the pending request', async () => {
    if (!enabled) return;
    const trainerName = uniqueName('Ion');
    const trainer = await makeCoachUser({ prefix: 'creq-trainer2', firstName: trainerName });
    await trainer.api.trainer.activate.mutate({ displayName: trainerName });
    const client = await makeCoachUser({ prefix: 'creq-client2', gymSetup: true });

    await client.api.coaching.requestCoaching.mutate({ trainerId: trainer.id, localDate: TODAY });
    expect((await client.api.coaching.status.query()).request?.trainer.id).toBe(trainer.id);
    expect(await client.api.coaching.cancelRequest.mutate()).toEqual({ ok: true });
    expect((await client.api.coaching.status.query()).request ?? null).toBeNull();
    expect((await trainer.api.trainer.requests.list.query()).length).toBe(0);
  });
});
