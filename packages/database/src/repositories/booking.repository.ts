import {
  Prisma,
  type Booking,
  type BookingAttendance,
  type BookingClient,
  type BookingKind,
} from '@prisma/client';
import { prisma } from '../client';

// ─── Trainer mode: bookings and blocked time (docs/prd-2026-10/trainer-mode.md §8.2) ──
// A Booking is one slot in a trainer's calendar: a UTC instant plus the IANA
// zone it was made in. Weekly repeats are MATERIALISED rows sharing a
// BookingSeries. Cancelling never deletes (history stays greyed); only the
// coaching-maintenance worker deletes, 24 months after the coaching ended.
// Edits are guarded by `version` (optimistic, like routines and templates).
//
// Every write to several rows (a series, a "this and following" split, a
// cancel) is ONE transaction, built by the service as a `BookingEditPlan`.

export type BookingWithClients = Booking & { clients: BookingClient[] };

/** The longest booking (`bookingDurationSchema`): range scans widen their lower bound by it. */
export const MAX_BOOKING_DURATION_MIN = 240;
const MINUTE_MS = 60_000;

export interface BookingTimeData {
  startsAt: Date;
  durationMin: number;
  timeZone: string;
}

export interface BookingWriteData extends BookingTimeData {
  location: string | null;
  note: string | null;
}

export interface BookingClientWriteData {
  clientId: string;
  /** `{ kind: 'ROUTINE_DAY', routineDayId }`; null = NEXT_DAY. */
  workoutRef: Prisma.InputJsonValue | null;
}

export interface SeriesWriteData {
  weekday: number;
  startLocalTime: string;
  durationMin: number;
  timeZone: string;
  startsOn: string;
  endsOn: string;
}

export interface CreateBookingsData {
  trainerId: string;
  kind: BookingKind;
  /** Null for a one-off booking. */
  series: SeriesWriteData | null;
  occurrences: BookingWriteData[];
  clients: BookingClientWriteData[];
}

/** One row's change inside a plan. Omitted fields are unchanged. */
export interface BookingRowEdit {
  id: string;
  data?: Partial<BookingWriteData>;
  /** Move the row into the plan's `createSeries`. */
  toNewSeries?: boolean;
  /** Replace the client list: kept clients keep their attendance; removed rows are deleted. */
  clients?: BookingClientWriteData[];
  /** Cancel the booking: cancelledAt/reason set, every SCHEDULED client → CANCELLED. */
  cancel?: { at: Date; reason: string | null };
}

export interface BookingEditPlan {
  trainerId: string;
  /** The booking the trainer opened, at the version they read. A mismatch aborts the plan. */
  guard: { bookingId: string; version: number };
  rows: BookingRowEdit[];
  /** End an existing series at `endsOn` (a "this and following" split). */
  endSeries?: { id: string; endsOn: string };
  /** Rewrite an existing series in place (an edit from its first occurrence). */
  updateSeries?: { id: string; data: Partial<SeriesWriteData> };
  /** A new series for the rows flagged `toNewSeries`. */
  createSeries?: SeriesWriteData;
}

export type BookingEditResult = { status: 'ok' } | { status: 'conflict' } | { status: 'not_found' };

/** Who lost their place in which booking when coaching ended (for counts only). */
export interface CancelledForClientsResult {
  /** Client rows set to CANCELLED. */
  clientRows: number;
  /** Bookings cancelled entirely (no client left). */
  bookings: number;
}

/** `listForExport`: the person's bookings on each side. */
export interface BookingsForExport {
  asClient: BookingWithClients[];
  asTrainer: BookingWithClients[];
}

export interface IBookingRepository {
  /** One booking of this trainer (another trainer's is null). */
  find(trainerId: string, id: string): Promise<BookingWithClients | null>;
  /** One booking the client has a place in (any trainer), or null. */
  findForClient(clientId: string, id: string): Promise<BookingWithClients | null>;
  /** The trainer's bookings and blocks overlapping [from, to), cancelled included, by start. */
  listOverlapping(trainerId: string, from: Date, to: Date): Promise<BookingWithClients[]>;
  /** The trainer's bookings with this client starting in [from, to), by start. */
  listForPair(
    trainerId: string,
    clientId: string,
    from: Date,
    to: Date,
  ): Promise<BookingWithClients[]>;
  /** A series' rows, by start. */
  listSeries(seriesId: string): Promise<BookingWithClients[]>;
  /** The series row. */
  findSeries(seriesId: string): Promise<{ id: string; endsOn: string; startsOn: string } | null>;
  /** The soonest not-cancelled BOOKING still running or ahead, per client (missing = none). */
  nextStartsByClient(
    trainerId: string,
    clientIds: readonly string[],
    now: Date,
  ): Promise<Map<string, Date>>;
  /** One transaction: the series (if any), every occurrence and its client rows. */
  createMany(data: CreateBookingsData): Promise<BookingWithClients[]>;
  /** One transaction, guarded by the opened booking's version. */
  applyPlan(plan: BookingEditPlan): Promise<BookingEditResult>;
  /** Sets one client's attendance (and optionally the coached workout). False when they have no place in it. */
  setAttendance(data: {
    bookingId: string;
    clientId: string;
    attendance: BookingAttendance;
    at: Date | null;
    workoutSessionId?: string;
  }): Promise<boolean>;
  /** Routine day id → name (any user's days: callers pass only ids from bookings they may read). */
  routineDayNames(ids: readonly string[]): Promise<Map<string, string>>;
  /**
   * GDPR export: every booking the person has a place in as a client (any
   * trainer), and every booking and block they made as a trainer; by start.
   */
  listForExport(userId: string): Promise<BookingsForExport>;
  /** Account deletion: the client's future places are CANCELLED (bookings left empty are cancelled). */
  cancelFutureForClient(clientId: string, now: Date): Promise<CancelledForClientsResult>;
  /**
   * Retention: deletes client rows of bookings that started before their pair's
   * ENDED link ended, for links ended before `cutoff`; then bookings left with no
   * client and the series left with no booking.
   */
  deleteForEndedLinksBefore(cutoff: Date): Promise<number>;
  /** Retention: the trainer's own blocked time that started before `cutoff`. */
  deleteBlocksBefore(cutoff: Date): Promise<number>;
}

const withClients = { clients: { orderBy: { clientId: 'asc' } } } satisfies Prisma.BookingInclude;

type BookingTx = Prisma.TransactionClient;

/** Thrown inside a plan's transaction to roll it back. */
class PlanAbort extends Error {
  constructor(readonly status: 'conflict' | 'not_found') {
    super(status);
  }
}

/**
 * Inside a transaction (coaching ended: leave, remove, switch, trainer tools
 * off, account deletion): these clients' places in FUTURE (not yet started)
 * bookings of `trainerId` become CANCELLED; a booking with no client left is
 * cancelled entirely. Past bookings and coached workouts stay.
 */
export async function cancelFutureBookingsTx(
  tx: BookingTx,
  data: { trainerId?: string; clientIds: readonly string[]; now: Date },
): Promise<CancelledForClientsResult> {
  if (data.clientIds.length === 0) return { clientRows: 0, bookings: 0 };
  const affected = await tx.booking.findMany({
    where: {
      ...(data.trainerId !== undefined && { trainerId: data.trainerId }),
      kind: 'BOOKING',
      cancelledAt: null,
      startsAt: { gt: data.now },
      clients: {
        some: { clientId: { in: [...data.clientIds] }, attendance: { not: 'CANCELLED' } },
      },
    },
    select: { id: true },
  });
  if (affected.length === 0) return { clientRows: 0, bookings: 0 };
  const ids = affected.map((b) => b.id);
  const { count: clientRows } = await tx.bookingClient.updateMany({
    where: { bookingId: { in: ids }, clientId: { in: [...data.clientIds] } },
    data: { attendance: 'CANCELLED', attendanceAt: data.now },
  });
  await tx.booking.updateMany({ where: { id: { in: ids } }, data: { version: { increment: 1 } } });
  const empty = await tx.booking.findMany({
    where: { id: { in: ids }, clients: { none: { attendance: { not: 'CANCELLED' } } } },
    select: { id: true },
  });
  if (empty.length > 0) {
    await tx.booking.updateMany({
      where: { id: { in: empty.map((b) => b.id) } },
      data: { cancelledAt: data.now },
    });
  }
  return { clientRows, bookings: empty.length };
}

function overlapWhere(from: Date, to: Date): Prisma.BookingWhereInput {
  return {
    startsAt: { gt: new Date(from.getTime() - MAX_BOOKING_DURATION_MIN * MINUTE_MS), lt: to },
  };
}

function overlaps(b: Booking, from: Date): boolean {
  return b.startsAt.getTime() + b.durationMin * MINUTE_MS > from.getTime();
}

async function replaceClientsTx(
  tx: BookingTx,
  bookingId: string,
  clients: readonly BookingClientWriteData[],
): Promise<void> {
  const keep = clients.map((c) => c.clientId);
  await tx.bookingClient.deleteMany({ where: { bookingId, clientId: { notIn: keep } } });
  for (const c of clients) {
    const workoutRef = c.workoutRef ?? Prisma.DbNull;
    await tx.bookingClient.upsert({
      where: { bookingId_clientId: { bookingId, clientId: c.clientId } },
      create: { bookingId, clientId: c.clientId, workoutRef },
      update: { workoutRef },
    });
  }
}

export class BookingRepository implements IBookingRepository {
  async find(trainerId: string, id: string): Promise<BookingWithClients | null> {
    return prisma.booking.findFirst({ where: { id, trainerId }, include: withClients });
  }

  async findForClient(clientId: string, id: string): Promise<BookingWithClients | null> {
    return prisma.booking.findFirst({
      where: { id, kind: 'BOOKING', clients: { some: { clientId } } },
      include: withClients,
    });
  }

  async listOverlapping(trainerId: string, from: Date, to: Date): Promise<BookingWithClients[]> {
    const rows = await prisma.booking.findMany({
      where: { trainerId, ...overlapWhere(from, to) },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: withClients,
    });
    return rows.filter((b) => overlaps(b, from));
  }

  async listForPair(
    trainerId: string,
    clientId: string,
    from: Date,
    to: Date,
  ): Promise<BookingWithClients[]> {
    return prisma.booking.findMany({
      where: {
        trainerId,
        kind: 'BOOKING',
        startsAt: { gte: from, lt: to },
        clients: { some: { clientId } },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: withClients,
    });
  }

  async listSeries(seriesId: string): Promise<BookingWithClients[]> {
    return prisma.booking.findMany({
      where: { seriesId },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      include: withClients,
    });
  }

  async findSeries(
    seriesId: string,
  ): Promise<{ id: string; endsOn: string; startsOn: string } | null> {
    return prisma.bookingSeries.findUnique({
      where: { id: seriesId },
      select: { id: true, endsOn: true, startsOn: true },
    });
  }

  async nextStartsByClient(
    trainerId: string,
    clientIds: readonly string[],
    now: Date,
  ): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    if (clientIds.length === 0) return out;
    const rows = await prisma.bookingClient.findMany({
      where: {
        clientId: { in: [...clientIds] },
        attendance: { not: 'CANCELLED' },
        booking: {
          trainerId,
          kind: 'BOOKING',
          cancelledAt: null,
          startsAt: { gt: new Date(now.getTime() - MAX_BOOKING_DURATION_MIN * MINUTE_MS) },
        },
      },
      select: { clientId: true, booking: { select: { startsAt: true, durationMin: true } } },
      orderBy: { booking: { startsAt: 'asc' } },
    });
    for (const r of rows) {
      if (out.has(r.clientId) || !overlaps(r.booking as Booking, now)) continue;
      out.set(r.clientId, r.booking.startsAt);
    }
    return out;
  }

  async createMany(data: CreateBookingsData): Promise<BookingWithClients[]> {
    return prisma.$transaction(async (tx) => {
      const series = data.series
        ? await tx.bookingSeries.create({ data: { trainerId: data.trainerId, ...data.series } })
        : null;
      const ids: string[] = [];
      for (const occ of data.occurrences) {
        const booking = await tx.booking.create({
          data: {
            trainerId: data.trainerId,
            seriesId: series?.id ?? null,
            kind: data.kind,
            ...occ,
          },
          select: { id: true },
        });
        ids.push(booking.id);
      }
      if (data.clients.length > 0) {
        await tx.bookingClient.createMany({
          data: ids.flatMap((bookingId) =>
            data.clients.map((c) => ({
              bookingId,
              clientId: c.clientId,
              workoutRef: c.workoutRef ?? Prisma.DbNull,
            })),
          ),
        });
      }
      return tx.booking.findMany({
        where: { id: { in: ids } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        include: withClients,
      });
    });
  }

  async applyPlan(plan: BookingEditPlan): Promise<BookingEditResult> {
    try {
      await prisma.$transaction(async (tx) => {
        const guarded = await tx.booking.updateMany({
          where: {
            id: plan.guard.bookingId,
            trainerId: plan.trainerId,
            version: plan.guard.version,
          },
          data: { version: { increment: 1 } },
        });
        if (guarded.count === 0) {
          const exists = await tx.booking.count({
            where: { id: plan.guard.bookingId, trainerId: plan.trainerId },
          });
          throw new PlanAbort(exists > 0 ? 'conflict' : 'not_found');
        }
        if (plan.endSeries) {
          await tx.bookingSeries.updateMany({
            where: { id: plan.endSeries.id, trainerId: plan.trainerId },
            data: { endsOn: plan.endSeries.endsOn },
          });
        }
        if (plan.updateSeries) {
          await tx.bookingSeries.updateMany({
            where: { id: plan.updateSeries.id, trainerId: plan.trainerId },
            data: plan.updateSeries.data,
          });
        }
        const newSeries = plan.createSeries
          ? await tx.bookingSeries.create({
              data: { trainerId: plan.trainerId, ...plan.createSeries },
            })
          : null;
        for (const row of plan.rows) {
          const isGuard = row.id === plan.guard.bookingId;
          const updated = await tx.booking.updateMany({
            where: { id: row.id, trainerId: plan.trainerId },
            data: {
              ...row.data,
              ...(row.toNewSeries && newSeries && { seriesId: newSeries.id }),
              ...(row.cancel && { cancelledAt: row.cancel.at, cancelReason: row.cancel.reason }),
              // The guard row was bumped above; every other touched row bumps here.
              ...(!isGuard && { version: { increment: 1 } }),
            },
          });
          if (updated.count === 0) throw new PlanAbort('not_found');
          if (row.clients) await replaceClientsTx(tx, row.id, row.clients);
          if (row.cancel) {
            await tx.bookingClient.updateMany({
              where: { bookingId: row.id, attendance: 'SCHEDULED' },
              data: { attendance: 'CANCELLED', attendanceAt: row.cancel.at },
            });
          }
        }
      });
      return { status: 'ok' };
    } catch (err) {
      if (err instanceof PlanAbort) return { status: err.status };
      throw err;
    }
  }

  async setAttendance(data: {
    bookingId: string;
    clientId: string;
    attendance: BookingAttendance;
    at: Date | null;
    workoutSessionId?: string;
  }): Promise<boolean> {
    const { count } = await prisma.bookingClient.updateMany({
      where: { bookingId: data.bookingId, clientId: data.clientId },
      data: {
        attendance: data.attendance,
        attendanceAt: data.at,
        ...(data.workoutSessionId !== undefined && { workoutSessionId: data.workoutSessionId }),
      },
    });
    return count > 0;
  }

  async routineDayNames(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.routineDay.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async listForExport(userId: string): Promise<BookingsForExport> {
    const orderBy = [{ startsAt: 'asc' as const }, { id: 'asc' as const }];
    const [asClient, asTrainer] = await Promise.all([
      prisma.booking.findMany({
        where: { kind: 'BOOKING', clients: { some: { clientId: userId } } },
        orderBy,
        include: withClients,
      }),
      prisma.booking.findMany({ where: { trainerId: userId }, orderBy, include: withClients }),
    ]);
    return { asClient, asTrainer };
  }

  async cancelFutureForClient(clientId: string, now: Date): Promise<CancelledForClientsResult> {
    return prisma.$transaction((tx) => cancelFutureBookingsTx(tx, { clientIds: [clientId], now }));
  }

  async deleteForEndedLinksBefore(cutoff: Date): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const links = await tx.coachingLink.findMany({
        where: { status: 'ENDED', endedAt: { lt: cutoff } },
        select: { trainerId: true, clientId: true, endedAt: true },
      });
      let deleted = 0;
      for (const link of links) {
        if (!link.endedAt) continue;
        const { count } = await tx.bookingClient.deleteMany({
          where: {
            clientId: link.clientId,
            booking: { trainerId: link.trainerId, startsAt: { lt: link.endedAt } },
          },
        });
        deleted += count;
      }
      // Bookings left with nobody, and series left with no booking.
      const { count: emptyBookings } = await tx.booking.deleteMany({
        where: { kind: 'BOOKING', startsAt: { lt: cutoff }, clients: { none: {} } },
      });
      await tx.bookingSeries.deleteMany({ where: { bookings: { none: {} } } });
      return deleted + emptyBookings;
    });
  }

  async deleteBlocksBefore(cutoff: Date): Promise<number> {
    const { count } = await prisma.booking.deleteMany({
      where: { kind: 'BLOCK', startsAt: { lt: cutoff } },
    });
    await prisma.bookingSeries.deleteMany({ where: { bookings: { none: {} } } });
    return count;
  }
}

export const bookingRepository = new BookingRepository();
