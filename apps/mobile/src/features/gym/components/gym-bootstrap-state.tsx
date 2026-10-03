import { ActivityIndicator, View } from 'react-native';
import { EmptyState, ErrorState, useQueryState } from '@chefer/ui-mobile';

// UX-GYM-24 / audit §6.3: every gym tab reads the one persisted
// `gym.bootstrap` query, and each used to branch on "no data yet" with a
// spinner or an empty state — so a failed load showed Today spinning forever,
// Stats "Loading…" and Exercises "No exercises match". The bootstrap query is
// `offlineFirst`, so with no cache and no connection it is NOT an error but a
// paused fetch; that reads as "needs a connection". An error with nothing to
// show gets Retry. A failed background refetch keeps the cached copy (`data`).

export type GymBootstrapLoad = 'data' | 'loading' | 'offline' | 'error';

export interface GymBootstrapQueryLike<TData> {
  data: TData | undefined;
  isError?: boolean | undefined;
  fetchStatus?: string | undefined;
  refetch: () => unknown;
}

/** What a gym screen should show for the bootstrap: data, a spinner, "needs a connection" or Retry. */
export function useGymBootstrapLoad<TData>(query: GymBootstrapQueryLike<TData>): {
  load: GymBootstrapLoad;
  retry: () => void;
} {
  const { state, retry } = useQueryState(query);
  if (state === 'error') return { load: 'error', retry };
  if (state === 'loading') {
    return { load: query.fetchStatus === 'paused' ? 'offline' : 'loading', retry };
  }
  return { load: 'data', retry };
}

export interface GymBootstrapUnavailableProps {
  load: Exclude<GymBootstrapLoad, 'data'>;
  onRetry: () => void;
  /** Prefix for the testIDs: `<id>-loading`, `<id>-offline`, `<id>-error`. */
  testID: string;
  /** What is being loaded, for the copy ("your routine"). */
  what?: string;
}

/** The non-data states of a gym bootstrap load. */
export function GymBootstrapUnavailable({
  load,
  onRetry,
  testID,
  what = 'your training',
}: GymBootstrapUnavailableProps) {
  if (load === 'loading') {
    return (
      <View className="flex-1 items-center justify-center py-10" testID={`${testID}-loading`}>
        <ActivityIndicator size="large" color="#944a00" />
      </View>
    );
  }
  if (load === 'offline') {
    return (
      <EmptyState
        testID={`${testID}-offline`}
        title="Needs a connection"
        description={`Your first sync with the gym needs a connection. Reconnect to load ${what}.`}
        action={{ label: 'Try again', onPress: onRetry, testID: `${testID}-offline-retry` }}
      />
    );
  }
  return (
    <ErrorState testID={`${testID}-error`} title={`Couldn’t load ${what}`} onRetry={onRetry} />
  );
}
