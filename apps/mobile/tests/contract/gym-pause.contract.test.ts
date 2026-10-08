import { describe, expect, it } from 'vitest';
import { addDaysLocal, pauseEndDate, pauseStartDate } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-GYM-16 (WP-12 lane B): a pause can start later than today. The bootstrap
// reports it as `upcomingPause` (additive, optional) — never as `activePause`
// until it begins — so Settings can show and cancel it instead of offering a
// second pause that would overlap.

async function registerAndSetup() {
  const { client, setToken } = makeContractClient();
  const user = await client.auth.register.mutate({
    email: uniqueEmail('gym-pause'),
    password: 'Contract@123!',
    firstName: 'Lifter',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
  await client.gym.profile.completeSetup.mutate({
    days: 3,
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: 'fb3-beginner',
    plannedWeekdays: [0, 2, 4],
    reminderTime: null,
    knownWeightsKg: {},
  });
  return client;
}

describe('pause with a start choice', () => {
  it('a pause starting tomorrow is `upcomingPause`, not `activePause`, and can be cancelled', async () => {
    const client = await registerAndSetup();
    const today = new Date().toISOString().slice(0, 10);
    const startDate = pauseStartDate('tomorrow', today);
    const endDate = pauseEndDate(startDate, 1);

    const { id } = await client.gym.pause.create.mutate({ startDate, endDate, reason: 'vacation' });
    const during = await client.gym.bootstrap.query({ today });
    expect(during.activePause).toBeNull();
    expect(during.upcomingPause).toEqual({ id, startDate, endDate, reason: 'vacation' });
    expect(endDate).toBe(addDaysLocal(startDate, 6));

    // Cancelling a pause that has not started removes it.
    await client.gym.pause.end.mutate({ id });
    const after = await client.gym.bootstrap.query({ today });
    expect(after.upcomingPause).toBeNull();
    expect(after.activePause).toBeNull();
  });

  it('a pause that starts today is active, with no upcomingPause', async () => {
    const client = await registerAndSetup();
    const today = new Date().toISOString().slice(0, 10);
    const { id } = await client.gym.pause.create.mutate({
      startDate: today,
      endDate: pauseEndDate(today, 1),
      reason: null,
    });
    const b = await client.gym.bootstrap.query({ today });
    expect(b.activePause?.id).toBe(id);
    expect(b.upcomingPause).toBeNull();
  });
});
