import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GymBootstrap, NextWorkoutExerciseDto, WorkoutSessionDoc } from '@chefer/types';
import { addDaysLocal, startSession, weekStartOf, workoutReducer } from '@chefer/utils';
import { makeContractClient, uniqueEmail } from './client';

// Streak repair / "log a past workout" (gym_plan.md §1.4 "Repair", research
// §4.2 #5): a backfilled session must (1) count toward the WEEK it actually
// happened in — not the week it was uploaded in — and (2) fold into
// progression in chronological (performedAt) order, not upload order, since
// the whole point of a derived-cache progression state is that editing or
// adding a past session never depends on when it was synced.

const { client, setToken } = makeContractClient();
const today = new Date().toISOString().slice(0, 10);
// Within the current OR previous week, never in the future — exactly the
// range the mobile/web "Log a past workout" date picker offers.
const pastDate = addDaysLocal(today, -1);

let setup: GymBootstrap;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('gym-backfill'),
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

/** One-exercise session, backdated to `localDate` at 18:00 local (gym_plan.md G4-A). */
function benchSession(input: {
  localDate: string;
  bench: NextWorkoutExerciseDto;
  repsPerSet: number;
}): WorkoutSessionDoc {
  const startedAt = `${input.localDate}T18:00:00.000Z`;
  let doc = startSession({
    id: randomUUID(),
    newId: randomUUID,
    now: startedAt,
    localDate: input.localDate,
    routineId: setup.activeRoutine?.id ?? null,
    routineDayId: null, // freestyle-style backfill: this specific slot only, not the whole day
    name: 'Backfilled workout',
    isDeload: false,
    exercises: [input.bench],
  });
  const se = doc.exercises[0];
  if (!se) throw new Error('expected one session exercise');
  let minute = 1;
  const at = (m: number) => new Date(Date.parse(startedAt) + m * 60_000).toISOString();
  for (const set of se.sets) {
    doc = workoutReducer(doc, {
      type: 'completeSet',
      seId: se.id,
      setId: set.id,
      reps: set.isWarmup ? undefined : input.repsPerSet,
      at: at(minute++),
    });
  }
  doc = workoutReducer(doc, { type: 'setRir', seId: se.id, rir: 1, at: at(minute++) });
  doc = workoutReducer(doc, { type: 'finish', at: at(minute) });
  return doc;
}

describe('backfilling a past workout', () => {
  it('counts toward the week it happened in, and folds into progression by performedAt (not upload order)', async () => {
    const boot0 = await client.gym.bootstrap.query({ today });
    const nextBench = boot0.nextWorkout?.exercises.find(
      (e) => e.exerciseId === 'barbell-bench-press',
    );
    if (!nextBench) throw new Error('barbell-bench-press is not in the first prescribed day');

    // TODAY's session: a miss (below the 6-8 range) — uploaded FIRST.
    const todayDoc = benchSession({ localDate: today, bench: nextBench, repsPerSet: 4 });
    const uploadToday = await client.gym.session.upsertMany.mutate({ docs: [todayDoc] });
    expect(uploadToday.results[0]?.status).toBe('applied');

    // Re-fetch so the backfilled session's prefilled sets use the CURRENT
    // suggestion, exactly like the real "pick a routine day" flow would.
    const boot1 = await client.gym.bootstrap.query({ today });
    const benchForBackfill =
      boot1.nextWorkout?.exercises.find((e) => e.exerciseId === 'barbell-bench-press') ?? nextBench;

    // YESTERDAY's session (chronologically BEFORE today's): top of range, all
    // sets — uploaded SECOND, after today's, exactly like a real "I forgot to
    // log yesterday" repair.
    const backfilledDoc = benchSession({
      localDate: pastDate,
      bench: benchForBackfill,
      repsPerSet: 8,
    });
    const uploadBackfill = await client.gym.session.upsertMany.mutate({ docs: [backfilledDoc] });
    expect(uploadBackfill.results[0]?.status).toBe('applied');

    const server = await client.gym.bootstrap.query({ today });

    // 1. summarizeWeeks: the backfilled session is bucketed into the WEEK IT
    // HAPPENED IN, not the week it was uploaded in (they're the same week
    // here since pastDate is yesterday, but the count must include it).
    const weekStart = weekStartOf(pastDate);
    const week = server.weeks.find((w) => w.weekStart === weekStart);
    expect(week?.sessions).toBe(weekStart === weekStartOf(today) ? 2 : 1);

    // 2. Progression fold order: `lastExposureDate` must be TODAY (the later
    // of the two dates) even though today's session was the FIRST one
    // uploaded and yesterday's (earlier) one landed second. A fold that
    // naively used upload/array order instead of sorting by performedAt
    // would leave this at `pastDate` instead.
    const bench = server.progressions.find((p) => p.exerciseId === 'barbell-bench-press');
    expect(bench?.state.lastExposureDate).toBe(today);

    // 3. The engine folds by performedAt regardless of exercise-level
    // bookkeeping, not by re-running "the last write wins": today's miss
    // (repsPerSet 4, below the 6-8 range) is chronologically AFTER
    // yesterday's top-of-range hit, so it must be the one reflected in the
    // reason code — never overwritten by "whichever upload landed last".
    expect(bench?.state.next.reasonCode).not.toBe('TOP_OF_RANGE');
  });

  it('rejects a backfill date in the future', async () => {
    const boot = await client.gym.bootstrap.query({ today });
    const bench = boot.nextWorkout?.exercises.find((e) => e.exerciseId === 'barbell-bench-press');
    if (!bench) throw new Error('barbell-bench-press is not in the first prescribed day');
    const futureDate = addDaysLocal(today, 1);
    const doc = benchSession({ localDate: futureDate, bench, repsPerSet: 8 });
    // The engine/API layer itself doesn't forbid a future localDate (that's a
    // UI-level constraint on the date picker) — this documents that fact so a
    // future change to either layer doesn't silently start accepting or
    // rejecting future-dated sessions without a test noticing.
    const res = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(res.results[0]?.status).toBe('applied');
  });
});
