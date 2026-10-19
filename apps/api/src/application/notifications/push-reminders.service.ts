import {
  bookingRepository,
  socialProfileRepository,
  trainerProfileRepository,
  type BookingWithClients,
  type IBookingRepository,
  type ISocialProfileRepository,
  type ITrainerProfileRepository,
} from '@chefer/database';
import { BOOKING_COPY, FALLBACK_TRAINER_NAME, PUSH_COPY } from '@chefer/types';
import { bookingTime, firstNameOf, type NameParts } from '@chefer/utils';
import { pushService, type PushEnqueueOutcome, type PushService } from './push.service.js';

// ─── Remote booking reminders (trainer-mode.md §7.2 "Reminders move from local to remote in M4") ──
// Run every minute by push-delivery.worker: every not-cancelled BOOKING
// starting in [now + 55, now + 65) minutes gets
//   - BOOKING_REMINDER_CLIENT for each client whose place is still SCHEDULED
//     ("Session with Ana in 1 hour"), and
//   - BOOKING_REMINDER_TRAINER for the trainer while anyone is still booked
//     ("18:00 Maria · Lower body A", the time in the booking's own zone).
// The window is 10 minutes wide so a missed tick still reminds; the dedupe
// key (booking id + start instant + recipient) makes every later tick a no-op,
// and a booking moved to a new time gets a fresh reminder. The switches are
// `coaching.reminders` / `trainer.reminders` (PushService.enqueue).
// The app stops scheduling its local reminders once it has a push token, so
// nothing fires twice.

const MINUTE_MS = 60_000;
export const REMINDER_WINDOW_MIN = { from: 55, to: 65 } as const;

export interface PushRemindersDeps {
  bookings: Pick<IBookingRepository, 'listStartingBetween' | 'routineDayNames'>;
  users: Pick<ISocialProfileRepository, 'findUsers'>;
  trainers: Pick<ITrainerProfileRepository, 'findMany'>;
  push: Pick<PushService, 'enqueue'>;
}

const defaultDeps: PushRemindersDeps = {
  bookings: bookingRepository,
  users: socialProfileRepository,
  trainers: trainerProfileRepository,
  push: pushService,
};

export interface ReminderSweepResult {
  bookings: number;
  queued: number;
}

function routineDayIdOf(workoutRef: unknown): string | null {
  const ref = workoutRef as { kind?: unknown; routineDayId?: unknown } | null;
  return ref?.kind === 'ROUTINE_DAY' && typeof ref.routineDayId === 'string'
    ? ref.routineDayId
    : null;
}

export class PushRemindersService {
  private readonly deps: PushRemindersDeps;

  constructor(deps: Partial<PushRemindersDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async enqueueDue(now: Date): Promise<ReminderSweepResult> {
    const from = new Date(now.getTime() + REMINDER_WINDOW_MIN.from * MINUTE_MS);
    const to = new Date(now.getTime() + REMINDER_WINDOW_MIN.to * MINUTE_MS);
    const bookings = (await this.deps.bookings.listStartingBetween(from, to))
      .map((b) => ({ ...b, clients: b.clients.filter((c) => c.attendance === 'SCHEDULED') }))
      .filter((b) => b.clients.length > 0);
    if (bookings.length === 0) return { bookings: 0, queued: 0 };

    const clientIds = [...new Set(bookings.flatMap((b) => b.clients.map((c) => c.clientId)))];
    const trainerIds = [...new Set(bookings.map((b) => b.trainerId))];
    const dayIds = bookings.flatMap((b) =>
      b.clients.flatMap((c) => routineDayIdOf(c.workoutRef) ?? []),
    );
    const [users, trainers, dayNames] = await Promise.all([
      this.deps.users.findUsers(clientIds),
      this.deps.trainers.findMany(trainerIds),
      this.deps.bookings.routineDayNames(dayIds),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const trainerName = new Map(trainers.map((t) => [t.userId, t.displayName]));

    let queued = 0;
    const count = (outcome: PushEnqueueOutcome) => {
      if (outcome === 'queued') queued += 1;
    };
    for (const booking of bookings) {
      const eventKey = `${booking.id}:${booking.startsAt.getTime()}`;
      const trainer = trainerName.get(booking.trainerId) ?? FALLBACK_TRAINER_NAME;
      for (const place of booking.clients) {
        count(
          await this.deps.push.enqueue({
            userId: place.clientId,
            kind: 'BOOKING_REMINDER_CLIENT',
            actorId: null,
            eventKey,
            payload: { ...PUSH_COPY.clientReminder(trainer), data: { bookingId: booking.id } },
          }),
        );
      }
      count(
        await this.deps.push.enqueue({
          userId: booking.trainerId,
          kind: 'BOOKING_REMINDER_TRAINER',
          actorId: null,
          eventKey,
          payload: {
            ...PUSH_COPY.trainerReminder(
              bookingTime(booking.startsAt.toISOString(), booking.timeZone),
              this.who(booking, userById),
              this.what(booking, dayNames),
            ),
            data: { bookingId: booking.id },
          },
        }),
      );
    }
    return { bookings: bookings.length, queued };
  }

  /** "Maria", "Maria + 1" (the first client's first name, like the schedule). */
  private who(booking: BookingWithClients, users: Map<string, NameParts>): string {
    const [first] = booking.clients;
    const user = first ? users.get(first.clientId) : undefined;
    const name = user ? firstNameOf(user) : firstNameOf({});
    return BOOKING_COPY.schedule.groupName(name, booking.clients.length - 1);
  }

  /** The workout day name(s) set for the slot ("Lower body A"), or null (next routine day). */
  private what(booking: BookingWithClients, dayNames: Map<string, string>): string | null {
    const names = [
      ...new Set(
        booking.clients.flatMap((c) => {
          const id = routineDayIdOf(c.workoutRef);
          const name = id ? dayNames.get(id) : undefined;
          return name ? [name] : [];
        }),
      ),
    ];
    return names.length > 0 ? names.join(' · ') : null;
  }
}

export const pushRemindersService = new PushRemindersService();
