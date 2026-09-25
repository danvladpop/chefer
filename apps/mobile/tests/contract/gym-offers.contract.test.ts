import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addDaysLocal, startSession, workoutReducer } from '@chefer/utils';
import { makeContractClient, uniqueEmail } from './client';

// Comeback + deload offers end to end (gym_plan.md §7 Wave 4 "G4-A" acceptance:
// "Verify that the comeback offer, and a deload offer after startDeload, work
// end to end. nextWorkout.isDeload must become true and the workout must show
// deload targets."). See the G4-A handoff for what this uncovered.

async function registerAndSetup() {
  const { client, setToken } = makeContractClient();
  const user = await client.auth.register.mutate({
    email: uniqueEmail('gym-offers'),
    password: 'Contract@123!',
    firstName: 'Lifter',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
  const setup = await client.gym.profile.completeSetup.mutate({
    days: 4,
    experience: 'INTERMEDIATE',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: 'ul4-intermediate',
    plannedWeekdays: [0, 1, 3, 4],
    reminderTime: null,
    knownWeightsKg: { 'barbell-bench-press': 60 },
  });
  return { client, setup };
}

describe('deload offer end to end', () => {
  it('startDeload flips nextWorkout.isDeload and prescribes deload targets (half sets, ~90% load, reps at the floor)', async () => {
    const { client } = await registerAndSetup();
    const today = new Date().toISOString().slice(0, 10);

    const before = await client.gym.bootstrap.query({ today });
    const bench0 = before.nextWorkout?.exercises.find(
      (e) => e.exerciseId === 'barbell-bench-press',
    );
    if (!bench0) throw new Error('barbell-bench-press is not in the first prescribed day');
    expect(before.nextWorkout?.isDeload).toBe(false);

    await client.gym.progression.startDeload.mutate();
    const after = await client.gym.bootstrap.query({ today });

    // 1. nextWorkout.isDeload must become true.
    expect(after.nextWorkout?.isDeload).toBe(true);

    // 2. The workout must show deload targets, not the normal prescription.
    const bench1 = after.nextWorkout?.exercises.find((e) => e.exerciseId === 'barbell-bench-press');
    expect(bench1?.suggestion.reasonCode).toBe('DELOAD');
    expect(bench1?.suggestion.sets).toBe(Math.ceil(bench0.suggestion.sets / 2));
    expect(bench1?.suggestion.reps.every((r) => r === bench1.repMin)).toBe(true);
    expect(bench1?.suggestion.weightKg).toBeLessThan(bench0.suggestion.weightKg);

    // 3. The offer itself is gone once a deload is running (it isn't offered twice).
    expect(after.offers.some((o) => o.kind === 'deload')).toBe(false);
  });
});

describe('comeback offer end to end', () => {
  it('offers a comeback more than 8 days after the last session, keyed by that session — and never before', async () => {
    const { client } = await registerAndSetup();
    const boot = await client.gym.bootstrap.query({ today: new Date().toISOString().slice(0, 10) });
    const next = boot.nextWorkout;
    if (!next) throw new Error('no next workout after setup');

    // Log one completed session "today" (real time) — the client can send
    // whatever device-local `today` it wants for LATER bootstrap queries, so
    // the 8-day gap below is simulated without waiting real time.
    const lastSessionDate = new Date().toISOString().slice(0, 10);
    const startedAt = `${lastSessionDate}T09:00:00.000Z`;
    let doc = startSession({
      id: randomUUID(),
      newId: randomUUID,
      now: startedAt,
      localDate: lastSessionDate,
      routineId: next.routineId,
      routineDayId: next.dayId,
      name: next.dayName,
      isDeload: false,
      exercises: next.exercises,
    });
    for (const se of doc.exercises) {
      for (const set of se.sets) {
        doc = workoutReducer(doc, {
          type: 'completeSet',
          seId: se.id,
          setId: set.id,
          at: startedAt,
        });
      }
    }
    doc = workoutReducer(doc, { type: 'finish', at: startedAt });
    const res = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results[0]?.status).toBe('applied');

    // Just 3 days later: no comeback yet (research §4.2 #6 — one missed
    // session changes nothing; COMEBACK_AFTER_DAYS is 8).
    const soon = addDaysLocal(lastSessionDate, 3);
    const bootSoon = await client.gym.bootstrap.query({ today: soon });
    expect(bootSoon.offers.some((o) => o.kind === 'comeback')).toBe(false);

    // 9 days later: the comeback offer appears, keyed by the last session.
    const later = addDaysLocal(lastSessionDate, 9);
    const bootLater = await client.gym.bootstrap.query({ today: later });
    expect(bootLater.offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'comeback', key: `comeback:${lastSessionDate}` }),
      ]),
    );
  });
});
