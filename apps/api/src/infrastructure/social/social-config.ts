import type { SocialAvailability, SocialProvider } from '@chefer/types';
import type { env } from '../../lib/env.js';

// ─── Sign in with Google / Apple: configuration (WP-22) ──────────────────────
// Derived from env so a provider with no credentials is simply disabled —
// never a crash. `socialConfigFromEnv` is a pure function of its argument so
// tests can build any configuration.

export type AppleCredentials = {
  teamId: string;
  keyId: string;
  /** PEM (PKCS#8) of the Sign in with Apple key (.p8). */
  privateKey: string;
};

export type SocialConfig = {
  google: {
    audiences: string[];
    webClientId: string | null;
    iosClientId: string | null;
    androidClientId: string | null;
  };
  apple: {
    /** Accepted `aud` values: the iOS bundle id and/or the web Services ID. */
    audiences: string[];
    servicesId: string | null;
    bundleId: string | null;
    redirectUri: string | null;
    credentials: AppleCredentials | null;
  };
  /** Secret the stored Apple refresh tokens are encrypted with. */
  tokenSecret: string;
};

type EnvLike = Pick<
  typeof env,
  | 'GOOGLE_CLIENT_ID_WEB'
  | 'GOOGLE_CLIENT_ID_IOS'
  | 'GOOGLE_CLIENT_ID_ANDROID'
  | 'APPLE_SERVICES_ID'
  | 'APPLE_BUNDLE_ID'
  | 'APPLE_TEAM_ID'
  | 'APPLE_KEY_ID'
  | 'APPLE_PRIVATE_KEY'
  | 'APPLE_WEB_REDIRECT_URI'
  | 'SOCIAL_TOKEN_SECRET'
  | 'JWT_SECRET'
  | 'APP_URL'
>;

function compact(values: (string | undefined)[]): string[] {
  return values.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function socialConfigFromEnv(e: EnvLike): SocialConfig {
  const { APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: privateKey } = e;
  const audiences = compact([e.APPLE_BUNDLE_ID, e.APPLE_SERVICES_ID]);
  return {
    google: {
      audiences: compact([
        e.GOOGLE_CLIENT_ID_WEB,
        e.GOOGLE_CLIENT_ID_IOS,
        e.GOOGLE_CLIENT_ID_ANDROID,
      ]),
      webClientId: e.GOOGLE_CLIENT_ID_WEB ?? null,
      iosClientId: e.GOOGLE_CLIENT_ID_IOS ?? null,
      androidClientId: e.GOOGLE_CLIENT_ID_ANDROID ?? null,
    },
    apple: {
      audiences,
      servicesId: e.APPLE_SERVICES_ID ?? null,
      bundleId: e.APPLE_BUNDLE_ID ?? null,
      redirectUri: e.APPLE_SERVICES_ID
        ? (e.APPLE_WEB_REDIRECT_URI ?? `${e.APP_URL.replace(/\/$/, '')}/login`)
        : null,
      credentials: teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null,
    },
    tokenSecret: e.SOCIAL_TOKEN_SECRET ?? e.JWT_SECRET,
  };
}

export function isProviderEnabled(config: SocialConfig, provider: SocialProvider): boolean {
  return provider === 'GOOGLE'
    ? config.google.audiences.length > 0
    : // Apple also needs the key: without it the grant could never be revoked on deletion.
      config.apple.audiences.length > 0 && config.apple.credentials !== null;
}

export function availabilityFromConfig(config: SocialConfig): SocialAvailability {
  const appleOn = isProviderEnabled(config, 'APPLE');
  return {
    google: {
      enabled: isProviderEnabled(config, 'GOOGLE'),
      webClientId: config.google.webClientId,
      iosClientId: config.google.iosClientId,
      androidClientId: config.google.androidClientId,
    },
    apple: {
      enabled: appleOn,
      servicesId: appleOn ? config.apple.servicesId : null,
      bundleId: appleOn ? config.apple.bundleId : null,
      redirectUri: appleOn ? config.apple.redirectUri : null,
    },
  };
}
