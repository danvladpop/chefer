import type {
  CoachedSessionRow,
  CoachingInvite,
  Exercise,
  RoutineWithDays,
} from '@chefer/database';
import {
  FALLBACK_TRAINER_NAME,
  type CoachedExerciseDto,
  type CoachedSetDto,
  type CoachedWorkoutDto,
  type ExerciseTrackingType,
  type InviteDto,
  type InviteState,
  type LastEditedByOtherDto,
  type NextTargetDto,
  type RoutineDto,
  type TrainerRoutineDto,
} from '@chefer/types';
import { toExerciseMeta, toRoutineDto } from '../gym/mappers.js';

// ─── Trainer coaching: row → DTO mappers (spec §7.2, INV-2 pattern) ───────────
// Every `trainer.*` / `coaching.*` response about a client is built ONLY here,
// field by field from an allow-list, never by spreading a row. What a trainer
// can never receive: session and exercise notes, calorie estimates and heart
// rate, in-progress or discarded sessions, anything derived from body weight,
// pause reasons, the client's own routine-exercise `notes`.
// coaching-dto.mappers.test.ts snapshots the deep key set.

// ─── Workouts ─────────────────────────────────────────────────────────────────

function durationMin(startedAt: Date, finishedAt: Date | null): number | null {
  if (finishedAt === null) return null;
  const ms = finishedAt.getTime() - startedAt.getTime();
  return ms < 0 ? null : Math.round(ms / 60_000);
}

function toCoachedSetDto(s: CoachedSessionRow['exercises'][number]['sets'][number]): CoachedSetDto {
  const set: CoachedSetDto = {
    weightKg: s.weightKg,
    reps: s.reps,
    isWarmup: s.isWarmup,
    completed: s.completedAt !== null,
  };
  // Cardio columns are null for a strength set: keys are omitted, not null.
  if (s.durationSec !== null) set.durationSec = s.durationSec;
  if (s.distanceM !== null) set.distanceM = s.distanceM;
  if (s.intensityRpe !== null) set.intensityRpe = s.intensityRpe;
  if (s.resistanceLevel !== null) set.resistanceLevel = s.resistanceLevel;
  if (s.inclinePct !== null) set.inclinePct = s.inclinePct;
  // caloriesKcal (derived from body weight) and avgHeartRateBpm are NEVER copied.
  return set;
}

function toCoachedExerciseDto(e: CoachedSessionRow['exercises'][number]): CoachedExerciseDto {
  return {
    exerciseId: e.exercise.id,
    name: e.exercise.name,
    skipped: e.skipped,
    lastSetRir: e.lastSetRir,
    sets: [...e.sets].sort((a, b) => a.position - b.position).map(toCoachedSetDto),
    // `e.notes` (the exercise note of that session) is NEVER copied.
  };
}

/** `renderable`: the tracking types the TRAINER's client level can show (like Following's workouts). */
export function toCoachedWorkoutDto(
  session: CoachedSessionRow,
  renderable: ReadonlySet<ExerciseTrackingType>,
): CoachedWorkoutDto {
  return {
    id: session.id,
    name: session.name,
    localDate: session.localDate,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
    durationMin: durationMin(session.startedAt, session.finishedAt),
    isDeload: session.isDeload,
    exercises: [...session.exercises]
      .sort((a, b) => a.position - b.position)
      .filter((e) => renderable.has(e.exercise.trackingType))
      .map(toCoachedExerciseDto),
    // `session.notes`, heart rate and calories are NEVER copied.
  };
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export function inviteStateOf(invite: CoachingInvite, now: Date): InviteState {
  if (invite.usedAt !== null) return 'USED';
  if (invite.revokedAt !== null) return 'REVOKED';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'OPEN';
}

export function inviteUrl(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, '')}/coaching/join/${code}`;
}

export function toInviteDto(invite: CoachingInvite, now: Date, appUrl: string): InviteDto {
  return {
    code: invite.code,
    url: inviteUrl(appUrl, invite.code),
    label: invite.label,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    state: inviteStateOf(invite, now),
  };
}

// ─── The client's routine, as the trainer edits it ────────────────────────────

export interface TrainerRoutineInput {
  row: RoutineWithDays;
  /** When the current link started: only changes made by the client AFTER it are surfaced. */
  linkStartedAt: Date;
  clientId: string;
  /** The client's first name, for "Changed by Maria". */
  clientName: string;
  /** Exercise rows used by the routine (curated + the client's own). */
  exercises: readonly Exercise[];
  /** Next-session panel data per routine-exercise id; absent = a row without one (cardio, timed). */
  next: ReadonlyMap<string, NextTargetDto>;
}

/** Stamp of a change by the CLIENT after the link started (the trainer's own saves are never "other"). */
function clientStamp(
  editorId: string | null,
  at: Date | null,
  input: Pick<TrainerRoutineInput, 'clientId' | 'clientName' | 'linkStartedAt'>,
): LastEditedByOtherDto | null {
  if (at === null || at < input.linkStartedAt) return null;
  // A time with no editor id means the editor's account is gone: not the client.
  if (editorId !== input.clientId) return null;
  return { name: input.clientName || FALLBACK_TRAINER_NAME, at: at.toISOString() };
}

export function toTrainerRoutineDto(input: TrainerRoutineInput): TrainerRoutineDto {
  const { row, clientId } = input;
  const customIds = new Set(input.exercises.filter((e) => e.ownerId === clientId).map((e) => e.id));
  const usedIds = new Set(row.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  return {
    id: row.id,
    name: row.name,
    templateKey: row.templateKey,
    version: row.version,
    nextDayId: row.nextDayId,
    updatedAt: row.updatedAt.toISOString(),
    lastEditedByOther: clientStamp(row.lastEditedById, row.lastEditedAt, input),
    days: row.days.map((d) => ({
      id: d.id,
      position: d.position,
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        position: e.position,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        trainerNote: e.trainerNote,
        lastEditedByOther: clientStamp(e.lastEditedById, e.lastEditedAt, input),
        next: input.next.get(e.id) ?? null,
        // `e.notes` (the client's own note) is NEVER copied.
      })),
    })),
    exercises: input.exercises
      .filter((e) => usedIds.has(e.id))
      .map((e) => ({ ...toExerciseMeta(e), isCustom: customIds.has(e.id) })),
  };
}

/**
 * The CONFLICT payload of `trainer.client.saveRoutine` (spec §9.1): the same
 * `{ kind: 'routine', current: RoutineDto }` as `gym.routine.save`, so the
 * editors' existing "Keep mine / Use the other version" dialog works for the
 * trainer. Seen from the trainer: a row or routine last changed by the client
 * carries `lastEditedByOther` named after the client, and the client's own
 * routine-exercise `notes` are blanked (a trainer never receives them).
 */
export function toRoutineDtoForTrainer(
  row: RoutineWithDays,
  trainerId: string,
  clientName: string,
): RoutineDto {
  const dto = toRoutineDto(row, {
    viewerId: trainerId,
    names: new Map([[row.userId, clientName || FALLBACK_TRAINER_NAME]]),
  });
  return {
    ...dto,
    days: dto.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e, notes: null })),
    })),
  };
}
