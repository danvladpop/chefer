import { useEffect, useRef } from 'react';

export interface RecipeImageUpdate {
  recipeId: string;
  imageUrl: string | null;
  status: 'DONE' | 'FAILED';
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'];
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

const CLIENT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Opens an SSE connection to stream image updates for the given recipe IDs.
 * Calls `onUpdate` for each resolved recipe.
 * Closes the connection when all IDs are resolved or on unmount.
 * Forces FAILED status for any IDs still pending after CLIENT_TIMEOUT_MS.
 */
export function useRecipeImageStream(
  recipeIds: string[],
  onUpdate: (update: RecipeImageUpdate) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

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

    // Client-side timeout: if images haven't arrived after CLIENT_TIMEOUT_MS,
    // stop waiting and show the failure fallback so shimmer doesn't run forever.
    const timeout = setTimeout(() => {
      for (const id of ids) {
        if (!resolved.has(id)) {
          onUpdateRef.current({ recipeId: id, imageUrl: null, status: 'FAILED' });
          resolved.add(id);
        }
      }
      es.close();
    }, CLIENT_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
      es.close();
    };
  }, [stableKey]);
}
