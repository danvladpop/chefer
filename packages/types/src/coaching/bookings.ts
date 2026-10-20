import { z } from 'zod';
import type { ExerciseDto, NextWorkoutDto, UpsertSessionsResultDto } from '../gym';
import { localDateSchema, workoutSessionDocSchema } from '../gym/schemas';
import { timeZoneSchema } from '../preferences';
import { coachingClientIdSchema } from './schemas';
import { TRAINER_MODE_LIMITS } from './trainer-mode';

// ─── Bookings, blocked time and coached workouts (trainer-mode.md §6.2–§6.7, §8.2, §8.3, §9; M3) ──
// A BOOKING is a slot in the trainer's calendar with 1–6 active clients; BLOCKED
// TIME is a slot with none. Times are stored as a UTC instant plus the IANA zone
// the slot was made in; weekly repeats are materialised as ordinary rows,
// computed in that zone (`weeklyOccurrences`, @chefer/utils), so 18:00 stays
// 18:00 across DST. Inputs carry the wall-clock date + time + zone; outputs
// carry ISO instants plus the zone.
//
// A COACHED WORKOUT is a normal WorkoutSession the trainer logged on the
// client's behalf (`loggedById` = the trainer, set by the server). Finishing it
// marks that client ATTENDED on the booking.

export const BOOKING_KINDS = ['BOOKING', 'BLOCK'] as const;
export const bookingKindSchema = z.enum(BOOKING_KINDS);
export type BookingKind = z.infer<typeof bookingKindSchema>;

export const BOOKING_ATTENDANCE = ['SCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED'] as const;
export const bookingAttendanceSchema = z.enum(BOOKING_ATTENDANCE);
export type BookingAttendance = z.infer<typeof bookingAttendanceSchema>;

/** Which occurrences of a weekly series an edit or cancel touches. */
export const bookingScopeSchema = z.enum(['THIS', 'FOLLOWING']);
export type BookingScope = z.infer<typeof bookingScopeSchema>;

export const bookingIdSchema = z.string().min(1).max(64);
export const bookingIdInputSchema = z.object({ bookingId: bookingIdSchema });

/** `HH:MM`, 5-minute steps (the time picker's grid). */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5][05]$/, 'Expected HH:MM in 5-minute steps');

export const BOOKING_DURATION_CHIPS = [30, 45, 60, 90] as const;
/** A booking lasts 15–240 minutes (the editor's custom duration and the API agree). */
export const BOOKING_DURATION_LIMITS = { min: 15, max: 240 } as const;
export const bookingDurationSchema = z
  .number()
  .int()
  .min(BOOKING_DURATION_LIMITS.min)
  .max(BOOKING_DURATION_LIMITS.max);

/**
 * What the client will do in the slot (§6.3):
 * - NEXT_DAY: "their next routine day" (the default; resolved when the workout starts);
 * - ROUTINE_DAY: a specific day of their active routine;
 * - TEMPLATE: one of the trainer's templates — ASSIGNED on save (added as a new
 *   routine day, §6.6) and stored from then on as that ROUTINE_DAY.
 */
export const bookingWorkoutRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NEXT_DAY') }),
  z.object({ kind: z.literal('ROUTINE_DAY'), routineDayId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('TEMPLATE'), templateId: z.string().min(1).max(64) }),
]);
export type BookingWorkoutRef = z.infer<typeof bookingWorkoutRefSchema>;

export const bookingParticipantInputSchema = z.object({
  clientId: coachingClientIdSchema,
  /** Omitted = NEXT_DAY. */
  workout: bookingWorkoutRefSchema.optional(),
});

/** Optional free text; trimmed; empty = none. */
const locationSchema = z.string().trim().max(TRAINER_MODE_LIMITS.locationMaxChars);
const noteSchema = z.string().trim().max(TRAINER_MODE_LIMITS.noteMaxChars);

export const bookingRepeatSchema = z
  .object({
    /** Weekly on the same weekday and local time. */
    rule: z.literal('WEEKLY'),
    /** Last local date (inclusive). Omitted = `TRAINER_MODE_LIMITS.defaultWeeklyRepeats` weeks. */
    until: localDateSchema.optional(),
  })
  .nullable();

export const createBookingInputSchema = z
  .object({
    kind: bookingKindSchema,
    /** Wall-clock start in `timeZone` (the trainer's device zone). */
    date: localDateSchema,
    time: localTimeSchema,
    timeZone: timeZoneSchema,
    durationMin: bookingDurationSchema,
    /** BOOKING: 1–6 active clients. BLOCK: none. */
    clients: z.array(bookingParticipantInputSchema).max(TRAINER_MODE_LIMITS.clientsPerBooking),
    location: locationSchema.nullable().optional(),
    /** Shown to the client(s): "Bring your belt". */
    note: noteSchema.nullable().optional(),
    repeat: bookingRepeatSchema.optional(),
  })
  .refine((b) => (b.kind === 'BLOCK' ? b.clients.length === 0 : b.clients.length > 0), {
    message: 'A booking needs at least one client; blocked time has none',
  });
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

/** Fields an edit can change; omitted = unchanged. A series edit with FOLLOWING splits the series. */
export const bookingPatchSchema = z.object({
  date: localDateSchema.optional(),
  time: localTimeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  durationMin: bookingDurationSchema.optional(),
  clients: z
    .array(bookingParticipantInputSchema)
    .max(TRAINER_MODE_LIMITS.clientsPerBooking)
    .optional(),
  location: locationSchema.nullable().optional(),
  note: noteSchema.nullable().optional(),
});

export const updateBookingInputSchema = z.object({
  bookingId: bookingIdSchema,
  /** The booking's version as read (CONFLICT `{ kind: 'booking', current }` when stale). */
  expectedVersion: z.number().int().min(1),
  /** Ignored for a one-off booking. */
  scope: bookingScopeSchema.default('THIS'),
  patch: bookingPatchSchema,
});

export const cancelBookingInputSchema = z.object({
  bookingId: bookingIdSchema,
  scope: bookingScopeSchema.default('THIS'),
  /** The clients see it. */
  reason: noteSchema.nullable().optional(),
});

/** `trainer.bookings.range`: one week (or a day) of the calendar in a single call (§12). */
export const bookingRangeInputSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((r) => Date.parse(r.to) > Date.parse(r.from), { message: 'to must be after from' })
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 43 * 24 * 60 * 60 * 1000, {
    message: 'At most six weeks at a time',
  });

export const markAttendanceInputSchema = z.object({
  bookingId: bookingIdSchema,
  clientId: coachingClientIdSchema,
  /** SCHEDULED undoes a mark. */
  attendance: z.enum(['ATTENDED', 'NO_SHOW', 'SCHEDULED']),
});

/** `trainer.client.bookings` (client detail → Bookings tab, §6.5). */
export const clientBookingsInputSchema = z.object({
  clientId: coachingClientIdSchema,
  /** The trainer's device-local date ("this month" / "last month" are judged from it). */
  today: localDateSchema,
});

// ─── Coached workouts (§6.7, §8.3) ────────────────────────────────────────────

/** `trainer.coach.start`: the client's prescription, the same shape the client's own logger gets. */
export const coachStartInputSchema = z.object({
  clientId: coachingClientIdSchema,
  /** The booking being coached; omitted for "Log a workout for Maria" with no booking. */
  bookingId: bookingIdSchema.optional(),
  /** The trainer's device-local date. */
  today: localDateSchema,
});

/**
 * `trainer.coach.sync`: upserts coached sessions for ONE active client through
 * the client's normal session sync (progression, rotation, PRs). The server
 * sets `loggedById` from the caller and treats every set as a confirmed load.
 */
export const coachSyncInputSchema = z.object({
  clientId: coachingClientIdSchema,
  docs: z
    .array(workoutSessionDocSchema.extend({ bookingId: bookingIdSchema.nullable().optional() }))
    .min(1)
    .max(20),
});

// ─── Outputs ──────────────────────────────────────────────────────────────────

/** What the booking's client will train, as the trainer sees it. */
export interface BookingWorkoutDto {
  kind: 'NEXT_DAY' | 'ROUTINE_DAY';
  routineDayId: string | null;
  /** "Lower body A"; null for NEXT_DAY until resolved. */
  name: string | null;
}

export interface TrainerBookingClientDto {
  clientId: string;
  name: string;
  attendance: BookingAttendance;
  workout: BookingWorkoutDto;
  /** The coached workout logged for this booking, if any. */
  workoutSessionId: string | null;
}

export interface TrainerBookingDto {
  id: string;
  kind: BookingKind;
  /** Part of a weekly series ("This booking / This and following" applies). */
  seriesId: string | null;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  /** The zone it was made in: "In Europe/Bucharest time" when it differs from the device's. */
  timeZone: string;
  location: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  version: number;
  /** Clients the trainer still coaches; a former client's row is left out (§9). */
  clients: TrainerBookingClientDto[];
}

export interface BookingRangeDto {
  bookings: TrainerBookingDto[];
}

/** The client's view of one of their bookings: never another client's name (§10). */
export interface ClientBookingDto {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  timeZone: string;
  trainer: { name: string };
  location: string | null;
  note: string | null;
  /** The routine day name, when one is set ("Lower body A"). */
  workoutName: string | null;
  /** Other clients in the same slot: "with 1 other". */
  otherClients: number;
  /** Cancelled bookings stay listed until they start, greyed, with the reason. */
  cancelledAt: string | null;
  cancelReason: string | null;
}

/** `trainer.coach.start`. */
export interface CoachStartDto {
  client: { id: string; name: string; unit: 'KG' | 'LB' };
  /** The client's prescription for the booking's (or next) routine day; null when they have no routine. */
  workout: NextWorkoutDto | null;
  /** Exercise metadata for the workout's rows (names, tracking types, increments). */
  exercises: ExerciseDto[];
  bookingId: string | null;
}

export type CoachSyncResultDto = UpsertSessionsResultDto;

/** `trainer.client.bookings`: one client's bookings with this trainer. */
export interface TrainerClientBookingsDto {
  /** Not yet ended, soonest first (cancelled ones included, greyed). */
  upcoming: TrainerBookingDto[];
  /** Ended, newest first, the last 90 days. */
  past: TrainerBookingDto[];
  /** Attended bookings in the trainer's current / previous calendar month. */
  deliveredThisMonth: number;
  deliveredLastMonth: number;
}

/** Sessions delivered this month (§6.1, O-4): bookings marked attended, per client. */
export interface SessionsDeliveredDto {
  clientId: string;
  name: string;
  count: number;
}

// ─── Copy shared by web and mobile ────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const BOOKING_COPY = {
  schedule: {
    title: 'Schedule',
    day: 'Day',
    week: 'Week',
    today: 'Today',
    add: 'Add a booking',
    empty: 'Nothing booked',
    otherZone: (zone: string) => `In ${zone} time`,
    groupName: (first: string, others: number) => (others > 0 ? `${first} + ${others}` : first),
    blocked: 'Blocked',
    cancelled: 'Cancelled',
    lastUpdated: (time: string) => `Last updated ${time}`,
    offline: 'You’re offline. Adding and changing bookings needs a connection.',
    /** Full label for a calendar block (§12): "Tuesday 18:00 to 19:00, Maria, Lower body A". */
    blockLabel: (when: string, who: string, what: string | null) =>
      [when, who, what].filter(Boolean).join(', '),
    /** The spoken "when" of a block: "Tuesday 18:00 to 19:00". */
    when: (weekday: string, start: string, end: string) => `${weekday} ${start} to ${end}`,
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    view: 'View',
    days: 'Days',
  },
  editor: {
    newTitle: 'New booking',
    editTitle: 'Edit booking',
    type: 'Type',
    booking: 'Booking',
    block: 'Blocked time',
    clients: 'Clients',
    clientsMax: (max: number) => `Up to ${max} clients`,
    date: 'Date',
    start: 'Start',
    duration: 'Duration',
    minutes: (n: number) => `${n} min`,
    custom: 'Custom',
    repeat: 'Repeat',
    noRepeat: 'Doesn’t repeat',
    weekly: 'Every week',
    until: 'Until',
    weeksDefault: (n: number) => `For ${n} weeks`,
    workout: 'Workout',
    nextDay: 'Their next routine day',
    template: 'A template',
    location: 'Location',
    note: 'Note for the client',
    noteHint: 'Your clients see this.',
    overlaps: (time: string, who: string) => `Overlaps with ${time} ${who}`,
    save: 'Save',
    scopeTitle: 'Change repeating booking',
    thisOnly: 'This booking',
    following: 'This and following',
    needsClient: 'Pick at least one client.',
    /** A date stepper's buttons: "Date: earlier" / "Date: later". */
    earlier: (field: string) => `${field}: earlier`,
    later: (field: string) => `${field}: later`,
    /** Under the custom duration field: "min · 15–240". */
    customHint: (min: number, max: number) => `min · ${min}–${max}`,
    customLabel: (min: number, max: number) => `Duration (${min}–${max} min)`,
    validation: {
      date: 'Pick a date.',
      time: 'Pick a start time in 5-minute steps.',
      duration: (min: number, max: number) => `Between ${min} and ${max} minutes.`,
      until: 'Pick a date after the first booking.',
      maxWeeks: (n: number) => `At most ${n} weeks.`,
      maxChars: (n: number) => `Up to ${n} characters.`,
    },
  },
  detail: {
    title: 'Booking',
    start: 'Start',
    edit: 'Edit',
    cancel: 'Cancel booking',
    cancelTitle: 'Cancel this booking?',
    cancelReason: 'Reason (optional, clients see it)',
    cancelConfirm: 'Cancel booking',
    keep: 'Keep',
    attendance: 'Attendance',
    attended: 'Attended',
    noShow: 'No-show',
    scheduled: 'Not marked',
    markAttendance: 'Mark attendance',
    loggedByYou: 'Logged by you',
    startAvailable: (min: number) => `Start opens ${min} minutes before`,
  },
  today: {
    nextBooking: 'Next booking',
    /** A client row / the Today link: "Next booking: Tue 21 Oct, 18:00". */
    nextOn: (when: string) => `Next booking: ${when}`,
    noBookingsToday: 'No bookings today',
    todaysBookings: 'Later today',
    unmarked: (n: number) => `${n} past ${plural(n, 'booking needs', 'bookings need')} attendance`,
    sessionsDelivered: 'Sessions delivered this month',
    sessionsDeliveredFooter: 'Counts bookings you marked as attended.',
    sessionsDeliveredRow: (name: string, n: number) => `${name} · ${n}`,
    bookingsStat: 'Bookings this week',
  },
  clientDetail: {
    tab: 'Bookings',
    upcoming: 'Upcoming',
    past: 'Past',
    deliveredThisMonth: (n: number) => `${n} delivered this month`,
    deliveredLastMonth: (n: number) => `${n} last month`,
    addBooking: 'Add a booking',
    logWorkout: (name: string) => `Log a workout for ${name}`,
  },
  coach: {
    header: (name: string) => `Coaching ${name}`,
    finish: 'Finish',
    finishThis: (name: string) => `Finish ${name}’s workout`,
    finishAll: 'Finish everyone',
    noRoutine: (name: string) => `${name} has no routine yet.`,
    loggedBy: (trainer: string) => `Logged by ${trainer}`,
    loggedByYou: 'Logged by you',
    miniBar: (name: string) => `Coaching ${name}`,
    starting: 'Getting their workout ready…',
    needsConnection: 'Starting this workout needs a connection the first time.',
    needsConnectionBody: 'Open the booking once while online and it will start offline after that.',
    setUpRoutine: (name: string) => `Set up ${name}’s routine`,
    allLogged: 'Everyone’s workout is logged',
    saved: (name: string) => `${name}’s workout is saved.`,
    waitingToUpload: (name: string) => `${name}’s workout is finished and waiting to upload.`,
    /** Finish everyone leaves out clients with nothing ticked. */
    leftOut: (names: readonly string[]) =>
      `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} no sets ticked and won’t be saved with Finish everyone.`,
    unticked: (n: number, name: string) =>
      `${n} of ${name}’s ${plural(n, 'set is', 'sets are')} not ticked. They won’t count.`,
    finishTitle: 'Finish workouts',
    keepGoing: 'Keep going',
    back: 'Back',
    switcherLabel: 'Clients in this booking',
  },
  client: {
    card: (trainer: string, when: string) => `Session with ${trainer} · ${when}`,
    withOthers: (n: number) => `with ${n} ${plural(n, 'other', 'others')}`,
    upcoming: 'Upcoming bookings',
    none: 'No bookings coming up.',
    detailTitle: 'Your booking',
    cancelled: 'Cancelled',
  },
  reminders: {
    setting: 'Booking reminders',
    settingHint: 'A reminder an hour before each booking.',
    off: 'Booking reminders are off',
    clientBody: (trainer: string) => `Session with ${trainer} in 1 hour`,
    trainerBody: (time: string, who: string, what: string | null) =>
      [`${time} ${who}`, what].filter(Boolean).join(' · '),
  },
  notices: {
    created: (trainer: string, when: string) => `${trainer} booked you for ${when}`,
    createdSeries: (trainer: string, when: string) =>
      `${trainer} booked you for ${when}, every week`,
    changed: (trainer: string, when: string) => `${trainer} moved your booking to ${when}`,
    cancelled: (trainer: string, when: string) => `${trainer} cancelled your booking on ${when}`,
    coachedWorkout: (trainer: string) => `${trainer} logged a workout for you`,
    consentUpdate: (trainer: string) => `What’s new with ${trainer}: bookings and logged workouts`,
    consentUpdateBody: (trainer: string) =>
      `${trainer} can now book sessions with you and log workouts for you. You can leave at any time.`,
    leave: 'Leave',
    gotIt: 'Got it',
  },
  server: {
    notFound: 'This booking isn’t available.',
    clientUnavailable: 'One of these clients isn’t available.',
    horizon: (days: number) => `Bookings can be made up to ${days} days ahead.`,
    badZone: 'Unknown time zone.',
    past: 'This booking has already started.',
  },
} as const;

/** The coaching notices bookings and coached workouts add (§7.1). Clients at API level < 8 never receive them. */
export const BOOKING_NOTICE_KINDS = [
  'BOOKING_CREATED',
  'BOOKING_CHANGED',
  'BOOKING_CANCELLED',
  'COACHED_WORKOUT_LOGGED',
] as const;
export type BookingNoticeKind = (typeof BOOKING_NOTICE_KINDS)[number];

/** Upcoming bookings a client sees on Today/Train: the next one within this many days. */
export const CLIENT_BOOKING_CARD_DAYS = 7;
/** Local reminders are scheduled for bookings in the next N days (§7.3). */
export const BOOKING_REMINDER_DAYS = 14;
/** Start opens this many minutes before the start time (§6.1). */
export const BOOKING_START_EARLY_MIN = 15;
