import { z } from 'zod';
import {
  notificationRepository,
  socialProfileRepository,
  trainerProfileRepository,
  type CoachingNotificationKindDb,
  type INotificationRepository,
  type ISocialProfileRepository,
  type ITrainerProfileRepository,
  type Notification,
} from '@chefer/database';
import {
  COACHING_LIMITS,
  FALLBACK_TRAINER_NAME,
  PUSH_COPY,
  TRAINER_MODE_API_LEVEL,
  type CoachingNoticeDto,
  type CoachingNoticeKind,
  type RoutineChange,
} from '@chefer/types';
import { bookingWhen, displayNameOf, mergeRoutineChanges } from '@chefer/utils';
import {
  pushService,
  type PushEnqueueInput,
  type PushService,
} from '../notifications/push.service.js';

// ─── Trainer coaching: in-app notices (PRD 2026-10 §4.2, §4.3) ────────────────
// Rows in the existing Notification table, with coaching kinds that
// `friends.activity` never lists (shipped apps' Activity inbox never meets an
// unknown kind). One row per (recipient, kind, other person): a new routine
// change folds into the unread card's change list; once the card is dismissed
// the next change starts a fresh list.
//
//   COACHING_REQUEST           trainer ← a client asked (withdrawn on cancel / answer)
//   COACHING_REQUEST_ACCEPTED  client  ← the trainer accepted
//   COACHING_REQUEST_DECLINED  client  ← the trainer declined
//   COACHING_ROUTINE_UPDATED   either  ← the other side changed the client's routine
//   COACHING_ENDED             either  ← the other side ended it, or the trainer stopped
//   COACHING_BOOKING_CREATED   client  ← the trainer booked them (one per series)       (level 8+)
//   COACHING_BOOKING_CHANGED   client  ← a booking moved or changed                      (level 8+)
//   COACHING_BOOKING_CANCELLED client  ← a booking was cancelled                         (level 8+)
//   COACHING_WORKOUT_LOGGED    client  ← the trainer logged a workout for them           (level 8+)
//
// Booking notices fold like the others: one row per (client, kind, trainer), so
// the newest booking of a kind replaces an older unread card.
//
// A notice never blocks the action that caused it: a failed write is logged
// (no names, no ids) and swallowed.
//
// Push (trainer-mode.md §7.2, M4): the §7.2 events also enqueue a push right
// after their notice row (PushService: switches, throttle, dedupe). Coaching
// notices are written AFTER the domain change commits (there is no
// transaction to join here), so the push is enqueued with the notice, not
// with the change; a failed enqueue never touches the notice. Pushes go one
// way only where §7.2 says so: routine changes trainer → client, "ended
// coaching" client → trainer. When the other account is being deleted,
// the notice is written with the recipient as its own actor (the actor's
// rows cascade away with the account) and the name kept in the payload.

const KIND_TO_DTO: Record<CoachingNotificationKindDb, CoachingNoticeKind> = {
  COACHING_REQUEST: 'REQUEST_RECEIVED',
  COACHING_REQUEST_ACCEPTED: 'REQUEST_ACCEPTED',
  COACHING_REQUEST_DECLINED: 'REQUEST_DECLINED',
  COACHING_ROUTINE_UPDATED: 'ROUTINE_UPDATED',
  COACHING_ENDED: 'COACHING_ENDED',
  COACHING_BOOKING_CREATED: 'BOOKING_CREATED',
  COACHING_BOOKING_CHANGED: 'BOOKING_CHANGED',
  COACHING_BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  COACHING_WORKOUT_LOGGED: 'COACHED_WORKOUT_LOGGED',
};

/** Trainer mode M3 (§9): kinds a mobile bundle below TRAINER_MODE_API_LEVEL never receives. */
const TRAINER_MODE_KINDS: readonly CoachingNotificationKindDb[] = [
  'COACHING_BOOKING_CREATED',
  'COACHING_BOOKING_CHANGED',
  'COACHING_BOOKING_CANCELLED',
  'COACHING_WORKOUT_LOGGED',
];

/** What a booking notice shows: when (instant + zone), whether it repeats, the cancel reason. */
export interface BookingNoticeRef {
  bookingId: string;
  startsAt: string;
  timeZone: string;
  weekly: boolean;
  reason: string | null;
}

const roleSchema = z.enum(['TRAINER', 'CLIENT']);
const changeSchema: z.ZodType<RoutineChange> = z.union([
  z.object({ kind: z.literal('added'), exercise: z.string() }),
  z.object({ kind: z.literal('removed'), exercise: z.string() }),
  z.object({
    kind: z.literal('changed'),
    exercise: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({ kind: z.literal('note'), exercise: z.string() }),
  z.object({ kind: z.literal('schedule') }),
  z.object({ kind: z.literal('created') }),
]);

/** The stored payload. Parsed at the read boundary; an unreadable row is skipped. */
const payloadSchema = z.object({
  /** What the OTHER person is to the recipient. */
  role: roleSchema,
  /** Set when the other account is gone (the row's actor is the recipient). */
  goneName: z.string().optional(),
  changes: z.array(changeSchema).optional(),
  endedBy: z.enum(['CLIENT', 'TRAINER', 'SYSTEM']).optional(),
  // Trainer mode M3: ids, times and the reason the trainer typed for the client — never a name.
  booking: z
    .object({
      bookingId: z.string(),
      startsAt: z.string(),
      timeZone: z.string(),
      weekly: z.boolean(),
      reason: z.string().nullable(),
    })
    .optional(),
  workoutSessionId: z.string().optional(),
});
type NoticePayload = z.infer<typeof payloadSchema>;

export interface CoachingNoticeDeps {
  notifications: Pick<
    INotificationRepository,
    'findCoaching' | 'upsertCoaching' | 'listCoaching' | 'markCoachingRead' | 'withdrawCoaching'
  >;
  trainers: Pick<ITrainerProfileRepository, 'findMany'>;
  users: Pick<ISocialProfileRepository, 'findUsers'>;
  push: Pick<PushService, 'enqueue'>;
  now: () => Date;
}

const defaultDeps: CoachingNoticeDeps = {
  notifications: notificationRepository,
  trainers: trainerProfileRepository,
  users: socialProfileRepository,
  push: pushService,
  now: () => new Date(),
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 30;

export class CoachingNoticeService {
  private readonly deps: CoachingNoticeDeps;

  constructor(deps: Partial<CoachingNoticeDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /**
   * `actorId` changed `recipientId`'s view of the client's routine. The changes
   * fold into the recipient's unread card; a dismissed card starts over.
   */
  async routineUpdated(
    recipientId: string,
    actorId: string,
    actorRole: 'TRAINER' | 'CLIENT',
    changes: readonly RoutineChange[],
  ): Promise<void> {
    if (changes.length === 0 || recipientId === actorId) return;
    await this.safely(async () => {
      const existing = await this.deps.notifications.findCoaching(
        recipientId,
        'COACHING_ROUTINE_UPDATED',
        actorId,
      );
      const unseen = existing?.readAt === null ? (readPayload(existing)?.changes ?? []) : [];
      const merged = mergeRoutineChanges(unseen, changes);
      if (merged.length === 0 && existing?.readAt === null) {
        // Everything went back to how the recipient last saw it.
        await this.deps.notifications.withdrawCoaching(
          recipientId,
          'COACHING_ROUTINE_UPDATED',
          actorId,
        );
        return;
      }
      if (merged.length === 0) return;
      await this.write(recipientId, 'COACHING_ROUTINE_UPDATED', actorId, {
        role: actorRole,
        changes: merged,
      });
      if (actorRole === 'TRAINER') {
        await this.push(async () => ({
          userId: recipientId,
          kind: 'ROUTINE_CHANGED_BY_TRAINER',
          actorId,
          payload: PUSH_COPY.routineChanged(await this.trainerName(actorId)),
        }));
      }
    });
  }

  /** The coaching between the two ended; `recipientRoleOfOther` is what the other person was to the recipient. */
  async ended(
    recipientId: string,
    otherId: string,
    otherRole: 'TRAINER' | 'CLIENT',
    endedBy: 'CLIENT' | 'TRAINER' | 'SYSTEM',
    opts: { otherGoneName?: string } = {},
  ): Promise<void> {
    await this.safely(async () => {
      const gone = opts.otherGoneName !== undefined;
      await this.write(recipientId, 'COACHING_ENDED', gone ? recipientId : otherId, {
        role: otherRole,
        endedBy,
        ...(gone && { goneName: opts.otherGoneName }),
      });
      // §7.2 "Maria ended coaching": the trainer hears when the CLIENT ended it.
      if (!gone && otherRole === 'CLIENT' && endedBy === 'CLIENT') {
        await this.push(async () => ({
          userId: recipientId,
          kind: 'COACHING_ENDED_FOR_TRAINER',
          actorId: otherId,
          payload: {
            ...PUSH_COPY.coachingEnded(await this.clientName(otherId)),
            data: { clientId: otherId },
          },
        }));
      }
      // A stale "updated your routine" (or "booked you") card from them is moot now.
      if (!gone) {
        for (const kind of [
          'COACHING_ROUTINE_UPDATED',
          'COACHING_BOOKING_CREATED',
          'COACHING_BOOKING_CHANGED',
        ] as const) {
          await this.deps.notifications.withdrawCoaching(recipientId, kind, otherId);
        }
      }
    });
  }

  /** Trainer mode M3: the trainer booked, moved or cancelled a booking of the client's. */
  async booking(
    clientId: string,
    trainerId: string,
    change: 'CREATED' | 'CHANGED' | 'CANCELLED',
    booking: BookingNoticeRef,
  ): Promise<void> {
    if (clientId === trainerId) return;
    const kind = (
      {
        CREATED: 'COACHING_BOOKING_CREATED',
        CHANGED: 'COACHING_BOOKING_CHANGED',
        CANCELLED: 'COACHING_BOOKING_CANCELLED',
      } as const
    )[change];
    await this.safely(async () => {
      await this.write(clientId, kind, trainerId, { role: 'TRAINER', booking });
      await this.push(async () => {
        const trainer = await this.trainerName(trainerId);
        // The time in the booking's own zone ("Tue 21 Oct, 18:00").
        const when = bookingWhen(booking.startsAt, booking.timeZone);
        const copy =
          change === 'CREATED'
            ? PUSH_COPY.bookingCreated(trainer, when)
            : change === 'CHANGED'
              ? PUSH_COPY.bookingChanged(trainer, when)
              : PUSH_COPY.bookingCancelled(trainer, when);
        return {
          userId: clientId,
          kind: 'BOOKING_CHANGED_FOR_CLIENT',
          actorId: trainerId,
          payload: { ...copy, data: { bookingId: booking.bookingId } },
        };
      });
      // A cancelled booking makes an unread "booked you" / "moved" card from the same booking moot.
      if (change === 'CANCELLED') {
        for (const stale of ['COACHING_BOOKING_CREATED', 'COACHING_BOOKING_CHANGED'] as const) {
          const row = await this.deps.notifications.findCoaching(clientId, stale, trainerId);
          if (row?.readAt === null && readPayload(row)?.booking?.bookingId === booking.bookingId) {
            await this.deps.notifications.withdrawCoaching(clientId, stale, trainerId);
          }
        }
      }
    });
  }

  /** Trainer mode M3: the trainer logged (finished) a workout for the client. */
  async coachedWorkoutLogged(
    clientId: string,
    trainerId: string,
    workoutSessionId: string,
  ): Promise<void> {
    if (clientId === trainerId) return;
    await this.safely(async () => {
      await this.write(clientId, 'COACHING_WORKOUT_LOGGED', trainerId, {
        role: 'TRAINER',
        workoutSessionId,
      });
      await this.push(async () => ({
        userId: clientId,
        kind: 'COACHED_WORKOUT_LOGGED',
        actorId: trainerId,
        payload: {
          ...PUSH_COPY.coachedWorkout(await this.trainerName(trainerId)),
          data: { workoutSessionId },
        },
      }));
    });
  }

  async requestReceived(trainerId: string, clientId: string): Promise<void> {
    await this.safely(async () => {
      await this.write(trainerId, 'COACHING_REQUEST', clientId, { role: 'CLIENT' });
      await this.push(async () => ({
        userId: trainerId,
        kind: 'COACHING_REQUEST_RECEIVED',
        actorId: clientId,
        payload: {
          ...PUSH_COPY.requestReceived(await this.clientName(clientId)),
          data: { clientId },
        },
      }));
    });
  }

  /** The request was cancelled, answered or expired: it leaves the trainer's notices. */
  async requestWithdrawn(trainerId: string, clientId: string): Promise<void> {
    await this.safely(async () => {
      await this.deps.notifications.withdrawCoaching(trainerId, 'COACHING_REQUEST', clientId);
    });
  }

  async requestAnswered(clientId: string, trainerId: string, accepted: boolean): Promise<void> {
    await this.safely(async () => {
      await this.write(
        clientId,
        accepted ? 'COACHING_REQUEST_ACCEPTED' : 'COACHING_REQUEST_DECLINED',
        trainerId,
        { role: 'TRAINER' },
      );
      await this.push(async () => ({
        userId: clientId,
        kind: 'COACHING_REQUEST_ANSWERED',
        actorId: trainerId,
        payload: PUSH_COPY.requestAnswered(await this.trainerName(trainerId), accepted),
      }));
      await this.deps.notifications.withdrawCoaching(trainerId, 'COACHING_REQUEST', clientId);
    });
  }

  /**
   * `coaching.notices`: unread notices, and read ones from the last
   * COACHING_LIMITS.noticeDays days. `level`: the caller's contract level
   * (web: Infinity); below TRAINER_MODE_API_LEVEL the booking and
   * coached-workout kinds are left out (§9).
   */
  async list(userId: string, level = 0): Promise<CoachingNoticeDto[]> {
    const since = new Date(this.deps.now().getTime() - COACHING_LIMITS.noticeDays * DAY_MS);
    const rows = await this.deps.notifications.listCoaching(
      userId,
      since,
      LIST_LIMIT,
      level >= TRAINER_MODE_API_LEVEL ? [] : TRAINER_MODE_KINDS,
    );
    const parsed = rows.flatMap((row) => {
      const payload = readPayload(row);
      return payload ? [{ row, payload }] : [];
    });
    const others = parsed.filter((p) => p.payload.goneName === undefined);
    const trainerIds = others.filter((p) => p.payload.role === 'TRAINER').map((p) => p.row.actorId);
    const clientIds = others.filter((p) => p.payload.role === 'CLIENT').map((p) => p.row.actorId);
    const [trainers, clients] = await Promise.all([
      this.deps.trainers.findMany([...new Set(trainerIds)]),
      clientIds.length > 0 ? this.deps.users.findUsers([...new Set(clientIds)]) : [],
    ]);
    const trainerName = new Map(trainers.map((t) => [t.userId, t.displayName]));
    const clientName = new Map(clients.map((u) => [u.id, displayNameOf(u)]));

    return parsed.map(({ row, payload }): CoachingNoticeDto => {
      const goneName = payload.goneName;
      const gone = goneName !== undefined;
      const name = gone
        ? goneName === ''
          ? FALLBACK_TRAINER_NAME
          : goneName
        : ((payload.role === 'TRAINER'
            ? trainerName.get(row.actorId)
            : clientName.get(row.actorId)) ?? FALLBACK_TRAINER_NAME);
      const kind = KIND_TO_DTO[row.kind as CoachingNotificationKindDb];
      return {
        id: row.id,
        kind,
        at: row.createdAt.toISOString(),
        read: row.readAt !== null,
        other: { id: gone ? null : row.actorId, name, role: payload.role },
        ...(kind === 'ROUTINE_UPDATED' && { changes: payload.changes ?? [] }),
        ...(kind === 'COACHING_ENDED' && payload.endedBy && { endedBy: payload.endedBy }),
        ...(payload.booking && kind.startsWith('BOOKING_') && { booking: payload.booking }),
        ...(kind === 'COACHED_WORKOUT_LOGGED' &&
          payload.workoutSessionId && { workoutSessionId: payload.workoutSessionId }),
      };
    });
  }

  /** `coaching.dismissNotice`. False when the id is not one of the caller's notices. */
  dismiss(userId: string, id: string): Promise<boolean> {
    return this.deps.notifications.markCoachingRead(userId, id);
  }

  private async write(
    recipientId: string,
    kind: CoachingNotificationKindDb,
    actorId: string,
    payload: NoticePayload,
  ): Promise<void> {
    await this.deps.notifications.upsertCoaching({ userId: recipientId, kind, actorId, payload });
  }

  /** Enqueue the notice's push. Never fails the notice: a failure is logged by kind only. */
  private async push(build: () => Promise<PushEnqueueInput>): Promise<void> {
    try {
      await this.deps.push.enqueue(await build());
    } catch (err) {
      console.warn('[coaching] push enqueue failed:', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** The trainer's display name for a push ("Ana"), "Your trainer" when unknown. */
  private async trainerName(trainerId: string): Promise<string> {
    const [profile] = await this.deps.trainers.findMany([trainerId]);
    return profile?.displayName ?? capitalize(FALLBACK_TRAINER_NAME);
  }

  /** The client's display name for a push (never the email). */
  private async clientName(clientId: string): Promise<string> {
    const [user] = await this.deps.users.findUsers([clientId]);
    return user ? displayNameOf(user) : displayNameOf({});
  }

  private async safely(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      // Never a name, a note or an id: the kind of failure only.
      // console, not lib/logger: this module is reached from gym code whose tests load no env.
      console.warn('[coaching] notice failed:', err instanceof Error ? err.name : 'unknown');
    }
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function readPayload(row: Notification): NoticePayload | null {
  const parsed = payloadSchema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

export const coachingNoticeService = new CoachingNoticeService();
