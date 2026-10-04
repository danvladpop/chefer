import type * as GoogleSigninModule from '@react-native-google-signin/google-signin';
import type * as AppleAuthenticationModule from 'expo-apple-authentication';

// ─── Native sign-in modules, loaded defensively (WP-22) ──────────────────────
// expo-apple-authentication and @react-native-google-signin are native modules.
// A binary built before they were added (an old dev client, a 1.0.1 store
// build) does not contain them, and merely importing the Google package throws
// (it reads native constants at import time). Load them lazily, inside
// try/catch, and treat "missing" as "button hidden" — the JS bundle must never
// crash on a binary without the module.

export type AppleAuthentication = typeof AppleAuthenticationModule;
export type GoogleSignIn = typeof GoogleSigninModule;

export type NativeSignInModules = {
  /** Present only when the module loaded AND the OS says Sign in with Apple works. */
  apple: AppleAuthentication | null;
  google: GoogleSignIn | null;
};

async function loadApple(): Promise<AppleAuthentication | null> {
  try {
    // require, not import(): a lazy, catchable load that Metro and Jest share.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
    const mod = require('expo-apple-authentication') as AppleAuthentication;
    return (await mod.isAvailableAsync()) ? mod : null;
  } catch {
    return null;
  }
}

function loadGoogle(): GoogleSignIn | null {
  try {
    // The package reads its native constants while it is being imported, so a
    // binary without the module fails HERE (caught below), not on a tap.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
    return require('@react-native-google-signin/google-signin') as GoogleSignIn;
  } catch {
    return null;
  }
}

let cached: Promise<NativeSignInModules> | null = null;

/** Loads both modules once per app run. Never rejects. */
export function loadNativeSignInModules(): Promise<NativeSignInModules> {
  cached ??= Promise.all([loadApple(), Promise.resolve(loadGoogle())]).then(([apple, google]) => ({
    apple,
    google,
  }));
  return cached;
}

/** Tests only: forget the memoised load. */
export function resetNativeSignInModules(): void {
  cached = null;
}
