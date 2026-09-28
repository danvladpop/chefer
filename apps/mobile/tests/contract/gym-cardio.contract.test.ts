import { randomUUID } from 'node:crypto';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppRouter } from '@chefer/api';
import type { WorkoutSessionDoc } from '@chefer/types';
import { API_URL, CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// ─── T-42.2 / Δ2.1: the client-level filter (gym.bootstrap, gym.library.list,
// gym.session.get, gym.session.list) gates every cardio-typed row an old
// (level < 3) client is ever sent. This is the gate the plan calls out as
// safety-critical for installed apps — AC10 asserts it directly.
//
// Cardio is level 3, not 2 (revised 2026-09-28): wave 1 already shipped
// level 2 for an unrelated fix (sign-up consent checkboxes, T-39.1/T-26.5),
// so the CURRENTLY LIVE App Store build (1.0.0 (5)) already sends level 2 —
// it must never see cardio. Levels 0/1/2 all render strength-only.

const NOW = Date.now();
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();
const localDate = iso(0).slice(0, 10);

const BIKE_ID = 'stationary-bike-upright';
const BENCH_ID = 'barbell-bench-press';

/** A tRPC client that sends a fixed `x-chefer-api-level`, otherwise identical to the app's. */
function leveledClient(level: number, token: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: () => ({
          'x-chefer-client': 'mobile',
          'x-trpc-source': 'mobile-react',
          'x-chefer-api-level': String(level),
          authorization: `Bearer ${token}`,
        }),
      }),
    ],
  });
}

function bikeSet(over: Partial<WorkoutSessionDoc['exercises'][number]['sets'][number]> = {}) {
  return {
    id: randomUUID(),
    position: 0,
    weightKg: 0,
    reps: 0,
    isWarmup: false,
    completedAt: iso(-5),
    durationSec: 1200,
    distanceM: 8000,
    intensityRpe: 6,
    ...over,
  };
}

/** A mixed COMPLETED session: one strength exercise, one cardio exercise. */
function mixedDoc(): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    routineId: null,
    routineDayId: null,
    name: 'Bench + bike',
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
        exerciseId: BENCH_ID,
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
      {
        id: randomUUID(),
        exerciseId: BIKE_ID,
        routineExerciseId: null,
        position: 1,
        repMin: 1,
        repMax: 1,
        targetRir: 0,
        restSec: 0,
        skipped: false,
        swappedFromId: null,
        lastSetRir: null,
        prescription: {
          kind: 'hold',
          weightKg: 0,
          reps: [],
          sets: 0,
          reasonCode: 'START',
          inputs: {},
          deltaKg: 0,
          engineVersion: 1,
        },
        notes: null,
        sets: [bikeSet()],
      },
    ],
  };
}

describe('gym cardio: client-level filtering (T-42.2, Δ2.1)', () => {
  let token: string;

  beforeAll(async () => {
    const { client, setToken } = makeContractClient();
    const user = await client.auth.register.mutate({
      email: uniqueEmail('gym-cardio'),
      password: 'Contract@123!',
      firstName: 'Cardio',
      ...CONTRACT_CONSENT,
    });
    if (!user.session)
      throw new Error('mobile register response is missing the session credential');
    setToken(user.session.token);
    token = user.session.token;
  });

  it('AC10: a level-0/1/2 bootstrap/library contain no cardio-typed row (2 = the live App Store build)', async () => {
    for (const level of [0, 1, 2]) {
      const c = leveledClient(level, token);
      const boot = await c.gym.bootstrap.query({ today: localDate });
      expect(
        boot.library.some((e) => e.id === BIKE_ID),
        `level ${level} bootstrap.library`,
      ).toBe(false);
      const list = await c.gym.library.list.query();
      expect(
        list.some((e) => e.id === BIKE_ID),
        `level ${level} library.list`,
      ).toBe(false);
    }
  });

  it('a level-3 bootstrap/library DO include the cardio catalogue rows', async () => {
    const c = leveledClient(3, token);
    const boot = await c.gym.bootstrap.query({ today: localDate });
    expect(boot.library.some((e) => e.id === BIKE_ID)).toBe(true);
    const list = await c.gym.library.list.query();
    const bike = list.find((e) => e.id === BIKE_ID);
    expect(bike?.trackingType).toBe('DURATION_DISTANCE');
  });

  it('a mixed session (bench + bike) uploads at any level, but a level-0/1/2 read drops the cardio exercise while keeping the session', async () => {
    const writer = leveledClient(3, token);
    const doc = mixedDoc();
    const res = await writer.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results).toEqual([{ id: doc.id, status: 'applied' }]);

    for (const level of [0, 1, 2]) {
      const c = leveledClient(level, token);
      const got = await c.gym.session.get.query({ id: doc.id });
      // The session itself is never dropped — only the cardio exercise inside it.
      expect(got.id).toBe(doc.id);
      expect(got.exercises.map((e) => e.exerciseId)).toEqual([BENCH_ID]);

      const list = await c.gym.session.list.query({ limit: 20 });
      const item = list.items.find((i) => i.id === doc.id);
      expect(item, `level ${level} session.list`).toBeTruthy();
      expect(item?.exercises.map((e) => e.exerciseId)).toEqual([BENCH_ID]);
    }
  });

  it('AC6/level 3: session.get round-trips the cardio set fields exactly', async () => {
    const writer = leveledClient(3, token);
    const doc = mixedDoc();
    await writer.gym.session.upsertMany.mutate({ docs: [doc] });

    const got = await writer.gym.session.get.query({ id: doc.id });
    const bike = got.exercises.find((e) => e.exerciseId === BIKE_ID);
    expect(bike?.sets[0]).toMatchObject({
      durationSec: 1200,
      distanceM: 8000,
      intensityRpe: 6,
      weightKg: 0,
      reps: 0,
    });
  });

  it('progression.recompute skips the cardio exercise — no progression row is ever created for it', async () => {
    const writer = leveledClient(3, token);
    const doc = mixedDoc();
    await writer.gym.session.upsertMany.mutate({ docs: [doc] });

    const boot = await writer.gym.bootstrap.query({ today: localDate });
    expect(boot.progressions.some((p) => p.exerciseId === BIKE_ID)).toBe(false);
  });
});
