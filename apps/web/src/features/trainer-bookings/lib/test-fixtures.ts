import type { TrainerBookingClientDto, TrainerBookingDto } from '@chefer/types';
import { zonedToUtc } from '@chefer/utils';

export const TZ = 'Europe/Bucharest';

export function client(over: Partial<TrainerBookingClientDto> = {}): TrainerBookingClientDto {
  return {
    clientId: 'c1',
    name: 'Maria Pop',
    attendance: 'SCHEDULED',
    workout: { kind: 'ROUTINE_DAY', routineDayId: 'd1', name: 'Lower body A' },
    workoutSessionId: null,
    ...over,
  };
}

/** A booking at a wall-clock time in Bucharest. */
export function booking(
  over: Partial<TrainerBookingDto> & { date?: string; time?: string } = {},
): TrainerBookingDto {
  const { date = '2026-10-20', time = '18:00', ...rest } = over;
  const durationMin = rest.durationMin ?? 60;
  const startsAt = zonedToUtc(date, time, TZ).toISOString();
  return {
    id: 'b1',
    kind: 'BOOKING',
    seriesId: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString(),
    durationMin,
    timeZone: TZ,
    location: 'Gym Fit Center',
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: [client()],
    ...rest,
  };
}
