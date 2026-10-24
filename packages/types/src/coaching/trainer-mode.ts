import { z } from 'zod';
import { localDateSchema } from '../gym/schemas';
import type { SessionsDeliveredDto, TrainerBookingDto } from './bookings';

// ─── Trainer mode (docs/prd-2026-10/trainer-mode.md) ──────────────────────────
// The second app shell for coaching: Schedule · Clients · Today · Workouts ·
// You. Behind the `trainerMode` flag, for active trainers only. The mode is a
// per-device choice (mobile KV, web `chefer_mode` cookie), never stored on the
// server. One place for the feature's numbers, API shapes and shared copy.

/** Spec §8.5. Change here only. */
export const TRAINER_MODE_LIMITS = {
  templatesPerTrainer: 200,
  /** Spec §6.6 says 30; a routine day holds at most 20 (the routine doc schema), and a template is copied into one. */
  exercisesPerTemplate: 20,
  templateNameMaxChars: 40,
  clientsPerBooking: 6,
  /** A weekly repeat runs 12 weeks unless the trainer picks an end date. */
  defaultWeeklyRepeats: 12,
  weeklyRepeats: 52,
  /** Bookings can be made this many days ahead. */
  bookingHorizonDays: 365,
  locationMaxChars: 60,
  noteMaxChars: 200,
  /** O-5: fixed in v1. */
  reminderLeadMin: 60,
  /** Clients shows a search field from this many clients (§6.4). */
  clientSearchFrom: 8,
  /** `trainer.badges` is polled this often in the foreground (§7.1), like `friends.me`. */
  badgePollMs: 60_000,
} as const;

/** The two app shells (§4). `personal` is Chefer as it is for anyone. */
export type AppShellMode = 'personal' | 'trainer';

// ─── trainer.badges (§7.1) ────────────────────────────────────────────────────

/**
 * One count source for every trainer badge: the Clients tab (requests), and in
 * personal mode the You tab and the "Switch to trainer mode" row (`total`).
 * `unmarkedAttendance` and `bookingChanges` stay 0 until bookings exist (M3).
 */
export interface TrainerBadgesDto {
  /** Pending coaching requests. */
  requests: number;
  /** Past bookings with a client still marked SCHEDULED. */
  unmarkedAttendance: number;
  /** Unread booking notices on the trainer's side. */
  bookingChanges: number;
  /** The sum: what personal mode's badges show. */
  total: number;
  /**
   * Additive (lane K4): clients who went quiet since the trainer last looked at Today (the Today
   * tab's badge). Not part of `total`: installed bundles never clear it.
   */
  quietClients?: number;
}

// ─── trainer.dashboard.summary (§6.1, Q8) ─────────────────────────────────────

export const trainerDashboardInputSchema = z.object({
  /** The trainer's device-local date: "this week" and "last 7 days" are judged from it. */
  today: localDateSchema,
});
export type TrainerDashboardInput = z.infer<typeof trainerDashboardInputSchema>;

/** A client with nothing logged for COACHING_LIMITS.inactiveDays or more. */
export interface TrainerQuietClientDto {
  clientId: string;
  name: string;
  /** Device-local date of the last completed workout, or null. */
  lastWorkoutDate: string | null;
  /** Lane K4: days with nothing logged (workouts; food while shared). Was workouts only. */
  inactiveDays: number;
}

export interface TrainerDashboardSummaryDto {
  activeClients: number;
  /** COACHING_LIMITS.maxActiveClients: "23 of 50". */
  maxClients: number;
  requestsWaiting: number;
  /**
   * Average over clients with a weekly goal of min(1, completed sessions in the
   * last 7 days ÷ weekly goal), 0–1. Null when no client has a goal.
   */
  averageAdherence: number | null;
  /** Most inactive first. Lane K4: by the trainer's `quietAfterDays`, food included while shared. */
  quietClients: TrainerQuietClientDto[];
  /** Additive (lane K4): the trainer's threshold ("3+ days with nothing logged"). */
  quietAfterDays?: number;
  /** Bookings this week (scheduled vs done; blocked time and cancelled ones excluded). Null from an M1 server. */
  bookingsThisWeek: { scheduled: number; done: number } | null;
  /** Additive (M3): the next booking that has not ended, today or later. */
  nextBooking?: TrainerBookingDto | null;
  /** Additive (M3): the rest of today's bookings after `nextBooking`. */
  todayBookings?: TrainerBookingDto[];
  /** Additive (M3): past bookings with a client still SCHEDULED ("Mark attendance"). */
  unmarkedAttendance?: TrainerBookingDto[];
  /** Additive (M3): attended bookings this calendar month, per current client. */
  sessionsDelivered?: SessionsDeliveredDto[];
}

// ─── Copy shared by web and mobile ────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const TRAINER_MODE_COPY = {
  mode: {
    personal: 'Personal mode',
    trainer: 'Trainer mode',
    switchToTrainer: 'Switch to trainer mode',
    switchToPersonal: 'Switch to personal mode',
    /** Announced after a switch (§12 accessibility). */
    switched: (to: AppShellMode) => (to === 'trainer' ? 'Trainer mode' : 'Personal mode'),
    /** The badge's spoken count on the switch row. */
    waiting: (n: number) => `${n} ${plural(n, 'thing', 'things')} waiting`,
    /** Web's third ModeSwitch segment. */
    trainerSegment: 'Trainer',
  },
  tabs: {
    schedule: 'Schedule',
    clients: 'Clients',
    today: 'Today',
    workouts: 'Workouts',
    you: 'You',
  },
  today: {
    title: 'Today',
    requestsCard: (n: number) => `${n} ${plural(n, 'person', 'people')} asked you to coach them`,
    review: 'Review',
    thisWeek: 'This week',
    activeClients: 'Active clients',
    activeOf: (max: number) => `of ${max}`,
    adherence: 'Average adherence',
    adherenceHint: 'Sessions done ÷ weekly goal, last 7 days',
    noAdherence: 'No goals yet',
    quietClients: 'Quiet clients',
    quietHint: (days: number) => `${days}+ days without a workout`,
    bookingsThisWeek: 'Bookings this week',
    bookingsDone: (done: number, scheduled: number) => `${done} done · ${scheduled} scheduled`,
    needsAttention: 'Needs attention',
    allCaughtUp: 'Nothing needs you right now.',
    quietRow: (days: number) => `${days} ${plural(days, 'day', 'days')} without a workout`,
    lastWorkout: (date: string) => `Last workout ${date}`,
    noWorkoutYet: 'No workout yet',
    emptyTitle: 'Welcome to trainer mode',
    emptyBody: 'Invite your first client, then build a template you can give to anyone.',
    inviteClient: 'Invite a client',
    buildTemplate: 'Build a template',
    addBooking: 'Add a booking',
    lastUpdated: (time: string) => `Last updated ${time}`,
  },
  clients: {
    title: 'Clients',
    capacity: (n: number, max: number) => `${n} of ${max} clients`,
    search: 'Search clients',
    searchEmpty: (q: string) => `No client matches “${q}”.`,
    sortLabel: 'Sort by',
    sortName: 'Name',
    sortLastWorkout: 'Last workout',
  },
  you: {
    title: 'You',
    profile: 'Trainer profile',
    invites: 'Invites',
    invitesHint: 'Link and QR code',
    availability: 'Availability',
    accepting: 'Accepting new clients',
    notAccepting: (max: number) => `Not accepting new clients (${max} is the limit)`,
    availabilityHint: 'This closes on its own at the client limit.',
    feedback: 'Send feedback',
    turnOff: 'Turn off trainer tools',
  },
} as const;
