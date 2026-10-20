import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import {
  bookingRepository,
  coachingLinkRepository,
  routineRepository,
  trainerProfileRepository,
  type BookingClientWriteData,
  type BookingEditPlan,
  type BookingRowEdit,
  type BookingWithClients,
  type IBookingRepository,
  type ICoachingLinkRepository,
  type IRoutineRepository,
  type ITrainerProfileRepository,
  type SeriesWriteData,
} from '@chefer/database';
import {
  BOOKING_COPY,
  BOOKING_REMINDER_DAYS,
  BOOKING_START_EARLY_MIN,
  FALLBACK_TRAINER_NAME,
  TEMPLATE_COPY,
  TRAINER_MODE_LIMITS,
  type bookingParticipantInputSchema,
  type BookingRangeDto,
  type cancelBookingInputSchema,
  type ClientBookingDto,
  type CreateBookingInput,
  type markAttendanceInputSchema,
  type TrainerBookingClientDto,
  type TrainerBookingDto,
  type TrainerClientBookingsDto,
  type updateBookingInputSchema,
} from '@chefer/types';
import {
  addDaysLocal,
  daysBetweenLocal,
  displayNameOf,
  isValidTimeZone,
  utcToZoned,
  weekdayOf,
  weeklyDates,
  zonedToUtc,
} from '@chefer/utils';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import { ConflictCause } from '../../lib/conflict.js';
import {
  attendedInMonth,
  CLIENT_PAST_DAYS,
  endOf,
  hasEnded,
  previousMonthOf,
  readWorkoutRef,
  toStoredRef,
  type StoredWorkoutRef,
} from './booking-rules.js';
import type { CoachingAccess } from './coaching-access.service.js';
import {
  coachingNoticeService,
  type BookingNoticeRef,
  type CoachingNoticeService,
} from './coaching-notice.service.js';
import { workoutTemplateService, type WorkoutTemplateService } from './workout-template.service.js';

// ─── Trainer mode M3: bookings and blocked time (docs/prd-2026-10/trainer-mode.md §6.2–§6.5, §8.2, §9) ──
//
//   trainer.bookings.*      the trainer's calendar (their own rows only; another
//                           trainer's id is NOT_FOUND "This booking isn't available")
//   trainer.client.bookings one client's bookings (requireCoachingAccess upstream)
//   coaching.bookings.*     the client's read-only view: never another client's name
//
// Rules:
// - Every named client must be an ACTIVE client of the trainer at save time
//   (the single NOT_FOUND "This client isn't available"). Reads show current
//   clients only: a former client's place is left out, and a booking with no
//   current client left is not shown at all (§9: the trainer loses access).
// - Times: the input wall clock (date, time, zone) → a UTC instant; weekly
//   repeats are local dates in that zone, so 18:00 stays 18:00 across DST.
// - Never in the past (5 minutes' grace for "now"); never beyond 365 days.
//   Bookings that have started can no longer be edited or cancelled — only
//   attendance changes (markAttendance, a coached finish).
// - Edits are version-checked: CONFLICT with `data.conflict = { kind: 'booking', current }`.
// - TEMPLATE workout refs are assigned (ADD_DAY via WorkoutTemplateService) on
//   save and stored as the new ROUTINE_DAY.
// - Notices: one per client per save (a series notifies once).
// - Never a note, a location or a name in a log line.

export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceInputSchema>;
type ParticipantInput = z.infer<typeof bookingParticipantInputSchema>;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** "Now" is a few minutes wide: a booking made for the current slot is not "in the past". */
const PAST_GRACE_MS = 5 * MINUTE_MS;
/** trainer.client.bookings upcoming: at most this many rows (a year of a weekly series fits). */
const CLIENT_UPCOMING_MAX = 60;

export interface BookingServiceDeps {
  bookings: IBookingRepository;
  links: Pick<ICoachingLinkRepository, 'listActiveForTrainer' | 'findActiveForClient'>;
  routines: Pick<IRoutineRepository, 'findActive'>;
  trainers: Pick<ITrainerProfileRepository, 'find'>;
  templates: Pick<WorkoutTemplateService, 'assign'>;
  notices: Pick<CoachingNoticeService, 'booking'>;
  now: () => Date;
}

const defaultDeps: BookingServiceDeps = {
  bookings: bookingRepository,
  links: coachingLinkRepository,
  routines: routineRepository,
  trainers: trainerProfileRepository,
  templates: workoutTemplateService,
  notices: coachingNoticeService,
  now: () => new Date(),
};

// ─── errors ───────────────────────────────────────────────────────────────────

export function bookingNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: BOOKING_COPY.server.notFound });
}
function badRequest(message: string): TRPCError {
  return new TRPCError({ code: 'BAD_REQUEST', message });
}
const horizonError = () =>
  badRequest(BOOKING_COPY.server.horizon(TRAINER_MODE_LIMITS.bookingHorizonDays));
const pastError = () => badRequest(BOOKING_COPY.server.past);

/** Optional free text: trimmed upstream; empty = none. */
function textOrNull(v: string | null | undefined): string | null {
  const t = v?.trim() ?? '';
  return t === '' ? null : t;
}

/** Current clients' names, by id (the trainer's ACTIVE links). */
type ActiveNames = ReadonlyMap<string, string>;

/** What the plan changes for one client, for notices. */
interface ClientChange {
  clientId: string;
  change: 'CREATED' | 'CHANGED' | 'CANCELLED';
}

export class BookingService {
  private readonly deps: BookingServiceDeps;

  constructor(deps: Partial<BookingServiceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  // ─── trainer reads ──────────────────────────────────────────────────────────

  /** `trainer.bookings.range`: bookings + blocks overlapping [from, to), cancelled included. */
  async range(trainerId: string, from: Date, to: Date): Promise<BookingRangeDto> {
    return { bookings: await this.listVisible(trainerId, from, to) };
  }

  /** Visible bookings overlapping [from, to), as DTOs (also the dashboard's source). */
  async listVisible(trainerId: string, from: Date, to: Date): Promise<TrainerBookingDto[]> {
    const [rows, names] = await Promise.all([
      this.deps.bookings.listOverlapping(trainerId, from, to),
      this.activeNames(trainerId),
    ]);
    return this.toDtos(rows, names);
  }

  /** `trainer.bookings.get` */
  async get(trainerId: string, bookingId: string): Promise<TrainerBookingDto> {
    const [row, names] = await Promise.all([
      this.deps.bookings.find(trainerId, bookingId),
      this.activeNames(trainerId),
    ]);
    if (!row || !isVisible(row, names)) throw bookingNotFound();
    const [dto] = await this.toDtos([row], names);
    if (!dto) throw bookingNotFound();
    return dto;
  }

  /** `trainer.client.bookings` (the client is an ACTIVE client: requireCoachingAccess). */
  async clientBookings(access: CoachingAccess, today: string): Promise<TrainerClientBookingsDto> {
    const now = this.deps.now();
    const from = new Date(now.getTime() - CLIENT_PAST_DAYS * DAY_MS);
    const to = new Date(now.getTime() + (TRAINER_MODE_LIMITS.bookingHorizonDays + 1) * DAY_MS);
    const [rows, names] = await Promise.all([
      this.deps.bookings.listForPair(access.trainerId, access.clientId, from, to),
      this.activeNames(access.trainerId),
    ]);
    const dtos = await this.toDtos(rows, names);
    const upcoming = dtos.filter((b) => !hasEnded(b, now)).slice(0, CLIENT_UPCOMING_MAX);
    const past = dtos
      .filter((b) => hasEnded(b, now) && endOf(b).getTime() >= from.getTime())
      .reverse();
    return {
      upcoming,
      past,
      deliveredThisMonth: attendedInMonth(dtos, access.clientId, today.slice(0, 7)),
      deliveredLastMonth: attendedInMonth(dtos, access.clientId, previousMonthOf(today)),
    };
  }

  // ─── trainer writes ─────────────────────────────────────────────────────────

  /** `trainer.bookings.create`: the first occurrence. */
  async create(trainerId: string, input: CreateBookingInput): Promise<TrainerBookingDto> {
    const now = this.deps.now();
    assertZone(input.timeZone);
    const first = zonedToUtc(input.date, input.time, input.timeZone);
    assertNotPast(first, now);

    let dates = [input.date];
    let series: SeriesWriteData | null = null;
    if (input.repeat) {
      const until =
        input.repeat.until ??
        addDaysLocal(input.date, 7 * (TRAINER_MODE_LIMITS.defaultWeeklyRepeats - 1));
      if (until < input.date) throw badRequest('The repeat must end on or after the first date.');
      if (daysBetweenLocal(input.date, until) > 7 * (TRAINER_MODE_LIMITS.weeklyRepeats - 1)) {
        throw badRequest(`A booking repeats at most ${TRAINER_MODE_LIMITS.weeklyRepeats} weeks.`);
      }
      dates = weeklyDates(input.date, until, TRAINER_MODE_LIMITS.weeklyRepeats);
      series = {
        weekday: weekdayOf(input.date),
        startLocalTime: input.time,
        durationMin: input.durationMin,
        timeZone: input.timeZone,
        startsOn: input.date,
        endsOn: dates.at(-1) ?? input.date,
      };
    }
    const occurrences = dates.map((d) => ({
      startsAt: zonedToUtc(d, input.time, input.timeZone),
      durationMin: input.durationMin,
      timeZone: input.timeZone,
      location: textOrNull(input.location),
      note: textOrNull(input.note),
    }));
    assertWithinHorizon(occurrences.at(-1)?.startsAt ?? first, now);

    const names = await this.activeNames(trainerId);
    const clients =
      input.kind === 'BLOCK' ? [] : await this.resolveClients(trainerId, input.clients, names);

    const rows = await this.deps.bookings.createMany({
      trainerId,
      kind: input.kind,
      series,
      occurrences,
      clients,
    });
    const head = rows[0];
    if (!head) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No booking saved.' });
    await this.notify(
      trainerId,
      clients.map((c) => ({ clientId: c.clientId, change: 'CREATED' })),
      noticeRef(head, series !== null, null),
    );
    const [dto] = await this.toDtos([head], names);
    if (!dto) throw bookingNotFound();
    return dto;
  }

  /** `trainer.bookings.update` (scope ignored for a one-off). */
  async update(trainerId: string, input: UpdateBookingInput): Promise<TrainerBookingDto> {
    const now = this.deps.now();
    const names = await this.activeNames(trainerId);
    const booking = await this.deps.bookings.find(trainerId, input.bookingId);
    if (!booking || !isVisible(booking, names)) throw bookingNotFound();
    if (booking.version !== input.expectedVersion) {
      throw await this.conflict(trainerId, booking.id, names);
    }
    if (booking.cancelledAt) throw bookingNotFound();
    if (booking.startsAt.getTime() <= now.getTime()) throw pastError();

    const p = input.patch;
    if (p.timeZone !== undefined) assertZone(p.timeZone);
    const cur = utcToZoned(booking.startsAt, booking.timeZone);
    const newDate = p.date ?? cur.date;
    const newTime = p.time ?? cur.time;
    const newZone = p.timeZone ?? booking.timeZone;
    const startsAt = zonedToUtc(newDate, newTime, newZone);
    assertNotPast(startsAt, now);
    assertWithinHorizon(startsAt, now);

    let clients: BookingClientWriteData[] | undefined;
    if (p.clients !== undefined) {
      if (booking.kind === 'BLOCK') {
        if (p.clients.length > 0) throw badRequest('Blocked time has no clients.');
      } else {
        if (p.clients.length === 0) throw badRequest(BOOKING_COPY.editor.needsClient);
        clients = await this.resolveClients(trainerId, p.clients, names);
      }
    }

    const dayDelta = daysBetweenLocal(cur.date, newDate);
    const timeChanged = p.date !== undefined || p.time !== undefined || p.timeZone !== undefined;
    const rowData = (row: BookingWithClients) => {
      const local = utcToZoned(row.startsAt, row.timeZone);
      const zone = p.timeZone ?? row.timeZone;
      return {
        ...(timeChanged && {
          startsAt: zonedToUtc(addDaysLocal(local.date, dayDelta), p.time ?? local.time, zone),
          timeZone: zone,
        }),
        ...(p.durationMin !== undefined && { durationMin: p.durationMin }),
        ...(p.location !== undefined && { location: textOrNull(p.location) }),
        ...(p.note !== undefined && { note: textOrNull(p.note) }),
      };
    };

    const plan: BookingEditPlan = {
      trainerId,
      guard: { bookingId: booking.id, version: booking.version },
      rows: [],
    };
    let touched: BookingWithClients[] = [booking];
    const following = input.scope === 'FOLLOWING' && booking.seriesId !== null;
    if (following && booking.seriesId) {
      const all = await this.deps.bookings.listSeries(booking.seriesId);
      const earlier = all.filter((r) => r.startsAt.getTime() < booking.startsAt.getTime());
      touched = all.filter((r) => r.startsAt.getTime() >= booking.startsAt.getTime());
      const moved = touched.map((r) => ({ row: r, data: rowData(r) }));
      const lastStart = moved.at(-1);
      const lastDate = lastStart
        ? utcToZoned(lastStart.data.startsAt ?? lastStart.row.startsAt, newZone).date
        : newDate;
      const seriesData: SeriesWriteData = {
        weekday: weekdayOf(newDate),
        startLocalTime: newTime,
        durationMin: p.durationMin ?? booking.durationMin,
        timeZone: newZone,
        startsOn: newDate,
        endsOn: lastDate,
      };
      const split = earlier.length > 0;
      const lastEarlier = earlier.at(-1);
      if (split && lastEarlier) {
        plan.endSeries = {
          id: booking.seriesId,
          endsOn: utcToZoned(lastEarlier.startsAt, lastEarlier.timeZone).date,
        };
        plan.createSeries = seriesData;
      } else {
        plan.updateSeries = { id: booking.seriesId, data: seriesData };
      }
      for (const { row, data } of moved) {
        // A cancelled occurrence stays cancelled where it was; it only follows the split.
        const edit: BookingRowEdit = row.cancelledAt
          ? { id: row.id }
          : { id: row.id, data, ...(clients && { clients }) };
        if (split) edit.toNewSeries = true;
        plan.rows.push(edit);
      }
    } else {
      plan.rows.push({ id: booking.id, data: rowData(booking), ...(clients && { clients }) });
    }

    const result = await this.deps.bookings.applyPlan(plan);
    if (result.status === 'conflict') throw await this.conflict(trainerId, booking.id, names);
    if (result.status === 'not_found') throw bookingNotFound();

    const updated = await this.deps.bookings.find(trainerId, booking.id);
    if (!updated) throw bookingNotFound();
    const changes = clientChanges(booking, clients, {
      visibleChange:
        updated.startsAt.getTime() !== booking.startsAt.getTime() ||
        updated.durationMin !== booking.durationMin ||
        updated.timeZone !== booking.timeZone ||
        updated.location !== booking.location ||
        updated.note !== booking.note,
    });
    await this.notify(trainerId, changes, noticeRef(updated, following, null));
    const [dto] = await this.toDtos([updated], await this.activeNames(trainerId));
    if (!dto) throw bookingNotFound();
    return dto;
  }

  /** `trainer.bookings.cancel`: never deletes; idempotent on an already cancelled booking. */
  async cancel(
    trainerId: string,
    input: CancelBookingInput,
  ): Promise<{ ok: true; cancelled: number }> {
    const now = this.deps.now();
    const names = await this.activeNames(trainerId);
    const booking = await this.deps.bookings.find(trainerId, input.bookingId);
    if (!booking || !isVisible(booking, names)) throw bookingNotFound();
    if (booking.cancelledAt) return { ok: true, cancelled: 0 };
    if (booking.startsAt.getTime() <= now.getTime()) throw pastError();
    const reason = textOrNull(input.reason);

    let rows: BookingWithClients[] = [booking];
    const plan: BookingEditPlan = {
      trainerId,
      guard: { bookingId: booking.id, version: booking.version },
      rows: [],
    };
    const following = input.scope === 'FOLLOWING' && booking.seriesId !== null;
    if (following && booking.seriesId) {
      const all = await this.deps.bookings.listSeries(booking.seriesId);
      rows = all.filter(
        (r) => r.startsAt.getTime() >= booking.startsAt.getTime() && r.cancelledAt === null,
      );
      const lastEarlier = all
        .filter((r) => r.startsAt.getTime() < booking.startsAt.getTime())
        .at(-1);
      if (lastEarlier) {
        plan.endSeries = {
          id: booking.seriesId,
          endsOn: utcToZoned(lastEarlier.startsAt, lastEarlier.timeZone).date,
        };
      }
    }
    plan.rows = rows.map((r) => ({ id: r.id, cancel: { at: now, reason } }));
    const result = await this.deps.bookings.applyPlan(plan);
    if (result.status === 'conflict') throw await this.conflict(trainerId, booking.id, names);
    if (result.status === 'not_found') throw bookingNotFound();

    // One notice per client, for the first booking of theirs that was cancelled.
    const notified = new Set<string>();
    for (const row of rows) {
      for (const c of row.clients) {
        if (c.attendance === 'CANCELLED' || notified.has(c.clientId)) continue;
        notified.add(c.clientId);
        await this.deps.notices.booking(
          c.clientId,
          trainerId,
          'CANCELLED',
          noticeRef(row, rows.length > 1, reason),
        );
      }
    }
    return { ok: true, cancelled: rows.length };
  }

  /** `trainer.bookings.markAttendance`: from 15 minutes before the start; SCHEDULED undoes a mark. */
  async markAttendance(trainerId: string, input: MarkAttendanceInput): Promise<TrainerBookingDto> {
    const now = this.deps.now();
    const names = await this.activeNames(trainerId);
    const booking = await this.deps.bookings.find(trainerId, input.bookingId);
    if (booking?.kind !== 'BOOKING' || !isVisible(booking, names)) throw bookingNotFound();
    if (!names.has(input.clientId)) throw clientUnavailableError();
    const place = booking.clients.find((c) => c.clientId === input.clientId);
    if (!place || place.attendance === 'CANCELLED') throw bookingNotFound();
    if (booking.cancelledAt) throw bookingNotFound();
    if (booking.startsAt.getTime() - BOOKING_START_EARLY_MIN * MINUTE_MS > now.getTime()) {
      throw badRequest(BOOKING_COPY.detail.startAvailable(BOOKING_START_EARLY_MIN));
    }
    await this.deps.bookings.setAttendance({
      bookingId: booking.id,
      clientId: input.clientId,
      attendance: input.attendance,
      at: input.attendance === 'SCHEDULED' ? null : now,
    });
    return this.get(trainerId, booking.id);
  }

  // ─── the client's side ──────────────────────────────────────────────────────

  /**
   * `coaching.bookings.upcoming`: the caller's bookings with their CURRENT
   * trainer that have not ended, soonest first, starting within
   * BOOKING_REMINDER_DAYS. Cancelled ones stay listed until they start.
   */
  async upcomingForClient(clientId: string): Promise<ClientBookingDto[]> {
    const link = await this.deps.links.findActiveForClient(clientId);
    if (!link) return [];
    const now = this.deps.now();
    const [rows, trainer] = await Promise.all([
      this.deps.bookings.listForPair(
        link.trainerId,
        clientId,
        new Date(now.getTime() - 4 * 60 * MINUTE_MS),
        new Date(now.getTime() + BOOKING_REMINDER_DAYS * DAY_MS),
      ),
      this.deps.trainers.find(link.trainerId),
    ]);
    const visible = rows.filter((b) => {
      if (hasEnded(b, now)) return false;
      const cancelled = b.cancelledAt !== null || placeOf(b, clientId)?.attendance === 'CANCELLED';
      return !cancelled || b.startsAt.getTime() > now.getTime();
    });
    const dayNames = await this.dayNames(visible, clientId);
    const trainerName = trainer?.displayName ?? FALLBACK_TRAINER_NAME;
    return visible.map((b) => toClientBookingDto(b, clientId, trainerName, dayNames));
  }

  /** `coaching.bookings.get`: NOT_FOUND unless the caller has a place in it. */
  async getForClient(clientId: string, bookingId: string): Promise<ClientBookingDto> {
    const row = await this.deps.bookings.findForClient(clientId, bookingId);
    if (!row) throw bookingNotFound();
    const [trainer, dayNames] = await Promise.all([
      this.deps.trainers.find(row.trainerId),
      this.dayNames([row], clientId),
    ]);
    return toClientBookingDto(
      row,
      clientId,
      trainer?.displayName ?? FALLBACK_TRAINER_NAME,
      dayNames,
    );
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private async activeNames(trainerId: string): Promise<Map<string, string>> {
    const links = await this.deps.links.listActiveForTrainer(trainerId);
    return new Map(
      links
        .filter((l) => l.clientId !== trainerId)
        .map((l) => [l.clientId, displayNameOf(l.client)]),
    );
  }

  /**
   * Checks every participant (unique, ACTIVE, a ROUTINE_DAY in their active
   * routine) BEFORE writing anything, then assigns TEMPLATE refs (ADD_DAY) and
   * returns the rows to store.
   */
  private async resolveClients(
    trainerId: string,
    participants: readonly ParticipantInput[],
    names: ActiveNames,
  ): Promise<BookingClientWriteData[]> {
    const ids = participants.map((p) => p.clientId);
    if (new Set(ids).size !== ids.length) throw badRequest('Each client can be added once.');
    if (participants.length > TRAINER_MODE_LIMITS.clientsPerBooking) {
      throw badRequest(BOOKING_COPY.editor.clientsMax(TRAINER_MODE_LIMITS.clientsPerBooking));
    }
    for (const p of participants) if (!names.has(p.clientId)) throw clientUnavailableError();
    for (const p of participants) {
      if (p.workout?.kind !== 'ROUTINE_DAY') continue;
      const { routineDayId } = p.workout;
      const routine = await this.deps.routines.findActive(p.clientId);
      if (!routine?.days.some((d) => d.id === routineDayId)) {
        throw badRequest(TEMPLATE_COPY.assign.failureReason.DAY_NOT_FOUND);
      }
    }
    const out: BookingClientWriteData[] = [];
    for (const p of participants) {
      let ref: StoredWorkoutRef | null;
      if (p.workout?.kind === 'TEMPLATE') {
        const res = await this.deps.templates.assign(trainerId, {
          templateId: p.workout.templateId,
          targets: [{ clientId: p.clientId, mode: 'ADD_DAY' }],
        });
        const r = res.results[0];
        if (!r?.ok) {
          const name = names.get(p.clientId) ?? '';
          const reason = r ? TEMPLATE_COPY.assign.failureReason[r.reason] : '';
          throw badRequest(`${name}: ${reason}`);
        }
        ref = { kind: 'ROUTINE_DAY', routineDayId: r.routineDayId };
      } else {
        ref = toStoredRef(p.workout);
      }
      out.push({ clientId: p.clientId, workoutRef: ref });
    }
    return out;
  }

  private async conflict(trainerId: string, bookingId: string, names: ActiveNames) {
    const row = await this.deps.bookings.find(trainerId, bookingId);
    const [current] = row ? await this.toDtos([row], names) : [];
    if (!current) return bookingNotFound();
    return new TRPCError({
      code: 'CONFLICT',
      message: 'This booking changed. Check it and try again.',
      cause: new ConflictCause({ kind: 'booking', current }),
    });
  }

  private async notify(
    trainerId: string,
    changes: readonly ClientChange[],
    ref: BookingNoticeRef,
  ): Promise<void> {
    for (const c of changes) await this.deps.notices.booking(c.clientId, trainerId, c.change, ref);
  }

  /** Routine day names for these bookings' refs (only the given client's when `onlyClientId`). */
  private async dayNames(
    rows: readonly BookingWithClients[],
    onlyClientId?: string,
  ): Promise<Map<string, string>> {
    const ids = rows.flatMap((b) =>
      b.clients
        .filter((c) => onlyClientId === undefined || c.clientId === onlyClientId)
        .flatMap((c) => {
          const ref = readWorkoutRef(c.workoutRef);
          return ref ? [ref.routineDayId] : [];
        }),
    );
    return this.deps.bookings.routineDayNames(ids);
  }

  /** Visible rows → DTOs: current clients only, by name. */
  async toDtos(
    rows: readonly BookingWithClients[],
    names: ActiveNames,
  ): Promise<TrainerBookingDto[]> {
    const visible = rows.filter((r) => isVisible(r, names));
    const currentOnly = visible.map((r) => ({
      ...r,
      clients: r.clients.filter((c) => names.has(c.clientId)),
    }));
    const dayNames = await this.dayNames(currentOnly);
    return currentOnly.map((r) => toTrainerBookingDto(r, names, dayNames));
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function assertZone(zone: string): void {
  if (!isValidTimeZone(zone)) throw badRequest(BOOKING_COPY.server.badZone);
}

function assertNotPast(startsAt: Date, now: Date): void {
  if (startsAt.getTime() < now.getTime() - PAST_GRACE_MS) throw pastError();
}

function assertWithinHorizon(startsAt: Date, now: Date): void {
  if (startsAt.getTime() > now.getTime() + TRAINER_MODE_LIMITS.bookingHorizonDays * DAY_MS) {
    throw horizonError();
  }
}

/** Blocked time is always visible; a booking only while it has a current client. */
export function isVisible(row: BookingWithClients, names: ActiveNames): boolean {
  return row.kind === 'BLOCK' || row.clients.some((c) => names.has(c.clientId));
}

function placeOf(row: BookingWithClients, clientId: string) {
  return row.clients.find((c) => c.clientId === clientId);
}

function noticeRef(
  row: { id: string; startsAt: Date; timeZone: string },
  weekly: boolean,
  reason: string | null,
): BookingNoticeRef {
  return {
    bookingId: row.id,
    startsAt: row.startsAt.toISOString(),
    timeZone: row.timeZone,
    weekly,
    reason,
  };
}

/**
 * Who hears what after an edit: added clients CREATED, removed ones CANCELLED,
 * kept ones CHANGED when the time, place, note or their workout changed.
 */
export function clientChanges(
  before: BookingWithClients,
  after: readonly BookingClientWriteData[] | undefined,
  opts: { visibleChange: boolean },
): ClientChange[] {
  const old = new Map(
    before.clients.filter((c) => c.attendance !== 'CANCELLED').map((c) => [c.clientId, c]),
  );
  if (!after) {
    return opts.visibleChange
      ? [...old.keys()].map((clientId) => ({ clientId, change: 'CHANGED' as const }))
      : [];
  }
  const out: ClientChange[] = [];
  const next = new Set(after.map((c) => c.clientId));
  for (const c of after) {
    const prev = old.get(c.clientId);
    if (!prev) out.push({ clientId: c.clientId, change: 'CREATED' });
    else if (
      opts.visibleChange ||
      JSON.stringify(readWorkoutRef(prev.workoutRef)) !== JSON.stringify(c.workoutRef ?? null)
    ) {
      out.push({ clientId: c.clientId, change: 'CHANGED' });
    }
  }
  for (const id of old.keys()) if (!next.has(id)) out.push({ clientId: id, change: 'CANCELLED' });
  return out;
}

function toTrainerBookingDto(
  row: BookingWithClients,
  names: ActiveNames,
  dayNames: ReadonlyMap<string, string>,
): TrainerBookingDto {
  const clients: TrainerBookingClientDto[] = row.clients
    .map((c) => {
      const ref = readWorkoutRef(c.workoutRef);
      return {
        clientId: c.clientId,
        name: names.get(c.clientId) ?? '',
        attendance: c.attendance,
        workout: ref
          ? {
              kind: 'ROUTINE_DAY' as const,
              routineDayId: ref.routineDayId,
              name: dayNames.get(ref.routineDayId) ?? null,
            }
          : { kind: 'NEXT_DAY' as const, routineDayId: null, name: null },
        workoutSessionId: c.workoutSessionId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: row.id,
    kind: row.kind,
    seriesId: row.seriesId,
    startsAt: row.startsAt.toISOString(),
    endsAt: endOf(row).toISOString(),
    durationMin: row.durationMin,
    timeZone: row.timeZone,
    location: row.location,
    note: row.note,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    version: row.version,
    clients,
  };
}

/** The client's view: the trainer, time, place, note, THEIR workout, and a count of the others. */
export function toClientBookingDto(
  row: BookingWithClients,
  clientId: string,
  trainerName: string,
  dayNames: ReadonlyMap<string, string>,
): ClientBookingDto {
  const own = placeOf(row, clientId);
  const ref = readWorkoutRef(own?.workoutRef);
  const ownCancelledAt = own?.attendance === 'CANCELLED' ? own.attendanceAt : null;
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: endOf(row).toISOString(),
    durationMin: row.durationMin,
    timeZone: row.timeZone,
    trainer: { name: trainerName },
    location: row.location,
    note: row.note,
    workoutName: ref ? (dayNames.get(ref.routineDayId) ?? null) : null,
    otherClients: row.clients.filter((c) => c.clientId !== clientId && c.attendance !== 'CANCELLED')
      .length,
    cancelledAt: (row.cancelledAt ?? ownCancelledAt)?.toISOString() ?? null,
    cancelReason: row.cancelledAt ? row.cancelReason : null,
  };
}

export const bookingService = new BookingService();
