// Weekly goal, streak, flex weeks, pauses — research §4.2. Weeks start Monday;
// all dates are device-local "YYYY-MM-DD" strings (never Date math across TZs).
import type { GoalHistoryEntry, PauseRange, StreakInfo, WeekSummary } from '@chefer/types';
import { notImplemented } from './_stub';

export function weekStartOf(localDate: string): string {
  return notImplemented(`weekStartOf(${localDate})`);
}

export function addDaysLocal(localDate: string, days: number): string {
  return notImplemented(`addDaysLocal(${localDate}, ${days})`);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(localDate: string): number {
  return notImplemented(`weekdayOf(${localDate})`);
}

export function summarizeWeeks(input: {
  /** localDates of COMPLETED, non-discarded sessions. */
  sessionDates: string[];
  goalHistory: GoalHistoryEntry[];
  pauses: PauseRange[];
  today: string;
  /** Monday of the first week to consider (setup week). */
  firstWeek: string;
}): { weeks: WeekSummary[]; streak: StreakInfo } {
  return notImplemented(`summarizeWeeks(${input.sessionDates.length}, ${input.today})`);
}
