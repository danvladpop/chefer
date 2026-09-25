// Session-level assembly shared by the API (bootstrap) and clients (offline
// optimistic update after Finish): next-workout building, rotation, and
// session → exposure mapping.
import type {
  EquipmentProfile,
  ExerciseSlot,
  Exposure,
  GymBootstrap,
  GymProfileDto,
  NextWorkoutDto,
  NextWorkoutExerciseDto,
  ProgressionDto,
  ProgressionOverride,
  ProgressionState,
  Rir,
  RoutineDto,
  SessionSummaryDto,
  TrainingProfileFacts,
  WorkoutSessionDoc,
} from '@chefer/types';
import { deloadContinues } from './deload';
import { durationMinutes } from './duration';
import { applyExposure, initialState, prescribe, progressionKey, repBucket } from './progression';
import type { ExerciseLookup } from './volume';
import { warmupSets } from './warmups';
import { addDaysLocal, settleWeeks, weekStartOf, type WeekRow } from './weeks';

export interface ProgressionEntry {
  state: ProgressionState;
  override: ProgressionOverride | null;
}

function toRir(v: number | null): Rir | null {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : null;
}

/** GymProfileDto → the engine's equipment inventory. */
export function equipmentProfileOf(profile: GymProfileDto): EquipmentProfile {
  return {
    unit: profile.unit,
    barWeightKg: profile.barWeightKg,
    platePairsKg: profile.platePairsKg,
    dumbbellsKg: profile.dumbbellsKg,
    machineStepKg: profile.machineStepKg,
    cableStepKg: profile.cableStepKg,
    hasDipBelt: profile.hasDipBelt,
    microPlates: profile.microPlates,
  };
}

function sortedDays(routine: RoutineDto): RoutineDto['days'] {
  return [...routine.days].sort((a, b) => a.position - b.position);
}

/** Next day in the rotation after `completedDayId` (wraps; unknown id → first day). */
export function nextDayIdAfter(routine: RoutineDto, completedDayId: string | null): string | null {
  const days = sortedDays(routine);
  const idx = completedDayId === null ? -1 : days.findIndex((d) => d.id === completedDayId);
  if (idx < 0) {
    return days[0]?.id ?? null;
  }
  return days[(idx + 1) % days.length]?.id ?? null;
}

/** Newest first: localDate, then startedAt, then id. */
function newestFirst(a: SessionSummaryDto, b: SessionSummaryDto): number {
  return (
    b.localDate.localeCompare(a.localDate) ||
    b.startedAt.localeCompare(a.startedAt) ||
    b.id.localeCompare(a.id)
  );
}

function lastTimeFor(
  exerciseId: string,
  recentSessions: SessionSummaryDto[],
): NextWorkoutExerciseDto['lastTime'] {
  const sessions = recentSessions.filter((s) => s.status === 'COMPLETED').sort(newestFirst);
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
    if (!ex) {
      continue;
    }
    const sets = ex.sets
      .filter((x) => !x.isWarmup && x.completed)
      .map((x) => ({ weightKg: x.weightKg, reps: x.reps }));
    if (sets.length > 0) {
      return { localDate: s.localDate, sets, lastSetRir: ex.lastSetRir };
    }
  }
  return null;
}

/** Prescriptions + warm-ups + last-time columns for one routine day. */
export function buildNextWorkout(input: {
  routine: RoutineDto;
  dayId: string;
  lookup: ExerciseLookup;
  /** Keyed by progressionKey(exerciseId, repBucket). */
  progressions: ReadonlyMap<string, ProgressionEntry>;
  profile: EquipmentProfile;
  facts: TrainingProfileFacts;
  today: string;
  recentSessions: SessionSummaryDto[];
  isDeload: boolean;
}): NextWorkoutDto {
  const { routine, lookup, profile, facts } = input;
  const day = routine.days.find((d) => d.id === input.dayId);
  if (!day) {
    throw new Error(`Routine ${routine.id} has no day ${input.dayId}`);
  }
  const seenPatterns = new Set<string>();
  const exercises: NextWorkoutExerciseDto[] = [];
  for (const re of [...day.exercises].sort((a, b) => a.position - b.position)) {
    const meta = lookup(re.exerciseId);
    if (!meta) {
      continue;
    }
    const slot: ExerciseSlot = {
      exercise: meta,
      sets: re.sets,
      repMin: re.repMin,
      repMax: re.repMax,
      targetRir: re.targetRir,
      restSec: re.restSec,
    };
    const bucket = repBucket(re.repMin, re.repMax);
    const entry = input.progressions.get(progressionKey(re.exerciseId, bucket));
    const state = entry?.state ?? initialState({ slot, profile, experience: facts.experience });
    const suggestion = prescribe({
      slot,
      state,
      override: entry?.override ?? null,
      profile,
      facts,
      today: input.today,
      deload: input.isDeload,
    });
    const isFirstForPattern = !seenPatterns.has(meta.movementPattern);
    seenPatterns.add(meta.movementPattern);
    exercises.push({
      routineExerciseId: re.id,
      exerciseId: re.exerciseId,
      position: exercises.length,
      sets: suggestion.sets,
      repMin: re.repMin,
      repMax: re.repMax,
      targetRir: re.targetRir,
      restSec: re.restSec,
      supersetGroup: re.supersetGroup,
      notes: re.notes,
      repBucket: bucket,
      suggestion,
      warmups: warmupSets({ slot, workingKg: suggestion.weightKg, isFirstForPattern, profile }),
      lastTime: lastTimeFor(re.exerciseId, input.recentSessions),
    });
  }
  const estimatedMin = durationMinutes(
    {
      name: day.name,
      exercises: exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        restSec: e.restSec,
      })),
    },
    lookup,
  );
  return {
    routineId: routine.id,
    dayId: day.id,
    dayName: day.name,
    isDeload: input.isDeload,
    estimatedMin,
    exercises,
  };
}

/** One Exposure per non-skipped exercise of a COMPLETED session. */
export function exposuresFromSession(
  doc: WorkoutSessionDoc,
): { exerciseId: string; exposure: Exposure }[] {
  if (doc.status !== 'COMPLETED') {
    return [];
  }
  return [...doc.exercises]
    .sort((a, b) => a.position - b.position)
    .filter((se) => !se.skipped)
    .map((se) => ({
      exerciseId: se.exerciseId,
      exposure: {
        sessionId: doc.id,
        localDate: doc.localDate,
        performedAt: doc.startedAt,
        sets: se.prescription.sets,
        repMin: se.repMin,
        repMax: se.repMax,
        targetRir: se.targetRir,
        loggedSets: [...se.sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            weightKg: s.weightKg,
            reps: s.reps,
            isWarmup: s.isWarmup,
            completed: s.completedAt !== null,
          })),
        lastSetRir: toRir(se.lastSetRir),
        wasDeload: doc.isDeload || se.prescription.kind === 'deload',
        skipped: false,
      },
    }));
}

export function toSessionSummary(doc: WorkoutSessionDoc): SessionSummaryDto {
  return {
    id: doc.id,
    name: doc.name,
    routineDayId: doc.routineDayId,
    status: doc.status,
    localDate: doc.localDate,
    startedAt: doc.startedAt,
    finishedAt: doc.finishedAt,
    isDeload: doc.isDeload,
    exercises: [...doc.exercises]
      .sort((a, b) => a.position - b.position)
      .map((se) => ({
        exerciseId: se.exerciseId,
        skipped: se.skipped,
        lastSetRir: toRir(se.lastSetRir),
        notes: se.notes,
        sets: [...se.sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            weightKg: s.weightKg,
            reps: s.reps,
            isWarmup: s.isWarmup,
            completed: s.completedAt !== null,
          })),
      })),
  };
}

/** Re-settle cached weeks after adding one session on `localDate` (optimistic). */
function resettleWeeks(
  bootstrap: GymBootstrap,
  goal: number,
  localDate: string | null,
  today: string,
): Pick<GymBootstrap, 'weeks' | 'streak'> {
  const current = weekStartOf(today);
  const rows: WeekRow[] = bootstrap.weeks.map((w) => ({
    weekStart: w.weekStart,
    goal: w.goal,
    sessions: w.sessions,
    paused: w.status === 'paused',
  }));
  const lastRow = rows[rows.length - 1];
  let wk = lastRow ? addDaysLocal(lastRow.weekStart, 7) : current;
  for (; wk <= current; wk = addDaysLocal(wk, 7)) {
    rows.push({ weekStart: wk, goal, sessions: 0, paused: false });
  }
  if (localDate !== null) {
    const row = rows.find((r) => r.weekStart === weekStartOf(localDate));
    if (row) {
      row.sessions += 1;
    }
  }
  const settled = settleWeeks(rows, current);
  return {
    weeks: settled.weeks,
    streak: { ...settled.streak, best: Math.max(settled.streak.best, bootstrap.streak.best) },
  };
}

/**
 * Offline optimistic update: fold a just-finished session into a cached
 * bootstrap (progressions, rotation pointer, next workout, recent sessions,
 * weeks/streak). The server's later bootstrap must be identical.
 *
 * Contract notes for the API (G1-B) so both sides agree:
 * - an override whose `at` is not after the session's start is consumed (cleared);
 * - `bootstrap.weeks` should start at the setup week (flex tokens are re-derived);
 * - a deload week lasts `days.length` sessions (see deloadContinues).
 */
export function applyFinishedSession(input: {
  bootstrap: GymBootstrap;
  doc: WorkoutSessionDoc;
  lookup: ExerciseLookup;
  facts: TrainingProfileFacts;
  today: string;
}): GymBootstrap {
  const { bootstrap, doc, lookup, facts, today } = input;
  if (doc.status !== 'COMPLETED' || !bootstrap.profile) {
    return bootstrap;
  }
  const profile = equipmentProfileOf(bootstrap.profile);
  const routine = bootstrap.activeRoutine;
  const routineExercises = new Map(
    (routine?.days ?? []).flatMap((d) => d.exercises.map((e) => [e.id, e] as const)),
  );
  const alreadyCounted = bootstrap.recentSessions.some(
    (s) => s.id === doc.id && s.status === 'COMPLETED',
  );

  // 1. Progressions.
  const progressions: ProgressionDto[] = [...bootstrap.progressions];
  if (!alreadyCounted) {
    for (const { exerciseId, exposure } of exposuresFromSession(doc)) {
      const meta = lookup(exerciseId);
      const se = doc.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
      if (!meta || !se) {
        continue;
      }
      const bucket = repBucket(exposure.repMin, exposure.repMax);
      const idx = progressions.findIndex(
        (p) => p.exerciseId === exerciseId && p.repBucket === bucket,
      );
      const existing = idx >= 0 ? progressions[idx] : undefined;
      // A backfilled session older than this exercise's last exposure can't be
      // folded incrementally on top (the fold is chronological). Leave the
      // cached state; the server re-folds full history on sync and the next
      // bootstrap carries the right prescription.
      const lastSeen = existing?.state.lastExposureDate ?? null;
      if (lastSeen !== null && exposure.localDate < lastSeen) {
        continue;
      }
      const re = se.routineExerciseId ? routineExercises.get(se.routineExerciseId) : undefined;
      const slot: ExerciseSlot = {
        exercise: meta,
        sets: re?.sets ?? existing?.suggestion.sets ?? exposure.sets,
        repMin: exposure.repMin,
        repMax: exposure.repMax,
        targetRir: exposure.targetRir,
        restSec: se.restSec,
      };
      const prior =
        existing?.state ?? initialState({ slot, profile, experience: facts.experience });
      const state = applyExposure({
        slot,
        state: prior,
        exposure,
        profile,
        experience: facts.experience,
      });
      const override =
        existing?.override && existing.override.at > doc.startedAt ? existing.override : null;
      const suggestion = prescribe({
        slot,
        state,
        override,
        profile,
        facts,
        today,
        deload: false,
      });
      const dto: ProgressionDto = { exerciseId, repBucket: bucket, state, override, suggestion };
      if (idx >= 0) {
        progressions[idx] = dto;
      } else {
        progressions.push(dto);
      }
    }
  }

  // 2. Recent sessions (newest first, replacing any earlier copy of this doc).
  const recentSessions = [
    toSessionSummary(doc),
    ...bootstrap.recentSessions.filter((s) => s.id !== doc.id),
  ].sort(newestFirst);

  // 3. Rotation pointer.
  let activeRoutine = routine;
  if (routine && doc.routineDayId && routine.days.some((d) => d.id === doc.routineDayId)) {
    activeRoutine = { ...routine, nextDayId: nextDayIdAfter(routine, doc.routineDayId) };
  }

  // 4. Next workout.
  let nextWorkout = bootstrap.nextWorkout;
  if (activeRoutine?.nextDayId) {
    const map = new Map<string, ProgressionEntry>(
      progressions.map((p) => [
        progressionKey(p.exerciseId, p.repBucket),
        { state: p.state, override: p.override },
      ]),
    );
    const isDeload =
      (bootstrap.nextWorkout?.isDeload ?? false) &&
      deloadContinues(recentSessions, activeRoutine.days.length);
    nextWorkout = buildNextWorkout({
      routine: activeRoutine,
      dayId: activeRoutine.nextDayId,
      lookup,
      progressions: map,
      profile,
      facts,
      today,
      recentSessions,
      isDeload,
    });
  }

  // 5. Weeks & streak.
  const { weeks, streak } = resettleWeeks(
    bootstrap,
    bootstrap.profile.weeklyGoal,
    alreadyCounted ? null : doc.localDate,
    today,
  );

  return {
    ...bootstrap,
    activeRoutine,
    nextWorkout,
    progressions,
    recentSessions,
    weeks,
    streak,
  };
}
