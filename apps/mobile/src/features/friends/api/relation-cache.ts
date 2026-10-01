import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { FriendUserSummary, Relation } from '@chefer/types';
import {
  FRIENDS_PEOPLE_LISTS,
  FRIENDS_QUERY_KEY_PREFIX,
  friendsProcedureOf,
  type FriendsPeopleList,
} from './query-keys';

// ─── Following: one relation, every cached surface (UX §3.3, §16.4) ───────────
// A person appears in many cached `friends.*` results at once: search pages,
// suggestions, You follow / Followers / Requests pages, Activity items (as
// `actor`), Blocked, and their profile (`user`). One follow/unfollow result
// must update all of them without a reload, and a failure must put all of
// them back.
//
// Instead of one updater per procedure (which every later screen would have to
// remember to extend), this walks the data of every cached `friends.*` query
// and patches any `FriendUserSummary`-shaped object whose `id` matches. It
// keeps structural sharing: an untouched query keeps its exact data object,
// so nothing re-renders that didn't change.
//
// Usage (RelationButton does exactly this):
//   const snapshot = applyRelation(queryClient, userId, { relation: 'requested' });
//   …mutation fails → rollbackFriendsCache(queryClient, snapshot)
//   …mutation succeeds → applyRelation(queryClient, userId, { relation: server })
// then invalidate `friends.me` (counts) and `friends.profile({ userId })`
// (access changes) on settle.

/** The previous data of every query a cache write changed, for rollback. */
export type FriendsCacheSnapshot = readonly (readonly [QueryKey, unknown])[];

/** The relation fields a mutation can change on a person. */
export type RelationPatch = Partial<
  Pick<FriendUserSummary, 'relation' | 'followsYou' | 'requestedYou'>
>;

const REMOVE: unique symbol = Symbol('friends-cache-remove');
type Visit = (node: Record<string, unknown>) => unknown;

/** Deep enough for `{ pages: [{ items: [{ actor: {…} }] }] }` with room to spare. */
const MAX_DEPTH = 8;

/** True for an object shaped like `FriendUserSummary` (what every people list returns). */
export function isFriendUserSummary(value: unknown): value is FriendUserSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.displayName === 'string' &&
    typeof v.relation === 'string' &&
    typeof v.followsYou === 'boolean'
  );
}

/**
 * Structural-sharing deep map. `visit` sees every plain object (not arrays,
 * not Dates) before its children and returns the node, a replacement, or
 * REMOVE (honoured only for array items).
 */
function walk(value: unknown, visit: Visit, depth: number): unknown {
  if (depth > MAX_DEPTH || typeof value !== 'object' || value === null || value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out: unknown[] = [];
    for (const item of value) {
      const next = walk(item, visit, depth + 1);
      if (next === REMOVE) {
        changed = true;
        continue;
      }
      if (next !== item) changed = true;
      out.push(next);
    }
    return changed ? out : value;
  }
  const visited = visit(value as Record<string, unknown>);
  if (visited === REMOVE) return REMOVE;
  const node = visited as Record<string, unknown>;
  let changed = node !== value;
  const out: Record<string, unknown> = { ...node };
  for (const [key, child] of Object.entries(node)) {
    const next = walk(child, visit, depth + 1);
    // A property can't be "removed" from its parent object; leave it as is.
    if (next !== REMOVE && next !== child) {
      out[key] = next;
      changed = true;
    }
  }
  return changed ? out : value;
}

/** Apply `visit` to the data of every cached `friends.*` query (optionally filtered). */
function rewrite(
  queryClient: QueryClient,
  visit: Visit,
  include: (procedure: string | null) => boolean = () => true,
): FriendsCacheSnapshot {
  const snapshot: (readonly [QueryKey, unknown])[] = [];
  for (const query of queryClient.getQueryCache().findAll({ queryKey: FRIENDS_QUERY_KEY_PREFIX })) {
    if (!include(friendsProcedureOf(query.queryKey))) continue;
    const data = query.state.data;
    if (data === undefined) continue;
    const next = walk(data, visit, 0);
    if (next === data || next === REMOVE) continue;
    snapshot.push([query.queryKey, data]);
    queryClient.setQueryData(query.queryKey, next);
  }
  return snapshot;
}

function samePatch(person: FriendUserSummary, patch: RelationPatch): boolean {
  return (Object.keys(patch) as (keyof RelationPatch)[]).every((k) => person[k] === patch[k]);
}

/** Follower count delta when the viewer's relation to a profile moves in/out of `following`. */
function followerDelta(from: Relation, to: Relation | undefined): number {
  if (to === undefined || from === to) return 0;
  if (to === 'following') return 1;
  if (from === 'following') return -1;
  return 0;
}

/**
 * Patch `userId`'s relation fields everywhere they're cached. A profile
 * (`{ user, counts }`) also gets its follower count moved by ±1 when the
 * viewer starts/stops following. Returns the snapshot to roll back with.
 */
export function applyRelation(
  queryClient: QueryClient,
  userId: string,
  patch: RelationPatch,
): FriendsCacheSnapshot {
  return rewrite(queryClient, (node) => {
    if (isFriendUserSummary(node)) {
      if (node.id !== userId || samePatch(node, patch)) return node;
      return { ...node, ...patch };
    }
    const { user, counts } = node;
    if (
      isFriendUserSummary(user) &&
      user.id === userId &&
      typeof counts === 'object' &&
      counts !== null &&
      typeof (counts as { followers?: unknown }).followers === 'number'
    ) {
      const delta = followerDelta(user.relation, patch.relation);
      if (delta === 0) return node;
      const c = counts as { followers: number };
      return { ...node, counts: { ...c, followers: Math.max(0, c.followers + delta) } };
    }
    return node;
  });
}

/**
 * Drop `userId` from cached people lists: their rows, and Activity items
 * whose `actor` they are. `lists` limits it (e.g. `['followers']` after
 * Remove follower); the default is every people list (after a block or a
 * report). Profiles are left alone — invalidate them instead.
 */
export function removePerson(
  queryClient: QueryClient,
  userId: string,
  lists: readonly FriendsPeopleList[] = FRIENDS_PEOPLE_LISTS,
): FriendsCacheSnapshot {
  const wanted = new Set<string>(lists);
  return rewrite(
    queryClient,
    (node) => {
      if (isFriendUserSummary(node)) return node.id === userId ? REMOVE : node;
      if (isFriendUserSummary(node.actor) && node.actor.id === userId) return REMOVE;
      return node;
    },
    (procedure) => procedure !== null && wanted.has(procedure),
  );
}

/** Put back exactly what a cache write changed (optimistic rollback). */
export function rollbackFriendsCache(
  queryClient: QueryClient,
  snapshot: FriendsCacheSnapshot,
): void {
  for (const [queryKey, data] of snapshot) queryClient.setQueryData(queryKey, data);
}

/**
 * Mark `userId`'s pending FOLLOW_REQUEST Activity item answered, so the row
 * reads `You accepted` / `You declined` (UX §7.2) without a refetch.
 */
export function answerActivityRequest(
  queryClient: QueryClient,
  userId: string,
  requestState: 'accepted' | 'declined',
): FriendsCacheSnapshot {
  return rewrite(
    queryClient,
    (node) => {
      if (
        node.kind === 'FOLLOW_REQUEST' &&
        isFriendUserSummary(node.actor) &&
        node.actor.id === userId &&
        node.requestState !== requestState
      ) {
        return { ...node, requestState };
      }
      return node;
    },
    (procedure) => procedure === 'activity',
  );
}

/** Concatenate snapshots taken by several writes of one optimistic action. */
export function mergeSnapshots(...snapshots: FriendsCacheSnapshot[]): FriendsCacheSnapshot {
  // Restore in reverse order so the OLDEST data of a key written twice wins.
  return snapshots.flat().reverse();
}
