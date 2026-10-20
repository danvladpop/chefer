import type { z } from 'zod';
import {
  bookingRepository,
  coachingContentRepository,
  workoutSessionRepository,
  type BookingWithClients,
  type IBookingRepository,
  type ICoachingContentRepository,
  type IWorkoutSessionRepository,
} from '@chefer/database';
import type {
  CoachStartDto,
  coachSyncInputSchema,
  CoachSyncResultDto,
  WorkoutSessionDoc,
} from '@chefer/types';
import { displayNameOf } from '@chefer/utils';
import { gymBootstrapService, type GymBootstrapService } from '../gym/gym-bootstrap.service.js';
import {
  workoutSessionService,
  type WorkoutSessionService,
} from '../gym/workout-session.service.js';
import { readWorkoutRef } from './booking-rules.js';
import { bookingNotFound } from './booking.service.js';
import type { CoachingAccess } from './coaching-access.service.js';
import { coachingNoticeService, type CoachingNoticeService } from './coaching-notice.service.js';

// ─── Trainer mode M3: coached workouts (docs/prd-2026-10/trainer-mode.md §6.7, §8.3) ──
//
//   start   the client's prescription — exactly what their own logger gets
//           (their routine, progressions, units, equipment, history) for the
//           booking's routine day, or their rotation's next day (NEXT_DAY, or a
//           day that is no longer in their active routine).
//   sync    the client's normal session sync (gym.session.upsertMany: progression,
//           rotation, carry-over, PRs) with `loggedById` = the caller from ctx —
//           never input — and every set a confirmed load. A finished workout in a
//           booking marks the client ATTENDED there; each newly finished workout
//           sends one "Ana logged a workout for you" notice.
//
// Both run behind requireCoachingAccess('write'): an ACTIVE client only. A
// trainer can never overwrite a workout the client (or another trainer) logged:
// the repository answers `foreign` (a per-doc `rejected: forbidden`).

export type CoachSyncInput = z.infer<typeof coachSyncInputSchema>;
type CoachDoc = CoachSyncInput['docs'][number];

export interface CoachedWorkoutDeps {
  bookings: Pick<IBookingRepository, 'find' | 'setAttendance'>;
  prescriptions: Pick<GymBootstrapService, 'prescription'>;
  sessions: Pick<WorkoutSessionService, 'upsertMany'>;
  sessionRows: Pick<IWorkoutSessionRepository, 'findByIdForUser'>;
  content: Pick<ICoachingContentRepository, 'userNames'>;
  notices: Pick<CoachingNoticeService, 'coachedWorkoutLogged'>;
  now: () => Date;
}

const defaultDeps: CoachedWorkoutDeps = {
  bookings: bookingRepository,
  prescriptions: gymBootstrapService,
  sessions: workoutSessionService,
  sessionRows: workoutSessionRepository,
  content: coachingContentRepository,
  notices: coachingNoticeService,
  now: () => new Date(),
};

/** The client's live place in one of the trainer's live bookings, or null. */
function liveBookingFor(
  booking: BookingWithClients | null,
  clientId: string,
): BookingWithClients | null {
  if (booking?.kind !== 'BOOKING' || booking.cancelledAt) return null;
  const place = booking.clients.find((c) => c.clientId === clientId);
  return place && place.attendance !== 'CANCELLED' ? booking : null;
}

export class CoachedWorkoutService {
  private readonly deps: CoachedWorkoutDeps;

  constructor(deps: Partial<CoachedWorkoutDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** `trainer.coach.start`. NOT_FOUND "This booking isn't available" for a booking that isn't theirs together. */
  async start(
    access: CoachingAccess,
    bookingId: string | null,
    today: string,
  ): Promise<CoachStartDto> {
    let dayId: string | null = null;
    if (bookingId) {
      const booking = liveBookingFor(
        await this.deps.bookings.find(access.trainerId, bookingId),
        access.clientId,
      );
      if (!booking) throw bookingNotFound();
      const place = booking.clients.find((c) => c.clientId === access.clientId);
      dayId = readWorkoutRef(place?.workoutRef)?.routineDayId ?? null;
    }
    const [p, names] = await Promise.all([
      this.deps.prescriptions.prescription(access.clientId, today, dayId),
      this.deps.content.userNames([access.clientId]),
    ]);
    const row = names.get(access.clientId);
    return {
      client: { id: access.clientId, name: row ? displayNameOf(row) : '', unit: p.unit },
      workout: p.workout,
      exercises: p.exercises,
      bookingId,
    };
  }

  /** `trainer.coach.sync`: `loggedById` is `ctx.user.id`, passed by the router. */
  async sync(
    access: CoachingAccess,
    loggedById: string,
    docs: readonly CoachDoc[],
  ): Promise<CoachSyncResultDto> {
    const now = this.deps.now();
    const { clientId, trainerId } = access;

    // Booking links are checked, never trusted: an unknown, cancelled or other
    // trainer's booking is dropped (the workout itself still saves).
    const bookingIds = new Map<string, string | null>();
    const cache = new Map<string, BookingWithClients | null>();
    for (const doc of docs) {
      if (!doc.bookingId) continue;
      if (!cache.has(doc.bookingId)) {
        cache.set(
          doc.bookingId,
          liveBookingFor(await this.deps.bookings.find(trainerId, doc.bookingId), clientId),
        );
      }
      bookingIds.set(doc.id, cache.get(doc.bookingId) ? doc.bookingId : null);
    }

    // "Newly finished" = not COMPLETED on the server before this sync (re-sends notify nobody).
    const finishedBefore = new Set<string>();
    for (const doc of docs) {
      if (doc.status !== 'COMPLETED') continue;
      const existing = await this.deps.sessionRows.findByIdForUser(clientId, doc.id);
      if (existing?.status === 'COMPLETED') finishedBefore.add(doc.id);
    }

    const plain: WorkoutSessionDoc[] = docs.map(({ bookingId: _bookingId, ...doc }) => doc);
    const result = await this.deps.sessions.upsertMany(clientId, plain, {
      loggedById,
      bookingIds,
    });

    for (const [i, r] of result.results.entries()) {
      const doc = docs[i];
      if (r.status !== 'applied' || doc?.status !== 'COMPLETED') continue;
      const bookingId = bookingIds.get(doc.id);
      if (bookingId) {
        await this.deps.bookings.setAttendance({
          bookingId,
          clientId,
          attendance: 'ATTENDED',
          at: now,
          workoutSessionId: doc.id,
        });
      }
      if (!finishedBefore.has(doc.id)) {
        await this.deps.notices.coachedWorkoutLogged(clientId, trainerId, doc.id);
      }
    }
    return result;
  }
}

export const coachedWorkoutService = new CoachedWorkoutService();
