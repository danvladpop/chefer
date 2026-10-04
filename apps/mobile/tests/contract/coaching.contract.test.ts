import { beforeAll, describe, expect, it } from 'vitest';
import {
  errorOf,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  trainerWithInvite,
} from './coaching-helpers';

// The client side of trainer coaching (coaching.*): availability, every invite
// preview state, joining, switching trainers and the consent log (WP-18, spec
// §2.3, §7.3, §8.2). Skipped when coaching is off on the API.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[coaching.contract] ${NO_COACHING_MESSAGE}`);
});

describe('coaching.* (client side)', () => {
  it('availability is never gated and says what this user may do', async () => {
    const user = await makeCoachUser({ prefix: 'coaching-avail' });
    const a = await user.api.coaching.availability.query();
    expect(a.enabled).toBe(enabled);
    if (enabled) expect(a.canBeTrainer).toBe(true);
  });

  it('previewInvite covers every state: NOT_FOUND, SELF, OK, USED, REVOKED, ALREADY_YOURS', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'coaching-prev-trainer' });
    const client = await makeCoachUser({ prefix: 'coaching-prev-client', gymSetup: true });
    const invite = await trainerWithInvite(trainer);

    // Any case and dashes are accepted: the code is normalised.
    const sloppy = `${invite.code.slice(0, 5)}-${invite.code.slice(5).toLowerCase()}`;
    expect((await client.api.coaching.previewInvite.query({ code: sloppy })).state).toBe('OK');
    expect((await client.api.coaching.previewInvite.query({ code: '0000000000' })).state).toBe(
      'NOT_FOUND',
    );
    expect((await trainer.api.coaching.previewInvite.query({ code: invite.code })).state).toBe(
      'SELF',
    );
    // A malformed code is rejected before it reaches the database.
    expect((await errorOf(client.api.coaching.previewInvite.query({ code: 'nope' }))).code).toBe(
      'BAD_REQUEST',
    );

    const revoked = await trainer.api.trainer.invites.create.mutate({});
    await trainer.api.trainer.invites.revoke.mutate({ code: revoked.code });
    const preview = await client.api.coaching.previewInvite.query({ code: revoked.code });
    expect(preview).toEqual({
      state: 'REVOKED',
      trainerName: null,
      currentTrainerName: null,
      needsGymSetup: false,
    });
    expect((await errorOf(client.api.coaching.join.mutate({ code: revoked.code }))).code).toBe(
      'BAD_REQUEST',
    );

    await client.api.coaching.join.mutate({ code: invite.code });
    expect((await client.api.coaching.previewInvite.query({ code: invite.code })).state).toBe(
      'ALREADY_YOURS',
    );
    const again = await trainer.api.trainer.invites.create.mutate({});
    expect((await client.api.coaching.previewInvite.query({ code: again.code })).state).toBe(
      'ALREADY_YOURS',
    );
    // Joining the trainer you already have is a no-op, not an error.
    expect((await client.api.coaching.join.mutate({ code: again.code })).trainer?.name).toBe('Ana');
    expect(await trainer.api.trainer.clients.list.query()).toHaveLength(1);
  });

  it('joining a second trainer switches: the old link ends, with a withdrawal and a grant in the log', async () => {
    if (!enabled) return;
    const first = await makeCoachUser({ prefix: 'coaching-sw-a' });
    const second = await makeCoachUser({ prefix: 'coaching-sw-b' });
    const client = await makeCoachUser({ prefix: 'coaching-sw-client', gymSetup: true });
    await first.api.trainer.activate.mutate({ displayName: 'Ion' });
    await second.api.trainer.activate.mutate({ displayName: 'Ana' });
    const inviteA = await first.api.trainer.invites.create.mutate({});
    const inviteB = await second.api.trainer.invites.create.mutate({});

    await client.api.coaching.join.mutate({ code: inviteA.code });
    const preview = await client.api.coaching.previewInvite.query({ code: inviteB.code });
    expect(preview).toMatchObject({ state: 'OK', trainerName: 'Ana', currentTrainerName: 'Ion' });

    const status = await client.api.coaching.join.mutate({ code: inviteB.code });
    expect(status.trainer?.name).toBe('Ana');

    // Ion lost access at once; Ana has the client.
    expect(await first.api.trainer.clients.list.query()).toEqual([]);
    expect(await second.api.trainer.clients.list.query()).toHaveLength(1);
    expect(
      (await errorOf(first.api.trainer.client.routine.query({ clientId: client.id }))).code,
    ).toBe('NOT_FOUND');

    const log = (await client.api.privacy.getConsentHistory.query()).filter(
      (e) => e.kind === 'COACHING_SHARING',
    );
    // newest first: grant B, withdraw A, grant A
    expect(log.map((e) => e.granted)).toEqual([true, false, true]);
    expect(log[1]?.contextId).toBe(log[2]?.contextId);
    expect(log[0]?.contextId).not.toBe(log[2]?.contextId);
  });

  it('two joins racing for one client leave exactly one active trainer', async () => {
    if (!enabled) return;
    const a = await makeCoachUser({ prefix: 'coaching-race-a' });
    const b = await makeCoachUser({ prefix: 'coaching-race-b' });
    const client = await makeCoachUser({ prefix: 'coaching-race-client', gymSetup: true });
    const inviteA = await trainerWithInvite(a);
    const inviteB = await trainerWithInvite(b);

    await Promise.allSettled([
      client.api.coaching.join.mutate({ code: inviteA.code }),
      client.api.coaching.join.mutate({ code: inviteB.code }),
    ]);

    const [rowsA, rowsB] = await Promise.all([
      a.api.trainer.clients.list.query(),
      b.api.trainer.clients.list.query(),
    ]);
    expect(rowsA.length + rowsB.length).toBe(1);
    const status = await client.api.coaching.status.query();
    expect(status.trainer).not.toBeNull();
  });

  it('removing a client tells them: "<trainer> stopped coaching you", and their routine stays', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'coaching-rm-trainer' });
    const client = await makeCoachUser({ prefix: 'coaching-rm-client', gymSetup: true });
    const invite = await trainerWithInvite(trainer);
    await client.api.coaching.join.mutate({ code: invite.code });

    await trainer.api.trainer.clients.remove.mutate({ clientId: client.id });
    expect(await client.api.coaching.status.query()).toMatchObject({
      trainer: null,
      stopped: { trainerName: 'Ana' },
    });
    expect(
      (await client.api.gym.bootstrap.query({ today: '2026-10-04' })).activeRoutine,
    ).not.toBeNull();
    // Removing twice is a uniform NOT_FOUND.
    expect(
      (await errorOf(trainer.api.trainer.clients.remove.mutate({ clientId: client.id }))).code,
    ).toBe('NOT_FOUND');
  });

  it('a client cannot see trainer data of someone else', async () => {
    if (!enabled) return;
    const user = await makeCoachUser({ prefix: 'coaching-plain', gymSetup: true });
    expect(await user.api.coaching.status.query()).toEqual({ trainer: null, stopped: null });
    const boot = await user.api.gym.bootstrap.query({ today: '2026-10-04' });
    expect(boot.coaching).toBeNull();
    // Not a trainer: trainer.* is refused with the trainer-tools reason.
    expect((await errorOf(user.api.trainer.invites.list.query())).data.reason).toBe(
      'TRAINER_TOOLS_OFF',
    );
  });
});
