import { useEffect, useRef } from 'react';

export interface RecipeImageUpdate {
  recipeId: string;
  imageUrl: string | null;
  status: 'DONE' | 'FAILED';
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'];
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

const CLIENT_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes

/**
 * Opens an SSE connection to stream image updates for the given recipe IDs.
 * Calls `onUpdate` for each resolved recipe.
 * Closes the connection when all IDs are resolved or on unmount.
 *
 * On timeout the hook does NOT fabricate FAILED states (the server may simply
 * still be generating) — it closes the stream and calls `onTimeout`, letting
 * the caller refetch real statuses from the DB and re-subscribe if needed.
 */
export function useRecipeImageStream(
  recipeIds: string[],
  onUpdate: (update: RecipeImageUpdate) => void,
  onTimeout?: () => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  // Sort for stable comparison — avoids reconnect on array reference churn
  const stableKey = [...recipeIds].sort().join(',');

  useEffect(() => {
    if (!stableKey) return;

    const ids = stableKey.split(',');
    const params = new URLSearchParams({ recipeIds: stableKey });
    const es = new EventSource(`${API_URL}/api/recipe-images/stream?${params}`, {
      withCredentials: true, // send session cookie for auth
    });

    const resolved = new Set<string>();

    const checkAllDone = () => {
      if (ids.every((id) => resolved.has(id))) {
        es.close();
      }
    };

    es.onmessage = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as RecipeImageUpdate;
      onUpdateRef.current(data);
      resolved.add(data.recipeId);
      checkAllDone();
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error — no manual action needed.
      // The server will re-send DONE/FAILED state on reconnect.
    };

    // Client-side timeout: stop holding the connection open forever. Real
    // statuses live in the DB — the caller refetches and re-subscribes.
    const timeout = setTimeout(() => {
      es.close();
      onTimeoutRef.current?.();
    }, CLIENT_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
      es.close();
    };
  }, [stableKey]);
}
