import {
  exerciseRepository,
  trainingPauseRepository,
  weightEntryRepository,
  workoutSessionRepository,
  type IExerciseRepository,
  type ITrainingPauseRepository,
  type IWeightEntryRepository,
  type IWorkoutSessionRepository,
} from '@chefer/database';
import type {
  BodyweightPointDto,
  E1rmPointDto,
  E1rmSeriesDto,
  MonthlyRecapDto,
  MuscleVolumeWeekDto,
  PrDto,
  RepPrRowDto,
  SessionSummaryDto,
  StatsRange,
  StreakInfo,
  WeekSummary,
} from '@chefer/types';
import {
  addDaysLocal,
  bestE1rm,
  collectPrs,
  completedSetsByWeek,
  toSessionSummary,
  weekStartOf,
} from '@chefer/utils';
import { gymContextLoader, summarizeUserWeeks, type GymContextLoader } from './gym-context.js';
import { lookupFromRows, serverToday, toSessionDoc } from './mappers.js';

// ─── GymStatsService (gym_plan.md §4.1) ──────────────────────────────────────
// "Am I progressing?" — every number is computed from COMPLETED sessions with
// the pure engine (e1RM, PRs, fractional sets, weeks/streak); this service
// only selects the data and aggregates the engine's per-session outputs.

const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = { '3m': 91, '1y': 365 };
/** e1RM trend = rolling max over this many sessions. */
const TREND_WINDOW = 3;
const TOP_GAINS = 3;

const utcMidnight = (localDate: string) => new Date(`${localDate}T00:00:00.000Z`);
const round1 = (n: number) => Math.round(n * 10) / 10;

function rangeStart(range: StatsRange, today: string): string | null {
  return range === 'all' ? null : addDaysLocal(today, -RANGE_DAYS[range]);
}

/** Best e1RM of each session (max over that exercise's entries), oldest first. */
function sessionBests(
  summaries: SessionSummaryDto[],
  exerciseId: string,
): { session: SessionSummaryDto; best: NonNullable<ReturnType<typeof bestE1rm>> }[] {
  const out: { session: SessionSummaryDto; best: NonNullable<ReturnType<typeof bestE1rm>> }[] = [];
  for (const session of summaries) {
    let best: ReturnType<typeof bestE1rm> = null;
    for (const e of session.exercises) {
      if (e.exerciseId !== exerciseId || e.skipped) continue;
      const b = bestE1rm(e.sets, e.lastSetRir);
      if (b && (!best || b.e1rmKg > best.e1rmKg)) best = b;
    }
    if (best) out.push({ session, best });
  }
  return out;
}

export class GymStatsService {
  constructor(
    private readonly sessionRepo: IWorkoutSessionRepository = workoutSessionRepository,
    private readonly exerciseRepo: IExerciseRepository = exerciseRepository,
    private readonly pauseRepo: ITrainingPauseRepository = trainingPauseRepository,
    private readonly weightRepo: Pick<
      IWeightEntryRepository,
      'findInRange'
    > = weightEntryRepository,
    private readonly contextLoader: Pick<GymContextLoader, 'load'> = gymContextLoader,
  ) {}

  /** e1RM per session. PR flags consider ALL history; the range only trims the output. */
  async e1rm(
    userId: string,
    exerciseId: string,
    range: StatsRange,
    today: string = serverToday(),
  ): Promise<E1rmSeriesDto> {
    const summaries = await this.summaries(userId, { exerciseIds: [exerciseId] });
    let runningMax = -Infinity;
    const all: E1rmPointDto[] = sessionBests(summaries, exerciseId).map(({ session, best }) => {
      const isPr = runningMax !== -Infinity && best.e1rmKg > runningMax;
      runningMax = Math.max(runningMax, best.e1rmKg);
      return {
        localDate: session.localDate,
        sessionId: session.id,
        e1rmKg: best.e1rmKg,
        weightKg: best.weightKg,
        reps: best.reps,
        lowConfidence: best.lowConfidence,
        isPr,
      };
    });
    const from = rangeStart(range, today);
    const points = from ? all.filter((p) => p.localDate >= from) : all;
    const trend = points.map((_, i) =>
      Math.max(...points.slice(Math.max(0, i - TREND_WINDOW + 1), i + 1).map((p) => p.e1rmKg)),
    );
    return { exerciseId, points, trend };
  }

  /** Heaviest completed working set at each rep count (ties keep the earliest). */
  async repPrs(userId: string, exerciseId: string): Promise<RepPrRowDto[]> {
    const summaries = await this.summaries(userId, { exerciseIds: [exerciseId] });
    const best = new Map<number, RepPrRowDto>();
    for (const s of summaries) {
      for (const e of s.exercises) {
        if (e.exerciseId !== exerciseId || e.skipped) continue;
        for (const set of e.sets) {
          if (!set.completed || set.isWarmup || set.reps <= 0) continue;
          const cur = best.get(set.reps);
          if (!cur || set.weightKg > cur.weightKg) {
            best.set(set.reps, { weightKg: set.weightKg, reps: set.reps, localDate: s.localDate });
          }
        }
      }
    }
    return [...best.values()].sort((a, b) => a.reps - b.reps);
  }

  /** Fractional completed sets per volume group for the last `weeks` weeks. */
  async muscleVolume(
    userId: string,
    weeks: number,
    today: string = serverToday(),
  ): Promise<MuscleVolumeWeekDto[]> {
    const from = addDaysLocal(weekStartOf(today), -7 * (weeks - 1));
    const [summaries, exerciseRows] = await Promise.all([
      this.summaries(userId, { fromLocalDate: from }),
      this.exerciseRepo.findVisible(userId),
    ]);
    return completedSetsByWeek(summaries, lookupFromRows(exerciseRows).lookup);
  }

  async consistency(
    userId: string,
    weeks: number,
    today: string = serverToday(),
  ): Promise<{ weeks: WeekSummary[]; streak: StreakInfo }> {
    const res = await this.weeksAndStreak(userId, today);
    return { weeks: res.weeks.slice(-weeks), streak: res.streak };
  }

  /** PR timeline, NEWEST first (engine collectPrs is oldest-first). */
  async prs(userId: string, exerciseId: string | undefined, limit: number): Promise<PrDto[]> {
    const summaries = await this.summaries(userId, exerciseId ? { exerciseIds: [exerciseId] } : {});
    return collectPrs(summaries, exerciseId).reverse().slice(0, limit);
  }

  async monthlyRecap(
    userId: string,
    month: string,
    today: string = serverToday(),
  ): Promise<MonthlyRecapDto> {
    const prev = shiftMonth(month, -1);
    const next = shiftMonth(month, 1);
    const [all, exerciseRows, weekData, weights] = await Promise.all([
      this.summaries(userId),
      this.exerciseRepo.findVisible(userId),
      this.weeksAndStreak(userId, today),
      this.weightRepo.findInRange(userId, utcMidnight(`${month}-01`), utcMidnight(`${next}-01`)),
    ]);
    const lookup = lookupFromRows(exerciseRows).lookup;
    const inMonth = all.filter((s) => s.localDate.startsWith(month));
    const inPrev = all.filter((s) => s.localDate.startsWith(prev));

    const monthWeeks = weekData.weeks.filter((w) => w.weekStart.startsWith(month));
    const exerciseIds = [...new Set(inMonth.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
    const topGains = exerciseIds
      .map((exerciseId) => {
        const cur = sessionBests(inMonth, exerciseId);
        const before = sessionBests(inPrev, exerciseId);
        const toKg = Math.max(...cur.map((c) => c.best.e1rmKg));
        const fromKg =
          before.length > 0
            ? Math.max(...before.map((b) => b.best.e1rmKg))
            : (cur[0]?.best.e1rmKg ?? 0);
        return {
          exerciseId,
          fromKg,
          toKg,
          pct: fromKg > 0 ? round1(((toKg - fromKg) / fromKg) * 100) : 0,
        };
      })
      .filter((g) => Number.isFinite(g.toKg) && g.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, TOP_GAINS);

    const sumByGroup = (sessions: SessionSummaryDto[]) => {
      const totals = new Map<string, number>();
      for (const week of completedSetsByWeek(sessions, lookup)) {
        for (const [group, sets] of Object.entries(week.sets)) {
          totals.set(group, (totals.get(group) ?? 0) + sets);
        }
      }
      return totals;
    };
    const cur = sumByGroup(inMonth);
    const before = sumByGroup(inPrev);
    const setsByGroup = [...new Set([...cur.keys(), ...before.keys()])]
      .map((group) => ({
        group,
        sets: round1(cur.get(group) ?? 0),
        prevSets: round1(before.get(group) ?? 0),
      }))
      .sort((a, b) => b.sets - a.sets);

    return {
      month,
      sessions: inMonth.length,
      sessionsGoal: monthWeeks.reduce((n, w) => n + w.goal, 0),
      weeksMet: monthWeeks.filter((w) => w.status === 'met' || w.status === 'flex').length,
      weeksTotal: monthWeeks.length,
      streak: weekData.streak.current,
      prCount: collectPrs(all).filter((p) => p.localDate.startsWith(month)).length,
      topGains,
      setsByGroup,
      bodyweight: {
        startKg: weights[0]?.weightKg ?? null,
        endKg: weights.at(-1)?.weightKg ?? null,
      },
    };
  }

  /**
   * Bodyweight series from the nutrition weight log (WeightEntry). One point
   * per day (the day's last entry); `localDate` is the entry's UTC date.
   */
  async bodyweight(
    userId: string,
    range: StatsRange,
    today: string = serverToday(),
  ): Promise<BodyweightPointDto[]> {
    const from = rangeStart(range, today);
    const rows = await this.weightRepo.findInRange(
      userId,
      from ? utcMidnight(from) : null,
      utcMidnight(addDaysLocal(today, 1)),
    );
    const byDay = new Map<string, number>();
    for (const r of rows) byDay.set(r.recordedAt.toISOString().slice(0, 10), r.weightKg);
    return [...byDay.entries()].map(([localDate, weightKg]) => ({ localDate, weightKg }));
  }

  // ─── internals ───────────────────────────────────────────────────────────

  private async summaries(
    userId: string,
    opts: { exerciseIds?: string[]; fromLocalDate?: string } = {},
  ): Promise<SessionSummaryDto[]> {
    const rows = await this.sessionRepo.findCompleted(userId, opts);
    return rows.map((r) => toSessionSummary(toSessionDoc(r)));
  }

  private async weeksAndStreak(userId: string, today: string) {
    const [ctx, sessionDates, pauses] = await Promise.all([
      this.contextLoader.load(userId),
      this.sessionRepo.findCompletedDates(userId),
      this.pauseRepo.listForUser(userId),
    ]);
    return summarizeUserWeeks({
      profileRow: ctx.profileRow,
      sessionDates,
      pauses: pauses.map((p) => ({ startDate: p.startDate, endDate: p.endDate })),
      today,
    });
  }
}

/** "2026-01" ± n months. */
export function shiftMonth(month: string, delta: number): string {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export const gymStatsService = new GymStatsService();
