import {
  blockRepository,
  followRepository,
  Prisma,
  socialProfileRepository,
  suggestionDismissalRepository,
  type IBlockRepository,
  type IFollowRepository,
  type ISocialProfileRepository,
  type ISuggestionDismissalRepository,
} from '@chefer/database';
import { FRIENDS_LIMITS, type FriendUserSummary } from '@chefer/types';
import {
  displayNameOf,
  rankSuggestions,
  type SuggestionCandidate,
  type SuggestionReason,
} from '@chefer/utils';
import { friendSummaryHydrator, type FriendSummaryHydrator } from './activity.service.js';

// ─── Following: "Suggested for you" (PRD §11, FR-09; plan §4.4, §4.5) ─────────
// Computed on read from three sources, then scored and ordered by
// `rankSuggestions` (@chefer/utils, the PRD §11 formula incl. `featured`):
//   1. mutual connections — people followed by people I follow (accepted);
//   2. "Follows you"      — my followers I don't follow back;
//   3. Popular            — public, active in the last 30 days, ≥ 3 followers;
//                           Chefer Kitchen (`featured`) always eligible.
// Exclusions (§11.4): me; anyone I follow or have requested; blocked either
// way; dismissed in the last 90 days; forced private (moderation). The
// repositories exclude forced-private profiles in every source; the
// candidates' profiles are re-read here so a deactivated or forced-private
// account can't slip in.
//
// Cache: 10 minutes per viewer (FRIENDS_LIMITS.suggestionCacheMs), a bounded
// LRU in process memory (the API is single-instance, like lib/rate-limit.ts).
// The viewer's own follow / unfollow / dismiss / block invalidates it
// (FollowService, BlockService, `dismiss` below); moderation's forced private
// calls `invalidateAll()`. Other people's changes may take up to 10 minutes
// to show — a stale row fails safe (following a now-hidden person 404s).

export type SuggestionDto = FriendUserSummary & {
  reason: SuggestionReason;
  mutualCount: number;
  /** "Followed by {reasonName}" — the most recently followed mutual. Mutual reason only. */
  reasonName?: string;
};

/** The cache hook other graph services call after the viewer changes the graph. */
export interface SuggestionInvalidator {
  invalidate(userId: string): void;
  invalidateAll(): void;
}

/** How many candidates each source contributes before ranking. */
const SOURCE_POOL = 60;
const DAY_MS = 86_400_000;

interface CacheEntry {
  at: number;
  items: SuggestionDto[];
}

/** A tiny LRU with a TTL: Map insertion order is the recency order. */
export class SuggestionCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = FRIENDS_LIMITS.suggestionCacheMs,
    private readonly maxEntries = 5_000,
  ) {}

  get(key: string, now: number): SuggestionDto[] | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    this.entries.delete(key);
    if (now - hit.at >= this.ttlMs) return null;
    this.entries.set(key, hit); // most recently used
    return hit.items;
  }

  set(key: string, items: SuggestionDto[], now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { at: now, items });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export type SuggestionFollowRepository = Pick<
  IFollowRepository,
  'mutualCandidates' | 'followersNotFollowedBack' | 'followerCounts' | 'outgoingIds'
>;
export type SuggestionProfileRepository = Pick<ISocialProfileRepository, 'popular' | 'findMany'>;
export type SuggestionBlockRepository = Pick<IBlockRepository, 'blockedIdsEither'>;
export type SuggestionDismissalRepository = Pick<
  ISuggestionDismissalRepository,
  'activeIds' | 'upsert'
>;

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

export class SuggestionService implements SuggestionInvalidator {
  constructor(
    private readonly follows: SuggestionFollowRepository = followRepository,
    private readonly profiles: SuggestionProfileRepository = socialProfileRepository,
    private readonly blocks: SuggestionBlockRepository = blockRepository,
    private readonly dismissals: SuggestionDismissalRepository = suggestionDismissalRepository,
    private readonly hydrator: FriendSummaryHydrator = friendSummaryHydrator,
    private readonly cache: SuggestionCache = new SuggestionCache(),
    private readonly now: () => number = Date.now,
  ) {}

  /** Up to `limit` (≤ 30) suggestions, best first. */
  async list(viewerId: string, limit: number): Promise<SuggestionDto[]> {
    const capped = Math.max(0, Math.min(limit, FRIENDS_LIMITS.suggestionsAll));
    const cached = this.cache.get(viewerId, this.now());
    if (cached) return cached.slice(0, capped);
    const items = await this.compute(viewerId);
    this.cache.set(viewerId, items, this.now());
    return items.slice(0, capped);
  }

  /**
   * "×" on a suggestion: hidden for 90 days (FRIENDS_LIMITS.dismissalDays;
   * `list` reads dismissals newer than that). Idempotent; re-dismissing
   * refreshes the 90 days. Dismissing yourself or an unknown id is a no-op
   * `ok` — the same answer as any other id (no existence oracle).
   */
  async dismiss(viewerId: string, targetId: string): Promise<{ ok: true }> {
    if (viewerId !== targetId) {
      try {
        await this.dismissals.upsert(viewerId, targetId);
      } catch (err) {
        // P2003: the user id doesn't exist (FK). Same answer as a real dismiss.
        if (!isPrismaCode(err, 'P2003')) throw err;
      }
    }
    this.invalidate(viewerId);
    return { ok: true };
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private async compute(viewerId: string): Promise<SuggestionDto[]> {
    const now = this.now();
    const dismissedSince = new Date(now - FRIENDS_LIMITS.dismissalDays * DAY_MS);
    const activeSince = new Date(now - FRIENDS_LIMITS.popularActiveDays * DAY_MS);

    const [blocked, dismissed, outgoing] = await Promise.all([
      this.blocks.blockedIdsEither(viewerId),
      this.dismissals.activeIds(viewerId, dismissedSince),
      this.follows.outgoingIds(viewerId),
    ]);
    const exclude = [...new Set([viewerId, ...blocked, ...dismissed, ...outgoing])];
    const excluded = new Set(exclude);

    const [mutuals, followsYou, popular] = await Promise.all([
      this.follows.mutualCandidates(viewerId, SOURCE_POOL, exclude),
      this.follows.followersNotFollowedBack(viewerId, SOURCE_POOL, exclude),
      this.profiles.popular(FRIENDS_LIMITS.popularMinFollowers, activeSince, exclude, SOURCE_POOL),
    ]);

    const mutualBy = new Map(mutuals.map((m) => [m.userId, m]));
    const followsYouSet = new Set(followsYou);
    const popularBy = new Map(popular.map((p) => [p.profile.userId, p]));
    const ids = [...new Set([...mutualBy.keys(), ...followsYou, ...popularBy.keys()])].filter(
      (id) => !excluded.has(id),
    );
    if (ids.length === 0) return [];

    // Follower counts + featured + "still activated, not forced private" for
    // everyone the popular source didn't already describe.
    const others = ids.filter((id) => !popularBy.has(id));
    const [counts, profiles] = await Promise.all([
      this.follows.followerCounts(others),
      this.profiles.findMany(others),
    ]);
    const profileBy = new Map(profiles.map((p) => [p.userId, p]));

    const candidates: SuggestionCandidate[] = ids.flatMap((userId) => {
      const pop = popularBy.get(userId);
      const profile = pop?.profile ?? profileBy.get(userId);
      // Gone (turned Following off) or forced private since the source query.
      if (profile?.forcedPrivateAt !== null) return [];
      return [
        {
          userId,
          mutualCount: mutualBy.get(userId)?.mutualCount ?? 0,
          followsYou: followsYouSet.has(userId),
          followers: pop?.followerCount ?? counts.get(userId) ?? 0,
          featured: profile.featured,
          lastActiveAt: profile.updatedAt,
        },
      ];
    });

    const ranked = rankSuggestions(candidates, FRIENDS_LIMITS.suggestionsAll);
    const reasonIds = ranked.flatMap((r) =>
      r.reason === 'mutual' ? [mutualBy.get(r.userId)?.latestMutualId ?? ''] : [],
    );
    const people = await this.hydrator.hydrate(viewerId, [
      ...ranked.map((r) => r.userId),
      ...reasonIds.filter((id) => id !== ''),
    ]);

    return ranked.flatMap((r): SuggestionDto[] => {
      const summary = people.summary(r.userId);
      if (!summary) return [];
      const dto: SuggestionDto = { ...summary, reason: r.reason, mutualCount: r.mutualCount };
      if (r.reason === 'mutual') {
        const mutualId = mutualBy.get(r.userId)?.latestMutualId;
        const mutualUser = mutualId ? people.users.get(mutualId) : undefined;
        if (mutualUser) dto.reasonName = displayNameOf(mutualUser);
      }
      return [dto];
    });
  }
}

export const suggestionService = new SuggestionService();
