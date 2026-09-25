import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { makeContractClient, uniqueEmail } from './client';

// gym.* contract (gym_plan.md §4 / §5.2) against the REAL API through the
// app's link stack. Registers ONE throwaway user per run (auth rate limit:
// 10 register/login per 15 min per IP — don't add more registrations here).
//
// Two tiers:
// - storage/sync tests that need no progression engine (run today);
// - ENGINE-DEPENDENT tests (setup → bootstrap → sync → rotation). Until the
//   @chefer/utils gym engine (G1-A) is merged they detect the stub, warn and
//   return early; at integration they run for real.

const { client, setToken } = makeContractClient();
let engineReady = false;

const NOW = Date.now();
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();
const localDate = iso(0).slice(0, 10);

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('gym'),
    password: 'Contract@123!',
    firstName: 'Gym',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);

  engineReady = await client.gym.profile.recommend
    .query({ days: 3, experience: 'BEGINNER', equipmentAccess: 'FULL_GYM' })
    .then(() => true)
    .catch(() => false);
  if (!engineReady) {
    console.warn('[gym.contract] progression engine not implemented yet — engine tests skipped');
  }
});

/** A hand-built COMPLETED doc for one exercise (freestyle unless routine ids are given). */
function freestyleDoc(over: Partial<WorkoutSessionDoc> = {}): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    routineId: null,
    routineDayId: null,
    name: 'Freestyle',
    status: 'COMPLETED',
    startedAt: iso(-60),
    finishedAt: iso(-5),
    localDate,
    isDeload: false,
    notes: null,
    clientUpdatedAt: iso(-5),
    engineVersion: 1,
    exercises: [
      {
        id: randomUUID(),
        exerciseId: 'barbell-bench-press',
        routineExerciseId: null,
        position: 0,
        repMin: 6,
        repMax: 10,
        targetRir: 2,
        restSec: 180,
        skipped: false,
        swappedFromId: null,
        lastSetRir: 2,
        prescription: {
          kind: 'start',
          weightKg: 40,
          reps: [8, 8, 8],
          sets: 3,
          reasonCode: 'START',
          inputs: {},
          deltaKg: 0,
          engineVersion: 1,
        },
        notes: null,
        sets: [0, 1, 2].map((position) => ({
          id: randomUUID(),
          position,
          weightKg: 40,
          reps: 8,
          isWarmup: false,
          completedAt: iso(-50 + position * 3),
        })),
      },
    ],
    ...over,
  };
}

/** The doc the phone would upload after doing `next` exactly as prescribed. */
function docFromNextWorkout(next: NextWorkoutDto, startOffsetMin: number): WorkoutSessionDoc {
  return {
    ...freestyleDoc({
      routineId: next.routineId,
      routineDayId: next.dayId,
      name: next.dayName,
      startedAt: iso(startOffsetMin),
      finishedAt: iso(startOffsetMin + 50),
      clientUpdatedAt: iso(startOffsetMin + 50),
    }),
    exercises: next.exercises.map((e, i) => ({
      id: randomUUID(),
      exerciseId: e.exerciseId,
      routineExerciseId: e.routineExerciseId,
      position: i,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRir: e.targetRir,
      restSec: e.restSec,
      skipped: false,
      swappedFromId: null,
      lastSetRir: 2,
      prescription: e.suggestion,
      notes: null,
      sets: e.suggestion.reps.map((reps, position) => ({
        id: randomUUID(),
        position,
        weightKg: e.suggestion.weightKg,
        reps,
        isWarmup: false,
        completedAt: iso(startOffsetMin + 5 + position * 3),
      })),
    })),
  };
}

describe('gym storage + sync (no engine needed)', () => {
  it('library lists the curated catalog with API-relative image paths', async () => {
    const library = await client.gym.library.list.query();
    const bench = library.find((e) => e.id === 'barbell-bench-press');
    expect(bench).toBeTruthy();
    expect(bench?.ownerId).toBeNull();
    for (const url of bench?.images ?? []) expect(url.startsWith('/static/exercises/')).toBe(true);
  });

  it('upsertMany is idempotent, last-write-wins, and round-trips the document', async () => {
    const doc = freestyleDoc();

    const first = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(first.results).toEqual([{ id: doc.id, status: 'applied' }]);

    // Exact re-send (outbox retry) → applied again, nothing duplicated.
    const again = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(again.results).toEqual([{ id: doc.id, status: 'applied' }]);

    // An older copy is ignored.
    const older = { ...doc, notes: 'stale copy', clientUpdatedAt: iso(-30) };
    const stale = await client.gym.session.upsertMany.mutate({ docs: [older] });
    expect(stale.results).toEqual([{ id: doc.id, status: 'stale' }]);

    const stored = await client.gym.session.get.query({ id: doc.id });
    expect(stored).toEqual(doc);

    await expect(client.gym.session.delete.mutate({ id: doc.id })).resolves.toEqual({ ok: true });
    await expect(client.gym.session.get.query({ id: doc.id })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
  });

  it('rejects an unknown exercise per document without failing the batch', async () => {
    const good = freestyleDoc();
    const base = freestyleDoc();
    const bad: WorkoutSessionDoc = {
      ...base,
      exercises: base.exercises.map((e) => ({ ...e, exerciseId: 'definitely-not-an-exercise' })),
    };

    const res = await client.gym.session.upsertMany.mutate({ docs: [bad, good] });

    expect(res.results).toEqual([
      { id: bad.id, status: 'rejected', reason: 'unknown_exercise:definitely-not-an-exercise' },
      { id: good.id, status: 'applied' },
    ]);
  });

  it('routine save uses optimistic concurrency and returns the current doc on CONFLICT', async () => {
    const blank = await client.gym.routine.createBlank.mutate({ name: 'Contract split', days: 2 });
    expect(blank.version).toBe(1);
    const [dayOne, dayTwo] = blank.days;
    if (!dayOne || !dayTwo) throw new Error('createBlank returned fewer than 2 days');
    expect(blank.nextDayId).toBe(dayOne.id);

    const saved = await client.gym.routine.save.mutate({
      expectedVersion: 1,
      routine: {
        id: blank.id,
        name: 'Contract split v2',
        days: blank.days.map((d, i) => ({
          id: d.id,
          name: d.name,
          plannedWeekday: i,
          exercises:
            i === 0
              ? [
                  {
                    exerciseId: 'barbell-bench-press',
                    sets: 3,
                    repMin: 6,
                    repMax: 10,
                    targetRir: 2,
                    restSec: 180,
                    supersetGroup: null,
                    notes: null,
                  },
                ]
              : [],
        })),
      },
    });
    expect(saved.version).toBe(2);
    expect(saved.days.map((d) => d.id)).toEqual(blank.days.map((d) => d.id));
    expect(saved.days[0]?.exercises[0]?.exerciseId).toBe('barbell-bench-press');

    // A second editor still on version 1 gets CONFLICT + the server's version.
    const err = await client.gym.routine.save
      .mutate({
        expectedVersion: 1,
        routine: {
          id: blank.id,
          name: 'Other device',
          days: [{ name: 'Only day', plannedWeekday: null, exercises: [] }],
        },
      })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      data: {
        code: 'CONFLICT',
        conflict: { kind: 'routine', current: { id: blank.id, version: 2 } },
      },
    });

    const moved = await client.gym.routine.setNextDay.mutate({
      routineId: blank.id,
      dayId: dayTwo.id,
    });
    expect(moved.nextDayId).toBe(dayTwo.id);
    expect(moved.version).toBe(2); // the pointer is not document content
  });
});

describe('gym setup → bootstrap → sync (ENGINE-DEPENDENT)', () => {
  it('completes setup, syncs the next workout idempotently and advances the rotation once', async () => {
    if (!engineReady) return;

    const rec = await client.gym.profile.recommend.query({
      days: 3,
      experience: 'BEGINNER',
      equipmentAccess: 'FULL_GYM',
    });
    const setup = await client.gym.profile.completeSetup.mutate({
      days: 3,
      experience: 'BEGINNER',
      equipmentAccess: 'FULL_GYM',
      unit: 'KG',
      templateKey: rec.recommendedKey,
      plannedWeekdays: [0, 2, 4],
      reminderTime: null,
    });
    expect(setup.profile?.unit).toBe('KG');
    const routine = setup.activeRoutine;
    expect(routine?.templateKey).toBe(rec.recommendedKey);
    expect(routine?.nextDayId).toBe(routine?.days[0]?.id);
    expect(setup.progressions.length).toBeGreaterThan(0);

    const boot = await client.gym.bootstrap.query({ today: localDate });
    const next = boot.nextWorkout;
    expect(next?.dayId).toBe(routine?.days[0]?.id);
    if (!next || !routine) throw new Error('bootstrap has no next workout after setup');

    const doc = docFromNextWorkout(next, -90);
    const first = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    const again = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(first.results[0]?.status).toBe('applied');
    expect(again.results[0]?.status).toBe('applied');

    const after = await client.gym.bootstrap.query({ today: localDate });
    // Exactly one step, even though the doc was synced twice.
    expect(after.activeRoutine?.nextDayId).toBe(routine.days[1]?.id);
    expect(after.nextWorkout?.dayId).toBe(routine.days[1]?.id);
    expect(after.recentSessions.map((s) => s.id)).toContain(doc.id);
    expect(after.streak.thisWeekSessions).toBeGreaterThanOrEqual(1);
  });
});
