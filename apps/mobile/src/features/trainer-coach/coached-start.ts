import type { CoachStartDto, TrainerBookingDto } from '@chefer/types';
import { isNetworkError } from '@chefer/utils';
import { isClientUnavailable } from '../trainer/client/use-trainer-client';
import { coachedName } from './coach-model';
import {
  prefetchedForBooking,
  readPrefetchedStart,
  savePrefetchedStart,
  startableClients,
} from './coach-prefetch';
import { coachedOutboxes } from './coached-outbox';
import { coachedSessionStore } from './coached-session-store';
import { startCoachedWorkout } from './coached-workouts';

// What pressing Start does (trainer-mode.md §6.7): one in-progress coached
// workout per client of the booking (or the one client, without a booking),
// each from that client's own prescription. Online it asks the server
// (`trainer.coach.start`, kept for offline next time); offline it uses the
// prescription kept when Today / the booking was loaded.

export type FetchCoachStart = (input: {
  clientId: string;
  bookingId?: string;
  today: string;
}) => Promise<CoachStartDto>;

export interface CoachStartInput {
  bookingId: string | null;
  /** "Log a workout for Maria" (no booking): the client. */
  clientId: string | null;
  /** The booking as last read (null offline before it ever loaded). */
  booking: TrainerBookingDto | null;
  online: boolean;
  today: string;
  fetchStart: FetchCoachStart;
}

export interface CoachStartOutcome {
  /** Clients with a coached workout in progress for this booking (started now or before). */
  started: string[];
  /** Clients with no routine: the screen says so and links to their routine editor. */
  noRoutine: { clientId: string; name: string }[];
  /** No kept prescription and no connection. */
  needsConnection: string[];
  /** Not this trainer's active client any more. */
  unavailable: string[];
}

/** The clients Start is for, in booking order: `[clientId, order]`. */
function targetsOf(input: CoachStartInput): [string, number][] {
  const { bookingId, booking } = input;
  if (bookingId === null) return input.clientId ? [[input.clientId, 0]] : [];
  const ids = booking
    ? startableClients(booking)
    : prefetchedForBooking(bookingId).map((p) => p.start.client.id);
  const order = booking ? booking.clients.map((c) => c.clientId) : ids;
  return ids
    .filter((id) => !coachedOutboxes.hasQueued(id, bookingId))
    .map((id) => [id, Math.max(0, order.indexOf(id))]);
}

export async function startCoaching(input: CoachStartInput): Promise<CoachStartOutcome> {
  const { bookingId } = input;
  const outcome: CoachStartOutcome = {
    started: [],
    noRoutine: [],
    needsConnection: [],
    unavailable: [],
  };
  const targets = targetsOf(input);
  const group = targets.length > 1;

  for (const [clientId, order] of targets) {
    if (coachedSessionStore.find(bookingId, clientId)) {
      outcome.started.push(clientId);
      continue;
    }
    let start: CoachStartDto | null = null;
    if (input.online) {
      try {
        start = await input.fetchStart({
          clientId,
          ...(bookingId !== null && { bookingId }),
          today: input.today,
        });
        savePrefetchedStart(bookingId, clientId, start, { today: input.today, order });
      } catch (error) {
        if (isClientUnavailable(error) && !isNetworkError(error)) {
          outcome.unavailable.push(clientId);
          continue;
        }
        start = null;
      }
    }
    start ??= readPrefetchedStart(bookingId, clientId)?.start ?? null;
    if (!start) {
      outcome.needsConnection.push(clientId);
      continue;
    }
    if (!start.workout) {
      outcome.noRoutine.push({ clientId, name: coachedName(start.client) });
      continue;
    }
    if (startCoachedWorkout(start, bookingId, { order, group })) outcome.started.push(clientId);
  }
  return outcome;
}
