import { useEffect, useState, useSyncExternalStore } from 'react';
import { getToken, loadToken, subscribe } from '../../lib/auth-store';

export interface SessionState {
  /** False until SecureStore has been read once (show splash while false). */
  ready: boolean;
  /** Present ⇒ treat as signed in; a dead token 401s and gets cleared. */
  token: string | null;
}

export function useSession(): SessionState {
  const token = useSyncExternalStore(subscribe, getToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadToken().finally(() => setReady(true));
  }, []);

  return { ready, token };
}
