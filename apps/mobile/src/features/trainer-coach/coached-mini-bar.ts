import { useMemo } from 'react';
import { router } from 'expo-router';
import { getGymOwner } from '../gym/offline/owner';
import { bookingKeyOf, coachedName, coachingLabel } from './coach-model';
import { ownedBy, useCoachedRecords, type CoachedWorkoutRecord } from './coached-session-store';

// The workout mini bar's coached part (trainer-mode.md §5.1): one bar per booking with coached
// workouts in progress, "Coaching Maria" / "Coaching Maria + 1", opening the coached logger.

export interface CoachedMiniBarGroup {
  bookingKey: string;
  /** "Coaching Maria + 1". */
  label: string;
  /** The routine day of the first client ("Lower body A"). */
  dayName: string;
  /** The earliest start in the group (the timer). */
  startedAt: string;
  /** The first client: the route's `clientId` for a workout without a booking. */
  clientId: string;
}

/** Groups this trainer's in-progress coached workouts by booking, in switcher order. */
export function coachedMiniBarGroups(
  records: readonly CoachedWorkoutRecord[],
  owner: string | null,
): CoachedMiniBarGroup[] {
  const byBooking = new Map<string, CoachedWorkoutRecord[]>();
  for (const record of records) {
    if (!ownedBy(record, owner)) continue;
    const key = bookingKeyOf(record.bookingId);
    byBooking.set(key, [...(byBooking.get(key) ?? []), record]);
  }
  return [...byBooking.entries()].flatMap(([bookingKey, group]) => {
    const first = group[0];
    if (!first) return [];
    return [
      {
        bookingKey,
        label: coachingLabel(group.map((r) => coachedName(r.client))),
        dayName: first.doc.name,
        startedAt: group.reduce(
          (min, r) => (r.doc.startedAt < min ? r.doc.startedAt : min),
          first.doc.startedAt,
        ),
        clientId: first.client.id,
      },
    ];
  });
}

export function useCoachedMiniBarGroups(): CoachedMiniBarGroup[] {
  const records = useCoachedRecords();
  const owner = getGymOwner();
  return useMemo(() => coachedMiniBarGroups(records, owner), [records, owner]);
}

/** Opens the coached logger on that booking (or the client's workout without one). */
export function openCoachedLogger(group: CoachedMiniBarGroup): void {
  router.push({
    pathname: '/trainer/coach/[bookingId]',
    params: { bookingId: group.bookingKey, clientId: group.clientId },
  });
}
