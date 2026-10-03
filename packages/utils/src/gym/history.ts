// T-36.5 (Stats › History): week-grouped session history, shared by mobile
// (`stats/history-view.tsx`) and web. Pure grouping only — pagination (the
// cache-then-cursor "Load more") stays in the UI layer, same split as
// `recent.ts`'s day-grouping for Gym Today.
import type { SessionSummaryDto } from '@chefer/types';
import { weekStartOf } from './weeks';

export interface HistoryWeekGroup {
  /** The Monday `weekStartOf` this group's sessions fall in. */
  weekStart: string;
  sessions: SessionSummaryDto[];
}

/** Groups `sessions` (any order in, but pass newest-first) into week buckets, preserving order. */
export function groupSessionsByWeek(sessions: readonly SessionSummaryDto[]): HistoryWeekGroup[] {
  const groups: HistoryWeekGroup[] = [];
  for (const session of sessions) {
    const weekStart = weekStartOf(session.localDate);
    const last = groups[groups.length - 1];
    if (last?.weekStart === weekStart) {
      last.sessions.push(session);
    } else {
      groups.push({ weekStart, sessions: [session] });
    }
  }
  return groups;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "24 Sep 2026" in the device's locale from a `YYYY-MM-DD` local date — never an
 * ISO string in the UI (UX-GYM-33/34). Built in UTC so the day never shifts with
 * the timezone; anything that is not a local date comes back unchanged.
 */
export function formatLocalDateLong(localDate: string, locale?: string): string {
  const m = LOCAL_DATE.exec(localDate);
  if (!m) return localDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return localDate;
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Last session" / "Last 3 sessions" — never "Last 1 sessions"; "Last sessions" for none. */
export function lastSessionsLabel(count: number): string {
  if (count <= 0) return 'Last sessions';
  return count === 1 ? 'Last session' : `Last ${count} sessions`;
}
