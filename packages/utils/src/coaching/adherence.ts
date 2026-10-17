// Adherence for a coached client (docs/trainer-platform/spec.md §7.2): the last
// 8 weeks against the weekly goal and a 14-day strip of planned days. Pure; built
// from the gym engine's `summarizeWeeks`, the active routine's `plannedWeekday`s,
// completed-session dates and pause DATES (never `TrainingPause.reason`).
import {
  COACHING_LIMITS,
  type AdherenceDayDto,
  type AdherenceDto,
  type GoalHistoryEntry,
  type PauseRange,
} from '@chefer/types';
import { addDaysLocal, summarizeWeeks, weekdayOf, weekStartOf } from '../gym/weeks';

export interface AdherenceInput {
  /** The viewer's device-local date. */
  today: string;
  /** localDates of the client's COMPLETED sessions (any order). */
  sessionDates: readonly string[];
  goalHistory: readonly GoalHistoryEntry[];
  /** Pause date ranges only. */
  pauses: readonly PauseRange[];
  /** `plannedWeekday` of each day of the active routine (0 = Monday), nulls allowed. */
  plannedWeekdays: readonly (number | null)[];
  /** Device-local date training was set up (the first week judged is the earlier of this and the first session). */
  setupDate: string;
}

export function buildAdherence(input: AdherenceInput): AdherenceDto {
  const dates = [...input.sessionDates].sort();
  const first = [input.setupDate, ...dates].reduce((a, b) => (b < a ? b : a));
  const { weeks } = summarizeWeeks({
    sessionDates: dates,
    goalHistory: [...input.goalHistory],
    pauses: [...input.pauses],
    today: input.today,
    firstWeek: weekStartOf(first),
  });
  const lastWeeks = weeks.slice(-COACHING_LIMITS.adherenceWeeks).map((w) => ({
    weekStart: w.weekStart,
    goal: w.goal,
    sessions: w.sessions,
    status: w.status,
  }));

  const trained = new Set(dates);
  const planned = new Set(input.plannedWeekdays.filter((d): d is number => d !== null));
  const days: AdherenceDayDto[] = [];
  for (let back = COACHING_LIMITS.adherenceDays - 1; back >= 0; back -= 1) {
    const localDate = addDaysLocal(input.today, -back);
    days.push({
      localDate,
      planned: planned.has(weekdayOf(localDate)),
      trained: trained.has(localDate),
      paused: input.pauses.some((p) => p.startDate <= localDate && localDate <= p.endDate),
    });
  }
  return { weeks: lastWeeks, days };
}
