// One answer to "what should this screen show for this query?" — shared by
// mobile (`useQueryState` in @chefer/ui-mobile) and web. Screens used to branch
// on `isLoading || !data`, which renders a failed load as an endless spinner or
// as "not found" / an empty state (audit UX-X-03, REC-03, COOK-03).

export type QueryState = 'loading' | 'error' | 'empty' | 'data';

/** The few TanStack Query fields the decision needs, so any query result fits. */
export type QueryStateInput<TData> = {
  data: TData | undefined;
  isError?: boolean | undefined;
};

/**
 * `data` wins: a background refetch that failed keeps showing what we have (the
 * stale copy beats an error wall). With no data yet, a failure is `error`, and
 * anything else is still `loading`. `empty` only when the caller says so.
 */
export function getQueryState<TData>(
  query: QueryStateInput<TData>,
  isEmpty?: (data: TData) => boolean,
): QueryState {
  if (query.data !== undefined) {
    return isEmpty?.(query.data) === true ? 'empty' : 'data';
  }
  return query.isError === true ? 'error' : 'loading';
}

/** True for a tRPC NOT_FOUND (a genuinely missing record, not a failed load). */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: unknown; httpStatus?: unknown } | null };
  return data?.code === 'NOT_FOUND' || data?.httpStatus === 404;
}
