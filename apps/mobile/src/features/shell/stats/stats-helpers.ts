import type {
  E1rmSeriesDto,
  ExerciseDto,
  GymBootstrap,
  MuscleVolumeWeekDto,
  PersonalRecord,
  SessionSummaryDto,
  VolumeGroup,
  WeekSummary,
} from '@chefer/types';
import { VOLUME_GROUPS } from '@chefer/types';
import { addDaysLocal, collectPrs, isLoggedDay, weekdayOf, weekStartOf } from '@chefer/utils';

// Pure numbers behind Stats (10 Oct redesign, board Progress). The eating
// figures are computed exactly as the old Progress screen did (app/progress.tsx):
// only days with something logged count, and an average or a percentage needs
// at least three of them (T-11.6).

export const MIN_LOGGED_DAYS = 3;

type Day = {
  date: string;
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hasLog: boolean;
};

export type EatingStats = {
  windowDays: number;
  daysLogged: number;
  enoughDays: boolean;
  /** Rounded averages on logged days (0 until `enoughDays`). */
  avgKcal: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  /** Average kcal against the target, in % (0 until `enoughDays`). */
  diffPct: number;
};

export function eatingStats(days: readonly Day[], targetKcal: number): EatingStats {
  const logged = days.filter(isLoggedDay);
  const daysLogged = logged.length;
  const enoughDays = daysLogged >= MIN_LOGGED_DAYS;
  const avg = (pick: (d: Day) => number) =>
    enoughDays ? Math.round(logged.reduce((s, d) => s + pick(d), 0) / daysLogged) : 0;
  const avgKcal = avg((d) => d.totalKcal);
  return {
    windowDays: days.length,
    daysLogged,
    enoughDays,
    avgKcal,
    avgProtein: avg((d) => d.totalProtein),
    avgCarbs: avg((d) => d.totalCarbs),
    avgFat: avg((d) => d.totalFat),
    diffPct:
      targetKcal > 0 && enoughDays ? Math.round(((avgKcal - targetKcal) / targetKcal) * 100) : 0,
  };
}

/** "−7%" / "+3%" / "0%" (a real minus sign). */
export function signedPct(pct: number): string {
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `−${Math.abs(pct)}%`;
  return '0%';
}

/** Days of completed sessions the bootstrap carries (gym-bootstrap.service RECENT_SESSION_DAYS). */
export const BOOTSTRAP_SESSION_DAYS = 84;

export type TrainingStats = {
  streakWeeks: number;
  workouts: number;
  newPrs: number;
  /**
   * The range was cut to the 12 weeks the bootstrap carries — only when the
   * older history could not be fetched (offline fallback).
   */
  clipped: boolean;
};

/**
 * Week streak, workouts and new PRs (first-ever sets are baselines, not PRs)
 * over the last `rangeDays`, from the persisted gym bootstrap.
 */
export function trainingStats(
  bootstrap: Pick<GymBootstrap, 'recentSessions' | 'streak' | 'olderBests'>,
  today: string,
  rangeDays: number,
): TrainingStats {
  const clipped = rangeDays > BOOTSTRAP_SESSION_DAYS;
  const from = addDaysLocal(today, -(Math.min(rangeDays, BOOTSTRAP_SESSION_DAYS) - 1));
  const completed = bootstrap.recentSessions.filter(
    (s) => s.status === 'COMPLETED' && s.localDate >= from && s.localDate <= today,
  );
  const prs = collectPrs(bootstrap.recentSessions, undefined, bootstrap.olderBests).filter(
    (pr) => !pr.isFirst && pr.localDate >= from && pr.localDate <= today,
  );
  return {
    streakWeeks: bootstrap.streak.current,
    workouts: completed.length,
    newPrs: prs.length,
    clipped,
  };
}

/** Whether `rangeDays` reaches past the sessions the bootstrap carries (the 90-day view). */
export function needsOlderHistory(rangeDays: number): boolean {
  return rangeDays > BOOTSTRAP_SESSION_DAYS;
}

/**
 * The `gym.session.list` cursor right after the oldest cached session, so the
 * one page asked for starts where `bootstrap.recentSessions` ends.
 */
export function olderHistoryCursor(sessions: readonly SessionSummaryDto[]): string | undefined {
  let oldest: SessionSummaryDto | undefined;
  for (const s of sessions) {
    if (!oldest || s.startedAt < oldest.startedAt) oldest = s;
  }
  return oldest ? `${oldest.startedAt}|${oldest.id}` : undefined;
}

/**
 * Training numbers for a range longer than the cache (90 days), exact: the
 * cached sessions plus the next page of older ones (`gym.session.list`) for
 * workouts, and the server's all-time PR timeline (`gym.stats.prs`) for new
 * PRs — first-ever sets are baselines, not PRs, as everywhere else.
 */
export function trainingStatsWithHistory(args: {
  bootstrap: Pick<GymBootstrap, 'recentSessions' | 'streak'>;
  olderSessions: readonly SessionSummaryDto[];
  prTimeline: readonly PersonalRecord[];
  today: string;
  rangeDays: number;
}): TrainingStats {
  const { bootstrap, olderSessions, prTimeline, today, rangeDays } = args;
  const from = addDaysLocal(today, -(rangeDays - 1));
  const inRange = (localDate: string) => localDate >= from && localDate <= today;
  const ids = new Set<string>();
  for (const s of [...bootstrap.recentSessions, ...olderSessions]) {
    if (s.status === 'COMPLETED' && inRange(s.localDate)) ids.add(s.id);
  }
  return {
    streakWeeks: bootstrap.streak.current,
    workouts: ids.size,
    newPrs: prTimeline.filter((pr) => !pr.isFirst && inRange(pr.localDate)).length,
    clipped: false,
  };
}

// ─── Strength tab (2026-10-15 Stats revamp) ─────────────────────────────────
// Plain numbers for people who don't read e1RM curves: workouts per week, the
// best set of each main lift and how much stronger it got, sets per muscle,
// and the latest PRs. The detailed charts stay one tap away (/training/stats).

/** First day of a `rangeDays` window ending `today`. */
export function rangeStart(today: string, rangeDays: number): string {
  return addDaysLocal(today, -(rangeDays - 1));
}

/** Weeks (Monday starts) that overlap the window `from`…`today`, oldest first. */
export function weeksInRange<T extends { weekStart: string }>(
  weeks: readonly T[],
  from: string,
  today: string,
): T[] {
  const firstMonday = weekStartOf(from);
  return weeks.filter((w) => w.weekStart >= firstMonday && w.weekStart <= today);
}

/**
 * Training numbers for a year: workouts from the week summaries (the
 * bootstrap carries every week since setup, so this works offline) and new
 * PRs from the server's PR timeline. A week that straddles the first day
 * counts whole.
 */
export function trainingStatsForYear(args: {
  bootstrap: Pick<GymBootstrap, 'weeks' | 'streak'>;
  prTimeline: readonly PersonalRecord[];
  today: string;
  rangeDays: number;
}): TrainingStats {
  const { bootstrap, prTimeline, today, rangeDays } = args;
  const from = rangeStart(today, rangeDays);
  return {
    streakWeeks: bootstrap.streak.current,
    workouts: weeksInRange(bootstrap.weeks, from, today).reduce((n, w) => n + w.sessions, 0),
    newPrs: prTimeline.filter((pr) => !pr.isFirst && pr.localDate >= from && pr.localDate <= today)
      .length,
    clipped: false,
  };
}

export type WeekBar = {
  weekStart: string;
  sessions: number;
  goal: number;
  met: boolean;
};

/** One bar per week of the range: workouts done, and whether the goal was met. */
export function workoutWeekBars(
  weeks: readonly WeekSummary[],
  from: string,
  today: string,
): WeekBar[] {
  return weeksInRange(weeks, from, today).map((w) => ({
    weekStart: w.weekStart,
    sessions: w.sessions,
    goal: w.goal,
    met: w.status === 'met' || (w.goal > 0 && w.sessions >= w.goal),
  }));
}

/** Monday → Sunday of this week: whether a workout was completed that day. */
export function thisWeekDays(
  sessions: readonly SessionSummaryDto[],
  today: string,
): { date: string; trained: boolean; isToday: boolean; future: boolean }[] {
  const monday = addDaysLocal(today, -weekdayOf(today));
  const trained = new Set(sessions.filter((s) => s.status === 'COMPLETED').map((s) => s.localDate));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysLocal(monday, i);
    return { date, trained: trained.has(date), isToday: date === today, future: date > today };
  });
}

/**
 * The lifts to show: the most-trained exercises in the window's sessions
 * (compounds first), up to `limit`. Cardio and bodyweight-only work has no
 * best set to show, so the caller drops lifts whose series comes back empty.
 */
export function pickLifts(
  sessions: readonly SessionSummaryDto[],
  library: readonly ExerciseDto[],
  from: string,
  limit = 4,
): ExerciseDto[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== 'COMPLETED' || s.localDate < from) continue;
    for (const ex of s.exercises) {
      if (ex.skipped) continue;
      const working = ex.sets.some((set) => set.completed && !set.isWarmup && set.weightKg > 0);
      if (!working) continue;
      counts.set(ex.exerciseId, (counts.get(ex.exerciseId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .flatMap(([id, n]) => {
      const meta = byId.get(id);
      return meta ? [{ meta, n }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.meta.category === 'COMPOUND') - Number(a.meta.category === 'COMPOUND') ||
        b.n - a.n ||
        a.meta.name.localeCompare(b.meta.name),
    )
    .slice(0, limit)
    .map((x) => x.meta);
}

export type LiftSummary = {
  /** The heaviest estimated set in the window, as lifted. */
  best: { weightKg: number; reps: number; localDate: string } | null;
  /**
   * How much stronger, in %: the estimated max at the end of the window
   * against where it started (both smoothed over the last 3 sessions).
   * Null with fewer than two sessions in the window.
   */
  changePct: number | null;
  /** Estimated max per session in the window, oldest first (the sparkline). */
  points: number[];
};

export function liftSummary(series: E1rmSeriesDto, from: string, today: string): LiftSummary {
  const idx = series.points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.localDate >= from && p.localDate <= today);
  const first = idx[0];
  const last = idx.at(-1);
  if (!first || !last) return { best: null, changePct: null, points: [] };
  let best = first.p;
  for (const { p } of idx) if (p.e1rmKg > best.e1rmKg) best = p;
  const start = series.trend[first.i] ?? first.p.e1rmKg;
  const end = series.trend[last.i] ?? last.p.e1rmKg;
  return {
    best: { weightKg: best.weightKg, reps: best.reps, localDate: best.localDate },
    changePct: idx.length >= 2 && start > 0 ? Math.round(((end - start) / start) * 100) : null,
    points: idx.map(({ p }) => p.e1rmKg),
  };
}

/** "6% stronger" / "About the same" / "3% lighter" — no curve to read. */
export function liftChangeText(pct: number | null): string | null {
  if (pct === null) return null;
  if (Math.abs(pct) < 1) return 'About the same';
  return pct > 0 ? `${pct}% stronger` : `${Math.abs(pct)}% lighter`;
}

const VOLUME_GROUP_KEYS = Object.keys(VOLUME_GROUPS) as VolumeGroup[];

export type MuscleSets = { group: VolumeGroup; sets: number };

/**
 * Working sets per muscle in `weeks` (already cut to the window), biggest
 * first, zero groups left out. Past one week it is the average per week, so a
 * year reads on the same scale as a week ("about 12 sets a week").
 */
export function muscleSets(
  weeks: readonly MuscleVolumeWeekDto[],
  rangeDays: number,
  limit = 6,
): MuscleSets[] {
  const divisor = rangeDays > 7 ? rangeDays / 7 : 1;
  // Whole sets from 10 up; below that one decimal, so a light month reads
  // "1.5 a week" rather than vanishing as 0 or 2.
  const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
  return VOLUME_GROUP_KEYS.map((group) => ({
    group,
    sets: round(weeks.reduce((n, w) => n + (w.sets[group] ?? 0), 0) / divisor),
  }))
    .filter((m) => m.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, limit);
}

/**
 * The newest PRs in the window, one per lift per workout (a set can beat the
 * weight and the estimated max at once), first-ever sets left out.
 */
export function recentPrs(
  prs: readonly PersonalRecord[],
  from: string,
  today: string,
  limit = 3,
): PersonalRecord[] {
  const seen = new Map<string, PersonalRecord>();
  for (const pr of prs) {
    if (pr.isFirst || pr.localDate < from || pr.localDate > today) continue;
    const key = `${pr.sessionId}:${pr.exerciseId}`;
    const kept = seen.get(key);
    if (!kept || pr.weightKg > kept.weightKg) seen.set(key, pr);
  }
  return [...seen.values()].sort((a, b) => b.localDate.localeCompare(a.localDate)).slice(0, limit);
}
