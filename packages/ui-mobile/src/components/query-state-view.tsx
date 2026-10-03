import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useQueryState, type QueryStateSource } from '../hooks/use-query-state';
import { ErrorState } from './error-state';

export interface QueryStateViewProps<TData> {
  query: QueryStateSource<TData>;
  /** When true for loaded data, `empty` renders instead of `children`. */
  isEmpty?: (data: TData) => boolean;
  /** Replaces the default centred spinner. */
  loading?: ReactNode;
  /** Rendered for `empty` state; falls back to `children` when omitted. */
  empty?: ReactNode;
  errorTitle?: string;
  errorDescription?: string;
  /** Any icon element for the error state. */
  errorIcon?: ReactNode;
  className?: string;
  testID?: string;
  children: (data: TData) => ReactNode;
}

/**
 * The convenience wrapper around `useQueryState`: spinner while loading,
 * `ErrorState` with a Retry button when the load failed (never "empty" or
 * "not found"), the `empty` slot for an empty result, and `children(data)`
 * otherwise.
 */
export function QueryStateView<TData>({
  query,
  isEmpty,
  loading,
  empty,
  errorTitle,
  errorDescription,
  errorIcon,
  className,
  testID = 'query-state',
  children,
}: QueryStateViewProps<TData>) {
  const { state, data, retry } = useQueryState(query, isEmpty);

  if (state === 'error') {
    return (
      <ErrorState
        testID={`${testID}-error`}
        onRetry={retry}
        {...(errorTitle !== undefined && { title: errorTitle })}
        {...(errorDescription !== undefined && { description: errorDescription })}
        {...(errorIcon !== undefined && { icon: errorIcon })}
        {...(className !== undefined && { className })}
      />
    );
  }
  if (state === 'loading' || data === undefined) {
    return (
      loading ?? (
        <View testID={`${testID}-loading`} className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      )
    );
  }
  if (state === 'empty' && empty !== undefined) {
    return <>{empty}</>;
  }
  return <>{children(data)}</>;
}
