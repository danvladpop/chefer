// UX-36 amendment A2 (T-36.A2.1, O-10/O-11): a pure day-grouping of recent
// completed sessions for Gym Today's `Recent` section. Shared by mobile
// (`recent-workouts.tsx`) and web (`today-view.tsx`).
import type { SessionSummaryDto } from '@chefer/types';
import { activityFacts, isActivityLogSession } from './activity-log';
import { addDaysLocal, daysBetweenLocal } from './weeks';

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface RecentSessionRow {
  id: string;
  name: string;
  localDate: string;
  /** "HH:MM" in the session's own started-at instant, device-locale hours:minutes. */
  startTime: string;
  durationMin: number;
  workingSets: number;
  hasPr: boolean;
  /** WP-20: a quick-logged activity — reads "45 min · ~400 kcal", never "1 sets". */
  activity: boolean;
  /** The kcal the user entered for an activity, else null. Record only. */
  caloriesKcal: number | null;
}

/**
 * The stats half of a session row — `{text}` for the visible line and `{spoken}`
 * for the accessibility label. A workout: "52 min · 12 sets · PR". An activity:
 * "45 min · ~400 kcal" (the kcal only when entered).
 */
export function sessionStatsText(stats: {
  durationMin: number;
  workingSets: number;
  hasPr: boolean;
  activity: boolean;
  caloriesKcal: number | null;
}): { text: string; spoken: string } {
  if (stats.activity) {
    // 0 reads as "not entered" — "~0 kcal" says nothing useful.
    const kcal =
      stats.caloriesKcal !== null && stats.caloriesKcal > 0 ? Math.round(stats.caloriesKcal) : null;
    return {
      text: `${stats.durationMin} min${kcal !== null ? ` · ~${kcal} kcal` : ''}`,
      spoken: `${stats.durationMin} minutes${kcal !== null ? `, about ${kcal} kilocalories` : ''}`,
    };
  }
  return {
    text: `${stats.durationMin} min · ${stats.workingSets} sets${stats.hasPr ? ' · PR' : ''}`,
    spoken: `${stats.durationMin} minutes, ${stats.workingSets} sets${stats.hasPr ? ', personal record' : ''}`,
  };
}

/** `sessionStatsText` for a summary (history lists compute their own minutes). */
export function sessionStatsOf(
  session: SessionSummaryDto,
  hasPr: boolean,
): { text: string; spoken: string } {
  return sessionStatsText({
    durationMin: session.finishedAt ? minutesBetween(session.startedAt, session.finishedAt) : 0,
    workingSets: workingSetCount(session),
    hasPr,
    activity: isActivityLogSession(session),
    caloriesKcal: activityFacts(session).caloriesKcal,
  });
}

export interface RecentDayGroup {
  /** "Today", "Yesterday" or "{weekday d Mon}" — never an ISO date. */
  heading: string;
  localDate: string;
  /** Start times are only meaningful (and only shown by the caller) when this has 2+ rows. */
  rows: RecentSessionRow[];
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000),
  );
}

function workingSetCount(session: SessionSummaryDto): number {
  return session.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !s.isWarmup && s.completed).length,
    0,
  );
}

/** `{weekday d Mon}`, e.g. "Thu 24 Sep" — never an ISO date (UX-36 A2). */
export function dayHeading(localDate: string, today: string): string {
  const diff = daysBetweenLocal(localDate, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(`${localDate}T00:00:00.000Z`);
  const weekday = WEEKDAY_NAMES[(d.getUTCDay() + 6) % 7];
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

function toRow(session: SessionSummaryDto, prSessionIds: ReadonlySet<string>): RecentSessionRow {
  const start = new Date(session.startedAt);
  return {
    id: session.id,
    name: session.name,
    localDate: session.localDate,
    // Device-local wall clock (was UTC: an evening session read 3 h early in Romania).
    startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    durationMin: session.finishedAt ? minutesBetween(session.startedAt, session.finishedAt) : 0,
    workingSets: workingSetCount(session),
    hasPr: prSessionIds.has(session.id),
    activity: isActivityLogSession(session),
    caloriesKcal: activityFacts(session).caloriesKcal,
  };
}

/**
 * Group `sessions` (COMPLETED only, newest first — the caller filters and
 * sorts, e.g. from `bootstrap.recentSessions`) into day headers, taking at
 * most `limit` sessions. `prSessionIds` optionally marks sessions that hit a
 * PR (from the caller's PR detection), so the row can show `PR`.
 */
export function groupRecentSessions(
  sessions: readonly SessionSummaryDto[],
  today: string,
  opts: { limit?: number; prSessionIds?: ReadonlySet<string> } = {},
): RecentDayGroup[] {
  const { limit = 3, prSessionIds = new Set<string>() } = opts;
  const taken = sessions.slice(0, limit);
  const groups: RecentDayGroup[] = [];
  for (const session of taken) {
    const last = groups[groups.length - 1];
    const row = toRow(session, prSessionIds);
    if (last?.localDate === session.localDate) {
      last.rows.push(row);
    } else {
      groups.push({
        heading: dayHeading(session.localDate, today),
        localDate: session.localDate,
        rows: [row],
      });
    }
  }
  return groups;
}

/** Convenience: the local date `daysAgo` days before `today` (mirrors `addDaysLocal`). */
export function localDateDaysAgo(today: string, daysAgo: number): string {
  return addDaysLocal(today, -daysAgo);
}
