import { beforeAll, describe, expect, it } from 'vitest';
import {
  errorOf,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  trainerWithInvite,
} from './coaching-helpers';

// Trainer mode M1 through the real API (docs/prd-2026-10/trainer-mode.md §6.1, §7.1, §9):
// trainer.badges and trainer.dashboard.summary, what the trainer Today, the Clients tab
// badge and personal mode's "Switch to trainer mode" badge read. A request shows up in
// both within one call; accepting it moves the client into the summary.
// Skipped when coaching is off on the API.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[trainer-mode.contract] ${NO_COACHING_MESSAGE}`);
});

describe('trainer mode: badges and Today summary', () => {
  it('a non-trainer gets FORBIDDEN TRAINER_TOOLS_OFF from both', async () => {
    if (!enabled) return;
    const user = await makeCoachUser({ prefix: 'tmode-none' });
    for (const call of [
      user.api.trainer.badges.query(),
      user.api.trainer.dashboard.summary.query({ today: TODAY }),
    ]) {
      const err = await errorOf(call);
      expect(err.code).toBe('FORBIDDEN');
      expect(err.data.reason).toBe('TRAINER_TOOLS_OFF');
    }
  });

  it('a brand-new trainer: zero badges and an empty summary', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'tmode-new' });
    await trainer.api.trainer.activate.mutate({ displayName: 'Ana' });
    expect(await trainer.api.trainer.badges.query()).toEqual({
      requests: 0,
      unmarkedAttendance: 0,
      bookingChanges: 0,
      total: 0,
      // Lane K4 (additive): quiet clients since the trainer last looked; never in `total`.
      quietClients: 0,
    });
    expect(await trainer.api.trainer.dashboard.summary.query({ today: TODAY })).toEqual({
      activeClients: 0,
      maxClients: 50,
      requestsWaiting: 0,
      averageAdherence: null,
      quietClients: [],
      // Trainer mode M3: the booking parts, empty for a brand-new trainer.
      bookingsThisWeek: { scheduled: 0, done: 0 },
      nextBooking: null,
      todayBookings: [],
      unmarkedAttendance: [],
      sessionsDelivered: [],
      // Lane K4 (additive): the trainer's "went quiet" threshold (default 3).
      quietAfterDays: 3,
    });
  });

  it('a request badges at once; accepting it makes an active (quiet) client', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'tmode-trainer', firstName: 'Anatm' });
    await trainer.api.trainer.activate.mutate({ displayName: 'Anatm' });
    const client = await makeCoachUser({
      prefix: 'tmode-client',
      firstName: 'Maria',
      gymSetup: true,
    });
    const request = await client.api.coaching.requestCoaching.mutate({
      trainerId: trainer.id,
      localDate: TODAY,
    });

    expect(await trainer.api.trainer.badges.query()).toMatchObject({ requests: 1, total: 1 });
    expect(await trainer.api.trainer.dashboard.summary.query({ today: TODAY })).toMatchObject({
      activeClients: 0,
      requestsWaiting: 1,
    });

    await trainer.api.trainer.requests.accept.mutate({ requestId: request.id });
    expect((await trainer.api.trainer.badges.query()).requests).toBe(0);

    const summary = await trainer.api.trainer.dashboard.summary.query({ today: TODAY });
    const list = await trainer.api.trainer.clients.list.query({ today: TODAY });
    // The numbers match the Clients tab's own list.
    expect(summary.activeClients).toBe(list.length);
    expect(summary.requestsWaiting).toBe(0);
    // A client with no workout yet and a weekly goal: adherence 0, not quiet on day one.
    expect(summary.averageAdherence).toBe(0);
    expect(summary.quietClients).toEqual([]);
  });

  it('a malformed day is a BAD_REQUEST', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'tmode-bad' });
    await trainerWithInvite(trainer);
    const { api } = trainer;
    const err = await errorOf(api.trainer.dashboard.summary.query({ today: '18/10/2026' }));
    expect(err.code).toBe('BAD_REQUEST');
  });
});
