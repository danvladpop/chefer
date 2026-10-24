import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GymBootstrap, NextWorkoutExerciseDto, WorkoutSessionDoc } from '@chefer/types';
import { addDaysLocal, startSession, weekStartOf, workoutReducer } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// Kitchen progress P1 (docs/gamification-2026-10/tech-plan.md §4): the ledger records
// from the hooks inside the existing services, `progress.*` reads it. Run against an API
// started with GAMIFICATION_ALLOWLIST='*'. A throwaway account keeps state isolated.
//
// The old-binary half of the contract: tracker.logRecipe and gym.session.upsertMany answer
// exactly what they answered before the hooks existed (no new keys).

const { client, setToken } = makeContractClient();
const today = new Date().toISOString().slice(0, 10);
const twoDaysAgo = addDaysLocal(today, -2);

let setup: GymBootstrap;
let recipeId: string | null = null;

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('progress'),
    password: 'Contract@123!',
    firstName: 'Cook',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
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
  recipeId = (await client.recipe.list.query({ limit: 1 })).at(0)?.id ?? null;
});

/** A finished one-exercise session on `localDate` (the offline-outbox shape). */
function benchSession(localDate: string, bench: NextWorkoutExerciseDto): WorkoutSessionDoc {
  const startedAt = `${localDate}T18:00:00.000Z`;
  let doc = startSession({
    id: randomUUID(),
    newId: randomUUID,
    now: startedAt,
    localDate,
    routineId: setup.activeRoutine?.id ?? null,
    routineDayId: null,
    name: 'Offline workout',
    isDeload: false,
    exercises: [bench],
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
      reps: set.isWarmup ? undefined : 8,
      at: at(minute++),
    });
  }
  doc = workoutReducer(doc, { type: 'setRir', seId: se.id, rir: 1, at: at(minute++) });
  return workoutReducer(doc, { type: 'finish', at: at(minute) });
}

describe('progress: availability, summary and settings', () => {
  it('availability says the feature is on for this account', async () => {
    expect(await client.progress.availability.query()).toEqual({ enabled: true });
  });

  it('summary creates the state, pays the welcome and shapes every field', async () => {
    const summary = await client.progress.summary.query({ localDate: today });

    expect(summary.xp).toMatchObject({ total: 28, level: 1, xpIntoLevel: 28, xpForLevel: 140 });
    expect(summary.rank).toMatchObject({ id: 'KITCHEN_PORTER', minLevel: 1 });
    expect(summary.nextRank).toMatchObject({ id: 'COMMIS' });
    expect(summary.flame).toMatchObject({
      current: 0,
      goal: 3,
      pilotLightMax: 2,
      thisWeek: { weekStart: weekStartOf(today), activeDays: 0, met: false },
    });
    expect(summary.flame.thisWeek.days).toHaveLength(7);
    expect(summary.quiet).toBe(false);
    expect(summary.intro).toEqual({ backdatedXp: 0, badges: 0 });
    expect(summary.settings).toMatchObject({ celebrations: 'FULL', showXp: true });
    expect(Array.isArray(summary.todaysThree?.quests)).toBe(true);
    expect(summary.todaysThree?.bonusXp).toBe(40);

    // A second call changes nothing: still one welcome, same totals.
    const again = await client.progress.summary.query({ localDate: today });
    expect(again.xp.total).toBe(28);
    await client.progress.markSeen.mutate({ intro: true });
    expect((await client.progress.summary.query({ localDate: today })).intro).toBeNull();
  });

  it('settings, goal and pause round-trip', async () => {
    const settings = await client.progress.updateSettings.mutate({
      celebrations: 'SUBTLE',
      reminder: { enabled: true },
    });
    expect(settings).toMatchObject({
      celebrations: 'SUBTLE',
      showXp: true,
      reminder: { enabled: true, time: '19:30' },
    });

    const flame = await client.progress.setActiveDayGoal.mutate({ goal: 5, localDate: today });
    expect(flame.goal).toBe(5);

    const paused = await client.progress.pauseFlame.mutate({ startDate: today, weeks: 1 });
    expect(paused.pausedUntil).toBe(addDaysLocal(today, 6));
    const resumed = await client.progress.resumeFlame.mutate({ localDate: today });
    expect(resumed.pausedUntil).toBeNull();
  });

  it('achievements and the weekly recap keep their shape', async () => {
    const shelf = await client.progress.achievements.query();
    expect(shelf.total).toBeGreaterThan(0);
    expect(shelf.groups.map((g) => g.group)).toEqual(['KITCHEN', 'TABLE', 'GYM', 'FLAME', 'PLAN']);
    // The welcome badge is earned with the welcome.
    const welcome = shelf.groups.flatMap((g) => g.items).find((i) => i.id === 'WELCOME');
    expect(welcome?.tier).toBe(1);

    const recap = await client.progress.weeklyRecap.query({ weekStart: weekStartOf(today) });
    expect(recap).toMatchObject({
      weekStart: weekStartOf(today),
      weekEnd: addDaysLocal(weekStartOf(today), 6),
      cooked: 0,
      workouts: 0,
      dishOfWeek: null,
    });
    expect(recap.level.from).toBeGreaterThanOrEqual(1);
  });
});

describe('progress: the hooks write the ledger', () => {
  it('logging a meal puts a receipt in the inbox, and ack empties it', async () => {
    await client.tracker.logCustomMeal.mutate({
      date: today,
      name: 'Contract toast',
      estimatedBy: 'manual',
      mealType: 'breakfast',
      kcal: 250,
      protein: 8,
      carbs: 30,
      fat: 8,
    });
    const inbox = await client.progress.inbox.query();
    const meal = inbox.receipts.find((r) => r.kind === 'MEAL_LOGGED');
    expect(meal).toMatchObject({ localDate: today, xp: 5, capped: false });
    expect(meal?.lines).toEqual([{ code: 'LOGGED', xp: 5 }]);
    expect(inbox.cursor).not.toBeNull();

    await client.progress.ack.mutate({ upTo: inbox.cursor });
    expect((await client.progress.inbox.query()).receipts).toEqual([]);
  });

  it('a COMPLETED workout synced twice with an old localDate scores once, on that date', async () => {
    const boot = await client.gym.bootstrap.query({ today });
    const bench = boot.nextWorkout?.exercises.find((e) => e.exerciseId === 'barbell-bench-press');
    if (!bench) throw new Error('barbell-bench-press is not in the first prescribed day');
    const doc = benchSession(twoDaysAgo, bench);

    const first = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    const second = await client.gym.session.upsertMany.mutate({ docs: [doc] });
    expect(first.results[0]?.status).toBe('applied');
    expect(second.results[0]?.status).toBe('applied');

    const inbox = await client.progress.inbox.query();
    const workouts = inbox.receipts.filter((r) => r.kind === 'WORKOUT_COMPLETED');
    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toMatchObject({ sourceId: doc.id, localDate: twoDaysAgo, xp: 40 });

    // The workout summary screen's own receipt: the session and its PRs in one.
    const receipt = await client.progress.receiptFor.query({ kind: 'WORKOUT', sourceId: doc.id });
    expect(receipt?.localDate).toBe(twoDaysAgo);
    expect(receipt?.lines[0]?.code).toBe('WORKOUT_DONE');
    expect(
      await client.progress.receiptFor.query({ kind: 'WORKOUT', sourceId: 'nope' }),
    ).toBeNull();
  });

  it('finishCook twice with the same id is one event and the same receipt', async () => {
    const id = randomUUID();
    const input = { id, recipeId, localDate: today, finishedAt: new Date() };
    const first = await client.progress.finishCook.mutate(input);
    const second = await client.progress.finishCook.mutate(input);

    expect(first.receipt?.kind).toBe('COOK_FINISHED');
    expect(first.receipt?.lines[0]).toEqual({ code: 'COOKED_AT_HOME', xp: 25 });
    expect(second.receipt?.id).toBe(first.receipt?.id);

    const inbox = await client.progress.inbox.query();
    expect(inbox.receipts.filter((r) => r.kind === 'COOK_FINISHED')).toHaveLength(1);
    const cook = await client.progress.receiptFor.query({ kind: 'COOK', sourceId: id });
    expect(cook?.id).toBe(first.receipt?.id);
  });

  it('shopping toggleItems still accepts the old input (no localDate)', async () => {
    const list = await client.shoppingList.getForWeek.query({ weekOffset: 0 });
    if (!list.planId || list.items.length === 0) return; // no plan for the fresh account
    const keys = list.items.map((i) => i.key);
    const res = await client.shoppingList.toggleItems.mutate({
      planId: list.planId,
      keys,
      checked: true,
    });
    expect(Object.keys(res)).toEqual(['checkedKeys']);
  });
});

describe('old binaries: existing outputs have no new keys', () => {
  it('gym.session.upsertMany answers { results: [{ id, status }] } and nothing more', async () => {
    const boot = await client.gym.bootstrap.query({ today });
    const bench = boot.nextWorkout?.exercises.find((e) => e.exerciseId === 'barbell-bench-press');
    if (!bench) throw new Error('barbell-bench-press is not in the first prescribed day');
    const res = await client.gym.session.upsertMany.mutate({
      docs: [benchSession(addDaysLocal(today, -3), bench)],
    });
    expect(Object.keys(res)).toEqual(['results']);
    expect(Object.keys(res.results[0] ?? {}).sort()).toEqual(['id', 'status']);
  });

  it('tracker.logRecipe and logCustomMeal answer only their pre-progress keys', async () => {
    const allowed = ['log', 'rebalance', 'rebalancePreview', 'dayFit', 'entryId'];
    const custom = await client.tracker.logCustomMeal.mutate({
      date: addDaysLocal(today, -1),
      name: 'Old binary meal',
      estimatedBy: 'manual',
      mealType: 'lunch',
      kcal: 300,
      protein: 10,
      carbs: 30,
      fat: 10,
    });
    expect(Object.keys(custom).filter((k) => !allowed.includes(k))).toEqual([]);

    if (!recipeId) return; // empty catalog: logRecipe not exercised
    const logged = await client.tracker.logRecipe.mutate({
      date: addDaysLocal(today, -1),
      recipeId,
      mealType: 'dinner',
      portionMultiplier: 1,
    });
    expect(Object.keys(logged).filter((k) => !allowed.includes(k))).toEqual([]);
  });
});
