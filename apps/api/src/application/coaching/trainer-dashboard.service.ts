import { coachingContentRepository, type ICoachingContentRepository } from '@chefer/database';
import type { TrainerBadgesDto, TrainerDashboardSummaryDto } from '@chefer/types';
import { addDaysLocal, summarizeTrainerDashboard, trainerBadges, weekStartOf } from '@chefer/utils';
import {
  bookingsThisWeek,
  sessionsDelivered,
  UNMARKED_LOOKBACK_DAYS,
  unmarkedAttendance,
  upcomingToday,
} from './booking-rules.js';
import { bookingService, type BookingService } from './booking.service.js';
import { coachingLinkService, type CoachingLinkService } from './coaching-link.service.js';
import { coachingRequestService, type CoachingRequestService } from './coaching-request.service.js';

// ─── Trainer mode: badges and Today (docs/prd-2026-10/trainer-mode.md §6.1, §7.1) ──
//
//   badges    one count source for every trainer badge, polled every 60 s:
//             pending requests (blocks hidden, exactly the Clients list's
//             count); past bookings still needing attendance (the same list
//             Today shows); booking changes (unread booking notices on the
//             trainer's side: none are created for trainers yet → 0).
//   summary   trainer Today's numbers, built from the same client list the
//             Clients tab shows and the same bookings the Schedule shows, so
//             "all numbers match the underlying lists".
//
// Both run behind trainerProcedure: an active trainer only. Neither names a
// client the trainer is not actively coaching (bookings show current clients only).

const DAY_MS = 24 * 60 * 60 * 1000;
/** The next booking is looked for this far ahead. */
const NEXT_BOOKING_LOOKAHEAD_DAYS = 31;

export interface TrainerDashboardDeps {
  links: Pick<CoachingLinkService, 'listClients'>;
  requests: Pick<CoachingRequestService, 'listForTrainer'>;
  content: Pick<ICoachingContentRepository, 'countSessions'>;
  bookings: Pick<BookingService, 'listVisible'>;
  now: () => Date;
}

const defaultDeps: TrainerDashboardDeps = {
  links: coachingLinkService,
  requests: coachingRequestService,
  content: coachingContentRepository,
  bookings: bookingService,
  now: () => new Date(),
};

/** The UTC instant of a local date's midnight, widened by a day either side for any zone. */
function utcDay(localDate: string, shiftDays: number): Date {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + shiftDays * DAY_MS);
}

export class TrainerDashboardService {
  private readonly deps: TrainerDashboardDeps;

  constructor(deps: Partial<TrainerDashboardDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async badges(trainerId: string): Promise<TrainerBadgesDto> {
    const now = this.deps.now();
    const [requests, recent] = await Promise.all([
      this.deps.requests.listForTrainer(trainerId),
      this.deps.bookings.listVisible(
        trainerId,
        new Date(now.getTime() - (UNMARKED_LOOKBACK_DAYS + 1) * DAY_MS),
        now,
      ),
    ]);
    return trainerBadges({
      requests: requests.length,
      unmarkedAttendance: unmarkedAttendance(recent, now).length,
      bookingChanges: 0,
    });
  }

  async summary(trainerId: string, today: string): Promise<TrainerDashboardSummaryDto> {
    const now = this.deps.now();
    // One scan covers this week, this month, the attendance look-back and the next booking.
    const weekStart = weekStartOf(today);
    const monthStart = `${today.slice(0, 7)}-01`;
    const earliest = [weekStart, monthStart].sort()[0] ?? weekStart;
    const from = new Date(
      Math.min(
        utcDay(earliest, -1).getTime(),
        now.getTime() - (UNMARKED_LOOKBACK_DAYS + 1) * DAY_MS,
      ),
    );
    const to = new Date(
      Math.max(
        utcDay(addDaysLocal(weekStart, 7), 1).getTime(),
        now.getTime() + NEXT_BOOKING_LOOKAHEAD_DAYS * DAY_MS,
      ),
    );
    const [clients, requests, bookings] = await Promise.all([
      this.deps.links.listClients(trainerId, today),
      this.deps.requests.listForTrainer(trainerId),
      this.deps.bookings.listVisible(trainerId, from, to),
    ]);
    const sessionsLast7 =
      clients.length === 0
        ? new Map<string, number>()
        : await this.deps.content.countSessions(
            clients.map((c) => c.clientId),
            addDaysLocal(today, -6),
            today,
          );
    const { next, rest } = upcomingToday(bookings, today, now);
    return {
      ...summarizeTrainerDashboard({
        clients,
        sessionsLast7,
        requestsWaiting: requests.length,
      }),
      bookingsThisWeek: bookingsThisWeek(bookings, today, now),
      nextBooking: next,
      todayBookings: rest,
      unmarkedAttendance: unmarkedAttendance(bookings, now),
      sessionsDelivered: sessionsDelivered(bookings, today),
    };
  }
}

export const trainerDashboardService = new TrainerDashboardService();
