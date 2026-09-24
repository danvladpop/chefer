import {
  exerciseProgressionRepository,
  exerciseRepository,
  trainingPauseRepository,
  weightEntryRepository,
  workoutSessionRepository,
  type IExerciseProgressionRepository,
  type IExerciseRepository,
  type ITrainingPauseRepository,
  type IWeightEntryRepository,
  type IWorkoutSessionRepository,
} from '@chefer/database';
import type {
  GymBootstrap,
  GymOffer,
  NextWorkoutDto,
  ProgressionDto,
  SessionSummaryDto,
  WeekSummary,
} from '@chefer/types';
import {
  addDaysLocal,
  buildNextWorkout,
  ENGINE_VERSION,
  progressionKey,
  shouldOfferDeload,
  toSessionSummary,
  weekStartOf,
  type ExerciseLookup,
  type ProgressionEntry,
} from '@chefer/utils';
import { ensureExerciseLibrary } from '../../lib/exercise-library/ensure.js';
import {
  gymContextLoader,
  isDeloadActive,
  summarizeUserWeeks,
  type GymContextLoader,
  type GymUserContext,
} from './gym-context.js';
import {
  lookupFromRows,
  serverToday,
  toExerciseDto,
  toProfileDto,
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

export class GymBootstrapService {
  constructor(
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly progressionRepo: IExerciseProgressionRepository = exerciseProgressionRepository,
    private readonly sessionRepo: IWorkoutSessionRepository = workoutSessionRepository,
    private readonly pauseRepo: ITrainingPauseRepository = trainingPauseRepository,
    private readonly weightRepo: Pick<IWeightEntryRepository, 'findLatest'> = weightEntryRepository,
    private readonly contextLoader: Pick<GymContextLoader, 'load'> = gymContextLoader,
    private readonly progression: Pick<ProgressionService, 'toDtos'> = progressionService,
    private readonly ensure: () => Promise<void> = ensureExerciseLibrary,
  ) {}

  async get(
    userId: string,
    input: { librarySince?: string | undefined; today?: string | undefined } = {},
  ): Promise<GymBootstrap> {
    const today = input.today ?? serverToday();
    await this.ensure();

    const [ctx, exerciseRows, progressionRows, sessionDates, recentRows, pauses, latestWeight] =
      await Promise.all([
        this.contextLoader.load(userId),
        this.exerciseRepo.findVisible(userId),
        this.progressionRepo.findForUser(userId),
        this.sessionRepo.findCompletedDates(userId),
        this.sessionRepo.findCompleted(userId, {
          fromLocalDate: addDaysLocal(today, -RECENT_SESSION_DAYS),
        }),
        this.pauseRepo.listForUser(userId),
        this.weightRepo.findLatest(userId),
      ]);

    const { lookup, metas } = lookupFromRows(exerciseRows);

    // Library: full list, or the rows changed since the client's cursor.
    const since = input.librarySince ? new Date(input.librarySince) : null;
    const libraryRows = since ? exerciseRows.filter((r) => r.updatedAt >= since) : exerciseRows;
    const cursorMs = Math.max(
      since?.getTime() ?? 0,
      ...libraryRows.map((r) => r.updatedAt.getTime()),
    );

    const progressions = this.progression.toDtos(ctx, progressionRows, metas, today);
    const recentSessions = recentRows.map((r) => toSessionSummary(toSessionDoc(r))).reverse(); // newest first
    const { weeks: allWeeks, streak } = summarizeUserWeeks({
      profileRow: ctx.profileRow,
      sessionDates,
      pauses: pauses.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
      today,
    });

    return {
      profile: ctx.profileRow ? toProfileDto(ctx.profileRow) : null,
      activeRoutine: ctx.activeRoutine,
      nextWorkout: this.nextWorkout(ctx, lookup, progressions, recentSessions, today),
      library: libraryRows.map(toExerciseDto),
      libraryCursor: new Date(cursorMs).toISOString(),
      progressions,
      recentSessions,
      // ALL weeks since setup (tiny rows): the phone's optimistic fold
      // (applyFinishedSession) re-derives streak + flex tokens from them, so a
      // truncated window would drift from the server's answer while offline.
      weeks: allWeeks,
      streak,
      offers: this.offers(ctx, progressions, allWeeks, sessionDates, today),
      bodyweightKg: latestWeight?.weightKg ?? null,
      serverTime: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
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
    });
  }

  /**
   * Pending offers (dismissals remembered by key in GymProfile.offerState):
   * - deload   engine shouldOfferDeload, once per week, unless a deload is running
   * - stall    an exercise whose engine decision is STALL_SUGGEST_SWAP
   * - comeback the last session is more than COMEBACK_AFTER_DAYS ago
   * - recap    first RECAP_OFFER_DAYS days of a month, when last month had sessions
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
      sessionDates.some((d) => d.startsWith(prevMonth))
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
}

/** "2026-03-04" → "2026-02"; "2026-01-15" → "2025-12". */
export function previousMonth(localDate: string): string {
  const y = Number(localDate.slice(0, 4));
  const m = Number(localDate.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export const gymBootstrapService = new GymBootstrapService();
