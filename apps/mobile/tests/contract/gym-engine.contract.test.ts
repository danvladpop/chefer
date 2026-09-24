import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { EXERCISE_BY_ID } from '@chefer/types';
import { applyFinishedSession, startSession, workoutReducer } from '@chefer/utils';
import { makeContractClient, uniqueEmail } from './client';

// Integration check for the whole progression loop (gym_plan.md G1
// integration): the SAME engine code runs on the phone (offline optimistic
// fold) and on the server (re-fold on sync), so the next prescription must
// match exactly. Uses "I know my weights" to skip calibration.

const { client, setToken } = makeContractClient();
const localDate = new Date().toISOString().slice(0, 10);
const lookup = (id: string) => EXERCISE_BY_ID.get(id);

let setup: GymBootstrap;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('gym-engine'),
    password: 'Contract@123!',
    firstName: 'Lifter',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);

  setup = await client.gym.profile.completeSetup.mutate({
    days: 4,
    experience: 'INTERMEDIATE',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: 'ul4-intermediate',
    plannedWeekdays: [0, 1, 3, 4],
    reminderTime: null,
    knownWeightsKg: { 'barbell-bench-press': 60 },
  });
});

describe('gym engine end-to-end', () => {
  it('prescribes the known weight, then +2.5 kg after all sets hit the top of the range', async () => {
    const boot = await client.gym.bootstrap.query({ today: localDate });
    const next = boot.nextWorkout;
    if (!next) throw new Error('no next workout after setup');
    expect(next.dayName).toBe('Upper A');
    const bench = next.exercises.find((e) => e.exerciseId === 'barbell-bench-press');
    expect(bench?.suggestion.weightKg).toBe(60);
    expect(bench?.warmups.length).toBeGreaterThan(0);

    // Run the session through the shared reducer exactly like the phone does.
    const t0 = Date.now() - 90 * 60_000;
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    let doc: WorkoutSessionDoc = startSession({
      id: randomUUID(),
      newId: randomUUID,
      now: at(0),
      localDate,
      routineId: next.routineId,
      routineDayId: next.dayId,
      name: next.dayName,
      isDeload: next.isDeload,
      exercises: next.exercises,
    });
    let minute = 1;
    for (const se of doc.exercises) {
      for (const set of se.sets) {
        // Bench: every working set at the TOP of 6–8. Everything else as prescribed.
        const reps = se.exerciseId === 'barbell-bench-press' && !set.isWarmup ? 8 : undefined;
        doc = workoutReducer(doc, {
          type: 'completeSet',
          seId: se.id,
          setId: set.id,
          reps,
          at: at(minute++),
        });
      }
      doc = workoutReducer(doc, { type: 'setRir', seId: se.id, rir: 2, at: at(minute++) });
    }
    doc = workoutReducer(doc, { type: 'finish', at: at(minute) });

    // Phone side: optimistic offline fold.
    const optimistic = applyFinishedSession({
      bootstrap: boot,
      doc,
      lookup,
      facts: { experience: 'INTERMEDIATE', ageYears: null },
      today: localDate,
    });

    const res = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results[0]?.status).toBe('applied');
    const server = await client.gym.bootstrap.query({ today: localDate });

    const pick = (b: GymBootstrap) =>
      b.progressions.find((p) => p.exerciseId === 'barbell-bench-press')?.suggestion;
    const serverBench = pick(server);
    expect(serverBench?.weightKg).toBe(62.5);
    expect(serverBench?.reasonCode).toBe('TOP_OF_RANGE');
    // Same deterministic engine on both sides → identical decision.
    expect(pick(optimistic)?.weightKg).toBe(serverBench?.weightKg);
    expect(pick(optimistic)?.reps).toEqual(serverBench?.reps);
    expect(optimistic.activeRoutine?.nextDayId).toBe(server.activeRoutine?.nextDayId);
    expect(optimistic.nextWorkout?.dayName).toBe('Lower A');
    expect(server.nextWorkout?.dayName).toBe('Lower A');
  });
});
