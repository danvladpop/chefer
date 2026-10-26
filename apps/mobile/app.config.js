// Expo config as plain JS: eas-cli's TS loader failed to parse the .ts
// version ("Unexpected token '{'", eas-cli 23.1.0) while expo itself read it
// fine — plain JS removes the loader variance. Typed via the JSDoc below.

const { withEntitlementsPlist, withMainActivity } = require('expo/config-plugins');

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

// Phones start in portrait (1.0.2). The manifest no longer locks orientation
// (see `orientation` below), so without this a phone held sideways would show
// the app in landscape until the JS lock (src/lib/orientation-lock.ts) runs.
// Same rule and threshold as that file: smallest width < 600dp = phone. The
// system splash (starting window) can still appear sideways for a moment —
// it is drawn before onCreate. Large screens are never touched here.
// NOTE: the runtime fingerprint records an inline plugin by its NAME only, so
// editing this body does not change the runtime — rename the function with
// any change to the native code it writes.
const PHONE_PORTRAIT_MARKER = '// chefer: phones start in portrait';
const withPhonePortraitAtLaunch = (cfg) =>
  withMainActivity(cfg, (c) => {
    if (c.modResults.language !== 'kt') {
      throw new Error('withPhonePortraitAtLaunch expects a Kotlin MainActivity');
    }
    if (c.modResults.contents.includes(PHONE_PORTRAIT_MARKER)) return c;
    const anchor = /override fun onCreate\(savedInstanceState: Bundle\?\) \{\n/;
    if (!anchor.test(c.modResults.contents)) {
      throw new Error('withPhonePortraitAtLaunch: MainActivity.onCreate not found');
    }
    c.modResults.contents = c.modResults.contents.replace(
      anchor,
      (match) =>
        `${match}    ${PHONE_PORTRAIT_MARKER} (orientation-lock.ts takes over from JS)\n` +
        '    if (resources.configuration.smallestScreenWidthDp < 600) {\n' +
        '      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT\n' +
        '    }\n',
    );
    return c;
  });

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

/** iOS bundle id per variant (see the note on `config` below). */
const IOS_BUNDLE_ID = IS_PRODUCTION ? 'com.popdan.chefer' : 'dev.chefer.app.dev';

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
  version: '1.0.2',
  // Explicit, not auto-detected: "web" is added only when react-native-web
  // resolves, which differs between pnpm's `expo` shim (NODE_PATH) and the
  // bare node calls in Gradle/Xcode — that flipped the runtime fingerprint
  // between build and `eas update`, silently blocking OTA delivery.
  platforms: ['ios', 'android'],
  // No orientation lock in the Android manifest (1.0.2): Play flags
  // portrait-only apps because Android 16 ignores orientation restrictions on
  // large screens (sw ≥ 600dp), and tablets already rotate there. Phones are
  // kept portrait at runtime by src/lib/orientation-lock.ts. iOS keeps its
  // portrait Info.plist through ios.infoPlist below (iPhone-only app).
  orientation: 'default',
  // Plate-and-cutlery on brand brown; the dev variant carries a DEV band so the
  // two installs are distinguishable. Sources: assets/icon-source/*.svg.
  icon: IS_PRODUCTION ? './assets/icon.png' : './assets/icon-dev.png',
  // UX-X-07: the app is light-only, so system UI (keyboard, alerts, share
  // sheet, pickers) must not turn dark over light screens. expo-system-ui
  // applies it on Android. Revisit with dark mode.
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      // iPhone stays portrait NATIVELY — the same Info.plist as with
      // `orientation: 'portrait'`, so no landscape launch screen on a phone
      // held sideways. Set here (it takes precedence over the abstract
      // `orientation`) because `orientation` must be 'default' for Android.
      // Should supportsTablet ever turn on, Expo adds all four
      // UISupportedInterfaceOrientations~ipad entries (iPad multitasking,
      // ITMS-90474) and orientation-lock.ts unlocks the large screen.
      UISupportedInterfaceOrientations: [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
      ],
      // C1: the gym rest countdown runs as a Live Activity (lock screen +
      // Dynamic Island), drawn by the widget extension in targets/widgets.
      NSSupportsLiveActivities: true,
    },
    // Apple team for signing local device builds (set in .env — the repo is
    // public). Unset is fine: simulator builds don't sign, and EAS cloud
    // builds bring their own credentials.
    ...(process.env.EXPO_APPLE_TEAM_ID ? { appleTeamId: process.env.EXPO_APPLE_TEAM_ID } : {}),
    // webcredentials: lets iOS offer saved passwords / strong-password
    // suggestions for the API's domain (AASA served by the API, WP-22).
    ...(ASSOCIATED_DOMAIN ? { associatedDomains: [`webcredentials:${ASSOCIATED_DOMAIN}`] } : {}),
    // C4: the Today home-screen widget reads the app's snapshot from this App
    // Group (@bacons/apple-targets mirrors it onto the widget extension).
    entitlements: {
      'com.apple.security.application-groups': [`group.${IOS_BUNDLE_ID}`],
    },
    config: {
      // Only HTTPS and the OS's standard crypto — exempt from export
      // compliance, so App Store Connect stops asking on every build.
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: IS_PRODUCTION ? 'dev.chefer.app' : 'dev.chefer.app.dev',
    // Play build number. Must go up with every store upload (Play rejects a reused
    // code; 1.0.1 shipped as 1 because this was unset). Part of the runtime
    // fingerprint, so bump it only together with a store build.
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: '#944a00',
      foregroundImage: IS_PRODUCTION
        ? './assets/android-icon-foreground.png'
        : './assets/android-icon-foreground-dev.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // C2: Health Connect, one permission per data type the user can opt into.
    permissions: [
      'android.permission.health.READ_WEIGHT',
      'android.permission.health.READ_STEPS',
      'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
      'android.permission.health.WRITE_EXERCISE',
      'android.permission.health.WRITE_NUTRITION',
    ],
  },
  plugins: [
    // FIRST on purpose: mods run in reverse registration order, so this one
    // runs LAST — after expo-notifications has added the entitlement.
    withoutPushEntitlement,
    'expo-router',
    // Face ID is never used (no requireAuthentication) — without `false` the plugin
    // writes a generic NSFaceIDUsageDescription (App Review 5.1.1, review R-07).
    ['expo-secure-store', { faceIDPermission: false }],
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
        // Images only — no video, so no microphone. `false` drops the plugin's generic
        // NSMicrophoneUsageDescription and Android's RECORD_AUDIO (review R-07).
        microphonePermission: false,
      },
    ],
    // Gym (gym_plan.md §5.6): offline store, cached exercise photos, local
    // reminders + rest-timer notifications. One native batch, one rebuild.
    'expo-sqlite',
    'expo-image',
    ['expo-notifications', { color: '#944a00' }],
    withPhonePortraitAtLaunch,
    // C2 Health sync (Apple Health / Health Connect). Arguments are LITERALS:
    // they are part of the runtime fingerprint. iOS: the HealthKit entitlement
    // and the two usage strings; no background delivery (sync runs while the
    // app is open). Android: Health Connect needs API 26 and one permission
    // per data type; its "privacy policy" intents are handled by the local
    // chefer-health module (not the library's plugin, which only routes them
    // to MainActivity without showing the policy).
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription:
          'Chefer reads your weight, steps and active energy from Apple Health when you turn it on, so your weight trend and your day stay up to date.',
        NSHealthUpdateUsageDescription:
          'Chefer saves your workouts and the food you log to Apple Health when you turn it on.',
        background: false,
      },
    ],
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    // C1: iOS app extensions live in targets/ (the WidgetKit extension with the
    // rest Live Activity). The plugin also registers the extension's bundle id
    // (<app id>.widgets) for EAS credentials.
    '@bacons/apple-targets',
    // M1-6 crash reporting. Writes sentry.properties and the source-map /
    // debug-symbol upload steps into the native projects. The arguments are
    // part of the runtime fingerprint, so they are LITERALS — never read them
    // from env, or a build with Sentry env and an OTA publish without it would
    // land on different runtimes. The auth token comes only from the
    // SENTRY_AUTH_TOKEN env at upload time; without it scripts/common.sh and
    // eas.json set SENTRY_DISABLE_AUTO_UPLOAD=true so builds don't fail. The
    // DSN is runtime JS config (EXPO_PUBLIC_SENTRY_DSN, src/lib/crash-reporting.ts).
    // Org slug as in apps/web/next.config.ts; EU region, like web and API.
    [
      '@sentry/react-native/expo',
      { url: 'https://de.sentry.io/', organization: 'chefer', project: 'chefer-mobile' },
    ],
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
