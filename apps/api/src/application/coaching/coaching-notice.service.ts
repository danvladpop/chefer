import { z } from 'zod';
import {
  notificationRepository,
  trainerProfileRepository,
  socialProfileRepository,
  type CoachingNotificationKindDb,
  type INotificationRepository,
  type ISocialProfileRepository,
  type ITrainerProfileRepository,
  type Notification,
} from '@chefer/database';
import {
  COACHING_LIMITS,
  FALLBACK_TRAINER_NAME,
  type CoachingNoticeDto,
  type CoachingNoticeKind,
  type RoutineChange,
} from '@chefer/types';
import { displayNameOf, mergeRoutineChanges } from '@chefer/utils';

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
//
// A notice never blocks the action that caused it: a failed write is logged
// (no names, no ids) and swallowed. When the other account is being deleted,
// the notice is written with the recipient as its own actor (the actor's
// rows cascade away with the account) and the name kept in the payload.

const KIND_TO_DTO: Record<CoachingNotificationKindDb, CoachingNoticeKind> = {
  COACHING_REQUEST: 'REQUEST_RECEIVED',
  COACHING_REQUEST_ACCEPTED: 'REQUEST_ACCEPTED',
  COACHING_REQUEST_DECLINED: 'REQUEST_DECLINED',
  COACHING_ROUTINE_UPDATED: 'ROUTINE_UPDATED',
  COACHING_ENDED: 'COACHING_ENDED',
};

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
});
type NoticePayload = z.infer<typeof payloadSchema>;

export interface CoachingNoticeDeps {
  notifications: Pick<
    INotificationRepository,
    'findCoaching' | 'upsertCoaching' | 'listCoaching' | 'markCoachingRead' | 'withdrawCoaching'
  >;
  trainers: Pick<ITrainerProfileRepository, 'findMany'>;
  users: Pick<ISocialProfileRepository, 'findUsers'>;
  now: () => Date;
}

const defaultDeps: CoachingNoticeDeps = {
  notifications: notificationRepository,
  trainers: trainerProfileRepository,
  users: socialProfileRepository,
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
      const unseen =
        existing?.readAt === null ? (readPayload(existing)?.changes ?? []) : [];
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
      // A stale "updated your routine" card from them is moot now.
      if (!gone) {
        await this.deps.notifications.withdrawCoaching(
          recipientId,
          'COACHING_ROUTINE_UPDATED',
          otherId,
        );
      }
    });
  }

  async requestReceived(trainerId: string, clientId: string): Promise<void> {
    await this.safely(() => this.write(trainerId, 'COACHING_REQUEST', clientId, { role: 'CLIENT' }));
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
      await this.deps.notifications.withdrawCoaching(trainerId, 'COACHING_REQUEST', clientId);
    });
  }

  /** `coaching.notices`: unread notices, and read ones from the last COACHING_LIMITS.noticeDays days. */
  async list(userId: string): Promise<CoachingNoticeDto[]> {
    const since = new Date(this.deps.now().getTime() - COACHING_LIMITS.noticeDays * DAY_MS);
    const rows = await this.deps.notifications.listCoaching(userId, since, LIST_LIMIT);
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

function readPayload(row: Notification): NoticePayload | null {
  const parsed = payloadSchema.safeParse(row.payload);
  return parsed.success ? parsed.data : null;
}

export const coachingNoticeService = new CoachingNoticeService();
