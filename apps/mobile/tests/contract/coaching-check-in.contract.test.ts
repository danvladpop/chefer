import { beforeAll, describe, expect, it } from 'vitest';
import { CHECK_IN_COPY } from '@chefer/types';
import {
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  trainerWithInvite,
} from './coaching-helpers';

// Lane K3: the weekly check-in end to end against the real API + Postgres. The trainer turns it on for
// TODAY's weekday; a client who joined today sees it open, answers it, can change the answers; the
// trainer reads them only while the coaching is ACTIVE. Skipped when coaching is off on the API.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[coaching-check-in.contract] ${NO_COACHING_MESSAGE}`);
});

/** 0 = Monday … 6 = Sunday for a `YYYY-MM-DD`. */
const weekdayOf = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

describe('weekly check-ins', { timeout: 60_000 }, () => {
  it('off → nothing open; on → open today; answered, changed, read by the trainer; gone after leave', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'ci-trainer', apiLevel: 8 });
    const client = await makeCoachUser({ prefix: 'ci-client', apiLevel: 8, gymSetup: true });
    const invite = await trainerWithInvite(trainer);
    await client.api.coaching.join.mutate({ code: invite.code, localDate: TODAY });

    // Off by default: nothing to answer.
    expect(await client.api.coaching.checkIn.current.query({ today: TODAY })).toBeNull();
    expect(await trainer.api.trainer.checkIns.config.query()).toMatchObject({ enabled: false });

    await trainer.api.trainer.checkIns.saveConfig.mutate({
      enabled: true,
      day: weekdayOf(TODAY),
      questions: ['ENERGY', 'ADHERENCE'],
    });
    const open = await client.api.coaching.checkIn.current.query({ today: TODAY });
    expect(open).toMatchObject({
      periodStart: TODAY,
      questions: ['ENERGY', 'ADHERENCE'],
      answered: null,
    });

    // Every question 1–5, for the open period only.
    await expect(
      client.api.coaching.checkIn.submit.mutate({
        today: TODAY,
        periodStart: TODAY,
        answers: { ENERGY: 4 },
      }),
    ).rejects.toMatchObject({ message: CHECK_IN_COPY.client.needsAll });
    await client.api.coaching.checkIn.submit.mutate({
      today: TODAY,
      periodStart: TODAY,
      answers: { ENERGY: 4, ADHERENCE: 2 },
      note: 'Travelled midweek',
    });
    await client.api.coaching.checkIn.submit.mutate({
      today: TODAY,
      periodStart: TODAY,
      answers: { ENERGY: 4, ADHERENCE: 3 },
    });

    const read = await trainer.api.trainer.client.checkIns.query({
      clientId: client.id,
      today: TODAY,
    });
    expect(read).toMatchObject({ enabled: true, current: { periodStart: TODAY, answered: true } });
    expect(read.items).toHaveLength(1);
    expect(read.items[0]).toMatchObject({ answers: { ENERGY: 4, ADHERENCE: 3 }, note: null });

    // Another trainer never reads them; after the client leaves, neither does this one.
    const stranger = await makeCoachUser({ prefix: 'ci-stranger', apiLevel: 8 });
    await stranger.api.trainer.activate.mutate({ displayName: 'Ion' });
    await expect(
      stranger.api.trainer.client.checkIns.query({ clientId: client.id, today: TODAY }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    await client.api.coaching.leave.mutate();
    await expect(
      trainer.api.trainer.client.checkIns.query({ clientId: client.id, today: TODAY }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    expect(await client.api.coaching.checkIn.current.query({ today: TODAY })).toBeNull();
  });
});
