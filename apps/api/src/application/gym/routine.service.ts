import { TRPCError } from '@trpc/server';
import {
  exerciseRepository,
  gymProfileRepository,
  routineRepository,
  type IExerciseRepository,
  type IGymProfileRepository,
  type IRoutineRepository,
  type RoutineDayWriteData,
  type RoutineWithDays,
} from '@chefer/database';
import {
  EXERCISE_BY_ID,
  PROGRAM_TEMPLATES,
  TEMPLATE_BY_KEY,
  type GymEquipmentAccess,
  type RoutineDoc,
  type RoutineDto,
  type RoutineListItemDto,
  type TemplateSummaryDto,
} from '@chefer/types';
import { instantiateTemplate, type ExerciseLookup } from '@chefer/utils';
import { ConflictCause } from '../../lib/conflict.js';
import { ensureExerciseLibrary } from '../../lib/exercise-library/ensure.js';
import { toRoutineDto } from './mappers.js';

// ─── RoutineService (gym_plan.md §4.1, D4/D5a) ───────────────────────────────
// Routines are edited as whole documents. save() replaces the document when
// `expectedVersion` still matches, else throws CONFLICT whose
// `error.data.conflict` is `{ kind: 'routine', current: RoutineDto }` — the
// client shows "keep mine / take theirs" and retries with current.version.

const MAX_ROUTINES = 30;

/** Static catalog lookup — templates only ever reference curated slugs. */
export const catalogLookup: ExerciseLookup = (id) => EXERCISE_BY_ID.get(id);

export function templateSummary(key: string): TemplateSummaryDto | null {
  const t = TEMPLATE_BY_KEY.get(key);
  return t
    ? {
        key: t.key,
        name: t.name,
        daysPerWeek: t.daysPerWeek,
        experience: t.experience,
        description: t.description,
      }
    : null;
}

/** Engine template → repository write shape (defaults targetRir 2, rest from the catalog). */
export function templateToDays(
  templateKey: string,
  equipmentAccess: GymEquipmentAccess,
): { name: string; weeklyGoal: number; days: RoutineDayWriteData[] } {
  if (!TEMPLATE_BY_KEY.has(templateKey)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown program template.' });
  }
  const draft = instantiateTemplate(templateKey, equipmentAccess, catalogLookup);
  return {
    name: draft.name,
    weeklyGoal: draft.weeklyGoal,
    days: draft.days.map((d) => ({
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e) => ({ ...e, id: undefined })),
    })),
  };
}

export class RoutineService {
  constructor(
    private readonly repo: IRoutineRepository = routineRepository,
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly profileRepo: IGymProfileRepository = gymProfileRepository,
    private readonly ensure: () => Promise<void> = ensureExerciseLibrary,
  ) {}

  async list(userId: string): Promise<RoutineListItemDto[]> {
    const rows = await this.repo.listForUser(userId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      templateKey: r.templateKey,
      isActive: r.isActive,
      dayCount: r._count.days,
      archived: r.archivedAt !== null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async get(userId: string, id: string): Promise<RoutineDto> {
    return toRoutineDto(await this.findOwned(userId, id));
  }

  templates(): TemplateSummaryDto[] {
    return PROGRAM_TEMPLATES.map((t) => templateSummary(t.key)).filter(
      (t): t is TemplateSummaryDto => t !== null,
    );
  }

  async createFromTemplate(
    userId: string,
    templateKey: string,
    setActive: boolean,
  ): Promise<RoutineDto> {
    await this.assertRoomForAnother(userId);
    await this.ensure();
    const profile = await this.profileRepo.findByUserId(userId);
    const draft = templateToDays(templateKey, profile?.equipmentAccess ?? 'FULL_GYM');
    const row = await this.repo.create(userId, {
      name: draft.name,
      templateKey,
      isActive: setActive,
      days: draft.days,
    });
    return toRoutineDto(row);
  }

  async createBlank(userId: string, name: string, days: number): Promise<RoutineDto> {
    await this.assertRoomForAnother(userId);
    const row = await this.repo.create(userId, {
      name: name.trim(),
      templateKey: null,
      isActive: false,
      days: Array.from({ length: days }, (_, i) => ({
        name: `Day ${i + 1}`,
        plannedWeekday: null,
        exercises: [],
      })),
    });
    return toRoutineDto(row);
  }

  async duplicate(userId: string, id: string): Promise<RoutineDto> {
    await this.assertRoomForAnother(userId);
    const source = await this.findOwned(userId, id);
    const row = await this.repo.create(userId, {
      name: `${source.name} (copy)`.slice(0, 60),
      templateKey: source.templateKey,
      isActive: false,
      days: source.days.map((d) => ({
        name: d.name,
        plannedWeekday: d.plannedWeekday,
        exercises: d.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      })),
    });
    return toRoutineDto(row);
  }

  async archive(userId: string, id: string): Promise<{ ok: true }> {
    if (!(await this.repo.archive(userId, id))) throw notFound();
    return { ok: true };
  }

  /** Makes this the one active routine (unarchiving it if needed). */
  async setActive(userId: string, id: string): Promise<RoutineDto> {
    const row = await this.repo.setActive(userId, id);
    if (!row) throw notFound();
    return toRoutineDto(row);
  }

  async save(userId: string, routine: RoutineDoc, expectedVersion: number): Promise<RoutineDto> {
    const exerciseIds = [
      ...new Set(routine.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))),
    ];
    const visible = new Set(
      (await this.exerciseRepo.findVisibleByIds(userId, exerciseIds)).map((e) => e.id),
    );
    const unknown = exerciseIds.find((id) => !visible.has(id));
    if (unknown) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown exercise: ${unknown}` });
    }

    const res = await this.repo.replaceDocument(
      userId,
      routine.id,
      {
        name: routine.name.trim(),
        days: routine.days.map((d) => ({
          id: d.id,
          name: d.name.trim(),
          plannedWeekday: d.plannedWeekday,
          exercises: d.exercises.map((e) => ({ ...e })),
        })),
      },
      expectedVersion,
    );
    if (res.status === 'not_found') throw notFound();
    if (res.status === 'conflict') {
      const current = toRoutineDto(res.current);
      throw new TRPCError({
        code: 'CONFLICT',
        message: `This routine was changed elsewhere (now version ${current.version}).`,
        cause: new ConflictCause({ kind: 'routine', current }),
      });
    }
    return toRoutineDto(res.routine);
  }

  /** "Do another day instead" / "skip this day": moves the rotation pointer. */
  async setNextDay(userId: string, routineId: string, dayId: string): Promise<RoutineDto> {
    const row = await this.repo.setNextDay(userId, routineId, dayId);
    if (!row) throw notFound('Routine day not found.');
    return toRoutineDto(row);
  }

  private async findOwned(userId: string, id: string): Promise<RoutineWithDays> {
    const row = await this.repo.findByIdForUser(userId, id);
    if (!row) throw notFound();
    return row;
  }

  private async assertRoomForAnother(userId: string): Promise<void> {
    const rows = await this.repo.listForUser(userId);
    if (rows.filter((r) => r.archivedAt === null).length >= MAX_ROUTINES) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `You can keep up to ${MAX_ROUTINES} routines. Archive one first.`,
      });
    }
  }
}

function notFound(message = 'Routine not found.'): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message });
}

export const routineService = new RoutineService();
