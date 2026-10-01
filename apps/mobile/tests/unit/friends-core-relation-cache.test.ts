import { QueryClient, type QueryKey } from '@tanstack/react-query';
import type { FriendUserSummary } from '@chefer/types';
import {
  answerActivityRequest,
  applyRelation,
  mergeSnapshots,
  removePerson,
  rollbackFriendsCache,
} from '../../src/features/friends/api/relation-cache';

// relation-cache.ts (UX §3.3, §16.4): one follow/unfollow result updates every
// cached list, search page, suggestion, Activity item and profile for that
// person — and a failure puts every one of them back exactly as it was.

const MARIA = 'cmaria000000000000000001';
const ANDREI = 'candrei00000000000000001';

function summary(id: string, overrides: Partial<FriendUserSummary> = {}): FriendUserSummary {
  return {
    id,
    displayName: id === MARIA ? 'Maria Pop' : 'Andrei Ionescu',
    firstName: id === MARIA ? 'Maria' : 'Andrei',
    imageUrl: null,
    relation: 'none',
    followsYou: false,
    requestedYou: false,
    ...overrides,
  };
}

// tRPC v11 keys: [path[], { input?, type }]
const keys = {
  search: [['friends', 'search'], { input: { query: 'ma' }, type: 'infinite' }],
  suggestions: [['friends', 'suggestions'], { input: { limit: 5 }, type: 'query' }],
  following: [['friends', 'following'], { input: {}, type: 'infinite' }],
  followers: [['friends', 'followers'], { input: {}, type: 'infinite' }],
  requests: [['friends', 'requests'], { input: { limit: 3 }, type: 'query' }],
  activity: [['friends', 'activity'], { input: {}, type: 'infinite' }],
  profileMaria: [['friends', 'profile'], { input: { userId: MARIA }, type: 'query' }],
  profileAndrei: [['friends', 'profile'], { input: { userId: ANDREI }, type: 'query' }],
  me: [['friends', 'me'], { type: 'query' }],
  // Same shape outside the friends namespace: must never be touched.
  recipeList: [['recipe', 'list'], { type: 'query' }],
} satisfies Record<string, QueryKey>;

function seed(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  qc.setQueryData(keys.search, {
    pages: [
      { items: [summary(MARIA), summary(ANDREI)], nextCursor: 'o2' },
      { items: [summary(ANDREI, { id: 'cother0000000000000000001' })], nextCursor: null },
    ],
    pageParams: [undefined, 'o2'],
  });
  qc.setQueryData(keys.suggestions, [
    { ...summary(MARIA), reason: 'mutual', mutualCount: 2, reasonName: 'Elena Radu' },
  ]);
  qc.setQueryData(keys.following, { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
  qc.setQueryData(keys.followers, {
    pages: [{ items: [summary(MARIA, { followsYou: true })], nextCursor: null }],
    pageParams: [null],
  });
  qc.setQueryData(keys.requests, {
    items: [summary(MARIA, { requestedYou: true, followsYou: false })],
    nextCursor: null,
  });
  qc.setQueryData(keys.activity, {
    pages: [
      {
        items: [
          {
            id: 'a1',
            kind: 'FOLLOW_REQUEST',
            actor: summary(MARIA, { requestedYou: true }),
            createdAt: new Date('2026-09-30T10:00:00Z'),
            readAt: null,
            requestState: 'pending',
          },
          {
            id: 'a2',
            kind: 'NEW_FOLLOWER',
            actor: summary(ANDREI, { followsYou: true }),
            createdAt: new Date('2026-09-29T10:00:00Z'),
            readAt: null,
          },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
  qc.setQueryData(keys.profileMaria, {
    user: summary(MARIA),
    isSelf: false,
    visibility: 'PUBLIC',
    counts: { followers: 24, following: 31 },
    access: { plan: 'locked', recipes: 'locked', workouts: 'locked' },
    recipeCount: null,
  });
  qc.setQueryData(keys.profileAndrei, {
    user: summary(ANDREI),
    isSelf: false,
    visibility: 'PRIVATE',
    counts: { followers: 3, following: 4 },
    access: { plan: 'locked', recipes: 'locked', workouts: 'locked' },
    recipeCount: null,
  });
  qc.setQueryData(keys.me, { activated: true, badgeCount: 2 });
  qc.setQueryData(keys.recipeList, [{ id: 'r1', creator: summary(MARIA) }]);
  return qc;
}

type Infinite<T> = { pages: { items: T[] }[] };
type Person = FriendUserSummary;

function everyMaria(qc: QueryClient): Person[] {
  const found: Person[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if (o.id === MARIA && typeof o.relation === 'string') found.push(o as unknown as Person);
      Object.values(o).forEach(visit);
    }
  };
  for (const [key, data] of qc.getQueriesData({ queryKey: [['friends']] })) {
    void key;
    visit(data);
  }
  return found;
}

describe('applyRelation', () => {
  it('patches the person in every friends query: pages, arrays, activity actors, profiles', () => {
    const qc = seed();
    applyRelation(qc, MARIA, { relation: 'following' });
    const all = everyMaria(qc);
    // search, suggestion, followers, requests, activity actor, profile user
    expect(all).toHaveLength(6);
    expect(all.every((p) => p.relation === 'following')).toBe(true);
  });

  it('leaves other people, other procedures and non-friends keys alone (structural sharing)', () => {
    const qc = seed();
    const before = {
      following: qc.getQueryData(keys.following),
      profileAndrei: qc.getQueryData(keys.profileAndrei),
      me: qc.getQueryData(keys.me),
      recipeList: qc.getQueryData(keys.recipeList),
      searchPage2: qc.getQueryData<Infinite<Person>>(keys.search)?.pages[1],
    };
    applyRelation(qc, MARIA, { relation: 'requested' });
    expect(qc.getQueryData(keys.following)).toBe(before.following);
    expect(qc.getQueryData(keys.profileAndrei)).toBe(before.profileAndrei);
    expect(qc.getQueryData(keys.me)).toBe(before.me);
    expect(qc.getQueryData(keys.recipeList)).toBe(before.recipeList);
    expect(qc.getQueryData<Infinite<Person>>(keys.search)?.pages[1]).toBe(before.searchPage2);
    const andrei = qc.getQueryData<Infinite<Person>>(keys.search)?.pages[0]?.items[1];
    expect(andrei?.relation).toBe('none');
  });

  it('moves the profile follower count when the viewer starts/stops following', () => {
    const qc = seed();
    applyRelation(qc, MARIA, { relation: 'following' });
    expect(
      qc.getQueryData<{ counts: { followers: number } }>(keys.profileMaria)?.counts.followers,
    ).toBe(25);
    applyRelation(qc, MARIA, { relation: 'none' });
    expect(
      qc.getQueryData<{ counts: { followers: number } }>(keys.profileMaria)?.counts.followers,
    ).toBe(24);
    // requested → no count change
    applyRelation(qc, MARIA, { relation: 'requested' });
    expect(
      qc.getQueryData<{ counts: { followers: number } }>(keys.profileMaria)?.counts.followers,
    ).toBe(24);
  });

  it('returns a snapshot that rolls every touched query back exactly', () => {
    const qc = seed();
    const original = qc.getQueriesData({ queryKey: [['friends']] });
    const snapshot = applyRelation(qc, MARIA, { relation: 'following' });
    expect(snapshot.length).toBe(6); // search, suggestions, followers, requests, activity, profile
    rollbackFriendsCache(qc, snapshot);
    for (const [key, data] of original) expect(qc.getQueryData(key)).toStrictEqual(data);
  });

  it('is a no-op (empty snapshot) when nothing changes', () => {
    const qc = seed();
    expect(applyRelation(qc, 'cnobody00000000000000001', { relation: 'following' })).toEqual([]);
    expect(applyRelation(qc, ANDREI, { relation: 'none' }).length).toBe(0);
  });
});

describe('removePerson', () => {
  it('drops the person from every people list, and Activity items they are the actor of', () => {
    const qc = seed();
    removePerson(qc, MARIA);
    expect(everyMaria(qc).map((p) => p.id)).toHaveLength(1); // only the profile's `user` remains
    const activity = qc.getQueryData<Infinite<{ id: string }>>(keys.activity);
    expect(activity?.pages[0]?.items.map((i) => i.id)).toEqual(['a2']);
    // Non-friends data is never touched.
    expect(qc.getQueryData<{ creator: Person }[]>(keys.recipeList)?.[0]?.creator.id).toBe(MARIA);
  });

  it('can be limited to some lists (remove follower → followers only)', () => {
    const qc = seed();
    const snapshot = removePerson(qc, MARIA, ['followers']);
    expect(snapshot.map(([k]) => (k[0] as string[])[1])).toEqual(['followers']);
    expect(qc.getQueryData<Infinite<Person>>(keys.followers)?.pages[0]?.items).toEqual([]);
    expect(qc.getQueryData<Infinite<Person>>(keys.search)?.pages[0]?.items).toHaveLength(2);
  });
});

describe('answerActivityRequest + mergeSnapshots', () => {
  it('marks the pending FOLLOW_REQUEST answered, and a merged snapshot restores everything', () => {
    const qc = seed();
    const original = qc.getQueriesData({ queryKey: [['friends']] });
    const snapshot = mergeSnapshots(
      removePerson(qc, MARIA, ['requests']),
      applyRelation(qc, MARIA, { requestedYou: false, followsYou: true }),
      answerActivityRequest(qc, MARIA, 'accepted'),
    );
    const activity = qc.getQueryData<Infinite<{ requestState?: string }>>(keys.activity);
    expect(activity?.pages[0]?.items[0]?.requestState).toBe('accepted');
    expect(qc.getQueryData<{ items: Person[] }>(keys.requests)?.items).toEqual([]);

    rollbackFriendsCache(qc, snapshot);
    for (const [key, data] of original) expect(qc.getQueryData(key)).toStrictEqual(data);
  });
});
