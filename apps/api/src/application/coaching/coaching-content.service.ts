import { TRPCError } from '@trpc/server';
import {
  coachingContentRepository,
  exerciseRepository,
  gymProfileRepository,
  routineRepository,
  trainingPauseRepository,
  workoutSessionRepository,
  type CoachingLink,
  type Exercise,
  type GymProfile,
  type ICoachingContentRepository,
  type IExerciseRepository,
  type IGymProfileRepository,
  type IRoutineRepository,
  type ITrainingPauseRepository,
  type IWorkoutSessionRepository,
  type RoutineWithDays,
} from '@chefer/database';
import {
  COACHING_COPY,
  COACHING_LIMITS,
  type ClientOverviewDto,
  type CoachedWorkoutsPageDto,
  type ExerciseHistoryDto,
  type ExerciseTrackingType,
  type GoalHistoryEntry,
  type NextTargetDto,
  type RoutineDto,
  type TrainerRoutineDto,
} from '@chefer/types';
import {
  addDaysLocal,
  buildAdherence,
  decodeCursor,
  DEFAULT_WEEKLY_GOAL,
  displayNameOf,
  encodeCursor,
  firstNameOf,
  isStrengthTrackingType,
  repBucket,
  trackingTypeOf,
  weekStartOf,
} from '@chefer/utils';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { renderableTrackingTypes } from '../gym/client-level.js';
import { readGoalHistory, serverToday } from '../gym/mappers.js';
import {
  progressionService,
  type CoachProgression,
  type ProgressionService,
} from '../gym/progression.service.js';
import type { CoachingAccess } from './coaching-access.service.js';
import {
  linkStartDay,
  toCoachedWorkoutDto,
  toRoutineDtoForTrainer,
  toTrainerRoutineDto,
} from './coaching-dto.mappers.js';

// ─── Trainer coaching: reading a client's data (spec §7.2, §8.1) ──────────────
// Authorization already happened: every caller arrives through
// `requireCoachingAccess(scope)` and passes the resolved access in. Responses
// are built only by coaching-dto.mappers.ts (INV-2 pattern). READ-ONLY: nothing
// here writes to the client's rows.
//
// Workout window (Q-2): the trainer sees workouts from 28 days before the
// current link started, onward (`COACHING_LIMITS.workoutWindowDays`). Adherence
// and exercise history use the same boundary.

export interface CoachingContentDeps {
  content: ICoachingContentRepository;
  routines: Pick<IRoutineRepository, 'findActive'>;
  exercises: Pick<IExerciseRepository, 'findVisibleByIds'>;
  pauses: Pick<ITrainingPauseRepository, 'listForUser'>;
  sessions: Pick<IWorkoutSessionRepository, 'findCompletedDates'>;
  gymProfiles: Pick<IGymProfileRepository, 'findByUserId'>;
  progression: Pick<ProgressionService, 'forCoach'>;
  now: () => Date;
}

const defaultDeps: CoachingContentDeps = {
  content: coachingContentRepository,
  routines: routineRepository,
  exercises: exerciseRepository,
  pauses: trainingPauseRepository,
  sessions: workoutSessionRepository,
  gymProfiles: gymProfileRepository,
  progression: progressionService,
  now: () => new Date(),
};

/** First local date the trainer may see: 28 days before the link started. */
export function workoutWindowStart(
  link: Pick<CoachingLink, 'startedAt'> & Partial<Pick<CoachingLink, 'startedOn'>>,
): string {
  return addDaysLocal(linkStartDay(link), -COACHING_LIMITS.workoutWindowDays);
}

/** Goal history the way the gym engine derives it (see gym-context `summarizeUserWeeks`). */
export function goalHistoryOf(profile: GymProfile | null, firstWeek: string): GoalHistoryEntry[] {
  const stored = profile ? readGoalHistory(profile.goalHistory) : [];
  return stored.length > 0
    ? stored
    : [{ fromWeek: firstWeek, goal: profile?.weeklyGoal ?? DEFAULT_WEEKLY_GOAL }];
}

function requireLink(access: CoachingAccess): CoachingLink {
  if (!access.link) throw clientUnavailableError();
  return access.link;
}

function renderableSet(level: number): ReadonlySet<ExerciseTrackingType> {
  return new Set(renderableTrackingTypes(level));
}

export class CoachingContentService {
  private readonly deps: CoachingContentDeps;

  constructor(deps: Partial<CoachingContentDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** `trainer.client.overview`: adherence and the last 5 workouts. `today` is the trainer's device-local date. */
  async overview(access: CoachingAccess, today: string, level: number): Promise<ClientOverviewDto> {
    const link = requireLink(access);
    const clientId = access.clientId;
    const windowStart = workoutWindowStart(link);
    const [names, profile, dates, pauses, routine, recent] = await Promise.all([
      this.deps.content.userNames([clientId]),
      this.deps.gymProfiles.findByUserId(clientId),
      this.deps.sessions.findCompletedDates(clientId),
      this.deps.pauses.listForUser(clientId),
      this.deps.routines.findActive(clientId),
      this.deps.content.listCompleted(clientId, {
        fromLocalDate: windowStart,
        cursor: null,
        take: 5,
      }),
    ]);
    const client = names.get(clientId);
    if (!client) throw clientUnavailableError();

    const setupDate = (profile?.setupCompletedAt ?? profile?.createdAt ?? link.startedAt)
      .toISOString()
      .slice(0, 10);
    const first = setupDate > windowStart ? setupDate : windowStart;
    const renderable = renderableSet(level);
    return {
      client: { name: displayNameOf(client), since: link.startedAt.toISOString() },
      adherence: buildAdherence({
        today,
        // Only what the consent screen promised: from 28 days before joining.
        sessionDates: dates.filter((d) => d >= windowStart),
        goalHistory: goalHistoryOf(profile, weekStartOf(first)),
        // Dates only: `TrainingPause.reason` is never read past this line.
        pauses: pauses.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
        plannedWeekdays: routine?.days.map((d) => d.plannedWeekday) ?? [],
        setupDate: first,
      }),
      recent: recent.map((s) => toCoachedWorkoutDto(s, renderable)),
    };
  }

  /** `trainer.client.workouts`: newest first, keyset-paged, inside the window. */
  async workouts(
    access: CoachingAccess,
    page: { cursor: string | undefined; limit: number },
    level: number,
  ): Promise<CoachedWorkoutsPageDto> {
    const link = requireLink(access);
    const limit = Math.min(COACHING_LIMITS.workoutsPageSize, Math.max(1, page.limit));
    const decoded = page.cursor ? decodeCursor(page.cursor) : null;
    const rows = await this.deps.content.listCompleted(access.clientId, {
      fromLocalDate: workoutWindowStart(link),
      // A tampered cursor restarts at the top.
      cursor: decoded ? { startedAt: decoded.date, id: decoded.id } : null,
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const renderable = renderableSet(level);
    return {
      items: items.map((s) => toCoachedWorkoutDto(s, renderable)),
      nextCursor: rows.length > limit && last ? encodeCursor(last.startedAt, last.id) : null,
    };
  }

  /** `trainer.client.exerciseHistory`: the last 8 times the client did this exercise. */
  async exerciseHistory(
    access: CoachingAccess,
    exerciseId: string,
    level: number,
  ): Promise<ExerciseHistoryDto> {
    const link = requireLink(access);
    const [exercise] = await this.deps.exercises.findVisibleByIds(access.clientId, [exerciseId]);
    if (!exercise) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found.' });
    if (!renderableSet(level).has(exercise.trackingType)) {
      return { exerciseId, name: exercise.name, entries: [] };
    }
    const sessions = await this.deps.content.listCompletedForExercise(access.clientId, exerciseId, {
      fromLocalDate: workoutWindowStart(link),
      take: COACHING_LIMITS.historyExposures,
    });
    return {
      exerciseId,
      name: exercise.name,
      entries: sessions.flatMap((s) => {
        const workout = toCoachedWorkoutDto(s, renderableSet(level));
        const e = workout.exercises.find((x) => x.exerciseId === exerciseId);
        return e && !e.skipped
          ? [
              {
                localDate: s.localDate,
                sets: e.sets,
                lastSetRir: e.lastSetRir,
              },
            ]
          : [];
      }),
    };
  }

  /** `trainer.client.routine`: the client's active routine with the next-session panel data, or null. */
  async routine(
    access: CoachingAccess,
    today: string | undefined,
  ): Promise<TrainerRoutineDto | null> {
    const link = requireLink(access);
    const row = await this.deps.routines.findActive(access.clientId);
    if (!row) return null;
    return this.routineDto(row, link, access.clientId, today ?? serverToday());
  }

  /** The TrainerRoutineDto for a stored routine (also used after the trainer's own saves and for CONFLICT payloads). */
  async routineDto(
    row: RoutineWithDays,
    link: Pick<CoachingLink, 'startedAt'>,
    clientId: string,
    today: string,
  ): Promise<TrainerRoutineDto> {
    const exerciseIds = [...new Set(row.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
    const [exercises, names, progressions] = await Promise.all([
      this.deps.exercises.findVisibleByIds(clientId, exerciseIds),
      this.deps.content.userNames([clientId]),
      this.deps.progression.forCoach(clientId, exerciseIds, today),
    ]);
    const client = names.get(clientId);
    return toTrainerRoutineDto({
      row,
      linkStartedAt: link.startedAt,
      clientId,
      clientName: client ? firstNameOf(client) : '',
      exercises,
      next: nextByRow(row, exercises, progressions, clientId),
    });
  }

  /** The CONFLICT payload's `current` for a stale trainer save: see `toRoutineDtoForTrainer`. */
  async conflictDto(row: RoutineWithDays, trainerId: string): Promise<RoutineDto> {
    const names = await this.deps.content.userNames([row.userId]);
    const client = names.get(row.userId);
    return toRoutineDtoForTrainer(row, trainerId, client ? firstNameOf(client) : '');
  }

  /** The next-session panel data of ONE (exercise, rep bucket) of the client's active routine. */
  async nextTarget(
    clientId: string,
    exerciseId: string,
    bucket: string,
    today: string = serverToday(),
  ): Promise<NextTargetDto> {
    const progressions = await this.deps.progression.forCoach(clientId, [exerciseId], today);
    const p = progressions.find((x) => x.repBucket === bucket);
    if (!p) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: COACHING_COPY.server.exerciseNotInRoutine,
      });
    }
    return toNextTargetDto(p, clientId);
  }
}

function toNextTargetDto(p: CoachProgression, clientId: string): NextTargetDto {
  return {
    repBucket: p.repBucket,
    suggestion: p.suggestion,
    override: p.override
      ? {
          weightKg: p.override.weightKg,
          reps: p.override.reps,
          at: p.override.at,
          setBy: p.override.setById && p.override.setById !== clientId ? 'TRAINER' : 'CLIENT',
        }
      : null,
    lastDoneDate: p.lastExposureDate,
  };
}

/** routine-exercise id → panel data, for strength rows only. */
function nextByRow(
  row: RoutineWithDays,
  exercises: readonly Exercise[],
  progressions: readonly CoachProgression[],
  clientId: string,
): Map<string, NextTargetDto> {
  const strength = new Set(
    exercises.filter((e) => isStrengthTrackingType(trackingTypeOf(e))).map((e) => e.id),
  );
  const byKey = new Map(progressions.map((p) => [`${p.exerciseId}|${p.repBucket}`, p]));
  const out = new Map<string, NextTargetDto>();
  for (const day of row.days) {
    for (const e of day.exercises) {
      if (!strength.has(e.exerciseId)) continue;
      const p = byKey.get(`${e.exerciseId}|${repBucket(e.repMin, e.repMax)}`);
      if (p) out.set(e.id, toNextTargetDto(p, clientId));
    }
  }
  return out;
}

export const coachingContentService = new CoachingContentService();
