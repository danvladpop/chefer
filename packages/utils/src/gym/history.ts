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
