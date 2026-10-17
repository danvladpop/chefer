import { randomUUID } from 'node:crypto';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppRouter } from '@chefer/api';
import { WORKOUT_TYPES, type WorkoutSessionDoc } from '@chefer/types';
import { buildLoggedWorkoutDoc, weekdayOf } from '@chefer/utils';
import { API_URL, CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// ─── "Log a workout" (was WP-20 "Log an activity") against the REAL API ───────
// "45 min spin, 400 kcal burnt" is stored as a finished, routine-less gym
// session with one DURATION entry + its `workoutType`, through the SAME
// `gym.session.upsertMany` the app's offline outbox uses — no new procedure.
// F-1 (2026-10-17): every workout type makes a nutrition training day and
// counts as done today. D-3 still holds: the kcal is RECORD ONLY — the bump is
// the fixed training-day one, never sized by what was burned. ONE throwaway
// registration per run.

const { client, setToken, getToken } = makeContractClient();

// The same instant semantics the other gym contract tests use (UTC calendar day).
const NOW = Date.now();
const today = new Date(NOW).toISOString().slice(0, 10);
const nowIso = new Date(NOW).toISOString();

/** A client that sends a fixed `x-chefer-api-level`, e.g. a 1.0.1 app (level 4) or older (2). */
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

/** What the sheet submits: Spin, 45 min, 400 kcal, hard effort, today. */
function loggedWorkoutDoc(): WorkoutSessionDoc {
  return buildLoggedWorkoutDoc({
    input: {
      workoutType: 'SPIN',
      localDate: today,
      durationMin: 45,
      caloriesKcal: 400,
      effort: 7,
    },
    id: randomUUID(),
    newId: randomUUID,
    // Early enough that the 45 min never ends in the future, whatever the hour.
    startAt: new Date(NOW - 3 * 60 * 60_000).toISOString(),
    now: nowIso,
  });
}

/** A real strength workout today — the control that proves the food-side checks can fail. */
function strengthDoc(): WorkoutSessionDoc {
  const at = (m: number) => new Date(NOW - 120 * 60_000 + m * 60_000).toISOString();
  return {
    schemaVersion: 1,
    id: randomUUID(),
    routineId: null,
    routineDayId: null,
    name: 'Freestyle workout',
    status: 'COMPLETED',
    startedAt: at(0),
    finishedAt: at(40),
    localDate: today,
    isDeload: false,
    notes: null,
    clientUpdatedAt: at(40),
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
          completedAt: at(5 + position * 3),
        })),
      },
    ],
  };
}

async function foodSnapshot() {
  const [summary, day] = await Promise.all([
    client.dashboard.summary.query({ localDate: today }),
    client.tracker.getDay.query({ date: today }),
  ]);
  return {
    ring: {
      dailyCalorieTarget: summary.nutrition.dailyCalorieTarget,
      eatenKcal: summary.nutrition.eatenKcal,
      isTrainingDay: summary.nutrition.trainingDay?.isTrainingDay ?? false,
      kcalBonus: summary.nutrition.trainingDay?.kcalBonus ?? 0,
      adjustedTargets: summary.nutrition.adjustedTargets ?? null,
    },
    tracker: {
      targets: day.targets,
      isTrainingDay: day.trainingDay?.isTrainingDay ?? false,
      kcalBonus: day.trainingDay?.kcalBonus ?? 0,
      adjustedTargets: day.adjustedTargets ?? null,
    },
  };
}

let before: Awaited<ReturnType<typeof foodSnapshot>>;
let doc: WorkoutSessionDoc;
let weekSessionsBefore = 0;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('logged-workout'),
    password: 'Contract@123!',
    firstName: 'Cyclist',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  setToken(user.session.token);

  // A GAIN_MUSCLE lifter: the profile the training-day bump applies to.
  await client.privacy.grantHealthConsent.mutate({});
  await client.preferences.saveProfileBasics.mutate({
    goal: 'GAIN_MUSCLE',
    biologicalSex: 'MALE',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'MODERATELY_ACTIVE',
  });
  // Four lift days that are NOT today, so only a COMPLETED session can make today a training day.
  const plannedWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== weekdayOf(today)).slice(0, 4);
  const setup = await client.gym.profile.completeSetup.mutate({
    days: 4,
    experience: 'INTERMEDIATE',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: 'ul4-intermediate',
    plannedWeekdays,
    reminderTime: null,
    knownWeightsKg: { 'barbell-bench-press': 60 },
  });
  weekSessionsBefore = setup.streak.thisWeekSessions;
  before = await foodSnapshot();
  doc = loggedWorkoutDoc();
});

describe('logging a workout', () => {
  it('uploads through the existing offline sync and is acknowledged', async () => {
    const res = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results).toEqual([expect.objectContaining({ id: doc.id, status: 'applied' })]);
    // Idempotent like any finished workout (the outbox may retry).
    const again = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(again.results[0]?.status).not.toBe('rejected');
  });

  it('reads back as the same finished session: name, one DURATION entry, minutes, kcal, effort', async () => {
    const full = await client.gym.session.get.query({ id: doc.id });
    expect(full).toMatchObject({
      status: 'COMPLETED',
      name: 'Spin',
      workoutType: 'SPIN',
      routineDayId: null,
      localDate: today,
    });
    expect(full.exercises).toHaveLength(1);
    expect(full.exercises[0]?.exerciseId).toBe('spin-class');
    expect(full.exercises[0]?.sets[0]).toMatchObject({
      weightKg: 0,
      reps: 0,
      isWarmup: false,
      durationSec: 2700,
      caloriesKcal: 400,
      intensityRpe: 7,
    });
    expect(full.exercises[0]?.sets[0]?.completedAt).not.toBeNull();
  });

  it('shows in gym.bootstrap history and counts toward this week, without moving the rotation', async () => {
    const boot = await client.gym.bootstrap.query({ today });
    const row = boot.recentSessions.find((s) => s.id === doc.id);
    expect(row).toMatchObject({ name: 'Spin', status: 'COMPLETED', workoutType: 'SPIN' });
    expect(row?.exercises[0]?.sets[0]).toMatchObject({ durationSec: 2700, caloriesKcal: 400 });
    expect(boot.streak.thisWeekSessions).toBe(weekSessionsBefore + 1);
    // A cardio entry never becomes a strength progression.
    expect(boot.progressions.some((p) => p.exerciseId === 'spin-class')).toBe(false);
    // Freestyle: the routine's next day is untouched.
    expect(boot.activeRoutine?.nextDayId).toBeTruthy();
  });

  it('a 1.0.1 app (API level 4) and an older one (level 2) both read it back in the legacy shape', async () => {
    for (const level of [4, 2]) {
      const legacy = leveledClient(level);
      const list = await legacy.gym.session.list.query({ limit: 20 });
      const row = list.items.find((s) => s.id === doc.id);
      expect(row, `level ${level}`).toBeDefined();
      // DURATION renders on every shipped client, so the entry is NOT filtered out…
      expect(row?.exercises, `level ${level}`).toHaveLength(1);
      expect(row?.exercises[0]?.exerciseId).toBe('spin-class');
      // …and the set is the plain cardio shape: zero weight/reps, the time in durationSec.
      expect(row?.exercises[0]?.sets[0]).toMatchObject({
        weightKg: 0,
        reps: 0,
        completed: true,
        durationSec: 2700,
        caloriesKcal: 400,
      });
      // The library row an old client needs to NAME the entry is delivered too (timed/DURATION).
      const library = await legacy.gym.library.list.query({});
      const entry = library.find((e) => e.id === 'spin-class');
      expect(entry, `level ${level}`).toMatchObject({ trackingType: 'DURATION', isTimed: true });
      const full = await legacy.gym.session.get.query({ id: doc.id });
      expect(full.exercises).toHaveLength(1);
    }
  });

  it("ships every workout type's entry as a governed DURATION library row", async () => {
    const library = await client.gym.library.list.query({});
    for (const type of WORKOUT_TYPES) {
      const entry = library.find((e) => e.id === type.exerciseId);
      expect(entry, type.type).toBeDefined();
      expect(entry?.trackingType, type.type).toBe('DURATION');
    }
  });
});

describe('a logged workout is a training day; its kcal stays record only (F-1, D-3)', () => {
  let afterLog: Awaited<ReturnType<typeof foodSnapshot>>;

  it('makes today a training day with the fixed bump; the base target never moves', async () => {
    afterLog = await foodSnapshot();
    expect(before.tracker.isTrainingDay).toBe(false);
    expect(afterLog.tracker.isTrainingDay).toBe(true);
    expect(afterLog.ring.isTrainingDay).toBe(true);
    expect(afterLog.tracker.targets).toEqual(before.tracker.targets);
    expect(afterLog.ring.eatenKcal).toBe(before.ring.eatenKcal);
  });

  it("the bump is the same as a lifting workout's: the 400 kcal never sizes it", async () => {
    await client.gym.session.upsertMany.mutate({ docs: [strengthDoc()] });
    const afterBoth = await foodSnapshot();
    expect(afterBoth).toEqual(afterLog);
  });
});
