import { TRPCError } from '@trpc/server';
import { followRepository, Prisma, type Follow, type IFollowRepository } from '@chefer/database';
import type { FriendUserSummary, Page, Relation } from '@chefer/types';
import { followOutcome, relationOf } from '@chefer/utils';
import { profileNotAvailableError } from '../../lib/friends-errors.js';
import {
  activityService,
  friendSummaryHydrator,
  pageOf,
  runSocialTx,
  toKeyset,
  type ActivityService,
  type FriendSummaryHydrator,
  type SocialTx,
} from './activity.service.js';
import {
  socialAccessService,
  type SocialAccessMemo,
  type SocialAccessService,
} from './social-access.service.js';
import { suggestionService, type SuggestionInvalidator } from './suggestion.service.js';

// ─── Following: the follow lifecycle (PRD §6.2, FR-07, FR-12; plan §4.4) ──────
//
//   follow          NONE → FOLLOWING (public: NEW_FOLLOWER to the owner)
//                   NONE → REQUESTED (private or forced private: FOLLOW_REQUEST)
//   unfollow        FOLLOWING → NONE, or cancel REQUESTED → NONE (the
//                   FOLLOW_REQUEST item is withdrawn)
//   accept          REQUESTED → FOLLOWING (REQUEST_ACCEPTED to the requester)
//   decline         REQUESTED → NONE (silent; the owner's FOLLOW_REQUEST item
//                   stays and reads "You declined", UX §7.2)
//   removeFollower  FOLLOWING → NONE (silent)
//
// Everything is idempotent (FR-12.5): following twice returns the current
// relation, accepting/declining/removing something that isn't there is `ok`.
// Following yourself is a BAD_REQUEST (plan §4.4); following a blocked,
// un-activated or unknown user is NOT_FOUND `Profile not available` through
// SocialAccessService (INV-3, FR-12.6).
//
// Requests are capped at 3 per (viewer, target) per 7 days (PRD §6.2). A
// cancelled or declined request deletes its row, so the cap can't be counted
// from the table: it is a keyed sliding-window limiter here, in process
// memory (the API is single-instance, the same assumption as
// lib/rate-limit.ts). It has its own store so its 7-day window is never swept
// early by the shared limiter's shorter windows.

export const REQUEST_CAP = { max: 3, windowMs: 7 * 86_400_000 } as const;

/** Sliding-window limiter with ONE fixed window, keyed by any string. */
export class KeyedWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit for `key` unless it is over the cap; returns whether it was allowed. */
  tryConsume(key: string): boolean {
    const now = this.now();
    this.sweep(now);
    const live = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (live.length >= this.max) {
      this.hits.set(key, live);
      return false;
    }
    live.push(now);
    this.hits.set(key, live);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 3_600_000) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

export type FollowServiceRepository = Pick<
  IFollowRepository,
  | 'find'
  | 'create'
  | 'accept'
  | 'delete'
  | 'deletePending'
  | 'listFollowing'
  | 'listFollowers'
  | 'listPendingTo'
  | 'counts'
>;

export interface FriendsPageInput {
  cursor?: string | undefined;
  limit: number;
}

export type FriendsListDto = Page<FriendUserSummary> & { total: number };

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

function relationFromEdge(edge: Follow | null): Relation {
  return relationOf({ isSelf: false, outgoing: edge?.status ?? null });
}

export class FollowService {
  constructor(
    private readonly follows: FollowServiceRepository = followRepository,
    private readonly access: Pick<SocialAccessService, 'assert' | 'profile'> = socialAccessService,
    private readonly activity: Pick<ActivityService, 'notify' | 'withdraw'> = activityService,
    private readonly suggestions: SuggestionInvalidator = suggestionService,
    private readonly hydrator: FriendSummaryHydrator = friendSummaryHydrator,
    private readonly tx: SocialTx = runSocialTx,
    private readonly requestCap: KeyedWindowLimiter = new KeyedWindowLimiter(
      REQUEST_CAP.max,
      REQUEST_CAP.windowMs,
    ),
  ) {}

  /** Follow, or ask to (PRD FR-12.1/12.2). Returns the resulting relation — the client's truth. */
  async follow(
    viewerId: string,
    targetId: string,
    memo?: SocialAccessMemo,
  ): Promise<{ relation: Relation }> {
    if (viewerId === targetId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You can’t follow yourself.' });
    }
    const access = await this.access.assert(viewerId, targetId, 'header', memo);
    if (access.outgoing === 'ACCEPTED') return { relation: 'following' };
    if (access.outgoing === 'PENDING') return { relation: 'requested' };

    const owner = await this.access.profile(targetId, memo);
    if (!owner) throw profileNotAvailableError();
    // A forced-private profile stores PRIVATE, but check the flag too: a
    // moderated account never gets an instant follow.
    const status =
      owner.forcedPrivateAt !== null || followOutcome(owner.visibility) === 'request'
        ? 'PENDING'
        : 'ACCEPTED';
    if (status === 'PENDING' && !this.requestCap.tryConsume(`${viewerId}:${targetId}`)) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'You’ve asked to follow this person several times this week. Try again later.',
      });
    }

    try {
      await this.tx(async (db) => {
        await this.follows.create({ followerId: viewerId, followeeId: targetId, status }, db);
        if (status === 'PENDING') {
          await this.activity.notify(targetId, 'FOLLOW_REQUEST', viewerId, db);
        } else {
          await this.activity.notify(targetId, 'NEW_FOLLOWER', viewerId, db);
          // An old declined request's item would otherwise read "You accepted".
          await this.activity.withdraw(targetId, 'FOLLOW_REQUEST', viewerId, db);
        }
      });
    } catch (err) {
      // A concurrent follow of the same pair won the insert: report its state.
      if (!isPrismaCode(err, 'P2002')) throw err;
      return { relation: relationFromEdge(await this.follows.find(viewerId, targetId)) };
    } finally {
      memo?.clear();
      this.suggestions.invalidate(viewerId);
    }
    return { relation: status === 'ACCEPTED' ? 'following' : 'requested' };
  }

  /**
   * Unfollow, or cancel a request (withdrawing its Activity item). No access
   * check: it only ever removes the caller's own edge, so it works (as a
   * no-op) after a block too. Idempotent.
   */
  async unfollow(viewerId: string, targetId: string): Promise<{ relation: 'none' }> {
    if (viewerId === targetId) return { relation: 'none' };
    const edge = await this.follows.find(viewerId, targetId);
    if (edge) {
      await this.tx(async (db) => {
        await this.follows.delete(viewerId, targetId, db);
        if (edge.status === 'PENDING') {
          await this.activity.withdraw(targetId, 'FOLLOW_REQUEST', viewerId, db);
        }
      });
    }
    this.suggestions.invalidate(viewerId);
    return { relation: 'none' };
  }

  /** Accept `requesterId`'s request to `ownerId` (FR-07). Idempotent. */
  async accept(ownerId: string, requesterId: string): Promise<{ ok: true }> {
    if (ownerId === requesterId) return { ok: true };
    await this.tx(async (db) => {
      const accepted = await this.follows.accept(requesterId, ownerId, db);
      if (accepted) await this.activity.notify(requesterId, 'REQUEST_ACCEPTED', ownerId, db);
    });
    this.suggestions.invalidate(ownerId);
    return { ok: true };
  }

  /**
   * Decline (silent). Only a PENDING edge is removed — a late "decline" never
   * removes an accepted follower. The owner's FOLLOW_REQUEST item stays and
   * reads `requestState: 'declined'`. Idempotent.
   */
  async decline(ownerId: string, requesterId: string): Promise<{ ok: true }> {
    if (ownerId !== requesterId) await this.follows.deletePending(requesterId, ownerId);
    return { ok: true };
  }

  /** Remove a follower (silent, FR-12.4). Idempotent. */
  async removeFollower(ownerId: string, followerId: string): Promise<{ ok: true }> {
    if (ownerId !== followerId) await this.follows.delete(followerId, ownerId);
    this.suggestions.invalidate(ownerId);
    return { ok: true };
  }

  /** `You follow` (accepted edges out), newest first. */
  listFollowing(viewerId: string, input: FriendsPageInput): Promise<FriendsListDto> {
    return this.list(
      viewerId,
      input,
      (cursor, take) => this.follows.listFollowing(viewerId, cursor, take),
      (f) => f.followeeId,
      'following',
    );
  }

  /** `Followers` (accepted edges in), newest first. */
  listFollowers(viewerId: string, input: FriendsPageInput): Promise<FriendsListDto> {
    return this.list(
      viewerId,
      input,
      (cursor, take) => this.follows.listFollowers(viewerId, cursor, take),
      (f) => f.followerId,
      'followers',
    );
  }

  /** Requests to review (pending edges in), newest first. */
  listRequests(viewerId: string, input: FriendsPageInput): Promise<FriendsListDto> {
    return this.list(
      viewerId,
      input,
      (cursor, take) => this.follows.listPendingTo(viewerId, cursor, take),
      (f) => f.followerId,
      'pendingRequests',
    );
  }

  /** One page: the edges, then users + edges both ways for the page's ids (plan §4.5). */
  private async list(
    viewerId: string,
    input: FriendsPageInput,
    fetch: (cursor: { createdAt: Date; id: string } | null, take: number) => Promise<Follow[]>,
    otherOf: (f: Follow) => string,
    totalKey: 'following' | 'followers' | 'pendingRequests',
  ): Promise<FriendsListDto> {
    const [rows, counts] = await Promise.all([
      fetch(toKeyset(input.cursor), input.limit + 1),
      this.follows.counts(viewerId),
    ]);
    const ids = rows.slice(0, input.limit).map(otherOf);
    const people = await this.hydrator.hydrate(viewerId, ids);
    const page = pageOf(
      rows,
      input.limit,
      (f) => f,
      (pageRows) =>
        pageRows.flatMap((f) => {
          const s = people.summary(otherOf(f));
          return s ? [s] : [];
        }),
    );
    return { ...page, total: counts[totalKey] };
  }
}

export const followService = new FollowService();
