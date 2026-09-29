import * as SecureStore from 'expo-secure-store';

// The session token issued by auth.login/register (same DB Session row the web
// cookie carries). Held in SecureStore (Keychain/Keystore) with a module-level
// cache so the tRPC headers callback can read it synchronously.

const TOKEN_KEY = 'chefer_session_token';
// UX-25 (T-25.1): "has this device ever signed in or registered?" — set on the
// first successful sign-in/registration, never cleared on sign-out. Drives
// `(auth)/index.tsx` (Welcome vs sign-in) and login's "Welcome back" title.
// Deliberately its own SecureStore key, not cleared by `clearToken` — a signed
// -out device must still see "Welcome back", not the first-launch Welcome
// screen (AC2).
const HAS_SIGNED_IN_BEFORE_KEY = 'chefer_has_signed_in_before';

let cached: string | null | undefined; // undefined = SecureStore not read yet
let hasSignedInBeforeCached: boolean | undefined; // undefined = not read yet
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
  // Written before any navigation triggered by the sign-in that called us, so
  // a crash between the two never re-shows Welcome on the next launch (03
  // §UX-25 risk note).
  await markSignedInBefore();
}

/**
 * True once this device has ever completed a sign-in or registration —
 * never reset by `clearToken` (sign-out keeps it true). Reads SecureStore
 * once and caches the result the way `loadToken` does.
 */
export async function loadHasSignedInBefore(): Promise<boolean> {
  if (hasSignedInBeforeCached === undefined) {
    try {
      hasSignedInBeforeCached = (await SecureStore.getItemAsync(HAS_SIGNED_IN_BEFORE_KEY)) === '1';
    } catch {
      hasSignedInBeforeCached = false;
    }
  }
  return hasSignedInBeforeCached;
}

/** Synchronous read of the cached flag (false before `loadHasSignedInBefore` resolves). */
export function hasSignedInBefore(): boolean {
  return hasSignedInBeforeCached ?? false;
}

async function markSignedInBefore(): Promise<void> {
  if (hasSignedInBeforeCached === true) return;
  hasSignedInBeforeCached = true;
  try {
    await SecureStore.setItemAsync(HAS_SIGNED_IN_BEFORE_KEY, '1');
  } catch {
    // Best effort — worst case a later launch re-shows Welcome once.
  }
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
