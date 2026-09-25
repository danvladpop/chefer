import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  exerciseRepository,
  type Exercise,
  type ExerciseWriteData,
  type IExerciseRepository,
} from '@chefer/database';
import type { CustomExerciseInput, ExerciseDto, ExerciseEquipment, Muscle } from '@chefer/types';
import { ensureExerciseLibrary } from '../../lib/exercise-library/ensure.js';
import { toExerciseDto } from './mappers.js';

// ─── ExerciseLibraryService (gym_plan.md §4.1) ───────────────────────────────
// Curated (shared) + the caller's custom exercises. Custom rows are owner-only;
// they are archived, never deleted (sessions reference them).

const MAX_CUSTOM_EXERCISES = 200;

const LOWER_BODY: ReadonlySet<Muscle> = new Set<Muscle>([
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'abductors',
  'calves',
]);

/** Load step (kg) for a custom exercise, matching the curated catalog's conventions. */
const INCREMENT_BY_EQUIPMENT: Record<ExerciseEquipment, number> = {
  BARBELL: 2.5,
  SMITH: 2.5,
  EZ_BAR: 2.5,
  DUMBBELL: 2,
  KETTLEBELL: 4,
  CABLE: 2.5,
  MACHINE: 5,
  BODYWEIGHT: 2.5,
  ASSISTED: 5,
  BAND: 2.5,
};

export function customToWriteData(input: CustomExerciseInput): ExerciseWriteData {
  return {
    name: input.name.trim(),
    aliases: [],
    category: input.category,
    // Custom exercises get their own pattern so the warm-up ramp treats each
    // as a fresh movement (engine warmupSets isFirstForPattern).
    movementPattern: 'custom',
    equipment: input.equipment,
    loadType: input.loadType,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    repMin: input.repMin,
    repMax: input.repMax,
    restSec: input.restSec,
    incrementKg: INCREMENT_BY_EQUIPMENT[input.equipment],
    perHand: input.equipment === 'DUMBBELL' || input.equipment === 'KETTLEBELL',
    isLowerBody: input.primaryMuscles.some((m) => LOWER_BODY.has(m)),
    isTimed: input.isTimed,
    swapGroup: null,
    cues: input.cues,
    mistakes: [],
    blurb: null,
    imageKeys: [],
    videoId: null,
    videoStartSec: null,
    videoChannel: null,
  };
}

export class ExerciseLibraryService {
  constructor(
    private readonly repo: IExerciseRepository = exerciseRepository,
    private readonly ensure: () => Promise<void> = ensureExerciseLibrary,
  ) {}

  /**
   * Curated + own custom exercises, archived ones included (flagged
   * `archived`) because history still shows them. With `updatedSince`, only
   * rows changed at or after it (a delta; duplicates are harmless).
   */
  async list(userId: string, updatedSince?: string): Promise<ExerciseDto[]> {
    await this.ensure();
    const rows = await this.repo.findVisible(
      userId,
      updatedSince ? new Date(updatedSince) : undefined,
    );
    return rows.map(toExerciseDto);
  }

  async get(userId: string, id: string): Promise<ExerciseDto> {
    await this.ensure();
    return toExerciseDto(await this.findVisible(userId, id));
  }

  async createCustom(userId: string, input: CustomExerciseInput): Promise<ExerciseDto> {
    if ((await this.repo.countCustom(userId)) >= MAX_CUSTOM_EXERCISES) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `You can have up to ${MAX_CUSTOM_EXERCISES} custom exercises. Archive one first.`,
      });
    }
    const row = await this.repo.createCustom(randomUUID(), userId, customToWriteData(input));
    return toExerciseDto(row);
  }

  async updateCustom(userId: string, id: string, input: CustomExerciseInput): Promise<ExerciseDto> {
    await this.findOwned(userId, id);
    return toExerciseDto(await this.repo.updateCustom(id, customToWriteData(input)));
  }

  async archiveCustom(userId: string, id: string): Promise<{ ok: true }> {
    await this.findOwned(userId, id);
    await this.repo.archive(id);
    return { ok: true };
  }

  private async findVisible(userId: string, id: string): Promise<Exercise> {
    const row = await this.repo.findById(id);
    if (!row || (row.ownerId !== null && row.ownerId !== userId)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found.' });
    }
    return row;
  }

  /** Custom exercises only; curated and other users' rows read as NOT_FOUND. */
  private async findOwned(userId: string, id: string): Promise<Exercise> {
    const row = await this.repo.findById(id);
    if (row?.ownerId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Custom exercise not found.' });
    }
    return row;
  }
}

export const exerciseLibraryService = new ExerciseLibraryService();
