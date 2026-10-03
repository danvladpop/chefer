import { getQueryState, type QueryState } from '@chefer/utils';

// Web twin of `useQueryState` in @chefer/ui-mobile (WP-02, audit UX-X-03): the
// decision is the shared pure `getQueryState`; this adds the Retry handle.
// Render an error state with Retry for `error` BEFORE any empty/"not found"
// branch, instead of `isLoading || !data`.

export type QueryStateSource<TData> = {
  data: TData | undefined;
  isError?: boolean | undefined;
  refetch: () => unknown;
};

export function useQueryState<TData>(
  query: QueryStateSource<TData>,
  isEmpty?: (data: TData) => boolean,
): { state: QueryState; data: TData | undefined; retry: () => void } {
  return {
    state: getQueryState(query, isEmpty),
    data: query.data,
    retry: () => {
      void query.refetch();
    },
  };
}
