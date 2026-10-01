import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  socialUserSelect,
  type Follow,
  type MutualCandidateRow,
  type SocialProfile,
  type SocialProfileWithUser,
  type SocialUserRow,
} from '@chefer/database';
import { matchesAllTokens, normalizeSearchName } from '@chefer/utils';
import { FriendSummaryHydrator } from './activity.service.js';
import { FriendSearchService, SEARCH_CANDIDATE_CAP } from './friend-search.service.js';

// Name-only search (PRD §10, FR-08; INV-6; plan §9 "Services": a query
// containing an email matches nothing unless a name matches; never reads
// `email`). The fake repository implements searchByName's contract with the
// shared `matchesAllTokens` over `searchName` ONLY; every user in this world
// also has an email (kept in a separate map the service can't reach), so a
// match through the email would be visible here.

const ME = 'cme000000000000000000001';
const ANA = 'cana00000000000000000001';
const ANA2 = 'cana20000000000000000001';
const BOB = 'cbob00000000000000000001';
const STEF = 'cstef0000000000000000001';
const BLOCKED = 'cblocked0000000000000001';
const FORCED = 'cforced00000000000000001';

const T0 = new Date('2026-09-30T10:00:00.000Z');

interface Person {
  id: string;
  first: string;
  last: string;
  email: string;
  forced?: boolean;
}

const PEOPLE: Person[] = [
  { id: ME, first: 'Maria', last: 'Pop', email: 'maria@x.dev' },
  { id: ANA, first: 'Ana', last: 'Pop', email: 'ana@x.dev' },
  { id: ANA2, first: 'Ana', last: 'Xu Devon', email: 'other@y.io' },
  { id: BOB, first: 'Bob', last: 'Popescu', email: 'bob@x.dev' },
  { id: STEF, first: 'Ștefan', last: 'Ionescu', email: 'stef@x.dev' },
  { id: BLOCKED, first: 'Ana', last: 'Blocked', email: 'b@x.dev' },
  { id: FORCED, first: 'Ana', last: 'Forced', email: 'f@x.dev', forced: true },
];

function row(p: Person): SocialProfileWithUser {
  const profile: SocialProfile = {
    userId: p.id,
    visibility: 'PUBLIC',
    searchName: normalizeSearchName(p.first, p.last),
    sharePlan: true,
    shareRecipes: true,
    shareWorkouts: true,
    shareTargets: false,
    forcedPrivateAt: p.forced ? T0 : null,
    featured: false,
    activatedAt: T0,
    updatedAt: T0,
  };
  const user: SocialUserRow = {
    id: p.id,
    firstName: p.first,
    lastName: p.last,
    name: null,
    image: null,
  };
  return { ...profile, user };
}

function makeWorld(
  edges: Follow[] = [],
  mutuals: MutualCandidateRow[] = [],
  followers = new Map<string, number>(),
) {
  const rows = PEOPLE.map(row);
  const profiles = {
    searchByName: vi.fn((tokens: string[], excludeIds: string[], _cursor: unknown, limit: number) =>
      Promise.resolve(
        rows
          .filter(
            (r) =>
              matchesAllTokens(r.searchName, tokens) &&
              r.forcedPrivateAt === null &&
              !excludeIds.includes(r.userId),
          )
          .sort((a, b) => (a.searchName < b.searchName ? -1 : a.searchName > b.searchName ? 1 : 0))
          .slice(0, limit),
      ),
    ),
  };
  const follows = {
    mutualCountsFor: vi.fn(() => Promise.resolve(mutuals)),
    followerCounts: vi.fn(() => Promise.resolve(followers)),
  };
  const blocks = { blockedIdsEither: vi.fn(() => Promise.resolve([BLOCKED])) };
  const users = rows.map((r) => r.user);
  const hydrator = new FriendSummaryHydrator(
    { findUsers: (ids: string[]) => Promise.resolve(users.filter((u) => ids.includes(u.id))) },
    {
      findEdgesWith: (v: string, ids: string[]) =>
        Promise.resolve(
          edges.filter(
            (e) =>
              (e.followerId === v && ids.includes(e.followeeId)) ||
              (e.followeeId === v && ids.includes(e.followerId)),
          ),
        ),
    },
  );
  return { service: new FriendSearchService(profiles, follows, blocks, hydrator), profiles };
}

const edge = (followerId: string, followeeId: string, status: Follow['status']): Follow => ({
  id: `${followerId}>${followeeId}`,
  followerId,
  followeeId,
  status,
  createdAt: T0,
  acceptedAt: null,
});

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

const ids = (page: { items: { id: string }[] }) => page.items.map((i) => i.id);

describe('FriendSearchService — name only (INV-6)', () => {
  it('a query equal to a user’s email matches nothing unless a name token matches', async () => {
    // "ana@x.dev" is ana's email; as name tokens it is "ana" "x" "dev".
    // Ana Pop does NOT match (no name token starts with "x"/"dev") — only
    // Ana Xu Devon, whose NAME covers every token.
    const page = await w.service.search(ME, { query: 'ana@x.dev', limit: 20 });
    expect(ids(page)).toEqual([ANA2]);
    expect(w.profiles.searchByName).toHaveBeenCalledWith(
      ['ana', 'x', 'dev'],
      expect.anything(),
      null,
      SEARCH_CANDIDATE_CAP,
    );

    // An email whose local part is no one's name finds nobody.
    expect(ids(await w.service.search(ME, { query: 'bob@x.dev', limit: 20 }))).toEqual([]);
    expect(ids(await w.service.search(ME, { query: 'stef@x.dev', limit: 20 }))).toEqual([]);
    expect(ids(await w.service.search(ME, { query: 'other@y.io', limit: 20 }))).toEqual([]);
  });

  it('word-prefix, case- and accent-insensitive; every token must match', async () => {
    expect(ids(await w.service.search(ME, { query: 'stefan', limit: 20 }))).toEqual([STEF]);
    expect(ids(await w.service.search(ME, { query: 'ȘTEF ion', limit: 20 }))).toEqual([STEF]);
    expect(ids(await w.service.search(ME, { query: 'pop', limit: 20 })).sort()).toEqual(
      [ANA, BOB].sort(),
    );
    expect(ids(await w.service.search(ME, { query: 'ana pop', limit: 20 }))).toEqual([ANA]);
    expect(ids(await w.service.search(ME, { query: 'opescu', limit: 20 }))).toEqual([]);
  });

  it('excludes me and blocked people (passed to the repository) and forced-private accounts', async () => {
    const page = await w.service.search(ME, { query: 'ana', limit: 20 });
    expect(ids(page)).not.toContain(BLOCKED);
    expect(ids(page)).not.toContain(FORCED);
    expect(w.profiles.searchByName.mock.calls[0]?.[1]).toEqual([ME, BLOCKED]);
    expect(ids(await w.service.search(ME, { query: 'maria', limit: 20 }))).toEqual([]);
  });

  it('a query with no name characters searches nothing', async () => {
    await expect(w.service.search(ME, { query: '@@', limit: 20 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(w.profiles.searchByName).not.toHaveBeenCalled();
  });

  it('ranks: connected, then mutuals, then exact name, then followers, then A–Z', async () => {
    // Candidates for "ana": Ana Pop, Ana Xu Devon (+ blocked/forced excluded).
    // Add two more Anas via a custom world for every tie-break.
    const extra: Person[] = [
      { id: 'cana30000000000000000001', first: 'Ana', last: 'Zed', email: 'z@x' },
      { id: 'cana40000000000000000001', first: 'Ana', last: 'Ana', email: 'q@x' },
    ];
    PEOPLE.push(...extra);
    try {
      const world = makeWorld(
        [edge(ANA2, ME, 'ACCEPTED')], // Ana Xu Devon follows me → connected
        [{ userId: 'cana30000000000000000001', mutualCount: 2, latestMutualId: BOB }],
        new Map([
          [ANA, 5],
          ['cana40000000000000000001', 1],
        ]),
      );
      const page = await world.service.search(ME, { query: 'ana', limit: 20 });
      expect(ids(page)).toEqual([
        ANA2, // connected
        'cana30000000000000000001', // 2 mutuals
        ANA, // 5 followers (no exact match among the rest: "ana" ≠ "ana pop")
        'cana40000000000000000001', // 1 follower
      ]);
      expect(page.items[0]).toMatchObject({ followsYou: true });
      expect(page.items[1]).toMatchObject({ mutualName: 'Bob Popescu' });
      expect(page.items[2]).not.toHaveProperty('mutualName');

      // Exact full-name match beats follower count (connected and mutuals still come first).
      const exact = ids(await world.service.search(ME, { query: 'ana ana', limit: 20 }));
      expect(exact.slice(0, 2)).toEqual([ANA2, 'cana30000000000000000001']);
      expect(exact.indexOf('cana40000000000000000001')).toBeLessThan(exact.indexOf(ANA));
    } finally {
      PEOPLE.splice(PEOPLE.length - extra.length, extra.length);
    }
  });

  it('pages the ranked list with an offset cursor; a tampered cursor restarts at the top', async () => {
    const first = await w.service.search(ME, { query: 'pop', limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe('o1');
    const second = await w.service.search(ME, {
      query: 'pop',
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(ids(second)).not.toEqual(ids(first));
    for (const bad of ['o99999', 'x1', 'o-1', '']) {
      const page = await w.service.search(ME, { query: 'pop', limit: 1, cursor: bad });
      expect(ids(page)).toEqual(ids(first));
    }
  });

  it('results are FriendUserSummary (+ mutualName) only — no email anywhere', async () => {
    const page = await w.service.search(ME, { query: 'ana', limit: 20 });
    for (const item of page.items) {
      expect(
        Object.keys(item).every((k) =>
          [
            'id',
            'displayName',
            'firstName',
            'imageUrl',
            'relation',
            'followsYou',
            'requestedYou',
            'mutualName',
          ].includes(k),
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(page)).not.toMatch(/@/);
  });
});

describe('the search path never references email (static, INV-6)', () => {
  const repoSrc = readFileSync(
    fileURLToPath(
      new URL(
        '../../../../../packages/database/src/repositories/social-profile.repository.ts',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  it('socialUserSelect (the only user columns the repositories read) has no email', () => {
    expect(Object.keys(socialUserSelect)).not.toContain('email');
    expect(Object.keys(socialUserSelect).sort()).toEqual([
      'firstName',
      'id',
      'image',
      'lastName',
      'name',
    ]);
  });

  it('searchByName’s where/select/include never mention email', () => {
    const start = repoSrc.indexOf('async searchByName(');
    const end = repoSrc.indexOf('async popular(', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = repoSrc.slice(start, end);
    expect(body).not.toMatch(/email/i);
    expect(body).toMatch(/select: socialUserSelect/);
    expect(body).toMatch(/searchName/);
  });

  it('the search service has no logger and no console (the query is never logged)', () => {
    const svc = readFileSync(
      fileURLToPath(new URL('./friend-search.service.ts', import.meta.url)),
      'utf8',
    );
    const code = svc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/logger|console\./);
    expect(code).not.toMatch(/email/i);
  });
});
