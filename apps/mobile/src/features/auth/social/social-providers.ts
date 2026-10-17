import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { SocialAvailability } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import {
  loadNativeSignInModules,
  type AppleAuthentication,
  type GoogleSignIn,
  type NativeSignInModules,
} from './native-modules';
import type { GoogleClientConfig } from './social-credentials';

// ─── Which sign-in buttons may this device show? (WP-22) ─────────────────────
// A button is offered only when ALL of these hold:
//   1. the API has the provider configured (`auth.socialAvailability`; a failed
//      query hides the buttons),
//   2. this binary contains the native module (an old binary does not),
//   3. this binary was built with what the provider needs (app.config.js
//      `extra.socialSignIn`: the Apple entitlement, the Google iOS URL scheme),
//   4. the platform allows it — Apple on iOS only.

export type MobilePlatform = 'ios' | 'android';

export type BuildCapabilities = { apple: boolean; googleIos: boolean };

export type SocialProviders = {
  apple: AppleAuthentication | null;
  google: { module: GoogleSignIn; config: GoogleClientConfig } | null;
};

export const NO_SOCIAL_PROVIDERS: SocialProviders = { apple: null, google: null };

/** What this binary was built with (`extra.socialSignIn` in app.config.js); nothing when absent. */
export function readBuildCapabilities(): BuildCapabilities {
  const extra: unknown = Constants.expoConfig?.extra;
  const raw =
    typeof extra === 'object' && extra !== null && 'socialSignIn' in extra
      ? (extra.socialSignIn as { apple?: unknown; googleIos?: unknown } | null)
      : null;
  return { apple: raw?.apple === true, googleIos: raw?.googleIos === true };
}

/** Pure decision, unit-tested: availability × native modules × build × platform. */
export function resolveSocialProviders(input: {
  availability: SocialAvailability | undefined;
  native: NativeSignInModules | null;
  build: BuildCapabilities;
  platform: MobilePlatform;
}): SocialProviders {
  const { availability, native, build, platform } = input;
  if (!availability || !native) return NO_SOCIAL_PROVIDERS;

  const apple =
    platform === 'ios' && availability.apple.enabled && build.apple ? native.apple : null;

  let google: SocialProviders['google'] = null;
  const g = availability.google;
  if (native.google && g.enabled) {
    // iOS needs its own client id (+ the URL scheme in the binary); a web
    // client id, when present, is sent too so the ID token's audience is the
    // server client (the API accepts any configured id). Android needs the
    // WEB client id — it is what makes Google return an ID token at all (the
    // Android client id only binds the app's SHA-1 in Google Cloud).
    if (platform === 'ios' && g.iosClientId && build.googleIos) {
      google = {
        module: native.google,
        config: {
          iosClientId: g.iosClientId,
          ...(g.webClientId ? { webClientId: g.webClientId } : {}),
        },
      };
    } else if (platform === 'android' && g.webClientId) {
      google = { module: native.google, config: { webClientId: g.webClientId } };
    }
  }
  return { apple, google };
}

/** The providers this device can offer right now (nothing while loading or on failure). */
export function useSocialProviders(): SocialProviders {
  const availability = trpc.auth.socialAvailability.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [native, setNative] = useState<NativeSignInModules | null>(null);
  useEffect(() => {
    let live = true;
    void loadNativeSignInModules().then((modules) => {
      if (live) setNative(modules);
    });
    return () => {
      live = false;
    };
  }, []);

  const platform: MobilePlatform = Platform.OS === 'android' ? 'android' : 'ios';
  return useMemo(
    () =>
      resolveSocialProviders({
        availability: availability.data,
        native,
        build: readBuildCapabilities(),
        platform,
      }),
    [availability.data, native, platform],
  );
}

export function currentPlatform(): MobilePlatform {
  return Platform.OS === 'android' ? 'android' : 'ios';
}
