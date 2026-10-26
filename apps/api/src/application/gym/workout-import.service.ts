import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  exerciseRepository,
  workoutSessionRepository,
  type IExerciseRepository,
  type IWorkoutSessionRepository,
} from '@chefer/database';
import {
  GYM_MAX_EXERCISES_PER_SESSION,
  GYM_MAX_REPS,
  GYM_MAX_SETS_PER_EXERCISE,
  type CustomExerciseInput,
  type ExerciseTrackingType,
  type ImportedExercise,
  type ImportedWorkout,
  type Muscle,
  type ParsedWorkoutImport,
  type SessionExerciseDoc,
  type WorkoutImportCommitInput,
  type WorkoutImportExerciseRowDto,
  type WorkoutImportPreviewDto,
  type WorkoutImportPreviewInput,
  type WorkoutImportResultDto,
  type WorkoutSessionDoc,
} from '@chefer/types';
import {
  ENGINE_VERSION,
  importedExerciseEquipment,
  importedExerciseKind,
  ImportExerciseMatcher,
  importReviewRows,
  isValidTimeZone,
  normalizeExerciseName,
  parseWorkoutCsv,
  zonedToUtc,
  type ImportLibraryExercise,
} from '@chefer/utils';
import { exerciseLibraryService, type ExerciseLibraryService } from './exercise-library.service.js';
import { workoutSessionService, type WorkoutSessionService } from './workout-session.service.js';

// ─── gym.import.* (G2, market review 2026-10) ────────────────────────────────
// Strong / Hevy CSV → COMPLETED sessions. Two stateless steps — the client
// sends the file to both, so nothing is held on the server between them:
//   preview  parse, match every exercise name to the library, count what a
//            re-import would skip;
//   commit   apply the user's choices (map / create / skip), write the sessions.
// Idempotent by construction: every id is a UUIDv5 of the user and the
// workout's stable key, so the same file imported twice finds its sessions
// already there and writes nothing (and a session edited since is never
// overwritten).

/** Namespace for the import's UUIDv5 ids (random, fixed forever). */
const IMPORT_NAMESPACE = '6d3b4f0e-8c51-4b8e-9b1f-2a7c5e9d4f10';

/** RFC 4122 version-5 (SHA-1) UUID of `name` in `namespace`. */
export function uuidV5(name: string, namespace: string = IMPORT_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const sessionIdFor = (userId: string, workout: Pick<ImportedWorkout, 'key'>): string =>
  uuidV5(`${userId}|${workout.key}`);

const COMPOUND = /squat|deadlift|press|row|pull|chin|dip|lunge|clean|snatch|jerk|thrust|carry/;

const TRACKING_BY_KIND: Record<WorkoutImportExerciseRowDto['kind'], ExerciseTrackingType> = {
  strength: 'WEIGHT_REPS',
  bodyweight: 'BODYWEIGHT_REPS',
  timed: 'DURATION',
  cardio: 'DURATION_DISTANCE',
};

/** "Create as my own exercise": what the file implies, plus the muscle the user picked. */
export function customExerciseFor(
  name: string,
  kind: WorkoutImportExerciseRowDto['kind'],
  primaryMuscle: Muscle,
): CustomExerciseInput {
  const fromName = importedExerciseEquipment(name);
  const equipment =
    fromName ?? (kind === 'cardio' ? 'OUTDOOR' : kind === 'strength' ? 'BARBELL' : 'BODYWEIGHT');
  const timed = kind === 'timed' || kind === 'cardio';
  return {
    name: name.trim().slice(0, 60).padEnd(2, '.'),
    category: COMPOUND.test(normalizeExerciseName(name)) ? 'COMPOUND' : 'ISOLATION',
    equipment,
    loadType:
      equipment === 'ASSISTED' ? 'ASSISTED' : kind === 'strength' ? 'WEIGHTED' : 'BODYWEIGHT',
    primaryMuscles: [primaryMuscle],
    secondaryMuscles: [],
    repMin: timed ? 30 : 8,
    repMax: timed ? 60 : 12,
    restSec: 90,
    isTimed: timed,
    cues: [],
    trackingType: TRACKING_BY_KIND[kind],
  };
}

type LibraryRow = ImportLibraryExercise & { repMin: number; repMax: number; restSec: number };

/** RPE of the last working set → Chefer's "reps in reserve" on that set (0…3+). */
function lastSetRir(sets: ImportedExercise['sets']): 0 | 1 | 2 | 3 | null {
  const rpe = [...sets].reverse().find((s) => s.kind !== 'warmup')?.rpe ?? null;
  if (rpe === null) return null;
  return Math.min(3, Math.max(0, Math.round(10 - rpe))) as 0 | 1 | 2 | 3;
}

export class WorkoutImportService {
  constructor(
    private readonly exerciseRepo: Pick<IExerciseRepository, 'findVisible'> = exerciseRepository,
    private readonly sessionRepo: Pick<
      IWorkoutSessionRepository,
      'findExistingIds'
    > = workoutSessionRepository,
    private readonly sessions: Pick<WorkoutSessionService, 'importDocs'> = workoutSessionService,
    private readonly library: Pick<ExerciseLibraryService, 'createCustom'> = exerciseLibraryService,
  ) {}

  async preview(
    userId: string,
    input: WorkoutImportPreviewInput,
  ): Promise<WorkoutImportPreviewDto> {
    const parsed = parseWorkoutCsv(input.csv, { weightUnit: input.weightUnit });
    if (!parsed.ok) {
      return parsed.reason === 'needs_unit' && parsed.source
        ? { status: 'needs_unit', source: parsed.source }
        : {
            status: 'invalid',
            reason: parsed.reason === 'needs_unit' ? 'unknown_format' : parsed.reason,
          };
    }
    const { workouts } = parsed.import;
    const [library, existing] = await Promise.all([
      this.libraryFor(userId),
      this.sessionRepo.findExistingIds(
        userId,
        workouts.map((w) => sessionIdFor(userId, w)),
      ),
    ]);
    return {
      status: 'ready',
      source: parsed.import.source,
      weightUnit: parsed.import.weightUnit,
      workouts: workouts.length,
      sets: workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0),
      firstDate: workouts[0]?.localDate ?? '',
      lastDate: workouts.at(-1)?.localDate ?? '',
      alreadyImported: existing.length,
      exercises: importReviewRows(workouts, new ImportExerciseMatcher(library)),
    };
  }

  async commit(userId: string, input: WorkoutImportCommitInput): Promise<WorkoutImportResultDto> {
    const parsed = parseWorkoutCsv(input.csv, { weightUnit: input.weightUnit });
    if (!parsed.ok) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          parsed.reason === 'needs_unit'
            ? 'Tell us whether this file is in kilograms or pounds.'
            : "That file doesn't look like a Strong or Hevy workout export.",
      });
    }
    const library = await this.libraryFor(userId);
    const { targets, created } = await this.resolveTargets(userId, parsed.import, input, library);
    const timeZone = isValidTimeZone(input.timeZone) ? input.timeZone : 'UTC';

    let trimmedSets = 0;
    let skippedWorkouts = 0;
    const docs: WorkoutSessionDoc[] = [];
    for (const workout of parsed.import.workouts) {
      const built = this.buildDoc(userId, workout, targets, timeZone);
      trimmedSets += built.trimmedSets;
      if (built.doc) docs.push(built.doc);
      else skippedWorkouts++;
    }
    const counts = await this.sessions.importDocs(userId, docs, parsed.import.source);
    const dates = docs.map((d) => d.localDate);
    return {
      source: parsed.import.source,
      imported: counts.written,
      alreadyImported: counts.existing,
      skippedWorkouts: skippedWorkouts + counts.rejected,
      createdExercises: created,
      trimmedSets,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    };
  }

  /** Curated + the user's own custom exercises (not archived) as matcher input. */
  private async libraryFor(userId: string): Promise<LibraryRow[]> {
    const rows = await this.exerciseRepo.findVisible(userId);
    return rows
      .filter((e) => e.archivedAt === null)
      .map((e) => ({
        id: e.id,
        name: e.name,
        aliases: e.aliases,
        equipment: e.equipment,
        primaryMuscles: e.primaryMuscles as Muscle[],
        custom: e.ownerId !== null,
        repMin: e.repMin,
        repMax: e.repMax,
        restSec: e.restSec,
      }));
  }

  /** name → the library row each exercise name lands on (absent = skipped). */
  private async resolveTargets(
    userId: string,
    parsed: ParsedWorkoutImport,
    input: WorkoutImportCommitInput,
    library: LibraryRow[],
  ): Promise<{ targets: Map<string, LibraryRow>; created: number }> {
    const byId = new Map(library.map((e) => [e.id, e]));
    const ownByName = new Map(
      library.filter((e) => e.custom).map((e) => [normalizeExerciseName(e.name), e]),
    );
    const setsByName = new Map<string, ImportedExercise['sets']>();
    for (const w of parsed.workouts) {
      for (const e of w.exercises)
        setsByName.set(e.name, [...(setsByName.get(e.name) ?? []), ...e.sets]);
    }
    const targets = new Map<string, LibraryRow>();
    let created = 0;
    for (const { name, action } of input.mappings) {
      const sets = setsByName.get(name);
      if (!sets || action.type === 'skip') continue;
      if (action.type === 'existing') {
        const row = byId.get(action.exerciseId);
        if (!row) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown exercise for "${name}".` });
        }
        targets.set(name, row);
        continue;
      }
      // "Create": reuse the user's own exercise of that name (a second import of the same file).
      const reuse = ownByName.get(normalizeExerciseName(name));
      if (reuse) {
        targets.set(name, reuse);
        continue;
      }
      const dto = await this.library.createCustom(
        userId,
        customExerciseFor(name, importedExerciseKind(sets), action.primaryMuscle),
      );
      const row: LibraryRow = {
        id: dto.id,
        name: dto.name,
        aliases: [],
        equipment: dto.equipment,
        primaryMuscles: dto.primaryMuscles,
        custom: true,
        repMin: dto.repMin,
        repMax: dto.repMax,
        restSec: dto.restSec,
      };
      ownByName.set(normalizeExerciseName(name), row);
      targets.set(name, row);
      created++;
    }
    return { targets, created };
  }

  private buildDoc(
    userId: string,
    workout: ImportedWorkout,
    targets: Map<string, LibraryRow>,
    timeZone: string,
  ): { doc: WorkoutSessionDoc | null; trimmedSets: number } {
    const id = sessionIdFor(userId, workout);
    const started = zonedToUtc(workout.localDate, workout.localTime, timeZone);
    const finished = new Date(started.getTime() + (workout.durationSec ?? 0) * 1000);
    const doneAt = finished.toISOString();
    let trimmedSets = 0;

    const mapped = workout.exercises.filter((e) => targets.has(e.name));
    trimmedSets += mapped
      .slice(GYM_MAX_EXERCISES_PER_SESSION)
      .reduce((n, e) => n + e.sets.length, 0);
    const exercises: SessionExerciseDoc[] = mapped
      .slice(0, GYM_MAX_EXERCISES_PER_SESSION)
      .map((imported, position) => {
        const target = targets.get(imported.name)!;
        const exerciseId = uuidV5(`${id}|${position}|${imported.name}`);
        trimmedSets += Math.max(0, imported.sets.length - GYM_MAX_SETS_PER_EXERCISE);
        const sets = imported.sets.slice(0, GYM_MAX_SETS_PER_EXERCISE);
        const working = sets.filter((s) => s.kind !== 'warmup');
        const strength = sets.some((s) => s.weightKg > 0 || (s.reps ?? 0) > 0);
        return {
          id: exerciseId,
          exerciseId: target.id,
          routineExerciseId: null,
          position,
          repMin: Math.min(target.repMin, target.repMax),
          repMax: target.repMax,
          targetRir: 2,
          restSec: Math.min(900, target.restSec),
          skipped: false,
          swappedFromId: null,
          lastSetRir: lastSetRir(sets),
          // Inert, like a logged workout's: progression folds the sets, not this.
          prescription: {
            kind: 'hold',
            weightKg: Math.max(0, ...working.map((s) => s.weightKg)),
            reps: [],
            sets: Math.min(10, working.length),
            reasonCode: 'START',
            inputs: {},
            deltaKg: 0,
            engineVersion: ENGINE_VERSION,
          },
          notes: imported.notes?.slice(0, 500) ?? null,
          sets: sets.map((s, j) => ({
            id: uuidV5(`${exerciseId}|${j}`),
            position: j,
            weightKg: s.weightKg,
            reps: Math.min(GYM_MAX_REPS, s.reps ?? 0),
            isWarmup: s.kind === 'warmup',
            completedAt: doneAt,
            ...(s.durationSec !== null && { durationSec: Math.min(10_800, s.durationSec) }),
            ...(s.distanceM !== null && { distanceM: Math.min(1_000_000, s.distanceM) }),
            ...(!strength && s.rpe !== null && { intensityRpe: Math.round(s.rpe) }),
          })),
        };
      });
    if (exercises.length === 0) return { doc: null, trimmedSets };
    return {
      doc: {
        schemaVersion: 1,
        id,
        routineId: null,
        routineDayId: null,
        name: workout.title.slice(0, 80),
        status: 'COMPLETED',
        startedAt: started.toISOString(),
        finishedAt: doneAt,
        localDate: workout.localDate,
        isDeload: false,
        notes: workout.notes?.slice(0, 1000) ?? null,
        clientUpdatedAt: doneAt,
        engineVersion: ENGINE_VERSION,
        exercises,
      },
      trimmedSets,
    };
  }
}

export const workoutImportService = new WorkoutImportService();
