import type { GymBootstrap } from '@chefer/types';
import { isActivityLogSession } from './activity-log';
import { todayStatus } from './session';
import { weekdayOf } from './weeks';

// UX-FOOD-19: ONE answer to "which session is today's?" for the Today tab's
// workout card and the Plan's training-day marker. Before this, the card named
// the rotation's NEXT day while the Plan (server `resolveTrainingDay`) named the
// routine day pinned to today's weekday, so the two could name different
// sessions for the same training day. The precedence here is the server's:
//   1. a session completed today (its name),
//   2. the routine day pinned to today's weekday (first by position),
// then the gym's own rotation rules (`todayStatus`) for an unpinned or overdue
// day. Pure: no I/O, no clock.

export type TodaysSession =
  /** A workout was already completed today. */
  | { kind: 'completed'; dayId: string | null; dayName: string }
  /** The routine day pinned to today's weekday. */
  | { kind: 'planned'; dayId: string; dayName: string }
  /** No pin for today: the rotation's next day is due (unpinned, or overdue from `overdueFrom`). */
  | { kind: 'rotation'; dayId: string; dayName: string; overdueFrom?: number }
  /** Nothing is training today. */
  | { kind: 'none' };

export function selectTodaysSession(input: {
  bootstrap: Pick<GymBootstrap, 'recentSessions' | 'nextWorkout' | 'activeRoutine'>;
  today: string;
  /** UX-GYM-12: device-local setup date — see `todayStatus`. */
  since?: string | null | undefined;
}): TodaysSession {
  const { bootstrap, today, since } = input;
  // WP-20: a quick-logged activity never names "today's session".
  const done = bootstrap.recentSessions.find(
    (s) => s.status === 'COMPLETED' && s.localDate === today && !isActivityLogSession(s),
  );
  if (done) return { kind: 'completed', dayId: done.routineDayId, dayName: done.name };

  const todayWeekday = weekdayOf(today);
  const pinned = [...(bootstrap.activeRoutine?.days ?? [])]
    .sort((a, b) => a.position - b.position)
    .find((d) => d.plannedWeekday === todayWeekday);
  if (pinned) return { kind: 'planned', dayId: pinned.id, dayName: pinned.name };

  const status = todayStatus({ bootstrap, today, since });
  const next = bootstrap.nextWorkout;
  if (status.kind === 'training' && next) {
    return {
      kind: 'rotation',
      dayId: next.dayId,
      dayName: next.dayName,
      ...(status.overdueFrom !== undefined && { overdueFrom: status.overdueFrom }),
    };
  }
  return { kind: 'none' };
}
