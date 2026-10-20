import { describe, expect, it, vi } from 'vitest';
import type { BookingClient, BookingWithClients } from '@chefer/database';
import type { UpsertSessionsResultDto } from '@chefer/types';
import { sessionDoc } from '../gym/__test__/fixtures.js';
import { CoachedWorkoutService } from './coached-workout.service.js';
import type { CoachingAccess } from './coaching-access.service.js';

// trainer.coach.start / trainer.coach.sync (trainer-mode.md §6.7, §8.3): the
// client's prescription for the booking's day; the client's own session sync
// with `loggedById` = the caller; a finished workout marks the client ATTENDED
// and notifies once; booking links are verified, never trusted.

// The default singletons reach lib/env.js; the unit-test job has no env.
vi.mock('../gym/gym-bootstrap.service.js', () => ({ gymBootstrapService: {} }));
vi.mock('../gym/workout-session.service.js', () => ({ workoutSessionService: {} }));
vi.mock('./booking.service.js', async () => {
  const { TRPCError } = await import('@trpc/server');
  return {
    bookingNotFound: () =>
      new TRPCError({ code: 'NOT_FOUND', message: 'This booking isn’t available.' }),
  };
});
vi.mock('./coaching-notice.service.js', () => ({ coachingNoticeService: {} }));

const TRAINER = 'ctrainer0000000000000001';
const MARIA = 'cmaria000000000000000001';
const ION = 'cion00000000000000000001';
const NOW = new Date('2026-10-20T16:00:00Z');
const access: CoachingAccess = {
  trainerId: TRAINER,
  clientId: MARIA,
  scope: 'write',
  link: null,
};

function place(clientId: string, over: Partial<BookingClient> = {}): BookingClient {
  return {
    bookingId: 'b1',
    clientId,
    workoutRef: null,
    attendance: 'SCHEDULED',
    attendanceAt: null,
    workoutSessionId: null,
    ...over,
  };
}

function booking(over: Partial<BookingWithClients> = {}): BookingWithClients {
  return {
    id: 'b1',
    trainerId: TRAINER,
    seriesId: null,
    kind: 'BOOKING',
    startsAt: NOW,
    durationMin: 60,
    timeZone: 'Europe/Bucharest',
    location: null,
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    clients: [place(MARIA, { workoutRef: { kind: 'ROUTINE_DAY', routineDayId: 'day-b' } })],
    ...over,
  };
}

function setup(rows: BookingWithClients[] = [booking()], completedBefore: string[] = []) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const deps = {
    bookings: {
      find: vi.fn(async (_t: string, id: string) => byId.get(id) ?? null),
      setAttendance: vi.fn(async () => true),
    },
    prescriptions: {
      prescription: vi.fn(async () => ({ workout: null, exercises: [], unit: 'LB' as const })),
    },
    sessions: {
      upsertMany: vi.fn(
        async (_u: string, docs: { id: string }[]): Promise<UpsertSessionsResultDto> => ({
          results: docs.map((d) => ({ id: d.id, status: 'applied' as const })),
        }),
      ),
    },
    sessionRows: {
      findByIdForUser: vi.fn(async (_u: string, id: string) =>
        completedBefore.includes(id) ? ({ status: 'COMPLETED' } as never) : null,
      ),
    },
    content: {
      userNames: vi.fn(
        async () =>
          new Map([[MARIA, { id: MARIA, firstName: 'Maria', lastName: 'Pop', name: null }]]),
      ),
    },
    notices: { coachedWorkoutLogged: vi.fn(async () => undefined) },
    now: () => NOW,
  };
  return { service: new CoachedWorkoutService(deps), deps };
}

describe('coach.start', () => {
  it('a booking with a ROUTINE_DAY builds the client’s prescription for that day, in their units', async () => {
    const { service, deps } = setup();
    const dto = await service.start(access, 'b1', '2026-10-20');
    expect(deps.prescriptions.prescription).toHaveBeenCalledWith(MARIA, '2026-10-20', 'day-b');
    expect(dto).toEqual({
      client: { id: MARIA, name: 'Maria Pop', unit: 'LB' },
      workout: null,
      exercises: [],
      bookingId: 'b1',
    });
  });

  it('no booking (or NEXT_DAY) asks for the rotation’s next day', async () => {
    const { service, deps } = setup([booking({ clients: [place(MARIA)] })]);
    await service.start(access, null, '2026-10-20');
    await service.start(access, 'b1', '2026-10-20');
    expect(deps.prescriptions.prescription).toHaveBeenNthCalledWith(1, MARIA, '2026-10-20', null);
    expect(deps.prescriptions.prescription).toHaveBeenNthCalledWith(2, MARIA, '2026-10-20', null);
  });

  it('a cancelled booking, one without the client, or another trainer’s is NOT_FOUND', async () => {
    const { service } = setup([
      booking({ id: 'cancelled', cancelledAt: NOW }),
      booking({ id: 'other', clients: [place(ION)] }),
    ]);
    for (const id of ['cancelled', 'other', 'unknown']) {
      await expect(service.start(access, id, '2026-10-20')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
  });
});

describe('coach.sync', () => {
  it('runs the client’s own sync stamped with the caller; the booking link travels as an option, not in the doc', async () => {
    const { service, deps } = setup();
    const doc = sessionDoc({ status: 'COMPLETED' });
    await service.sync(access, TRAINER, [{ ...doc, bookingId: 'b1' }]);
    const [userId, docs, opts] = deps.sessions.upsertMany.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>[],
      { loggedById: string; bookingIds: Map<string, string | null> },
    ];
    expect(userId).toBe(MARIA);
    expect(docs[0]).not.toHaveProperty('bookingId');
    expect(opts.loggedById).toBe(TRAINER);
    expect(opts.bookingIds.get(doc.id)).toBe('b1');
  });

  it('a finished workout marks the client ATTENDED on the booking with the session, and notifies once', async () => {
    const { service, deps } = setup();
    const doc = sessionDoc({ status: 'COMPLETED' });
    await service.sync(access, TRAINER, [{ ...doc, bookingId: 'b1' }]);
    expect(deps.bookings.setAttendance).toHaveBeenCalledWith({
      bookingId: 'b1',
      clientId: MARIA,
      attendance: 'ATTENDED',
      at: NOW,
      workoutSessionId: doc.id,
    });
    expect(deps.notices.coachedWorkoutLogged).toHaveBeenCalledWith(MARIA, TRAINER, doc.id);
  });

  it('a re-send of an already finished workout notifies nobody again', async () => {
    const doc = sessionDoc({ status: 'COMPLETED' });
    const { service, deps } = setup([booking()], [doc.id]);
    await service.sync(access, TRAINER, [{ ...doc, bookingId: 'b1' }]);
    expect(deps.notices.coachedWorkoutLogged).not.toHaveBeenCalled();
    // Attendance is idempotent and re-applied.
    expect(deps.bookings.setAttendance).toHaveBeenCalledTimes(1);
  });

  it('an in-progress workout neither marks attendance nor notifies', async () => {
    const { service, deps } = setup();
    await service.sync(access, TRAINER, [
      { ...sessionDoc({ status: 'IN_PROGRESS', finishedAt: null }), bookingId: 'b1' },
    ]);
    expect(deps.bookings.setAttendance).not.toHaveBeenCalled();
    expect(deps.notices.coachedWorkoutLogged).not.toHaveBeenCalled();
  });

  it('a booking that is not theirs together is dropped: the workout saves without it', async () => {
    const { service, deps } = setup([booking({ id: 'ions', clients: [place(ION)] })]);
    const doc = sessionDoc({ status: 'COMPLETED' });
    await service.sync(access, TRAINER, [{ ...doc, bookingId: 'ions' }]);
    const opts = (deps.sessions.upsertMany.mock.calls[0] as unknown[] | undefined)?.[2] as {
      bookingIds: Map<string, string | null>;
    };
    expect(opts.bookingIds.get(doc.id)).toBeNull();
    expect(deps.bookings.setAttendance).not.toHaveBeenCalled();
    expect(deps.notices.coachedWorkoutLogged).toHaveBeenCalledTimes(1);
  });

  it('a rejected doc (e.g. the client’s own workout) changes nothing else', async () => {
    const { service, deps } = setup();
    deps.sessions.upsertMany.mockResolvedValueOnce({
      results: [{ id: 'x', status: 'rejected', reason: 'forbidden' }],
    });
    await service.sync(access, TRAINER, [
      { ...sessionDoc({ status: 'COMPLETED' }), bookingId: 'b1' },
    ]);
    expect(deps.bookings.setAttendance).not.toHaveBeenCalled();
    expect(deps.notices.coachedWorkoutLogged).not.toHaveBeenCalled();
  });
});
