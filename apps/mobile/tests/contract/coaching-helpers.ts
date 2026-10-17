import { randomUUID } from 'node:crypto';
import type { NextWorkoutDto, WorkoutSessionDoc } from '@chefer/types';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail, type ContractClient } from './client';

// Shared plumbing for the trainer-coaching contract files (WP-18: trainer.*,
// coaching.*, coaching-compat). Every scenario registers its own throwaway
// users, so the files are safe next to the other contract suites.

export const COACH_PASSWORD = 'Contract@123!';

export type CoachApi = ContractClient['client'];

export interface CoachUser {
  id: string;
  email: string;
  firstName: string;
  api: CoachApi;
}

export interface MakeCoachUserOptions {
  prefix?: string;
  firstName?: string;
  /** The `x-chefer-api-level` this user's client sends (6 = a coaching bundle, 4 = installed 1.0.1). */
  apiLevel?: number;
  /** Finish gym setup (needed to join as a client). */
  gymSetup?: boolean;
}

/** Register (mobile client, with consent) and optionally finish gym setup. */
export async function makeCoachUser(options: MakeCoachUserOptions = {}): Promise<CoachUser> {
  const c = makeContractClient({ apiLevel: options.apiLevel ?? 6 });
  const firstName = options.firstName ?? `Cx${Math.random().toString(36).slice(2, 8)}`;
  const email = uniqueEmail(options.prefix ?? 'coaching-contract');
  const registered = await c.client.auth.register.mutate({
    email,
    password: COACH_PASSWORD,
    firstName,
    ...CONTRACT_CONSENT,
  });
  if (!registered.session) throw new Error('register response is missing the session credential');
  c.setToken(registered.session.token);
  if (options.gymSetup) await setupGym(c.client);
  return { id: registered.id, email, firstName, api: c.client };
}

/** A second client for the same user, sending a different API level (same session). */
export async function clientAtLevel(user: CoachUser, apiLevel: number): Promise<CoachApi> {
  const c = makeContractClient({ apiLevel });
  const login = await c.client.auth.login.mutate({ email: user.email, password: COACH_PASSWORD });
  if (!login.session) throw new Error('login response is missing the session credential');
  c.setToken(login.session.token);
  return c.client;
}

export async function setupGym(api: CoachApi) {
  const rec = await api.gym.profile.recommend.query({
    days: 3,
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
  });
  return api.gym.profile.completeSetup.mutate({
    days: 3,
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: rec.recommendedKey,
    plannedWeekdays: [0, 2, 4],
    reminderTime: null,
  });
}

/** Whether coaching is on for a fresh user of this API (the suites skip when it is not). */
export async function probeCoachingEnabled(): Promise<boolean> {
  const user = await makeCoachUser({ prefix: 'coaching-probe' });
  const { enabled } = await user.api.coaching.availability.query();
  return enabled;
}

export const NO_COACHING_MESSAGE =
  'Trainer coaching is off on this API (coaching.availability → enabled: false); set FEATURE_FLAGS=coaching (and TRAINER_ALLOWLIST=*) to run the coaching contract suites';

/** Turn trainer tools on and create one invite; returns the code. */
export async function trainerWithInvite(trainer: CoachUser, label = 'Contract client') {
  await trainer.api.trainer.activate.mutate({ displayName: 'Ana' });
  const invite = await trainer.api.trainer.invites.create.mutate({ label });
  return invite;
}

const NOW = Date.now();
export const iso = (offsetMin: number): string => new Date(NOW + offsetMin * 60_000).toISOString();
export const TODAY = iso(0).slice(0, 10);

/**
 * The doc a phone would upload after doing `next` as prescribed, with a private
 * session note, calories and heart rate smuggled on so a test can prove they
 * never reach a trainer.
 */
export function finishedWorkoutFrom(next: NextWorkoutDto, startedAt: Date): WorkoutSessionDoc {
  const at = (offsetMin: number) =>
    new Date(startedAt.getTime() + offsetMin * 60_000).toISOString();
  return {
    schemaVersion: 1,
    id: randomUUID(),
    routineId: next.routineId,
    routineDayId: next.dayId,
    name: next.dayName,
    status: 'COMPLETED',
    startedAt: at(0),
    finishedAt: at(50),
    localDate: TODAY,
    isDeload: false,
    notes: 'SECRET-SESSION-NOTE',
    clientUpdatedAt: at(50),
    engineVersion: 1,
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
      notes: 'SECRET-EXERCISE-NOTE',
      sets: e.suggestion.reps.map((reps, position) => ({
        id: randomUUID(),
        position,
        weightKg: e.suggestion.weightKg,
        reps,
        isWarmup: false,
        completedAt: at(5 + position * 3),
        caloriesKcal: 123,
        avgHeartRateBpm: 142,
      })),
    })),
  };
}

/** Every key path of a JSON value (to scan a response for fields that must not exist). */
export function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => keyPaths(v, prefix));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      `${prefix}${k}`,
      ...keyPaths(v, `${prefix}${k}.`),
    ]);
  }
  return [];
}

/** The parts of a rejected tRPC call the coaching suites assert on. */
export interface RejectedCall {
  code: string;
  message: string;
  data: { reason?: string | null; conflict?: { kind: string; current: unknown } | null };
}

/** `data.code`, the message and the structured `data` of a rejected tRPC call. */
export async function errorOf(promise: Promise<unknown>): Promise<RejectedCall> {
  try {
    await promise;
  } catch (err) {
    const e = err as { message: string; data?: { code?: string } & RejectedCall['data'] };
    return { code: e.data?.code ?? 'UNKNOWN', message: e.message, data: e.data ?? {} };
  }
  throw new Error('expected the call to be rejected');
}
