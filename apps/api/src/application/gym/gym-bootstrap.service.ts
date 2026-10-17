import {
  coachingLinkRepository,
  exerciseProgressionRepository,
  exerciseRepository,
  trainerProfileRepository,
  trainingPauseRepository,
  weightEntryRepository,
  workoutSessionRepository,
  type ICoachingLinkRepository,
  type IExerciseProgressionRepository,
  type IExerciseRepository,
  type ITrainerProfileRepository,
  type ITrainingPauseRepository,
  type IWeightEntryRepository,
  type IWorkoutSessionRepository,
  type TrainingPause,
} from '@chefer/database';
import {
  FALLBACK_TRAINER_NAME,
  type ActivePauseDto,
  type GymBootstrap,
  type GymOffer,
  type NextWorkoutDto,
  type ProgressionDto,
  type RoutineDto,
  type SessionSummaryDto,
  type WeekSummary,
} from '@chefer/types';
import {
  addDaysLocal,
  buildNextWorkout,
  ENGINE_VERSION,
  progressionKey,
  shouldOfferDeload,
  summarizeBests,
  toSessionSummary,
  weekStartOf,
  type ExerciseLookup,
  type ProgressionEntry,
} from '@chefer/utils';
import { ensureExerciseLibrary } from '../../lib/exercise-library/ensure.js';
import {
  coachingAttributionService,
  CoachingAttributionService,
} from '../coaching/coaching-attribution.service.js';
import { filterExerciseDtosForLevel, filterSessionExercisesForLevel } from './client-level.js';
import {
  gymContextLoader,
  isDeloadActive,
  summarizeUserWeeks,
  type GymContextLoader,
  type GymUserContext,
} from './gym-context.js';
import {
  lookupFromRows,
  readCarryOver,
  serverToday,
  toExerciseDto,
  toProfileDto,
  toRoutineDto,
  toSessionDoc,
} from './mappers.js';
import { progressionService, type ProgressionService } from './progression.service.js';

// ─── GymBootstrapService (gym_plan.md §4.1 / §5.2) ───────────────────────────
// ONE query that hydrates the phone's offline read model. Everything is
// computed for the DEVICE-LOCAL `today` the client sends (falls back to the
// server's UTC date), so week boundaries and break gaps match the phone.

/** Recent completed sessions shipped for offline history / last-time columns / PRs. */
export const RECENT_SESSION_DAYS = 84; // 12 weeks
/** A gap this long since the last session triggers the comeback moment (research §4.2). */
export const COMEBACK_AFTER_DAYS = 8;
/** The monthly recap is offered during the first days of a month. */
export const RECAP_OFFER_DAYS = 7;
/** UX-GYM-13: a month with fewer sessions than this has nothing worth a recap card. */
export const RECAP_MIN_SESSIONS = 2;

export class GymBootstrapService {
  constructor(
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly progressionRepo: IExerciseProgressionRepository = exerciseProgressionRepository,
    private readonly sessionRepo: IWorkoutSessionRepository = workoutSessionRepository,
    private readonly pauseRepo: ITrainingPauseRepository = trainingPauseRepository,
    private readonly weightRepo: Pick<IWeightEntryRepository, 'findLatest'> = weightEntryRepository,
    private readonly contextLoader: Pick<GymContextLoader, 'load'> = gymContextLoader,
    private readonly progression: Pick<
      ProgressionService,
      'toDtos' | 'setterNames'
    > = progressionService,
    private readonly ensure: () => Promise<void> = ensureExerciseLibrary,
    private readonly attribution: Pick<
      CoachingAttributionService,
      'forRoutine'
    > = coachingAttributionService,
    private readonly coachingLinks: Pick<
      ICoachingLinkRepository,
      'findActiveForClient'
    > = coachingLinkRepository,
    private readonly trainers: Pick<ITrainerProfileRepository, 'find'> = trainerProfileRepository,
  ) {}

  /**
   * `level` is the EFFECTIVE gym level (tracking-type gating, capped by the
   * cardio flag). `coaching` carries what trainer coaching needs: the RAW
   * `x-chefer-api-level` (spec §10: gate on the raw level, not the effective
   * one) and whether coaching is on for this user. Below level 6 nothing new is
   * sent or queried.
   */
  async get(
    userId: string,
    input: { librarySince?: string | undefined; today?: string | undefined } = {},
    level = 0,
    coaching: { rawLevel: number; enabled: boolean } = { rawLevel: 0, enabled: false },
  ): Promise<GymBootstrap> {
    const today = input.today ?? serverToday();
    await this.ensure();

    const windowStart = addDaysLocal(today, -RECENT_SESSION_DAYS);
    const [
      ctx,
      exerciseRows,
      progressionRows,
      sessionDates,
      recentRows,
      olderRows,
      pauses,
      latestWeight,
    ] = await Promise.all([
      this.contextLoader.load(userId),
      this.exerciseRepo.findVisible(userId),
      this.progressionRepo.findForUser(userId),
      this.sessionRepo.findCompletedDates(userId),
      this.sessionRepo.findCompleted(userId, { fromLocalDate: windowStart }),
      // Everything before the window, condensed to per-exercise bests below:
      // live PR badges used to compare against 12 weeks only (F-GYM-6-1).
      this.sessionRepo.findCompleted(userId, { toLocalDate: addDaysLocal(windowStart, -1) }),
      this.pauseRepo.listForUser(userId),
      this.weightRepo.findLatest(userId),
    ]);

    const { lookup, metas } = lookupFromRows(exerciseRows);
    // T-42.2 (Δ2.1): one lookup for the two session-exercise filters below.
    const trackingTypeById = new Map(exerciseRows.map((r) => [r.id, r.trackingType]));

    // Library: full list, or the rows changed since the client's cursor.
    const since = input.librarySince ? new Date(input.librarySince) : null;
    const libraryRows = since ? exerciseRows.filter((r) => r.updatedAt >= since) : exerciseRows;
    const cursorMs = Math.max(
      since?.getTime() ?? 0,
      ...libraryRows.map((r) => r.updatedAt.getTime()),
    );

    const wantsCoaching = CoachingAttributionService.understandsCoaching(coaching.rawLevel);
    const setterNames = await this.progression.setterNames(progressionRows, coaching.rawLevel);
    const progressions = this.progression.toDtos(ctx, progressionRows, metas, today, setterNames);
    // Level 6+: the routine carries the trainer's notes and edit stamps.
    const activeRoutine =
      wantsCoaching && ctx.activeRoutineRow
        ? toRoutineDto(
            ctx.activeRoutineRow,
            await this.attribution.forRoutine(ctx.activeRoutineRow, userId, coaching.rawLevel),
          )
        : ctx.activeRoutine;
    const recentSessions = recentRows
      .map((r) => toSessionSummary(toSessionDoc(r)))
      .reverse() // newest first
      .map((s) => ({
        ...s,
        exercises: filterSessionExercisesForLevel(s.exercises, trackingTypeById, level),
      }));
    const { weeks: allWeeks, streak } = summarizeUserWeeks({
      profileRow: ctx.profileRow,
      sessionDates,
      pauses: pauses.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
      today,
    });

    return {
      profile: ctx.profileRow ? toProfileDto(ctx.profileRow) : null,
      activeRoutine,
      nextWorkout: this.withTrainerNotes(
        this.nextWorkout(ctx, lookup, progressions, recentSessions, today),
        wantsCoaching ? activeRoutine : null,
      ),
      library: filterExerciseDtosForLevel(libraryRows.map(toExerciseDto), level),
      libraryCursor: new Date(cursorMs).toISOString(),
      progressions,
      recentSessions,
      // ALL weeks since setup (tiny rows): the phone's optimistic fold
      // (applyFinishedSession) re-derives streak + flex tokens from them, so a
      // truncated window would drift from the server's answer while offline.
      weeks: allWeeks,
      streak,
      offers: this.offers(ctx, progressions, allWeeks, sessionDates, today),
      activePause: this.activePause(pauses, today),
      upcomingPause: this.upcomingPause(pauses, today),
      carryOver: ctx.profileRow ? readCarryOver(ctx.profileRow.carryOver) : [],
      bodyweightKg: latestWeight?.weightKg ?? null,
      olderBests: summarizeBests(olderRows.map((r) => toSessionSummary(toSessionDoc(r)))),
      serverTime: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      ...(wantsCoaching && coaching.enabled && { coaching: await this.coaching(userId) }),
    };
  }

  /** Level 6+: the client's current trainer, or null. */
  private async coaching(userId: string): Promise<{ trainerName: string } | null> {
    const link = await this.coachingLinks.findActiveForClient(userId);
    if (!link) return null;
    const trainer = await this.trainers.find(link.trainerId);
    return { trainerName: trainer?.displayName ?? FALLBACK_TRAINER_NAME };
  }

  /** Level 6+: copies each routine row's trainer note onto the matching next-workout exercise. */
  private withTrainerNotes(
    next: NextWorkoutDto | null,
    routine: RoutineDto | null,
  ): NextWorkoutDto | null {
    if (!next || !routine) return next;
    const notes = new Map(
      routine.days.flatMap((d) =>
        d.exercises.flatMap((e) => (e.trainerNote ? [[e.id, e.trainerNote] as const] : [])),
      ),
    );
    if (notes.size === 0) return next;
    return {
      ...next,
      exercises: next.exercises.map((e) => {
        const note = notes.get(e.routineExerciseId);
        return note ? { ...e, trainerNote: note } : e;
      }),
    };
  }

  private nextWorkout(
    ctx: GymUserContext,
    lookup: ExerciseLookup,
    progressions: ProgressionDto[],
    recentSessions: SessionSummaryDto[],
    today: string,
  ): NextWorkoutDto | null {
    const routine = ctx.activeRoutine;
    if (!ctx.profileRow || !routine) return null;
    const dayId =
      routine.days.find((d) => d.id === routine.nextDayId)?.id ?? routine.days[0]?.id ?? null;
    if (!dayId) return null;
    const map = new Map<string, ProgressionEntry>(
      progressions.map((p) => [
        progressionKey(p.exerciseId, p.repBucket),
        { state: p.state, override: p.override },
      ]),
    );
    return buildNextWorkout({
      routine,
      dayId,
      lookup,
      progressions: map,
      profile: ctx.equipment,
      facts: ctx.facts,
      today,
      recentSessions,
      isDeload: isDeloadActive(ctx.offerState, today),
      carryOver: readCarryOver(ctx.profileRow.carryOver),
    });
  }

  /**
   * Pending offers (dismissals remembered by key in GymProfile.offerState):
   * - deload   engine shouldOfferDeload, once per week, unless a deload is running
   * - stall    an exercise whose engine decision is STALL_SUGGEST_SWAP
   * - comeback the last session is more than COMEBACK_AFTER_DAYS ago
   * - recap    first RECAP_OFFER_DAYS days of a month, when last month had at least
   *            RECAP_MIN_SESSIONS sessions
   */
  private offers(
    ctx: GymUserContext,
    progressions: ProgressionDto[],
    weeks: WeekSummary[],
    sessionDates: string[],
    today: string,
  ): GymOffer[] {
    if (!ctx.profileRow) return [];
    const dismissed = ctx.offerState.dismissed ?? {};
    const offers: GymOffer[] = [];
    const push = (offer: GymOffer) => {
      if (!dismissed[offer.key]) offers.push(offer);
    };

    const setupDate = (ctx.profileRow.setupCompletedAt ?? ctx.profileRow.createdAt)
      .toISOString()
      .slice(0, 10);
    if (!isDeloadActive(ctx.offerState, today) && sessionDates.length > 0) {
      const deload = shouldOfferDeload({
        states: progressions.map((p) => p.state),
        weeks,
        experience: ctx.experience,
        today,
        firstWeek: weekStartOf(setupDate),
      });
      if (deload.offer) {
        push({
          kind: 'deload',
          key: `deload:${weekStartOf(today)}`,
          title: 'Time for a lighter week?',
          body: 'A deload week lets fatigue drop so your next block starts stronger.',
          data: { reason: deload.reason },
        });
      }
    }

    for (const p of progressions) {
      if (p.state.next.reasonCode !== 'STALL_SUGGEST_SWAP') continue;
      push({
        kind: 'stall',
        key: `stall:${p.exerciseId}:${p.repBucket}:${p.state.lastExposureDate ?? ''}`,
        title: 'Try a variation?',
        body: 'This lift has held steady for a while. A similar exercise can restart progress.',
        exerciseId: p.exerciseId,
        data: { repBucket: p.repBucket },
      });
    }

    const last = sessionDates.at(-1);
    if (last && addDaysLocal(last, COMEBACK_AFTER_DAYS) < today) {
      push({
        kind: 'comeback',
        key: `comeback:${last}`,
        title: 'Welcome back',
        body: 'Pick up where you left off — the first sessions back start a little lighter.',
        data: { lastSessionDate: last },
      });
    }

    const prevMonth = previousMonth(today);
    if (
      Number(today.slice(8, 10)) <= RECAP_OFFER_DAYS &&
      sessionDates.filter((d) => d.startsWith(prevMonth)).length >= RECAP_MIN_SESSIONS
    ) {
      push({
        kind: 'recap',
        key: `recap:${prevMonth}`,
        title: 'Your month in review',
        body: 'See your sessions, PRs and strongest gains from last month.',
        data: { month: prevMonth },
      });
    }
    return offers;
  }

  /** The pause covering `today` (device-local), if any — lets a client end it directly. */
  private activePause(pauses: TrainingPause[], today: string): ActivePauseDto | null {
    const row = pauses.find((p) => p.startDate <= today && today <= p.endDate);
    return row
      ? { id: row.id, startDate: row.startDate, endDate: row.endDate, reason: row.reason }
      : null;
  }

  /** The soonest pause that starts after `today`, if any (UX-GYM-16: a start choice). */
  private upcomingPause(pauses: TrainingPause[], today: string): ActivePauseDto | null {
    const row = pauses
      .filter((p) => p.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return row
      ? { id: row.id, startDate: row.startDate, endDate: row.endDate, reason: row.reason }
      : null;
  }
}

/** "2026-03-04" → "2026-02"; "2026-01-15" → "2025-12". */
export function previousMonth(localDate: string): string {
  const y = Number(localDate.slice(0, 4));
  const m = Number(localDate.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export const gymBootstrapService = new GymBootstrapService();
