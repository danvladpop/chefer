import type { GymBootstrap, PersonalRecord, SessionSummaryDto, WeekSummary } from '@chefer/types';
import { addDaysLocal, collectPrs, isLoggedDay } from '@chefer/utils';

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

export type WeekCell = {
  weekStart: string;
  kind: 'met' | 'flex' | 'paused' | 'current' | 'missed';
  /** What the cell shows: ✓, F, P, "2/4", or nothing. */
  text: string;
  /** Spoken: "Week of 2026-09-28: goal met". */
  label: string;
};

const WEEK_WORDS: Record<WeekCell['kind'], string> = {
  met: 'goal met',
  flex: 'flex week',
  paused: 'paused',
  current: 'this week',
  missed: 'under goal',
};

/** The last `count` weeks, oldest first, as the board's strip cells. */
export function weekCells(weeks: readonly WeekSummary[], count = 8): WeekCell[] {
  return weeks.slice(-count).map((w) => {
    const kind: WeekCell['kind'] =
      w.status === 'met'
        ? 'met'
        : w.status === 'flex'
          ? 'flex'
          : w.status === 'paused'
            ? 'paused'
            : w.status === 'current'
              ? 'current'
              : 'missed';
    const text =
      kind === 'met'
        ? '✓'
        : kind === 'flex'
          ? 'F'
          : kind === 'paused'
            ? 'P'
            : kind === 'current'
              ? `${w.sessions}/${w.goal}`
              : '';
    const progress = kind === 'current' ? `, ${w.sessions} of ${w.goal}` : '';
    return {
      weekStart: w.weekStart,
      kind,
      text,
      label: `Week of ${w.weekStart}: ${WEEK_WORDS[kind]}${progress}`,
    };
  });
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
