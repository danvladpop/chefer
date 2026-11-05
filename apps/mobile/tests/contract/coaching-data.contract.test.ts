import { beforeAll, describe, expect, it } from 'vitest';
import { COACHING_COPY, coachingConsentLabel } from '@chefer/types';
import {
  keyPaths,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  TODAY,
  trainerWithInvite,
  type CoachApi,
  type CoachUser,
} from './coaching-helpers';

// Lane K1 (market review 2026-10): a trainer can NEVER read a client's food log or weight without the
// matching, ACTIVE opt-in — not before it, not after a revoke, not after the coaching ends, and not in
// a new coaching with the same trainer until the client opts in again. Every denial is the one uniform
// NOT_FOUND "This client isn't available". Against the real API and Postgres; skipped when coaching is off.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[coaching-data.contract] ${NO_COACHING_MESSAGE}`);
});

type Outcome = 'allowed' | 'denied';

async function outcome(read: () => Promise<unknown>): Promise<Outcome> {
  try {
    await read();
    return 'allowed';
  } catch (err) {
    const e = err as { data?: { code?: string }; message?: string };
    expect(e.data?.code).toBe('NOT_FOUND');
    expect(e.message).toBe(COACHING_COPY.server.clientUnavailable);
    return 'denied';
  }
}

async function access(trainer: CoachApi, clientId: string) {
  return {
    food: await outcome(() => trainer.trainer.client.food.query({ clientId, today: TODAY })),
    weight: await outcome(() => trainer.trainer.client.weight.query({ clientId, today: TODAY })),
  };
}

/** A client with a weigh-in and a logged meal, coached by a fresh trainer. */
async function coachedPair(share?: { food: boolean; weight: boolean }) {
  const trainer = await makeCoachUser({ prefix: 'cd-trainer', apiLevel: 8 });
  const client = await makeCoachUser({ prefix: 'cd-client', apiLevel: 8, gymSetup: true });
  await client.api.tracker.logWeight.mutate({ weightKg: 81.4, date: TODAY });
  await client.api.tracker.logCustomMeal.mutate({
    date: TODAY,
    name: 'Contract shawarma',
    estimatedBy: 'manual',
    mealType: 'lunch',
    kcal: 700,
    protein: 35,
    carbs: 60,
    fat: 25,
  });
  const invite = await trainerWithInvite(trainer);
  await client.api.coaching.join.mutate({ code: invite.code, ...(share && { share }) });
  return { trainer, client };
}

async function sharingRows(client: CoachUser) {
  const rows = await client.api.privacy.getConsentHistory.query();
  return rows
    .filter((r) => r.kind === 'COACHING_SHARING' && r.providers.length > 0)
    .map((r) => ({ data: r.providers[0], granted: r.granted }));
}

describe(
  'food and weight sharing: the trainer reads only what the client shares, while they share it',
  { timeout: 60_000 },
  () => {
    it('both off by default: a join without choices shares nothing', async () => {
      if (!enabled) return;
      const { trainer, client } = await coachedPair();
      expect(await access(trainer.api, client.id)).toEqual({ food: 'denied', weight: 'denied' });
      // Training is still visible (the coaching itself works).
      await expect(
        trainer.api.trainer.client.overview.query({ clientId: client.id, today: TODAY }),
      ).resolves.toMatchObject({ client: { sharing: { food: false, weight: false } } });
      expect(await sharingRows(client)).toEqual([]);
    });

    it('grant at join → visible; revoke → hidden at once; each switch on its own; every change logged', async () => {
      if (!enabled) return;
      const { trainer, client } = await coachedPair({ food: true, weight: false });
      expect(await access(trainer.api, client.id)).toEqual({ food: 'allowed', weight: 'denied' });

      const food = await trainer.api.trainer.client.food.query({
        clientId: client.id,
        today: TODAY,
      });
      const today = food.days.at(-1);
      expect(today).toMatchObject({ date: TODAY, mealsLogged: 1, kcal: 700, proteinG: 35 });
      expect(today?.entries[0]).toMatchObject({ name: 'Contract shawarma', onPlan: false });
      // Never: allergies, diet settings, carbs, fat, photos, notes.
      const keys = keyPaths(food).join(' ');
      expect(keys).not.toMatch(/allerg|diet|carbs|fat\b|photo|note/i);

      await client.api.coaching.setSharing.mutate({ weight: true });
      expect(await access(trainer.api, client.id)).toEqual({ food: 'allowed', weight: 'allowed' });
      const weight = await trainer.api.trainer.client.weight.query({
        clientId: client.id,
        today: TODAY,
      });
      expect(weight.entries).toEqual([{ date: TODAY, weightKg: 81.4 }]);

      const status = await client.api.coaching.setSharing.mutate({ food: false });
      expect(status).toMatchObject({ food: false, weight: true, foodSince: null });
      expect(await access(trainer.api, client.id)).toEqual({ food: 'denied', weight: 'allowed' });

      expect(await sharingRows(client)).toEqual([
        // Newest first.
        { data: 'FOOD', granted: false },
        { data: 'WEIGHT', granted: true },
        { data: 'FOOD', granted: true },
      ]);
      const labels = (await client.api.privacy.getConsentHistory.query())
        .map(coachingConsentLabel)
        .filter((l) => l !== null);
      expect(labels).toContain('Food log no longer shared');
    });

    it('a repeated switch is a no-op: no duplicate consent rows', async () => {
      if (!enabled) return;
      const { client } = await coachedPair();
      await client.api.coaching.setSharing.mutate({ food: true });
      await client.api.coaching.setSharing.mutate({ food: true });
      expect(await sharingRows(client)).toEqual([{ data: 'FOOD', granted: true }]);
    });

    it('the end of the coaching ends the sharing; a new coaching with the same trainer starts with both off', async () => {
      if (!enabled) return;
      const { trainer, client } = await coachedPair({ food: true, weight: true });
      expect(await access(trainer.api, client.id)).toEqual({ food: 'allowed', weight: 'allowed' });

      await client.api.coaching.leave.mutate();
      expect(await access(trainer.api, client.id)).toEqual({ food: 'denied', weight: 'denied' });
      expect((await sharingRows(client)).slice(0, 2)).toEqual(
        expect.arrayContaining([
          { data: 'FOOD', granted: false },
          { data: 'WEIGHT', granted: false },
        ]),
      );
      // Nothing to switch without a coaching.
      await expect(client.api.coaching.setSharing.mutate({ food: true })).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
      });

      const again = await trainer.api.trainer.invites.create.mutate({ label: 'Back again' });
      await client.api.coaching.join.mutate({ code: again.code });
      expect(await access(trainer.api, client.id)).toEqual({ food: 'denied', weight: 'denied' });
    });

    it('the trainer removing the client, or turning trainer tools off, ends it too', async () => {
      if (!enabled) return;
      const removed = await coachedPair({ food: true, weight: true });
      await removed.trainer.api.trainer.clients.remove.mutate({ clientId: removed.client.id });
      expect(await access(removed.trainer.api, removed.client.id)).toEqual({
        food: 'denied',
        weight: 'denied',
      });

      const stopped = await coachedPair({ food: true, weight: true });
      await stopped.trainer.api.trainer.deactivate.mutate();
      await stopped.trainer.api.trainer.activate.mutate({ displayName: 'Ana' });
      expect(await access(stopped.trainer.api, stopped.client.id)).toEqual({
        food: 'denied',
        weight: 'denied',
      });
    });

    it('another trainer never reads it: sharing is with this coaching only', async () => {
      if (!enabled) return;
      const { client } = await coachedPair({ food: true, weight: true });
      const stranger = await makeCoachUser({ prefix: 'cd-stranger', apiLevel: 8 });
      await stranger.api.trainer.activate.mutate({ displayName: 'Ion' });
      expect(await access(stranger.api, client.id)).toEqual({ food: 'denied', weight: 'denied' });
    });

    it('a coaching request carries the choices, applied when the trainer accepts', async () => {
      if (!enabled) return;
      const trainer = await makeCoachUser({ prefix: 'cd-req-trainer', apiLevel: 8 });
      await trainer.api.trainer.activate.mutate({ displayName: 'Mihai' });
      const client = await makeCoachUser({ prefix: 'cd-req-client', apiLevel: 8, gymSetup: true });
      const request = await client.api.coaching.requestCoaching.mutate({
        trainerId: trainer.id,
        share: { food: false, weight: true },
      });
      // Pending: no coaching yet, so nothing is readable.
      expect(await access(trainer.api, client.id)).toEqual({ food: 'denied', weight: 'denied' });
      await trainer.api.trainer.requests.accept.mutate({ requestId: request.id });
      expect(await access(trainer.api, client.id)).toEqual({ food: 'denied', weight: 'allowed' });
      const status = await client.api.coaching.status.query();
      expect(status.trainer?.sharing).toMatchObject({ food: false, weight: true });
    });

    it('the weekly card (lane K2) carries food and weight only while they are shared', async () => {
      if (!enabled) return;
      const { trainer, client } = await coachedPair({ food: true, weight: false });
      const week = () =>
        trainer.api.trainer.client.weekSummary.query({ clientId: client.id, today: TODAY });
      const shared = await week();
      expect(shared.sharing).toEqual({ food: true, weight: false });
      expect(shared.food).toMatchObject({ daysLogged: 1, mealsLogged: 1, avgKcal: 700 });
      expect(shared.weight).toBeNull();

      await client.api.coaching.setSharing.mutate({ food: false });
      const hidden = await week();
      expect(hidden).toMatchObject({ food: null, weight: null });
      expect(keyPaths(hidden).join(' ')).not.toMatch(/kcal|protein|weightKg/i);
    });
  },
);
