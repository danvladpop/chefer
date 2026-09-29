import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

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
    ...CONTRACT_CONSENT,
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

  it('T-44: a DISCARDED re-upsert of a COMPLETED doc drops it from recentSessions/session.list; session.get still finds the row by id (Δ2.3)', async () => {
    const doc = freestyleDoc();
    const applied = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(applied.results).toEqual([{ id: doc.id, status: 'applied' }]);

    const listed = await client.gym.session.list.query({ limit: 50 });
    expect(listed.items.map((i) => i.id)).toContain(doc.id);
    const bootBefore = await client.gym.bootstrap.query({ today: localDate });
    expect(bootBefore.recentSessions.map((s) => s.id)).toContain(doc.id);

    // Delete-with-Undo (T-44.2): the outbox re-sends the same doc as DISCARDED.
    const discarded: WorkoutSessionDoc = {
      ...doc,
      status: 'DISCARDED',
      clientUpdatedAt: iso(1),
    };
    const res = await client.gym.session.upsertMany.mutate({ docs: [discarded] });
    expect(res.results).toEqual([{ id: doc.id, status: 'applied' }]);

    const listedAfter = await client.gym.session.list.query({ limit: 50 });
    expect(listedAfter.items.map((i) => i.id)).not.toContain(doc.id);
    const bootAfter = await client.gym.bootstrap.query({ today: localDate });
    expect(bootAfter.recentSessions.map((s) => s.id)).not.toContain(doc.id);

    // Not hard-deleted yet — Q-30's separate gym.session.delete runs once the
    // outbox write is acknowledged online. Until then, session.get still finds it.
    const stillThere = await client.gym.session.get.query({ id: doc.id });
    expect(stillThere.status).toBe('DISCARDED');

    await client.gym.session.delete.mutate({ id: doc.id });
  });

  it('T-44.2: the childless DISCARDED tombstone the clients send drops it from the lists, re-folds progression, and the hard delete then finds the row', async () => {
    const doc = freestyleDoc();
    await client.gym.session.upsertMany.mutate({ docs: [doc] });

    // What `discardedTombstone()` sends: same id + times, no children, a newer clientUpdatedAt.
    const tombstone: WorkoutSessionDoc = {
      ...doc,
      status: 'DISCARDED',
      exercises: [],
      clientUpdatedAt: iso(1),
    };
    const res = await client.gym.session.upsertMany.mutate({ docs: [tombstone] });
    expect(res.results).toEqual([{ id: doc.id, status: 'applied' }]);

    const listed = await client.gym.session.list.query({ limit: 50 });
    expect(listed.items.map((i) => i.id)).not.toContain(doc.id);
    const boot = await client.gym.bootstrap.query({ today: localDate });
    expect(boot.recentSessions.map((s) => s.id)).not.toContain(doc.id);

    // A re-send of the tombstone (the outbox retries) is idempotent, and an OLDER copy of the
    // completed doc (a stale device) never resurrects it.
    const again = await client.gym.session.upsertMany.mutate({ docs: [tombstone, doc] });
    expect(again.results).toEqual([
      { id: doc.id, status: 'applied' },
      { id: doc.id, status: 'stale' },
    ]);

    // Q-30: the hard delete after the ack works once, then the row is gone (NOT_FOUND is fine to the client).
    await client.gym.session.delete.mutate({ id: doc.id });
    await expect(client.gym.session.delete.mutate({ id: doc.id })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
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
  it('T-44: editing a COMPLETED doc recomputes progression (600 → 60 kg changes the next target)', async () => {
    if (!engineReady) return;

    // An isolation exercise no other test in this file logs, so this
    // assertion can't be muddied by progression history from elsewhere.
    const EX = 'dumbbell-lateral-raise';
    const heavySets = (weightKg: number) =>
      [0, 1, 2].map((position) => ({
        id: randomUUID(),
        position,
        weightKg,
        reps: 10,
        isWarmup: false,
        completedAt: iso(-50 + position * 3),
      }));
    const doc = freestyleDoc({
      exercises: [
        {
          id: randomUUID(),
          exerciseId: EX,
          routineExerciseId: null,
          position: 0,
          repMin: 10,
          repMax: 15,
          targetRir: 2,
          restSec: 90,
          skipped: false,
          swappedFromId: null,
          lastSetRir: 2,
          prescription: {
            kind: 'start',
            weightKg: 6,
            reps: [10, 10, 10],
            sets: 3,
            reasonCode: 'START',
            inputs: {},
            deltaKg: 0,
            engineVersion: 1,
          },
          notes: null,
          sets: heavySets(60),
        },
      ],
    });
    await client.gym.session.upsertMany.mutate({ docs: [doc] });

    const before = await client.gym.progression.forExercises.query({ exerciseIds: [EX] });
    const beforeKg = before.find((p) => p.exerciseId === EX)?.suggestion.weightKg;
    expect(beforeKg).toBeGreaterThan(30);

    // Fix a mis-entered weight on the SAME session (an edit, Δ2.3) — the
    // outbox re-sends the whole doc with a bumped clientUpdatedAt.
    const fixed: WorkoutSessionDoc = {
      ...doc,
      clientUpdatedAt: iso(1),
      exercises: doc.exercises.map((e) => ({ ...e, sets: heavySets(6) })),
    };
    const res = await client.gym.session.upsertMany.mutate({ docs: [fixed] });
    expect(res.results).toEqual([{ id: doc.id, status: 'applied' }]);
    await expect(client.gym.session.get.query({ id: doc.id })).resolves.toEqual(fixed);

    const after = await client.gym.progression.forExercises.query({ exerciseIds: [EX] });
    const afterKg = after.find((p) => p.exerciseId === EX)?.suggestion.weightKg;
    // AC8: a fresh fold over the edited history, not the pre-edit one.
    expect(afterKg).not.toBe(beforeKg);
    expect(afterKg).toBeLessThan(beforeKg ?? Number.POSITIVE_INFINITY);
  });

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
  it('T-36.6: sessionLengthMins is additive — saved, kept by a save without it, cleared with null; a short version carries the dropped exercises over', async () => {
    if (!engineReady) return;

    // Profile field: old binaries never send it, so nothing else may touch it.
    const saved = await client.gym.profile.save.mutate({ sessionLengthMins: 45 });
    expect(saved.sessionLengthMins).toBe(45);
    const untouched = await client.gym.profile.save.mutate({ weeklyGoal: 3 });
    expect(untouched.sessionLengthMins).toBe(45);
    const boot0 = await client.gym.bootstrap.query({ today: localDate });
    expect(boot0.profile?.sessionLengthMins).toBe(45);
    const cleared = await client.gym.profile.save.mutate({ sessionLengthMins: null });
    expect(cleared.sessionLengthMins).toBeNull();

    // A short version: the session has only the kept exercises and lists the
    // dropped one in `carryOverExerciseIds` (seeded at Start by the client).
    const next = boot0.nextWorkout;
    const routine = boot0.activeRoutine;
    if (!next || !routine || next.exercises.length < 2) {
      throw new Error('expected a next workout with at least two exercises');
    }
    const dropped = next.exercises[next.exercises.length - 1];
    if (!dropped) throw new Error('expected a droppable last exercise');
    const kept: NextWorkoutDto = { ...next, exercises: next.exercises.slice(0, -1) };
    const doc = {
      ...docFromNextWorkout(kept, -30),
      carryOverExerciseIds: [dropped.exerciseId],
    };
    const res = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results[0]?.status).toBe('applied');

    const after = await client.gym.bootstrap.query({ today: localDate });
    expect(after.carryOver.map((i) => i.exerciseId)).toContain(dropped.exerciseId);
    // The next session leads with it (`From last time`) unless the next day
    // already contains that exercise itself.
    const nextHas = after.activeRoutine?.days
      .find((d) => d.id === after.nextWorkout?.dayId)
      ?.exercises.some((e) => e.exerciseId === dropped.exerciseId);
    if (!nextHas && after.nextWorkout) {
      expect(after.nextWorkout.exercises[0]?.exerciseId).toBe(dropped.exerciseId);
      expect(after.nextWorkout.exercises[0]?.fromLastTime).toBe(true);
    }
  });
});
