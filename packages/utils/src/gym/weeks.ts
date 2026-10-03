// Weekly goal, streak, flex weeks, pauses — research §4.2. Weeks start Monday;
// all dates are device-local "YYYY-MM-DD" strings. Date math parses them as UTC
// midnights so daylight-saving changes can never shift a day.
import type { GoalHistoryEntry, PauseRange, StreakInfo, WeekSummary } from '@chefer/types';

const DAY_MS = 86_400_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Flex tokens: earn one per this many met weeks … */
export const FLEX_EARN_EVERY = 4;
/** … and hold at most this many. */
export const FLEX_MAX = 2;
/** Fallback weekly goal when no goal history is known. */
export const DEFAULT_WEEKLY_GOAL = 3;

function parseLocal(localDate: string): number {
  const m = LOCAL_DATE.exec(localDate);
  if (!m) {
    throw new Error(`Invalid local date "${localDate}" (expected YYYY-MM-DD)`);
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatLocal(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${mm}-${dd}`;
}

export function addDaysLocal(localDate: string, days: number): string {
  return formatLocal(parseLocal(localDate) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenLocal(from: string, to: string): number {
  return Math.round((parseLocal(to) - parseLocal(from)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(localDate: string): number {
  return (new Date(parseLocal(localDate)).getUTCDay() + 6) % 7;
}

export function weekStartOf(localDate: string): string {
  return addDaysLocal(localDate, -weekdayOf(localDate));
}

const WEEKDAY_SHORT_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * "Thu 24 Sep" — a device-local date as a weekday + day + short month, never
 * an ISO string. Used wherever a date must be shown but "Today"/"Yesterday"
 * relative wording (`recent.ts`'s `dayHeading`) doesn't apply — the Resume
 * card's backfill eyebrow, Stats › History week headers.
 */
export function weekdayDateLabel(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00.000Z`);
  const weekday = WEEKDAY_SHORT_NAMES[weekdayOf(localDate)];
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-09" → "September" (UX-GYM-13: "See September"); null for anything that is not YYYY-MM. */
export function monthNameOf(month: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return m ? (MONTH_NAMES[Number(m[2]) - 1] ?? null) : null;
}

/**
 * "7-week streak" — or, for a streak of 0, `Your streak starts when you hit
 * this week's goal.` instead of the demoralising "0-week streak" (T-36.4;
 * shared by mobile `today-helpers.ts`'s `formatStreakLine` — which also
 * layers a flex-week suffix on top — and web's today-view/summary-view/
 * ConsistencyGrid, which all had the same bare `{streak.current}-week
 * streak` bug).
 */
export function streakWeeksLabel(current: number): string {
  if (current === 0) return "Your streak starts when you hit this week's goal.";
  return current === 1 ? '1-week streak' : `${current}-week streak`;
}

/**
 * UX-GYM-12: the weekly goal to SHOW. In the week training was set up the goal
 * is pro-rated to the days left (setup day through Sunday) — "0 of 4 this week"
 * on a Friday sign-up is a goal nobody can reach. Later weeks, or an unknown
 * setup date, keep the full goal. Display only: the streak maths is unchanged.
 */
export function proRatedWeekGoal(input: {
  goal: number;
  today: string;
  /** Device-local date training was set up, or null when unknown. */
  setupDate: string | null;
}): number {
  const { goal, today, setupDate } = input;
  if (!setupDate || weekStartOf(setupDate) !== weekStartOf(today)) return goal;
  return Math.max(1, Math.min(goal, 7 - weekdayOf(setupDate)));
}

/** Goal in force for a week: the latest entry whose fromWeek ≤ weekStart (earliest entry before any). */
export function goalForWeek(goalHistory: GoalHistoryEntry[], weekStart: string): number {
  const sorted = [...goalHistory].sort((a, b) => a.fromWeek.localeCompare(b.fromWeek));
  let goal = sorted[0]?.goal ?? DEFAULT_WEEKLY_GOAL;
  for (const entry of sorted) {
    if (weekStartOf(entry.fromWeek) <= weekStart) {
      goal = entry.goal;
    }
  }
  return Math.max(1, goal);
}

function weekOverlapsPause(weekStart: string, pauses: PauseRange[]): boolean {
  const weekEnd = addDaysLocal(weekStart, 6);
  return pauses.some((p) => p.startDate <= weekEnd && p.endDate >= weekStart);
}

/** Raw facts about one week, before streak/flex settlement. */
export interface WeekRow {
  weekStart: string;
  goal: number;
  sessions: number;
  paused: boolean;
}

/**
 * Settle weeks in order (research §4.2):
 * - met (sessions ≥ goal): streak +1, and every 4th met week earns a flex token (max 2);
 * - paused (under goal, overlapping a pause): the streak is frozen — no change;
 * - flex (≥ 1 session, under goal, token held): spends a token, streak +1 ("Streak safe");
 * - under / empty: streak resets to 0;
 * - the current (in-progress) week is 'current' and changes nothing unless already met.
 */
export function settleWeeks(
  rows: WeekRow[],
  currentWeek: string,
): { weeks: WeekSummary[]; streak: StreakInfo } {
  let tokens = 0;
  let metCount = 0;
  let streak = 0;
  let best = 0;
  let thisWeekSessions = 0;
  let thisWeekGoal = rows[rows.length - 1]?.goal ?? DEFAULT_WEEKLY_GOAL;
  const weeks: WeekSummary[] = [];
  for (const row of rows) {
    const goal = Math.max(1, row.goal);
    const isCurrent = row.weekStart === currentWeek;
    let status: WeekSummary['status'];
    if (row.sessions >= goal) {
      status = 'met';
      streak += 1;
      metCount += 1;
      if (metCount % FLEX_EARN_EVERY === 0) {
        tokens = Math.min(FLEX_MAX, tokens + 1);
      }
    } else if (isCurrent) {
      status = 'current';
    } else if (row.paused) {
      status = 'paused';
    } else if (row.sessions >= 1 && tokens > 0) {
      status = 'flex';
      tokens -= 1;
      streak += 1;
    } else {
      status = row.sessions >= 1 ? 'under' : 'empty';
      streak = 0;
    }
    best = Math.max(best, streak);
    if (isCurrent) {
      thisWeekSessions = row.sessions;
      thisWeekGoal = goal;
    }
    weeks.push({
      weekStart: row.weekStart,
      goal,
      sessions: row.sessions,
      status,
      flexTokens: tokens,
    });
  }
  return {
    weeks,
    streak: { current: streak, best, flexTokens: tokens, thisWeekSessions, thisWeekGoal },
  };
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
  const first = weekStartOf(input.firstWeek);
  const current = weekStartOf(input.today);
  const counts = new Map<string, number>();
  for (const date of input.sessionDates) {
    const wk = weekStartOf(date);
    counts.set(wk, (counts.get(wk) ?? 0) + 1);
  }
  const rows: WeekRow[] = [];
  for (let wk = first; wk <= current; wk = addDaysLocal(wk, 7)) {
    rows.push({
      weekStart: wk,
      goal: goalForWeek(input.goalHistory, wk),
      sessions: counts.get(wk) ?? 0,
      paused: weekOverlapsPause(wk, input.pauses),
    });
  }
  const settled = settleWeeks(rows, current);
  if (rows.length === 0) {
    settled.streak.thisWeekGoal = goalForWeek(input.goalHistory, current);
  }
  return settled;
}
