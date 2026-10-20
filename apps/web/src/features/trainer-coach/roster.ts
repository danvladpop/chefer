import { sessionProgress } from '@/features/gym/workout/workout-model';
import type { TrainerBookingDto } from '@chefer/types';
import type { CoachState } from './coach-state';

// Who is in this coached workout, and which chip opens first. Pure.

export type SwitcherStatus = 'new' | 'active' | 'saved';

export interface RosterClient {
  clientId: string;
  name: string;
  /** The booking already has a coached workout for them (logged earlier, elsewhere). */
  alreadyLogged: boolean;
}

/**
 * The booking's clients (cancelled ones left out); with no booking data (a
 * reload offline) the clients whose workouts are saved here; for "Log a
 * workout for Maria" just Maria.
 */
export function coachRoster(input: {
  booking: Pick<TrainerBookingDto, 'clients'> | undefined;
  state: CoachState | null;
  clientId: string | null;
}): RosterClient[] {
  const { booking, state, clientId } = input;
  if (booking) {
    return booking.clients
      .filter((c) => c.attendance !== 'CANCELLED')
      .map((c) => ({
        clientId: c.clientId,
        name: c.name,
        alreadyLogged: c.workoutSessionId !== null && !state?.workouts[c.clientId],
      }));
  }
  const saved = Object.values(state?.workouts ?? {}).map((w) => ({
    clientId: w.clientId,
    name: w.name,
    alreadyLogged: false,
  }));
  if (clientId && !saved.some((c) => c.clientId === clientId)) {
    return [{ clientId, name: '', alreadyLogged: false }, ...saved];
  }
  return saved;
}

/** The chip to show: the saved choice, else the one asked for, else the first still to log. */
export function pickActiveClient(
  roster: readonly RosterClient[],
  state: CoachState,
  preferred: string | null,
): string | null {
  const inRoster = (id: string | null) => id !== null && roster.some((c) => c.clientId === id);
  if (inRoster(state.activeClientId)) return state.activeClientId;
  if (inRoster(preferred)) return preferred;
  return (roster.find((c) => !c.alreadyLogged) ?? roster[0])?.clientId ?? null;
}

/** Booking clients with no workout here yet (and none logged before). */
export function unstartedClients(roster: readonly RosterClient[], state: CoachState): string[] {
  return roster
    .filter((c) => !c.alreadyLogged && !state.workouts[c.clientId])
    .map((c) => c.clientId);
}

export function chipStatus(
  client: RosterClient,
  state: CoachState,
): { status: SwitcherStatus; progress: string | null } {
  const w = state.workouts[client.clientId];
  if (w && (w.phase === 'finished' || w.phase === 'synced'))
    return { status: 'saved', progress: null };
  if (!w && client.alreadyLogged) return { status: 'saved', progress: null };
  if (w?.doc) {
    const { done, planned } = sessionProgress(w.doc);
    return { status: 'active', progress: `${done}/${planned}` };
  }
  return { status: 'new', progress: null };
}
