import { useEffect, useRef, useState } from 'react';

// Bug B-26: a stuck spinner at the top of Gym Today after "Done" (> 10 s).
// `RefreshControl`'s `refreshing` prop used to mirror the query's own
// `isRefetching` forever, so a hung refetch (host load, a flaky connection)
// left the spinner spinning indefinitely. This decouples the two: the
// spinner always drops after `timeoutMs`, whether or not `refetch` itself
// ever settles.

export interface TimedRefresh {
  refreshing: boolean;
  onRefresh: () => void;
}

export function useTimedRefresh(refetch: () => Promise<unknown>, timeoutMs = 10_000): TimedRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setRefreshing(false), timeoutMs);
    void refetch().finally(() => {
      if (timeout.current) clearTimeout(timeout.current);
      setRefreshing(false);
    });
  };

  return { refreshing, onRefresh };
}
