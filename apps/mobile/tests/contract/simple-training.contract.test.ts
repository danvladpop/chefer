import { randomUUID } from 'node:crypto';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppRouter } from '@chefer/api';
import type { NextWorkoutExerciseDto, WorkoutSessionDoc } from '@chefer/types';
import { startSimpleWorkout, weekdayOf, workoutReducer } from '@chefer/utils';
import { API_URL, CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// ─── Simple training mode, phase 1, against the REAL API ─────────────────────
// docs/prd-2026-10/casual-training-mode.md · ADR 0001 (one active routine).
//  - "Keep it simple" setup builds NO routine;
//  - My week writes type-only routine days (zero exercises) into THE routine,
//    and shipped binaries (API level 2 = App Store 1.0.0, 4 = 1.0.1) still read
//    it — the same shape `routine.createBlank` has produced since wave 0;
//  - an older binary's routine save never clears a My week type;
//  - a typed live workout with no exercises syncs and counts;
//  - the progression guard: an unedited Done tick never moves progression;
//  - switching training style is lossless.
// ONE throwaway registration per run.

const { client, setToken, getToken } = makeContractClient();
const NOW = Date.now();
const today = new Date(NOW).toISOString().slice(0, 10);
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

/** A client that sends a fixed `x-chefer-api-level` (2 = App Store 1.0.0, 4 = 1.0.1). */
function leveledClient(level: number) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: () => ({
          'x-chefer-client': 'mobile',
          'x-trpc-source': 'mobile-react',
          'x-chefer-api-level': String(level),
          authorization: `Bearer ${getToken() ?? ''}`,
        }),
      }),
    ],
  });
}

const todayWeekday = weekdayOf(today);
const otherWeekday = (todayWeekday + 3) % 7;
const week = Array.from({ length: 7 }, (_, d) =>
  d === todayWeekday ? 'YOGA' : d === otherWeekday ? 'UPPER_BODY' : null,
) as ('YOGA' | 'UPPER_BODY' | null)[];

const bench: NextWorkoutExerciseDto = {
  routineExerciseId: 'contract-none',
  exerciseId: 'barbell-bench-press',
  position: 0,
  sets: 3,
  repMin: 8,
  repMax: 12,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  notes: null,
  repBucket: '8-12',
  suggestion: {
    kind: 'hold',
    weightKg: 100,
    reps: [12, 12, 12],
    sets: 3,
    reasonCode: 'START',
    inputs: {},
    deltaKg: 0,
    engineVersion: 3,
  },
  warmups: [],
  lastTime: null,
};

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('simple-training'),
    password: 'Contract@123!',
    firstName: 'Mover',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);
  await client.privacy.grantHealthConsent.mutate({});
  // A GAIN_MUSCLE profile: the one the training-day bump applies to.
  await client.preferences.saveProfileBasics.mutate({
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'FEMALE',
    age: 34,
    heightCm: 168,
    weightKg: 64,
    activityLevel: 'MODERATELY_ACTIVE',
  });
});

describe('"Keep it simple" setup (§6.1)', () => {
  it('creates a SIMPLE profile and NO routine — Today needs nothing built first', async () => {
    const boot = await client.gym.profile.completeSimpleSetup.mutate({ unit: 'KG' });
    expect(boot.profile).toMatchObject({ trainingStyle: 'SIMPLE', weeklyGoal: 3 });
    expect(boot.profile?.setupCompletedAt).not.toBeNull();
    expect(boot.activeRoutine).toBeNull();
    expect(boot.nextWorkout).toBeNull();
  });
});

describe('My week = the one active routine (ADR 0001)', () => {
  it('the first save creates the routine from type-only days and sets the goal', async () => {
    const res = await client.gym.routine.saveMyWeek.mutate({ week });
    expect(res.weeklyGoal).toBe(2);
    expect(res.routine?.isActive).toBe(true);
    const days = res.routine?.days ?? [];
    expect(days.map((d) => [d.plannedWeekday, d.workoutType, d.exercises.length]).sort()).toEqual(
      [
        [todayWeekday, 'YOGA', 0],
        [otherWeekday, 'UPPER_BODY', 0],
      ].sort(),
    );
    const boot = await client.gym.bootstrap.query({ today });
    expect(boot.profile?.weeklyGoal).toBe(2);
    expect(boot.activeRoutine?.id).toBe(res.routine?.id);
  });

  it('shipped binaries (levels 2 and 4) read a routine of zero-exercise days', async () => {
    for (const level of [2, 4]) {
      const legacy = leveledClient(level);
      const boot = await legacy.gym.bootstrap.query({ today });
      expect(boot.activeRoutine?.days, `level ${level}`).toHaveLength(2);
      for (const day of boot.activeRoutine?.days ?? []) {
        expect(day.exercises, `level ${level}`).toEqual([]);
        expect(day.name.length).toBeGreaterThan(0);
      }
      // The rotation still names a day; it simply has nothing to lift.
      expect(boot.nextWorkout?.exercises ?? [], `level ${level}`).toEqual([]);
      const list = await legacy.gym.routine.list.query();
      expect(list.some((r) => r.isActive)).toBe(true);
    }
  });

  it("an older binary's save (no workoutType key) keeps the stored My week types", async () => {
    const legacy = leveledClient(4);
    const boot = await legacy.gym.bootstrap.query({ today });
    const routine = boot.activeRoutine;
    if (!routine) throw new Error('no routine');
    await legacy.gym.routine.save.mutate({
      expectedVersion: routine.version,
      routine: {
        id: routine.id,
        name: routine.name,
        days: routine.days.map((d) => ({
          id: d.id,
          name: d.name,
          plannedWeekday: d.plannedWeekday,
          exercises: [],
        })),
      },
    });
    const after = await client.gym.bootstrap.query({ today });
    expect(after.activeRoutine?.days.map((d) => d.workoutType).sort()).toEqual(
      ['UPPER_BODY', 'YOGA'].sort(),
    );
  });

  it('a stale edit gets the same CONFLICT as any routine edit', async () => {
    await expect(
      client.gym.routine.saveMyWeek.mutate({ week, expectedVersion: 1 }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
  });
});

describe('a live "Keep it simple" workout', () => {
  let doc: WorkoutSessionDoc;

  it('one tap to start, one to finish: a typed workout with no exercises syncs and counts', async () => {
    const before = await client.gym.bootstrap.query({ today });
    const started = startSimpleWorkout({
      id: randomUUID(),
      newId: randomUUID,
      now: at(50),
      localDate: today,
      workoutType: 'YOGA',
      name: 'Yoga',
    });
    doc = workoutReducer(started, { type: 'finish', at: at(5) });
    const res = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results[0]?.status).toBe('applied');
    const boot = await client.gym.bootstrap.query({ today });
    expect(boot.recentSessions.find((s) => s.id === doc.id)).toMatchObject({
      workoutType: 'YOGA',
      status: 'COMPLETED',
    });
    expect(boot.streak.thisWeekSessions).toBe(before.streak.thisWeekSessions + 1);
  });

  it('shipped binaries read it back as a finished workout with no exercises', async () => {
    for (const level of [2, 4]) {
      const legacy = leveledClient(level);
      const list = await legacy.gym.session.list.query({ limit: 20 });
      expect(list.items.find((s) => s.id === doc.id)?.exercises, `level ${level}`).toEqual([]);
      const full = await legacy.gym.session.get.query({ id: doc.id });
      expect(full.status).toBe('COMPLETED');
    }
  });

  it('makes today a nutrition training day (F-1)', async () => {
    const day = await client.tracker.getDay.query({ date: today });
    expect(day.trainingDay?.isTrainingDay).toBe(true);
  });
});

describe('progression guard (§6.5): an unedited Done tick is not a lift', () => {
  function tickedBench(edit: boolean): WorkoutSessionDoc {
    let d = startSimpleWorkout({
      id: randomUUID(),
      newId: randomUUID,
      now: at(40),
      localDate: today,
      workoutType: 'UPPER_BODY',
      name: 'Upper body',
      exercises: [bench],
    });
    const se = d.exercises[0];
    if (!se) throw new Error('no exercise');
    d = workoutReducer(d, { type: 'tickExercise', seId: se.id, done: true, at: at(30) });
    if (edit) {
      for (const s of se.sets) {
        d = workoutReducer(d, {
          type: 'editSet',
          seId: se.id,
          setId: s.id,
          weightKg: 40,
          at: at(29),
        });
      }
    }
    return workoutReducer(d, { type: 'finish', at: at(20) });
  }

  it('a 100 kg prefilled tick stores "load not confirmed" and leaves progression alone', async () => {
    const doc = tickedBench(false);
    await client.gym.session.upsertMany.mutate({ docs: [doc] });
    const full = await client.gym.session.get.query({ id: doc.id });
    expect(full.exercises[0]?.sets.every((s) => s.loadConfirmed === false)).toBe(true);
    const boot = await client.gym.bootstrap.query({ today });
    expect(boot.progressions.some((p) => p.exerciseId === 'barbell-bench-press')).toBe(false);
  });

  it('control: the same workout with edited numbers DOES feed progression', async () => {
    await client.gym.session.upsertMany.mutate({ docs: [tickedBench(true)] });
    const boot = await client.gym.bootstrap.query({ today });
    const p = boot.progressions.find((x) => x.exerciseId === 'barbell-bench-press');
    expect(p).toBeDefined();
    // Learned from the confirmed 40 kg, never the unconfirmed 100 kg.
    expect(p?.suggestion.weightKg ?? 0).toBeLessThan(100);
  });
});

describe('the training style switch is lossless', () => {
  it('Track my progress ↔ Keep it simple changes only the style', async () => {
    const before = await client.gym.bootstrap.query({ today });
    const saved = await client.gym.profile.save.mutate({ trainingStyle: 'PROGRESSIVE' });
    expect(saved.trainingStyle).toBe('PROGRESSIVE');
    const after = await client.gym.bootstrap.query({ today });
    expect(after.activeRoutine).toEqual(before.activeRoutine);
    expect(after.recentSessions.map((s) => s.id)).toEqual(before.recentSessions.map((s) => s.id));
    await client.gym.profile.save.mutate({ trainingStyle: 'SIMPLE' });
  });
});
