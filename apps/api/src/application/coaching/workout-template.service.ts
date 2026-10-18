import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  coachingLinkRepository,
  exerciseProgressionRepository,
  exerciseRepository,
  routineRepository,
  workoutTemplateRepository,
  type Exercise,
  type ICoachingLinkRepository,
  type IExerciseProgressionRepository,
  type IExerciseRepository,
  type IRoutineRepository,
  type IWorkoutTemplateRepository,
  type RoutineDayWithExercises,
  type RoutineDayWriteData,
  type RoutineExerciseWriteData,
  type RoutineWithDays,
  type TemplateAssignmentRow,
  type TemplateWriteData,
  type WorkoutTemplateExercise,
  type WorkoutTemplateWithExercises,
} from '@chefer/database';
import {
  TEMPLATE_COPY,
  TRAINER_MODE_LIMITS,
  type AssignTarget,
  type assignTemplateInputSchema,
  type saveTemplateInputSchema,
  type TemplateDoc,
  type updateTemplateClientsInputSchema,
  type WorkoutTemplateAssignmentDto,
  type WorkoutTemplateDto,
  type WorkoutTemplateExerciseDto,
  type WorkoutTemplateSummaryDto,
  type WorkoutTemplateTargetFailure,
  type WorkoutTemplateTargetResult,
  type WorkoutTemplateTargetsResultDto,
} from '@chefer/types';
import {
  diffRoutineDoc,
  displayNameOf,
  estimateDurationMin,
  isStrengthTrackingType,
  normalizeSupersets,
  progressionKey,
  repBucket,
  trackingTypeOf,
} from '@chefer/utils';
import { ConflictCause } from '../../lib/conflict.js';
import { lookupFromRows, toExerciseMeta } from '../gym/mappers.js';
import { progressionService, type ProgressionService } from '../gym/progression.service.js';
import { routineChangeNotifier, type RoutineChangeNotifier } from './routine-change-notifier.js';

// ─── Trainer mode: workout templates (docs/prd-2026-10/trainer-mode.md §6.6) ──
// A template is the trainer's own document (trainerProcedure; another trainer's
// or a deleted one is the single NOT_FOUND). Assigning COPIES it into each
// client's ACTIVE routine through the routine's versioned TRAINER-path write,
// exactly like `trainer.client.saveRoutine`: rows are stamped (attribution
// "Changed by Ana") and the client gets the "<Trainer> updated your routine"
// notice. Each client is checked and written on its own: one client failing
// (not a client any more, no routine, a racing save) never stops the others.
//
// Loads: a template's `defaultLoadKg` becomes the client's next-session target
// (the same D5c override `trainer.client.setNextTarget` writes) ONLY when the
// client has no progression yet for that exercise and rep range. A load the
// client already reached is never overwritten.

export type SaveTemplateInput = z.infer<typeof saveTemplateInputSchema>;
export type AssignTemplateInput = z.infer<typeof assignTemplateInputSchema>;
export type UpdateTemplateClientsInput = z.infer<typeof updateTemplateClientsInputSchema>;

/** The routine day-name limit (`routineDayDocSchema.name`): an added day is named after the template. */
const DAY_NAME_MAX = 40;
/** A routine holds at most 7 days (`routineDocSchema.days`). */
const MAX_ROUTINE_DAYS = 7;

export interface WorkoutTemplateDeps {
  templates: IWorkoutTemplateRepository;
  links: Pick<ICoachingLinkRepository, 'listActiveForTrainer'>;
  routines: Pick<IRoutineRepository, 'findActive' | 'replaceDocument'>;
  exercises: Pick<IExerciseRepository, 'findVisibleByIds'>;
  progressions: Pick<IExerciseProgressionRepository, 'findForUser'>;
  progression: Pick<ProgressionService, 'setOverride'>;
  notifier: Pick<RoutineChangeNotifier, 'trainerSaved'>;
  now: () => Date;
}

const defaultDeps: WorkoutTemplateDeps = {
  templates: workoutTemplateRepository,
  links: coachingLinkRepository,
  routines: routineRepository,
  exercises: exerciseRepository,
  progressions: exerciseProgressionRepository,
  progression: progressionService,
  notifier: routineChangeNotifier,
  now: () => new Date(),
};

function notFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: TEMPLATE_COPY.server.notFound });
}

function toWriteData(doc: TemplateDoc): TemplateWriteData {
  return {
    name: doc.name.trim(),
    workoutType: doc.workoutType,
    // Canonical superset letters, whatever the editor sent.
    exercises: normalizeSupersets(
      doc.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        defaultLoadKg: e.defaultLoadKg,
        trainerNote: e.trainerNote?.trim() ? e.trainerNote.trim() : null,
      })),
    ),
  };
}

function toExerciseDto(e: WorkoutTemplateExercise): WorkoutTemplateExerciseDto {
  return {
    id: e.id,
    exerciseId: e.exerciseId,
    position: e.position,
    sets: e.sets,
    repMin: e.repMin,
    repMax: e.repMax,
    targetRir: e.targetRir,
    restSec: e.restSec,
    supersetGroup: e.supersetGroup,
    defaultLoadKg: e.defaultLoadKg,
    trainerNote: e.trainerNote,
  };
}

/** A stored routine day as a write that keeps it exactly as it is. */
function keepDay(d: RoutineDayWithExercises): RoutineDayWriteData {
  return {
    id: d.id,
    name: d.name,
    plannedWeekday: d.plannedWeekday,
    exercises: d.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRir: e.targetRir,
      restSec: e.restSec,
      supersetGroup: e.supersetGroup,
      // TRAINER path: the client's own note is never written (kept as stored).
      notes: null,
      trainerNote: e.trainerNote,
    })),
  };
}

/**
 * The template's rows as a client's day rows. A stored row of the same exercise
 * keeps its id (first come, first served), so the attribution diff is per row
 * and the client's own note on it survives; the template's cue becomes the
 * client's trainer note.
 */
export function copyTemplateRows(
  rows: readonly WorkoutTemplateExercise[],
  stored: readonly { id: string; exerciseId: string }[],
): RoutineExerciseWriteData[] {
  const pool = new Map<string, string[]>();
  for (const e of stored) pool.set(e.exerciseId, [...(pool.get(e.exerciseId) ?? []), e.id]);
  return normalizeSupersets(
    rows.map((t) => ({
      id: pool.get(t.exerciseId)?.shift(),
      exerciseId: t.exerciseId,
      sets: t.sets,
      repMin: t.repMin,
      repMax: t.repMax,
      targetRir: t.targetRir,
      restSec: t.restSec,
      supersetGroup: t.supersetGroup,
      notes: null,
      trainerNote: t.trainerNote,
    })),
  );
}

/** What one client's copy needs written, or why it can't be. */
type BuildResult =
  | {
      ok: true;
      days: RoutineDayWriteData[];
      /** The index (in `days`) of the day reported back. */
      dayIndex: number;
      /** Exercises the default-load rule may apply to. */
      loadExerciseIds: ReadonlySet<string>;
    }
  | { ok: false; reason: WorkoutTemplateTargetFailure };

export class WorkoutTemplateService {
  private readonly deps: WorkoutTemplateDeps;

  constructor(deps: Partial<WorkoutTemplateDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** `trainer.templates.list`: the library, most recently edited first. */
  async list(trainerId: string): Promise<WorkoutTemplateSummaryDto[]> {
    const [templates, links] = await Promise.all([
      this.deps.templates.listForTrainer(trainerId),
      this.deps.links.listActiveForTrainer(trainerId),
    ]);
    if (templates.length === 0) return [];
    const exerciseIds = [
      ...new Set(templates.flatMap((t) => t.exercises.map((e) => e.exerciseId))),
    ];
    const [exerciseRows, assignments] = await Promise.all([
      this.deps.exercises.findVisibleByIds(trainerId, exerciseIds),
      this.deps.templates.listAssignments(
        templates.map((t) => t.id),
        links.map((l) => l.clientId),
      ),
    ]);
    const { lookup } = lookupFromRows(exerciseRows);
    return templates.map((t) => {
      const mine = assignments.filter((a) => a.templateId === t.id);
      const clients = new Set(mine.map((a) => a.userId));
      const outdated = new Set(
        mine.filter((a) => a.templateVersion < t.version).map((a) => a.userId),
      );
      return {
        id: t.id,
        name: t.name,
        workoutType: t.workoutType,
        exerciseCount: t.exercises.length,
        estimatedMin:
          t.exercises.length === 0
            ? null
            : estimateDurationMin({ name: t.name, exercises: t.exercises }, lookup),
        assignedCount: clients.size,
        outdatedCount: outdated.size,
        updatedAt: t.updatedAt.toISOString(),
      };
    });
  }

  /** `trainer.templates.get`: the editor's document plus the active clients who have a copy. */
  async get(trainerId: string, templateId: string): Promise<WorkoutTemplateDto> {
    const row = await this.deps.templates.find(trainerId, templateId);
    if (!row) throw notFound();
    return this.toDto(trainerId, row);
  }

  /** `trainer.templates.create`: a new template at version 1. */
  async create(trainerId: string, doc: TemplateDoc): Promise<WorkoutTemplateDto> {
    if (
      (await this.deps.templates.countLive(trainerId)) >= TRAINER_MODE_LIMITS.templatesPerTrainer
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: TEMPLATE_COPY.server.limit(TRAINER_MODE_LIMITS.templatesPerTrainer),
      });
    }
    const data = toWriteData(doc);
    const exercises = await this.assertCurated(trainerId, data);
    const row = await this.deps.templates.create(trainerId, data);
    return this.toDto(trainerId, row, exercises);
  }

  /**
   * `trainer.templates.save`: autosave, version-checked. A stale version is
   * CONFLICT with `error.data.conflict = { kind: 'template', current }`.
   */
  async save(trainerId: string, input: SaveTemplateInput): Promise<WorkoutTemplateDto> {
    const data = toWriteData(input.template);
    await this.assertCurated(trainerId, data);
    const res = await this.deps.templates.replaceDocument(
      trainerId,
      input.templateId,
      data,
      input.expectedVersion,
    );
    if (res.status === 'not_found') throw notFound();
    if (res.status === 'conflict') {
      const current = await this.toDto(trainerId, res.current);
      throw new TRPCError({
        code: 'CONFLICT',
        message: `This template was changed elsewhere (now version ${current.version}).`,
        cause: new ConflictCause({ kind: 'template', current }),
      });
    }
    return this.toDto(trainerId, res.template);
  }

  /** `trainer.templates.delete`: soft delete. Clients' copies are untouched ("Based on" stays as text). */
  async delete(trainerId: string, templateId: string): Promise<{ ok: true }> {
    if (!(await this.deps.templates.softDelete(trainerId, templateId, this.deps.now()))) {
      throw notFound();
    }
    return { ok: true };
  }

  /** `trainer.templates.assign`: copy the template into each target client's active routine. */
  async assign(
    trainerId: string,
    input: AssignTemplateInput,
  ): Promise<WorkoutTemplateTargetsResultDto> {
    const template = await this.deps.templates.find(trainerId, input.templateId);
    if (!template) throw notFound();
    const active = await this.activeClientIds(trainerId);
    const results: WorkoutTemplateTargetResult[] = [];
    // One after another: two targets for the same client must not race each other.
    for (const target of input.targets) {
      if (!active.has(target.clientId)) {
        results.push({ clientId: target.clientId, ok: false, reason: 'CLIENT_UNAVAILABLE' });
        continue;
      }
      results.push(
        await this.writeCopy(trainerId, target.clientId, template, (routine) =>
          this.buildAssign(routine, template, target),
        ),
      );
    }
    return { templateId: template.id, templateVersion: template.version, results };
  }

  /**
   * `trainer.templates.updateClients`: each client's copied day(s) get the
   * current version's exercises. Loads are per client (exercise + rep range),
   * so exercises still present keep theirs; new exercises get the default load
   * when the client has none.
   */
  async updateClients(
    trainerId: string,
    input: UpdateTemplateClientsInput,
  ): Promise<WorkoutTemplateTargetsResultDto> {
    const template = await this.deps.templates.find(trainerId, input.templateId);
    if (!template) throw notFound();
    const active = await this.activeClientIds(trainerId);
    const results: WorkoutTemplateTargetResult[] = [];
    for (const clientId of [...new Set(input.clientIds)]) {
      if (!active.has(clientId)) {
        results.push({ clientId, ok: false, reason: 'CLIENT_UNAVAILABLE' });
        continue;
      }
      results.push(
        await this.writeCopy(trainerId, clientId, template, (routine) =>
          this.buildUpdate(routine, template),
        ),
      );
    }
    return { templateId: template.id, templateVersion: template.version, results };
  }

  // ─── internals ───────────────────────────────────────────────────────────────

  private async activeClientIds(trainerId: string): Promise<Set<string>> {
    const links = await this.deps.links.listActiveForTrainer(trainerId);
    return new Set(links.filter((l) => l.clientId !== trainerId).map((l) => l.clientId));
  }

  /** Templates use the curated library only: no custom exercise, not even the trainer's own. */
  private async assertCurated(trainerId: string, data: TemplateWriteData): Promise<Exercise[]> {
    const ids = [...new Set(data.exercises.map((e) => e.exerciseId))];
    const rows = await this.deps.exercises.findVisibleByIds(trainerId, ids);
    const curated = new Map(rows.filter((r) => r.ownerId === null).map((r) => [r.id, r]));
    if (ids.some((id) => !curated.has(id))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: TEMPLATE_COPY.server.notCurated });
    }
    return [...curated.values()];
  }

  private async toDto(
    trainerId: string,
    row: WorkoutTemplateWithExercises,
    exerciseRows?: readonly Exercise[],
  ): Promise<WorkoutTemplateDto> {
    const ids = [...new Set(row.exercises.map((e) => e.exerciseId))];
    const [exercises, links] = await Promise.all([
      exerciseRows ?? this.deps.exercises.findVisibleByIds(trainerId, ids),
      this.deps.links.listActiveForTrainer(trainerId),
    ]);
    const names = new Map(links.map((l) => [l.clientId, displayNameOf(l.client)]));
    const assignments = await this.deps.templates.listAssignments([row.id], [...names.keys()]);
    const used = new Set(ids);
    return {
      id: row.id,
      name: row.name,
      workoutType: row.workoutType,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      exercises: row.exercises.map(toExerciseDto),
      exerciseMeta: exercises.filter((e) => used.has(e.id)).map(toExerciseMeta),
      assignments: assignments
        .map((a) => toAssignmentDto(a, row.version, names.get(a.userId) ?? ''))
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
    };
  }

  private buildAssign(
    routine: RoutineWithDays,
    template: WorkoutTemplateWithExercises,
    target: AssignTarget,
  ): BuildResult {
    const stamp = {
      templateId: template.id,
      templateVersion: template.version,
      templateName: template.name,
      assignedAt: this.deps.now(),
    };
    const loadExerciseIds = new Set(template.exercises.map((e) => e.exerciseId));
    const days = routine.days.map(keepDay);
    if (target.mode === 'ADD_DAY') {
      if (routine.days.length >= MAX_ROUTINE_DAYS) return { ok: false, reason: 'DAY_LIMIT' };
      days.push({
        name: template.name.trim().slice(0, DAY_NAME_MAX),
        plannedWeekday: target.weekday ?? null,
        workoutType: template.workoutType,
        template: stamp,
        exercises: copyTemplateRows(template.exercises, []),
      });
      return { ok: true, days, dayIndex: days.length - 1, loadExerciseIds };
    }
    const index = routine.days.findIndex((d) => d.id === target.routineDayId);
    const stored = routine.days[index];
    const kept = days[index];
    if (!stored || !kept) return { ok: false, reason: 'DAY_NOT_FOUND' };
    days[index] = {
      ...kept,
      // The day keeps its name and weekday; it takes the template's type when it has one.
      ...(template.workoutType !== null && { workoutType: template.workoutType }),
      template: stamp,
      exercises: copyTemplateRows(template.exercises, stored.exercises),
    };
    return { ok: true, days, dayIndex: index, loadExerciseIds };
  }

  private buildUpdate(
    routine: RoutineWithDays,
    template: WorkoutTemplateWithExercises,
  ): BuildResult {
    const days = routine.days.map(keepDay);
    let first = -1;
    const loadExerciseIds = new Set<string>();
    routine.days.forEach((stored, i) => {
      const kept = days[i];
      if (stored.templateId !== template.id || !kept) return;
      if (first === -1) first = i;
      const had = new Set(stored.exercises.map((e) => e.exerciseId));
      for (const e of template.exercises)
        if (!had.has(e.exerciseId)) loadExerciseIds.add(e.exerciseId);
      days[i] = {
        ...kept,
        ...(template.workoutType !== null && { workoutType: template.workoutType }),
        template: {
          templateId: template.id,
          templateVersion: template.version,
          templateName: template.name,
          assignedAt: stored.templateAssignedAt ?? this.deps.now(),
        },
        exercises: copyTemplateRows(template.exercises, stored.exercises),
      };
    });
    if (first === -1) return { ok: false, reason: 'NOT_ASSIGNED' };
    return { ok: true, days, dayIndex: first, loadExerciseIds };
  }

  /**
   * One client's versioned TRAINER-path routine write. A racing save (the
   * client editing at the same moment) is retried once on the fresh routine,
   * then reported as CONFLICT for that client only.
   */
  private async writeCopy(
    trainerId: string,
    clientId: string,
    template: WorkoutTemplateWithExercises,
    build: (routine: RoutineWithDays) => BuildResult,
  ): Promise<WorkoutTemplateTargetResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const routine = await this.deps.routines.findActive(clientId);
      if (!routine) return { clientId, ok: false, reason: 'NO_ROUTINE' };
      const plan = build(routine);
      if (!plan.ok) return { clientId, ok: false, reason: plan.reason };
      const res = await this.deps.routines.replaceDocument(
        clientId,
        routine.id,
        { name: routine.name, days: plan.days },
        routine.version,
        { actorId: trainerId, path: 'TRAINER', diff: diffRoutineDoc },
      );
      if (res.status === 'not_found') return { clientId, ok: false, reason: 'NO_ROUTINE' };
      if (res.status === 'conflict') continue;
      const day = res.routine.days[plan.dayIndex];
      // PRD 2026-10 §4.2: the client's "<Trainer> updated your routine" card.
      await this.deps.notifier.trainerSaved(clientId, trainerId, routine, res.routine);
      await this.applyDefaultLoads(trainerId, clientId, template, plan.loadExerciseIds);
      return { clientId, ok: true, routineDayId: day?.id ?? '' };
    }
    return { clientId, ok: false, reason: 'CONFLICT' };
  }

  /** The template's default load as the next-session target, only where the client has no progression yet. */
  private async applyDefaultLoads(
    trainerId: string,
    clientId: string,
    template: WorkoutTemplateWithExercises,
    exerciseIds: ReadonlySet<string>,
  ): Promise<void> {
    const rows = template.exercises.filter(
      (e) => e.defaultLoadKg !== null && exerciseIds.has(e.exerciseId),
    );
    if (rows.length === 0) return;
    try {
      const ids = [...new Set(rows.map((e) => e.exerciseId))];
      const [exercises, progressions] = await Promise.all([
        this.deps.exercises.findVisibleByIds(clientId, ids),
        this.deps.progressions.findForUser(clientId, ids),
      ]);
      const strength = new Set(
        exercises.filter((e) => isStrengthTrackingType(trackingTypeOf(e))).map((e) => e.id),
      );
      const taken = new Set(progressions.map((p) => progressionKey(p.exerciseId, p.repBucket)));
      for (const e of rows) {
        const bucket = repBucket(e.repMin, e.repMax);
        const key = progressionKey(e.exerciseId, bucket);
        if (e.defaultLoadKg === null || !strength.has(e.exerciseId) || taken.has(key)) continue;
        taken.add(key);
        await this.deps.progression.setOverride(
          clientId,
          {
            exerciseId: e.exerciseId,
            repBucket: bucket,
            weightKg: e.defaultLoadKg,
            reps: Array.from({ length: e.sets }, () => e.repMin),
          },
          { setById: trainerId },
        );
      }
    } catch (err) {
      // The copy is saved; a missing starting weight falls back to the app's suggestion.
      console.warn('[templates] default load failed:', err instanceof Error ? err.name : 'unknown');
    }
  }
}

function toAssignmentDto(
  a: TemplateAssignmentRow,
  templateVersion: number,
  clientName: string,
): WorkoutTemplateAssignmentDto {
  return {
    clientId: a.userId,
    clientName,
    routineDayId: a.dayId,
    dayName: a.dayName,
    templateVersion: a.templateVersion,
    outdated: a.templateVersion < templateVersion,
    editedSince: a.editedSinceTemplate,
    assignedAt: (a.templateAssignedAt ?? new Date(0)).toISOString(),
  };
}

export const workoutTemplateService = new WorkoutTemplateService();
