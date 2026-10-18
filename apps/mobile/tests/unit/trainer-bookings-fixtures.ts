import type { ClientBookingDto, TrainerBookingClientDto, TrainerBookingDto } from '@chefer/types';
import { ION, MARIA } from './trainer-fixtures';

// Trainer mode M3 booking fixtures (docs/prd-2026-10/trainer-mode.md §6.2–§6.9). Times are explicit
// instants; tests that lay blocks out pass an explicit zone (Europe/Bucharest) so they never depend on
// the machine's zone.

export const ZONE = 'Europe/Bucharest';

export function bookingClient(
  overrides: Partial<TrainerBookingClientDto> = {},
): TrainerBookingClientDto {
  return {
    clientId: MARIA,
    name: 'Maria Pop',
    attendance: 'SCHEDULED',
    workout: { kind: 'ROUTINE_DAY', routineDayId: 'day-a', name: 'Lower body A' },
    workoutSessionId: null,
    ...overrides,
  };
}

export const ION_CLIENT = bookingClient({
  clientId: ION,
  name: 'Ion Rus',
  workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
});

/** A one-hour booking with Maria; `startsAt` defaults to Tue 20 Oct 2026 18:00 in Bucharest (15:00Z). */
export function trainerBooking(overrides: Partial<TrainerBookingDto> = {}): TrainerBookingDto {
  const startsAt = overrides.startsAt ?? '2026-10-20T15:00:00.000Z';
  const durationMin = overrides.durationMin ?? 60;
  return {
    id: 'b1',
    kind: 'BOOKING',
    seriesId: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString(),
    durationMin,
    timeZone: ZONE,
    location: 'Gym Fit Center',
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: [bookingClient()],
    ...overrides,
  };
}

const FIVE_MIN_MS = 5 * 60_000;

/**
 * A booking starting about `minutes` from now (negative = already started), on
 * the 5-minute grid every real booking sits on (`localTimeSchema`).
 */
export function bookingIn(minutes: number, overrides: Partial<TrainerBookingDto> = {}) {
  const at = Math.floor((Date.now() + minutes * 60_000) / FIVE_MIN_MS) * FIVE_MIN_MS;
  return trainerBooking({
    startsAt: new Date(at).toISOString(),
    ...overrides,
  });
}

export function clientBooking(overrides: Partial<ClientBookingDto> = {}): ClientBookingDto {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 2 * 24 * 3_600_000).toISOString();
  return {
    id: 'cb1',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    durationMin: 60,
    timeZone: ZONE,
    trainer: { name: 'Ana' },
    location: 'Gym Fit Center',
    note: 'Bring your belt',
    workoutName: 'Lower body A',
    otherClients: 0,
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  };
}
