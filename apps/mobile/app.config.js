// Expo config as plain JS: eas-cli's TS loader failed to parse the .ts
// version ("Unexpected token '{'", eas-cli 23.1.0) while expo itself read it
// fine — plain JS removes the loader variance. Typed via the JSDoc below.

const { withEntitlementsPlist } = require('expo/config-plugins');

const EAS_PROJECT_ID = 'f4d9a056-7f4d-4ee4-b185-2f0bcea37225';

// expo-notifications adds the Push Notifications capability (aps-environment).
// Chefer only schedules LOCAL notifications (gym reminders, rest timer), and a
// free personal Apple team cannot sign apps with push — strip it. Re-add when
// a paid team + real push arrive.
const withoutPushEntitlement = (cfg) => {
  // expo-notifications may set it on the config at plugin-evaluation time…
  if (cfg.ios?.entitlements) delete cfg.ios.entitlements['aps-environment'];
  // …and/or through the entitlements mod.
  return withEntitlementsPlist(cfg, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};

// Two app variants (M4-4) so a laptop-independent production build and a
// Metro-backed dev client can live side by side on the same phone:
//   production  — "Chefer",     iOS com.popdan.chefer / Android dev.chefer.app,
//                 EAS Update channel "production"
//   development — "Chefer Dev", dev.chefer.app.dev, dev client (default)
// ios/ and android/ are generated per variant — scripts/ensure-variant.sh
// re-runs prebuild when the variant changes.
const APP_VARIANT = process.env.APP_VARIANT ?? 'development';
if (APP_VARIANT !== 'development' && APP_VARIANT !== 'production') {
  throw new Error(`APP_VARIANT must be "development" or "production", got "${APP_VARIANT}"`);
}
const IS_PRODUCTION = APP_VARIANT === 'production';

// A production binary or OTA update bundled without the prod API URL would
// fall back to localhost and brick every installed app — refuse to build it.
if (IS_PRODUCTION && !process.env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
  throw new Error(
    'APP_VARIANT=production requires EXPO_PUBLIC_API_URL=https://… (use the scripts in apps/mobile/scripts/)',
  );
}

// ─── Sign in with Google / Apple (WP-22) — NATIVE, needs a new binary ─────────
// All env-driven and all optional: a build without the variables below still
// succeeds (the app then simply hides the corresponding button at runtime).
//
//  * Apple: the Sign in with Apple entitlement (expo-apple-authentication
//    plugin) and the Associated Domains capability are production-only. The
//    dev variant's bundle id (dev.chefer.app.dev) is not in the site
//    association file served at /.well-known/apple-app-site-association, and a
//    free personal team cannot sign either capability. ENABLE_APPLE_SIGN_IN=1
//    switches them on for a dev build signed by the paid team.
//  * Google (iOS): the reversed iOS OAuth client id must be registered as a
//    URL scheme, or the sign-in sheet cannot hand control back to the app.
//    Give it as GOOGLE_IOS_URL_SCHEME (com.googleusercontent.apps.<id>) or let
//    it be derived from GOOGLE_IOS_CLIENT_ID (<id>.apps.googleusercontent.com).
//    Android needs no build-time value (SHA-1/256 are registered in Google
//    Cloud, the client ids come from auth.socialAvailability at runtime).
//
// These values are part of the native fingerprint (runtimeVersion). Production
// defaults to PRODUCTION_GOOGLE_IOS_URL_SCHEME below; only override it with the
// SAME value everywhere a binary is built or an OTA update is published.
const GOOGLE_URL_SCHEME_PREFIX = 'com.googleusercontent.apps.';
const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

/** The reversed iOS client id, or null when neither env var yields a valid one. */
function resolveGoogleIosUrlScheme(env) {
  const explicit = env.GOOGLE_IOS_URL_SCHEME?.trim();
  if (explicit) return explicit.startsWith(GOOGLE_URL_SCHEME_PREFIX) ? explicit : null;
  const clientId = env.GOOGLE_IOS_CLIENT_ID?.trim();
  if (clientId?.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    return `${GOOGLE_URL_SCHEME_PREFIX}${clientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)}`;
  }
  return null;
}

// The production iOS OAuth client (Google Cloud project "Chefer", created
// 2026-10-06). Not a secret — it ships inside every binary — so it is the
// production default here, which keeps local builds, EAS builds and the CI OTA
// publish on the same native fingerprint without extra env.
const PRODUCTION_GOOGLE_IOS_URL_SCHEME =
  'com.googleusercontent.apps.796396192005-trvmr1qkll4sgujsjj47u5a3tgrg7uuc';

const GOOGLE_IOS_URL_SCHEME_FROM_ENV = resolveGoogleIosUrlScheme(process.env);
const GOOGLE_IOS_URL_SCHEME =
  GOOGLE_IOS_URL_SCHEME_FROM_ENV ?? (IS_PRODUCTION ? PRODUCTION_GOOGLE_IOS_URL_SCHEME : null);
if (
  (process.env.GOOGLE_IOS_URL_SCHEME || process.env.GOOGLE_IOS_CLIENT_ID) &&
  !GOOGLE_IOS_URL_SCHEME_FROM_ENV
) {
  console.warn(
    `[app.config] ignoring GOOGLE_IOS_URL_SCHEME / GOOGLE_IOS_CLIENT_ID: expected "${GOOGLE_URL_SCHEME_PREFIX}<id>" or "<id>${GOOGLE_CLIENT_ID_SUFFIX}" — ${IS_PRODUCTION ? 'using the production default' : 'Google sign-in will be unavailable on iOS'}`,
  );
}
const APPLE_SIGN_IN = IS_PRODUCTION || process.env.ENABLE_APPLE_SIGN_IN === '1';

/** Host of the production API/web origin — the site that serves the association files. */
function webcredentialsDomain() {
  try {
    return new URL(process.env.EXPO_PUBLIC_API_URL ?? '').hostname || null;
  } catch {
    return null;
  }
}
const ASSOCIATED_DOMAIN = APPLE_SIGN_IN ? webcredentialsDomain() : null;

/**
 * Production iOS bundle id is com.popdan.chefer (2026-09-28): `dev.chefer.app`
 * stayed registered to the free personal team that signed the early builds,
 * and bundle ids are unique across all Apple teams, so the paid team's App
 * Store build needs its own. Android keeps dev.chefer.app; the dev variant
 * keeps dev.chefer.app.dev on both.
 * @type {import('expo/config').ExpoConfig}
 */
const config = {
  name: IS_PRODUCTION ? 'Chefer' : 'Chefer Dev',
  slug: 'chefer',
  owner: 'cheferoni',
  scheme: IS_PRODUCTION ? 'chefer' : 'chefer-dev',
  // App Store / Play marketing version. Part of the runtime fingerprint, so
  // bumping it gives a new runtime: OTA updates reach only binaries built
  // from this version on (a store binary is a new build anyway).
  version: '1.0.1',
  // Explicit, not auto-detected: "web" is added only when react-native-web
  // resolves, which differs between pnpm's `expo` shim (NODE_PATH) and the
  // bare node calls in Gradle/Xcode — that flipped the runtime fingerprint
  // between build and `eas update`, silently blocking OTA delivery.
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  // Plate-and-cutlery on brand brown; the dev variant carries a DEV band so the
  // two installs are distinguishable. Sources: assets/icon-source/*.svg.
  icon: IS_PRODUCTION ? './assets/icon.png' : './assets/icon-dev.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: IS_PRODUCTION ? 'com.popdan.chefer' : 'dev.chefer.app.dev',
    supportsTablet: false,
    // Apple team for signing local device builds (set in .env — the repo is
    // public). Unset is fine: simulator builds don't sign, and EAS cloud
    // builds bring their own credentials.
    ...(process.env.EXPO_APPLE_TEAM_ID ? { appleTeamId: process.env.EXPO_APPLE_TEAM_ID } : {}),
    // webcredentials: lets iOS offer saved passwords / strong-password
    // suggestions for the API's domain (AASA served by the API, WP-22).
    ...(ASSOCIATED_DOMAIN ? { associatedDomains: [`webcredentials:${ASSOCIATED_DOMAIN}`] } : {}),
    config: {
      // Only HTTPS and the OS's standard crypto — exempt from export
      // compliance, so App Store Connect stops asking on every build.
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: IS_PRODUCTION ? 'dev.chefer.app' : 'dev.chefer.app.dev',
    adaptiveIcon: {
      backgroundColor: '#944a00',
      foregroundImage: IS_PRODUCTION
        ? './assets/android-icon-foreground.png'
        : './assets/android-icon-foreground-dev.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    // FIRST on purpose: mods run in reverse registration order, so this one
    // runs LAST — after expo-notifications has added the entitlement.
    withoutPushEntitlement,
    'expo-router',
    'expo-secure-store',
    'expo-dev-client',
    // WP-22: native Apple sheet (entitlement com.apple.developer.applesignin,
    // production only — see the block above) and native Google sign-in. Both
    // modules are autolinked either way; the JS hides a button whose module or
    // capability is missing.
    ...(APPLE_SIGN_IN ? ['expo-apple-authentication'] : []),
    ...(GOOGLE_IOS_URL_SCHEME
      ? [['@react-native-google-signin/google-signin', { iosUrlScheme: GOOGLE_IOS_URL_SCHEME }]]
      : []),
    [
      'expo-image-picker',
      {
        photosPermission: 'Chefer uses your photos to scan meals and illustrate your recipes.',
        cameraPermission: 'Chefer uses the camera to scan meals you are about to eat.',
      },
    ],
    // Gym (gym_plan.md §5.6): offline store, cached exercise photos, local
    // reminders + rest-timer notifications. One native batch, one rebuild.
    'expo-sqlite',
    'expo-image',
    ['expo-notifications', { color: '#944a00' }],
    // …and LAST too: config-level edits happen in registration order.
    withoutPushEntitlement,
  ],
  // OTA updates via EAS Update. The fingerprint policy hashes the native
  // layer, so an update only reaches binaries with identical native code —
  // adding a native module yields a new runtime and requires a rebuild.
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    // Local builds don't get the channel from eas.json — embed it here.
    requestHeaders: { 'expo-channel-name': IS_PRODUCTION ? 'production' : 'development' },
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: APP_VARIANT,
    // WP-22: what THIS binary was built with, read by the sign-in UI so it
    // never offers a button its native config cannot serve.
    socialSignIn: { apple: APPLE_SIGN_IN, googleIos: Boolean(GOOGLE_IOS_URL_SCHEME) },
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
};

module.exports = config;
