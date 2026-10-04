import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  exerciseRepository,
  gymProfileRepository,
  routineRepository,
  type CoachingLink,
  type IExerciseRepository,
  type IGymProfileRepository,
  type IRoutineRepository,
  type RoutineDayWriteData,
  type RoutineWithDays,
} from '@chefer/database';
import {
  COACHING_COPY,
  type clearNextTargetInputSchema,
  type createClientRoutineInputSchema,
  type NextTargetDto,
  type saveTrainerRoutineInputSchema,
  type setNextTargetInputSchema,
  type TrainerRoutineDto,
} from '@chefer/types';
import {
  diffRoutineDoc,
  isStrengthTrackingType,
  normalizeSupersets,
  repBucket,
  trackingTypeOf,
} from '@chefer/utils';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { ConflictCause } from '../../lib/conflict.js';
import { ensureExerciseLibrary } from '../../lib/exercise-library/ensure.js';
import { serverToday } from '../gym/mappers.js';
import { progressionService, type ProgressionService } from '../gym/progression.service.js';
import { templateToDays } from '../gym/routine.service.js';
import type { CoachingAccess } from './coaching-access.service.js';
import { coachingContentService, type CoachingContentService } from './coaching-content.service.js';

// ─── Trainer coaching: the trainer's writes (spec §5.3, §6, §7.2) ─────────────
// The only two write paths into a client's data: the routine document and
// next-session targets. Authorization already happened (`requireCoachingAccess
// ('write')`). Everything else here is validation the client's own save doesn't
// have: only Chefer's curated exercises may be ADDED (a custom exercise of the
// client's already in the routine can stay, but not be added again), and the
// trainer path never writes the client's own `notes`.

export type SaveTrainerRoutineInput = z.infer<typeof saveTrainerRoutineInputSchema>;
export type CreateClientRoutineInput = z.infer<typeof createClientRoutineInputSchema>;
export type SetNextTargetInput = z.infer<typeof setNextTargetInputSchema>;
export type ClearNextTargetInput = z.infer<typeof clearNextTargetInputSchema>;

export interface TrainerRoutineDeps {
  routines: Pick<IRoutineRepository, 'findActive' | 'replaceDocument' | 'create'>;
  exercises: Pick<IExerciseRepository, 'findVisibleByIds'>;
  gymProfiles: Pick<IGymProfileRepository, 'findByUserId'>;
  content: Pick<CoachingContentService, 'routineDto' | 'nextTarget' | 'conflictDto'>;
  progression: Pick<ProgressionService, 'setOverride' | 'clearOverride'>;
  ensureLibrary: () => Promise<void>;
  now: () => Date;
}

const defaultDeps: TrainerRoutineDeps = {
  routines: routineRepository,
  exercises: exerciseRepository,
  gymProfiles: gymProfileRepository,
  content: coachingContentService,
  progression: progressionService,
  ensureLibrary: ensureExerciseLibrary,
  now: () => new Date(),
};

function requireLink(access: CoachingAccess): CoachingLink {
  if (!access.link) throw clientUnavailableError();
  return access.link;
}

export class TrainerRoutineService {
  private readonly deps: TrainerRoutineDeps;

  constructor(deps: Partial<TrainerRoutineDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * `trainer.client.saveRoutine`: version-checked like the client's own save (a
   * stale version is CONFLICT with `error.data.conflict = { kind: 'routine',
   * current: RoutineDto }`, so the editors' existing conflict dialog works).
   * Stamps the rows the trainer changed.
   */
  async saveRoutine(
    access: CoachingAccess,
    input: SaveTrainerRoutineInput,
  ): Promise<TrainerRoutineDto> {
    const link = requireLink(access);
    const { clientId, trainerId } = access;
    const active = await this.activeRoutine(clientId);
    if (active.id !== input.routine.id) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: COACHING_COPY.server.routineSwitched,
      });
    }
    await this.assertExercisesAllowed(clientId, active, input.routine);

    const doc = input.routine;
    const res = await this.deps.routines.replaceDocument(
      clientId,
      doc.id,
      {
        name: doc.name.trim(),
        days: doc.days.map(
          (d): RoutineDayWriteData => ({
            id: d.id,
            name: d.name.trim(),
            plannedWeekday: d.plannedWeekday,
            // Canonical superset letters, whatever the editor sent.
            exercises: normalizeSupersets(
              d.exercises.map((e) => ({
                id: e.id,
                exerciseId: e.exerciseId,
                sets: e.sets,
                repMin: e.repMin,
                repMax: e.repMax,
                targetRir: e.targetRir,
                restSec: e.restSec,
                supersetGroup: e.supersetGroup,
                // The client's own note is never written here (kept as stored; null on new rows).
                notes: null,
                trainerNote: e.trainerNote?.trim() ? e.trainerNote.trim() : null,
              })),
            ),
          }),
        ),
      },
      input.expectedVersion,
      { actorId: trainerId, path: 'TRAINER', diff: diffRoutineDoc },
    );
    if (res.status === 'not_found') {
      throw new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.noActiveRoutine });
    }
    const today = serverToday(this.deps.now());
    if (res.status === 'conflict') {
      const current = await this.deps.content.conflictDto(res.current, trainerId);
      throw new TRPCError({
        code: 'CONFLICT',
        message: `This routine was changed elsewhere (now version ${current.version}).`,
        cause: new ConflictCause({ kind: 'routine', current }),
      });
    }
    return this.deps.content.routineDto(res.routine, link, clientId, today);
  }

  /** `trainer.client.createRoutine`: only when the client has no active routine; made active in the client's account. */
  async createRoutine(
    access: CoachingAccess,
    input: CreateClientRoutineInput,
  ): Promise<TrainerRoutineDto> {
    const link = requireLink(access);
    const { clientId, trainerId } = access;
    if (await this.deps.routines.findActive(clientId)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: COACHING_COPY.server.clientHasRoutine });
    }
    const now = this.deps.now();
    let draft: { name: string; templateKey: string | null; days: RoutineDayWriteData[] };
    if (input.templateKey) {
      await this.deps.ensureLibrary();
      const profile = await this.deps.gymProfiles.findByUserId(clientId);
      const t = templateToDays(input.templateKey, profile?.equipmentAccess ?? 'FULL_GYM');
      draft = { name: t.name, templateKey: input.templateKey, days: t.days };
    } else {
      draft = {
        name: 'Training plan',
        templateKey: null,
        days: Array.from({ length: input.days ?? 3 }, (_, i) => ({
          name: `Day ${i + 1}`,
          plannedWeekday: null,
          exercises: [],
        })),
      };
    }
    const row = await this.deps.routines.create(clientId, {
      ...draft,
      isActive: true,
      editedBy: { id: trainerId, at: now },
    });
    return this.deps.content.routineDto(row, link, clientId, serverToday(now));
  }

  /**
   * `trainer.client.setNextTarget`: the D5c override on the client's progression
   * with `setById` = the trainer. The progression state is never touched, so the
   * engine continues from what was actually lifted. Last write wins (spec §9.2).
   */
  async setNextTarget(access: CoachingAccess, input: SetNextTargetInput): Promise<NextTargetDto> {
    const { clientId, trainerId } = access;
    await this.assertTargetable(clientId, input.exerciseId, input.repBucket);
    await this.deps.progression.setOverride(
      clientId,
      {
        exerciseId: input.exerciseId,
        repBucket: input.repBucket,
        weightKg: input.weightKg,
        reps: input.reps,
      },
      { setById: trainerId },
    );
    return this.deps.content.nextTarget(clientId, input.exerciseId, input.repBucket);
  }

  /** `trainer.client.clearNextTarget`: "Reset to app suggestion". Clearing nothing is fine. */
  async clearNextTarget(
    access: CoachingAccess,
    input: ClearNextTargetInput,
  ): Promise<NextTargetDto> {
    const { clientId } = access;
    await this.assertTargetable(clientId, input.exerciseId, input.repBucket);
    try {
      await this.deps.progression.clearOverride(clientId, {
        exerciseId: input.exerciseId,
        repBucket: input.repBucket,
      });
    } catch (err) {
      // No progression row yet: there is no target to clear.
      if (!(err instanceof TRPCError && err.code === 'NOT_FOUND')) throw err;
    }
    return this.deps.content.nextTarget(clientId, input.exerciseId, input.repBucket);
  }

  // ─── internals ───────────────────────────────────────────────────────────────

  private async activeRoutine(clientId: string): Promise<RoutineWithDays> {
    const row = await this.deps.routines.findActive(clientId);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.noActiveRoutine });
    }
    return row;
  }

  /**
   * Every exercise must exist for the client. A custom one (owned by the client)
   * may stay: the saved doc may not use it more often than the stored routine
   * does. Everything new comes from the curated library.
   */
  private async assertExercisesAllowed(
    clientId: string,
    stored: RoutineWithDays,
    doc: SaveTrainerRoutineInput['routine'],
  ): Promise<void> {
    const counts = (ids: readonly string[]) => {
      const m = new Map<string, number>();
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
      return m;
    };
    const incoming = counts(doc.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    const existing = counts(stored.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    const rows = await this.deps.exercises.findVisibleByIds(clientId, [...incoming.keys()]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const [id, n] of incoming) {
      const row = byId.get(id);
      if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown exercise: ${id}` });
      if (row.ownerId !== null && n > (existing.get(id) ?? 0)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: COACHING_COPY.server.customExerciseNotAllowed,
        });
      }
    }
  }

  /** The exercise is a strength exercise in the client's active routine, with a row in this rep bucket. */
  private async assertTargetable(
    clientId: string,
    exerciseId: string,
    bucket: string,
  ): Promise<void> {
    const active = await this.activeRoutine(clientId);
    const inBucket = active.days
      .flatMap((d) => d.exercises)
      .some((e) => e.exerciseId === exerciseId && repBucket(e.repMin, e.repMax) === bucket);
    const [exercise] = await this.deps.exercises.findVisibleByIds(clientId, [exerciseId]);
    if (!inBucket || !exercise || !isStrengthTrackingType(trackingTypeOf(exercise))) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: COACHING_COPY.server.exerciseNotInRoutine,
      });
    }
  }
}

export const trainerRoutineService = new TrainerRoutineService();
