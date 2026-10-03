import { getQueryState, type QueryState } from '@chefer/utils';

// Audit §6.3 (UX-X-03): one vocabulary for "what does this screen show?".
// Branching on `isLoading || !data` renders a failed load as an endless spinner
// (cook mode) or as "not found" (recipe detail). The decision itself is the
// shared pure `getQueryState`; this hook adds the Retry handle. No tRPC
// dependency: any TanStack query result fits the minimal shape below.

/** The slice of a TanStack Query result `useQueryState` reads. */
export interface QueryStateSource<TData> {
  data: TData | undefined;
  isError?: boolean | undefined;
  refetch: () => unknown;
}

export interface UseQueryStateResult<TData> {
  state: QueryState;
  /** Defined whenever `state` is `data` or `empty`. */
  data: TData | undefined;
  /** Re-runs the query (Retry); safe to pass straight to `ErrorState`. */
  retry: () => void;
}

/**
 * `loading` until data arrives, `error` when the load failed with nothing to
 * show (a failed background refetch keeps the stale data), `empty` when
 * `isEmpty(data)` says so, else `data`. Render `ErrorState` for `error`
 * *before* any empty-state branch.
 */
export function useQueryState<TData>(
  query: QueryStateSource<TData>,
  isEmpty?: (data: TData) => boolean,
): UseQueryStateResult<TData> {
  return {
    state: getQueryState(query, isEmpty),
    data: query.data,
    retry: () => {
      void query.refetch();
    },
  };
}
