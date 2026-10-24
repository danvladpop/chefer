import type {
  FlameDayState,
  FlameInfo,
  GoalHistoryEntry,
  PauseRange,
  WeekSummary,
} from '@chefer/types';
import { FLAME_MILESTONES } from '@chefer/types';
import { addDaysLocal, goalForWeek, settleWeeks, weekStartOf, type WeekRow } from '../gym/weeks';
import { pilotLightMax } from './levels';
import { DEFAULT_ACTIVE_DAY_GOAL } from './xp-table';

// ─── The Flame (ideas 8–14, tech-plan §5) ─────────────────────────────────────
// Runs the same `settleWeeks` as the gym streak, over weeks of active days.

/**
 * The Flame for one user. `activeDates` are distinct local dates with a meal
 * logged, a cook finished or a workout done. History starts at the week of the
 * earliest active date, so back-dated users get their real Flame.
 */
export function summarizeFlame(input: {
  activeDates: string[];
  goalHistory: GoalHistoryEntry[];
  pauses: PauseRange[];
  today: string;
  level: number;
  /** The gym weekly streak, or null without a gym profile. */
  training: { current: number; best: number } | null;
}): FlameInfo & { weeks: WeekSummary[] } {
  const { goalHistory, pauses, today, level, training } = input;
  const active = new Set(input.activeDates);
  const currentWeek = weekStartOf(today);

  const perWeek = new Map<string, number>();
  let first = currentWeek;
  for (const date of active) {
    const wk = weekStartOf(date);
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
    if (wk < first) first = wk;
  }

  const goalOf = (wk: string) =>
    goalHistory.length === 0 ? DEFAULT_ACTIVE_DAY_GOAL : goalForWeek(goalHistory, wk);

  const rows: WeekRow[] = [];
  for (let wk = first; wk <= currentWeek; wk = addDaysLocal(wk, 7)) {
    const weekEnd = addDaysLocal(wk, 6);
    rows.push({
      weekStart: wk,
      goal: goalOf(wk),
      sessions: perWeek.get(wk) ?? 0,
      paused: pauses.some((p) => p.startDate <= weekEnd && p.endDate >= wk),
    });
  }

  const max = pilotLightMax(level);
  const { weeks, streak } = settleWeeks(rows, currentWeek, {
    flexMax: max,
    flexCoversEmpty: true,
  });

  const goal = Math.min(7, Math.max(1, goalOf(currentWeek)));
  const days: FlameDayState[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysLocal(currentWeek, i);
    if (active.has(date)) return 'active';
    if (date < today) return 'rest';
    return date === today ? 'today' : 'future';
  });
  const activeDays = perWeek.get(currentWeek) ?? 0;
  const pause = pauses.find((p) => p.startDate <= today && p.endDate >= today);

  return {
    current: streak.current,
    best: streak.best,
    pilotLights: streak.flexTokens,
    pilotLightMax: max,
    goal,
    thisWeek: {
      weekStart: currentWeek,
      activeDays,
      goal,
      met: activeDays >= goal,
      days,
    },
    pausedUntil: pause?.endDate ?? null,
    nextMilestone: FLAME_MILESTONES.find((m) => m > streak.best) ?? null,
    training,
    weeks,
  };
}

/** Monday of every week the goal was met, for paying `WEEK_GOAL`. */
export function metWeekStarts(weeks: WeekSummary[]): string[] {
  return weeks.filter((w) => w.status === 'met').map((w) => w.weekStart);
}
