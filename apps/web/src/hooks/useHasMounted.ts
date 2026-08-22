'use client';

import { useEffect, useState } from 'react';

/**
 * False during SSR and the hydration render, true after mount.
 *
 * Pages that live under a route-level `loading.tsx` are hydrated *lazily*: by
 * the time React hydrates them, earlier-hydrated components (the dashboard
 * shell) have usually already resolved shared react-query data, so a
 * query-driven page renders its loaded state on the hydration pass while the
 * server HTML holds the pending state — React #418, and the route can stick on
 * the Suspense fallback. Gating the query-driven UI behind this hook keeps the
 * hydration render byte-identical to the server render.
 */
export function useHasMounted(): boolean {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  return hasMounted;
}
