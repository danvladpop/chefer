import { beforeAll, describe, expect, it } from 'vitest';
import {
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  trainerWithInvite,
} from './coaching-helpers';

// Lane K4: "client went quiet" against the real API + Postgres. With the trainer's N = 1, a client who
// joined yesterday and logged nothing is quiet today; the Today badge counts them until the trainer
// looks (markSeen); a SHARED food log counts as activity, an unshared one never does.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[coaching-quiet.contract] ${NO_COACHING_MESSAGE}`);
});

const YESTERDAY = (() => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

describe('went quiet', { timeout: 60_000 }, () => {
  it('N days with nothing logged; the badge clears once seen; only a SHARED food log counts', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'q-trainer', apiLevel: 8 });
    const client = await makeCoachUser({ prefix: 'q-client', apiLevel: 8, gymSetup: true });
    const invite = await trainerWithInvite(trainer);
    // The client's own calendar says they joined yesterday (the API accepts ±1 day).
    await client.api.coaching.join.mutate({ code: invite.code, localDate: YESTERDAY });
    expect(await trainer.api.trainer.alerts.config.query()).toEqual({
      quietAfterDays: 3,
      digestEmail: false,
    });
    const rowOf = async () =>
      (await trainer.api.trainer.clients.list.query({ today: TODAY })).find(
        (r) => r.clientId === client.id,
      );
    // Default N = 3: one quiet day is not enough.
    expect(await rowOf()).toMatchObject({ quiet: false, quietDays: 1 });

    await trainer.api.trainer.alerts.saveConfig.mutate({ quietAfterDays: 1, digestEmail: false });
    expect(await rowOf()).toMatchObject({ quiet: true, quietDays: 1, lastActivityDate: null });
    expect((await trainer.api.trainer.badges.query({ today: TODAY })).quietClients).toBe(1);
    const summary = await trainer.api.trainer.dashboard.summary.query({ today: TODAY });
    expect(summary.quietAfterDays).toBe(1);
    expect(summary.quietClients.map((q) => q.clientId)).toContain(client.id);

    // The trainer looks at Today: the badge starts over (the client stays quiet).
    await trainer.api.trainer.quiet.markSeen.mutate();
    expect((await trainer.api.trainer.badges.query({ today: TODAY })).quietClients).toBe(0);

    // An unshared food log never counts (and the trainer never learns of it).
    await client.api.tracker.logCustomMeal.mutate({
      date: TODAY,
      name: 'Toast',
      estimatedBy: 'manual',
      mealType: 'breakfast',
      kcal: 300,
    });
    expect(await rowOf()).toMatchObject({ quiet: true, lastActivityDate: null });

    // Shared, it is activity.
    await client.api.coaching.setSharing.mutate({ food: true });
    expect(await rowOf()).toMatchObject({ quiet: false, quietDays: 0, lastActivityDate: TODAY });
  });
});
