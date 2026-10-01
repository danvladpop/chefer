import {
  blockRepository,
  followRepository,
  socialProfileRepository,
  type IBlockRepository,
  type IFollowRepository,
  type ISocialProfileRepository,
} from '@chefer/database';
import type { FriendUserSummary, Page } from '@chefer/types';
import { displayNameOf, queryTokens } from '@chefer/utils';
import { friendSummaryHydrator, type FriendSummaryHydrator } from './activity.service.js';

// ─── Following: people search, by NAME ONLY (PRD §10, FR-08; plan §4.4) ───────
// INV-6 / Q-F-5: there is no email path of any kind. The query is normalised
// with `queryTokens` (an "@" is ordinary punctuation, so "ana@x.dev" is the
// three name tokens "ana", "x", "dev") and matched only against
// `SocialProfile.searchName` by `searchByName`, which never selects or
// filters on `User.email` (friend-search.service.test.ts asserts both).
// The query is NEVER logged or sent anywhere: this file has no logger, and
// errors never carry it.
//
// Excluded: me, users without Following (no SocialProfile row), blocks either
// way, forced-private accounts (the repository). Ranking (PRD §10):
//   1. people I follow / have requested, or who follow me;
//   2. mutual-connection count;
//   3. exact full-name match;
//   4. follower count;
//   5. name A–Z.
// A global ranking needs every match, so the service ranks the first
// SEARCH_CANDIDATE_CAP matches (A–Z) and pages through that ranked list with
// an offset cursor. A name prefix that matches more people than that is a
// query to refine; the cap keeps a search at five indexed queries.

export const SEARCH_CANDIDATE_CAP = 200;

export type SearchResultDto = FriendUserSummary & {
  /** "Followed by {mutualName}": the most recent of my followees who follows them. */
  mutualName?: string;
};

export interface FriendSearchInput {
  query: string;
  cursor?: string | undefined;
  limit: number;
}

export type SearchProfileRepository = Pick<ISocialProfileRepository, 'searchByName'>;
export type SearchFollowRepository = Pick<IFollowRepository, 'mutualCountsFor' | 'followerCounts'>;
export type SearchBlockRepository = Pick<IBlockRepository, 'blockedIdsEither'>;

/** Offset cursor over the ranked list: `o<offset>`. Untrusted: anything else restarts at 0. */
function decodeOffset(cursor: string | undefined): number {
  const match = /^o(\d{1,4})$/.exec(cursor ?? '');
  const offset = match ? Number(match[1]) : 0;
  return offset <= SEARCH_CANDIDATE_CAP ? offset : 0;
}

export class FriendSearchService {
  constructor(
    private readonly profiles: SearchProfileRepository = socialProfileRepository,
    private readonly follows: SearchFollowRepository = followRepository,
    private readonly blocks: SearchBlockRepository = blockRepository,
    private readonly hydrator: FriendSummaryHydrator = friendSummaryHydrator,
  ) {}

  async search(viewerId: string, input: FriendSearchInput): Promise<Page<SearchResultDto>> {
    const tokens = queryTokens(input.query);
    if (tokens.length === 0) return { items: [], nextCursor: null };

    const blocked = await this.blocks.blockedIdsEither(viewerId);
    const rows = await this.profiles.searchByName(
      tokens,
      [viewerId, ...blocked],
      null,
      SEARCH_CANDIDATE_CAP,
    );
    if (rows.length === 0) return { items: [], nextCursor: null };

    const ids = rows.map((r) => r.userId);
    const [mutuals, followerCounts, people] = await Promise.all([
      this.follows.mutualCountsFor(viewerId, ids),
      this.follows.followerCounts(ids),
      this.hydrator.hydrate(viewerId, ids),
    ]);
    const mutualBy = new Map(mutuals.map((m) => [m.userId, m]));
    const exact = tokens.join(' ');

    const ranked = rows
      .flatMap((row) => {
        const summary = people.summary(row.userId);
        if (!summary) return [];
        const connected =
          summary.relation === 'following' ||
          summary.relation === 'requested' ||
          summary.followsYou;
        return [
          {
            row,
            summary,
            connected,
            mutualCount: mutualBy.get(row.userId)?.mutualCount ?? 0,
            exact: row.searchName === exact,
            followers: followerCounts.get(row.userId) ?? 0,
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          b.mutualCount - a.mutualCount ||
          Number(b.exact) - Number(a.exact) ||
          b.followers - a.followers ||
          (a.row.searchName < b.row.searchName
            ? -1
            : a.row.searchName > b.row.searchName
              ? 1
              : 0) ||
          (a.row.userId < b.row.userId ? -1 : a.row.userId > b.row.userId ? 1 : 0),
      );

    const offset = decodeOffset(input.cursor);
    const page = ranked.slice(offset, offset + input.limit);
    const end = offset + page.length;

    // "Followed by {name}" for this page only: one more users query.
    const mutualIds = page.flatMap((r) => {
      const id = mutualBy.get(r.row.userId)?.latestMutualId;
      return id ? [id] : [];
    });
    const mutualPeople =
      mutualIds.length > 0 ? await this.hydrator.hydrate(viewerId, mutualIds) : null;

    return {
      items: page.map((r): SearchResultDto => {
        const item: SearchResultDto = { ...r.summary };
        const mutualId = mutualBy.get(r.row.userId)?.latestMutualId;
        const mutualUser = mutualId ? mutualPeople?.users.get(mutualId) : undefined;
        if (mutualUser) item.mutualName = displayNameOf(mutualUser);
        return item;
      }),
      nextCursor: end < ranked.length ? `o${end}` : null,
    };
  }
}

export const friendSearchService = new FriendSearchService();
