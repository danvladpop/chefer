import { useEffect } from 'react';
import { onlineManager } from '@tanstack/react-query';
import type { CoachStartDto, TrainerBookingDto, TrainerDashboardSummaryDto } from '@chefer/types';
import { trpc } from '../../lib/trpc';
import { localDate } from '../gym/offline/ids';
import { KV_KEYS } from '../gym/offline/keys';
import { kv } from '../gym/offline/kv';
import { getGymOwner } from '../gym/offline/owner';
import { bookingKeyOf } from './coach-model';

// ─── Starting offline (trainer-mode.md §12: "the coached logger is fully offline") ──
// Starting a coached workout needs the client's prescription (`trainer.coach.start`).
// When trainer Today or a booking detail loads (online), today's bookings'
// prescriptions are fetched ahead and kept in device KV, so Start works in a
// basement gym with no signal. What still needs a connection: that first
// prefetch, and "Log a workout for Maria" without a booking that was never
// started on this phone before.

export interface CoachPrefetchRecord {
  v: 1;
  ownerId: string | null;
  /** The device-local day it was fetched for. */
  today: string;
  fetchedAt: string;
  /** The client's place in the booking (the switcher's order). */
  order: number;
  start: CoachStartDto;
}

const keyOf = (bookingId: string | null, clientId: string) =>
  `${KV_KEYS.coachPrefetch}.${bookingKeyOf(bookingId)}.${clientId}`;

function isPrefetch(value: unknown): value is CoachPrefetchRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { v, start, today } = value as Record<string, unknown>;
  return v === 1 && typeof today === 'string' && typeof start === 'object' && start !== null;
}

export function savePrefetchedStart(
  bookingId: string | null,
  clientId: string,
  start: CoachStartDto,
  opts: { today?: string; order?: number } = {},
): void {
  const record: CoachPrefetchRecord = {
    v: 1,
    ownerId: getGymOwner(),
    today: opts.today ?? localDate(),
    fetchedAt: new Date().toISOString(),
    order: opts.order ?? 0,
    start,
  };
  kv.setJSON(keyOf(bookingId, clientId), record);
}

/** The kept prescription for this booking + client (this trainer's), or null. */
export function readPrefetchedStart(
  bookingId: string | null,
  clientId: string,
): CoachPrefetchRecord | null {
  const value = kv.getJSON(keyOf(bookingId, clientId));
  if (!isPrefetch(value)) return null;
  const owner = getGymOwner();
  if (value.ownerId !== null && owner !== null && value.ownerId !== owner) return null;
  return value;
}

/** Every kept prescription for one booking (this trainer's), in the booking's client order. */
export function prefetchedForBooking(bookingId: string): CoachPrefetchRecord[] {
  const prefix = `${KV_KEYS.coachPrefetch}.${bookingKeyOf(bookingId)}.`;
  const owner = getGymOwner();
  const out: CoachPrefetchRecord[] = [];
  for (const key of kv.keys()) {
    if (!key.startsWith(prefix)) continue;
    const value = kv.getJSON(key);
    if (!isPrefetch(value)) continue;
    if (value.ownerId !== null && owner !== null && value.ownerId !== owner) continue;
    out.push(value);
  }
  return out.sort((a, b) => a.order - b.order);
}

/** Drops kept prescriptions from before `today` (they were for past bookings). */
export function pruneStalePrefetches(today: string = localDate()): void {
  for (const key of kv.keys()) {
    if (!key.startsWith(`${KV_KEYS.coachPrefetch}.`)) continue;
    const value = kv.getJSON(key);
    if (!isPrefetch(value) || value.today < today) kv.remove(key);
  }
}

/** The clients of a booking a coached workout can still start for (not cancelled, not yet logged). */
export function startableClients(booking: TrainerBookingDto): string[] {
  if (booking.kind !== 'BOOKING' || booking.cancelledAt !== null) return [];
  return booking.clients
    .filter((c) => c.attendance !== 'CANCELLED' && c.workoutSessionId === null)
    .map((c) => c.clientId);
}

export type FetchStart = (input: {
  clientId: string;
  bookingId: string;
  today: string;
}) => Promise<CoachStartDto>;

/**
 * Fetches and keeps the prescriptions for these bookings' startable clients (skips ones already
 * kept for today). Failures are ignored: Start simply asks the server then.
 */
export async function prefetchCoachStarts(
  bookings: readonly TrainerBookingDto[],
  fetchStart: FetchStart,
  today: string = localDate(),
): Promise<number> {
  pruneStalePrefetches(today);
  let fetched = 0;
  for (const booking of bookings) {
    const order = booking.clients.map((c) => c.clientId);
    for (const clientId of startableClients(booking)) {
      if (readPrefetchedStart(booking.id, clientId)?.today === today) continue;
      try {
        const start = await fetchStart({ clientId, bookingId: booking.id, today });
        savePrefetchedStart(booking.id, clientId, start, { today, order: order.indexOf(clientId) });
        fetched++;
      } catch {
        // Offline or the client left: Start asks again (and says so) when it is pressed.
      }
    }
  }
  return fetched;
}

/**
 * Call from trainer Today / booking detail with the bookings on screen: keeps today's
 * prescriptions on the phone so the coached logger can start offline.
 */
export function useCoachPrefetch(bookings: readonly TrainerBookingDto[] | null | undefined): void {
  const utils = trpc.useUtils();
  const today = localDate();
  const list = bookings ?? [];
  // Re-run only when the set of startable (booking, client) pairs changes.
  const key = list
    .map((b) => `${b.id}:${startableClients(b).join(',')}`)
    .sort()
    .join('|');
  useEffect(() => {
    if (key === '' || !onlineManager.isOnline()) return;
    void prefetchCoachStarts(
      list,
      (input) => utils.client.trainer.coach.start.mutate(input),
      today,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the startable pairs, not the array identity
  }, [key, today, utils]);
}

/** The bookings trainer Today shows (the next one and the rest of today). */
export function todaysBookingsOf(
  summary: TrainerDashboardSummaryDto | undefined,
): TrainerBookingDto[] {
  if (!summary) return [];
  const next = summary.nextBooking ? [summary.nextBooking] : [];
  return [...next, ...(summary.todayBookings ?? [])];
}
