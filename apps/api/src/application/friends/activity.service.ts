import {
  followRepository,
  notificationRepository,
  prisma,
  socialProfileRepository,
  type Follow,
  type IFollowRepository,
  type INotificationRepository,
  type ISocialProfileRepository,
  type NotificationKind,
  type SocialDbClient,
  type SocialUserRow,
} from '@chefer/database';
import type { ActivityItemDto, FriendUserSummary, Page } from '@chefer/types';
import { decodeCursor, encodeCursor } from '@chefer/utils';
import { toFriendUserSummary } from './friend-dto.mappers.js';

// ─── Following: Activity inbox + the shared person-row hydration ──────────────
// (docs/friends/implementation-plan.md §4.4 activity.service, §4.5; PRD §12,
// FR-20; UX §7.2.)
//
// This is the leaf of the L-GRAPH services (it depends on repositories only),
// so it also holds the two helpers every other graph service needs:
//   - `FriendSummaryHydrator`: one page of user ids → `FriendUserSummary`s in
//     two queries (public user fields + the follow edges both ways), built
//     field by field — never an email (INV-6), never a spread row (INV-2).
//   - `SocialTx`: the transaction runner, injected so tests run without a DB.

/** Runs `fn` inside one DB transaction (tests pass `fn => fn(fakeTx)`). */
export type SocialTx = <T>(fn: (tx: SocialDbClient) => Promise<T>) => Promise<T>;

export const runSocialTx: SocialTx = (fn) => prisma.$transaction((tx) => fn(tx));

// ─── Cursors (unsigned, untrusted: a tampered cursor restarts at the top) ─────

export function toKeyset(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const decoded = decodeCursor(cursor);
  return decoded ? { createdAt: decoded.date, id: decoded.id } : null;
}

/** `nextCursor` for a newest-first page fetched with `take: limit + 1`. */
export function pageOf<R, T>(
  rows: R[],
  limit: number,
  keyOf: (row: R) => { createdAt: Date; id: string },
  map: (rows: R[]) => T[],
): Page<T> {
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeCursor(keyOf(last).createdAt, keyOf(last).id) : null;
  return { items: map(pageRows), nextCursor };
}

// ─── FriendUserSummary ────────────────────────────────────────────────────────

/**
 * The one person-row DTO for a user seen by `viewerId`, from the follow rows
 * between them (`edges`, either direction; extra rows are ignored). Built by
 * the allow-list mapper (friend-dto.mappers.ts, INV-2/INV-6): this only works
 * out the relation from the edges, so there is ONE `FriendUserSummary` builder.
 */
export function summaryFromEdges(
  user: SocialUserRow,
  viewerId: string,
  edges: readonly Follow[],
): FriendUserSummary {
  const outgoing = edges.find((e) => e.followerId === viewerId && e.followeeId === user.id);
  const incoming = edges.find((e) => e.followerId === user.id && e.followeeId === viewerId);
  return toFriendUserSummary(user, {
    isSelf: user.id === viewerId,
    outgoing: outgoing?.status ?? null,
    incoming: incoming?.status ?? null,
  });
}

export type HydratorProfileRepository = Pick<ISocialProfileRepository, 'findUsers'>;
export type HydratorFollowRepository = Pick<IFollowRepository, 'findEdgesWith'>;

/** A page of person rows: users + edges, in two queries (plan §4.5). */
export interface HydratedPeople {
  users: Map<string, SocialUserRow>;
  edges: Follow[];
  summary(userId: string): FriendUserSummary | null;
}

export class FriendSummaryHydrator {
  constructor(
    private readonly profiles: HydratorProfileRepository = socialProfileRepository,
    private readonly follows: HydratorFollowRepository = followRepository,
  ) {}

  async hydrate(viewerId: string, userIds: readonly string[]): Promise<HydratedPeople> {
    const ids = [...new Set(userIds)];
    const [users, edges] = await Promise.all([
      this.profiles.findUsers(ids),
      this.follows.findEdgesWith(viewerId, ids),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const byOther = new Map<string, Follow[]>();
    for (const e of edges) {
      const other = e.followerId === viewerId ? e.followeeId : e.followerId;
      byOther.set(other, [...(byOther.get(other) ?? []), e]);
    }
    return {
      users: byId,
      edges,
      summary: (userId) => {
        const user = byId.get(userId);
        return user ? summaryFromEdges(user, viewerId, byOther.get(userId) ?? []) : null;
      },
    };
  }

  /** Summaries in `userIds` order; ids whose user row is gone are dropped. */
  async summaries(viewerId: string, userIds: readonly string[]): Promise<FriendUserSummary[]> {
    const people = await this.hydrate(viewerId, userIds);
    return userIds.flatMap((id) => {
      const s = people.summary(id);
      return s ? [s] : [];
    });
  }
}

export const friendSummaryHydrator = new FriendSummaryHydrator();

// ─── Activity ─────────────────────────────────────────────────────────────────

export type ActivityNotificationRepository = Pick<
  INotificationRepository,
  'upsertSocial' | 'withdraw' | 'list' | 'unreadCount' | 'markReadUpTo'
>;

export interface ActivityListInput {
  cursor?: string | undefined;
  limit: number;
}

/**
 * The in-app inbox (no push, no email — PRD §12). Three kinds:
 *   FOLLOW_REQUEST   to a private owner; `requestState` is read from the LIVE
 *                    Follow (requester → owner): PENDING → 'pending', ACCEPTED
 *                    → 'accepted', gone → 'declined'. Cancel withdraws the
 *                    item (FollowService), so "gone" means the owner declined
 *                    (UX §7.2: "You declined").
 *   NEW_FOLLOWER     to a public owner.
 *   REQUEST_ACCEPTED to the requester.
 * Blocks withdraw every item between the pair (BlockService), and turning
 * Following off deletes them both ways, so the inbox never names someone the
 * viewer can't see.
 */
export class ActivityService {
  constructor(
    private readonly notifications: ActivityNotificationRepository = notificationRepository,
    private readonly hydrator: FriendSummaryHydrator = friendSummaryHydrator,
  ) {}

  /** Upserts one item (fresh createdAt, unread). Pass `db` to join a transaction. */
  async notify(
    recipientId: string,
    kind: NotificationKind,
    actorId: string,
    db?: SocialDbClient,
  ): Promise<void> {
    if (recipientId === actorId) return;
    await this.notifications.upsertSocial({ userId: recipientId, kind, actorId }, db);
  }

  /** Removes one item (e.g. a cancelled request). Idempotent. */
  async withdraw(
    recipientId: string,
    kind: NotificationKind,
    actorId: string,
    db?: SocialDbClient,
  ): Promise<void> {
    await this.notifications.withdraw(recipientId, kind, actorId, db);
  }

  async list(viewerId: string, input: ActivityListInput): Promise<Page<ActivityItemDto>> {
    const rows = await this.notifications.list(viewerId, toKeyset(input.cursor), input.limit + 1);
    const pageRows = rows.slice(0, input.limit);
    const people = await this.hydrator.hydrate(
      viewerId,
      pageRows.map((n) => n.actorId),
    );
    return pageOf(
      rows,
      input.limit,
      (n) => n,
      (page) =>
        page.flatMap((n): ActivityItemDto[] => {
          const actor = people.summary(n.actorId);
          if (!actor) return []; // the actor's account is gone (cascade race)
          const item: ActivityItemDto = {
            id: n.id,
            kind: n.kind,
            actor,
            createdAt: n.createdAt,
            readAt: n.readAt,
          };
          if (n.kind === 'FOLLOW_REQUEST') {
            const live = people.edges.find(
              (e) => e.followerId === n.actorId && e.followeeId === viewerId,
            );
            item.requestState =
              live?.status === 'PENDING'
                ? 'pending'
                : live?.status === 'ACCEPTED'
                  ? 'accepted'
                  : 'declined';
          }
          return [item];
        }),
    );
  }

  unreadCount(viewerId: string): Promise<number> {
    return this.notifications.unreadCount(viewerId);
  }

  /** Marks items up to `upTo` read and returns what's still unread (newer items). */
  async markReadUpTo(viewerId: string, upTo: Date): Promise<{ unreadActivity: number }> {
    await this.notifications.markReadUpTo(viewerId, upTo);
    return { unreadActivity: await this.notifications.unreadCount(viewerId) };
  }
}

export const activityService = new ActivityService();
