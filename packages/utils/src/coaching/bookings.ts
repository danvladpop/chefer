import {
  BOOKING_COPY,
  BOOKING_DURATION_CHIPS,
  BOOKING_DURATION_LIMITS,
  BOOKING_REMINDER_DAYS,
  BOOKING_START_EARLY_MIN,
  CLIENT_BOOKING_CARD_DAYS,
  localTimeSchema,
  TRAINER_MODE_LIMITS,
  type BookingKind,
  type BookingScope,
  type BookingWorkoutRef,
  type ClientBookingDto,
  type ClientRowDto,
  type CreateBookingInput,
  type TrainerBookingDto,
} from '@chefer/types';
import { addDaysLocal } from '../gym/weeks';
import { weekdayLongName } from '../plan-training';
import { intervalsOverlap, utcToZoned, zonedToUtc } from './booking-time';
import { formatDayWithWeekday, weekdayName } from './dates';

// ─── Bookings: the rules both apps share (docs/prd-2026-10/trainer-mode.md §6.1–§6.9, §7.3, §12) ──
// Platform-neutral and pure: where a booking sits on the calendar, how it is
// labelled, when Start / attendance / changes are open (the same windows the
// API enforces in apps/api/src/application/coaching/booking-rules.ts and
// booking.service.ts), the editor's draft → `trainer.bookings.create|update`
// payloads, the client's upcoming card and the local reminder plan.
// Everything is shown in the VIEWER's zone (`deviceTimeZone()`); a booking
// made in another zone carries the "In Europe/Bucharest time" hint. Minutes are
// wall-clock minutes of the day (`utcToZoned().minuteOfDay`), so a weekly 18:00
// sits at 18:00 on both sides of a DST change.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const DAY_MINUTES = 24 * 60;

// ─── Zone and day ─────────────────────────────────────────────────────────────

/** The device's IANA zone: what the schedule shows and new or moved bookings are made in. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Today's `YYYY-MM-DD` in `zone`. */
export function todayIn(zone: string, now: Date = new Date()): string {
  return utcToZoned(now, zone).date;
}

/** Monday-first dates of the week starting `weekStart`. */
export function scheduleWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i));
}

/** `trainer.bookings.range` input: the `[from, to)` instants of the 7 local days from `weekStart` (§12). */
export function bookingWeekRange(weekStart: string, zone: string): { from: string; to: string } {
  return {
    from: zonedToUtc(weekStart, '00:00', zone).toISOString(),
    to: zonedToUtc(addDaysLocal(weekStart, 7), '00:00', zone).toISOString(),
  };
}

// ─── Labels ───────────────────────────────────────────────────────────────────

type Times = Pick<TrainerBookingDto, 'startsAt' | 'endsAt'>;
type Who = Pick<TrainerBookingDto, 'kind' | 'clients'>;

/** "Maria" from "Maria Pop" (the whole name when it has no first word). */
function firstWord(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first !== undefined && first !== '' ? first : name;
}

/** "18:00" in `zone`. */
export function bookingTime(iso: string, zone: string): string {
  return utcToZoned(iso, zone).time;
}

/** "18:00–19:00" in `zone`. */
export function bookingTimeRange(booking: Times, zone: string): string {
  return `${bookingTime(booking.startsAt, zone)}–${bookingTime(booking.endsAt, zone)}`;
}

/** "Tue 21 Oct, 18:00" (notices, past lists, the Today link). */
export function bookingWhen(iso: string, zone: string): string {
  const z = utcToZoned(iso, zone);
  return `${formatDayWithWeekday(z.date)}, ${z.time}`;
}

/** "Today, 18:00" / "Tue 21 Oct, 18:00" (a client row's next booking). */
export function bookingDayWhen(iso: string, zone: string, today: string): string {
  const z = utcToZoned(iso, zone);
  return `${z.date === today ? BOOKING_COPY.schedule.today : formatDayWithWeekday(z.date)}, ${z.time}`;
}

/** "Today, 18:00–19:00" / "Tue 21 Oct, 18:00–19:00". */
export function bookingDayTimeRange(booking: Times, zone: string, today: string): string {
  const date = utcToZoned(booking.startsAt, zone).date;
  const day = date === today ? BOOKING_COPY.schedule.today : formatDayWithWeekday(date);
  return `${day}, ${bookingTimeRange(booking, zone)}`;
}

/** Who the slot is with: "Maria", "Maria + 1" (§6.2); "Blocked" for blocked time. */
export function bookingWho(booking: Who): string {
  if (booking.kind === 'BLOCK') return BOOKING_COPY.schedule.blocked;
  const [first] = booking.clients;
  // Clients are filtered to current ones; a booking whose clients all left is cancelled.
  if (!first) return BOOKING_COPY.schedule.cancelled;
  return BOOKING_COPY.schedule.groupName(firstWord(first.name), booking.clients.length - 1);
}

/** The workout name(s) set for the slot ("Lower body A"), or null (next routine day / blocked). */
export function bookingWhat(booking: Who): string | null {
  if (booking.kind === 'BLOCK') return null;
  const names = [
    ...new Set(booking.clients.flatMap((c) => (c.workout.name ? [c.workout.name] : []))),
  ];
  return names.length > 0 ? names.join(' · ') : null;
}

/** "Tuesday 18:00 to 19:00" — the spoken "when" of a calendar block (§12). */
export function bookingWhenSpoken(booking: Times, zone: string): string {
  const start = utcToZoned(booking.startsAt, zone);
  return BOOKING_COPY.schedule.when(
    weekdayLongName(start.weekday),
    start.time,
    bookingTime(booking.endsAt, zone),
  );
}

/** "In Europe/Bucharest time", only for a booking made in another zone than `zone`. */
export function bookingZoneHint(booking: Pick<TrainerBookingDto, 'timeZone'>, zone: string) {
  return booking.timeZone !== zone ? BOOKING_COPY.schedule.otherZone(booking.timeZone) : null;
}

/** A calendar block's full accessible name (§12): "Tuesday 18:00 to 19:00, Maria, Lower body A". */
export function bookingBlockLabel(booking: TrainerBookingDto, zone: string): string {
  const parts = [
    BOOKING_COPY.schedule.blockLabel(
      bookingWhenSpoken(booking, zone),
      bookingWho(booking),
      bookingWhat(booking),
    ),
  ];
  if (booking.cancelledAt) parts.push(BOOKING_COPY.schedule.cancelled);
  const hint = bookingZoneHint(booking, zone);
  if (hint) parts.push(hint);
  return parts.join(', ');
}

// ─── Day layout (§6.2) ────────────────────────────────────────────────────────

/** The grid's default window: 06:00–22:00 (the rest is reachable by scrolling). */
export const SCHEDULE_FIRST_MINUTE = 6 * 60;
export const SCHEDULE_LAST_MINUTE = 22 * 60;

export interface DaySpan {
  /** Minutes since local midnight, 0–1440. */
  start: number;
  end: number;
}

export type Columned<T> = T & {
  /** 0-based column inside its overlap cluster. */
  column: number;
  /** Columns in that cluster: the block is 1/columns wide. */
  columns: number;
};

/**
 * Side-by-side columns for overlapping spans ("Overlapping items render side
 * by side"): spans that overlap (directly or through a chain) form a cluster;
 * each takes the first column free at its start, and every span in the
 * cluster is as wide as the cluster's column count. `minLength` is the
 * shortest a block is DRAWN, so blocks that would cover each other visually
 * also go side by side.
 */
export function assignBookingColumns<T extends DaySpan>(
  spans: readonly T[],
  minLength = 0,
): Columned<T>[] {
  const drawnEnd = (s: T) => Math.max(s.end, s.start + minLength);
  const sorted = [...spans].sort((a, b) => a.start - b.start || drawnEnd(b) - drawnEnd(a));
  const out: Columned<T>[] = [];
  let cluster: Columned<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const close = () => {
    for (const placed of cluster) placed.columns = columnEnds.length;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const span of sorted) {
    if (span.start >= clusterEnd) close();
    let column = columnEnds.findIndex((end) => end <= span.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(drawnEnd(span));
    } else {
      columnEnds[column] = drawnEnd(span);
    }
    cluster.push({ ...span, column, columns: 1 });
    clusterEnd = cluster.length === 1 ? drawnEnd(span) : Math.max(clusterEnd, drawnEnd(span));
  }
  close();
  return out;
}

/**
 * The wall-clock span of an item on `date` in `zone`, or null when it does not
 * touch that day. An item that starts the day before begins at 0; one that
 * runs past midnight ends at 1440.
 */
export function bookingSpanOnDay(item: Times, date: string, zone: string): DaySpan | null {
  const dayStart = zonedToUtc(date, '00:00', zone).getTime();
  const dayEnd = zonedToUtc(addDaysLocal(date, 1), '00:00', zone).getTime();
  const s = Date.parse(item.startsAt);
  const e = Date.parse(item.endsAt);
  if (!(s < dayEnd && e > dayStart)) return null;
  const start = s <= dayStart ? 0 : utcToZoned(item.startsAt, zone).minuteOfDay;
  let end = e >= dayEnd ? DAY_MINUTES : utcToZoned(item.endsAt, zone).minuteOfDay;
  // The repeated autumn hour can put the wall-clock end before the start.
  if (end <= start) end = Math.min(DAY_MINUTES, start + Math.round((e - s) / MINUTE_MS));
  return { start, end };
}

export type DayBlock<T> = Columned<DaySpan & { item: T }>;

/** One day's blocks: every item touching `date` (cancelled and blocked time included), clipped to it, in columns. */
export function layoutBookingDay<T extends Times>(
  items: readonly T[],
  date: string,
  zone: string,
  minLength = 0,
): DayBlock<T>[] {
  const spans = items.flatMap((item) => {
    const span = bookingSpanOnDay(item, date, zone);
    return span ? [{ ...span, item }] : [];
  });
  return assignBookingColumns(spans, minLength);
}

/** Where the day grid opens (§6.2): an hour before now on today, else 06:00. */
export function initialScheduleScrollMinute(isToday: boolean, nowMinute: number): number {
  if (!isToday) return SCHEDULE_FIRST_MINUTE;
  return Math.max(0, nowMinute - 60);
}

// ─── Windows (the API's rules) ────────────────────────────────────────────────

const opensAt = (b: Pick<TrainerBookingDto, 'startsAt'>) =>
  Date.parse(b.startsAt) - BOOKING_START_EARLY_MIN * MINUTE_MS;

/** A live booking (not blocked time, not cancelled): it has Start and attendance. */
export function bookingHasStart(booking: Pick<TrainerBookingDto, 'kind' | 'cancelledAt'>): boolean {
  return booking.kind === 'BOOKING' && !booking.cancelledAt;
}

/**
 * Start (the coached logger) opens BOOKING_START_EARLY_MIN minutes before the
 * start and has no end, for a live booking that still has a client.
 */
export function canStartBooking(
  booking: Pick<TrainerBookingDto, 'kind' | 'startsAt' | 'cancelledAt' | 'clients'>,
  now: Date,
): boolean {
  return (
    bookingHasStart(booking) && booking.clients.length > 0 && now.getTime() >= opensAt(booking)
  );
}

/** Attendance can be marked from BOOKING_START_EARLY_MIN minutes before the start (as the API allows). */
export function canMarkAttendance(
  booking: Pick<TrainerBookingDto, 'kind' | 'startsAt' | 'cancelledAt'>,
  now: Date,
): boolean {
  return bookingHasStart(booking) && now.getTime() >= opensAt(booking);
}

/** Edit, move and cancel only before the start (the API answers "already started" after). */
export function canChangeBooking(
  booking: Pick<TrainerBookingDto, 'startsAt' | 'cancelledAt'>,
  now: Date,
): boolean {
  return !booking.cancelledAt && now.getTime() < Date.parse(booking.startsAt);
}

/** Tapping the marked state again clears it (SCHEDULED undoes a mark). */
export function nextAttendance(
  current: TrainerBookingDto['clients'][number]['attendance'],
  tapped: 'ATTENDED' | 'NO_SHOW',
): 'ATTENDED' | 'NO_SHOW' | 'SCHEDULED' {
  return current === tapped ? 'SCHEDULED' : tapped;
}

/** Trainer Today's next-booking card (§6.1): today's next booking, else none (+ the next one later, as a link). */
export function todaysNextBooking<T extends Pick<TrainerBookingDto, 'startsAt'>>(
  next: T | null,
  zone: string,
  today: string,
): { today: T | null; later: T | null } {
  if (!next) return { today: null, later: null };
  return utcToZoned(next.startsAt, zone).date === today
    ? { today: next, later: null }
    : { today: null, later: next };
}

// ─── The editor's draft (§6.3) ────────────────────────────────────────────────

export interface BookingDraftClient {
  clientId: string;
  name: string;
  /** NEXT_DAY = "Their next routine day" (sent as no ref). */
  workout: BookingWorkoutRef;
}

export interface BookingDraft {
  kind: BookingKind;
  clients: BookingDraftClient[];
  /** Local date + `HH:MM` in the device zone. */
  date: string;
  time: string;
  durationMin: number;
  repeat: 'NONE' | 'WEEKLY';
  /** Last date of a weekly repeat; null = the default 12 weeks. */
  until: string | null;
  location: string;
  note: string;
}

export type BookingPatch = {
  date?: string;
  time?: string;
  timeZone?: string;
  durationMin?: number;
  clients?: { clientId: string; workout?: BookingWorkoutRef }[];
  location?: string | null;
  note?: string | null;
};

export type UpdateBookingPayload = {
  bookingId: string;
  expectedVersion: number;
  scope: BookingScope;
  patch: BookingPatch;
};

export const DEFAULT_BOOKING_DURATION_MIN = 60;
/** A new booking on another day than today starts at 18:00. */
export const DEFAULT_BOOKING_TIME = '18:00';

/**
 * Where a new booking starts (both apps): on today (or `date` null) the next
 * full hour — never a time already past, so 23:30 gives tomorrow 00:00 — and
 * 18:00 on any other day.
 */
export function newBookingSlot(
  date: string | null,
  now: Date,
  zone: string,
): { date: string; time: string } {
  const z = utcToZoned(now, zone);
  if (date !== null && date !== z.date) return { date, time: DEFAULT_BOOKING_TIME };
  const hour = Math.floor(z.minuteOfDay / 60) + 1;
  if (hour >= 24) return { date: addDaysLocal(z.date, 1), time: '00:00' };
  return { date: z.date, time: `${String(hour).padStart(2, '0')}:00` };
}

export function newBookingDraft(input: {
  date: string;
  time: string;
  durationMin?: number;
  location?: string | null;
  clients?: { clientId: string; name: string }[];
}): BookingDraft {
  return {
    kind: 'BOOKING',
    clients: (input.clients ?? []).map((c) => ({ ...c, workout: { kind: 'NEXT_DAY' } })),
    date: input.date,
    time: input.time,
    durationMin: input.durationMin ?? DEFAULT_BOOKING_DURATION_MIN,
    repeat: 'NONE',
    until: null,
    location: input.location ?? '',
    note: '',
  };
}

/** The draft an existing booking opens with (its time in the device zone). */
export function bookingDraftFrom(booking: TrainerBookingDto, zone: string): BookingDraft {
  const start = utcToZoned(booking.startsAt, zone);
  return {
    kind: booking.kind,
    clients: booking.clients.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      workout:
        c.workout.kind === 'ROUTINE_DAY' && c.workout.routineDayId
          ? { kind: 'ROUTINE_DAY', routineDayId: c.workout.routineDayId }
          : { kind: 'NEXT_DAY' },
    })),
    date: start.date,
    time: start.time,
    durationMin: booking.durationMin,
    repeat: booking.seriesId ? 'WEEKLY' : 'NONE',
    until: null,
    location: booking.location ?? '',
    note: booking.note ?? '',
  };
}

export function isDraftFull(draft: Pick<BookingDraft, 'clients'>): boolean {
  return draft.clients.length >= TRAINER_MODE_LIMITS.clientsPerBooking;
}

/** Adds (with their next routine day) or removes a client; never more than 6. */
export function toggleDraftClient(
  draft: BookingDraft,
  client: { clientId: string; name: string },
): BookingDraft {
  if (draft.clients.some((c) => c.clientId === client.clientId)) {
    return { ...draft, clients: draft.clients.filter((c) => c.clientId !== client.clientId) };
  }
  if (isDraftFull(draft)) return draft;
  return { ...draft, clients: [...draft.clients, { ...client, workout: { kind: 'NEXT_DAY' } }] };
}

export function setDraftClientWorkout(
  draft: BookingDraft,
  clientId: string,
  workout: BookingWorkoutRef,
): BookingDraft {
  return {
    ...draft,
    clients: draft.clients.map((c) => (c.clientId === clientId ? { ...c, workout } : c)),
  };
}

export const isChipDuration = (min: number) =>
  (BOOKING_DURATION_CHIPS as readonly number[]).includes(min);

export function isValidBookingDuration(min: number): boolean {
  return (
    Number.isInteger(min) &&
    min >= BOOKING_DURATION_LIMITS.min &&
    min <= BOOKING_DURATION_LIMITS.max
  );
}

/** The default end of a weekly repeat: `defaultWeeklyRepeats` (12) occurrences. */
export function defaultRepeatUntil(first: string): string {
  return addDaysLocal(first, 7 * (TRAINER_MODE_LIMITS.defaultWeeklyRepeats - 1));
}

/** The latest end of a weekly repeat: `weeklyRepeats` (52) occurrences. */
export function maxRepeatUntil(first: string): string {
  return addDaysLocal(first, 7 * (TRAINER_MODE_LIMITS.weeklyRepeats - 1));
}

export type BookingDraftErrors = Partial<
  Record<'clients' | 'date' | 'time' | 'duration' | 'until' | 'location' | 'note', string>
>;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every reason the draft cannot be saved yet, by field (empty = it can). */
export function validateBookingDraft(draft: BookingDraft): BookingDraftErrors {
  const v = BOOKING_COPY.editor.validation;
  const errors: BookingDraftErrors = {};
  if (draft.kind === 'BOOKING' && draft.clients.length === 0) {
    errors.clients = BOOKING_COPY.editor.needsClient;
  }
  if (draft.clients.length > TRAINER_MODE_LIMITS.clientsPerBooking) {
    errors.clients = BOOKING_COPY.editor.clientsMax(TRAINER_MODE_LIMITS.clientsPerBooking);
  }
  if (!LOCAL_DATE.test(draft.date)) errors.date = v.date;
  if (!localTimeSchema.safeParse(draft.time).success) errors.time = v.time;
  if (!isValidBookingDuration(draft.durationMin)) {
    errors.duration = v.duration(BOOKING_DURATION_LIMITS.min, BOOKING_DURATION_LIMITS.max);
  }
  if (draft.repeat === 'WEEKLY' && draft.until !== null) {
    if (!LOCAL_DATE.test(draft.until) || draft.until < draft.date) {
      errors.until = v.until;
    } else if (draft.until > maxRepeatUntil(draft.date)) {
      errors.until = v.maxWeeks(TRAINER_MODE_LIMITS.weeklyRepeats);
    }
  }
  if (draft.location.trim().length > TRAINER_MODE_LIMITS.locationMaxChars) {
    errors.location = v.maxChars(TRAINER_MODE_LIMITS.locationMaxChars);
  }
  if (draft.note.trim().length > TRAINER_MODE_LIMITS.noteMaxChars) {
    errors.note = v.maxChars(TRAINER_MODE_LIMITS.noteMaxChars);
  }
  return errors;
}

function participants(draft: BookingDraft): { clientId: string; workout?: BookingWorkoutRef }[] {
  if (draft.kind === 'BLOCK') return [];
  return draft.clients.map((c) =>
    c.workout.kind === 'NEXT_DAY'
      ? { clientId: c.clientId }
      : { clientId: c.clientId, workout: c.workout },
  );
}

const textOrNull = (s: string) => (s.trim() === '' ? null : s.trim());

/** `trainer.bookings.create` input, made in the device zone. Blocked time sends no clients. */
export function toCreateBookingInput(draft: BookingDraft, zone: string): CreateBookingInput {
  return {
    kind: draft.kind,
    date: draft.date,
    time: draft.time,
    timeZone: zone,
    durationMin: draft.durationMin,
    clients: participants(draft),
    location: textOrNull(draft.location),
    note: textOrNull(draft.note),
    repeat:
      draft.repeat === 'WEEKLY'
        ? draft.until
          ? { rule: 'WEEKLY', until: draft.until }
          : { rule: 'WEEKLY' }
        : null,
  };
}

const workoutKey = (w: BookingWorkoutRef | undefined) => JSON.stringify(w ?? { kind: 'NEXT_DAY' });

function sameClients(a: BookingDraft, b: BookingDraft): boolean {
  if (a.clients.length !== b.clients.length) return false;
  return a.clients.every((c) => {
    const other = b.clients.find((o) => o.clientId === c.clientId);
    return other !== undefined && workoutKey(other.workout) === workoutKey(c.workout);
  });
}

/** A move to a new local date and time: it takes the device zone. */
export function moveBookingPatch(date: string, time: string, zone: string): BookingPatch {
  return { date, time, timeZone: zone };
}

/**
 * Only what changed (empty = nothing to save). A booking moved to a new date
 * or time takes the device zone; any other edit keeps the booking's own zone
 * (so editing the note of a booking made elsewhere never moves it).
 */
export function toBookingPatch(
  draft: BookingDraft,
  original: BookingDraft,
  zone: string,
): BookingPatch {
  const patch: BookingPatch = {};
  if (draft.date !== original.date || draft.time !== original.time) {
    Object.assign(patch, moveBookingPatch(draft.date, draft.time, zone));
  }
  if (draft.durationMin !== original.durationMin) patch.durationMin = draft.durationMin;
  if (draft.kind === 'BOOKING' && !sameClients(original, draft))
    patch.clients = participants(draft);
  if (draft.location.trim() !== original.location.trim()) {
    patch.location = textOrNull(draft.location);
  }
  if (draft.note.trim() !== original.note.trim()) patch.note = textOrNull(draft.note);
  return patch;
}

/** `trainer.bookings.update` input; the scope only matters for a series. */
export function toUpdateBookingInput(
  booking: Pick<TrainerBookingDto, 'id' | 'version' | 'seriesId'>,
  original: BookingDraft,
  draft: BookingDraft,
  scope: BookingScope,
  zone: string,
): UpdateBookingPayload {
  return {
    bookingId: booking.id,
    expectedVersion: booking.version,
    scope: booking.seriesId ? scope : 'THIS',
    patch: toBookingPatch(draft, original, zone),
  };
}

export function hasBookingChanges(payload: { patch: BookingPatch }): boolean {
  return Object.keys(payload.patch).length > 0;
}

/**
 * "Overlaps with 18:00 Maria" lines (§6.3) for the live bookings and blocked
 * time the draft's first occurrence overlaps (the edited booking excluded),
 * soonest first. Saving stays allowed.
 */
export function bookingOverlapWarnings(
  draft: Pick<BookingDraft, 'date' | 'time' | 'durationMin'>,
  bookings: readonly TrainerBookingDto[],
  zone: string,
  excludeId: string | null = null,
): string[] {
  if (!LOCAL_DATE.test(draft.date) || !localTimeSchema.safeParse(draft.time).success) return [];
  const startsAt = zonedToUtc(draft.date, draft.time, zone);
  return bookings
    .filter(
      (b) =>
        b.id !== excludeId &&
        !b.cancelledAt &&
        intervalsOverlap({ startsAt, durationMin: draft.durationMin }, b),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((b) => BOOKING_COPY.editor.overlaps(bookingTime(b.startsAt, zone), bookingWho(b)));
}

// ─── Clients tab (§6.4) ───────────────────────────────────────────────────────

/** "Next booking: Today, 18:00" / "Next booking: Tue 21 Oct, 18:00". */
export function clientRowNextBooking(
  row: Pick<ClientRowDto, 'nextBookingAt'>,
  zone: string,
  today: string,
): string | null {
  return row.nextBookingAt
    ? BOOKING_COPY.today.nextOn(bookingDayWhen(row.nextBookingAt, zone, today))
    : null;
}

// ─── The client's side (§6.9, §10): never another client's name ──────────────

/** The card's booking: the next one not cancelled and not ended, starting within CLIENT_BOOKING_CARD_DAYS. */
export function nextClientCardBooking(
  bookings: readonly ClientBookingDto[],
  now: Date,
): ClientBookingDto | null {
  const t = now.getTime();
  return (
    [...bookings]
      .filter(
        (b) =>
          !b.cancelledAt &&
          Date.parse(b.endsAt) > t &&
          Date.parse(b.startsAt) <= t + CLIENT_BOOKING_CARD_DAYS * DAY_MS,
      )
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null
  );
}

/** "with 1 other" for a group booking, else null. */
export function bookingOthersText(booking: Pick<ClientBookingDto, 'otherClients'>): string | null {
  return booking.otherClients > 0 ? BOOKING_COPY.client.withOthers(booking.otherClients) : null;
}

/** "Today 18:00" / "Tue 18:00" in `zone` (the card's "when"). */
export function clientCardWhen(startsAt: string, zone: string, today: string): string {
  const z = utcToZoned(startsAt, zone);
  return `${z.date === today ? BOOKING_COPY.schedule.today : weekdayName(z.weekday)} ${z.time}`;
}

/** "Session with Ana · Tue 18:00 · Gym Fit Center · with 1 other". */
export function clientCardText(booking: ClientBookingDto, zone: string, today: string): string {
  return [
    BOOKING_COPY.client.card(booking.trainer.name, clientCardWhen(booking.startsAt, zone, today)),
    booking.location,
    bookingOthersText(booking),
  ]
    .filter(Boolean)
    .join(' · ');
}

// ─── Local reminders (§7.3) ───────────────────────────────────────────────────

export const BOOKING_REMINDER_APP_TAG = 'booking-reminder';

export type BookingReminderRole = 'client' | 'trainer';

export type BookingReminderPlan = {
  /** Keyed by role + booking id, so a re-sync replaces exactly that booking's reminder. */
  identifier: string;
  bookingId: string;
  role: BookingReminderRole;
  at: Date;
  body: string;
};

export function bookingReminderIdentifier(role: BookingReminderRole, bookingId: string): string {
  return `${BOOKING_REMINDER_APP_TAG}:${role}:${bookingId}`;
}

const LEAD_MS = TRAINER_MODE_LIMITS.reminderLeadMin * MINUTE_MS;

/** When to remind (60 minutes before), or null when that is past or the booking is beyond 14 days. */
function reminderAt(startsAt: string, now: Date): Date | null {
  const start = Date.parse(startsAt);
  if (start - LEAD_MS <= now.getTime()) return null;
  if (start > now.getTime() + BOOKING_REMINDER_DAYS * DAY_MS) return null;
  return new Date(start - LEAD_MS);
}

/** The client's reminders: live bookings starting in the next 14 days, "Session with Ana in 1 hour". */
export function planClientReminders(
  bookings: readonly ClientBookingDto[],
  now: Date,
): BookingReminderPlan[] {
  return bookings.flatMap((b) => {
    const at = b.cancelledAt ? null : reminderAt(b.startsAt, now);
    if (!at) return [];
    return [
      {
        identifier: bookingReminderIdentifier('client', b.id),
        bookingId: b.id,
        role: 'client' as const,
        at,
        body: BOOKING_COPY.reminders.clientBody(b.trainer.name),
      },
    ];
  });
}

/** The trainer's reminders: their live bookings (not blocked time) in the next 14 days, "18:00 Maria · Lower body A". */
export function planTrainerReminders(
  bookings: readonly TrainerBookingDto[],
  now: Date,
  zone: string,
): BookingReminderPlan[] {
  return bookings.flatMap((b) => {
    const live = b.kind === 'BOOKING' && !b.cancelledAt && b.clients.length > 0;
    const at = live ? reminderAt(b.startsAt, now) : null;
    if (!at) return [];
    return [
      {
        identifier: bookingReminderIdentifier('trainer', b.id),
        bookingId: b.id,
        role: 'trainer' as const,
        at,
        body: BOOKING_COPY.reminders.trainerBody(
          bookingTime(b.startsAt, zone),
          bookingWho(b),
          bookingWhat(b),
        ),
      },
    ];
  });
}
