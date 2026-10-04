import * as Crypto from 'expo-crypto';
import type { SocialSignInInput } from '@chefer/types';
import type { AppleAuthentication, GoogleSignIn } from './native-modules';

// ─── Provider sign-in → API credential (WP-22) ───────────────────────────────
// What the app sends to `auth.socialSignIn` / `auth.linkIdentity` / the
// `reauth` of `user.deleteSelf`. Nonce: the provider gets sha256(raw) as
// lowercase hex, the API gets raw (it accepts either as the token's claim).

/** What one provider sign-in yields for the API (a subset of `SocialSignInInput`). */
export type SocialSignInPayload = Pick<
  SocialSignInInput,
  'provider' | 'idToken' | 'nonce' | 'authorizationCode' | 'givenName' | 'familyName'
>;

/** The user closed the native sheet — silence, never an error line. */
export class SocialCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'SocialCancelledError';
  }
}

/** The native SDK failed or returned something unusable. */
export class SocialSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialSdkError';
  }
}

const APPLE_CANCEL_CODE = 'ERR_REQUEST_CANCELED';

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  return typeof code === 'string' ? code : null;
}

/** A fresh random nonce: `raw` goes to the API, `hashed` (SHA-256, lowercase hex) to the provider. */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return { raw, hashed: hashed.toLowerCase() };
}

function trimmed(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text === '' ? undefined : text;
}

/** The native Apple sheet. Name only when Apple sends it (first authorization). */
export async function requestAppleCredential(
  apple: AppleAuthentication,
): Promise<SocialSignInPayload> {
  const nonce = await createNonce();
  let credential: Awaited<ReturnType<AppleAuthentication['signInAsync']>>;
  try {
    credential = await apple.signInAsync({
      requestedScopes: [
        apple.AppleAuthenticationScope.FULL_NAME,
        apple.AppleAuthenticationScope.EMAIL,
      ],
      nonce: nonce.hashed,
    });
  } catch (error) {
    if (errorCode(error) === APPLE_CANCEL_CODE) throw new SocialCancelledError();
    throw new SocialSdkError('Sign in with Apple failed');
  }
  if (!credential.identityToken) throw new SocialSdkError('Apple returned no identity token');
  const givenName = trimmed(credential.fullName?.givenName);
  const familyName = trimmed(credential.fullName?.familyName);
  return {
    provider: 'APPLE',
    idToken: credential.identityToken,
    nonce: nonce.raw,
    ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
  };
}

/** Client ids from `auth.socialAvailability` that this device can use. */
export type GoogleClientConfig = { webClientId?: string; iosClientId?: string };

/**
 * The native Google sheet. @react-native-google-signin's original API has no
 * nonce parameter, so none is sent (the API only checks a nonce when the token
 * carries one). Signs the Google session out again afterwards, so the next
 * attempt shows the account chooser instead of silently reusing this account —
 * Chefer keeps its own session.
 */
export async function requestGoogleCredential(
  google: GoogleSignIn,
  config: GoogleClientConfig,
  platform: 'ios' | 'android',
): Promise<SocialSignInPayload> {
  const { GoogleSignin, statusCodes } = google;
  try {
    GoogleSignin.configure({
      scopes: ['email', 'profile'],
      ...(config.webClientId ? { webClientId: config.webClientId } : {}),
      ...(config.iosClientId ? { iosClientId: config.iosClientId } : {}),
    });
    if (platform === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') throw new SocialCancelledError();
    const idToken = response.data.idToken;
    if (!idToken) throw new SocialSdkError('Google returned no ID token');
    GoogleSignin.signOut().catch(() => undefined);
    return { provider: 'GOOGLE', idToken };
  } catch (error) {
    if (error instanceof SocialCancelledError || error instanceof SocialSdkError) throw error;
    const code = errorCode(error);
    // A second tap while the first sheet is still up: nothing to report.
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
      throw new SocialCancelledError();
    }
    throw new SocialSdkError('Google sign-in failed');
  }
}
