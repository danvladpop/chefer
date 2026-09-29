import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getToken,
  hasSignedInBefore,
  loadHasSignedInBefore,
  loadToken,
  subscribe,
} from '../../lib/auth-store';

export interface SessionState {
  /** False until SecureStore has been read once (show splash while false). */
  ready: boolean;
  /** Present ⇒ treat as signed in; a dead token 401s and gets cleared. */
  token: string | null;
  /** UX-25 (T-25.1) — has this device ever signed in/registered? Valid once `ready`. */
  hasSignedInBefore: boolean;
}

export function useSession(): SessionState {
  const token = useSyncExternalStore(subscribe, getToken);
  const [ready, setReady] = useState(false);
  const [signedInBefore, setSignedInBefore] = useState(false);

  useEffect(() => {
    void Promise.all([loadToken(), loadHasSignedInBefore()]).then(([, seen]) => {
      setSignedInBefore(seen);
      setReady(true);
    });
  }, []);

  return { ready, token, hasSignedInBefore: ready ? signedInBefore : hasSignedInBefore() };
}
