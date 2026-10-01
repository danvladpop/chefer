import { useMemo } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { FRIENDS_LIMITS, type FriendUserSummary } from '@chefer/types';
import { trpc } from '../../../lib/trpc';

// ─── Following home: the list queries (UX §5, §6, §7) ─────────────────────────
// Every list is a `friends.*` query, so its key starts with ['friends', …]
// (INV-7: never `gym*`, so nothing here is persisted to disk). The people
// lists page by `nextCursor`, 20 at a time, and the screens load the next
// page from `onEndReached`.

const PAGE_SIZE = FRIENDS_LIMITS.pageSize;

type Cursored = { nextCursor: string | null };
const nextCursor = (last: Cursored): string | undefined => last.nextCursor ?? undefined;

/** Pages → one array, keeping the first occurrence of an id (a page can overlap after a refetch). */
export function dedupeById<T extends { id: string }>(pages: readonly (readonly T[])[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** The `{ items, total }` shape of `friends.following | followers | requests`. */
type CountedPage = { items: FriendUserSummary[]; nextCursor: string | null; total: number };

function usePeople(pages: readonly CountedPage[] | undefined) {
  return useMemo(
    () => ({
      people: dedupeById((pages ?? []).map((p) => p.items)),
      total: pages && pages.length > 0 ? (pages[pages.length - 1]?.total ?? 0) : 0,
    }),
    [pages],
  );
}

/** `You follow` (20 per page). */
export function useFollowingList(enabled = true) {
  const query = trpc.friends.following.useInfiniteQuery(
    { limit: PAGE_SIZE },
    { getNextPageParam: nextCursor, enabled },
  );
  return { query, ...usePeople(query.data?.pages) };
}

/** `Followers` (20 per page). */
export function useFollowersList(enabled = true) {
  const query = trpc.friends.followers.useInfiniteQuery(
    { limit: PAGE_SIZE },
    { getNextPageParam: nextCursor, enabled },
  );
  return { query, ...usePeople(query.data?.pages) };
}

/** Incoming follow requests, newest first (20 per page). */
export function useRequestsList(enabled = true) {
  const query = trpc.friends.requests.useInfiniteQuery(
    { limit: PAGE_SIZE },
    { getNextPageParam: nextCursor, enabled },
  );
  return { query, ...usePeople(query.data?.pages) };
}

/** Name search (UX §6): only from 2 characters; the previous results stay while the next load. */
export function useSearchResults(query: string) {
  const trimmed = query.trim();
  const active = trimmed.length >= FRIENDS_LIMITS.searchMinChars;
  const result = trpc.friends.search.useInfiniteQuery(
    { query: trimmed, limit: PAGE_SIZE },
    {
      getNextPageParam: nextCursor,
      enabled: active,
      placeholderData: keepPreviousData,
      retry: false,
    },
  );
  const results = useMemo(
    () => dedupeById((result.data?.pages ?? []).map((p) => p.items)),
    [result.data],
  );
  return { active, query: result, results };
}

/** Suggested for you: an array, not a page (`limit` 5 on the home, 30 on See all). */
export function useSuggestions(limit: number, enabled = true) {
  return trpc.friends.suggestions.useQuery({ limit }, { enabled });
}

/** Activity items, newest first (20 per page). */
export function useActivityList(enabled = true) {
  const query = trpc.friends.activity.useInfiniteQuery(
    { limit: PAGE_SIZE },
    { getNextPageParam: nextCursor, enabled },
  );
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((p) =>
      p.items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    );
  }, [query.data]);
  return { query, items };
}

/** `onEndReached` for an infinite list. */
export function loadMore(query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => unknown;
}): void {
  if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetching) {
    void query.fetchNextPage();
  }
}
