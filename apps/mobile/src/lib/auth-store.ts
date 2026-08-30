import * as SecureStore from 'expo-secure-store';

// The session token issued by auth.login/register (same DB Session row the web
// cookie carries). Held in SecureStore (Keychain/Keystore) with a module-level
// cache so the tRPC headers callback can read it synchronously.

const TOKEN_KEY = 'chefer_session_token';

let cached: string | null | undefined; // undefined = SecureStore not read yet
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Reads the token from SecureStore once and primes the cache. */
export async function loadToken(): Promise<string | null> {
  if (cached === undefined) {
    try {
      cached = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      cached = null;
    }
    notify();
  }
  return cached;
}

/** Synchronous read of the cached token (null before loadToken resolves). */
export function getToken(): string | null {
  return cached ?? null;
}

export async function setToken(token: string): Promise<void> {
  cached = token;
  notify();
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cached = null;
  notify();
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing to do — the in-memory state is already cleared.
  }
}

/** Subscribe to token changes (for useSyncExternalStore). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
